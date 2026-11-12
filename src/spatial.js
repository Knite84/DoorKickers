// A coarse plan-view lookup over the structural pieces, so movement and sight
// checks examine only what is nearby instead of every piece on the map. Pieces
// never move (damage only changes hp), so the lookup is built once per mission.
const CELL = 1, PAD = 0.05, LARGE = 48;
const indexes = new WeakMap();
function indexFor(pieces) {
  let index = indexes.get(pieces);
  if (index && index.count === pieces.length) return index;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of pieces) {
    minX = Math.min(minX, p.center[0] - p.size[0] / 2); maxX = Math.max(maxX, p.center[0] + p.size[0] / 2);
    minZ = Math.min(minZ, p.center[2] - p.size[2] / 2); maxZ = Math.max(maxZ, p.center[2] + p.size[2] / 2);
  }
  if (!pieces.length) minX = minZ = maxX = maxZ = 0;
  minX -= PAD; minZ -= PAD;
  const width = Math.floor((maxX + PAD - minX) / CELL) + 1, depth = Math.floor((maxZ + PAD - minZ) / CELL) + 1;
  const cells = Array.from({ length: width * depth }, () => []), large = [];
  const column = x => Math.max(0, Math.min(width - 1, Math.floor((x - minX) / CELL)));
  const row = z => Math.max(0, Math.min(depth - 1, Math.floor((z - minZ) / CELL)));
  index = { count: pieces.length, minX, minZ, width, depth, cells, large, column, row, stamps: new Uint32Array(pieces.length), stamp: 0 };
  pieces.forEach((p, i) => {
    const x1 = index.column(p.center[0] - p.size[0] / 2 - PAD), x2 = index.column(p.center[0] + p.size[0] / 2 + PAD);
    const z1 = index.row(p.center[2] - p.size[2] / 2 - PAD), z2 = index.row(p.center[2] + p.size[2] / 2 + PAD);
    // Whole-floor slabs would sit in every cell; keep them in one always-checked list.
    if ((x2 - x1 + 1) * (z2 - z1 + 1) > LARGE) { large.push(i); return; }
    for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) cells[z * width + x].push(i);
  });
  indexes.set(pieces, index); return index;
}
function begin(pieces, index) {
  if (++index.stamp === 0xffffffff) { index.stamps.fill(0); index.stamp = 1; }
  const found = [];
  for (const i of index.large) found.push(pieces[i]);
  return found;
}
function collect(pieces, index, found, x1, x2, z1, z2) {
  const { cells, width, stamps, stamp } = index;
  for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) for (const i of cells[z * width + x]) {
    if (stamps[i] !== stamp) { stamps[i] = stamp; found.push(pieces[i]); }
  }
}
// Every piece whose footprint could touch the given plan rectangle.
export function piecesInArea(pieces, minX, maxX, minZ, maxZ) {
  const index = indexFor(pieces), found = begin(pieces, index);
  collect(pieces, index, found, index.column(minX), index.column(maxX), index.row(minZ), index.row(maxZ));
  return found;
}
// Every piece whose footprint could touch the straight line from a to b.
// Points are [x, y, z]; only the plan position is used to narrow the search.
export function piecesAlong(pieces, a, b) {
  const index = indexFor(pieces), found = begin(pieces, index);
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const x1 = index.column(Math.min(a[0], b[0])), x2 = index.column(Math.max(a[0], b[0]));
  if (Math.abs(dx) < 1e-9) { collect(pieces, index, found, x1, x2, index.row(Math.min(a[2], b[2])), index.row(Math.max(a[2], b[2]))); return found; }
  // Walk the columns the line crosses, taking the rows it spans inside each one.
  for (let x = x1; x <= x2; x++) {
    const left = index.minX + x * CELL, right = left + CELL;
    const t1 = Math.max(0, Math.min(1, (left - a[0]) / dx)), t2 = Math.max(0, Math.min(1, (right - a[0]) / dx));
    const za = a[2] + dz * t1, zb = a[2] + dz * t2;
    collect(pieces, index, found, x, x, index.row(Math.min(za, zb) - 1e-6), index.row(Math.max(za, zb) + 1e-6));
  }
  return found;
}
// Counting destroyed pieces is how several caches notice damage. Do it once per
// simulation step rather than once per caller.
const damage = new WeakMap();
export function damageCount(state) {
  const prior = damage.get(state);
  if (prior && prior.elapsed === state.elapsed && prior.pieces === state.wallPieces) return prior.count + (state.propBroken ?? 0);
  let count = 0;
  for (const p of state.wallPieces) if (p.hp <= 0) count++;
  damage.set(state, { elapsed: state.elapsed, pieces: state.wallPieces, count });
  // Broken furniture changes walking, cover and light just as broken wall pieces do.
  return count + (state.propBroken ?? 0);
}
