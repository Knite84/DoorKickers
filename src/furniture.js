// Furniture kit: each component turns a plain map entry into coloured boxes.
//
// A map entry is { kind, variant?, position: [x, z], size: [x, z], facing?, elevation?, options? }.
// `size` is the footprint along the world axes, exactly like every other prop, so
// collision code never needs to know about facing. `facing` says which way the
// front of the piece points on the floorplan: 'down' (default, +z), 'up' (-z,
// the lake side on Martelli), 'left' (-x) or 'right' (+x). The back sits against
// the wall behind it.
//
// Collision stays one box per piece: the footprint times `furnitureHeight`.
// Drawn-only kinds (rugs, wall TVs, mirrors, fans, the yoga mat) never block and
// belong in `map.decor`, not `map.props`.
//
// This module has no Three.js dependency; `furniture-mesh.js` turns the boxes
// into meshes. A model can replace a component's drawing later without any
// change to the map entries.

const color = {
  oak: 0x9a7650, walnut: 0x5e4330, espresso: 0x3a2b22, white: 0xe8e5dc, cream: 0xd9d1bd,
  greige: 0xb9b2a4, lightGrey: 0xb8bab6, grey: 0x7d8186, charcoal: 0x3d4044, black: 0x1d1f21,
  leather: 0x5b3a26, blue: 0x3f6489, navy: 0x2b3a55, linen: 0xf0ece2, duvet: 0x8a9aa8,
  granite: 0x4a4744, steel: 0xa9adb0, brass: 0xb08d57, porcelain: 0xf4f3ee, tile: 0xcfc6b6,
  brick: 0xa39383, glass: 0x9fc9d4, screen: 0x111417, shade: 0xf1e3c4, plant: 0x5d7d52,
  tote: 0x6d8fa8, wicker: 0x4b443c, cushion: 0xc9c2b2, mat: 0x6e8f7c, rugA: 0x8d8070, rugB: 0x6f7c84,
  plastic: 0xd2d3cf, clothes: 0x6f7f8c,
};

// Box helpers in the piece's own frame: x across the width, y up from the
// floor, z from the back (-d/2) to the front (+d/2).
const box = (x, y0, z, w, h, d, c, extra) => ({ center: [x, y0 + h / 2, z], size: [w, h, d], color: c, ...extra });
const cyl = (x, y0, z, diameter, h, c, extra) => ({ center: [x, y0 + h / 2, z], size: [diameter, h, diameter], color: c, shape: 'cylinder', ...extra });
// A disc standing upright against the back wall (oval mirror).
const disc = (x, yc, z, w, h, c) => ({ center: [x, yc, z], size: [w, h, 0.03], color: c, shape: 'cylinder', axis: 'z' });

function drawers(w, h, d, rows, cols, body, pull = color.brass, y0 = 0.08) {
  const out = [], rowH = (h - y0 - 0.04) / rows, colW = (w - 0.06) / cols;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = -w / 2 + 0.03 + colW * (c + 0.5), y = y0 + rowH * r + 0.02;
    out.push(box(x, y, d / 2 + 0.006, colW - 0.03, rowH - 0.03, 0.012, body));
    out.push(box(x, y + rowH / 2 - 0.03, d / 2 + 0.016, Math.min(0.14, colW * 0.4), 0.02, 0.01, pull));
  }
  return out;
}
function lamp(x, y0, z, scale = 1) {
  return [cyl(x, y0, z, 0.14 * scale, 0.04, color.brass), cyl(x, y0 + 0.04, z, 0.03, 0.26 * scale, color.brass), cyl(x, y0 + 0.24 * scale, z, 0.3 * scale, 0.24 * scale, color.shade)];
}
function legs(w, d, h, c, inset = 0.04, t = 0.05) {
  return [-1, 1].flatMap(sx => [-1, 1].map(sz => box(sx * (w / 2 - inset - t / 2), 0, sz * (d / 2 - inset - t / 2), t, h, t, c)));
}
function tv(x, y0, z, w, standing) {
  const h = w * 0.58, out = [box(x, y0 + (standing ? 0.08 : 0), z, w, h, 0.05, color.black), box(x, y0 + (standing ? 0.08 : 0) + 0.025, z + 0.026, w - 0.05, h - 0.05, 0.004, color.screen)];
  if (standing) out.push(box(x, y0, z, w * 0.3, 0.02, 0.22, color.black), box(x, y0, z - 0.02, 0.06, 0.12, 0.04, color.black));
  return out;
}

function bed(w, d, v) {
  const out = [];
  if (v.style === 'bunk') {
    // Twin over full, lengthwise along the wall, ladder at the right end.
    out.push(...[-1, 1].flatMap(sx => [-1, 1].map(sz => box(sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), 0.08, 1.7, 0.08, color.walnut))));
    out.push(box(0, 0.18, 0, w, 0.16, d, color.walnut), box(0, 0.34, 0, w - 0.1, 0.2, d - 0.1, color.linen), box(0.1, 0.5, 0.05, w * 0.7, 0.06, d - 0.08, color.navy));
    const top = d * 0.67, tz = -d / 2 + top / 2;
    out.push(box(0, 1.08, tz, w, 0.12, top, color.walnut), box(0, 1.2, tz, w - 0.1, 0.16, top - 0.1, color.linen), box(0.1, 1.33, tz, w * 0.7, 0.05, top - 0.08, color.blue));
    out.push(box(0, 1.36, -d / 2 + 0.03, w, 0.3, 0.05, color.walnut), box(-0.15, 1.36, tz + top / 2 - 0.03, w - 0.6, 0.3, 0.05, color.walnut));
    for (const x of [w / 2 - 0.12, w / 2 - 0.42]) out.push(box(x, 0.3, tz + top / 2 + 0.02, 0.04, 1.36, 0.04, color.walnut));
    for (let y = 0.5; y < 1.5; y += 0.3) out.push(box(w / 2 - 0.27, y, tz + top / 2 + 0.02, 0.3, 0.035, 0.035, color.walnut));
    return out;
  }
  if (v.style === 'daybed') {
    // Lengthwise along the wall: back rail behind, arms at both ends.
    out.push(box(0, 0, 0, w, 0.3, d, color.espresso), box(0, 0.3, 0.03, w - 0.12, 0.18, d - 0.12, color.linen), box(0, 0.48, 0.05, w - 0.16, 0.05, d - 0.16, color.duvet));
    out.push(box(0, 0, -d / 2 + 0.03, w, 0.9, 0.06, color.espresso));
    for (const sx of [-1, 1]) out.push(box(sx * (w / 2 - 0.03), 0, 0, 0.06, 0.8, d, color.espresso), box(sx * (w / 2 - 0.3), 0.48, -d / 2 + 0.2, 0.4, 0.14, 0.26, color.porcelain));
    return out;
  }
  // Ordinary bed: headboard at the back, foot toward the front.
  const frame = v.style === 'platform' ? color.espresso : color.walnut, base = v.style === 'platform' ? 0.22 : 0.3;
  out.push(box(0, 0, 0, w, base, d, frame), box(0, base, 0, w - 0.08, 0.24, d - 0.08, color.linen));
  out.push(box(0, base + 0.2, d * 0.14, w - 0.02, 0.1, d * 0.66, v.duvet ?? color.duvet));
  for (const sx of [-1, 1]) out.push(box(sx * w * 0.23, base + 0.24, -d / 2 + 0.3, w * 0.38, 0.12, 0.34, color.porcelain));
  if (v.headboard) {
    out.push(box(0, 0, -d / 2 + 0.05, w + 0.1, v.headboard, 0.1, v.headboardColor ?? frame));
    if (v.style === 'shelf') out.push(box(0, v.headboard - 0.04, -d / 2 + 0.12, w + 0.1, 0.04, 0.24, frame));
  }
  return out;
}

function sofa(w, d, v, options = {}) {
  const arms = options.arms ?? 'both', back = options.back ?? true, h = v.height, c = v.color;
  const armW = arms === 'none' ? 0 : 0.2, seat = h * 0.47, backD = back ? Math.min(0.24, d * 0.25) : 0;
  const out = [box(0, 0.08, 0, w, seat - 0.08, d, c), ...legs(w, d, 0.08, color.espresso, 0.06, 0.05)];
  if (back) out.push(box(0, seat, -d / 2 + backD / 2, w, h - seat, backD, c));
  for (const [sx, on] of [[-1, arms === 'both' || arms === 'left'], [1, arms === 'both' || arms === 'right']])
    if (on) out.push(box(sx * (w / 2 - armW / 2), seat, 0, armW, h * 0.7 - seat, d, c));
  const left = arms === 'both' || arms === 'left' ? armW : 0, right = arms === 'both' || arms === 'right' ? armW : 0;
  const span = w - left - right, n = Math.max(1, Math.round(span / 0.75)), cw = span / n;
  for (let i = 0; i < n; i++) out.push(box(-w / 2 + left + cw * (i + 0.5), seat, backD / 2, cw - 0.03, 0.1, d - backD - 0.04, v.cushion ?? c));
  return out;
}

function cabinets(w, d, v) {
  const out = [box(0, 0, 0.03, w, 0.08, d - 0.1, color.charcoal), box(0, 0.08, 0, w, 0.8, d - 0.02, v.body ?? color.white), box(0, 0.88, 0.01, w + 0.02, 0.04, d + 0.02, v.top ?? color.granite)];
  const doors = Math.max(1, Math.round(w / 0.55)), dw = w / doors;
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    out.push(box(x, 0.12, d / 2 - 0.005, dw - 0.03, 0.72, 0.012, v.body ?? color.white), box(x + dw * 0.32, 0.7, d / 2 + 0.008, 0.02, 0.12, 0.012, color.steel));
  }
  if (v.sink) out.push(box(v.sinkAt ?? 0, 0.86, -0.02, 0.6, 0.05, 0.4, color.steel), cyl(v.sinkAt ?? 0, 0.92, -d / 2 + 0.08, 0.04, 0.3, color.steel));
  if (v.range) {
    out.push(box(0, 0.08, 0, 0.76, 0.84, d, color.steel), box(0, 0.92, 0, 0.76, 0.02, d - 0.04, color.black));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cyl(sx * 0.18, 0.94, sz * 0.13, 0.18, 0.01, color.charcoal));
    out.push(box(0, 1.6, -d / 2 + 0.25, 0.8, 0.12, 0.5, color.steel), box(0, 1.72, -d / 2 + 0.12, 0.3, 0.6, 0.24, color.steel));
  }
  if (v.uppers) {
    const ud = 0.35, uz = -d / 2 + ud / 2, gapW = v.range ? 0.9 : 0;
    for (const [a, b] of gapW ? [[-w / 2, -gapW / 2], [gapW / 2, w / 2]] : [[-w / 2, w / 2]]) {
      if (b - a < 0.2) continue;
      out.push(box((a + b) / 2, 1.45, uz, b - a, 0.75, ud, v.body ?? color.white));
      const n = Math.max(1, Math.round((b - a) / 0.45)), uw = (b - a) / n;
      for (let i = 0; i < n; i++) out.push(box(a + uw * (i + 0.5), 1.48, uz + ud / 2 + 0.006, uw - 0.03, 0.69, 0.012, v.body ?? color.white));
    }
    out.push(box(0, 0.92, -d / 2 + 0.01, w, 0.53, 0.02, v.splash ?? color.cream));
  }
  if (v.rod) out.push(box(0, 1.85, -d / 2 + 0.25, w, 0.03, 0.03, color.steel));
  return out;
}

function vanity(w, d, v, options = {}) {
  const sinks = options.sinks ?? (w >= 1.5 && v.double ? 2 : 1), out = cabinets(w, d, { body: v.body ?? color.white, top: v.top ?? color.cream });
  for (let i = 0; i < sinks; i++) {
    const x = sinks === 1 ? 0 : (i ? 1 : -1) * w / 4;
    out.push(box(x, 0.9, 0.02, 0.42, 0.03, 0.32, color.porcelain), cyl(x, 0.92, -d / 2 + 0.07, 0.035, 0.2, color.brass));
  }
  const mirrorW = Math.min(w - 0.1, sinks === 2 ? w - 0.2 : 0.8);
  if (v.mirror === 'oval') out.push(disc(0, 1.55, -d / 2 + 0.02, 0.55, 0.8, color.glass));
  else out.push(box(0, 1.15, -d / 2 + 0.02, mirrorW + 0.06, 0.86, 0.025, color.espresso), box(0, 1.18, -d / 2 + 0.036, mirrorW, 0.8, 0.01, color.glass));
  return out;
}

function closet(w, d, v) {
  const out = [box(0, 1.72, 0, w, 0.025, d, color.white)];
  const rods = v.double ? [1.0, 1.95] : [1.65];
  for (const y of rods) {
    out.push(box(0, y - 0.02, 0, w, 0.025, 0.025, color.steel));
    const n = Math.floor(w / 0.12), hang = y === 1.0 ? 0.9 : 0.75;
    for (let i = 0; i < n; i++) out.push(box(-w / 2 + 0.06 + i * (w - 0.12) / Math.max(1, n - 1), y - 0.04 - hang * (0.75 + (i * 7 % 5) / 20), 0, 0.03, hang * (0.75 + (i * 7 % 5) / 20), d * 0.85, [color.clothes, color.navy, color.cream, color.charcoal, color.blue][i % 5]));
  }
  if (v.double) out[0] = box(0, 1.98, 0, w, 0.025, d, color.white);
  return out;
}

// Each component: variants give a typical footprint [width, depth] and a
// collision height. `draw(width, depth, variant, options)` returns local boxes.
export const furnitureKinds = {
  bed: {
    label: 'Bed',
    variants: {
      king: { size: [2.0, 2.2], height: 0.6, headboard: 1.3, headboardColor: color.greige },
      queen: { size: [1.6, 2.1], height: 0.6, headboard: 1.1 },
      queenShelf: { size: [1.6, 2.1], height: 0.6, headboard: 1.1, style: 'shelf', duvet: color.cream },
      platform: { size: [1.6, 2.1], height: 0.5, style: 'platform', duvet: color.lightGrey },
      twin: { size: [1.0, 2.0], height: 0.6, headboard: 0.9 },
      daybed: { size: [2.0, 1.0], height: 0.8, style: 'daybed' },
      bunk: { size: [2.1, 1.5], height: 1.7, style: 'bunk' },
    },
    default: 'queen',
    draw: bed,
  },
  nightstand: {
    label: 'Nightstand',
    variants: { plain: { size: [0.5, 0.45], height: 0.65 }, lamp: { size: [0.5, 0.45], height: 0.65, lamp: true }, wide: { size: [0.7, 0.45], height: 0.65, lamp: true } },
    default: 'lamp',
    draw: (w, d, v) => [box(0, 0, 0, w, 0.62, d, color.walnut), box(0, 0.62, 0, w + 0.02, 0.03, d + 0.02, color.walnut), ...drawers(w, 0.62, d, 2, 1, color.oak), ...(v.lamp ? lamp(-w * 0.15, 0.65, -d * 0.1) : [])],
  },
  dresser: {
    label: 'Dresser',
    variants: { low: { size: [1.5, 0.5], height: 0.85, rows: 3, cols: 2 }, tallChest: { size: [0.9, 0.5], height: 1.3, rows: 5, cols: 1 }, white: { size: [1.4, 0.45], height: 0.8, rows: 3, cols: 2, body: color.white } },
    default: 'low',
    // options.tv: width of a TV standing on top.
    draw: (w, d, v, o) => [box(0, 0, 0, w, v.height - 0.03, d, v.body ?? color.walnut), box(0, v.height - 0.03, 0, w + 0.02, 0.03, d + 0.02, v.body ?? color.walnut), ...drawers(w, v.height - 0.03, d, v.rows, v.cols, v.body ? color.cream : color.oak), ...(o.tv ? tv(0, v.height, -d * 0.15, Math.min(o.tv, w), true) : [])],
  },
  desk: {
    label: 'Desk',
    variants: { plain: { size: [0.9, 0.5], height: 0.75 }, hutch: { size: [1.5, 0.6], height: 1.5 }, glass: { size: [1.2, 0.6], height: 0.75 }, executive: { size: [1.8, 0.8], height: 0.75 } },
    default: 'plain',
    draw: (w, d, v, _o, name) => {
      if (name === 'glass') return [box(0, 0.72, 0, w, 0.02, d, color.glass, { glass: true }), ...legs(w, d, 0.72, color.steel, 0.03, 0.03)];
      const top = box(0, 0.72, 0, w, 0.03, d, name === 'executive' ? color.espresso : color.oak), out = [top];
      if (name === 'executive') out.push(box(-w / 2 + 0.25, 0, 0, 0.45, 0.72, d - 0.06, color.espresso), box(w / 2 - 0.25, 0, 0, 0.45, 0.72, d - 0.06, color.espresso), box(0, 0.25, -d / 2 + 0.03, w - 0.9, 0.45, 0.02, color.espresso));
      else out.push(box(w / 2 - 0.22, 0, 0, 0.4, 0.72, d - 0.04, color.oak), box(-w / 2 + 0.02, 0, 0, 0.03, 0.72, d - 0.04, color.oak));
      if (name === 'hutch') out.push(box(0, 0.75, -d / 2 + 0.13, w, 0.75, 0.26, color.oak), box(0, 1.05, -d / 2 + 0.17, w - 0.06, 0.02, 0.2, color.walnut));
      return out;
    },
  },
  chair: {
    label: 'Chair',
    variants: { desk: { size: [0.55, 0.55], height: 0.9 }, office: { size: [0.65, 0.65], height: 1.1 }, dining: { size: [0.45, 0.5], height: 0.95 } },
    default: 'desk',
    draw: (w, d, v, _o, name) => {
      const seat = 0.46, c = name === 'office' ? color.black : name === 'dining' ? color.walnut : color.charcoal;
      if (name === 'dining') return [...legs(w, d, seat, c, 0.03, 0.04), box(0, seat, 0, w, 0.05, d, color.cushion), box(0, seat, -d / 2 + 0.03, w, v.height - seat, 0.04, c)];
      return [cyl(0, 0, 0, Math.min(w, d), 0.05, color.charcoal), cyl(0, 0.05, 0, 0.05, seat - 0.12, color.steel), box(0, seat - 0.08, 0.02, w * 0.85, 0.1, d * 0.8, c), box(0, seat + 0.05, -d / 2 + 0.08, w * 0.8, v.height - seat - 0.05, 0.08, c)];
    },
  },
  bookcase: {
    label: 'Bookcase',
    variants: { tall: { size: [0.8, 0.3], height: 1.8, shelves: 5 }, low: { size: [0.9, 0.3], height: 0.8, shelves: 2 }, cube: { size: [1.5, 0.4], height: 1.1, shelves: 3, cubes: 4 }, ladder: { size: [0.6, 0.35], height: 1.7, shelves: 4, ladder: true } },
    default: 'tall',
    draw: (w, d, v) => {
      const out = [], h = v.height, c = v.cubes ? color.white : color.oak;
      if (v.ladder) {
        for (const sx of [-1, 1]) out.push(box(sx * (w / 2 - 0.02), 0, 0, 0.04, h, 0.04, color.walnut));
        for (let i = 0; i < v.shelves; i++) { const t = i / (v.shelves - 1), sd = d * (1 - t * 0.6); out.push(box(0, 0.05 + t * (h - 0.15), -d / 2 + sd / 2, w - 0.04, 0.03, sd, color.walnut), box(-w * 0.2, 0.08 + t * (h - 0.15), -d / 2 + sd / 2, w * 0.3, 0.18, sd * 0.6, [color.blue, color.cream, color.navy, color.plant][i % 4])); }
        return out;
      }
      out.push(box(0, 0, -d / 2 + 0.01, w, h, 0.02, c));
      for (const sx of [-1, 1]) out.push(box(sx * (w / 2 - 0.01), 0, 0, 0.02, h, d, c));
      if (v.cubes) for (let i = 1; i < v.cubes; i++) out.push(box(-w / 2 + (w * i) / v.cubes, 0, 0, 0.02, h, d, c));
      for (let i = 0; i <= v.shelves; i++) out.push(box(0, (h - 0.02) * i / v.shelves, 0, w, 0.02, d, c));
      for (let i = 0; i < v.shelves; i++) {
        const y = (h - 0.02) * i / v.shelves + 0.02, sh = (h - 0.02) / v.shelves;
        out.push(box(-w * 0.12, y, 0, w * 0.6, sh * 0.7, d * 0.8, [color.navy, color.oak, color.blue, color.cream, color.leather][i % 5]));
      }
      return out;
    },
  },
  sofa: {
    label: 'Sofa',
    variants: {
      fabric: { size: [2.2, 0.95], height: 0.9, color: color.lightGrey },
      leather: { size: [2.2, 1.0], height: 0.95, color: color.leather },
      outdoor: { size: [1.9, 0.8], height: 0.8, color: color.wicker, cushion: color.cushion },
      floor: { size: [1.7, 1.0], height: 0.7, color: color.grey },
    },
    default: 'fabric',
    draw: (w, d, v, o) => sofa(w, d, v, o),
  },
  armchair: {
    label: 'Armchair',
    variants: { blue: { size: [1.3, 1.0], height: 0.9, color: color.blue }, outdoor: { size: [0.8, 0.8], height: 0.8, color: color.wicker, cushion: color.cushion }, child: { size: [0.6, 0.55], height: 0.55, color: color.cream } },
    default: 'blue',
    draw: (w, d, v) => sofa(w, d, v, { arms: 'both' }),
  },
  bench: {
    label: 'Bench',
    variants: { upholstered: { size: [1.3, 0.4], height: 0.5 }, shoe: { size: [1.2, 0.4], height: 0.5, shelf: true } },
    default: 'upholstered',
    draw: (w, d, v) => [box(0, 0.4, 0, w, 0.1, d, v.shelf ? color.oak : color.greige), ...legs(w, d, 0.4, color.espresso, 0.02, 0.05), ...(v.shelf ? [box(0, 0.08, 0, w - 0.06, 0.02, d - 0.04, color.oak), ...[-0.4, -0.15, 0.15, 0.4].map((x, i) => box(x * w, 0.1, 0, 0.12, 0.1, 0.26, [color.black, color.navy, color.leather, color.white][i]))] : [])],
  },
  coffeeTable: {
    label: 'Coffee table',
    variants: { wood: { size: [1.0, 0.6], height: 0.45 }, outdoor: { size: [1.0, 0.6], height: 0.45, wicker: true } },
    default: 'wood',
    draw: (w, d, v) => [box(0, 0.4, 0, w, 0.05, d, v.wicker ? color.wicker : color.walnut), ...legs(w, d, 0.4, v.wicker ? color.wicker : color.walnut), box(0, 0.12, 0, w - 0.1, 0.02, d - 0.1, v.wicker ? color.wicker : color.walnut)],
  },
  endTable: {
    label: 'End table',
    variants: { plain: { size: [0.5, 0.5], height: 0.6 }, lamp: { size: [0.5, 0.5], height: 0.6, lamp: true } },
    default: 'lamp',
    draw: (w, d, v) => [box(0, 0.56, 0, w, 0.04, d, color.walnut), ...legs(w, d, 0.56, color.walnut), box(0, 0.15, 0, w - 0.08, 0.02, d - 0.08, color.walnut), ...(v.lamp ? lamp(0, 0.6, 0, 1.1) : [])],
  },
  plantStand: {
    label: 'Plant stand',
    variants: { plain: { size: [0.4, 0.4], height: 0.9 } },
    default: 'plain',
    draw: w => [...legs(w, w, 0.55, color.black, 0.03, 0.025), box(0, 0.55, 0, w, 0.02, w, color.black), cyl(0, 0.57, 0, w * 0.7, 0.2, color.cream), cyl(0, 0.75, 0, w * 0.9, 0.3, color.plant)],
  },
  mediaConsole: {
    label: 'Media console',
    variants: { tv: { size: [2.2, 0.45], height: 0.7, tv: 2.1 }, plain: { size: [2.2, 0.45], height: 0.7 } },
    default: 'tv',
    draw: (w, d, v) => [box(0, 0.06, 0, w, 0.62, d, color.espresso), box(0, 0.68, 0, w + 0.02, 0.02, d + 0.02, color.espresso), ...drawers(w, 0.62, d, 1, 4, color.walnut, color.black, 0.1), ...legs(w, d, 0.06, color.black), ...(v.tv ? tv(0, 0.7, -0.02, Math.min(v.tv, w * 0.95), true) : [])],
  },
  diningTable: {
    label: 'Dining table',
    variants: { six: { size: [2.0, 1.0], height: 0.75 } },
    default: 'six',
    draw: (w, d) => [box(0, 0.71, 0, w, 0.04, d, color.walnut), ...legs(w, d, 0.71, color.walnut, 0.08, 0.08)],
  },
  barStool: {
    label: 'Bar stool',
    variants: { counter: { size: [0.45, 0.45], height: 1.0, seat: 0.66 }, bar: { size: [0.45, 0.45], height: 1.1, seat: 0.76 } },
    default: 'counter',
    draw: (w, d, v) => [cyl(0, 0, 0, w * 0.8, 0.03, color.black), cyl(0, 0.03, 0, 0.05, v.seat - 0.03, color.black), cyl(0, v.seat, 0, w, 0.06, color.leather), box(0, v.seat + 0.06, -d / 2 + 0.03, w * 0.8, v.height - v.seat - 0.06, 0.04, color.leather)],
  },
  island: {
    label: 'Kitchen island',
    variants: { seating: { size: [2.6, 1.1], height: 0.95 } },
    default: 'seating',
    // Cabinets on the back side, a 0.3 m counter overhang on the front for stools.
    draw: (w, d) => {
      const bodyD = d - 0.32, n = Math.max(1, Math.round(w / 0.6)), dw = (w - 0.04) / n, back = -d / 2;
      const out = [box(0, 0, back + bodyD / 2, w - 0.04, 0.9, bodyD, color.white), box(0, 0.9, 0, w, 0.05, d, color.granite)];
      for (let i = 0; i < n; i++) { const x = -w / 2 + 0.02 + dw * (i + 0.5); out.push(box(x, 0.1, back - 0.006, dw - 0.03, 0.76, 0.012, color.white), box(x, 0.75, back - 0.016, 0.14, 0.02, 0.01, color.steel)); }
      return out;
    },
  },
  cabinets: {
    label: 'Cabinet run',
    variants: {
      base: { size: [1.8, 0.6], height: 0.9 },
      kitchen: { size: [2.4, 0.6], height: 0.9, uppers: true },
      sink: { size: [2.4, 0.6], height: 0.9, uppers: true, sink: true },
      range: { size: [2.4, 0.6], height: 0.9, uppers: true, range: true },
      wetBar: { size: [3.5, 0.6], height: 0.9, uppers: true, sink: true, body: color.cream, splash: color.brick },
      laundry: { size: [0.9, 0.6], height: 0.9, uppers: true, sink: true, top: color.plastic, rod: true },
    },
    default: 'kitchen',
    draw: (w, d, v) => cabinets(w, d, v),
  },
  barCounter: {
    label: 'Bar on half wall',
    variants: { brick: { size: [3.2, 0.4], height: 1.1 } },
    default: 'brick',
    draw: (w, d) => [box(0, 0, -0.04, w, 1.05, d - 0.08, color.brick), box(0, 1.05, 0, w, 0.05, d, color.granite)],
  },
  fridge: {
    label: 'Fridge',
    variants: { full: { size: [0.9, 0.8], height: 1.8 }, under: { size: [0.6, 0.6], height: 0.85 } },
    default: 'full',
    draw: (w, d, v, _o, name) => name === 'under'
      ? [box(0, 0, 0, w, 0.85, d, color.black), box(0, 0.08, d / 2, w - 0.06, 0.72, 0.01, color.glass, { glass: true }), box(0, 0.7, d / 2 + 0.01, w - 0.1, 0.03, 0.015, color.steel)]
      : [box(0, 0, 0, w, 1.8, d, color.steel), box(0, 1.15, d / 2 + 0.002, 0.01, 0.63, 0.006, color.charcoal), box(0, 0.75, d / 2 + 0.002, w, 0.01, 0.006, color.charcoal), box(-0.06, 1.25, d / 2 + 0.02, 0.025, 0.4, 0.025, color.charcoal), box(0.06, 1.25, d / 2 + 0.02, 0.025, 0.4, 0.025, color.charcoal), box(0, 0.35, d / 2 + 0.02, w * 0.6, 0.025, 0.025, color.charcoal)],
  },
  vanity: {
    label: 'Vanity with mirror',
    variants: { single: { size: [0.9, 0.55], height: 0.9 }, small: { size: [0.75, 0.5], height: 0.9, mirror: 'oval' }, wide: { size: [1.5, 0.55], height: 0.9 }, alcove: { size: [1.8, 0.55], height: 0.9 }, double: { size: [1.8, 0.55], height: 0.9, double: true } },
    default: 'single',
    draw: (w, d, v, o) => vanity(w, d, v, o),
  },
  toilet: {
    label: 'Toilet',
    variants: { standard: { size: [0.5, 0.7], height: 0.75 } },
    default: 'standard',
    draw: (w, d) => [box(0, 0, -0.02, 0.24, 0.38, 0.3, color.porcelain), cyl(0, 0.3, 0.06, Math.min(w, 0.42), 0.1, color.porcelain), cyl(0, 0.4, 0.06, Math.min(w, 0.42), 0.02, color.white), box(0, 0.38, -d / 2 + 0.1, w * 0.95, 0.37, 0.2, color.porcelain), box(0, 0.75, -d / 2 + 0.1, w, 0.03, 0.22, color.porcelain)],
  },
  tubShower: {
    label: 'Tub / shower alcove',
    variants: { alcove: { size: [1.5, 0.8], height: 0.55 } },
    default: 'alcove',
    // Collision is the tub only; the tiled back panel and rod are drawn.
    draw: (w, d) => [box(0, 0, 0, w, 0.55, d, color.porcelain), box(0, 0.4, 0.02, w - 0.14, 0.16, d - 0.16, color.white), box(0, 0.55, -d / 2 + 0.01, w, 1.45, 0.02, color.tile), box(0, 1.95, d / 2 - 0.02, w, 0.025, 0.025, color.steel), box(w / 2 - 0.08, 0.6, d / 2 - 0.04, 0.12, 1.32, 0.05, color.linen)],
  },
  soakingTub: {
    label: 'Soaking tub in deck',
    variants: { deck: { size: [1.8, 1.1], height: 0.55 } },
    default: 'deck',
    draw: (w, d) => [box(0, 0, 0, w, 0.55, d, color.tile), box(0, 0.53, 0, w - 0.3, 0.03, d - 0.3, color.porcelain), box(0, 0.4, 0, w - 0.42, 0.16, d - 0.42, color.white), cyl(0, 0.55, -d / 2 + 0.08, 0.04, 0.22, color.brass)],
  },
  shower: {
    label: 'Walk-in shower',
    variants: { glass: { size: [1.2, 1.2], height: 2.0 } },
    default: 'glass',
    // Glass on the front, plus options.side ('right' by default, 'left' or 'none'); walls elsewhere.
    draw: (w, d, v, o) => [box(0, 0, 0, w, 0.06, d, color.tile), box(0, 0.06, d / 2 - 0.01, w, 1.94, 0.02, color.glass, { glass: true }),
      ...((o.side ?? 'right') === 'none' ? [] : [box((o.side === 'left' ? -1 : 1) * (w / 2 - 0.01), 0.06, 0, 0.02, 1.94, d, color.glass, { glass: true })]), box(w / 2 - 0.25, 1.0, d / 2 + 0.015, 0.02, 0.3, 0.02, color.brass), cyl(0, 1.95, -d / 2 + 0.2, 0.2, 0.02, color.steel)],
  },
  linenCabinet: {
    label: 'Tall cabinet',
    variants: { linen: { size: [0.6, 0.55], height: 2.1 }, pantry: { size: [0.9, 0.6], height: 2.1 }, flush: { size: [0.9, 0.06], height: 2.1 }, closet: { size: [0.55, 0.45], height: 1.4 } },
    default: 'linen',
    draw: (w, d, v) => {
      const h = v.height, out = [box(0, 0, 0, w, h, d, color.white)], doors = w > 0.7 ? 2 : 1;
      for (let i = 0; i < doors; i++) { const x = doors === 1 ? 0 : (i ? 1 : -1) * w / 4; out.push(box(x, 0.06, d / 2 + 0.004, w / doors - 0.04, h - 0.12, 0.012, color.cream), box(x + (doors === 1 ? w / 2 - 0.08 : (i ? -1 : 1) * (w / 4 - 0.06)), h * 0.45, d / 2 + 0.02, 0.02, 0.14, 0.02, color.brass)); }
      return out;
    },
  },
  closetRun: {
    label: 'Closet rod and shelf',
    variants: { single: { size: [1.5, 0.35], height: 1.75 }, double: { size: [1.5, 0.35], height: 2.0, double: true } },
    default: 'single',
    draw: (w, d, v) => closet(w, d, v),
  },
  cubbyTower: {
    label: 'Cubby tower',
    variants: { white: { size: [0.6, 0.35], height: 2.1 } },
    default: 'white',
    draw: (w, d) => {
      const out = [box(0, 0, -d / 2 + 0.01, w, 2.1, 0.02, color.white), box(-w / 2 + 0.01, 0, 0, 0.02, 2.1, d, color.white), box(w / 2 - 0.01, 0, 0, 0.02, 2.1, d, color.white), box(0, 0, 0, 0.02, 2.1, d, color.white)];
      for (let i = 0; i <= 6; i++) out.push(box(0, i * 0.347, 0, w, 0.02, d, color.white));
      for (let i = 0; i < 6; i++) out.push(box((i % 2 ? 1 : -1) * w / 4, i * 0.347 + 0.02, 0.02, w / 2 - 0.08, 0.22, d - 0.08, [color.cream, color.navy, color.clothes, color.white, color.charcoal, color.blue][i]));
      return out;
    },
  },
  toyChest: {
    label: 'Toy chest',
    variants: { wood: { size: [0.9, 0.5], height: 0.45 } },
    default: 'wood',
    draw: (w, d) => [box(0, 0, 0, w, 0.41, d, color.white), box(0, 0.41, 0, w + 0.02, 0.04, d + 0.02, color.blue)],
  },
  laundryMachine: {
    label: 'Washer / dryer',
    variants: { washer: { size: [0.7, 0.8], height: 1.3 }, dryer: { size: [0.7, 0.8], height: 1.3, dryer: true } },
    default: 'washer',
    draw: (w, d, v) => [box(0, 0, 0, w, 0.35, d, color.white), box(0, 0.3, d / 2 + 0.003, w - 0.06, 0.02, 0.01, color.steel), box(0, 0.35, 0, w, 0.95, d, color.white), box(0, 1.15, -d / 2 + 0.08, w, 0.15, 0.16, color.white), disc(0, 0.75, d / 2 + 0.01, 0.46, 0.46, v.dryer ? color.grey : color.glass), cyl(-w / 2 + 0.12, 1.2, -d / 2 + 0.17, 0.06, 0.02, color.steel)],
  },
  furnace: {
    label: 'Furnace',
    variants: { upflow: { size: [0.6, 0.8], height: 1.5 } },
    default: 'upflow',
    draw: (w, d) => [box(0, 0, 0, w, 1.5, d, color.steel), box(0, 0.1, d / 2 + 0.005, w - 0.06, 0.6, 0.01, color.grey), box(0, 0.78, d / 2 + 0.005, w - 0.06, 0.6, 0.01, color.grey), box(0, 1.5, 0, w * 0.8, 0.9, d * 0.6, color.grey)],
  },
  waterHeater: {
    label: 'Water heater',
    variants: { tank: { size: [0.5, 0.5], height: 1.5 } },
    default: 'tank',
    draw: w => [cyl(0, 0, 0, w, 1.5, color.white), cyl(0, 1.5, 0, w * 0.96, 0.03, color.steel), cyl(0, 1.53, 0, 0.12, 0.4, color.steel), cyl(-0.12, 1.53, 0.05, 0.03, 0.4, 0xb87333), cyl(0.12, 1.53, 0.05, 0.03, 0.4, 0xb87333)],
  },
  storageShelf: {
    label: 'Shelving with totes',
    variants: { totes: { size: [0.9, 0.45], height: 1.8 } },
    default: 'totes',
    draw: (w, d) => {
      const out = [-1, 1].flatMap(sx => [-1, 1].map(sz => box(sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02), 0.04, 1.8, 0.04, color.plastic)));
      for (let i = 0; i < 4; i++) { const y = 0.05 + i * 0.57; out.push(box(0, y, 0, w, 0.03, d, color.plastic)); if (i < 3) out.push(box(-w * 0.22, y + 0.03, 0, w * 0.45, 0.3, d * 0.9, color.tote), box(w * 0.22, y + 0.03, 0, w * 0.45, 0.3, d * 0.9, i % 2 ? color.tote : color.plastic)); }
      return out;
    },
  },
  totes: {
    label: 'Stacked totes',
    variants: { stack: { size: [0.6, 0.4], height: 0.9 } },
    default: 'stack',
    draw: (w, d) => [0, 1, 2].flatMap(i => [box(0, i * 0.3, 0, w - i * 0.01, 0.27, d, color.tote), box(0, i * 0.3 + 0.27, 0, w + 0.02 - i * 0.01, 0.03, d + 0.02, color.navy)]),
  },
  fireplace: {
    label: 'Fireplace',
    // A corner fireplace squared off against the walls: brick to the ceiling,
    // raised hearth, dark tiled surround and a wood mantel.
    variants: { corner: { size: [1.2, 1.0], height: 2.35 } },
    default: 'corner',
    draw: (w, d, v) => {
      const hearthD = 0.35, massD = d - hearthD, mz = -d / 2 + massD / 2, face = -d / 2 + massD;
      return [box(0, 0, mz, w, v.height, massD, color.brick), box(0, 0, d / 2 - hearthD / 2, w, 0.4, hearthD, color.brick), box(0, 0.4, face + 0.01, w * 0.8, 0.85, 0.02, color.black),
        box(0, 0.48, face + 0.02, w * 0.5, 0.55, 0.01, 0x2a1d17), box(0, 0.5, face + 0.03, w * 0.35, 0.12, 0.01, 0xd07a35), box(0, 1.3, face + 0.08, w * 0.9, 0.1, 0.16, color.walnut)];
    },
  },
  // Drawn only: never in map.props, never blocks movement, shots or guards.
  rug: {
    label: 'Rug', drawnOnly: true,
    variants: { warm: { size: [3, 4], color: color.rugA }, cool: { size: [3, 4], color: color.rugB }, entry: { size: [1.2, 0.8], color: color.charcoal } },
    default: 'warm',
    draw: (w, d, v) => [box(0, 0, 0, w, 0.012, d, v.color), box(0, 0.012, 0, w - 0.3, 0.004, d - 0.3, color.cream), box(0, 0.016, 0, w - 0.4, 0.002, d - 0.4, v.color)],
  },
  yogaMat: {
    label: 'Yoga mat', drawnOnly: true,
    variants: { mat: { size: [0.6, 1.8] } },
    default: 'mat',
    draw: (w, d) => [box(0, 0, 0, w, 0.008, d, color.mat)],
  },
  wallTV: {
    label: 'Wall TV', drawnOnly: true,
    variants: { small: { size: [1.2, 0.06], mount: 1.25 }, medium: { size: [1.4, 0.06], mount: 1.3 }, large: { size: [2.1, 0.06], mount: 1.35 } },
    default: 'medium',
    draw: (w, d, v) => tv(0, v.mount - w * 0.29, 0, w, false),
  },
  mirror: {
    label: 'Wall mirror', drawnOnly: true,
    variants: { oval: { size: [0.55, 0.04], oval: true }, rect: { size: [0.8, 0.04] } },
    default: 'oval',
    draw: (w, d, v) => v.oval ? [disc(0, 1.5, 0, w, w * 1.45, color.glass)] : [box(0, 1.1, 0, w, 0.9, 0.03, color.espresso), box(0, 1.13, 0.016, w - 0.06, 0.84, 0.005, color.glass)],
  },
  ceilingFan: {
    label: 'Ceiling fan', drawnOnly: true,
    variants: { standard: { size: [1.3, 1.3], ceiling: 2.8 } },
    default: 'standard',
    draw: (w, d, v, o) => {
      const top = o?.ceiling ?? v.ceiling, overhead = { overhead: true };
      return [cyl(0, top - 0.3, 0, 0.04, 0.3, color.espresso, overhead), cyl(0, top - 0.42, 0, 0.22, 0.12, color.espresso, overhead), cyl(0, top - 0.5, 0, 0.14, 0.08, color.shade, overhead),
        box(0, top - 0.38, 0, w, 0.012, 0.13, color.walnut, overhead), box(0, top - 0.38, 0, 0.13, 0.012, d, color.walnut, overhead)];
    },
  },
};

const facings = { down: 0, right: 1, up: 2, left: 3 };
const facingNames = ['down', 'right', 'up', 'left'];
export const isFurniture = prop => Object.hasOwn(furnitureKinds, prop?.kind);
export const isDrawnOnly = prop => !!furnitureKinds[prop?.kind]?.drawnOnly;
const quarter = facing => {
  if (facing === undefined) return 0;
  if (!Object.hasOwn(facings, facing)) throw new Error(`Unknown facing "${facing}" (use down, up, left or right)`);
  return facings[facing];
};
function variantOf(prop) {
  const kind = furnitureKinds[prop.kind];
  const name = prop.variant ?? kind.default;
  if (!Object.hasOwn(kind.variants, name)) throw new Error(`Unknown ${prop.kind} variant "${name}"`);
  return [name, kind.variants[name]];
}

// Collision height for a kit piece, or undefined for anything else.
export function furnitureHeight(prop) {
  if (!isFurniture(prop)) return undefined;
  if (isDrawnOnly(prop)) return 0;
  return variantOf(prop)[1].height;
}

// Rotate a local [x, z] offset by quarter turns (0 = front faces +z).
function turn([x, z], q) {
  return [[x, z], [z, -x], [-x, -z], [-z, x]][((q % 4) + 4) % 4];
}
const swap = ([a, b], q) => (q % 2 ? [b, a] : [a, b]);

// The footprint along the world axes for a local width x depth and facing.
export const footprint = (localSize, facing) => swap(localSize, quarter(facing));

// Build a plain map entry from a local width x depth (defaulting to the
// variant's size). Use this when authoring maps.
export function piece(kind, variant, position, { size, facing = 'down', elevation, options } = {}) {
  if (!Object.hasOwn(furnitureKinds, kind)) throw new Error(`Unknown furniture kind "${kind}"`);
  const entry = { kind, variant: variant ?? furnitureKinds[kind].default, position: [...position] };
  const local = size ?? variantOf(entry)[1].size;
  entry.size = footprint(local, facing);
  entry.facing = facing;
  if (elevation !== undefined) entry.elevation = elevation;
  if (options) entry.options = options;
  return entry;
}

// L- or U-shaped sectional as two or three ordinary sofa pieces. `size` is
// the local overall width x depth; the long back run sits against the back.
// `mirror` puts an L's return on the right-hand end (seen from the front).
export function sectional(shape, position, { size = [3.4, 2.8], facing = 'down', variant = 'fabric', seatDepth = 0.95, elevation, mirror = false } = {}) {
  const [w, d] = size, q = quarter(facing), returnLength = d - seatDepth;
  const parts = [{ at: [0, -d / 2 + seatDepth / 2], size: [w, seatDepth], turn: 0, arms: shape === 'U' ? 'none' : mirror ? 'left' : 'right' }];
  if (mirror && shape === 'L') parts.push({ at: [w / 2 - seatDepth / 2, seatDepth / 2], size: [returnLength, seatDepth], turn: 3, arms: 'right' });
  else parts.push({ at: [-w / 2 + seatDepth / 2, seatDepth / 2], size: [returnLength, seatDepth], turn: 1, arms: 'left' });
  if (shape === 'U') parts.push({ at: [w / 2 - seatDepth / 2, seatDepth / 2], size: [returnLength, seatDepth], turn: 3, arms: 'right' });
  else if (shape !== 'L') throw new Error(`Sectional shape must be L or U, not "${shape}"`);
  return parts.map(part => {
    const offset = turn(part.at, q);
    return piece('sofa', variant, [position[0] + offset[0], position[1] + offset[1]], { size: part.size, facing: facingNames[(q + part.turn) % 4], elevation, options: { arms: part.arms } });
  });
}

// World-space boxes for drawing: [{ center: [x, y, z], size: [x, y, z], color, shape?, axis?, glass?, overhead? }].
export function furnitureBoxes(prop) {
  const kind = furnitureKinds[prop.kind], [name, variant] = variantOf(prop), q = quarter(prop.facing);
  const [w, d] = swap(prop.size, q), base = prop.elevation ?? 0;
  return kind.draw(w, d, variant, prop.options ?? {}, name).map(local => {
    const [x, z] = turn([local.center[0], local.center[2]], q), [sx, sz] = swap([local.size[0], local.size[2]], q);
    const out = { ...local, center: [prop.position[0] + x, base + local.center[1], prop.position[1] + z], size: [sx, local.size[1], sz] };
    if (local.axis === 'z' && q % 2) out.axis = 'x';
    return out;
  });
}
