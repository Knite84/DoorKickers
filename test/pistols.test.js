import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard as map } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { fireWeapon, reload, finishReload } from '../src/weapons.js';
import { pistolModels, defaultPistol, defaultLoadout, validateLoadout, createInventory, equip, equippedWeapon, weaponKey, weaponSpec } from '../src/kit.js';
import { weaponModels, modelFor, suppressorFor } from '../src/weapon-models.js';
import { handlingFor, createHandling, fireKick, stepHandling, weaponPose, drawTime } from '../src/weapon-handling.js';
import { guardLook, guardPistols } from '../src/npc-shape.js';

const mission = model => {
  const loadout = defaultLoadout(); loadout.weapons.pistol.model = model;
  const state = createMission(map, { ...defaults, guardCount: 0 }, loadout); state.status = 'active';
  equip(state, 'pistol'); state.drawStart = undefined;
  return state;
};

test('five pistols; the kit saves the choice and older kits get the default', () => {
  assert.deepEqual(Object.keys(pistolModels), ['glock19', 'glock17', 'm17', 'staccato', 'mk23']);
  assert.equal(defaultLoadout().weapons.pistol.model, defaultPistol);
  const kit = defaultLoadout(); kit.weapons.pistol.model = 'mk23';
  assert.equal(validateLoadout(kit).weapons.pistol.model, 'mk23');
  const old = defaultLoadout(); delete old.weapons.pistol.model;
  assert.equal(validateLoadout(old).weapons.pistol.model, defaultPistol);
  const bad = defaultLoadout(); bad.weapons.pistol.model = 'deagle';
  assert.throws(() => validateLoadout(bad));
  assert.equal(createInventory(kit).magazines.pistol, 12);
});

test('each model fires with its own magazine, cadence and damage', () => {
  for (const [id, model] of Object.entries(pistolModels)) {
    const state = mission(id);
    assert.equal(state.ammo, model.magazine, id);
    assert.equal(equippedWeapon(state).name, model.name);
    assert.ok(fireWeapon(state, map, defaults, [0, 1.6, 0], [0, 0, -1]), id);
    assert.equal(state.ammo, model.magazine - 1, id);
    assert.ok(Math.abs(state.nextShot - model.interval) < 1e-9, id);
    state.elapsed = 1; assert.ok(reload(state)); state.elapsed = 5; finishReload(state);
    assert.equal(state.ammo, model.magazine, `${id} reloads to its own magazine`);
  }
  assert.ok(weaponSpec('pistol:mk23').damage > weaponSpec('pistol:glock19').damage, 'the .45 hits harder');
  assert.ok(weaponSpec('pistol:staccato').interval < weaponSpec('pistol:glock17').interval, 'the 2011 trigger is quickest');
});

test('handling differs: the Staccato climbs least, the Mk 23 draws slowest, the Glock 19 fastest', () => {
  const climb = id => fireKick(createHandling(), `pistol:${id}`).pitch;
  for (const id of Object.keys(pistolModels)) if (id !== 'staccato') assert.ok(climb('staccato') < climb(id), id);
  const draws = Object.keys(pistolModels).map(id => drawTime(`pistol:${id}`));
  assert.equal(Math.max(...draws), drawTime('pistol:mk23'));
  assert.equal(Math.min(...draws), drawTime('pistol:glock19'));
  // Every model still has the whole handling table.
  for (const id of Object.keys(pistolModels)) for (const key of ['climb', 'recover', 'kick', 'spring', 'aimTime', 'eyeRelief', 'draw', 'reload']) assert.ok(handlingFor(`pistol:${id}`)[key] !== undefined, `${id} ${key}`);
});

test('each model has its own shape, scaled to its real length, with sights on the crosshair', () => {
  const reach = id => -weaponModels[`pistol:${id}`].muzzle[2] + 0.045;
  const real = { glock19: 0.185, glock17: 0.202, m17: 0.203, staccato: 0.216, mk23: 0.245 };
  for (const [id, length] of Object.entries(real)) assert.ok(Math.abs(reach(id) - length) < 1e-9, id);
  assert.equal(modelFor('pistol'), weaponModels[`pistol:${defaultPistol}`]);
  assert.ok(!Object.keys(weaponModels).includes('pistol'), 'the default is not built twice');
  assert.ok(suppressorFor('pistol:mk23') > suppressorFor('pistol:glock19'));
  for (const id of Object.keys(pistolModels)) {
    const key = `pistol:${id}`, state = mission(id), h = createHandling();
    for (let i = 0; i < 60; i++) stepHandling(h, 1 / 60, key, { aimed: true });
    const pose = weaponPose(h, state, defaults, key, { time: 0 }), sight = modelFor(key).sight;
    assert.ok(Math.abs(pose.position[0] + sight[0]) < 1e-9 && Math.abs(pose.position[1] + sight[1]) < 1e-9, id);
    assert.ok(modelFor(key).parts.some(p => p.moves === 'magazine'));
  }
});

test('the weapon key names the chosen pistol only', () => {
  const state = mission('m17');
  assert.equal(weaponKey(state.inventory, 'pistol'), 'pistol:m17');
  assert.equal(weaponKey(state.inventory, 'rifle'), 'rifle');
  assert.equal(weaponKey({}, 'pistol'), `pistol:${defaultPistol}`);
});

test('guards carry a pistol to suit their outfit', () => {
  const seen = { security: new Set(), tactical: new Set() };
  for (let id = 0; id < 80; id++) {
    const look = guardLook('courtyard', { id }, 3);
    assert.ok(guardPistols[look.style].includes(look.pistol), `${look.style} ${look.pistol}`);
    seen[look.style].add(look.pistol);
  }
  assert.ok(seen.security.has('glock19') && seen.tactical.has('m17'));
});
