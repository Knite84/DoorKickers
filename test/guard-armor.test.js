import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults, validateRules } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { fireWeapon } from '../src/weapons.js';

const map = { ...courtyard, walls: [], doors: [], props: [], patrols: [[[2,0],[3,0]], [[5,0],[6,0]], [[8,0],[9,0]]] };
test('armor count validates, defaults to none, and is capped by deployed guards', () => {
  assert.equal(validateRules({}).armoredGuards, 0);
  assert.throws(() => validateRules({ armoredGuards: 9 }));
  for (const [count, expected] of [[0, 0], [2, 2], [8, 3]]) {
    const state = createMission(map, { ...defaults, guardCount: 3, armoredGuards: count });
    assert.equal(state.guards.filter(g => g.armored).length, expected);
  }
});
test('armor reduces torso bullet damage but leaves headshots and limb hits unchanged', () => {
  const hit = (armored, origin) => {
    const rules = { ...defaults, guardCount: 1, armoredGuards: armored ? 1 : 0 };
    const state = createMission(map, rules); state.status = 'active';
    const shot = fireWeapon(state, map, rules, origin, [1,0,0]);
    return { health: state.guards[0].health, zone: shot.impacts[0].zone };
  };
  const plain = hit(false, [0,1.1,0]), protectedHit = hit(true, [0,1.1,0]);
  assert.ok(['chest','stomach'].includes(plain.zone));
  assert.ok(Math.abs((100-protectedHit.health) / (100-plain.health) - .35) < 1e-10);
  assert.equal(hit(true, [0,1.65,0]).health, 0);
  const leg = hit(false, [0,.5,.15]), armoredLeg = hit(true, [0,.5,.15]);
  assert.match(leg.zone, /Leg/); assert.equal(armoredLeg.health, leg.health);
});

test('armor absorbs ten torso hits without incapacitating, then the next hit behaves normally', () => {
  const rules = { ...defaults, guardCount: 1, armoredGuards: 1, weaponDamage: 10 };
  const state = createMission(map, rules); state.status = 'active';
  const guard = state.guards[0];
  for (let i = 0; i < 10; i++) {
    state.nextShot = 0;
    fireWeapon(state, map, rules, [0,1,0], [1,0,0]);
    assert.equal(guard.armorHits, 9-i); assert.ok(!guard.incapacitated);
  }
  state.nextShot = 0; fireWeapon(state, map, rules, [0,1,0], [1,0,0]);
  assert.equal(guard.armorHits, 0); assert.equal(guard.incapacitated, true);
});
