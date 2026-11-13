import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { maps } from '../src/maps/index.js';
import { buildWallPieces } from '../src/destruction.js';
import { stairDressFor, railWalls, dressKinds } from '../src/stair-dress.js';
import { furnitureBoxes, furnitureHeight } from '../src/furniture.js';

const pieces = buildWallPieces(martelli), dress = stairDressFor(martelli, pieces);

// Three stair guard rails, plus three deck rails since step 4.3.
test('the stair and deck guard rails get newels, a handrail and balusters', () => {
  assert.equal(railWalls(martelli).size, 6);
  for (const kind of ['handrail', 'newel', 'baluster']) assert.ok(dress.filter(d => d.kind === kind).length >= 3, kind);
  for (const box of dress) {
    assert.ok(dressKinds.includes(box.kind));
    const piece = pieces[box.piece];
    assert.ok(piece, 'hangs on a real piece');
    // Carpet and open treads hang on stair steps; everything else hangs on a rail.
    // Step handrails (deck and garage steps) hang on the steps themselves.
    if (!['carpet', 'tread', 'stringer'].includes(box.kind) && !box.stepRail) assert.ok(railWalls(martelli).has(piece.wall), `${box.kind} hangs on a rail piece`);
  }
});

test('balusters are spaced under 0.12 m clear apart and never overlap newels', () => {
  const balusters = dress.filter(d => d.kind === 'baluster'), newels = dress.filter(d => d.kind === 'newel');
  for (const b of balusters) for (const n of newels) {
    const overlap = [0, 2].every(i => Math.abs(b.center[i] - n.center[i]) < (b.size[i] + n.size[i]) / 2);
    assert.ok(!overlap, 'baluster inside a newel');
  }
});

test('the lower flight is carpeted tread by tread, and the upper flight is not', () => {
  const carpet = dress.filter(d => d.kind === 'carpet');
  assert.equal(carpet.length, 16);
  for (const box of carpet) { assert.ok(pieces[box.piece].stair); assert.ok(box.center[1] <= 1.62); }
});

test('dressing is drawn-only: collision walls are unchanged and other maps get none', () => {
  assert.equal(martelli.walls.filter(w => w.height === 1).length, 6);
  for (const [id, map] of Object.entries(maps)) if (map !== martelli) assert.deepEqual(stairDressFor(map, buildWallPieces(map)), [], id);
});

test('fireplaces keep their collision height and gain mantel, hearth and firebox detail', () => {
  for (const variant of ['corner', 'wall']) {
    const entry = { kind: 'fireplace', variant, position: [0, 0], size: variant === 'corner' ? [1.2, 1] : [1.5, 0.6], facing: 'down', elevation: 0 };
    assert.equal(furnitureHeight(entry), 2.35);
    assert.ok(furnitureBoxes(entry).length >= 12, variant);
  }
});

test('Martelli draws brick arch headers over the wet-bar and alcove openings without blocking', () => {
  const arches = martelli.decor.filter(d => d.kind === 'arch');
  assert.equal(arches.length, 2);
  assert.ok(!martelli.props.some(p => p.kind === 'arch'));
});

test('deck stairs and garage steps get handrails on their open sides only, sloped with the flight', async () => {
  const { stepRailsFor } = await import('../src/stair-dress.js');
  const { martelli: map } = await import('../src/maps/martelli.js');
  const { buildWallPieces } = await import('../src/destruction.js');
  const pieces = buildWallPieces(map), rails = stepRailsFor(map, pieces);
  assert.ok(rails.length > 0);
  for (const box of rails) assert.ok(pieces[box.piece]?.stair, 'hangs on a step, hides with it');
  const sloped = rails.filter(box => box.rotation);
  assert.ok(sloped.length >= 4 && sloped.every(box => box.rotation.some(v => Math.abs(v) > 0.2)));
  // The mudroom garage steps (plan x 480) run beside the stairwell wall: a rail on the open side only.
  const mudroom = rails.filter(box => Math.abs(box.center[2] - (650 - 500) * 0.02) < 0.9 && Math.abs(box.center[0] - (480 - 600) * 0.02) < 0.6);
  assert.ok(mudroom.length > 0 && mudroom.every(box => box.center[0] < (480 - 600) * 0.02), 'only the side away from the wall');
});
