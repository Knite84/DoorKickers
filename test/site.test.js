import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { maps } from '../src/maps/index.js';
import { createMission } from '../src/simulation.js';
import { defaults } from '../src/rules.js';
import { stairHeight, supportHeight } from '../src/world.js';
import { segmentClear } from '../src/combat.js';
import { detonateCharges } from '../src/equipment.js';
import { navigationFor, reachableCells } from '../src/navigation.js';
import { siteFor, siteKinds, rampHeight, triangleNormal } from '../src/site.js';

// Plan pixels as in src/maps/martelli.js.
const point = (x, z) => [(x - 600) * 0.02, (z - 500) * 0.02];
const state = createMission(martelli, { ...defaults, guardCount: 0 });

test('both side yards slope from the front grade down to the lake grade', () => {
  for (const x of [-100, 1350]) {
    assert.ok(Math.abs(stairHeight(martelli, point(x, 45))) < 0.05, `lake end at ${x}`);
    const top = x < 600 ? 470 : 640;
    assert.ok(Math.abs(stairHeight(martelli, point(x, top)) - 3.2) < 0.05, `front end at ${x}`);
    // Past the top the front-grade earth carries on at the same height.
    assert.ok(Math.abs(supportHeight(state, martelli, point(x, top + 30), 3.3) - 3.2) < 0.01, `front grade beyond ${x}`);
  }
});

test('a level strip at Main grade runs along each side wall', () => {
  for (const [x, z] of [[200, 195], [200, 270], [1180, 300], [1240, 600]]) {
    assert.equal(stairHeight(martelli, point(x, z)), null, `no ramp at ${x}, ${z}`);
    assert.ok(Math.abs(supportHeight(state, martelli, point(x, z), 3.3) - 3.2) < 0.01, `strip at ${x}, ${z}`);
  }
});

test('the earth under a slope stops shots and sight', () => {
  // Low across the west slope, from the lake lawn toward the garage end.
  assert.equal(segmentClear(state, martelli, [point(-100, 20)[0], 0.6, point(-100, 20)[1]], [point(-100, 450)[0], 0.6, point(-100, 450)[1]]), false);
});

test('slopes and deck stairs join the front yard to the lake lawn for guards', () => {
  const graph = navigationFor(state, martelli);
  const id = ([x, z], y) => graph.bases.indexOf(y) * graph.plane + Math.round((z - graph.z0) / graph.cell) * graph.width + Math.round((x - graph.x0) / graph.cell);
  const lake = reachableCells(graph, id(point(600, -60), 0));
  for (const [where, y] of [[point(-100, 600), 3.2], [point(1350, 800), 3.2], [point(478, 145), 3.2]]) {
    assert.ok(lake[id(where, y)], `lake lawn reaches ${where} at ${y}`);
  }
});

test('the deck stairs drop to a mid landing and on to the patio', () => {
  assert.ok(Math.abs(stairHeight(martelli, point(695, 8)) - 3.2) < 0.1);
  assert.ok(Math.abs(supportHeight(state, martelli, point(670, -115), 1.7) - 1.6) < 0.01, 'landing');
  assert.ok(stairHeight(martelli, point(645, 8)) < 0.1, 'foot of the lower flight');
});

test('tree trunks are cover: they stop shots, stand on the ground and survive det cord', () => {
  assert.ok(martelli.trees.length >= 3);
  for (const tree of martelli.trees) {
    const ground = stairHeight(martelli, tree.position) ?? 3.2;
    assert.ok(Math.abs(tree.base - ground) < 0.05, 'trunk base on the ground');
    const y = tree.base + 1.2, [x, z] = tree.position;
    assert.equal(segmentClear(state, martelli, [x - 1.5, y, z], [x + 1.5, y, z]), false, 'trunk blocks a shot');
  }
  const blasted = createMission(martelli, { ...defaults, guardCount: 0 });
  blasted.status = 'active';
  const trunks = blasted.wallPieces.filter(p => p.tree);
  assert.equal(trunks.length, martelli.trees.length);
  blasted.devices.push({ type: 'detcord', position: [...trunks[0].center], wall: trunks[0].wall });
  detonateCharges(blasted, martelli, { ...defaults, destructibleWalls: true });
  assert.ok(trunks.every(p => p.hp === Infinity), 'det cord leaves trunks standing');
});

test('retaining walls hold the higher grade and site geometry faces outward', () => {
  for (const wall of martelli.retainingWalls) wall.top.forEach((top, i) => assert.ok(top >= wall.bottom[i] - 1e-9));
  const triangles = siteFor(martelli);
  assert.deepEqual([...new Set(triangles.map(t => t.kind))].sort(), [...siteKinds].sort());
  for (const t of triangles) assert.ok(Math.hypot(...triangleNormal(t.points)) > 0, 'no degenerate triangles');
  for (const slope of martelli.slopes) assert.equal(rampHeight(slope, slope.from), slope.bottom);
});

test('maps without site dressing get none', () => {
  for (const [id, map] of Object.entries(maps)) if (map !== martelli) assert.deepEqual(siteFor(map), [], id);
});
