import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission } from '../src/simulation.js';
import { damageGuard } from '../src/combat.js';
import { guardDisabled, guardPose, guardSpeed, guardWeaponPose } from '../src/npc-body.js';
import { fireGuardShot } from '../src/guard-tactics.js';
import { shouldSurrender } from '../src/guard-wounds.js';

const arena = { ...courtyard, bounds: { minX: -12, maxX: 12, minZ: -8, maxZ: 8 }, walls: [], doors: [], props: [], windows: [], ceilings: [], rooms: [], patrols: [[[0, 0], [1, 0]], [[-6, 4], [-6, 5]], [[-6, -4], [-6, -5]]] };
const rules = { ...defaults, awareness: 3, sightRange: 10, guardCount: 3, invulnerable: true, missionSeed: 11 };
const steady = { perception: 0.5, discipline: 0.5, communication: 0.5, handling: 0.5, nerve: 0.5 };
function ready(traits = steady, options = rules) {
  const state = createMission(arena, options); state.status = 'active'; state.player = [4, 0];
  const guard = state.guards[0];
  guard.position = [0, 0]; guard.heading = 0; guard.path = [[0, 0], [1, 0]]; guard.pathElevations = [0, 0]; guard.waypoint = 0;
  if (guard.traits) guard.traits = { ...traits };
  state.guards[1].position = [-6, 4]; state.guards[2].position = [-6, -4];
  return { state, guard };
}
const advance = (state, seconds, options = rules) => { for (let t = 0; t < seconds; t += 0.05) stepMission(state, arena, options, 0.05, { x: 0, z: 0 }); };

test('fixed-patrol guards keep the original wound rules: no flinch, no gut clock, no surrender', () => {
  const { state, guard } = ready(steady, { ...rules, missionSeed: 0 });
  assert.equal(guard.traits, undefined);
  damageGuard(state, guard, 20, { zone: 'leftArm' });
  assert.equal(guard.flinchUntil, undefined);
  damageGuard(state, guard, 20, { zone: 'stomach' });
  assert.equal(guard.incapacitated, true); assert.equal(guard.gutUntil, undefined); assert.ok(!guard.surrendered);
});

test('a gut-shot guard keeps fighting for a while, then collapses; steadier nerves last longer', () => {
  const lasting = nerve => {
    const { state, guard } = ready({ ...steady, nerve: 1 });
    guard.traits.nerve = nerve;
    // Nerve is forced high enough not to surrender, then set for the clock.
    damageGuard(state, guard, 20, { zone: 'stomach' });
    assert.ok(!guard.incapacitated && !guardDisabled(guard), 'stays up after the hit');
    assert.equal(guard.wounded, true);
    guard.surrendered = false;
    return guard.gutUntil - state.elapsed;
  };
  assert.ok(Math.abs(lasting(0) - 6) < 0.01); assert.ok(Math.abs(lasting(1) - 20) < 0.01);
  const { state, guard } = ready({ ...steady, nerve: 1 });
  damageGuard(state, guard, 20, { zone: 'stomach' });
  advance(state, 19); assert.ok(!guard.incapacitated, 'still up before the clock runs out');
  advance(state, 2); assert.equal(guard.incapacitated, true);
  assert.equal(guard.ragdoll.reaction, 'stomach'); assert.equal(guard.injuries.stomach, 1); assert.ok(guard.health > 0);
  assert.equal(state.kills, 0);
});

test('a second torso hit ends the gut-shot clock at once, and other wounds shorten it', () => {
  const first = ready({ ...steady, nerve: 1 });
  damageGuard(first.state, first.guard, 10, { zone: 'stomach' });
  damageGuard(first.state, first.guard, 10, { zone: 'chest' });
  assert.equal(first.guard.incapacitated, true);
  const second = ready({ ...steady, nerve: 1 });
  damageGuard(second.state, second.guard, 10, { zone: 'stomach' });
  const before = second.guard.gutUntil;
  damageGuard(second.state, second.guard, 5, { zone: 'leftArm' });
  assert.equal(second.guard.gutUntil, before - 4); assert.ok(!second.guard.incapacitated);
});

test('any hit causes a flinch: no shot for a beat, then wild fire until it passes', () => {
  const { state, guard } = ready({ ...steady, nerve: 0, handling: 1 });
  guard.traits.nerve = 1; // will not surrender
  state.elapsed = 10; guard.nextShot = 0;
  damageGuard(state, guard, 5, { zone: 'leftArm', protectedHit: true });
  assert.ok(guard.flinchUntil > 10.4 && guard.flinchUntil <= 11.4);
  assert.ok(guard.nextShot >= 10.35);
  const misses = at => {
    let missed = 0; state.elapsed = at; state.events = [];
    for (let i = 0; i < 200; i++) fireGuardShot(state, arena, rules, guard);
    for (const event of state.events) if (event.type === 'guard-shot' && !event.hitPlayer) missed++;
    return missed;
  };
  guard.wounded = false;
  const flinching = misses(10.2), calm = misses(20);
  assert.ok(flinching > 120, `${flinching}/200 missed while flinching`);
  assert.ok(calm < 20, `${calm}/200 missed when calm`);
});

test('marksmanship follows weapon handling, range and the rules slider; healthy guards can miss', () => {
  const rate = (handling, distance, options = rules) => {
    const { state, guard } = ready({ ...steady, handling }, options);
    state.player = [distance, 0]; let hits = 0;
    for (let i = 0; i < 400; i++) fireGuardShot(state, arena, options, guard);
    for (const event of state.events) if (event.hitPlayer) hits++;
    return hits / 400;
  };
  const near = rate(0.5, 3), mid = rate(0.5, 6), far = rate(0.5, 10);
  assert.ok(near > 0.8 && near > mid && mid > far && far > 0.15 && far < 0.6, `${near} ${mid} ${far}`);
  assert.ok(rate(1, 6) > 0.9); assert.ok(rate(0, 6) < 0.5);
  assert.ok(rate(0.5, 6, { ...rules, guardAccuracy: 2 }) > mid + 0.1);
  assert.ok(rate(0.5, 6, { ...rules, guardAccuracy: 0.5 }) < mid - 0.1);
});

test('a leg hit can drop a guard to a knee; both legs keep them down for good', () => {
  let fell = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { state, guard } = ready({ ...steady, nerve: 1 }, { ...rules, missionSeed: seed });
    damageGuard(state, guard, 5, { zone: 'leftLeg' });
    if (guard.downUntil > state.elapsed) fell++;
  }
  assert.ok(fell > 8 && fell < 40, `${fell}/60 fell at steady nerve`);
  const { state, guard } = ready({ ...steady, nerve: 1 });
  damageGuard(state, guard, 5, { zone: 'leftLeg' }); damageGuard(state, guard, 5, { zone: 'rightLeg' });
  assert.equal(guard.crawling, true);
  advance(state, 0.1);
  assert.equal(guard.fallen, true); assert.equal(guard.down, true); assert.equal(guardSpeed(guard), 0); assert.equal(guard.duck, 1);
  assert.equal(guard.aimTarget, null, 'no shooting while going down');
  advance(state, 3);
  assert.equal(guard.fallen, false); assert.equal(guard.down, true); assert.equal(guard.duck, 1);
  assert.equal(guardSpeed(guard), 0.25);
});

test('surrender weighs pain, isolation and losses against nerve', () => {
  const stressed = (nerve, { isolated = false, alliesDown = 0 } = {}) => {
    const { state, guard } = ready({ ...steady, nerve: 1 });
    damageGuard(state, guard, 50, { zone: 'leftArm' });
    guard.traits.nerve = nerve;
    if (isolated) { state.guards[1].position = [-11, 7]; state.guards[2].position = [-11, -7]; guard.position = [11, 0]; }
    for (let i = 1; i <= alliesDown; i++) state.guards[i].health = 0;
    return shouldSurrender(state, guard);
  };
  assert.equal(stressed(0.5), false);
  assert.equal(stressed(0.05), false, 'one wound with friends close is not enough');
  assert.equal(stressed(0.05, { isolated: true }), true);
  assert.equal(stressed(0.5, { isolated: true }), false);
  assert.equal(stressed(0.5, { alliesDown: 2 }), false);
  assert.equal(stressed(0.2, { alliesDown: 2 }), true);
  assert.equal(stressed(1, { isolated: true, alliesDown: 2 }), false, 'the hardest guards fight on');
});

test('a surrendered guard kneels unarmed with hands up, stops fighting, and can still be shot', () => {
  const { state, guard } = ready({ ...steady, nerve: 0 });
  state.guards[1].health = 0; state.guards[2].health = 0;
  damageGuard(state, guard, 50, { zone: 'rightArm' });
  assert.equal(guard.surrendered, true); assert.equal(state.surrenders, 1);
  assert.match(state.lastGuardReport, /give up/i);
  advance(state, 3);
  assert.equal(guard.mode, 'surrender'); assert.equal(guard.aimTarget, null); assert.equal(guardDisabled(guard), true);
  assert.deepEqual(guard.position, [0, 0]);
  const pose = guardPose(guard);
  assert.ok(pose.leftHand[1] > pose.chest[1] && pose.rightHand[1] > pose.chest[1], 'hands above the chest');
  assert.ok(pose.head[1] < 1.2, 'kneeling');
  assert.equal(guardWeaponPose(guard, pose).visible, false);
  assert.ok(!state.events.some(event => event.type === 'guard-shot' && event.time > 0));
  assert.equal(damageGuard(state, guard, 100, { zone: 'chest' }), true); assert.equal(state.kills, 1);
});

test('wound outcomes replay exactly with the mission seed', () => {
  const run = () => {
    const { state, guard } = ready(steady, { ...rules, missionSeed: 77 });
    damageGuard(state, guard, 10, { zone: 'leftLeg' }); advance(state, 1);
    damageGuard(state, guard, 10, { zone: 'stomach' }); advance(state, 4);
    return JSON.stringify([guard.position, guard.downUntil, guard.gutUntil, guard.flinchUntil, guard.mode, guard.luck, guard.aimSeed]);
  };
  assert.equal(run(), run());
});
