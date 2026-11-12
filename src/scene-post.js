import { Vector2 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

class ContactShadowPass extends GTAOPass {
  render(renderer, ...args) {
    const autoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try {
      super.render(renderer, ...args);
    } finally {
      renderer.shadowMap.autoUpdate = autoUpdate;
    }
  }
}

export function createScenePost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  const render = new RenderPass(scene, camera);
  const occlusion = new ContactShadowPass(scene, camera);
  occlusion.updateGtaoMaterial({ radius: 0.45, samples: 8 });
  occlusion.blendIntensity = 0.55;
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.23, 0.4, 1.1);
  const output = new OutputPass();
  const antialias = new SMAAPass();
  const passes = [render, occlusion, bloom, output, antialias];
  for (const pass of passes) composer.addPass(pass);

  function resize(width, height) {
    composer.setSize(width, height);
    occlusion.setSize(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2)));
  }
  resize(renderer.domElement.width, renderer.domElement.height);
  return {
    resize,
    draw(dt, preset) {
      occlusion.enabled = Boolean(preset.occlusion);
      bloom.enabled = Boolean(preset.bloom);
      antialias.enabled = Boolean(preset.smaa);
      const autoReset = renderer.info.autoReset;
      renderer.info.reset();
      renderer.info.autoReset = false;
      try {
        composer.render(dt);
      } finally {
        renderer.info.autoReset = autoReset;
      }
    },
    dispose() {
      for (const pass of passes) pass.dispose();
      // GTAOPass does not dispose these two materials in this Three release.
      occlusion.gtaoMaterial.dispose();
      occlusion.blendMaterial.dispose();
      composer.dispose();
    },
  };
}
