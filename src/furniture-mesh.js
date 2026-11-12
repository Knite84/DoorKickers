import * as THREE from 'three';
import { furnitureBoxes } from './furniture.js';

// Unit shapes scaled per box; cylinders lying along x or z are pre-rotated.
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cylinders = {
  y: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  z: new THREE.CylinderGeometry(0.5, 0.5, 1, 20).rotateX(Math.PI / 2),
  x: new THREE.CylinderGeometry(0.5, 0.5, 1, 20).rotateZ(Math.PI / 2),
};

// Meshes for one kit piece. `material(color)` returns a shared opaque
// material; `glass` is the shared see-through one.
export function furnitureMeshes(prop, material, glass) {
  return furnitureBoxes(prop).map(part => {
    const geometry = part.shape === 'cylinder' ? cylinders[part.axis ?? 'y'] : unitBox;
    const mesh = new THREE.Mesh(geometry, part.glass ? glass : material(part.color));
    mesh.position.set(...part.center);
    mesh.scale.set(...part.size);
    mesh.castShadow = !part.glass && part.size[1] > 0.02;
    mesh.receiveShadow = true;
    mesh.userData.overhead = !!part.overhead;
    mesh.userData.fixture = part.fixture;
    return mesh;
  });
}
