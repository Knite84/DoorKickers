import * as THREE from 'three';
import { surfaceKinds } from './surface-plan.js';

// Floor and wall finishes drawn in code. Photos are colour references only and
// never ship; every texture here is generated from a fixed seed.
const SIZE = 256;

function random(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const hex = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
const shade = ([r, g, b], k) => hex(r * k, g * k, b * k);

function noise(ctx, amount, rand, tint = [1, 1, 1]) {
  const image = ctx.getImageData(0, 0, SIZE, SIZE), d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n * tint[0]; d[i + 1] += n * tint[1]; d[i + 2] += n * tint[2];
  }
  ctx.putImageData(image, 0, 0);
}
// Planks running along x, `rows` per tile, with staggered joints and grain streaks.
function planks(ctx, rand, { rows, base, spread, joint, streak, streaks, gap = 1 }) {
  const h = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    // End joints at one or two random places; each plank between them gets its own shade.
    const first = Math.floor(rand() * SIZE), joints = rand() < 0.5 ? [first] : [first, (first + SIZE / 2) % SIZE];
    joints.sort((a, b) => a - b);
    joints.forEach((start, i) => {
      let end = joints[(i + 1) % joints.length]; if (end <= start) end += SIZE;
      ctx.fillStyle = shade(base, 1 + (rand() - 0.5) * spread);
      ctx.fillRect(start, r * h, end - start, h); ctx.fillRect(start - SIZE, r * h, end - start, h);
      ctx.fillStyle = joint; ctx.fillRect(start, r * h, 1, h);
    });
    for (let s = 0; s < streaks; s++) {
      ctx.fillStyle = streak; ctx.globalAlpha = 0.15 + rand() * 0.45;
      const y = r * h + 1 + rand() * (h - 2), len = 10 + rand() * 70;
      ctx.fillRect(rand() * SIZE, y, len, 0.6 + rand() * 1.4);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = joint; ctx.fillRect(0, r * h, SIZE, gap);
  }
}
function squares(ctx, rand, { count, base, spread, grout, veins = 0, vein }) {
  const s = SIZE / count;
  for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) {
    ctx.fillStyle = shade(base, 1 + (rand() - 0.5) * spread); ctx.fillRect(i * s, j * s, s, s);
    for (let v = 0; v < veins; v++) {
      ctx.strokeStyle = vein; ctx.globalAlpha = 0.25; ctx.lineWidth = 1 + rand() * 2; ctx.beginPath();
      let x = i * s + rand() * s, y = j * s; ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rand() - 0.5) * s * 0.4; y += s / 5; ctx.lineTo(x, y); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  ctx.fillStyle = grout;
  for (let i = 0; i < count; i++) { ctx.fillRect(i * s, 0, 2, SIZE); ctx.fillRect(0, i * s, SIZE, 2); }
}

const painters = {
  none: ctx => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIZE, SIZE); },
  // Striped amber bamboo with dark streaks.
  bamboo: (ctx, rand) => { planks(ctx, rand, { rows: 12, base: [176, 118, 58], spread: 0.18, joint: '#4a2c16', streak: '#3d2210', streaks: 26 }); noise(ctx, 14, rand); },
  // Beige cut-loop carpet.
  carpet: (ctx, rand) => {
    ctx.fillStyle = '#b8a789'; ctx.fillRect(0, 0, SIZE, SIZE); noise(ctx, 34, rand);
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = rand() < 0.5 ? '#a39274' : '#c9b99c'; ctx.fillRect(rand() * SIZE, rand() * SIZE, 2, 2); }
  },
  // Grey wood-look plank tile (primary bath).
  woodTile: (ctx, rand) => { planks(ctx, rand, { rows: 8, base: [128, 124, 119], spread: 0.22, joint: '#5d5955', streak: '#4e4a46', streaks: 30, gap: 2 }); noise(ctx, 12, rand); },
  // Grey square tile (laundry).
  greyTile: (ctx, rand) => { squares(ctx, rand, { count: 2, base: [136, 138, 136], spread: 0.08, grout: '#b9b7af', veins: 2, vein: '#6d6f6d' }); noise(ctx, 16, rand); },
  // Beige stone-look tile (shared and lower baths).
  stoneTile: (ctx, rand) => { squares(ctx, rand, { count: 2, base: [204, 186, 157], spread: 0.1, grout: '#e7decd', veins: 3, vein: '#9c8466' }); noise(ctx, 14, rand); },
  // Pale wood-look plank tile (bar, alcove).
  plankTile: (ctx, rand) => { planks(ctx, rand, { rows: 6, base: [216, 200, 172], spread: 0.1, joint: '#b3a283', streak: '#a99476', streaks: 20, gap: 2 }); noise(ctx, 10, rand); },
  // Warm wood-look vinyl plank (gym).
  vinyl: (ctx, rand) => { planks(ctx, rand, { rows: 7, base: [170, 122, 78], spread: 0.16, joint: '#6e4a2c', streak: '#7c5232', streaks: 22 }); noise(ctx, 12, rand); },
  // Bare concrete with soft blotches.
  concrete: (ctx, rand) => {
    ctx.fillStyle = '#a9a69d'; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = rand() < 0.5 ? '#9c998f' : '#b4b1a8'; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(rand() * SIZE, rand() * SIZE, 8 + rand() * 30, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1; noise(ctx, 22, rand);
  },
  // Brown composite deck boards with dark gaps.
  deckBoards: (ctx, rand) => { planks(ctx, rand, { rows: 9, base: [140, 92, 62], spread: 0.12, joint: '#2e2119', streak: '#6b4630', streaks: 10, gap: 3 }); noise(ctx, 10, rand); },
  // Near-white roller texture, tinted by each room's paint colour.
  paint: (ctx, rand) => { ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, 0, SIZE, SIZE); noise(ctx, 10, rand); },
  // Grey lap siding: horizontal boards with a shadow line under each lap.
  siding: (ctx, rand) => {
    const rows = 6, h = SIZE / rows;
    for (let r = 0; r < rows; r++) {
      const g = ctx.createLinearGradient(0, r * h, 0, (r + 1) * h);
      g.addColorStop(0, '#a6a9aa'); g.addColorStop(0.85, '#9a9d9f'); g.addColorStop(1, '#6c6f71');
      ctx.fillStyle = g; ctx.fillRect(0, r * h, SIZE, h);
    }
    for (let i = 0; i < 90; i++) { ctx.fillStyle = '#8f9294'; ctx.globalAlpha = 0.4; ctx.fillRect(rand() * SIZE, rand() * SIZE, 20 + rand() * 60, 1); }
    ctx.globalAlpha = 1; noise(ctx, 8, rand);
  },
};

// One canvas per finish, for the preview page and for the texture array.
export function surfaceCanvas(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  painters[kind](ctx, random(surfaceKinds.indexOf(kind) * 7919 + 17));
  return canvas;
}

let shared = null;
// Every finish as one layer of a texture array (layer index = surfaceKinds index).
export function surfaceTextureArray() {
  if (shared) return shared;
  const layers = surfaceKinds.length, data = new Uint8Array(SIZE * SIZE * 4 * layers);
  surfaceKinds.forEach((kind, layer) => {
    const pixels = surfaceCanvas(kind).getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    data.set(pixels, layer * SIZE * SIZE * 4);
  });
  const texture = new THREE.DataArrayTexture(data, SIZE, SIZE, layers);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  shared = texture;
  return texture;
}
