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

test('plain passages are recorded apart from doors and get drywall returns, never casings', () => {
  assert.equal(martelli.passages.length, 6);
  for (const passage of martelli.passages) {
    assert.ok(!martelli.doors.some(door => door.position[0] === passage.position[0] && door.position[1] === passage.position[1]), 'a passage is not a door');
  }
  // Free wall ends get returns too (see the next test); this counts the passage ones.
  const returns = trim.filter(box => box.kind === 'return' && !box.freeEnd);
  assert.equal(returns.length, 6 * 2 * 7, 'two ends, seven wall rows, per passage');
  for (const box of returns) assert.ok(pieces[box.piece], 'hangs on a real piece');
  // No return stands in the clear opening of a passage.
  for (const passage of martelli.passages) {
    const horizontal = passage.size[0] > passage.size[1], along = horizontal ? 0 : 2, across = 2 - along;
    const clear = passage.size[horizontal ? 0 : 1], bottom = passage.elevation ?? 0;
    for (const box of returns) {
      const inside = Math.abs(box.center[along] - passage.position[horizontal ? 0 : 1]) < clear / 2 - trimSize.frameLining - 0.001
        && Math.abs(box.center[across] - passage.position[horizontal ? 1 : 0]) < 0.12 && box.center[1] > bottom && box.center[1] < bottom + passage.height;
      assert.ok(!inside, 'a return stands inside a clear passage');
    }
  }
  const without = trimFor({ ...martelli, passages: [] }, pieces);
  // Without passages their wall ends count as free ends instead, so compare the rest of the trim.
  const rest = boxes => boxes.filter(box => !box.freeEnd).length;
  assert.equal(rest(trim) - rest(without), returns.length, 'passages add returns and nothing else');
  for (const map of Object.values(maps)) if (map !== martelli) assert.equal(trimFor(map, buildWallPieces(map)).filter(box => box.kind === 'return').length, 0);
});

test('interior wall ends that stop in open space get drywall returns; ends at walls, doors, windows and passages do not', () => {
  const free = trim.filter(box => box.freeEnd);
  const walls = new Set(free.map(box => pieces[box.piece].wall));
  // The stair divider (plan x 565, both ends open) is one of them.
  const divider = martelli.walls.findIndex(w => w.axis === 'z' && Math.abs(w.center[0] - (565 - 600) * 0.02) < 0.01 && (w.elevation ?? 0) === 0);
  assert.ok(walls.has(divider), 'the stair divider ends are covered');
  for (const index of walls) assert.ok(martelli.walls[index].destructible && martelli.walls[index].height !== 1);
  // Door headers end against the walls beside the door, so none of them is free.
  for (const index of walls) assert.ok(martelli.walls[index].height > 1, 'no header strip counts as a free end');
  // Stubs, the stair divider, and corners where one wall overshoots or meets a taller one.
  assert.ok(walls.size <= 40, `${walls.size} walls with free ends`);
});

test('no raw timber end is left showing anywhere in Martelli', async () => {
  const { railWalls } = await import('../src/stair-dress.js');
  const rails = railWalls(martelli);
  const inside = (b, p) => [0, 1, 2].every(i => Math.abs(p[i] - b.center[i]) <= b.size[i] / 2 + 0.002);
  const box3 = w => ({ center: [w.center[0], (w.elevation ?? 0) + (w.height ?? 2.8) / 2, w.center[1]], size: [w.size[0], w.height ?? 2.8, w.size[1]] });
  const wallBoxes = martelli.walls.map(box3), doorBoxes = martelli.doors.map(d => box3({ ...d, center: d.position }));
  const covers = [...pieces.filter(p => !rails.has(p.wall)), ...trim];
  const exposed = [];
  for (const piece of pieces) {
    if (piece.material !== 'timber' || piece.floor || rails.has(piece.wall)) continue;
    for (const axis of [0, 2]) for (const side of [-1, 1]) for (const slide of [-0.4, 0, 0.4]) {
      // Three points across the face, so a sliver past a corner is caught too.
      const p = [...piece.center], other = 2 - axis; p[axis] += side * (piece.size[axis] / 2 + 0.006); p[other] += slide * piece.size[other];
      // Faces into a wall cavity or a door's frame lining are not seen.
      if (wallBoxes.some(b => inside(b, p)) || doorBoxes.some(b => inside(b, p))) continue;
      if (!covers.some(b => b !== piece && inside(b, p))) exposed.push(`wall ${piece.wall} at plan ${Math.round(p[0] / 0.02 + 600)},${Math.round(p[2] / 0.02 + 500)}`);
    }
  }
  assert.deepEqual([...new Set(exposed)], []);
});
