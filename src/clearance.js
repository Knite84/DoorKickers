import { elevation, propHeight } from './world.js';

export const WALKWAY_WIDTH = { local: 0.7, main: 0.9 };
const FLUSH = 0.1;
const EPSILON = 1e-8;

function footprint(object, isProp) {
  const center = isProp ? object.position : object.center;
  return {
    object,
    min: center.map((coordinate, axis) => coordinate - object.size[axis] / 2),
    max: center.map((coordinate, axis) => coordinate + object.size[axis] / 2),
  };
}

// Compare facing edges with a shared span. A third obstacle splits or hides
// that span so, for example, a wall behind a cabinet cannot create a gap.
export function furnitureClearances(map) {
  const gaps = [];
  for (const level of map.levels ?? [{ elevation: 0 }]) {
    const y = elevation(level);
    const blocksWalking = (object, height) => elevation(object) < y + 1.8
      && elevation(object) + height > y + 0.12;
    const props = map.props.filter(prop => blocksWalking(prop, propHeight(prop))).map(prop => footprint(prop, true));
    const walls = map.walls.filter(wall => blocksWalking(wall, wall.height ?? 2.8)).map(wall => footprint(wall, false));
    const boxes = [...props, ...walls];

    for (const [index, prop] of props.entries()) {
      for (const other of boxes.slice(index + 1)) {
        for (const axis of [0, 1]) {
          const spanAxis = 1 - axis;
          const [near, far] = prop.min[axis] < other.min[axis] ? [prop, other] : [other, prop];
          const start = near.max[axis], end = far.min[axis], width = end - start;
          if (width <= FLUSH + EPSILON || width >= WALKWAY_WIDTH.main - EPSILON) continue;
          let spanStart = Math.max(near.min[spanAxis], far.min[spanAxis]);
          const spanEnd = Math.min(near.max[spanAxis], far.max[spanAxis]);
          if (spanEnd - spanStart <= EPSILON) continue;

          const occluders = boxes.filter(box => box !== near && box !== far
            && box.max[axis] > start + EPSILON && box.min[axis] < end - EPSILON
            && box.max[spanAxis] > spanStart && box.min[spanAxis] < spanEnd)
            .sort((a, b) => a.min[spanAxis] - b.min[spanAxis]);
          const addGap = until => {
            if (until - spanStart <= EPSILON) return;
            const center = [], size = [];
            center[axis] = (start + end) / 2;
            center[spanAxis] = (spanStart + until) / 2;
            size[axis] = width;
            size[spanAxis] = until - spanStart;
            gaps.push({ center, size, width, elevation: y, belowLocalMinimum: width < WALKWAY_WIDTH.local - EPSILON,
              prop: prop.object, neighbor: other.object });
          };
          for (const box of occluders) {
            addGap(box.min[spanAxis]);
            spanStart = Math.max(spanStart, box.max[spanAxis]);
          }
          addGap(spanEnd);
        }
      }
    }
  }
  return gaps;
}
