// Room finishes as data: which floor surface and wall paint apply where.
// No Three.js here, so the plan can be tested; surface-textures.js draws the
// textures and surface-materials.js applies them in the scene.
//
// map.surfaces: [{ kind, rect: [x1, z1, x2, z2] (metres), elevation, outdoor? }]
//   Later entries win where they overlap. `outdoor` surfaces (a deck) are
//   finished floors but count as outside when deciding which face of an
//   exterior wall gets siding.
// map.paint: { default, '<ROOM NAME>': color } for wall faces inside map.rooms.
// map.paintZones: [{ color, rect, elevation, facing? }] override the room paint
//   (accent walls). `facing: 'x'` paints only wall faces whose normal runs along x
//   (walls running along z), so an accent wall's colour stops at the corner
//   instead of wrapping onto the side walls; `'z'` is the other way.

// Layer order is the texture array order; 0 means "no finish".
export const surfaceKinds = ['none', 'bamboo', 'carpet', 'woodTile', 'greyTile', 'stoneTile', 'plankTile', 'vinyl', 'concrete', 'deckBoards', 'paint', 'siding', 'ceilingPaint', 'grass'];
// Metres covered by one repeat of each texture.
export const surfaceTile = { none: 1, bamboo: 1.2, carpet: 0.6, woodTile: 1.2, greyTile: 0.6, stoneTile: 0.9, plankTile: 1.2, vinyl: 1.2, concrete: 2, deckBoards: 1.2, paint: 1, siding: 1.2, ceilingPaint: 1, grass: 2.4 };
export const surfaceIndex = kind => {
  const index = surfaceKinds.indexOf(kind);
  if (index < 0) throw new Error(`Unknown surface "${kind}"`);
  return index;
};

const levelOf = elevation => Math.round((elevation ?? 0) / 3.2);
const within = (rect, x, z) => x >= rect[0] && x <= rect[2] && z >= rect[1] && z <= rect[3];

export function surfaceAt(map, x, z, level) {
  const surfaces = map.surfaces ?? [];
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surface = surfaces[i];
    if (levelOf(surface.elevation) === level && within(surface.rect, x, z)) return surface;
  }
  return null;
}
const interior = (map, x, z, level) => { const s = surfaceAt(map, x, z, level); return !!s && !s.outdoor; };

export function roomAt(map, x, z, level) {
  let best = null, bestArea = Infinity;
  for (const room of map.rooms ?? []) {
    if (levelOf(room.elevation) !== level) continue;
    const [cx, cz] = room.center, [w, d] = room.size;
    if (Math.abs(x - cx) > w / 2 || Math.abs(z - cz) > d / 2) continue;
    if (w * d < bestArea) { best = room; bestArea = w * d; }
  }
  return best;
}

// Wall paint at a point just in front of a wall face, or null for "keep the map's colour".
export function paintAt(map, x, z, level, facing) {
  if (!map.paint) return null;
  for (const zone of map.paintZones ?? []) {
    if (zone.facing && facing && zone.facing !== facing) continue;
    if (levelOf(zone.elevation) === level && within(zone.rect, x, z)) return zone.color;
  }
  const room = roomAt(map, x, z, level);
  return (room && map.paint[room.name]) ?? map.paint.default ?? null;
}

// For a solid (exterior) wall piece: which horizontal direction is outside, and
// the paint for its inside face. `all` means both faces are outside (siding).
export function exteriorFaces(map, piece) {
  // A wall's own axis says which way it runs; a stub shorter than the wall is
  // thick (beside a corner window) would otherwise read as facing the other way.
  const axis = map.walls?.[piece.wall]?.axis;
  const thin = axis === 'x' ? 2 : axis === 'z' ? 0 : piece.size[0] <= piece.size[2] ? 0 : 2, level = piece.level ?? levelOf(piece.center[1]);
  const reach = piece.size[thin] / 2 + 0.25, sides = [-1, 1].map(sign => {
    const x = piece.center[0] + (thin === 0 ? sign * reach : 0), z = piece.center[2] + (thin === 2 ? sign * reach : 0);
    return { sign, x, z, inside: interior(map, x, z, level) };
  });
  const [a, b] = sides;
  if (a.inside === b.inside) {
    const inner = a.inside ? paintAt(map, a.x, a.z, level, thin === 0 ? 'x' : 'z') : null;
    return { outward: [0, 0], all: !a.inside, paint: inner };
  }
  const outside = a.inside ? b : a, inside = a.inside ? a : b;
  return { outward: thin === 0 ? [outside.sign, 0] : [0, outside.sign], all: false, paint: paintAt(map, inside.x, inside.z, level, thin === 0 ? 'x' : 'z') };
}

// For a drywall skin piece: paint for the room its face looks into.
export function skinPaint(map, piece) {
  const wall = map.walls[piece.wall];
  if (!wall) return null;
  const runsAlongX = wall.axis ? wall.axis === 'x' : wall.size[0] > wall.size[1], across = runsAlongX ? 2 : 0;
  const sign = Math.sign(piece.center[across] - (across === 0 ? wall.center[0] : wall.center[1])) || 1;
  const x = piece.center[0] + (across === 0 ? sign * 0.25 : 0), z = piece.center[2] + (across === 2 ? sign * 0.25 : 0);
  return paintAt(map, x, z, piece.level ?? levelOf(piece.center[1]), across === 0 ? 'x' : 'z');
}
