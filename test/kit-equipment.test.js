import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/rules.js';
import { courtyard } from '../src/maps/courtyard.js';
import { createMission, stepMission, movePlayer } from '../src/simulation.js';
import { defaultLoadout, validateLoadout, equip, weapons, slotOrder, cycleEquipped, equippedWeapon, equipSlot, assignSlot } from '../src/kit.js';
import { fireWeapon, reload, finishReload } from '../src/weapons.js';
import { useEquipment, detonateCharges, stepEquipment } from '../src/equipment.js';
import { damagePlayer } from '../src/combat.js';

const arena = { ...courtyard, walls: [], doors: [], props: [], patrols: [[[1, 0], [2, 0]], [[4, 0], [5, 0]]] };
const safeRules = { ...defaults, friendlyFire: false, patrolSpeed: 0 };
function ready(map = arena, rules = safeRules, kit = defaultLoadout()) {
  const state = createMission(map, rules, kit); state.status = 'active'; state.player = [0, 2]; return state;
}

test('loadout validation rejects missing kits, invalid ammo, no weapons and invalid quantities', () => {
  for (const mutate of [kit => { kit.weapons.rifle.velocity = 'invalid'; }, kit => { kit.weapons.sniper.ammoType = '__proto__'; }, kit => { kit.alternate = kit.primary; }, kit => { kit.primary = 'crossbow'; }, kit => { kit.items.grenade = -1; }, kit => { kit.items.axe = 1.5; }]) {
    const kit = defaultLoadout(); mutate(kit); assert.throws(() => validateLoadout(kit));
  }
  assert.throws(() => validateLoadout(null));
  // You carry a primary and an alternate; the carried flags follow them.
  const kit = validateLoadout(defaultLoadout());
  assert.deepEqual([kit.primary, kit.alternate], ['rifle', 'pistol']);
  assert.deepEqual(Object.keys(weapons).filter(id => kit.weapons[id].carried), ['rifle', 'pistol']);
  // Older kits marked weapons carried: their starting weapon is the primary, the pistol the alternate.
  const old = defaultLoadout(); delete old.alternate; old.primary = 'sniper';
  for (const id of Object.keys(weapons)) old.weapons[id].carried = ['sniper', 'shotgun', 'pistol'].includes(id);
  assert.deepEqual((({ primary, alternate }) => [primary, alternate])(validateLoadout(old)), ['sniper', 'pistol']);
  for (const gun of Object.values(old.weapons)) gun.carried = false;
  assert.throws(() => validateLoadout(old), /at least one/);
  // Assigning a slot swaps a weapon already in the other one.
  const swap = defaultLoadout(); assignSlot(swap, 'primary', 'pistol');
  assert.deepEqual([swap.primary, swap.alternate], ['pistol', 'rifle']);
});
test('weapon switching preserves separate magazines and reloads use each magazine size', () => {
  const state = ready(); state.ammo = 21;
  assert.equal(equip(state, 'pistol'), true); assert.equal(state.ammo, 15, 'the default Glock 19 holds 15');
  state.ammo = 3; assert.equal(reload(state), true);
  state.elapsed = 1.1; finishReload(state); assert.equal(state.ammo, 15);
  equip(state, 'rifle'); assert.equal(state.ammo, 21);
  // Taking out a weapon you do not carry (menu cheat mode) puts it in the slot in hand.
  assert.equal(equip(state, 'sniper'), true);
  assert.deepEqual([state.inventory.primary, state.inventory.alternate], ['sniper', 'pistol']);
  assert.ok(state.inventory.weapons.sniper.carried && !state.inventory.weapons.rifle.carried);
});
test('all weapons have independent cadence, damage, and shotgun pellet spread', () => {
  for (const id of Object.keys(weapons)) {
    const state = ready(); state.guards[0].position = [2, 0]; equip(state, id);
    const shot = fireWeapon(state, arena, safeRules, [0, 1, 0], [1, 0, 0]);
    assert.equal(shot.pellets.length, weapons[id].pellets);
    assert.equal(state.ammo, equippedWeapon(state).magazine - 1);
    assert.equal(state.nextShot, equippedWeapon(state).interval);
    assert.ok(state.guards[0].health < 100);
    assert.ok(state.kills <= 1);
  }
});
test('solid core crosses soft walls and multiple guards; hollow points stop at the wall', () => {
  for (const ammoType of ['hollow', 'solid']) {
    const state = ready(courtyard); state.inventory.weapons.rifle.ammoType = ammoType;
    state.guards[0].position = [2, -5]; state.guards[1].position = [4, -5];
    fireWeapon(state, courtyard, safeRules, [-3, 1.65, -5], [1, 0, 0]);
    for (const guard of state.guards.slice(0, 2)) assert.equal(guard.health < 100, ammoType === 'solid');
  }
});
test('suppressors and subsonic ammo shrink guard alerts; hollow points increase guard damage', () => {
  for (const suppressed of [false, true]) {
    const state = ready(); state.guards[0].position = [10, 0]; state.guards[1].health = 0;
    state.inventory.weapons.rifle.suppressor = suppressed;
    state.inventory.weapons.rifle.velocity = suppressed ? 'subsonic' : 'supersonic';
    fireWeapon(state, arena, safeRules, [0, 1.65, 0], [0, 1, 0]);
    assert.equal(state.guards[0].alertUntil > 0, !suppressed);
  }
  const normal = ready(), hollow = ready(); hollow.inventory.weapons.rifle.ammoType = 'hollow';
  for (const state of [normal, hollow]) fireWeapon(state, arena, safeRules, [0, 1, 0], [1, 0, 0]);
  assert.ok(hollow.guards[0].health < normal.guards[0].health);
});
test('med kits heal player damage, respect health cap, and are not consumed at full health', () => {
  const state = ready(); equip(state, 'medkit');
  useEquipment(state, arena, safeRules, [0, 1, 2], [1, 0, 0]); assert.equal(state.inventory.items.medkit, 2);
  damagePlayer(state, safeRules, 20); assert.equal(state.health, 80);
  useEquipment(state, arena, safeRules, [0, 1, 2], [1, 0, 0]);
  assert.equal(state.health, 100); assert.equal(state.inventory.items.medkit, 1);
  damagePlayer(state, { ...safeRules, invulnerable: true }, 100); assert.equal(state.health, 100);
});
test('axe breaks real wall pieces and crowbar opens a door without consuming reusable tools', () => {
  const state = ready(courtyard); equip(state, 'axe');
  useEquipment(state, courtyard, safeRules, [-3, 1.65, -6], [1, 0, 0]);
  assert.ok(state.wallPieces.some(p => p.hp <= 0)); assert.equal(state.inventory.items.axe, 1);
  state.elapsed = 2; equip(state, 'crowbar');
  useEquipment(state, courtyard, safeRules, [-2, 1.65, 2], [0, 0, -1]);
  assert.equal(state.doors[0], true); assert.equal(state.inventory.items.crowbar, 1);
});
test('det cord is consumed on placement and remote detonation clears a passage without removing guards', () => {
  const state = ready(courtyard); equip(state, 'detcord');
  useEquipment(state, courtyard, safeRules, [-3, 1.65, -6], [1, 0, 0]);
  assert.equal(state.devices.length, 1); assert.equal(state.inventory.items.detcord, 1);
  assert.equal(detonateCharges(state, courtyard, safeRules), 1);
  assert.equal(state.devices.length, 0); assert.equal(state.guards.length, 3);
  assert.deepEqual(movePlayer([-2, -6], [2, 0], courtyard, state.doors, false, state.wallPieces), [0, -6]);
});
test('claymores arm and trigger only on visible guards in front', () => {
  const state = ready(); equip(state, 'claymore');
  state.guards[0].position = [-1, 0]; state.guards[1].position = [8, 0];
  useEquipment(state, arena, safeRules, [0, 1.65, 0], [1, 0, 0]);
  state.elapsed = 2; stepEquipment(state, arena, safeRules, 0.1); assert.equal(state.devices.length, 1);
  state.guards[0].position = [1, 0]; stepEquipment(state, arena, safeRules, 0.1);
  assert.equal(state.devices.length, 0); assert.equal(state.guards[0].health, 0);
});
test('grenades consume inventory, wait for a fuse, and apply blast damage', () => {
  const state = ready(); equip(state, 'grenade');
  useEquipment(state, arena, safeRules, [0, 1.65, 0], [1, 0, 0]);
  assert.equal(state.inventory.items.grenade, 2); assert.equal(state.projectiles.length, 1);
  state.projectiles[0].position = [0, 0.15, 0]; state.projectiles[0].settled = true;
  state.elapsed = 1; stepEquipment(state, arena, safeRules, 0.1); assert.equal(state.guards[0].health, 100);
  state.elapsed = 2; stepEquipment(state, arena, safeRules, 0.1);
  assert.ok(state.guards[0].health < 100); assert.equal(state.projectiles.length, 0); assert.equal(state.health, 100);
});
test('flashbangs stun guards and briefly blind a nearby player looking at the burst', () => {
  const state = ready(); equip(state, 'flashbang'); state.facing = [0, -1];
  useEquipment(state, arena, safeRules, [0, 1.65, 0], [1, 0, 0]);
  state.projectiles[0].position = [0, 0.15, 0]; state.projectiles[0].settled = true;
  state.elapsed = 2; stepEquipment(state, arena, safeRules, 0.1);
  assert.ok(state.guards[0].stunnedUntil > 2); assert.ok(state.flashUntil > 2);
});
test('Molotovs create temporary fire that damages guards and respects self-damage settings', () => {
  const state = ready(); equip(state, 'molotov');
  useEquipment(state, arena, safeRules, [0, 1.65, 0], [1, 0, 0]);
  state.projectiles[0].position = [0, 0.15, 0]; state.projectiles[0].settled = true;
  state.elapsed = 1; stepEquipment(state, arena, safeRules, 1);
  assert.equal(state.fires.length, 1); assert.ok(state.guards[0].health < 100);
  state.player = [0, 0]; stepEquipment(state, arena, { ...safeRules, friendlyFire: true }, 1); assert.equal(state.health, 75);
  state.elapsed = 10; stepEquipment(state, arena, safeRules, 1); assert.equal(state.fires.length, 0);
});
test('pausing freezes projectiles and guard damage as well as movement', () => {
  const state = ready(); equip(state, 'grenade'); useEquipment(state, arena, safeRules, [0, 1, 0], [1, 0, 0]);
  state.status = 'paused'; const before = structuredClone(state);
  stepMission(state, arena, safeRules, 1, { x: 0, z: 0 }); assert.deepEqual(state, before);
});

test('number keys: 1 primary, 2 alternate, 3 to 5 throwables, 6 cycles equipment, 7 knife, 8 med kit; the wheel swaps weapons', () => {
  assert.deepEqual(slotOrder, ['primary', 'alternate', 'grenade', 'flashbang', 'molotov', 'equipment', 'knife', 'medkit']);
  const state = createMission(courtyard, { ...defaults, guardCount: 0 }, defaultLoadout());
  assert.equal(state.inventory.equipped, 'rifle');
  assert.equal(equipSlot(state, 2), 'pistol');
  assert.equal(equipSlot(state, 1), 'rifle');
  assert.equal(equipSlot(state, 3), 'grenade');
  assert.equal(equipSlot(state, 4), 'flashbang');
  assert.equal(equipSlot(state, 5), 'molotov');
  assert.equal(equipSlot(state, 7), 'knife');
  assert.equal(equipSlot(state, 8), 'medkit');
  // Equipment: each press takes out the next piece, skipping used-up ones and wrapping round.
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(() => equipSlot(state, 6)), ['detcord', 'claymore', 'pickgun', 'crowbar', 'axe', 'detcord']);
  state.inventory.items.claymore = 0;
  assert.equal(equipSlot(state, 6), 'pickgun');
  // From a gun, the equipment key brings back the last piece used.
  equipSlot(state, 1); assert.equal(equipSlot(state, 6), 'pickgun');
  // Used-up throwables do not come out.
  state.inventory.items.flashbang = 0; assert.equal(equipSlot(state, 4), null);
  // The wheel swaps primary and alternate; from anything else it takes out the primary.
  equipSlot(state, 1);
  assert.equal(cycleEquipped(state), 'pistol'); assert.equal(cycleEquipped(state), 'rifle');
  equipSlot(state, 3); assert.equal(cycleEquipped(state), 'rifle');
});
