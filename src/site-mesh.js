import * as THREE from 'three';
import { siteFor, fenceFor, fenceKinds } from './site.js';

// Three.js glue for src/site.js (lawn slopes, retaining walls, porch screens)
// and the map's trees. Everything here is drawn only; collision lives in the
// wall pieces (earth under slopes, slabs behind walls, tree trunks).

function geometryFor(triangles) {
  const positions = new Float32Array(triangles.length * 9);
  triangles.forEach((triangle, i) => triangle.points.forEach((point, j) => positions.set(point, i * 9 + j * 3)));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Returns { group, update(overview, level) } or null when the map has no site dressing.
export function createSiteMesh(map, decorate, grass) {
  const triangles = siteFor(map), trees = map.trees ?? [], fences = fenceFor(map), shrubs = map.shrubs ?? [];
  if (!triangles.length && !trees.length && !fences.length && !shrubs.length) return null;
  const group = new THREE.Group();
  const paint = (color, roughness, extra = {}) => decorate(new THREE.MeshStandardMaterial({ color, roughness, ...extra }));
  const materials = {
    lawn: grass ? grass(decorate(new THREE.MeshStandardMaterial())) : paint(0x55704a, 1),
    paving: paint(0xaaa99d, 0.95),
    stucco: paint(0xe6e2d8, 0.9),
    brick: paint(0x9b4b36, 0.85),
    screen: paint(0x1c2124, 0.8, { transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  };
  const parts = {};
  for (const [kind, material] of Object.entries(materials)) {
    const list = triangles.filter(t => t.kind === kind);
    if (!list.length) continue;
    const mesh = new THREE.Mesh(geometryFor(list), material);
    mesh.receiveShadow = true; mesh.castShadow = kind !== 'screen' && kind !== 'lawn';
    group.add(mesh); parts[kind] = mesh;
  }
  // Iron fence, posts and curbs: one instanced box mesh per kind.
  const unit = new THREE.BoxGeometry(1, 1, 1), fenceMaterials = { post: paint(0x17191b, 0.45, { metalness: 0.5 }), rail: paint(0x17191b, 0.45, { metalness: 0.5 }), picket: paint(0x1c1e20, 0.5, { metalness: 0.5 }), curb: paint(0xb9b7ac, 0.9) };
  const at0 = new THREE.Object3D();
  for (const kind of fenceKinds) {
    const list = fences.filter(box => box.kind === kind);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(unit, fenceMaterials[kind], list.length);
    list.forEach((box, i) => { at0.position.set(...box.center); at0.scale.set(...box.size); at0.rotation.set(0, 0, 0); at0.updateMatrix(); mesh.setMatrixAt(i, at0.matrix); });
    mesh.castShadow = kind !== 'picket'; mesh.receiveShadow = true; group.add(mesh);
  }
  // Shrubs: two squashed green clumps each, drawn only.
  let bushes = null;
  if (shrubs.length) {
    bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), paint(0x4a6a3a, 0.95), shrubs.length * 2);
    shrubs.forEach((shrub, i) => {
      const [x, z] = shrub.position, r = shrub.radius;
      [[0, 0, 1], [0.55, 0.3, 0.7]].forEach(([dx, dz, size], j) => {
        at0.position.set(x + dx * r, shrub.base + r * size * 0.55, z + dz * r); at0.scale.set(r * size, r * size * 0.75, r * size); at0.rotation.set(0, i * 2.3 + j, 0);
        at0.updateMatrix(); bushes.setMatrixAt(i * 2 + j, at0.matrix);
      });
    });
    bushes.castShadow = bushes.receiveShadow = true; group.add(bushes);
  }
  // Trees: a tapered trunk and three overlapping canopy clumps each.
  let trunks = null, canopy = null;
  if (trees.length) {
    trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.38, 0.5, 1, 9), paint(0x5b4636, 0.95), trees.length);
    canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), paint(0x4d6b36, 0.9), trees.length * 3);
    const at = new THREE.Object3D();
    trees.forEach((tree, i) => {
      const [x, z] = tree.position, height = tree.height - tree.canopy;
      at.position.set(x, tree.base - 0.3 + height / 2, z); at.scale.set(tree.trunk * 2, height + 0.3, tree.trunk * 2); at.rotation.set(0, 0, 0);
      at.updateMatrix(); trunks.setMatrixAt(i, at.matrix);
      [[0, 0, 0, 1], [0.45, -0.25, 0.3, 0.75], [-0.4, -0.15, -0.35, 0.8]].forEach(([dx, dy, dz, size], j) => {
        at.position.set(x + dx * tree.canopy, tree.base + tree.height - tree.canopy + dy * tree.canopy, z + dz * tree.canopy);
        at.scale.set(tree.canopy * size, tree.canopy * size * 0.85, tree.canopy * size); at.rotation.set(0, i * 1.7 + j, 0);
        at.updateMatrix(); canopy.setMatrixAt(i * 3 + j, at.matrix);
      });
    });
    for (const mesh of [trunks, canopy]) { mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); }
  }
  return {
    group,
    // Overhead and tactical views: no canopies, and screens only on Main.
    update(overview, level) {
      if (canopy) canopy.visible = !overview;
      if (bushes) bushes.visible = !overview;
      if (parts.screen) parts.screen.visible = !overview || level === 1;
    },
  };
}
