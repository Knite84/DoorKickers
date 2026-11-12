import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { maps } from '../src/maps/index.js';
import { buildWallPieces } from '../src/destruction.js';
import { trimFor, trimKinds, trimSize } from '../src/trim.js';
import { doorCenter, doorSize } from '../src/world.js';
import { createMission } from '../src/simulation.js';
import { segmentClear } from '../src/combat.js';

const pieces = buildWallPieces(martelli);
const trim = trimFor(martelli, pieces);
const gap = (a, b) => Math.max(0, ...[0, 1, 2].map(i => Math.abs(a.center[i] - b.center[i]) - (a.size[i] + b.size[i]) / 2));

test('every trim box hangs on a real wall piece and sits against it', () => {
  assert.ok(trim.length > 500);
  for (const box of trim) {
    assert.ok(trimKinds.includes(box.kind), box.kind);
    const piece = pieces[box.piece];
    assert.ok(piece && !piece.floor && !piece.stair, `box ${box.kind} references piece ${box.piece}`);
    assert.ok(gap(box, piece) <= 0.05, `${box.kind} is ${gap(box, piece).toFixed(3)} m from its piece`);
  }
});

test('no trim box intrudes into a door opening or a window pane', () => {
  const windows = martelli.windows.map(w => ({ center: [w.position[0], (w.elevation ?? 0) + (w.sill ?? 0.8) + (w.height ?? 1.5) / 2, w.position[1]], size: [w.size[0], w.height ?? 1.5, w.size[1]] }));
  const clear = [...martelli.doors.map(d => ({ center: doorCenter(d), size: doorSize(d) })), ...windows];
  for (const box of trim) for (const opening of clear) {
    const overlap = [0, 1, 2].map(i => (box.size[i] + opening.size[i]) / 2 - Math.abs(box.center[i] - opening.center[i]));
    assert.ok(overlap.some(value => value <= 0.002), `${box.kind} at ${box.center.map(v => v.toFixed(2))} overlaps an opening`);
  }
});

test('trim is drawn-only: it adds nothing to props, walls or the mission', () => {
  const props = JSON.stringify(martelli.props), walls = JSON.stringify(martelli.walls);
  trimFor(martelli, buildWallPieces(martelli));
  assert.equal(JSON.stringify(martelli.props), props);
  assert.equal(JSON.stringify(martelli.walls), walls);
  const mission = createMission(martelli, { guardCount: 0, entryPoint: 'courtyard' });
  assert.equal(mission.wallPieces.length, pieces.length);
  assert.ok(!('trim' in mission));
  for (const box of trim) assert.ok(!martelli.props.some(p => p.kind === box.kind));
  // Fixed rays give the same answers after trim is computed: it never feeds the mission.
  const rays = [[[-6, 4.5, -6], [-6, 4.5, 6]], [[0, 4.5, 0], [10, 4.5, 0]], [[-3.4, 3.25, -7.2], [-3.4, 3.25, -6.9]]];
  const before = rays.map(([a, b]) => segmentClear(mission, martelli, a, b));
  trimFor(martelli, mission.wallPieces);
  assert.deepEqual(rays.map(([a, b]) => segmentClear(mission, martelli, a, b)), before);
});

test('trim is half-height at most and baseboards stay low', () => {
  for (const box of trim.filter(b => b.kind === 'baseboard')) {
    assert.ok(Math.abs(box.size[1] - trimSize.baseboardHeight) < 1e-9);
    assert.ok(Math.min(box.size[0], box.size[2]) <= trimSize.baseboardProud + 1e-9);
  }
});

test('every Martelli room with a floor finish gets at least one baseboard', () => {
  const baseboards = trim.filter(b => b.kind === 'baseboard');
  for (const room of martelli.rooms) {
    if (/UNEXCAVATED|REAR DECK|GARAGE|STORAGE|FRONT|PORCH|PATIO/i.test(room.name)) continue;
    const level = Math.round((room.elevation ?? 0) / 3.2), [cx, cz] = room.center, [w, d] = room.size;
    const near = baseboards.some(b => Math.round(b.center[1] / 3.2 - 0.02) === level
      && Math.abs(b.center[0] - cx) <= w / 2 + 0.3 && Math.abs(b.center[2] - cz) <= d / 2 + 0.3);
    assert.ok(near, `${room.name} has no baseboard`);
  }
});

test('rails and exterior faces get no baseboard, and other maps get no trim', () => {
  const rails = new Set(martelli.walls.flatMap((w, i) => w.height === 1 ? [i] : []));
  assert.ok(rails.size > 0);
  for (const box of trim) if (box.kind === 'baseboard') assert.ok(!rails.has(pieces[box.piece].wall));
  for (const [id, map] of Object.entries(maps)) if (map !== martelli) assert.deepEqual(trimFor(map, buildWallPieces(map)), [], id);
});
