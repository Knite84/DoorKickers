import { test } from 'node:test';
import assert from 'node:assert/strict';
import { furnitureKinds, furnitureBoxes, furnitureHeight, isFurniture, isDrawnOnly, piece, sectional, footprint } from '../src/furniture.js';
import { propHeight } from '../src/world.js';
import { maps } from '../src/maps/index.js';

const facings = ['down', 'up', 'left', 'right'];
const every = () => Object.entries(furnitureKinds).flatMap(([kind, k]) => Object.keys(k.variants).flatMap(variant => facings.map(facing => ({ kind, variant, facing }))));

test('legacy table, crate and planter props are untouched by the kit', () => {
  for (const kind of ['table', 'crate', 'planter']) {
    const prop = { kind, position: [0, 0], size: [1, 1] };
    assert.equal(isFurniture(prop), false);
    assert.equal(propHeight(prop), 1.1);
  }
  assert.equal(propHeight({ kind: 'bed', height: 0.6, position: [0, 0], size: [1.6, 2] }), 0.6, 'an explicit height still wins');
});

test('every component draws inside its footprint in every facing', () => {
  for (const { kind, variant, facing } of every()) {
    const entry = piece(kind, variant, [3, -2], { facing, elevation: 3.2 });
    const boxes = furnitureBoxes(entry);
    assert.ok(boxes.length > 0, `${kind}/${variant} draws nothing`);
    for (const b of boxes) {
      for (const [axis, i] of [[0, 0], [2, 1]]) {
        const reach = Math.abs(b.center[axis] - entry.position[i]) + b.size[axis] / 2;
        assert.ok(reach <= entry.size[i] / 2 + 0.06, `${kind}/${variant} facing ${facing} pokes ${(reach - entry.size[i] / 2).toFixed(3)} m out`);
      }
      assert.ok(b.center[1] - b.size[1] / 2 >= 3.2 - 1e-9, `${kind}/${variant} draws below its floor`);
      assert.ok(b.size.every(s => s > 0), `${kind}/${variant} has an empty box`);
    }
  }
});

test('facing turns the footprint and keeps the back against the wall', () => {
  assert.deepEqual(footprint([1.5, 0.5], 'down'), [1.5, 0.5]);
  assert.deepEqual(footprint([1.5, 0.5], 'left'), [0.5, 1.5]);
  // The dresser's drawer pulls are on its front: +z facing down, -x facing left.
  const front = facing => {
    const entry = piece('dresser', 'low', [0, 0], { facing }), pulls = furnitureBoxes(entry).filter(b => b.color === 0xb08d57);
    return pulls.reduce((sum, b) => [sum[0] + b.center[0], sum[1] + b.center[2]], [0, 0]).map(v => Math.sign(Math.round(v * 100)) + 0);
  };
  assert.deepEqual(front('down'), [0, 1]);
  assert.deepEqual(front('up'), [0, -1]);
  assert.deepEqual(front('left'), [-1, 0]);
  assert.deepEqual(front('right'), [1, 0]);
});

test('kit pieces collide as one box at their variant height; decor never blocks', () => {
  assert.equal(propHeight(piece('bed', 'bunk', [0, 0])), 1.7);
  assert.equal(propHeight(piece('fridge', 'full', [0, 0])), 1.8);
  assert.equal(propHeight(piece('nightstand', 'lamp', [0, 0])), 0.65);
  for (const kind of ['rug', 'yogaMat', 'wallTV', 'mirror', 'ceilingFan']) {
    assert.equal(isDrawnOnly({ kind }), true);
    assert.equal(furnitureHeight(piece(kind, undefined, [0, 0])), 0);
  }
  assert.throws(() => piece('dresser', 'nope', [0, 0]));
  assert.throws(() => piece('dresser', 'low', [0, 0], { facing: 'north' }));
});

test('no map puts a drawn-only piece where it would collide', () => {
  for (const [id, map] of Object.entries(maps)) for (const prop of map.props) assert.equal(isDrawnOnly(prop), false, `${id} has a ${prop.kind} in props; move it to decor`);
});

test('L and U sectionals are two and three non-overlapping sofas inside the overall footprint', () => {
  for (const [shape, count, mirror] of [['L', 2, false], ['L', 2, true], ['U', 3, false]]) for (const facing of facings) {
    const parts = sectional(shape, [1, 1], { size: [3.4, 2.8], facing, mirror }), outer = footprint([3.4, 2.8], facing);
    assert.equal(parts.length, count);
    for (const p of parts) for (const i of [0, 1]) assert.ok(Math.abs(p.position[i] - 1) + p.size[i] / 2 <= outer[i] / 2 + 1e-9, `${shape} ${facing} part outside`);
    for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
      const overlap = [0, 1].every(i => Math.abs(parts[a].position[i] - parts[b].position[i]) < (parts[a].size[i] + parts[b].size[i]) / 2 - 1e-9);
      assert.equal(overlap, false, `${shape} ${facing} parts ${a} and ${b} overlap`);
    }
  }
});
