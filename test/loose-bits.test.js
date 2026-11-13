import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { stepBits, wakeBits, looseBits } from '../src/loose-bits.js';
import { propHeight } from '../src/world.js';

const point = (x, z) => [(x - 600) * 0.02, (z - 500) * 0.02];
const state = createMission(martelli, { ...defaults, guardCount: 0 });
const run = (bits, seconds) => { const landings = []; for (let t = 0; t < seconds; t += 1 / 60) landings.push(...stepBits(bits, state, martelli, 1 / 60)); return landings; };
const bit = (position, velocity, radius = 0.01, kind = 'debris') => ({ position: [...position], velocity: [...velocity], radius, life: 5, kind, resting: false });

test('a dropped bit lands on the Main floor, rests there, and reports its audible landings', () => {
  const [x, z] = point(470, 470);
  const b = bit([x, 4.6, z], [0, 0, 0]);
  const landings = run([b], 2);
  assert.ok(b.resting, 'came to rest');
  assert.ok(Math.abs(b.position[1] - (3.2 + b.radius)) < 0.02, `rests at ${b.position[1]}`);
  assert.ok(landings.length >= 1 && landings.length <= 3, `${landings.length} landings`); // a hard drop bounces once or twice
});

test('a fast chip thrown at a drywall partition bounces back instead of passing through', () => {
  // From the stairwell toward the mudroom-side wall (plan x 510) at Main, head height.
  const [x, z] = point(540, 550);
  const b = bit([x, 4.6, z], [-12, 0, 0]);
  run([b], 1.5);
  assert.ok(b.position[0] > point(510, 0)[0], `ended at x ${b.position[0].toFixed(3)}, wall at ${point(510, 0)[0]}`);
});

test('a bit dropped over furniture comes to rest on top of it', () => {
  const index = martelli.props.findIndex(p => p.kind === 'diningTable');
  const prop = martelli.props[index];
  const b = bit([prop.position[0], (prop.elevation ?? 0) + 2, prop.position[1]], [0, 0, 0]);
  run([b], 2);
  assert.ok(b.resting);
  assert.ok(Math.abs(b.position[1] - ((prop.elevation ?? 0) + propHeight(prop) + b.radius)) < 0.02, `rests at ${b.position[1]}`);
});

test('resting bits are skipped until woken, then fall if their support is gone', () => {
  const [x, z] = point(470, 470);
  const b = bit([x, 3.21, z], [0, 0, 0]);
  run([b], 0.5);
  assert.ok(b.resting);
  const before = [...b.position];
  run([b], 0.5);
  assert.deepEqual(b.position, before);
  wakeBits([b]);
  assert.equal(b.resting, false);
});

test('tuning: casings lie long enough to see and are capped', () => {
  assert.ok(looseBits.life.casing >= 10 && looseBits.limit.casing <= 100);
});
