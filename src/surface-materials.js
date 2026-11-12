import * as THREE from 'three';
import { surfaceKinds, surfaceTile, surfaceIndex, surfaceAt, skinPaint, exteriorFaces } from './surface-plan.js';
import { surfaceTextureArray } from './surface-textures.js';

// Applies room finishes to the batched wall and floor pieces. Textures are
// mapped in world space, so the thousands of small breakable pieces tile
// seamlessly and a destroyed piece simply takes its patch of finish with it.
//   mode 1, floor pieces: top faces show the finish from a per-level field.
//   mode 2, drywall skins: per-piece room paint over a subtle roller texture.
//   mode 3, solid walls: siding on the outside face, room paint inside.
const CELL = 0.1;
const FLOOR_KINDS = new Set(['particleboard', 'concrete', 'deck']);

export function createSurfaceShading(map) {
  const levels = map.levels ?? [{ elevation: 0 }], b = map.bounds;
  const width = Math.ceil((b.maxX - b.minX) / CELL), depth = Math.ceil((b.maxZ - b.minZ) / CELL);
  const data = new Uint8Array(width * depth * levels.length);
  levels.forEach((level, l) => {
    const index = Math.round((level.elevation ?? 0) / 3.2);
    for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
      const surface = surfaceAt(map, b.minX + (x + 0.5) * CELL, b.minZ + (z + 0.5) * CELL, index);
      data[(l * depth + z) * width + x] = surface ? surfaceIndex(surface.kind) : 0;
    }
  });
  const field = new THREE.DataTexture(data, width, depth * levels.length, THREE.RedFormat, THREE.UnsignedByteType);
  field.minFilter = field.magFilter = THREE.NearestFilter; field.needsUpdate = true;
  const uniforms = {
    surfaceAtlas: { value: surfaceTextureArray() }, surfaceField: { value: field },
    surfaceBounds: { value: new THREE.Vector4(b.minX, b.minZ, width * CELL, depth * CELL) },
    surfaceLevels: { value: levels.length }, surfaceTile: { value: surfaceKinds.map(kind => surfaceTile[kind]) },
  };
  const PAINT = surfaceIndex('paint'), SIDING = surfaceIndex('siding');

  function patch(material, mode) {
    material.defines = { ...(material.defines ?? {}), SURFACE_MODE: mode };
    const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey?.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      previous?.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `varying vec3 vSurfWorld; varying vec3 vSurfNormal; varying vec3 vSurfOutward;
        #if SURFACE_MODE == 3
          attribute vec3 surfaceOutward;
        #endif
        ` + shader.vertexShader.replace('#include <project_vertex>', `
        vec4 surfWorld = vec4(transformed, 1.0); vec3 surfNormal = objectNormal;
        #ifdef USE_INSTANCING
          surfWorld = instanceMatrix * surfWorld; surfNormal = mat3(instanceMatrix) * surfNormal;
        #endif
        vSurfWorld = (modelMatrix * surfWorld).xyz; vSurfNormal = normalize(mat3(modelMatrix) * surfNormal);
        #if SURFACE_MODE == 3
          vSurfOutward = surfaceOutward;
        #else
          vSurfOutward = vec3(0.0);
        #endif
        #include <project_vertex>`);
      shader.fragmentShader = `varying vec3 vSurfWorld; varying vec3 vSurfNormal; varying vec3 vSurfOutward;
        uniform highp sampler2DArray surfaceAtlas; uniform sampler2D surfaceField;
        uniform vec4 surfaceBounds; uniform float surfaceLevels; uniform float surfaceTile[${surfaceKinds.length}];
        vec3 surfaceSample(int layer, vec2 metres) { return texture(surfaceAtlas, vec3(metres / surfaceTile[layer], float(layer))).rgb; }
        ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 surfN = normalize(vSurfNormal);
        vec2 surfWallUV = abs(surfN.x) > abs(surfN.z) ? vSurfWorld.zy : vSurfWorld.xy;
        #if SURFACE_MODE == 1
          if (surfN.y > 0.5) {
            vec2 fieldUV = clamp((vSurfWorld.xz - surfaceBounds.xy) / surfaceBounds.zw, vec2(0.0005), vec2(0.9995));
            float level = clamp(floor((vSurfWorld.y + 0.03) / 3.2), 0.0, surfaceLevels - 1.0);
            fieldUV.y = (fieldUV.y + level) / surfaceLevels;
            int finish = int(floor(texture2D(surfaceField, fieldUV).r * 255.0 + 0.5));
            if (finish > 0) diffuseColor.rgb = surfaceSample(finish, vSurfWorld.xz);
          }
        #elif SURFACE_MODE == 2
          if (abs(surfN.y) < 0.5) diffuseColor.rgb *= surfaceSample(${PAINT}, surfWallUV);
        #elif SURFACE_MODE == 3
          if (abs(surfN.y) < 0.5) {
            bool outside = vSurfOutward.z > 0.5 || dot(surfN.xz, vSurfOutward.xy) > 0.5;
            if (outside) diffuseColor.rgb = surfaceSample(${SIDING}, surfWallUV);
            else diffuseColor.rgb *= surfaceSample(${PAINT}, surfWallUV);
          }
        #endif`);
    };
    material.customProgramCacheKey = () => `${previousKey?.() ?? ''}-surface-${mode}`;
    return material;
  }

  // Re-dress one batch of wall pieces. Returns false for kinds it leaves alone.
  function dress(mesh, kind, pieces, baseColor, decorate) {
    const mode = FLOOR_KINDS.has(kind) ? 1 : kind === 'drywall' ? 2 : kind === 'masonry' ? 3 : 0;
    if (!mode) return false;
    mesh.material = patch(decorate(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })), mode);
    const color = new THREE.Color(), outward = mode === 3 ? new Float32Array(pieces.length * 3) : null;
    pieces.forEach((piece, i) => {
      let paint = null;
      if (mode === 2) paint = skinPaint(map, piece);
      if (mode === 3 && !piece.floor) {
        const faces = exteriorFaces(map, piece);
        paint = faces.paint; outward.set([faces.outward[0], faces.outward[1], faces.all ? 1 : 0], i * 3);
      }
      mesh.setColorAt(i, color.setHex(paint ?? baseColor));
    });
    if (outward) {
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.setAttribute('surfaceOutward', new THREE.InstancedBufferAttribute(outward, 3));
    }
    mesh.instanceColor.needsUpdate = true;
    return true;
  }
  return { dress, dispose: () => field.dispose() };
}
