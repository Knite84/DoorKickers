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
function planks(ctx, rand, { rows, base, spread, joint, streak, streaks, gap = 1 }, relief) {
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
      relief?.fillRect(start, r * h, 1, h);
    });
    for (let s = 0; s < streaks; s++) {
      ctx.fillStyle = streak; ctx.globalAlpha = 0.15 + rand() * 0.45;
      const y = r * h + 1 + rand() * (h - 2), len = 10 + rand() * 70;
      ctx.fillRect(rand() * SIZE, y, len, 0.6 + rand() * 1.4);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = joint; ctx.fillRect(0, r * h, SIZE, gap);
    relief?.fillRect(0, r * h, SIZE, gap);
  }
}
function squares(ctx, rand, { count, base, spread, grout, veins = 0, vein }, relief) {
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
  for (let i = 0; i < count; i++) {
    ctx.fillRect(i * s, 0, 2, SIZE); ctx.fillRect(0, i * s, SIZE, 2);
    relief?.fillRect(i * s, 0, 2, SIZE); relief?.fillRect(0, i * s, SIZE, 2);
  }
}

const painters = {
  none: ctx => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIZE, SIZE); },
  // Striped amber bamboo with dark streaks.
  bamboo: (ctx, rand, relief) => { planks(ctx, rand, { rows: 12, base: [176, 118, 58], spread: 0.18, joint: '#4a2c16', streak: '#3d2210', streaks: 26 }, relief); noise(ctx, 14, rand); },
  // Beige cut-loop carpet.
  carpet: (ctx, rand) => {
    ctx.fillStyle = '#b8a789'; ctx.fillRect(0, 0, SIZE, SIZE); noise(ctx, 34, rand);
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = rand() < 0.5 ? '#a39274' : '#c9b99c'; ctx.fillRect(rand() * SIZE, rand() * SIZE, 2, 2); }
  },
  // Grey wood-look plank tile (primary bath).
  woodTile: (ctx, rand, relief) => { planks(ctx, rand, { rows: 8, base: [128, 124, 119], spread: 0.22, joint: '#5d5955', streak: '#4e4a46', streaks: 30, gap: 2 }, relief); noise(ctx, 12, rand); },
  // Grey square tile (laundry).
  greyTile: (ctx, rand, relief) => { squares(ctx, rand, { count: 2, base: [136, 138, 136], spread: 0.08, grout: '#b9b7af', veins: 2, vein: '#6d6f6d' }, relief); noise(ctx, 16, rand); },
  // Beige stone-look tile (shared and lower baths).
  stoneTile: (ctx, rand, relief) => { squares(ctx, rand, { count: 2, base: [204, 186, 157], spread: 0.1, grout: '#e7decd', veins: 3, vein: '#9c8466' }, relief); noise(ctx, 14, rand); },
  // Pale wood-look plank tile (bar, alcove).
  plankTile: (ctx, rand, relief) => { planks(ctx, rand, { rows: 6, base: [216, 200, 172], spread: 0.1, joint: '#b3a283', streak: '#a99476', streaks: 20, gap: 2 }, relief); noise(ctx, 10, rand); },
  // Warm wood-look vinyl plank (gym).
  vinyl: (ctx, rand, relief) => { planks(ctx, rand, { rows: 7, base: [170, 122, 78], spread: 0.16, joint: '#6e4a2c', streak: '#7c5232', streaks: 22 }, relief); noise(ctx, 12, rand); },
  // Bare concrete with soft blotches.
  concrete: (ctx, rand) => {
    ctx.fillStyle = '#a9a69d'; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = rand() < 0.5 ? '#9c998f' : '#b4b1a8'; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(rand() * SIZE, rand() * SIZE, 8 + rand() * 30, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1; noise(ctx, 22, rand);
  },
  // Brown composite deck boards with dark gaps.
  deckBoards: (ctx, rand, relief) => { planks(ctx, rand, { rows: 9, base: [140, 92, 62], spread: 0.12, joint: '#2e2119', streak: '#6b4630', streaks: 10, gap: 3 }, relief); noise(ctx, 10, rand); },
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
  woodGrain: (ctx, rand) => {
    ctx.fillStyle = '#f0e9e2'; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let row = 0; row < SIZE; row++) {
      ctx.fillStyle = shade([237, 231, 225], 0.83 + rand() * .17);
      ctx.fillRect(0, row, SIZE, 1);
    }
    noise(ctx, 12, rand);
  },
  wovenFabric: (ctx, rand) => {
    ctx.fillStyle = '#dedede'; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < SIZE; i += 4) {
      ctx.fillStyle = '#f5f5f5'; ctx.fillRect(i, 0, 1, SIZE);
      ctx.fillStyle = '#bebebe'; ctx.fillRect(0, i, SIZE, 1);
    }
    noise(ctx, 12, rand);
  },
  leatherGrain: (ctx, rand) => {
    ctx.fillStyle = '#eae4df'; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = rand() < .5 ? '#d0cac5' : '#f3eeea';
      ctx.fillRect(rand()*SIZE, rand()*SIZE, 2, 2);
    }
    noise(ctx, 12, rand);
  },
  counterStone: (ctx, rand) => {
    ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = rand() < .5 ? '#c3c3c3' : '#fafafa';
      const size = 1 + rand()*3;
      ctx.fillRect(rand()*SIZE, rand()*SIZE, size, size);
    }
    noise(ctx, 18, rand);
  },
  brushedMetal: (ctx, rand) => {
    for (let row = 0; row < SIZE; row++) {
      ctx.fillStyle = shade([245, 245, 245], .82 + rand() * .18);
      ctx.fillRect(0, row, SIZE, 1);
    }
    noise(ctx, 10, rand);
  },
  paintedCabinet: (ctx, rand) => { ctx.fillStyle = '#f7f7f7'; ctx.fillRect(0, 0, SIZE, SIZE); noise(ctx, 9, rand); },
  ceramic: (ctx, rand) => { ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, SIZE, SIZE); noise(ctx, 4, rand); },
  moldedPlastic: (ctx, rand) => { ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, SIZE, SIZE); noise(ctx, 14, rand); },
  ceilingPaint: (ctx, rand) => {
    ctx.fillStyle = '#f0efe9'; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = rand() < .5 ? '#dedcd4' : '#faf9f5';
      ctx.fillRect(rand()*SIZE, rand()*SIZE, 2, 2);
    }
    noise(ctx, 10, rand);
  },
  grass: (ctx, rand) => {
    ctx.fillStyle = '#75805b'; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 22; i++) {
      const x = rand()*SIZE, y = rand()*SIZE, radius = 9+rand()*28;
      for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) {
        const patch = ctx.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,radius);
        patch.addColorStop(0, i%2 ? '#a5a16f66' : '#4c623b77');
        patch.addColorStop(1, '#00000000');
        ctx.fillStyle = patch; ctx.fillRect(x+dx-radius,y+dy-radius,radius*2,radius*2);
      }
    }
    for (let i = 0; i < 3400; i++) {
      ctx.fillStyle = rand() < .5 ? '#616d4c' : '#879065';
      ctx.fillRect(rand()*SIZE, rand()*SIZE, 1+rand()*2, 1+rand()*4);
    }
    noise(ctx, 20, rand);
  },
};

// One canvas per finish, for the preview page and for the texture array.
export function surfaceCanvas(kind, relief) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const surface = surfaceKinds.indexOf(kind);
  const seed = surface < 0 ? Object.keys(painters).indexOf(kind) : surface;
  painters[kind](ctx, random(seed * 7919 + 17), relief);
  return canvas;
}

const roughnessByFinish = {
  none: .85, bamboo: .44, carpet: .94, woodTile: .53, greyTile: .36,
  stoneTile: .51, plankTile: .56, vinyl: .46, concrete: .87,
  deckBoards: .72, paint: .81, siding: .63,
  woodGrain: .52, wovenFabric: .91, leatherGrain: .58, counterStone: .38,
  brushedMetal: .32, paintedCabinet: .57, ceramic: .23, moldedPlastic: .69,
  ceilingPaint: .93, grass: .97,
};

function materialPixels(kind) {
  const mask = document.createElement('canvas');
  mask.width = mask.height = SIZE;
  const relief = mask.getContext('2d', { willReadFrequently: true });
  const canvas = surfaceCanvas(kind, relief);
  const color = canvas.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  const joints = relief.getImageData(0, 0, SIZE, SIZE).data;
  const height = new Float32Array(SIZE * SIZE);
  const packed = new Uint8Array(color.length);
  const grain = ['carpet','wovenFabric','grass','ceilingPaint'].includes(kind) ? .58 : kind === 'paint' ? .16 : .1;
  for (let i = 0; i < height.length; i++) {
    const offset = i * 4;
    const value = (color[offset] + color[offset+1] + color[offset+2]) / 765;
    const joint = joints[offset+3] / 255;
    const lap = kind === 'siding' ? (Math.floor(i/SIZE)*6/SIZE)%1 : 0;
    height[i] = value * grain - joint * .32 + lap * .42;
    packed[offset+2] = Math.round(Math.min(1, roughnessByFinish[kind] + joint * .22 + (value-.5)*.08) * 255);
    packed[offset+3] = 255;
  }
  const at = (x,y) => height[((y+SIZE)%SIZE)*SIZE+(x+SIZE)%SIZE];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = at(x-1,y) - at(x+1,y), dy = at(x,y-1) - at(x,y+1);
    const length = Math.hypot(dx,dy,1);
    const offset = (y*SIZE+x)*4;
    packed[offset] = Math.round((dx/length*.5+.5)*255);
    packed[offset+1] = Math.round((dy/length*.5+.5)*255);
  }
  return { color, packed };
}

export function surfaceSwatchMaps(kind) {
  const { color, packed } = materialPixels(kind);
  const normals = new Uint8Array(packed.length), roughness = new Uint8Array(packed.length);
  for (let i = 0; i < packed.length; i += 4) {
    const x = packed[i]/255*2-1, y = packed[i+1]/255*2-1;
    normals.set([packed[i], packed[i+1], Math.round((Math.sqrt(Math.max(0,1-x*x-y*y))*.5+.5)*255),255], i);
    roughness.set([packed[i+2], packed[i+2], packed[i+2],255], i);
  }
  return {
    map: configureTexture(new THREE.DataTexture(color,SIZE,SIZE), THREE.SRGBColorSpace),
    normalMap: configureTexture(new THREE.DataTexture(normals,SIZE,SIZE)),
    roughnessMap: configureTexture(new THREE.DataTexture(roughness,SIZE,SIZE)),
  };
}

function configureTexture(texture, colorSpace = THREE.NoColorSpace) {
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

let shared = null;
// Every finish as one layer of a texture array (layer index = surfaceKinds index).
export function surfaceTextureArray() {
  if (shared) return shared;
  const layers = surfaceKinds.length, data = new Uint8Array(SIZE * SIZE * 4 * layers);
  const relief = new Uint8Array(data.length);
  surfaceKinds.forEach((kind, layer) => {
    const { color, packed } = materialPixels(kind);
    data.set(color, layer * SIZE * SIZE * 4);
    relief.set(packed, layer * SIZE * SIZE * 4);
  });
  shared = {
    color: configureTexture(new THREE.DataArrayTexture(data, SIZE, SIZE, layers), THREE.SRGBColorSpace),
    relief: configureTexture(new THREE.DataArrayTexture(relief, SIZE, SIZE, layers)),
  };
  return shared;
}
