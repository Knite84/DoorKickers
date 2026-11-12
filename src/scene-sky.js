import * as THREE from 'three';

const palettes = {
  clear: [0x356da8, 0xc9e4ed, 0xffe0a8, 1],
  fog: [0x7e939d, 0xbdccc8, 0xe5d9ba, 0.18],
  rain: [0x465465, 0x9daab3, 0xc7d0d7, 0.08],
  night: [0x071225, 0x273b58, 0x7095bf, 0],
};

export function createSceneSky(renderer, scene, sunDirection) {
  const uniforms = {
    zenith: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunlight: { value: new THREE.Color() },
    sunStrength: { value: 0 },
    sunDirection: { value: new THREE.Vector3(...sunDirection).normalize() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 skyDirection;
      uniform vec3 zenith, horizon, sunlight, sunDirection;
      uniform float sunStrength;
      void main() {
        vec3 ray = normalize(skyDirection);
        float height = pow(max(ray.y, 0.0), 0.55);
        float towardSun = max(dot(ray, sunDirection), 0.0);
        float glow = 0.45 * pow(towardSun, 16.0);
        float disc = 2.5 * smoothstep(0.9993, 0.9997, towardSun);
        vec3 color = mix(horizon, zenith, height) + sunlight * sunStrength * (glow + disc);
        color *= mix(0.24, 1.0, smoothstep(-0.55, 0.0, ray.y));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new THREE.SphereGeometry(70, 24, 12);
  const dome = new THREE.Mesh(geometry, material);
  dome.visible = false;
  dome.renderOrder = -1;
  scene.add(dome);

  const capture = new THREE.Scene();
  capture.add(new THREE.Mesh(geometry, material));
  let generator;
  let environment;
  let currentPalette;
  return {
    update(camera, enabled, day, weather) {
      dome.visible = enabled;
      if (!enabled) {
        scene.environment = null;
        return;
      }
      dome.position.copy(camera.position);
      const palette = day ? palettes[weather] ?? palettes.clear : palettes.night;
      if (palette !== currentPalette) {
        const [zenith, horizon, sunlight, strength] = palette;
        uniforms.zenith.value.setHex(zenith);
        uniforms.horizon.value.setHex(horizon);
        uniforms.sunlight.value.setHex(sunlight);
        uniforms.sunStrength.value = strength;
        generator ??= new THREE.PMREMGenerator(renderer);
        const next = generator.fromScene(capture, 0, 0.1, 100, { size: 128 });
        environment?.dispose();
        environment = next;
        currentPalette = palette;
      }
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.35;
    },
    dispose() {
      environment?.dispose();
      generator?.dispose();
      scene.remove(dome);
      geometry.dispose();
      material.dispose();
    },
  };
}
