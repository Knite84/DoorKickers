import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { defaultLoadout, equip, restockEquipment } from '../src/kit.js';
import { useEquipment } from '../src/equipment.js';
import { fireWeapon } from '../src/weapons.js';

test('restock repeatedly refills spent equipment for free, including while inventory pauses the mission', () => {
  const state = createMission(courtyard, defaults); state.status = 'active'; equip(state, 'grenade');
  useEquipment(state, courtyard, defaults, [0, 1.65, 0], [0, 0, 1]);
  const health = state.health;
  const projectile = structuredClone(state.projectiles);
  state.status = 'paused';
  assert.ok(restockEquipment(state) > 0); assert.equal(state.inventory.items.grenade, 8);
  assert.equal(state.status, 'paused'); assert.equal(state.budget, 10000); assert.equal(state.health, health);
  assert.deepEqual(state.projectiles, projectile);
  assert.equal(restockEquipment(state), 0);
  state.status = 'active'; state.elapsed = state.nextUse;
  useEquipment(state, courtyard, defaults, [0, 1.65, 0], [0, 0, 1]);
  assert.equal(state.inventory.items.grenade, 7);
  assert.equal(restockEquipment(state), 1); assert.equal(state.inventory.items.grenade, 8);
});

test('restock makes depleted/omitted equipment available without refilling firearms or rewriting the loadout', () => {
  const loadout = defaultLoadout(); loadout.items.flashbang = 0; loadout.items.medkit = 0;
  const state = createMission(courtyard, defaults, loadout); state.status = 'active'; equip(state, 'pistol');
  fireWeapon(state, courtyard, defaults, [0, 1.65, 0], [0, 1, 0]);
  const inventoryWeapons = structuredClone(state.inventory.weapons), magazines = structuredClone(state.inventory.magazines);
  const ammo = state.ammo; state.reloadUntil = 10; state.nextUse = 5;
  restockEquipment(state);
  assert.equal(state.ammo, ammo); assert.equal(ammo, 14); assert.equal(state.reloadUntil, 10); assert.equal(state.nextUse, 5);
  assert.deepEqual(state.inventory.magazines, magazines); assert.deepEqual(state.inventory.weapons, inventoryWeapons);
  assert.equal(state.inventory.equipped, 'pistol'); assert.equal(state.inventory.items.flashbang, 8); assert.equal(state.inventory.items.medkit, 5);
  assert.equal(equip(state, 'flashbang'), true);
  const fresh = createMission(courtyard, defaults, loadout);
  assert.equal(fresh.inventory.items.flashbang, 0); assert.equal(fresh.inventory.items.medkit, 0);
});

test('restock does not alter a planned, completed, or failed mission', () => {
  for (const status of ['planning', 'complete', 'captured']) {
    const state = createMission(courtyard, defaults); state.status = status;
    const before = structuredClone(state.inventory), budget = state.budget;
    assert.equal(restockEquipment(state), 0); assert.deepEqual(state.inventory, before);
    assert.equal(state.budget, budget);
  }
});

test('debug restock restores spent cash even when equipment is already full', () => {
  const state = createMission(courtyard, { ...defaults, budget: 0 }); state.status = 'paused';
  restockEquipment(state);
  assert.equal(state.budget, 10000);
  state.budget -= 250;
  const inventory = structuredClone(state.inventory);
  assert.equal(restockEquipment(state), 250);
  assert.equal(state.budget, 10000); assert.deepEqual(state.inventory, inventory);
  assert.equal(restockEquipment(state), 0);
});
