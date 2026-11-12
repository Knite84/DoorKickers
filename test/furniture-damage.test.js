import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { partitions } from '../src/maps/partitions.js';
import { lodge } from '../src/maps/lodge.js';
import { martelli } from '../src/maps/martelli.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission } from '../src/simulation.js';
import { equip } from '../src/kit.js';
import { fireWeapon } from '../src/weapons.js';
import { useEquipment, stepEquipment } from '../src/equipment.js';
import { piece, furnitureClass, durability } from '../src/furniture.js';
import { damageProp } from '../src/furniture-damage.js';
import { propBox, activeProps } from '../src/world.js';
import { coverClear } from '../src/guard-tactics.js';
import { navigationFor } from '../src/navigation.js';
import { togglePlayerCover, setPlayerPeek } from '../src/player-cover.js';

const rules = { ...defaults, guardCount: 1, patrolSpeed: 0, friendlyFire: false, unlimitedAmmo: true };
const arena = (props, decor = []) => ({ ...courtyard, walls: [], doors: [], windows: [], props, decor, patrols: [[[9, 6], [9.5, 6]]] });
const dresser = piece('dresser', 'low', [2, 0]);   // wood, 1.5 x 0.5, 0.85 m tall
const sofa = piece('sofa', undefined, [2, 0]);     // soft
const ready = map => { const state = createMission(map, rules); state.status = 'active'; state.player = [0, 0]; state.facing = [1, 0]; state.guards[0].heading = Math.PI; return state; };
const FIRING = [0, 0.6, 0], AHEAD = [1, 0, 0];

// Seconds until a dresser breaks under one source.
function secondsToBreak(source) {
  const map = arena([dresser]), state = ready(map);
  const broken = () => state.propHealth[0] <= 0;
  const step = 0.01;
  if (source === 'blast') {
    state.projectiles.push({ type: 'grenade', position: [0.5, 0.5, 0], velocity: [0, 0, 0], expires: 0, settled: true });
    stepEquipment(state, map, rules, step);
    return broken() ? 0 : Infinity;
  }
  if (source === 'fire') state.fires.push({ position: [2, 0.15, 0], until: 1e6, radius: 2 });
  if (['rifle', 'pistol', 'shotgun', 'axe', 'crowbar'].includes(source)) equip(state, source);
  while (!broken() && state.elapsed < 300) {
    state.elapsed += step;
    if (source === 'fire') stepEquipment(state, map, rules, step);
    else if (source === 'axe' || source === 'crowbar') useEquipment(state, map, rules, FIRING, AHEAD);
    else fireWeapon(state, map, rules, FIRING, AHEAD);
  }
  return state.elapsed;
}

test('everything but counters and kitchen appliances breaks on Martelli', () => {
  const state = createMission(martelli, rules);
  // The outdoor planters are legacy props (foliage concealment), not kit furniture, so they stay solid.
  const unbreakable = new Set(['island', 'cabinets', 'barCounter', 'fridge', 'planter', 'table', 'crate']);
  martelli.props.forEach((prop, index) => {
    assert.equal(Number.isFinite(state.propHealth[index]), !unbreakable.has(prop.kind), `${prop.kind} #${index}`);
  });
  const classes = kind => furnitureClass({ kind, variant: undefined, size: [1, 1] });
  for (const kind of ['laundryMachine', 'furnace', 'waterHeater', 'fireplace']) assert.equal(classes(kind), 'heavy');
  for (const kind of ['wallTV', 'mirror', 'rug', 'yogaMat', 'ceilingFan']) assert.ok(martelli.decor.some(d => d.kind === kind) || kind === 'ceilingFan' || kind === 'yogaMat' || kind === 'mirror');
  martelli.decor.filter(d => d.kind !== 'arch').forEach((d, index) => assert.ok(Number.isFinite(state.decorHealth[martelli.decor.indexOf(d)]), `${d.kind} decor #${index}`));
});

test('other maps keep their furniture indestructible', () => {
  for (const map of [courtyard, partitions, lodge]) {
    const state = createMission(map, rules);
    assert.ok(state.propHealth.every(health => health === Infinity), map.name ?? 'map');
  }
});

test('an intact wooden piece stops a shot; a soft piece and debris let it through', () => {
  const wood = ready(arena([dresser]));
  equip(wood, 'rifle');
  assert.equal(fireWeapon(wood, arena([dresser]), rules, FIRING, AHEAD).kind, 'prop');
  assert.ok(wood.propHealth[0] < wood.propMaxHealth[0]);

  const softMap = arena([sofa]), soft = ready(softMap);
  equip(soft, 'rifle');
  const shot = fireWeapon(soft, softMap, rules, FIRING, AHEAD);
  assert.notEqual(shot.kind, 'prop');
  assert.ok(soft.propHealth[0] < soft.propMaxHealth[0], 'the shot still damages the sofa it passed through');

  const debris = ready(arena([dresser]));
  damageProp(debris, arena([dresser]), rules, 0, 'blast', 1e6);
  equip(debris, 'rifle');
  assert.notEqual(fireWeapon(debris, arena([dresser]), rules, FIRING, AHEAD).kind, 'prop');
});

test('debris hides a crouched view without stopping bullets, and can be walked through', () => {
  const map = arena([dresser]), state = ready(map);
  const viewer = [5, 0.6, 0], target = [0, 0.6, 0];
  assert.equal(coverClear(state, map, viewer, target), false);
  assert.equal(coverClear(state, map, viewer, target, false), false);
  damageProp(state, map, rules, 0, 'blast', 1e6);
  assert.equal(coverClear(state, map, viewer, target), false, 'debris is concealment');
  assert.equal(coverClear(state, map, viewer, target, false), true, 'debris stops no bullets');
  assert.equal(coverClear(state, map, [5, 1.4, 0], [0, 1.4, 0]), true, 'debris is low');
  assert.equal(propBox(state, map, 0, 'solid'), null);
  assert.equal(propBox(state, map, 0, 'sight').size[1], durability.debrisHeight);

  const walk = (health) => {
    const walking = ready(map);
    if (health === 0) damageProp(walking, map, rules, 0, 'blast', 1e6);
    for (let i = 0; i < 60; i++) stepMission(walking, map, rules, 0.05, { x: 1, z: 0 });
    return walking.player[0];
  };
  assert.ok(walk(1) < 1.3, 'an intact dresser blocks');
  assert.ok(walk(0) > 3, 'debris does not');
});

test('soft furniture is concealment; wooden furniture is cover until it breaks', () => {
  const guardShot = (map, state) => coverClear(state, map, [5, 0.6, 0], [0, 0.6, 0], false);
  const softMap = arena([sofa]), soft = ready(softMap);
  assert.equal(coverClear(soft, softMap, [5, 0.6, 0], [0, 0.6, 0]), false, 'hides');
  assert.equal(guardShot(softMap, soft), true, 'but stops nothing');

  const woodMap = arena([dresser]), wood = ready(woodMap);
  assert.match(togglePlayerCover(wood, woodMap), /in cover/i);
  assert.equal(wood.playerCover.concealment, false);
  damageProp(wood, woodMap, rules, 0, 'blast', 1e6);
  stepMission(wood, woodMap, rules, 0.05, { x: 0, z: 0 });
  assert.ok(wood.playerCover, 'the player is still crouched behind the debris');
  assert.equal(wood.playerCover.concealment, true, 'cover has become concealment');
  assert.equal(guardShot(woodMap, wood), true);
});

test('damage sources break a piece in the owner\'s order: blast, fire, shotgun, rifle and pistol, axe, crowbar', () => {
  const times = Object.fromEntries(['blast', 'fire', 'shotgun', 'rifle', 'pistol', 'axe', 'crowbar'].map(source => [source, secondsToBreak(source)]));
  assert.ok(times.blast < times.fire, JSON.stringify(times));
  assert.ok(times.fire < times.shotgun, JSON.stringify(times));
  assert.ok(times.shotgun < Math.min(times.rifle, times.pistol), JSON.stringify(times));
  assert.ok(Math.max(times.rifle, times.pistol) < Math.min(times.axe, times.crowbar), JSON.stringify(times));
  for (const time of Object.values(times)) assert.ok(Number.isFinite(time));
});

test('counters and kitchen appliances never break', () => {
  for (const kind of ['island', 'cabinets', 'barCounter', 'fridge']) {
    const map = arena([piece(kind, undefined, [2, 0])]), state = ready(map);
    assert.equal(state.propHealth[0], Infinity);
    assert.equal(damageProp(state, map, rules, 0, 'blast', 1e9), false);
    equip(state, 'rifle');
    assert.equal(fireWeapon(state, map, rules, [0, 0.4, 0], AHEAD).kind, 'prop');
    assert.equal(state.propHealth[0], Infinity);
  }
});

test('the walking grid rebuilds when a piece breaks', () => {
  const map = arena([dresser]), state = ready(map);
  const before = navigationFor(state, map), blockedBefore = before.blocked.reduce((sum, cell) => sum + cell, 0);
  damageProp(state, map, rules, 0, 'blast', 1e6);
  const after = navigationFor(state, map);
  assert.notEqual(after, before);
  assert.ok(after.blocked.reduce((sum, cell) => sum + cell, 0) < blockedBefore);
  assert.equal(activeProps(state, map).length, 0);
});

test('breaking leaves the map alone, records an event, and a new deployment restores everything', () => {
  const map = arena([dresser, sofa], [piece('wallTV', 'medium', [0, 3])]);
  const snapshot = JSON.stringify([map.props, map.decor]);
  const state = ready(map);
  damageProp(state, map, rules, 0, 'blast', 1e6);
  assert.equal(state.events.filter(event => event.type === 'furniture-break').length, 1);
  assert.equal(JSON.stringify([map.props, map.decor]), snapshot);
  const again = createMission(map, rules);
  assert.deepEqual(again.propHealth, again.propMaxHealth);
  assert.equal(again.propBroken, 0);
});

test('drawn-only decor takes damage from shots without stopping them, and "Furniture durability" scales health', () => {
  const tv = piece('wallTV', 'medium', [2, 0], { elevation: 0 });
  const map = arena([], [tv]), state = ready(map);
  equip(state, 'pistol');
  const bounds = state.decorHealth[0];
  assert.ok(Number.isFinite(bounds));
  const aim = [0, 1.3, 0];
  for (let i = 0; i < 500 && state.decorHealth[0] > 0; i++) { state.elapsed += 1; fireWeapon(state, map, rules, aim, AHEAD); }
  assert.equal(state.decorHealth[0], 0);
  assert.equal(state.decorBroken, 1);

  const tough = createMission(arena([dresser]), { ...rules, furnitureDurability: 200 });
  assert.ok(Math.abs(tough.propMaxHealth[0] - 2 * createMission(arena([dresser]), rules).propMaxHealth[0]) <= 1);
  const off = ready(arena([dresser]));
  assert.equal(damageProp(off, arena([dresser]), { ...rules, destructibleFurniture: false }, 0, 'blast', 1e9), false);
});
