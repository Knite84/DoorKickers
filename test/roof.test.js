import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { maps } from '../src/maps/index.js';
import { buildWallPieces } from '../src/destruction.js';
import { createMission } from '../src/simulation.js';
import { roofFor, roofKinds, ridgeHeight, wingOutline, triangleNormal } from '../src/roof.js';

const roof = martelli.roof, triangles = roofFor(martelli);
const covered = (x, z) => roof.wings.some(wing => {
  const [x1, z1, x2, z2] = wingOutline(roof, wing);
  return x >= x1 && x <= x2 && z >= z1 && z <= z2;
});

test('the roof covers every Main ceiling, with the eave beyond the walls', () => {
  const main = martelli.ceilings.filter(c => c.level === 1);
  assert.ok(main.length > 0);
  for (const { center: [x, z], size: [w, d] } of main) {
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      assert.ok(covered(x + u * (w / 2 + 0.3), z + v * (d / 2 + 0.3)), `uncovered near ${x.toFixed(2)}, ${z.toFixed(2)}`);
    }
  }
});

test('nothing of the roof dips below the Main wall tops', () => {
  const wallTop = Math.max(...martelli.walls.filter(w => w.level === 1).map(w => w.elevation + w.height));
  const lowest = Math.min(...triangles.flatMap(t => t.points.map(p => p[1])));
  assert.ok(lowest >= wallTop - 0.02, `roof reaches down to ${lowest}`);
  const highest = Math.max(...triangles.flatMap(t => t.points.map(p => p[1])));
  assert.ok(Math.abs(highest - Math.max(...roof.wings.map(w => ridgeHeight(roof, w)))) < 1e-9);
  assert.ok(highest < roof.eave + 3, 'ridges stay under 3 m above the eave');
});

test('slopes face up, fascia faces out, soffits face down', () => {
  assert.deepEqual([...new Set(triangles.map(t => t.kind))].sort(), [...roofKinds].sort());
  for (const t of triangles) {
    const [nx, ny, nz] = triangleNormal(t.points), length = Math.hypot(nx, ny, nz);
    assert.ok(length > 0, 'no degenerate triangles');
    if (t.kind === 'shingle') assert.ok(ny / length > 0.3, 'slope faces the sky');
    if (t.kind === 'soffit') assert.ok(ny / length < -0.99, 'soffit faces the ground');
    if (t.kind === 'fascia') {
      assert.ok(Math.abs(ny / length) < 1e-6, 'fascia is vertical');
      const [x1, z1, x2, z2] = wingOutline(roof, roof.wings[t.wing]), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const mid = t.points.reduce((s, p) => [s[0] + p[0] / 3, s[1] + p[2] / 3], [0, 0]);
      assert.ok(nx * (mid[0] - cx) + nz * (mid[1] - cz) > 0, 'fascia faces away from its wing');
    }
  }
});

test('the roof is drawn only: it never reaches walls, props or the mission', () => {
  const bare = { ...martelli, roof: undefined };
  assert.equal(buildWallPieces(martelli).length, buildWallPieces(bare).length);
  const state = createMission(martelli, { guardCount: 0 });
  assert.equal(state.roof, undefined);
  assert.equal(state.wallPieces.length, buildWallPieces(bare).length);
});

test('maps without a roof get none', () => {
  for (const [id, map] of Object.entries(maps)) if (!map.roof) assert.deepEqual(roofFor(map), [], id);
});
