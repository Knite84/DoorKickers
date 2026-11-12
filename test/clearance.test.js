import { test } from 'node:test';
import assert from 'node:assert/strict';
import { furnitureClearances } from '../src/clearance.js';
import { martelli } from '../src/maps/martelli.js';
import { navigationFor, reachableCells } from '../src/navigation.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { inside } from '../src/world.js';

test('clearance measures facing edges and removes spans covered by a third obstacle', () => {
  const prop = { position: [0, 0], size: [1, 2], height: 1 };
  const wall = { center: [1.2, 0], size: [0.4, 2] };
  const blocker = { center: [0.75, 0], size: [0.5, 1] };
  const flush = { center: [-0.8, 0], size: [0.4, 2] };
  const upstairs = { ...wall, elevation: 3.2 };
  const gaps = furnitureClearances({ props: [prop], walls: [wall, blocker, flush, upstairs] });
  assert.deepEqual(gaps.map(gap => [gap.center, gap.size, gap.belowLocalMinimum]), [
    [[0.75, -0.75], [0.5, 0.5], true],
    [[0.75, 0.75], [0.5, 0.5], true],
  ]);
});

test('clearance flags a gap of 80 cm for main routes and skips gaps at 90 cm', () => {
  const prop = { position: [0, 0], size: [1, 1], height: 1 };
  const walls = [
    { center: [1.5, 0], size: [0.4, 1] },
    { center: [-1.6, 0], size: [0.4, 1] },
  ];
  const gaps = furnitureClearances({ props: [prop], walls });
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].width, 0.8);
  assert.equal(gaps[0].belowLocalMinimum, false);
});

test('Martelli preserves reachable room centres and room space on the 35 cm radius walking grid', () => {
  const state = createMission(martelli, { ...defaults, guardCount: 0 });
  // Finer sampling resolves the 10 cm left in an 80 cm doorway.
  const graph = navigationFor(state, martelli, { radius: 0.35, cell: 0.1 });
  const { x0, z0, cell, width, plane, bases } = graph;
  const starts = [
    ...Object.values(martelli.entries),
    // The current 35 cm grid cannot descend from Main. Check Foundation
    // from the stair foot so further obstructions there are still detected.
    { position: [-1.25, -0.3], elevation: 0, foundationOnly: true },
  ];
  for (const start of starts) {
    const [x, z] = start.position;
    const source = bases.indexOf(start.elevation) * plane
      + Math.round((z - z0) / cell) * width + Math.round((x - x0) / cell);
    const seen = reachableCells(graph, source);
    assert.ok(seen[source], `blocked start at ${start.position}`);
    const rooms = martelli.rooms.filter(room => room.name !== 'UNEXCAVATED / BELOW GARAGE'
      && (!start.foundationOnly || room.elevation === 0));
    const reaches = (room, includes) => seen.some((reachable, id) => reachable
      && Math.abs(graph.heights[id] - room.elevation) < 0.1 && includes(graph.point(id)));
    const unreachable = rooms.filter(room => !reaches(room, point => inside(point, room.center, room.size)));
    const knownBlocked = start.foundationOnly
      ? rooms.filter(room => room.name === 'LOWER BATH')
      // Since step 4.3 the side-yard slopes and the deck stairs are outdoor routes
      // down to the walk-out level, so Foundation is reachable from the entries;
      // only the lower bath stays out of reach of this coarse grid, as from the stair foot.
      : rooms.filter(room => room.name === 'POWDER' || room.name === 'LOWER BATH'
        || room.name === 'CLOSET' && room.elevation > 0 && room.center[1] > 0);
    assert.deepEqual(unreachable, knownBlocked, `reachability changed from ${start.label ?? 'stair foot'}`);
    const centerTolerance = Math.SQRT2 * cell / 2 + 1e-8;
    const displaced = rooms.filter(room => !unreachable.includes(room) && !reaches(room,
      point => Math.hypot(point[0] - room.center[0], point[1] - room.center[1]) <= centerTolerance));
    assert.deepEqual(displaced.map(room => room.name), start.foundationOnly
      ? ['FAMILY ROOM', 'BEDROOM 5', 'BEDROOM 4', 'BATH', 'CLOSET']
      // Foundation rooms join the list from the entries now that they are reachable outdoors (step 4.3).
      : ['GREAT ROOM', 'DINING', 'KITCHEN', 'PRIMARY BEDROOM', 'LAUNDRY', 'CLOSET', 'BEDROOM 2', 'BEDROOM 3', 'SHARED BATH', 'REAR DECK',
        'FAMILY ROOM', 'BEDROOM 5', 'BEDROOM 4', 'BATH', 'CLOSET']);
  }
});
