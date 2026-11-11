// Shared geometry for rendering, bullets, movement, and sight.
// A wall is two tiled drywall skins around independently breakable timber framing.
export function buildWallPieces(map) {
  const pieces = [];
  const add = (wall, center, size, material, hp, extra = {}) => pieces.push({ id: pieces.length, wall, center, size, material, hp, maxHp: hp, ...extra });
  map.walls.forEach((wall, index) => {
    const along = wall.axis==='x'?0:wall.axis==='z'?2:wall.size[0] > wall.size[1] ? 0 : 2;
    const across = along === 0 ? 2 : 0;
    const origin = [wall.center[0], wall.elevation ?? 0, wall.center[1]];
    const height = wall.height ?? 2.8, level = wall.level ?? Math.round(origin[1] / 3.2);
    const length = wall.size[along===0?0:1];
    if (!wall.destructible) {
      const columns = Math.ceil(length), rows = Math.ceil(height / 0.7);
      for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
        const center = [...origin], size = [wall.size[0], height / rows, wall.size[1]];
        center[along] += -length / 2 + length / columns * (column + 0.5);
        center[1] += height / rows * (row + 0.5); size[along] = length / columns;
        add(index, center, size, 'masonry', 10, { blastOnly: true, level });
      }
      return;
    }
    const columns = Math.ceil(length / 0.5), width = length / columns;
    const rows = Math.ceil(height / 0.4), tileHeight = height / rows;
    for (const side of [-1, 1]) for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
      const center = [...origin], size = [0.045, 0.4, 0.045];
      center[along] += -length / 2 + width * (column + 0.5);
      center[across] += side * 0.085;
      center[1] += (row + 0.5) * tileHeight; size[1] = tileHeight;
      size[along] = width; add(index, center, size, 'drywall', 1, { level });
    }
    const studs = Math.ceil(length / 0.6);
    for (let column = 0; column <= studs; column++) for (let row = 0; row < rows; row++) {
      const center = [...origin], size = [0.089, 0.4, 0.089];
      center[along] += -length / 2 + length * column / studs;
      center[1] += (row + 0.5) * tileHeight; size[1] = tileHeight; size[along] = 0.038;
      add(index, center, size, 'timber', 4, { level });
    }
    for (const y of [0.045, height - 0.045]) {
      const center = [...origin], size = [0.089, 0.09, 0.089];
      center[1] += y; size[along] = length;
      add(index, center, size, 'timber', 6, { level });
    }
  });
  for (const [index, floor] of (map.floors ?? []).entries()) {
    if (floor.solid) {
      const depth = floor.depth ?? 0.2;
      add(map.walls.length + index, [floor.center[0], floor.elevation - depth / 2, floor.center[1]], [floor.size[0], depth, floor.size[1]], floor.material ?? 'masonry', Infinity, { floor: true, level: Math.round(floor.elevation / 3.2) });
      continue;
    }
    const columns = Math.ceil(floor.size[0] / 1.2), rows = Math.ceil(floor.size[1] / 1.2);
    const width = floor.size[0] / columns, depth = floor.size[1] / rows;
    const extra = { floor: true, level: Math.round(floor.elevation / 3.2) };
    for (let x = 0; x < columns; x++) for (let z = 0; z < rows; z++) {
      add(map.walls.length + index, [floor.center[0] - floor.size[0] / 2 + width * (x + 0.5), floor.elevation - 0.08, floor.center[1] - floor.size[1] / 2 + depth * (z + 0.5)], [width, 0.16, depth], 'particleboard', 24, extra);
    }
    const trusses = Math.max(1, Math.ceil(floor.size[0] / 1.8));
    for (let x = 0; x <= trusses; x++) for (let z = 0; z < rows; z++) {
      add(map.walls.length + index, [floor.center[0] - floor.size[0] / 2 + floor.size[0] * x / trusses, floor.elevation - 0.46, floor.center[1] - floor.size[1] / 2 + depth * (z + 0.5)], [0.2, 0.6, depth], 'truss', 80, extra);
    }
  }
  for(const [index,ceiling] of (map.ceilings??[]).entries()){
    const columns=Math.ceil(ceiling.size[0]/1.2),rows=Math.ceil(ceiling.size[1]/1.2),width=ceiling.size[0]/columns,depth=ceiling.size[1]/rows;
    for(let x=0;x<columns;x++)for(let z=0;z<rows;z++)add(map.walls.length+(map.floors?.length??0)+index,[ceiling.center[0]-ceiling.size[0]/2+(x+.5)*width,ceiling.elevation+.08,ceiling.center[1]-ceiling.size[1]/2+(z+.5)*depth],[width,.16,depth],'ceiling',6,{floor:true,ceiling:true,level:ceiling.level??Math.floor(ceiling.elevation/3.2)});
  }
  for (const [index, stair] of (map.stairs ?? []).entries()) {
    const count = 16, dx = stair.to[0] - stair.from[0], dz = stair.to[1] - stair.from[1];
    for (let step = 0; step < count; step++) {
      const t = (step + 0.5) / count, height = stair.bottom + (step + 1) / count * (stair.top - stair.bottom);
      add(map.walls.length + (map.floors?.length ?? 0) + (map.ceilings?.length??0) + index, [stair.from[0] + dx * t, height / 2, stair.from[1] + dz * t], [Math.abs(dx) / count || stair.size[0], height, Math.abs(dz) / count || stair.size[1]], 'masonry', Infinity, { stair: true, level: 0 });
    }
  }
  return pieces;
}

export function rayBox(origin, direction, center, size, maxDistance = 80) {
  let near = 0, far = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const min = center[axis] - size[axis] / 2, max = center[axis] + size[axis] / 2;
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < min || origin[axis] > max) return null;
    } else {
      const a = (min - origin[axis]) / direction[axis], b = (max - origin[axis]) / direction[axis];
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return null;
    }
  }
  return near;
}

const supportGraphs = new WeakMap();
function supportGraph(pieces) {
  if (supportGraphs.has(pieces)) return supportGraphs.get(pieces);
  const neighbors = pieces.map(() => []), anchors = [], cells = new Map();
  for (let i = 0; i < pieces.length; i++) {
    const a = pieces[i];
    if (!Number.isFinite(a.maxHp) || a.center[1] - a.size[1] / 2 <= 0.1) anchors.push(i);
    const candidates = new Set(), keys = [];
    const min = a.center.map((v, axis) => Math.floor(v - a.size[axis] / 2 - 0.03));
    const max = a.center.map((v, axis) => Math.floor(v + a.size[axis] / 2 + 0.03));
    for (let x = min[0]; x <= max[0]; x++) for (let y = min[1]; y <= max[1]; y++) for (let z = min[2]; z <= max[2]; z++) {
      const key = `${x},${y},${z}`; keys.push(key);
      for (const index of cells.get(key) ?? []) candidates.add(index);
    }
    for (const j of candidates) {
      const b = pieces[j];
      const overlaps = a.center.map((v, axis) => Math.min(v + a.size[axis] / 2, b.center[axis] + b.size[axis] / 2) - Math.max(v - a.size[axis] / 2, b.center[axis] - b.size[axis] / 2));
      // The small tolerance joins drywall to the framing behind it. A corner
      // touching at a single point does not count as an attached face.
      if (overlaps.every(value => value >= -0.025) && overlaps.filter(value => value > 0.001).length >= 2) {
        neighbors[i].push(j); neighbors[j].push(i);
      }
    }
    for (const key of keys) { if (!cells.has(key)) cells.set(key, []); cells.get(key).push(i); }
  }
  const graph = { neighbors, anchors }; supportGraphs.set(pieces, graph); return graph;
}
export function removeUnsupportedPieces(pieces) {
  const { neighbors, anchors } = supportGraph(pieces);
  const supported = new Set(anchors.filter(index => pieces[index].hp > 0));
  const queue = [...supported];
  for (let at = 0; at < queue.length; at++) for (const index of neighbors[queue[at]]) {
    if (pieces[index].hp > 0 && !supported.has(index)) { supported.add(index); queue.push(index); }
  }
  const fallen = [];
  pieces.forEach((piece, index) => {
    if (piece.hp > 0 && !supported.has(index)) { piece.hp = 0; fallen.push(piece); }
  });
  return fallen;
}

export function damageWall(pieces, hit, amount, source = 'impact') {
  if (!Number.isFinite(hit.hp) || hit.blastOnly && source !== 'blast') return [];
  const removed = [];
  // Drywall chips around the impact. Timber requires direct, repeated hits.
  for (const piece of pieces) {
    if (piece.hp <= 0 || piece.wall !== hit.wall || piece.material !== hit.material) continue;
    const across = hit.size[0] < hit.size[2] ? 0 : 2;
    const near = piece === hit || (source !== 'precise' && hit.material === 'drywall' && Math.abs(piece.center[across] - hit.center[across]) < 0.01 && Math.hypot(...piece.center.map((v, i) => v - hit.center[i])) < 0.57);
    if (!near) continue;
    piece.hp -= amount;
    if (piece.hp <= 0) removed.push(piece);
  }
  if (removed.length) removed.push(...removeUnsupportedPieces(pieces));
  return removed;
}
