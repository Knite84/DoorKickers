import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { lodge } from '../src/maps/lodge.js';
import { buildWallPieces, rayBox } from '../src/destruction.js';
import { piecesAlong, piecesInArea } from '../src/spatial.js';

// A fixed pseudo-random stream keeps the comparison repeatable.
function stream(seed) { return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296; }

for (const [name, map] of [['Martelli', martelli], ['Lodge', lodge]]) {
  test(`${name}: the nearby-piece lookup never misses a piece a full scan would hit`, () => {
    const pieces = buildWallPieces(map), random = stream(7), { minX, maxX, minZ, maxZ } = map.bounds;
    const spot = () => [minX + random() * (maxX - minX), random() * 6.4, minZ + random() * (maxZ - minZ)];
    for (let n = 0; n < 400; n++) {
      const a = spot(), b = n % 5 ? spot() : [a[0], a[1] + 3, a[2] + (n % 10 ? 0 : 4)];
      const length = Math.hypot(...b.map((v, i) => v - a[i])), direction = b.map((v, i) => (v - a[i]) / length);
      const near = new Set(piecesAlong(pieces, a, b));
      for (const piece of pieces) if (rayBox(a, direction, piece.center, piece.size, length) !== null) assert.ok(near.has(piece), `segment ${a} -> ${b} missed piece ${piece.id}`);
      const reach = 0.1 + random() * 2, area = new Set(piecesInArea(pieces, a[0] - reach, a[0] + reach, a[2] - reach, a[2] + reach));
      for (const piece of pieces) {
        if (Math.abs(piece.center[0] - a[0]) <= piece.size[0] / 2 + reach && Math.abs(piece.center[2] - a[2]) <= piece.size[2] / 2 + reach) assert.ok(area.has(piece), `area at ${a} missed piece ${piece.id}`);
      }
    }
  });
}
