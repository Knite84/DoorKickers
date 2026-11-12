import * as THREE from 'three';
import { roofFor } from './roof.js';

// Three.js glue for src/roof.js: one shingle mesh with a painted texture and
// one white trim mesh (fascia and soffit), two draw calls in all.

// Three-tab asphalt shingles painted on a canvas: 1 m wide, 8 courses of 0.14 m.
function shingleTexture() {
  const size = 256, rows = 8, tabs = 3, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), row = size / rows, tab = size / tabs;
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * tab / 2;
    for (let t = -1; t <= tabs; t++) {
      const shade = 150 + Math.floor(random() * 40);
      ctx.fillStyle = `rgb(${shade},${shade},${shade - 4})`;
      ctx.fillRect(offset + t * tab, r * row, tab, row);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; // slot between tabs
      ctx.fillRect(offset + t * tab, r * row + row * 0.25, 2, row * 0.75);
    }
    // Course shadow along the butt edge of the course above.
    const gradient = ctx.createLinearGradient(0, r * row, 0, r * row + 6);
    gradient.addColorStop(0, 'rgba(0,0,0,0.6)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, r * row, size, 6);
  }
  // Granule speckle.
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = (random() - 0.5) * 36;
    for (let c = 0; c < 3; c++) image.data[i + c] = Math.max(0, Math.min(255, image.data[i + c] + grain));
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1 / (rows * 0.14));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function geometryFor(triangles) {
  const positions = new Float32Array(triangles.length * 9), uvs = new Float32Array(triangles.length * 6);
  triangles.forEach((triangle, i) => {
    triangle.points.forEach((point, j) => positions.set(point, i * 9 + j * 3));
    triangle.uv.forEach((uv, j) => uvs.set(uv, i * 6 + j * 2));
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Returns a group to add to the scene, or null when the map has no roof.
export function createRoofMesh(map, decorate) {
  const triangles = roofFor(map);
  if (!triangles.length) return null;
  const group = new THREE.Group();
  const outdoor = { outdoor: true };
  const shingles = new THREE.Mesh(geometryFor(triangles.filter(t => t.kind === 'shingle')),
    decorate(new THREE.MeshStandardMaterial({ color: 0x6d6e6c, map: shingleTexture(), roughness: 0.92, side: THREE.DoubleSide }), 0, outdoor));
  const trim = new THREE.Mesh(geometryFor(triangles.filter(t => t.kind !== 'shingle')),
    // The soffit is level with the Main ceiling's underside; the depth offset lets
    // the ceiling win wherever the two overlap, instead of flickering.
    decorate(new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }), 0, outdoor));
  for (const mesh of [shingles, trim]) { mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); }
  return group;
}
