import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWallPieces, damageWall, removeUnsupportedPieces } from '../src/destruction.js';
import { courtyard } from '../src/maps/courtyard.js';

function piece(center, size = [1, 1, 1], hp = 4) {
  return { wall: 0, material: 'timber', center, size, hp, maxHp: hp };
}
test('breaking a supporting piece removes the intact floating piece above it immediately', () => {
  const pieces = [piece([0, 0.5, 0]), piece([0, 1.5, 0]), piece([0, 2.5, 0])];
  assert.deepEqual(removeUnsupportedPieces(pieces), []);
  const removed = damageWall(pieces, pieces[1], 4);
  assert.equal(pieces[0].hp, 4); assert.equal(pieces[1].hp, 0); assert.equal(pieces[2].hp, 0);
  assert.ok(removed.includes(pieces[2]));
});
test('entire floating clusters disappear even if their pieces are attached to one another', () => {
  const pieces = [piece([4, 0.5, 0]), piece([0, 2.5, 0]), piece([1, 2.5, 0])];
  assert.equal(removeUnsupportedPieces(pieces).length, 2);
  assert.equal(pieces[0].hp, 4); assert.equal(pieces[1].hp, 0); assert.equal(pieces[2].hp, 0);
});
test('a corner touching another piece is not enough support', () => {
  const pieces = [piece([0, 0.5, 0]), piece([1, 1.5, 0])];
  removeUnsupportedPieces(pieces);
  assert.equal(pieces[0].hp, 4); assert.equal(pieces[1].hp, 0);
});
test('top and side attachments to solid structure preserve supported pieces', () => {
  const pieces = [piece([0, 3.5, 0], [5, 1, 1], Infinity), piece([0, 2.5, 0]), piece([1, 2.5, 0])];
  assert.deepEqual(removeUnsupportedPieces(pieces), []);
  // A later damage pass reuses the graph but no longer treats removed pieces as support.
  pieces[0].hp = 0;
  assert.equal(removeUnsupportedPieces(pieces).length, 2);
});
test('the initial house skins and framing are all connected to floor or masonry', () => {
  const pieces = buildWallPieces(courtyard);
  assert.deepEqual(removeUnsupportedPieces(pieces), []);
});
