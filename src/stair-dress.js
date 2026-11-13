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

export function stairDressFor(map, pieces) {
  return map.surfaces ? [...railingFor(map, pieces), ...carpetFor(map, pieces), ...openTreadsFor(map, pieces)] : [];
}
