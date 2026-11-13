// Drawn-only finishing for the stairwell as data: a newel-and-baluster railing
// over each guard rail, and carpet on the lower flight. No Three.js here.
//
// The rails stay in map.walls as collision (1 m, blocks movement, not sight)
// and the scene stops drawing their drywall slabs, so the railing shows through.
// Each box hangs on a wall piece and hides with it, like src/trim.js. Only maps
// that declare room finishes (map.surfaces) are dressed.

export const dressKinds = ['handrail', 'newel', 'baluster', 'carpet', 'tread', 'stringer'];
export const railing = { newelSize: 0.09, newelHeight: 1.02, handrailHeight: 0.06, handrailTop: 0.99, balusterSize: 0.02, balusterGap: 0.12, newelSpacing: 1.4 };

export const railWalls = map => new Set(map.surfaces ? map.walls.flatMap((wall, index) => wall.height === 1 ? [index] : []) : []);

export function railingFor(map, pieces) {
  const out = [], rails = railWalls(map);
  const r = railing;
  for (const index of rails) {
    const wall = map.walls[index], along = wall.axis === 'x' ? 0 : wall.axis === 'z' ? 2 : wall.size[0] > wall.size[1] ? 0 : 2;
    const length = wall.size[along === 0 ? 0 : 1], across = 2 - along, base = wall.elevation;
    const skins = pieces.filter(p => p.wall === index && p.material === 'drywall');
    if (!skins.length) continue;
    const hang = a => skins.reduce((best, p) => Math.abs(p.center[along] - a) < Math.abs(best.center[along] - a) ? p : best).id;
    const at = (a, y, sizeAlong, sizeY, sizeAcross) => {
      const center = [0, base + y, 0], size = [0, sizeY, 0];
      center[along] = wall.center[along === 0 ? 0 : 1] + a; size[along] = sizeAlong;
      center[across] = wall.center[across === 0 ? 0 : 1]; size[across] = sizeAcross;
      return { center, size };
    };
    const push = (kind, a, y, sizeAlong, sizeY, sizeAcross) => out.push({ kind, ...at(a, y, sizeAlong, sizeY, sizeAcross), piece: hang(a) });
    const newels = Math.max(2, Math.ceil(length / r.newelSpacing) + 1), posts = Array.from({ length: newels }, (_, i) => -length / 2 + length * i / (newels - 1));
    push('handrail', 0, r.handrailTop - r.handrailHeight / 2, length + r.newelSize, r.handrailHeight, 0.07);
    push('handrail', 0, 0.06, length, 0.03, 0.05);
    for (const a of posts) push('newel', a, r.newelHeight / 2, r.newelSize, r.newelHeight, r.newelSize);
    const count = Math.floor(length / r.balusterGap);
    for (let i = 0; i < count; i++) {
      const a = -length / 2 + (i + 0.5) * length / count;
      if (posts.some(post => Math.abs(post - a) < (r.newelSize + r.balusterSize) / 2 + 0.01)) continue;
      push('baluster', a, 0.51, r.balusterSize, 0.9, r.balusterSize);
    }
  }
  return out;
}

// Carpet on each tread of the first flight (the one that starts on Foundation).
export function carpetFor(map, pieces) {
  if (!map.surfaces || !map.stairs?.length) return [];
  const flight = map.walls.length + (map.floors?.length ?? 0) + (map.ceilings?.length ?? 0);
  return pieces.filter(p => p.stair && p.wall === flight).map(p => ({
    kind: 'carpet', center: [p.center[0], p.center[1] + p.size[1] / 2 + 0.01, p.center[2]], size: [p.size[0], 0.02, p.size[2]], piece: p.id,
  }));
}

// Open treads: a stair marked `open` keeps its solid steps as collision, but the scene stops
// drawing them. Each step gets a thin tread with a small nosing, under it a short stepped
// stringer along each side, so you can see through the flight.
export function openTreadsFor(map, pieces) {
  if (!map.surfaces) return [];
  const out = [], first = map.walls.length + (map.floors?.length ?? 0) + (map.ceilings?.length ?? 0);
  (map.stairs ?? []).forEach((stair, index) => {
    if (!stair.open) return;
    const alongX = Math.abs(stair.to[0] - stair.from[0]) > Math.abs(stair.to[1] - stair.from[1]);
    for (const p of pieces.filter(piece => piece.stair && piece.wall === first + index)) {
      const top = p.center[1] + p.size[1] / 2, [sx, , sz] = p.size;
      out.push({ kind: 'tread', center: [p.center[0], top - 0.025, p.center[2]], size: alongX ? [sx + 0.04, 0.05, sz] : [sx, 0.05, sz + 0.04], piece: p.id });
      for (const side of [-1, 1]) {
        const offset = (alongX ? sz : sx) / 2 - 0.03, center = [p.center[0], top - 0.15, p.center[2]];
        center[alongX ? 2 : 0] += side * offset;
        out.push({ kind: 'stringer', center, size: alongX ? [sx, 0.2, 0.05] : [0.05, 0.2, sz], piece: p.id });
      }
    }
  });
  return out;
}

// Handrails on outdoor and garage steps (owner follow-up, 2026-11-12): a post at each end
// of every open side and a sloped top rail, plus a lower rail on open deck stairs. A side
// that runs along a wall gets none. Deck stairs use the wooden railing kinds; concrete
// garage steps use the dark baluster kind, like a painted steel pipe rail.
// A sloped rail carries `rotation` [x, y, z] in radians, which the scene applies.
export const stepRail = { height: 0.9, post: 0.06, rail: 0.05, inset: 0.04, maxPostGap: 1.4, wallGap: 0.2 };
export function stepRailsFor(map, pieces) {
  if (!map.surfaces) return [];
  const out = [], first = map.walls.length + (map.floors?.length ?? 0) + (map.ceilings?.length ?? 0), r = stepRail;
  (map.stairs ?? []).forEach((stair, index) => {
    const outdoor = stair.material === 'deck', garage = stair.material === 'concrete' && (stair.steps ?? 0) >= 2;
    if (!outdoor && !garage) return;
    const steps = pieces.filter(p => p.stair && p.wall === first + index);
    if (!steps.length) return;
    const dx = stair.to[0] - stair.from[0], dz = stair.to[1] - stair.from[1], alongX = Math.abs(dx) > Math.abs(dz);
    const run = Math.hypot(dx, dz), rise = stair.top - stair.bottom, width = alongX ? stair.size[1] : stair.size[0];
    const hang = (x, z) => steps.reduce((best, p) => Math.hypot(p.center[0] - x, p.center[2] - z) < Math.hypot(best.center[0] - x, best.center[2] - z) ? p : best).id;
    const kinds = outdoor ? { post: 'newel', rail: 'handrail' } : { post: 'baluster', rail: 'baluster' };
    for (const side of [-1, 1]) {
      const offset = width / 2 - r.inset;
      const sideAt = t => { const x = stair.from[0] + dx * t, z = stair.from[1] + dz * t; return alongX ? [x, z + side * offset] : [x + side * offset, z]; };
      // Skip a side that runs along a wall: probe just outside it at mid run, waist height.
      const [mx, mz] = sideAt(0.5), out1 = alongX ? [mx, mz + side * r.wallGap] : [mx + side * r.wallGap, mz], y = stair.bottom + rise / 2 + 0.9;
      const walled = pieces.some(p => !p.stair && !p.floor && p.hp > 0 && Math.abs(p.center[0] - out1[0]) <= p.size[0] / 2 && Math.abs(p.center[2] - out1[1]) <= p.size[2] / 2 && Math.abs(p.center[1] - y) <= p.size[1] / 2);
      // Nor a side with another flight right beside it (the U-shaped deck stair shares one).
      const besideFlight = (map.stairs ?? []).some((other, j) => j !== index && Math.abs(out1[0] - other.center[0]) <= other.size[0] / 2 && Math.abs(out1[1] - other.center[1]) <= other.size[1] / 2);
      if (walled || (besideFlight && side > 0)) continue;
      const posts = Math.max(2, Math.ceil(run / r.maxPostGap) + 1);
      for (let i = 0; i < posts; i++) {
        const t = i / (posts - 1), [x, z] = sideAt(t), ground = stair.bottom + rise * t;
        out.push({ kind: kinds.post, center: [x, ground + r.height / 2, z], size: [r.post, r.height, r.post], piece: hang(x, z), stepRail: true });
      }
      const length = Math.hypot(run, rise), angle = Math.atan2(rise, run);
      const rotation = alongX ? [0, 0, angle * Math.sign(dx)] : [-angle * Math.sign(dz), 0, 0];
      for (const lift of outdoor ? [r.height, r.height * 0.45] : [r.height]) {
        const [x, z] = sideAt(0.5);
        out.push({ kind: kinds.rail, center: [x, stair.bottom + rise / 2 + lift - r.rail / 2, z], size: alongX ? [length + r.post, r.rail, r.rail] : [r.rail, r.rail, length + r.post], rotation, piece: hang(x, z), stepRail: true });
      }
    }
  });
  return out;
}

export function stairDressFor(map, pieces) {
  return map.surfaces ? [...railingFor(map, pieces), ...carpetFor(map, pieces), ...openTreadsFor(map, pieces), ...stepRailsFor(map, pieces)] : [];
}
