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
import { siteFor, siteKinds, rampHeight, triangleNormal, fenceFor, fenceKinds, fence } from '../src/site.js';
import { buildWallPieces } from '../src/destruction.js';
import { openTreadsFor } from '../src/stair-dress.js';

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

// --- 4.3 leftovers: fence, shrubs, curbs and open-tread deck stairs (all drawn only)
test('the iron fence follows the ground, has posts, rails and pickets, and leaves the driveway and walk open', () => {
  const boxes = fenceFor(martelli);
  for (const kind of ['post', 'rail', 'picket', 'curb']) assert.ok(boxes.some(box => box.kind === kind), kind);
  assert.ok(boxes.every(box => fenceKinds.includes(box.kind) && box.size.every(v => v > 0)));
  // pickets never float: each reaches down to the ground its fence stands on
  const west = boxes.filter(box => box.kind === 'picket' && Math.abs(box.center[0] - (-195 - 600) * 0.02) < 0.01);
  assert.ok(west.length > 100);
  assert.ok(Math.min(...west.map(box => box.center[1] - box.size[1] / 2)) < 0.15, 'reaches the lake grade');
  assert.ok(Math.max(...west.map(box => box.center[1] - box.size[1] / 2)) > 3, 'reaches the front grade');
  assert.ok(boxes.filter(box => box.kind === 'picket').every(box => box.size[1] <= fence.height + 0.1 + 0.06 + 1e-9));
  // no front-fence picket stands in the driveway (plan x 14 to 514) or on the walk (635 to 710)
  const frontZ = (1195 - 500) * 0.02;
  for (const box of boxes.filter(b => b.kind === 'picket' && Math.abs(b.center[2] - frontZ) < 0.01)) {
    const x = box.center[0] / 0.02 + 600;
    assert.ok(!(x > 14 && x < 514) && !(x > 635 && x < 710), 'gate gap at ' + x);
  }
});

test('fence, shrubs and curbs are drawn only: no collision, no wall pieces', () => {
  const plain = { ...martelli, fences: [], shrubs: [], curbs: [] };
  assert.equal(buildWallPieces(martelli).length, buildWallPieces(plain).length);
  assert.ok(martelli.shrubs.length > 10 && martelli.shrubs.every(shrub => shrub.radius > 0));
  for (const map of Object.values(maps)) if (map !== martelli) assert.deepEqual(fenceFor(map), []);
});

test('the deck stairs draw open treads over unchanged solid steps', () => {
  const open = martelli.stairs.filter(stair => stair.open);
  assert.equal(open.length, 2);
  const pieces = buildWallPieces(martelli), treads = openTreadsFor(martelli, pieces);
  assert.equal(treads.filter(t => t.kind === 'tread').length, 32);
  assert.equal(treads.filter(t => t.kind === 'stringer').length, 64);
  // The steps still collide (they are the same pieces as before) and are flagged so the scene skips them.
  assert.equal(pieces.filter(p => p.stair && p.open).length, 32);
  for (const tread of treads) assert.ok(pieces[tread.piece].open && pieces[tread.piece].stair);
  // Foot support is untouched: the flights still end at the deck and the patio.
  const state = createMission(martelli, defaults);
  for (const stair of open) {
    const middle = [(stair.from[0] + stair.to[0]) / 2, (stair.from[1] + stair.to[1]) / 2];
    assert.ok(Math.abs(stairHeight(martelli, middle) - (stair.bottom + stair.top) / 2) < 1e-9);
  }
  assert.ok(state.wallPieces.filter(p => p.open).every(p => p.hp === Infinity));
});
