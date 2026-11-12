import { elevation, propHeight } from './world.js';

// Baked contact shading. The breakable structure is thousands of shared,
// instanced boxes, so shading cannot be baked into their vertices as a
// one-off mesh would allow. Instead each floor gets a plan-view field of the
// distance to the nearest blocker, which the lighting shader turns into soft
// darkening where floors meet walls and furniture, and where walls meet the
// ceiling. Destroyed pieces drop out on the next bake.
//   channel 0: distance to anything standing on the floor (walls and furniture)
//   channel 1: distance to full-height walls only (for the ceiling corner)
// Pure data, no Three.js, so it runs in Node tests.
export const CONTACT_CELL = 0.1;
export const CONTACT_RANGE = 1;
const LOW = 0.3, CONTACT_BAND = [0.1, 0.3], SEED = 0.2, FULL_HEIGHT = 2;

export function contactGrid(map) {
  const b = map.bounds, levels = map.levels ?? [{ elevation: 0 }];
  return {
    minX: b.minX, minZ: b.minZ, cell: CONTACT_CELL,
    width: Math.ceil((b.maxX - b.minX) / CONTACT_CELL), depth: Math.ceil((b.maxZ - b.minZ) / CONTACT_CELL),
    levels: levels.map(level => elevation(level)),
    // Ceiling height above each floor, for the darkening where walls meet it.
    ceilings: levels.map(level => {
      const above = (map.ceilings ?? []).map(c => elevation(c) - elevation(level)).filter(h => h > 1.8 && h < 3.2);
      return above.length ? Math.min(...above) : 2.8;
    }),
  };
}

// Boxes that rest on a floor at height y: { min: [x, z], max: [x, z], wall }.
function blockersAt(map, y, pieces, props) {
  const out = [];
  for (const piece of pieces) {
    if (piece.hp <= 0 || piece.stair) continue;
    const bottom = piece.center[1] - piece.size[1] / 2, top = piece.center[1] + piece.size[1] / 2;
    if (bottom > y + CONTACT_BAND[1] || top < y + CONTACT_BAND[0]) continue;
    out.push({ min: [piece.center[0] - piece.size[0] / 2, piece.center[2] - piece.size[2] / 2],
      max: [piece.center[0] + piece.size[0] / 2, piece.center[2] + piece.size[2] / 2], wall: (map.walls[piece.wall]?.height ?? 2.8) >= FULL_HEIGHT });
  }
  for (const prop of props) {
    const bottom = elevation(prop), height = propHeight(prop);
    if (height < LOW || Math.abs(bottom - y) > CONTACT_BAND[1]) continue;
    out.push({ min: [prop.position[0] - prop.size[0] / 2, prop.position[1] - prop.size[1] / 2],
      max: [prop.position[0] + prop.size[0] / 2, prop.position[1] + prop.size[1] / 2], wall: false });
  }
  return out;
}

// Two-pass chamfer distance transform in place, in metres.
function distanceTransform(field, width, depth, cell) {
  const straight = cell, diagonal = cell * Math.SQRT2;
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x; let d = field[i];
    if (x > 0) d = Math.min(d, field[i - 1] + straight);
    if (z > 0) {
      d = Math.min(d, field[i - width] + straight);
      if (x > 0) d = Math.min(d, field[i - width - 1] + diagonal);
      if (x < width - 1) d = Math.min(d, field[i - width + 1] + diagonal);
    }
    field[i] = d;
  }
  for (let z = depth - 1; z >= 0; z--) for (let x = width - 1; x >= 0; x--) {
    const i = z * width + x; let d = field[i];
    if (x < width - 1) d = Math.min(d, field[i + 1] + straight);
    if (z < depth - 1) {
      d = Math.min(d, field[i + width] + straight);
      if (x < width - 1) d = Math.min(d, field[i + width + 1] + diagonal);
      if (x > 0) d = Math.min(d, field[i + width - 1] + diagonal);
    }
    field[i] = d;
  }
}

// Returns RG bytes, levels stacked along z: byte = distance / CONTACT_RANGE * 255.
export function bakeContactField(map, pieces, props = map.props, grid = contactGrid(map), out) {
  const { width, depth, cell, minX, minZ } = grid, plane = width * depth;
  const bytes = out ?? new Uint8Array(plane * grid.levels.length * 2);
  const coverAll = new Float32Array(plane), coverWall = new Float32Array(plane);
  const all = new Float32Array(plane), walls = new Float32Array(plane);
  grid.levels.forEach((y, level) => {
    coverAll.fill(0); coverWall.fill(0);
    for (const box of blockersAt(map, y, pieces, props)) {
      const x0 = Math.max(0, Math.floor((box.min[0] - minX) / cell)), x1 = Math.min(width - 1, Math.floor((box.max[0] - minX) / cell));
      const z0 = Math.max(0, Math.floor((box.min[1] - minZ) / cell)), z1 = Math.min(depth - 1, Math.floor((box.max[1] - minZ) / cell));
      for (let z = z0; z <= z1; z++) {
        const cz = minZ + z * cell, overlapZ = Math.min(box.max[1], cz + cell) - Math.max(box.min[1], cz);
        if (overlapZ <= 0) continue;
        for (let x = x0; x <= x1; x++) {
          const cx = minX + x * cell, overlapX = Math.min(box.max[0], cx + cell) - Math.max(box.min[0], cx);
          if (overlapX <= 0) continue;
          const share = overlapX * overlapZ / (cell * cell), i = z * width + x;
          coverAll[i] += share;
          if (box.wall) coverWall[i] += share;
        }
      }
    }
    for (let i = 0; i < plane; i++) {
      all[i] = coverAll[i] > SEED ? 0 : CONTACT_RANGE;
      walls[i] = coverWall[i] > SEED ? 0 : CONTACT_RANGE;
    }
    distanceTransform(all, width, depth, cell);
    distanceTransform(walls, width, depth, cell);
    const offset = level * plane * 2;
    for (let i = 0; i < plane; i++) {
      bytes[offset + i * 2] = Math.round(Math.min(all[i], CONTACT_RANGE) / CONTACT_RANGE * 255);
      bytes[offset + i * 2 + 1] = Math.round(Math.min(walls[i], CONTACT_RANGE) / CONTACT_RANGE * 255);
    }
  });
  return bytes;
}

// Distance in metres from a plan point to the nearest blocker, for tests and tools.
export function contactDistance(bytes, grid, [x, z], level = 0, channel = 0) {
  const column = Math.min(grid.width - 1, Math.max(0, Math.floor((x - grid.minX) / grid.cell)));
  const row = Math.min(grid.depth - 1, Math.max(0, Math.floor((z - grid.minZ) / grid.cell)));
  return bytes[(level * grid.width * grid.depth + row * grid.width + column) * 2 + channel] / 255 * CONTACT_RANGE;
}
