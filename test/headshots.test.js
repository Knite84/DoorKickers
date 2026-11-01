import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { weapons, ammoTypes, equip } from '../src/kit.js';
import { fireWeapon } from '../src/weapons.js';

const arena = { ...courtyard, walls: [], doors: [], props: [], patrols: [[[2, 0], [3, 0]]] };
test('all weapon, suppressor, velocity and projectile configurations kill with one head hit', () => {
  for (const weapon of Object.keys(weapons)) for (const suppressor of [false, true]) for (const velocity of ['subsonic', 'supersonic']) for (const ammoType of Object.keys(ammoTypes)) {
    const state = createMission(arena, defaults); state.status = 'active'; equip(state, weapon);
    Object.assign(state.inventory.weapons[weapon], { suppressor, velocity, ammoType });
    const result = fireWeapon(state, arena, { ...defaults, weaponDamage: 10 }, [0, 1.65, 0], [1, 0, 0]);
    const context = `${weapon}/${suppressor}/${velocity}/${ammoType}`;
    assert.equal(state.guards[0].health, 0, context);
    assert.equal(state.kills, 1, context);
    assert.equal(state.shots, 1, context);
    assert.equal(result.headshot, true, context);
    assert.equal(state.ammo, weapons[weapon].magazine - 1, context);
  }
});
test('suppressed subsonic pistol body shots keep normal damage instead of becoming instant kills', () => {
  const state = createMission(arena, defaults); state.status = 'active'; equip(state, 'pistol');
  Object.assign(state.inventory.weapons.pistol, { suppressor: true, velocity: 'subsonic', ammoType: 'solid' });
  const result = fireWeapon(state, arena, { ...defaults, weaponDamage: 10 }, [0, 1, 0], [1, 0, 0]);
  assert.equal(result.headshot, false);
  assert.ok(state.guards[0].health > 90 && state.guards[0].health < 100);
  assert.equal(state.kills, 0);
});
test('headshot guarantees still obey walls; penetrating head hits remain lethal after damage loss', () => {
  for (const ammoType of ['standard', 'solid']) {
    const state = createMission(courtyard, defaults); state.status = 'active'; equip(state, 'pistol');
    Object.assign(state.inventory.weapons.pistol, { suppressor: true, velocity: 'subsonic', ammoType });
    state.guards[0].position = [2, -5]; state.guards[1].position = [4, -5];
    const result = fireWeapon(state, courtyard, { ...defaults, weaponDamage: 10 }, [-3, 1.65, -5], [1, 0, 0]);
    assert.equal(result.headshot, ammoType === 'solid');
    assert.equal(state.guards[0].health, ammoType === 'solid' ? 0 : 100);
    assert.equal(state.guards[1].health, ammoType === 'solid' ? 0 : 100);
  }
});
test('shots above or beside the head do not register as body or head hits', () => {
  for (const origin of [[0, 2.1, 0], [0, 1.65, 0.25]]) {
    const state = createMission(arena, defaults); state.status = 'active'; equip(state, 'pistol');
    const result = fireWeapon(state, arena, defaults, origin, [1, 0, 0]);
    assert.equal(result.kind, 'miss'); assert.equal(result.headshot, false); assert.equal(state.guards[0].health, 100);
  }
});
