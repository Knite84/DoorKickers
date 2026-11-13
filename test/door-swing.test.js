import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { doorFrame, openLeafBox, swingAngle, chooseSwing, leafClash, stepSwing, easeSwing, swing } from '../src/door-swing.js';

const state = createMission(martelli, { ...defaults, guardCount: 0 });
// A plain door along x and one along z, built by hand.
const doorX = { position: [0, 0], size: [0.9, 0.16], elevation: 0 }, doorZ = { position: [0, 0], size: [0.16, 0.9], elevation: 0 };

test('the open leaf lies across the doorway on the chosen side, hinged at the chosen end', () => {
  const leaf = openLeafBox(doorX, 1, 1);
  assert.ok(Math.abs(leaf.center[0] - (0.45 - swing.leaf / 2)) < 1e-9, 'at the +x end');
  assert.ok(Math.abs(leaf.center[2] - 0.45) < 1e-9, 'on the +z side');
  assert.ok(Math.abs(leaf.size[2] - 0.9) < 1e-9);
  const z = openLeafBox(doorZ, -1, -1);
  assert.ok(Math.abs(z.center[0] + 0.45) < 1e-9 && z.center[2] < 0);
});

test('the swing angle turns the leaf toward the chosen side for either hinge and axis', () => {
  // Rotate the leaf's direction from the hinge (toward the other end) and check it ends up on `side`.
  for (const door of [doorX, doorZ]) for (const hinge of [-1, 1]) for (const side of [-1, 1]) {
    const { alongX } = doorFrame(door), angle = swingAngle(door, hinge, side, Math.PI / 2);
    const [x, z] = alongX ? [-hinge, 0] : [0, -hinge];
    // Three.js rotation about y: x' = x cos + z sin, z' = -x sin + z cos.
    const rx = x * Math.cos(angle) + z * Math.sin(angle), rz = -x * Math.sin(angle) + z * Math.cos(angle);
    const across = alongX ? rz : rx;
    assert.ok(Math.abs(across - side) < 1e-9, `${alongX ? 'x' : 'z'} hinge ${hinge} side ${side}: ${across}`);
  }
});

test('a door swings away from whoever opens it', () => {
  const door = martelli.doors[0], { alongX } = doorFrame(door);
  const near = alongX ? [door.position[0], door.position[1] - 1] : [door.position[0] - 1, door.position[1]];
  const far = alongX ? [door.position[0], door.position[1] + 1] : [door.position[0] + 1, door.position[1]];
  assert.equal(chooseSwing(state, martelli, door, near).side, 1);
  assert.equal(chooseSwing(state, martelli, door, far).side, -1);
});

test('the chosen hinge clashes no more than the other one, and most Martelli doors open clear on some hinge and side', () => {
  let clear = 0;
  for (const door of martelli.doors) {
    for (const side of [-1, 1]) {
      const pick = chooseSwing(state, martelli, { ...door, swing: side }, null);
      assert.ok(leafClash(state, martelli, door, pick.hinge, side) <= leafClash(state, martelli, door, -pick.hinge, side) + 1e-12);
    }
    if ([-1, 1].some(h => [-1, 1].some(s => leafClash(state, martelli, door, h, s) < 1e-4))) clear++;
  }
  assert.ok(clear >= martelli.doors.length * 0.8, `${clear} of ${martelli.doors.length} doors have a clear swing`);
});

test('the swing reaches open in the swing time and eases', () => {
  let t = 0, frames = 0;
  while (t < 1 && frames < 200) { t = stepSwing(t, true, 1 / 60); frames++; }
  assert.ok(Math.abs(frames / 60 - swing.time) < 2 / 60);
  assert.equal(easeSwing(0), 0); assert.equal(easeSwing(1), 1); assert.ok(easeSwing(0.5) > 0.5);
});
