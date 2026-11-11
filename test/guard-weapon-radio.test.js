import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission } from '../src/simulation.js';
import { damageGuard, sendGuardReport } from '../src/combat.js';
import { guardPose } from '../src/npc-body.js';
import { MAGAZINE, afterShot, stepWeapon, weaponReady, reloadTime, jamChance } from '../src/guard-weapon.js';
import { radioDelay, radioError, stepRadio } from '../src/guard-radio.js';

const open = { ...courtyard, bounds: { minX: -12, maxX: 12, minZ: -8, maxZ: 8 }, walls: [], doors: [], props: [], windows: [], ceilings: [], rooms: [], patrols: [[[0, 0], [1, 0]], [[-6, 4], [-6, 5]], [[-6, -4], [-6, -5]]] };
// A solid pillar a few metres behind the guard gives somewhere to hide.
const pillar = { ...open, walls: [{ center: [-3, 0], size: [0.6, 2.4] }] };
const rules = { ...defaults, awareness: 3, sightRange: 10, guardCount: 3, invulnerable: true, missionSeed: 11 };
const steady = { perception: 0.5, discipline: 0.5, communication: 0.5, handling: 0.5, nerve: 0.5 };
function ready(traits = steady, map = open, options = rules) {
  const state = createMission(map, options); state.status = 'active'; state.player = [4, 0];
  state.guards.forEach((guard, index) => {
    guard.position = [[0, 0], [-6, 4], [-6, -4]][index]; guard.heading = 0;
    guard.path = [[...guard.position], [guard.position[0] + 1, guard.position[1]]]; guard.pathElevations = [0, 0]; guard.waypoint = 0;
    if (guard.traits) guard.traits = { ...traits };
  });
  return { state, guard: state.guards[0] };
}
const advance = (state, map, seconds, options = rules) => { for (let t = 0; t < seconds; t += 0.05) stepMission(state, map, options, 0.05, { x: 0, z: 0 }); };
const shots = state => state.events.filter(event => event.type === 'guard-shot').length;

test('fixed-patrol guards have no magazine and an instant, exact radio', () => {
  const { state, guard } = ready(steady, open, { ...rules, missionSeed: 0 });
  for (let i = 0; i < 40; i++) afterShot(state, guard);
  assert.equal(guard.weapon, undefined); assert.equal(weaponReady(guard), true);
  sendGuardReport(state, guard, { kind: 'sighting', position: [4, 0], armed: true });
  assert.equal(state.radioQueue, undefined);
  assert.deepEqual(state.guards[1].pendingReport.position, [4, 0]); assert.equal(state.guards[1].pendingReportAt, 0);
});

test('a guard runs the magazine dry, reloads for a time set by weapon handling, then fires again', () => {
  assert.ok(Math.abs(reloadTime({ traits: { handling: 1 } }) - 1.6) < 1e-9);
  assert.ok(Math.abs(reloadTime({ traits: { handling: 0 } }) - 4) < 1e-9);
  const { state, guard } = ready({ ...steady, discipline: 1, handling: 1, communication: 1 });
  guard.luck = 1; state.elapsed = 5;
  // Discipline 1 has the lowest stoppage rate; step until the magazine empties without one.
  let fired = 0;
  while (guard.weapon?.state !== 'reloading' && fired < 40) { afterShot(state, guard); fired++; if (guard.weapon.state === 'jammed') { guard.weapon.state = 'ready'; } }
  assert.equal(fired, MAGAZINE); assert.equal(guard.weapon.rounds, 0); assert.equal(weaponReady(guard), false);
  assert.match(state.lastGuardReport, /Reloading/);
  assert.ok(state.events.some(event => event.type === 'guard-reload'));
  state.elapsed = 6.5; stepWeapon(state, guard, true); assert.equal(weaponReady(guard), false);
  state.elapsed = 6.7; stepWeapon(state, guard, true);
  assert.equal(weaponReady(guard), true); assert.equal(guard.weapon.rounds, MAGAZINE); assert.equal(guard.weaponBusy, false);
});

test('in a live firefight the guard stops shooting while reloading and resumes afterwards', () => {
  const { state, guard } = ready({ ...steady, discipline: 0.2, handling: 0, nerve: 1, communication: 0 });
  state.guards[1].health = 0; state.guards[2].health = 0;
  guard.target = { kind: 'player', position: [4, 0], elevation: 0, time: 0, armed: true }; guard.mode = 'pursue'; guard.suspicion = 1;
  guard.weapon = { rounds: 2, state: 'ready', until: 0 }; guard.luck = 12345;
  advance(state, open, 2.5);
  const dry = shots(state);
  // Two rounds left: both are fired, unless the first one jams.
  assert.ok(dry >= 1 && dry <= 2, `${dry} shots before the weapon stopped`);
  assert.ok(['reloading', 'jammed'].includes(guard.weapon.state));
  assert.equal(guard.aimTarget, null, 'weapon is not presented while it is being worked');
  const pose = guardPose(guard);
  assert.ok(Math.abs(pose.leftHand[2] - pose.rightHand[2]) < 0.25 && pose.leftHand[1] > 1.1, 'hands together at the chest');
  advance(state, open, 9);
  assert.ok(shots(state) > dry, 'fires again once the weapon is back in action');
});

test('stoppages are occasional, rarer for disciplined guards, and cleared faster by good handlers', () => {
  assert.ok(jamChance({ traits: { discipline: 1 } }) < 0.01 && jamChance({ traits: { discipline: 0 } }) > 0.025);
  const sample = traits => {
    const { state, guard } = ready({ ...steady, ...traits });
    let jams = 0, clearing = 0;
    for (let shot = 0; shot < 6000; shot++) {
      state.elapsed += 1; afterShot(state, guard);
      if (guard.weapon.state === 'jammed') { jams++; clearing += guard.weapon.until - state.elapsed; }
      if (guard.weapon.state === 'reloading') guard.weapon.rounds = MAGAZINE;
      guard.weapon.state = 'ready';
    }
    return { rate: jams / 6000, clear: clearing / jams };
  };
  const drilled = sample({ discipline: 1, handling: 1 }), sloppy = sample({ discipline: 0, handling: 0 });
  assert.ok(drilled.rate > 0.003 && drilled.rate < 0.014, `drilled ${drilled.rate}`);
  assert.ok(sloppy.rate > 0.018 && sloppy.rate < 0.04, `sloppy ${sloppy.rate}`);
  assert.ok(Math.abs(drilled.clear - 1.2) < 0.01, `drilled clears in ${drilled.clear}s`);
  assert.ok(sloppy.clear > 6.5, `sloppy clears in ${sloppy.clear}s`);
});

test('a disciplined guard with a dry weapon falls back behind cover; a sloppy one stays put', () => {
  const run = discipline => {
    const { state, guard } = ready({ ...steady, discipline, handling: 0, nerve: 1 }, pillar);
    state.guards[1].health = 0; state.guards[2].health = 0;
    guard.target = { kind: 'player', position: [4, 0], elevation: 0, time: 0, armed: true }; guard.mode = 'pursue'; guard.suspicion = 1;
    guard.weapon = { rounds: 1, state: 'ready', until: 0 }; guard.luck = 999;
    advance(state, pillar, 1.2);
    assert.notEqual(guard.weapon.state, 'ready');
    guard.weapon.until = state.elapsed + 30; // hold the reload open to watch the movement
    advance(state, pillar, 5);
    return guard;
  };
  const careful = run(0.9), sloppy = run(0.1);
  assert.equal(careful.weaponBusy, true); assert.ok(careful.position[0] < -2.5, `careful guard at ${careful.position}`);
  assert.ok(['cover', 'peek', 'retreat'].includes(careful.mode));
  assert.equal(sloppy.weaponBusy, false); assert.ok(sloppy.position[0] > -1.5, `sloppy guard at ${sloppy.position}`);
});

test('disciplined guards top up a low magazine during a lull', () => {
  const { state, guard } = ready({ ...steady, discipline: 0.9 });
  guard.weapon = { rounds: 3, state: 'ready', until: 0, lastSeenAt: 1 };
  state.elapsed = 2; stepWeapon(state, guard, false); assert.equal(guard.weapon.state, 'ready', 'not yet a lull');
  state.elapsed = 3.5; stepWeapon(state, guard, false); assert.equal(guard.weapon.state, 'reloading');
  const casual = ready({ ...steady, discipline: 0.3 });
  casual.guard.weapon = { rounds: 3, state: 'ready', until: 0, lastSeenAt: 1 };
  casual.state.elapsed = 10; stepWeapon(casual.state, casual.guard, false); assert.equal(casual.guard.weapon.state, 'ready');
});

test('a radio call takes time to send and is lost if the caller is dropped first', () => {
  assert.ok(Math.abs(radioDelay({ traits: { communication: 1 } }) - 0.4) < 1e-9);
  assert.ok(Math.abs(radioDelay({ traits: { communication: 0 } }) - 2.6) < 1e-9);
  const { state, guard } = ready({ ...steady, communication: 0.5, discipline: 1 });
  state.elapsed = 10;
  sendGuardReport(state, guard, { kind: 'sighting', position: [4, 0], armed: true });
  assert.equal(state.radioQueue.length, 1); assert.equal(state.guards[1].pendingReport, undefined);
  state.elapsed = 11.4; stepRadio(state); assert.equal(state.guards[1].pendingReport, undefined, 'still transmitting');
  state.elapsed = 11.6; stepRadio(state);
  assert.equal(state.guards[1].pendingReport.kind, 'sighting'); assert.equal(state.radioQueue.length, 0);
  assert.equal(state.guardReports.length, 1);

  const silenced = ready({ ...steady, communication: 0.5 });
  silenced.state.elapsed = 10;
  sendGuardReport(silenced.state, silenced.guard, { kind: 'sighting', position: [4, 0], armed: true });
  damageGuard(silenced.state, silenced.guard, 100, { zone: 'head' });
  silenced.state.elapsed = 13; stepRadio(silenced.state);
  assert.equal(silenced.state.guards[1].pendingReport, undefined); assert.equal(silenced.state.radioLost, 1);
  assert.equal(silenced.state.guardReports.length, 0);
});

test('good communicators give the exact spot; poor ones are vague and say so', () => {
  assert.equal(radioError({ traits: { communication: 0.7 } }), 0);
  assert.ok(Math.abs(radioError({ traits: { communication: 0 } }) - 5.4) < 1e-9);
  const offsets = communication => {
    const { state, guard } = ready({ ...steady, communication });
    const result = [];
    for (let i = 0; i < 200; i++) {
      state.radioQueue = []; sendGuardReport(state, guard, { kind: 'sighting', position: [4, 0], armed: true });
      result.push(Math.hypot(state.radioQueue[0].report.position[0] - 4, state.radioQueue[0].report.position[1]));
    }
    state.elapsed = 100; stepRadio(state);
    return { worst: Math.max(...result), mean: result.reduce((a, b) => a + b, 0) / result.length, heard: state.lastGuardReport };
  };
  const clear = offsets(0.9), vague = offsets(0);
  assert.equal(clear.worst, 0); assert.match(clear.heard, /Armed threat spotted/);
  assert.ok(vague.mean > 2.5 && vague.worst <= 5.4 + 1e-9, `vague mean ${vague.mean}`);
  assert.match(vague.heard, /not sure where/);
});

test('listeners act after their own delay, and routine findings can go unreported or unheeded', () => {
  const { state, guard } = ready({ ...steady, communication: 1 });
  state.guards[1].traits.discipline = 1; state.guards[2].traits.discipline = 0;
  state.guards[1].position = [-6, 4]; state.guards[2].position = [-6, -4];
  state.player = [11, 7];
  sendGuardReport(state, guard, { kind: 'body', position: [2, 2], elevation: 0 });
  advance(state, open, 0.8);
  assert.equal(state.guards[1].mode, 'investigate', 'the disciplined listener is already moving');
  assert.equal(state.guards[2].mode, 'patrol', 'the inattentive one has not reacted yet');
  advance(state, open, 1.6);
  assert.equal(state.guards[2].mode, 'investigate');

  let sent = 0, heeded = 0;
  for (let i = 0; i < 300; i++) {
    const trial = ready({ ...steady, communication: 0, discipline: 0 }, open, { ...rules, missionSeed: 100 + i });
    sendGuardReport(trial.state, trial.guard, { kind: 'damage', position: [2, 2], elevation: 0, label: 'door' });
    if (trial.state.radioQueue?.length) { sent++; trial.state.elapsed = 10; stepRadio(trial.state); if (trial.state.guards[1].pendingReport) heeded++; }
  }
  assert.ok(sent > 110 && sent < 190, `${sent}/300 damage reports sent by a poor communicator`);
  assert.ok(heeded > sent * 0.45 && heeded < sent * 0.75, `${heeded}/${sent} heeded by an inattentive listener`);
  const keen = ready({ ...steady, communication: 1, discipline: 1 });
  sendGuardReport(keen.state, keen.guard, { kind: 'damage', position: [2, 2], elevation: 0, label: 'door' });
  assert.equal(keen.state.radioQueue.length, 1);
});
