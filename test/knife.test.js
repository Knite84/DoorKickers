import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission } from '../src/simulation.js';
import { defaultLoadout, validateLoadout, equip, isArmed } from '../src/kit.js';
import { useEquipment } from '../src/equipment.js';

const map = { ...courtyard, walls: [], doors: [], props: [], patrols: [[[0, 0], [1, 0]], [[5, 0], [6, 0]]] };
function ready(stage = map) { const state = createMission(stage, defaults); state.status = 'active'; equip(state, 'knife'); state.guards[0].heading = 0; return state; }

test('rear knife attacks kill silently from either orientation without noise or injury-radio alerts', () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const state = ready(); state.guards[0].heading = heading;
    const direction = [Math.cos(heading), 0, Math.sin(heading)], origin = [-direction[0] * 1.1, 1.3, -direction[2] * 1.1];
    assert.match(useEquipment(state, map, defaults, origin, direction), /Silent knife/i);
    assert.equal(state.guards[0].health, 0); assert.equal(state.kills, 1);
    assert.equal(state.guardReports.length, 0); assert.equal(state.guards[1].pendingReport, undefined);
    assert.equal(state.guards[1].alertUntil, 0); assert.equal(state.inventory.items.knife, 1); assert.equal(isArmed(state), true);
  }
});

test('front knife attacks wound and call backup; knife cooldown prevents repeated damage', () => {
  const state = ready(); const origin = [1.1, 1.3, 0], direction = [-1, 0, 0];
  assert.match(useEquipment(state, map, defaults, origin, direction), /injured/i);
  assert.equal(state.guards[0].health, 45); assert.equal(state.guardReports[0].kind, 'injury');
  assert.equal(useEquipment(state, map, defaults, origin, direction), ''); assert.equal(state.guards[0].health, 45);
  state.elapsed = 0.6; useEquipment(state, map, defaults, origin, direction); assert.equal(state.guards[0].health, 0);
});

test('knife attacks cannot reach through walls, across floors, or beyond melee range', () => {
  for (const stage of [map, { ...map, walls: [{ center: [-0.5, 0], size: [0.2, 4] }] }]) {
    const state = ready(stage); useEquipment(state, stage, defaults, [-3, 1.3, 0], [1, 0, 0]); assert.equal(state.guards[0].health, 100);
    if (stage.walls.length) { useEquipment(state, stage, defaults, [-1.1, 1.3, 0], [1, 0, 0]); assert.equal(state.guards[0].health, 100); }
    useEquipment(state, stage, defaults, [-1.1, 4.5, 0], [1, 0, 0]); assert.equal(state.guards[0].health, 100);
  }
});

test('a silently killed guard can still be discovered visually by another guard', () => {
  const state = ready(); state.player = [-1.1, 0]; state.guards[1].heading = Math.PI;
  useEquipment(state, map, defaults, [-1.1, 1.3, 0], [1, 0, 0]); assert.equal(state.guardReports.length, 0);
  stepMission(state, map, { ...defaults, patrolSpeed: 0, awareness: 0 }, 0.05, { x: 0, z: 0 });
  assert.ok(state.guardReports.some(report => report.kind === 'body'));
});

test('old kits gain the knife without changing existing choices and invalid knife counts are rejected', () => {
  const old = defaultLoadout(); delete old.items.knife; old.items.grenade = 0;
  const restored = validateLoadout(old); assert.equal(restored.items.knife, 1); assert.equal(restored.items.grenade, 0);
  restored.items.knife = 2; assert.throws(() => validateLoadout(restored));
});
