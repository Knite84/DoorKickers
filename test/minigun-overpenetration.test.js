import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission, movementGait } from '../src/simulation.js';
import { defaultLoadout, validateLoadout, equip, weapons } from '../src/kit.js';
import { fireWeapon, reload, finishReload } from '../src/weapons.js';

const arena = { ...courtyard, walls: [], props: [], doors: [], patrols: [[[2, 0], [3, 0]], [[8, 0], [9, 0]]] };
function ready(map = arena) {
  const state = createMission(map, defaults); state.status = 'active'; state.player = [-5, 4]; return state;
}

test('M134 blocks sprint only while equipped; held sprint resumes with a lighter weapon and release walks', () => {
  const state = ready(), input = { x: 1, z: 0, running: true };
  const rules = { ...defaults, guardCount: 0, patrolSpeed: 0 };
  function travel() {
    const start = state.player[0]; stepMission(state, arena, rules, 0.1, input); return state.player[0] - start;
  }
  const run = travel(); equip(state, 'minigun');
  assert.equal(movementGait(state, input), 'walk');
  const walk = travel(); assert.ok(Math.abs(run / walk - defaults.runMultiplier) < 1e-8);
  input.creep = true; assert.equal(movementGait(state, input), 'creep');
  assert.ok(Math.abs(travel() / walk - defaults.creepMultiplier) < 1e-8);
  input.creep = false; equip(state, 'pistol'); assert.equal(movementGait(state, input), 'run');
  assert.ok(Math.abs(travel() - run) < 1e-8);
  input.running = false; assert.equal(movementGait(state, input), 'walk');
  assert.ok(Math.abs(travel() - walk) < 1e-8);
});

test('old saved loadouts gain an M134 without losing their selected kit; invalid new configurations still fail', () => {
  const kit = defaultLoadout(); delete kit.weapons.minigun;
  kit.primary = 'pistol'; kit.weapons.pistol.ammoType = 'solid'; kit.items.grenade = 0;
  const restored = validateLoadout(kit);
  assert.equal(restored.primary, 'pistol'); assert.equal(restored.weapons.pistol.ammoType, 'solid');
  assert.equal(restored.items.grenade, 0); assert.equal(restored.weapons.minigun.carried, true);
  restored.weapons.minigun.velocity = 'invalid'; assert.throws(() => validateLoadout(restored));
});

test('M134 has a large separate belt, faster sustained cadence, depletion, reload and ammo options', () => {
  const state = ready(); equip(state, 'minigun');
  assert.equal(state.ammo, 300); assert.equal(weapons.minigun.automatic, true);
  assert.ok(weapons.minigun.interval < weapons.rifle.interval);
  for (const ammoType of ['standard', 'hollow', 'solid']) {
    state.inventory.weapons.minigun.ammoType = ammoType;
    const before = state.ammo;
    assert.ok(fireWeapon(state, arena, defaults, [0, 1, 0], [0, 0, 1]));
    assert.equal(state.ammo, before - 1);
    assert.equal(fireWeapon(state, arena, defaults, [0, 1, 0], [0, 0, 1]), null);
    state.elapsed = state.nextShot;
  }
  state.ammo = 0; assert.equal(fireWeapon(state, arena, defaults, [0, 1, 0], [0, 0, 1]), null);
  assert.equal(reload(state), true); state.elapsed = state.reloadUntil; finishReload(state);
  assert.equal(state.ammo, 300);
  state.ammo = 212; equip(state, 'rifle'); equip(state, 'minigun'); assert.equal(state.ammo, 212);
});

test('an NPC and a drywall layer consume identical penetration and reduce downstream wall damage equally', () => {
  function shot(first) {
    const state = ready(); state.inventory.weapons.rifle.ammoType = 'solid';
    state.guards = first === 'guard' ? [state.guards[0]] : [];
    // Thick, floor-anchored pieces retain health so downstream damage is measurable.
    state.wallPieces = [
      ...(first === 'drywall' ? [{ id: 0, wall: 0, material: 'drywall', center: [2, 1, 0], size: [0.05, 2, 2], hp: 20, maxHp: 20 }] : []),
      { id: 1, wall: 1, material: 'drywall', center: [4, 1, 0], size: [0.05, 2, 2], hp: 20, maxHp: 20 },
    ];
    const result = fireWeapon(state, arena, defaults, [0, 1, 0], [1, 0, 0]);
    return { result, remaining: state.wallPieces.at(-1).hp };
  }
  const npc = shot('guard'), wall = shot('drywall'), clear = shot('none');
  assert.equal(npc.remaining, wall.remaining);
  assert.ok(Math.abs((20 - npc.remaining) / (20 - clear.remaining) - 0.8) < 1e-8);
  assert.equal(npc.result.impacts[1].penetration, wall.result.impacts[1].penetration);
  assert.equal(npc.result.impacts[1].damage, wall.result.impacts[1].damage);
});

test('shots cross NPCs before damaging doors and more NPCs, with less damage and ammunition-dependent stopping', () => {
  const map = { ...arena, doors: [{ position: [4, 0], size: [0.3, 2] }] };
  for (const ammoType of ['hollow', 'standard', 'solid']) {
    const state = ready(map); state.inventory.weapons.rifle.ammoType = ammoType;
    const shot = fireWeapon(state, map, defaults, [0, 1, 0], [1, 0, 0]);
    if (ammoType === 'hollow') {
      assert.equal(state.doorHealth[0], 120); assert.equal(state.guards[1].health, 100);
      assert.equal(shot.impacts.length, 1);
    } else {
      const doorDamage = 50 * (ammoType === 'solid' ? 0.85 * 2 : 1) * 0.8;
      assert.ok(Math.abs(state.doorHealth[0] - (120 - doorDamage)) < 1e-8);
      assert.equal(state.guards[1].health < 100, ammoType === 'solid');
      assert.equal(shot.impacts.filter(i => i.kind === 'guard').length, ammoType === 'solid' ? 2 : 1);
    }
  }
});
