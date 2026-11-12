import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { furnitureBoxes } from './furniture.js';
import { surfaceSwatchMaps } from './surface-textures.js';

// Unit shapes scaled per box; cylinders lying along x or z are pre-rotated.
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cylinders = {
  y: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  z: new THREE.CylinderGeometry(0.5, 0.5, 1, 20).rotateX(Math.PI / 2),
  x: new THREE.CylinderGeometry(0.5, 0.5, 1, 20).rotateZ(Math.PI / 2),
};

// Softened edges. Each part is a unit box scaled to size, so a rounded unit box
// would stretch its corners with the part. Instead the vertex shader rebuilds
// every corner at a true radius in metres: `roundCore` is the corner of the
// unit box the vertex belongs to and the normal is its direction from there.
// The tiny built-in radius only shows in passes that skip the patch (shadows).
const BUILT_IN_RADIUS = 0.02;
function roundedUnitBox(segments) {
  const geometry = new RoundedBoxGeometry(1, 1, 1, segments, BUILT_IN_RADIUS);
  const position = geometry.attributes.position, normal = geometry.attributes.normal;
  const core = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) for (let axis = 0; axis < 3; axis++) {
    const value = position.getComponent(i, axis) - normal.getComponent(i, axis) * BUILT_IN_RADIUS;
    core[i * 3 + axis] = value / (0.5 - BUILT_IN_RADIUS) * 0.5;
  }
  geometry.setAttribute('roundCore', new THREE.BufferAttribute(core, 3));
  return geometry;
}
// Upholstery gets round edges; hard finishes get a narrow bevel.
const softBox = roundedUnitBox(2), bevelBox = roundedUnitBox(1);
const edgeRadius = {
  wovenFabric: 0.045, leatherGrain: 0.04, ceramic: 0.025, moldedPlastic: 0.012,
  woodGrain: 0.008, paintedCabinet: 0.006, counterStone: 0.006, brushedMetal: 0.004,
};
const softFinishes = new Set(['wovenFabric', 'leatherGrain']);
// Parts thinner than this (legs, slats, rods) keep plain boxes.
const MIN_ROUNDED = 0.05;

for (const geometry of [unitBox, softBox, bevelBox, ...Object.values(cylinders)]) {
  const position = geometry.attributes.position, core = geometry.attributes.roundCore;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    // A slight crease under each cushion; contact with the floor comes from
    // the baked contact shading in the lighting patch.
    const rise = THREE.MathUtils.smoothstep(core ? core.getY(i) : position.getY(i), -.5, -.3);
    colors.fill(geometry === softBox ? .86 + .14 * rise : 1, i * 3, i * 3 + 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function roundEdges(material, radius) {
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.edgeRadius = { value: radius };
    shader.vertexShader = `attribute vec3 roundCore; uniform float edgeRadius;
      vec3 edgeScale() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        return vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
      }
      ` + shader.vertexShader
      // Normals are pre-scaled so the renderer's inverse scale leaves them true.
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal *= edgeScale();`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 scale = edgeScale();
          vec3 radius = vec3(min(edgeRadius, 0.3 * min(scale.x, min(scale.y, scale.z)))) / scale;
          transformed = roundCore * (1.0 - 2.0 * radius) + normal * radius;
        }`);
  };
  material.customProgramCacheKey = () => `${previousKey?.() ?? ''}-rounded-edges`;
  return material;
}

export function createFurnitureMaterials(decorate = material => material) {
  const textures = new Map(), materials = new Map();
  return (color, finish, rounded = false) => {
    const key = `${finish}:${color}:${rounded}`;
    if (materials.has(key)) return materials.get(key);
    if (finish !== 'mirror' && !textures.has(finish)) textures.set(finish, surfaceSwatchMaps(finish));
    let material = decorate(new THREE.MeshStandardMaterial({
      ...textures.get(finish), color, vertexColors: true,
      roughness: finish === 'mirror' ? .09 : 1,
      metalness: finish === 'mirror' ? .72 : finish === 'brushedMetal' ? .57 : 0,
    }));
    if (rounded) material = roundEdges(material, edgeRadius[finish]);
    materials.set(key, material);
    return material;
  };
}

// Glass stays separate so the renderer can sort transparent surfaces.
export function furnitureMeshes(prop, material, glass) {
  return furnitureBoxes(prop).map(part => {
    const rounded = part.shape !== 'cylinder' && !part.glass && Object.hasOwn(edgeRadius, part.finish)
      && Math.min(...part.size) >= MIN_ROUNDED;
    const geometry = part.shape === 'cylinder' ? cylinders[part.axis ?? 'y']
      : rounded ? (softFinishes.has(part.finish) ? softBox : bevelBox) : unitBox;
    const mesh = new THREE.Mesh(geometry, part.glass ? glass : material(part.color, part.finish, rounded));
    mesh.position.set(...part.center);
    mesh.scale.set(...part.size);
    mesh.castShadow = !part.glass && part.size[1] > 0.02;
    mesh.receiveShadow = true;
    mesh.userData.overhead = !!part.overhead;
    mesh.userData.fixture = part.fixture;
    return mesh;
  });
}

export function batchFurnitureMeshes(entries) {
  const groups = new Map();
  const visible = [];
  for (const { prop, mesh } of entries) {
    if (mesh.material.transparent || mesh.userData.fixture) {
      visible.push({ prop, mesh });
      continue;
    }
    const key = [prop.elevation ?? 0, mesh.geometry.id, mesh.material.id, mesh.userData.overhead, mesh.castShadow].join(':');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ prop, mesh });
  }
  for (const group of groups.values()) {
    const { prop, mesh } = group[0];
    if (group.length === 1) {
      visible.push(group[0]);
      continue;
    }
    const batch = new THREE.InstancedMesh(mesh.geometry, mesh.material, group.length);
    batch.castShadow = mesh.castShadow;
    batch.receiveShadow = true;
    batch.userData.overhead = mesh.userData.overhead;
    group.forEach(({ mesh: part }, index) => {
      part.updateMatrix();
      batch.setMatrixAt(index, part.matrix);
    });
    batch.instanceMatrix.needsUpdate = true;
    visible.push({ prop, mesh: batch });
  }
  return visible;
}
