import { elevation, stairHeight, propHeight, activeProps } from './world.js';
import { damageCount } from './spatial.js';

// A small shared walking grid, rebuilt when damage changes passable geometry.
// Doors are authorized guard routes and are opened on approach by the AI.
// Cell size defaults to 0.65 m; maps with ordinary house doors ask for a finer
// grid so at least one walkable cell always falls inside each doorway.
const cache = new WeakMap();
export function navigationFor(state, map, { radius = 0.28, cell = map.navCell ?? 0.65 } = {}) {
  const signature = [damageCount(state), state.windowHealth?.join(','), radius, cell].join(':');
  const prior = cache.get(state);
  if (prior?.signature === signature) return prior;
  const CELL = cell, x0 = map.bounds.minX + 0.3, z0 = map.bounds.minZ + 0.3;
  const width = Math.floor((map.bounds.maxX - x0 - 0.3) / CELL) + 1;
  const depth = Math.floor((map.bounds.maxZ - z0 - 0.3) / CELL) + 1;
  const bases = (map.levels ?? [{ elevation: 0 }]).map(elevation), plane = width * depth;
  const blocked = new Uint8Array(plane * bases.length), heights = new Float32Array(blocked.length), onStair = new Uint8Array(blocked.length);
  const point = id => [x0 + (id % plane % width) * CELL, z0 + Math.floor(id % plane / width) * CELL];
  function raster(level, center, size, padding, visit) {
    const minX = Math.max(0, Math.ceil((center[0] - size[0] / 2 - padding - x0) / CELL));
    const maxX = Math.min(width - 1, Math.floor((center[0] + size[0] / 2 + padding - x0) / CELL));
    const minZ = Math.max(0, Math.ceil((center[1] - size[1] / 2 - padding - z0) / CELL));
    const maxZ = Math.min(depth - 1, Math.floor((center[1] + size[1] / 2 + padding - z0) / CELL));
    for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) visit(level * plane + z * width + x);
  }
  // Slabs between storeys (a half landing) are walkable platforms that join flights.
  const between = piece => piece.floor && !piece.stair && !piece.ceiling && bases.every(b => Math.abs(piece.center[1] + piece.size[1] / 2 - b) >= 0.15);
  bases.forEach((base, level) => {
    const supported = new Uint8Array(plane).fill(level === 0 ? 1 : 0), landing = new Float32Array(plane).fill(NaN);
    const landingHere = top => top > base + 0.5 && top < (bases[level + 1] ?? base + 3.2) - 0.5;
    for (const piece of state.wallPieces) {
      if (piece.hp <= 0 || piece.stair) continue;
      const bottom = piece.center[1] - piece.size[1] / 2, top = piece.center[1] + piece.size[1] / 2;
      const center = [piece.center[0], piece.center[2]], size = [piece.size[0], piece.size[2]];
      if (between(piece) && landingHere(top)) { raster(level, center, size, -0.05, id => { landing[id % plane] = top; }); continue; }
      if (piece.floor && Math.abs(top - base) < 0.15) raster(level, center, size, 0.08, id => { supported[id % plane] = 1; });
      if (bottom < base + 1.8 && top > base + 0.12) raster(level, center, size, radius, id => { blocked[id] = 1; });
    }
    for (const prop of activeProps(state, map)) if (elevation(prop) < base + 1.8 && elevation(prop) + propHeight(prop) > base + 0.12) raster(level, prop.position, prop.size, radius, id => { blocked[id] = 1; });
    (map.windows ?? []).forEach((window, index) => {
      if (state.windowHealth[index] > 0 && Math.abs(elevation(window) - base) < 0.5) raster(level, window.position, window.size, radius, id => { blocked[id] = 1; });
    });
    for (let at = 0; at < plane; at++) {
      const id = level * plane + at, stair = stairHeight(map, point(id)) ?? (Number.isNaN(landing[at]) ? null : landing[at]);
      heights[id] = stair ?? base;
      onStair[id] = Number(stair !== null);
      if (stair !== null) { if (level > 0 && stair < base - 0.5) blocked[id] = 1; }
      else if (!supported[at]) blocked[id] = 1;
    }
  });
  const graph = { signature, cell: CELL, x0, z0, width, depth, bases, plane, blocked, heights, onStair, point };
  cache.set(state, graph); return graph;
}

class Heap {
  values = [];
  push(value) {
    const a = this.values; a.push(value); let at = a.length - 1;
    while (at > 0) { const parent = (at - 1) >> 1; if (a[parent].score <= value.score) break; a[at] = a[parent]; at = parent; } a[at] = value;
  }
  pop() {
    const a = this.values, first = a[0], last = a.pop(); if (!a.length) return first;
    let at = 0;
    while (at * 2 + 1 < a.length) {
      let child = at * 2 + 1; if (child + 1 < a.length && a[child + 1].score < a[child].score) child++;
      if (a[child].score >= last.score) break; a[at] = a[child]; at = child;
    } a[at] = last; return first;
  }
}
function visitNeighbors(g, id, visit) {
  const { width, depth, plane, blocked, heights, onStair } = g;
  const x = id % plane % width, z = Math.floor(id % plane / width), level = Math.floor(id / plane);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz || x + dx < 0 || x + dx >= width || z + dz < 0 || z + dz >= depth) continue;
    if (dx && dz && (blocked[level * plane + z * width + x + dx] || blocked[level * plane + (z + dz) * width + x])) continue;
    for (let nextLevel = 0; nextLevel < g.bases.length; nextLevel++) {
      const next = nextLevel * plane + (z + dz) * width + x + dx;
      const rise = heights[next] - heights[id];
      if (blocked[next] || Math.abs(rise) > 0.5 || rise > 0.12 && !onStair[next]) continue;
      visit(next, dx, dz, rise);
    }
  }
}

export function reachableCells(graph, source) {
  const visited = new Uint8Array(graph.blocked.length);
  if (source < 0 || source >= visited.length || graph.blocked[source]) return visited;
  const queue = [source];
  visited[source] = 1;
  const enqueue = next => {
    if (visited[next]) return;
    visited[next] = 1;
    queue.push(next);
  };
  for (let i = 0; i < queue.length; i++) visitNeighbors(graph, queue[i], enqueue);
  return visited;
}

export function findGuardPath(state, map, start, startY, target, targetY) {
  const g = navigationFor(state, map), { width, plane, blocked, heights, point, cell, x0, z0 } = g;
  // Plan position of a cell without allocating; searches call these constantly.
  const cellX = id => x0 + (id % plane % width) * cell, cellZ = id => z0 + Math.floor(id % plane / width) * cell;
  function nearest(position, y) {
    let best = -1, score = Infinity;
    for (let id = 0; id < blocked.length; id++) {
      if (blocked[id] || Math.abs(heights[id] - y) > 0.55) continue;
      const d = Math.hypot(cellX(id) - position[0], cellZ(id) - position[1]);
      if (d < score) { score = d; best = id; }
    }
    return best;
  }
  const source = nearest(start, startY), goal = nearest(target, targetY);
  if (source < 0 || goal < 0) return [];
  const finishX = cellX(goal), finishZ = cellZ(goal), heuristic = id => Math.hypot(cellX(id) - finishX, cellZ(id) - finishZ) + Math.abs(heights[id] - heights[goal]) * 2;
  // The search buffers are kept with the grid and wiped, rather than reallocated per search.
  const scratch = g.scratch ??= { costs: new Float64Array(blocked.length), parents: new Int32Array(blocked.length), closed: new Uint8Array(blocked.length) };
  const costs = scratch.costs.fill(Infinity), parents = scratch.parents.fill(-1), closed = scratch.closed.fill(0), open = new Heap();
  costs[source] = 0; open.push({ id: source, score: heuristic(source) }); let best = source;
  let id;
  function relax(next, dx, dz, rise) {
    if (closed[next]) return;
    const cost = costs[id] + g.cell * Math.hypot(dx, dz) + Math.abs(rise);
    if (cost >= costs[next]) return;
    costs[next] = cost; parents[next] = id; open.push({ id: next, score: cost + heuristic(next) });
  }
  while (open.values.length) {
    id = open.pop().id; if (closed[id]) continue; closed[id] = 1;
    if (heuristic(id) < heuristic(best)) best = id;
    if (id === goal) { best = goal; break; }
    visitNeighbors(g, id, relax);
  }
  const path = []; for (let at = best; at !== source && at >= 0; at = parents[at]) path.push({ position: point(at), elevation: heights[at] });
  return path.reverse();
}
