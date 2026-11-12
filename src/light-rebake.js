import { doorCenter, doorSize } from './world.js';
import { sunDirection } from './lighting.js';

export function captureLightState(state) {
  return {
    pieces: state.wallPieces?.map(piece => piece.hp <= 0) ?? [],
    doors: state.doors?.map((open, index) => open || state.doorHealth?.[index] <= 0) ?? [],
    fixtures: [...(state.destroyedLights ?? [])],
  };
}

export function affectedLightColumns(map, fixtures, state, published, next, grid) {
  const { width, depth, cell } = grid;
  const columns = new Uint8Array(width * depth);
  const mark = (center, size, reach, sunlight) => {
    // A probe can see a changed blocker along a local light ray or along the
    // longer directional sunlight ray. Include both bounds on both floors.
    const limits = [0, 2].map(axis => {
      const offset = sunlight ? -32 * sunDirection[axis] : 0;
      return [
        center[axis] - size[axis]/2 + Math.min(-reach, offset),
        center[axis] + size[axis]/2 + Math.max(reach, offset),
      ];
    });
    const [x, z] = limits.map(([min, max], axis) => {
      const origin = axis ? map.bounds.minZ : map.bounds.minX;
      const count = axis ? depth : width;
      return [Math.max(0, Math.floor((min-origin)/cell)), Math.min(count-1, Math.floor((max-origin)/cell))];
    });
    for (let row = z[0]; row <= z[1]; row++) {
      if (x[0] <= x[1]) columns.fill(1, row*width+x[0], row*width+x[1]+1);
    }
  };
  next.pieces.forEach((removed, index) => {
    if (removed === published.pieces[index]) return;
    const piece = state.wallPieces[index];
    mark(piece.center, piece.size, 16, true);
  });
  next.doors.forEach((open, index) => {
    if (open === published.doors[index]) return;
    mark(doorCenter(map.doors[index]), doorSize(map.doors[index]), 16, true);
  });
  next.fixtures.forEach((destroyed, index) => {
    if (Boolean(destroyed) !== Boolean(published.fixtures[index])) {
      mark(fixtures[index].position, [0, 0, 0], 10, false);
    }
  });
  return columns;
}
