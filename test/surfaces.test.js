import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { maps } from '../src/maps/index.js';
import { buildWallPieces } from '../src/destruction.js';
import { surfaceKinds, surfaceAt, paintAt, exteriorFaces, skinPaint, roomAt } from '../src/surface-plan.js';

const point = (x, z) => [(x - 600) * 0.02, (z - 500) * 0.02];
const kindAt = (x, z, level) => surfaceAt(martelli, ...point(x, z), level)?.kind;

test('only maps that declare finishes get them, and every finish is a known kind on a real floor', () => {
  for (const [id, map] of Object.entries(maps)) if (map !== martelli) assert.equal(map.surfaces, undefined, `${id} would change look`);
  const floors = martelli.levels.map(l => l.elevation);
  for (const s of martelli.surfaces) {
    assert.ok(surfaceKinds.includes(s.kind) && s.kind !== 'none', s.kind);
    assert.ok(floors.includes(s.elevation), `${s.kind} at elevation ${s.elevation}`);
    assert.ok(s.rect[0] < s.rect[2] && s.rect[1] < s.rect[3], `${s.kind} rect is inverted`);
  }
});

test('Martelli rooms get the finishes from the photos', () => {
  const expect = [
    [585, 330, 1, 'bamboo'], [350, 400, 1, 'bamboo'], [670, 550, 1, 'bamboo'], [850, 200, 1, 'carpet'], [1050, 230, 1, 'woodTile'],
    [876, 390, 1, 'greyTile'], [960, 650, 1, 'stoneTile'], [1100, 550, 1, 'carpet'], [585, 100, 1, 'deckBoards'],
    [500, 330, 0, 'carpet'], [340, 440, 0, 'plankTile'], [850, 650, 0, 'vinyl'], [1150, 590, 0, 'concrete'], [1090, 430, 0, 'stoneTile'],
  ];
  for (const [x, z, level, kind] of expect) assert.equal(kindAt(x, z, level), kind, `${x},${z} on level ${level}`);
  assert.equal(surfaceAt(martelli, ...point(585, 100), 1).outdoor, true);
});

test('every Martelli room with a floor has a finish under its centre', () => {
  for (const room of martelli.rooms) {
    if (/UNEXCAVATED|REAR DECK/.test(room.name)) continue;
    const level = Math.round((room.elevation ?? 0) / 3.2);
    assert.ok(surfaceAt(martelli, ...room.center, level), `${room.name} has no floor finish`);
  }
});

test('exterior walls show siding outward and room paint inward; accent walls take their zone colour', () => {
  const pieces = buildWallPieces(martelli).filter(p => p.material === 'masonry' && !p.floor);
  const near = (x, z, level) => pieces.filter(p => p.level === level).sort((a, b) => Math.hypot(a.center[0] - x, a.center[2] - z) - Math.hypot(b.center[0] - x, b.center[2] - z))[0];
  // Great room's lake wall faces the deck (plan-up, -z).
  const lake = exteriorFaces(martelli, near(...point(650, 198), 1));
  assert.deepEqual([lake.outward, lake.all], [[0, -1], false]);
  assert.equal(lake.paint, martelli.paint.default);
  // Bedroom 2's west wall is the yellow accent; Bedroom 3's east wall the blue one.
  const west = exteriorFaces(martelli, near(...point(740, 680), 1));
  assert.deepEqual([west.outward, west.paint], [[-1, 0], 0xe2c94f]);
  const east = exteriorFaces(martelli, near(...point(1188, 550), 1));
  assert.deepEqual([east.outward, east.paint], [[1, 0], 0x2e8ed0]);
});

test('interior wall skins are painted for the room they face', () => {
  const skins = buildWallPieces(martelli).filter(p => p.material === 'drywall' && p.level === 1);
  // The primary bedroom / bath wall: the bedroom face is charcoal-teal, the bath face tan.
  const [x] = point(965, 0), [, z] = point(0, 220);
  const faces = skins.filter(p => Math.abs(p.center[0] - x) < 0.2 && Math.abs(p.center[2] - z) < 0.3);
  const colors = new Set(faces.map(p => skinPaint(martelli, p)));
  assert.ok(colors.has(martelli.paint['PRIMARY BEDROOM']) && colors.has(martelli.paint['PRIMARY BATH']), [...colors].map(c => c?.toString(16)).join(','));
  assert.equal(roomAt(martelli, ...point(340, 440), 0).name, 'BAR');
  assert.equal(paintAt(martelli, ...point(960, 550), 1), martelli.paint.default, 'vanity alcove stays cream');
});

test('Bedroom 3 accent blue stays on its own wall and stops at the corners', () => {
  const pieces = buildWallPieces(martelli), blue = 0x2e8ed0;
  const onMain = pieces.filter(p => p.material === 'masonry' && p.level === 1 && !p.floor);
  // The accent wall: plan x 1188 between z 455 and 646.
  const accent = onMain.filter(p => Math.abs(p.center[0] - point(1188, 0)[0]) < 0.05 && p.center[2] > point(0, 470)[1] && p.center[2] < point(0, 630)[1]);
  assert.ok(accent.length > 0);
  for (const p of accent) assert.equal(exteriorFaces(martelli, p).paint, blue);
  // The side walls' last metre beside that corner keeps the room grey.
  const sides = onMain.filter(p => p.center[0] > point(1160, 0)[0] && p.center[0] < point(1185, 0)[0]
    && [452, 646].some(z => Math.abs(p.center[2] - point(0, z)[1]) < 0.05));
  assert.ok(sides.length > 0);
  for (const p of sides) assert.equal(exteriorFaces(martelli, p).paint, martelli.paint['BEDROOM 3']);
});
