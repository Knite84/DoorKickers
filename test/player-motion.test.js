import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { martelli } from '../src/maps/martelli.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission } from '../src/simulation.js';
import { createMotion, shapeInput, observeMotion, motion } from '../src/player-motion.js';
import { surfaceAt } from '../src/surface-plan.js';
import { defaultSettings, validateSettings } from '../src/settings.js';

const DT = 1 / 60;
const forward = { x: 0, z: -1 };

test('holding a key reaches full speed in about the acceleration time, and releasing stops in about the deceleration time', () => {
  const m = createMotion();
  let frames = 0;
  while (frames < 100 && shapeInput(m, forward, DT).pace < 1) frames++;
  assert.ok(Math.abs(frames * DT - motion.accelTime) < 2 * DT, `reached full speed after ${frames} frames`);
  frames = 0;
  while (frames < 100 && shapeInput(m, { x: 0, z: 0 }, DT).pace > 0) frames++;
  assert.ok(Math.abs(frames * DT - motion.decelTime) < 2 * DT, `stopped after ${frames} frames`);
});

test('while slowing down the direction is kept, so you glide on rather than turning', () => {
  const m = createMotion();
  for (let i = 0; i < 20; i++) shapeInput(m, { x: 1, z: 0 }, DT);
  const slowing = shapeInput(m, { x: 0, z: 0 }, DT);
  assert.ok(slowing.pace > 0 && slowing.pace < 1);
  assert.ok(Math.abs(slowing.x - 1) < 1e-9 && Math.abs(slowing.z) < 1e-9);
});

test('reversing slows through a stop; turning a corner keeps most of the speed', () => {
  const m = createMotion();
  for (let i = 0; i < 20; i++) shapeInput(m, { x: 1, z: 0 }, DT);
  let slowest = 1;
  for (let i = 0; i < 30; i++) slowest = Math.min(slowest, shapeInput(m, { x: -1, z: 0 }, DT).pace);
  assert.ok(slowest < 0.2, 'passes close to a stop when reversing');
  const turn = createMotion();
  for (let i = 0; i < 20; i++) shapeInput(turn, { x: 1, z: 0 }, DT);
  const turned = shapeInput(turn, { x: 0, z: 1 }, DT);
  assert.ok(turned.pace > 0.6);
});

test('with smoothing off the input is instant, and a frozen player has none', () => {
  const m = createMotion();
  assert.equal(shapeInput(m, forward, DT, { smoothing: false }).pace, 1);
  assert.equal(shapeInput(m, { x: 0, z: 0 }, DT, { smoothing: false }).pace, 0);
  for (let i = 0; i < 20; i++) shapeInput(m, forward, DT);
  assert.deepEqual(shapeInput(m, forward, DT, { frozen: true }), { x: 0, z: 0, pace: 0 });
});

test('the simulation scales speed by input.pace and is unchanged without it', () => {
  const rules = { ...defaults, guardCount: 0 }, map = { ...courtyard, walls: [], doors: [], props: [], windows: [] };
  const run = pace => {
    const state = createMission(map, rules); state.status = 'active'; state.player = [0, 0];
    for (let i = 0; i < 30; i++) stepMission(state, map, rules, DT, { x: 1, z: 0, ...(pace === undefined ? {} : { pace }) });
    return state.player[0];
  };
  assert.ok(Math.abs(run(0.5) - run() / 2) < 1e-9);
  assert.ok(Math.abs(run(1) - run()) < 1e-12);
  assert.ok(run() > 1.5);
});

// A fake state, enough for observeMotion.
const fake = (extra = {}) => ({ player: [0, 0], playerY: 0, velocityY: 0, playerCover: null, ...extra });
function walkMetres(m, state, map, metres, gait = 'walk', options = {}) {
  const events = [], views = [];
  m.vx = 1; m.vz = 0; m.pace = 1;
  const speed = 3.5, steps = Math.round(metres / (speed * DT));
  for (let i = 0; i < steps; i++) {
    const before = [...state.player]; state.player[0] += speed * DT;
    const result = observeMotion(m, state, map, before, gait, speed, DT, options);
    events.push(...result.events); views.push(result.view);
  }
  return { events, views };
}

test('footsteps come once per stride, alternate feet, and name the floor', () => {
  const m = createMotion(), state = fake();
  const { events } = walkMetres(m, state, courtyard, 9.7);
  assert.equal(events.length, Math.floor(9.7 / motion.stride.walk));
  assert.ok(events.every(event => event.type === 'footstep' && event.gait === 'walk'));
  assert.ok(events.every((event, i) => i === 0 || event.foot === -events[i - 1].foot), 'feet alternate');
  // The same distance running takes fewer, creeping more.
  assert.ok(walkMetres(createMotion(), fake(), courtyard, 9.7, 'run').events.length < events.length);
  assert.ok(walkMetres(createMotion(), fake(), courtyard, 9.7, 'creep').events.length > events.length);
});

test('footsteps use the room finish under the player, or stairs, or a plain floor', () => {
  const px = (850 - 600) * 0.02, pz = (200 - 500) * 0.02;
  const finish = surfaceAt(martelli, px, pz, 1);
  assert.ok(finish, 'the primary bedroom has a finish');
  const { events } = walkMetres(createMotion(), fake({ player: [px - 3, pz], playerY: 3.2 }), martelli, 6);
  assert.ok(events.length > 0);
  assert.ok(events.every(event => ['stairs', 'floor', 'outdoor', finish.kind].includes(event.surface)));
  assert.ok(events.some(event => event.surface === finish.kind), 'the bedroom finish is heard');
  assert.equal(walkMetres(createMotion(), fake(), courtyard, 4).events[0].surface, 'floor');
});

test('no footsteps standing still, in the air or in cover', () => {
  const still = observeMotion(createMotion(), fake(), courtyard, [0, 0], 'walk', 3.5, DT);
  assert.deepEqual(still.events, []);
  assert.equal(walkMetres(createMotion(), fake({ velocityY: -2 }), courtyard, 8).events.length, 0);
  assert.equal(walkMetres(createMotion(), fake({ playerCover: { peeking: false } }), courtyard, 8).events.length, 0);
});

test('a wall stops the speed, and a slide along it keeps part of it', () => {
  const m = createMotion(); m.vx = 1; m.vz = 0; m.pace = 1;
  observeMotion(m, fake(), courtyard, [0, 0], 'walk', 3.5, DT);   // wanted to move, did not
  assert.equal(m.vx, 0);
  const slide = createMotion(); slide.vx = 0.7; slide.vz = 0.7; slide.pace = 1;
  observeMotion(slide, fake({ player: [0, 3.5 * DT * 0.7] }), courtyard, [0, 0], 'walk', 3.5, DT);
  assert.ok(slide.vx + slide.vz > 0 && slide.vx + slide.vz < 1.4);
});

test('bob is zero when stationary, grows with gait, and the setting scales it', () => {
  const stationary = observeMotion(createMotion(), fake(), courtyard, [0, 0], 'walk', 3.5, DT).view;
  assert.equal(Math.abs(stationary.up) + Math.abs(stationary.side) + Math.abs(stationary.roll) + Math.abs(stationary.weapon), 0);
  const depth = (gait, options) => Math.max(...walkMetres(createMotion(), fake(), courtyard, 6, gait, options).views.map(view => -view.up));
  const [run, walk, crouch, creep] = ['run', 'walk', 'crouch', 'creep'].map(gait => depth(gait));
  assert.ok(run > walk && walk > crouch && crouch > creep && creep > 0, [run, walk, crouch, creep].join(' '));
  assert.ok(Math.abs(walk - motion.bob.walk) < 0.003, 'reaches about the tuned depth');
  assert.equal(depth('walk', { bobScale: 0 }), 0);
  assert.ok(depth('walk', { bobScale: 1.5 }) > walk * 1.4);
});

test('landing from a fall dips the view and recovers; a hop does not', () => {
  const m = createMotion(), state = fake();
  m.lastVy = -6;
  const landing = observeMotion(m, state, courtyard, [0, 0], 'walk', 3.5, DT);
  assert.ok(landing.view.up < -0.05);
  assert.ok(landing.events.some(event => event.landing));
  let view = landing.view;
  for (let i = 0; i < Math.ceil(motion.landing.time / DT) + 2; i++) view = observeMotion(m, state, courtyard, [0, 0], 'walk', 3.5, DT).view;
  assert.equal(view.up, 0);
  const hop = createMotion(); hop.lastVy = -1;
  assert.equal(observeMotion(hop, fake(), courtyard, [0, 0], 'walk', 3.5, DT).view.up, 0);
});

test('strafing rolls the view toward the strafe, standing still does not', () => {
  const strafe = localX => {
    const m = createMotion(), state = fake();
    let view;
    for (let i = 0; i < 60; i++) { const before = [...state.player]; m.pace = 1; m.vx = 1; state.player[0] += 3.5 * DT; view = observeMotion(m, state, courtyard, before, 'walk', 3.5, DT, { localX }).view; }
    return view.roll;
  };
  assert.ok(strafe(1) > motion.roll * 0.9 && strafe(1) <= motion.roll + 1e-9);
  assert.ok(strafe(-1) < -motion.roll * 0.9);
  assert.equal(observeMotion(createMotion(), fake(), courtyard, [0, 0], 'walk', 3.5, DT, { localX: 1 }).view.roll, 0);
});

test('the new settings have defaults and are clamped', () => {
  assert.equal(defaultSettings.viewBob, 1);
  assert.equal(defaultSettings.moveSmoothing, true);
  assert.equal(defaultSettings.footstepSounds, true);
  const result = validateSettings({ viewBob: 9, moveSmoothing: 'no', footstepSounds: false });
  assert.equal(result.viewBob, 1.5);
  assert.equal(result.moveSmoothing, true);
  assert.equal(result.footstepSounds, false);
});
