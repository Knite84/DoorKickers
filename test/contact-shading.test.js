import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bakeContactField, contactDistance, contactGrid } from '../src/contact-shading.js';
import { buildWallPieces } from '../src/destruction.js';
import { martelli } from '../src/maps/martelli.js';

const room = {
  bounds: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 },
  walls: [{ center: [0, -2], size: [6, 0.14], elevation: 0, height: 2.8 }, { center: [0, 2], size: [6, 0.14], elevation: 0, height: 1 }],
  props: [],
};
const wallPiece = (wall, extra = {}) => ({ center: [0, 0.2, room.walls[wall].center[1]], size: [6, 0.4, 0.14], wall, hp: 1, ...extra });

test('distance to a wall grows away from its face and reaches the range in open floor', () => {
  const grid = contactGrid(room), bytes = bakeContactField(room, [wallPiece(0)], [], grid);
  assert.ok(contactDistance(bytes, grid, [0, -1.95]) < 0.05);
  const near = contactDistance(bytes, grid, [0, -1.6]), far = contactDistance(bytes, grid, [0, -1.0]);
  assert.ok(near > 0.2 && near < 0.45, `near ${near}`);
  assert.ok(far > near);
  assert.equal(contactDistance(bytes, grid, [0, 0.5]), 1);
});

test('furniture shades the floor but not the ceiling corner; low rails do not darken the ceiling', () => {
  const sofa = { kind: 'crate', position: [0, 0], size: [2, 0.9], height: 0.9 };
  const grid = contactGrid(room), bytes = bakeContactField(room, [wallPiece(1)], [sofa], grid);
  assert.ok(contactDistance(bytes, grid, [0, 0.55], 0, 0) < 0.15);
  assert.equal(contactDistance(bytes, grid, [0, 0.55], 0, 1), 1);
  // The 1 m rail counts for the floor corner only.
  assert.ok(contactDistance(bytes, grid, [0, 1.9], 0, 0) < 0.05);
  assert.ok(contactDistance(bytes, grid, [0, 1.9], 0, 1) >= 0.99);
});

test('destroyed pieces, stairs, slabs and flat decor leave no contact shading', () => {
  const grid = contactGrid(room);
  const slab = { center: [0, -0.075, 0], size: [6, 0.15, 6], wall: 0, hp: 1 };
  const rug = { kind: 'crate', position: [1, 1], size: [1, 1], height: 0.02 };
  const bytes = bakeContactField(room, [wallPiece(0, { hp: 0 }), wallPiece(0, { stair: true }), slab], [rug], grid);
  assert.ok(bytes.every(value => value === 255));
});

test('each Martelli floor bakes separately and the field follows the walls', () => {
  const pieces = buildWallPieces(martelli), grid = contactGrid(martelli);
  const start = performance.now();
  const bytes = bakeContactField(martelli, pieces, martelli.props, grid);
  const elapsed = performance.now() - start;
  assert.equal(bytes.length, grid.width * grid.depth * 2 * 2);
  // Main floor, against the kitchen/great-room return wall at plan x 452.
  const plan = (x, z) => [(x - 600) * 0.02, (z - 500) * 0.02];
  assert.ok(contactDistance(bytes, grid, plan(456, 210), 1, 1) < 0.15);
  // The middle of the dining table is a blocker on Main, not on Foundation.
  assert.equal(contactDistance(bytes, grid, plan(370, 240), 1, 0), 0);
  assert.ok(contactDistance(bytes, grid, plan(370, 240), 0, 0) > 0.3);
  assert.ok(elapsed < 1500, `bake took ${elapsed.toFixed(0)} ms`);
});
