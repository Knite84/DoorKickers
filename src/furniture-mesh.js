import * as THREE from 'three';
import { furnitureBoxes } from './furniture.js';
import { surfaceSwatchMaps } from './surface-textures.js';

// Unit shapes scaled per box; cylinders lying along x or z are pre-rotated.
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cylinders = {
  y: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  z: new THREE.CylinderGeometry(0.5, 0.5, 1, 20).rotateX(Math.PI / 2),
  x: new THREE.CylinderGeometry(0.5, 0.5, 1, 20).rotateZ(Math.PI / 2),
};

export function createFurnitureMaterials(decorate = material => material) {
  const textures = new Map(), materials = new Map();
  return (color, finish) => {
    const key = `${finish}:${color}`;
    if (materials.has(key)) return materials.get(key);
    if (finish !== 'mirror' && !textures.has(finish)) textures.set(finish, surfaceSwatchMaps(finish));
    const material = decorate(new THREE.MeshStandardMaterial({
      ...textures.get(finish), color,
      roughness: finish === 'mirror' ? .09 : 1,
      metalness: finish === 'mirror' ? .72 : finish === 'brushedMetal' ? .57 : 0,
    }));
    materials.set(key, material);
    return material;
  };
}

// Glass stays separate so the renderer can sort transparent surfaces.
export function furnitureMeshes(prop, material, glass) {
  return furnitureBoxes(prop).map(part => {
    const geometry = part.shape === 'cylinder' ? cylinders[part.axis ?? 'y'] : unitBox;
    const mesh = new THREE.Mesh(geometry, part.glass ? glass : material(part.color, part.finish));
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
