import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission, interact, movePlayer, obstacles, lineOfSight } from '../src/simulation.js';
import { stepEquipment } from '../src/equipment.js';
import { fireWeapon } from '../src/weapons.js';
import { equip } from '../src/kit.js';

const arena = { ...courtyard, walls: [], doors: [], props: [], patrols: [[[1, 0], [2, 0]]] };
const doorMap = { ...arena, doors: [{ position: [0, 0], size: [0.2, 2] }] };
const rules = { ...defaults, friendlyFire: false };
function ready(map = arena, options = rules) {
  const state = createMission(map, options); state.status = 'active'; state.player = [-5, 0]; return state;
}
function grenade(state, map, position, options = rules) {
  state.projectiles.push({ type: 'grenade', position, expires: state.elapsed, settled: true });
  stepEquipment(state, map, options, 0.01);
}

test('a single grenade kills full-health guards from their feet through the close blast area', () => {
  for (const distance of [0, 0.5, 1, 1.5, 2, 2.5]) {
    const state = ready(); state.guards[0].position = [distance, 0];
    grenade(state, arena, [0, 0.15, 0]);
    assert.equal(state.guards[0].health, 0, `Guard ${distance}m from grenade`);
    assert.equal(state.kills, 1);
  }
});
test('grenade falloff leaves distant guards wounded and guards outside its radius unharmed', () => {
  const health = [];
  for (const distance of [3, 3.5, 4, 4.5]) {
    const state = ready(); state.guards[0].position = [distance, 0];
    grenade(state, arena, [0, 0.15, 0]); health.push(state.guards[0].health);
  }
  assert.ok(health[0] > 0 && health[0] < health[1]);
  assert.ok(health[1] < 100); assert.deepEqual(health.slice(2), [100, 100]);
});
test('masonry still shields guards and configured blast damage is respected', () => {
  const map = { ...arena, walls: [{ center: [0.5, 0], size: [0.2, 4] }] };
  const protectedState = ready(map); grenade(protectedState, map, [0, 0.15, 0]);
  assert.equal(protectedState.guards[0].health, 100);
  const disabled = ready(); grenade(disabled, arena, [0, 0.15, 0], { ...rules, blastDamage: 0 });
  assert.equal(disabled.guards[0].health, 100);
});
test('bullets accumulate door damage, break the door, and clear sight and player collision', () => {
  const state = ready(doorMap); state.guards[0].position = [2, 0];
  assert.equal(lineOfSight([-1, 0], [1, 0], obstacles(doorMap, state.doors, state.wallPieces)), false);
  assert.deepEqual(movePlayer([-1, 0], [2, 0], doorMap, state.doors, false, state.wallPieces), [-1, 0]);
  for (const [index, expected] of [70, 20, 0].entries()) {
    state.elapsed = index;
    const hit = fireWeapon(state, doorMap, rules, [-2, 1, 0], [1, 0, 0]);
    assert.equal(state.doorHealth[0], expected);
    assert.equal(hit.doorDestroyed, index === 2);
    assert.equal(state.guards[0].health, Math.max(0, 100 - (index + 1) * 40));
  }
  assert.equal(state.doors[0], true);
  assert.equal(lineOfSight([-1, 0], [1, 0], obstacles(doorMap, state.doors, state.wallPieces)), true);
  assert.deepEqual(movePlayer([-1, 0], [2, 0], doorMap, state.doors, false, state.wallPieces), [1, 0]);
  state.player = [0.6, 0]; assert.match(interact(state, doorMap), /destroyed/i); assert.equal(state.doors[0], true);
  state.guards[0].health = 100;
  state.elapsed = 4; fireWeapon(state, doorMap, rules, [-2, 1, 0], [1, 0, 0]); assert.equal(state.guards[0].health, 50);
  assert.equal(ready(doorMap).doorHealth[0], 120);
});
test('all weapons can shoot doors apart', () => {
  for (const weapon of ['rifle', 'pistol', 'shotgun', 'sniper', 'minigun']) {
    const state = ready(doorMap); equip(state, weapon);
    for (let i = 0; i < 5 && state.doorHealth[0] > 0; i++) {
      state.elapsed = i * 3; fireWeapon(state, doorMap, rules, [-2, 1, 0], [1, 0, 0]);
    }
    assert.equal(state.doorHealth[0], 0, weapon);
    assert.equal(state.doors[0], true, weapon);
  }
});
test('solid-core rounds penetrate a damaged closed door, while disabling door damage preserves cover', () => {
  for (const breakable of [true, false]) {
    const state = ready(doorMap); state.guards[0].position = [2, 0]; state.inventory.weapons.rifle.ammoType = 'solid';
    fireWeapon(state, doorMap, { ...rules, destructibleDoors: breakable }, [-2, 1, 0], [1, 0, 0]);
    assert.equal(state.doors[0], false);
    assert.equal(state.doorHealth[0], breakable ? 35 : 120);
    assert.equal(state.guards[0].health < 100, breakable);
  }
});
test('closed doors shield the current blast even when destroyed; surviving doors remain cover', () => {
  const close = ready(doorMap); close.guards[0].position = [1, 0]; grenade(close, doorMap, [-0.5, 0.15, 0]);
  assert.equal(close.doorHealth[0], 0); assert.equal(close.doors[0], true); assert.equal(close.guards[0].health, 100);
  grenade(close, doorMap, [-0.5, 0.15, 0]); assert.equal(close.guards[0].health, 0);
  const far = ready(doorMap); far.guards[0].position = [0.2, 0]; grenade(far, doorMap, [-3.5, 0.15, 0]);
  assert.ok(far.doorHealth[0] > 0 && far.doorHealth[0] < 120); assert.equal(far.guards[0].health, 100);
});
test('door durability setting applies on deployment', () => {
  const state = ready(doorMap, { ...rules, doorDurability: 30 });
  assert.equal(state.doorHealth[0], 30);
  fireWeapon(state, doorMap, rules, [-2, 1, 0], [1, 0, 0]); assert.equal(state.doorHealth[0], 0);
});
