import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard as map } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { fireWeapon, reload, finishReload } from '../src/weapons.js';
import { rifleModels, defaultLoadout, validateLoadout, equip, equippedWeapon, weaponSpec, isSuppressed } from '../src/kit.js';
import { weaponModels, modelFor } from '../src/weapon-models.js';
import { handlingFor, createHandling, fireKick, stepHandling, weaponPose, drawTime } from '../src/weapon-handling.js';

const mission = (model, config = {}) => {
  const loadout = defaultLoadout(); Object.assign(loadout.weapons.rifle, { model, ...config });
  const state = createMission(map, { ...defaults, guardCount: 0 }, loadout); state.status = 'active';
  equip(state, 'rifle'); state.drawStart = undefined;
  return state;
};

test('six rifles; the M4A1 URG-I is the default and keeps the old assault rifle numbers', () => {
  assert.deepEqual(Object.keys(rifleModels), ['m4urgi', 'hk416', 'rattler', 'n4', 'boombox', 'honeybadger']);
  assert.equal(defaultLoadout().weapons.rifle.model, 'm4urgi');
  const m4 = weaponSpec('rifle:m4urgi'), old = weaponSpec('rifle');
  for (const key of ['damage', 'penetration', 'interval', 'reload', 'magazine']) assert.equal(m4[key], old[key], key);
  const kit = defaultLoadout(); kit.weapons.rifle.model = 'boombox';
  assert.equal(validateLoadout(kit).weapons.rifle.model, 'boombox');
  kit.weapons.rifle.model = 'ak47'; assert.throws(() => validateLoadout(kit));
});

test('each rifle fires and reloads with its own magazine and cadence', () => {
  for (const [id, model] of Object.entries(rifleModels)) {
    const state = mission(id), spec = equippedWeapon(state);
    assert.equal(state.ammo, model.magazine, id);
    assert.ok(fireWeapon(state, map, defaults, [0, 1.6, 0], [0, 0, -1]), id);
    assert.ok(Math.abs(state.nextShot - spec.interval) < 1e-9, id);
    state.elapsed = 1; assert.ok(reload(state)); state.elapsed = 5; finishReload(state);
    assert.equal(state.ammo, model.magazine, id);
  }
});

test('calibre: the 8.6 hits hardest; Blackout keeps more of its punch with subsonic ammo than 5.56', () => {
  const damage = key => weaponSpec(key).damage;
  for (const id of Object.keys(rifleModels)) if (id !== 'boombox') assert.ok(damage('rifle:boombox') > damage(`rifle:${id}`), id);
  const firstHit = (model, velocity) => {
    const state = mission(model, { velocity });
    // Guard standing in front, so the damage value is visible on the hit.
    return fireWeapon(state, map, defaults, [0, 1.6, 0], [0, 0, -1]);
  };
  const keep = id => weaponSpec(`rifle:${id}`).subsonic?.damage ?? 0.8;
  assert.ok(keep('rattler') > keep('m4urgi') && keep('honeybadger') > keep('hk416'));
  assert.ok(firstHit('m4urgi', 'subsonic') && firstHit('rattler', 'subsonic'));
});

test('the Honey Badger is always suppressed; others only with a suppressor fitted', () => {
  const badger = mission('honeybadger');
  assert.ok(isSuppressed(badger.inventory, 'rifle'));
  assert.ok(fireWeapon(badger, map, defaults, [0, 1.6, 0], [0, 0, -1]).suppressed);
  const m4 = mission('m4urgi');
  assert.ok(!isSuppressed(m4.inventory, 'rifle'));
  assert.ok(!fireWeapon(m4, map, defaults, [0, 1.6, 0], [0, 0, -1]).suppressed);
  assert.ok(isSuppressed(mission('m4urgi', { suppressor: true }).inventory, 'rifle'));
  assert.ok(!modelFor('rifle:honeybadger').parts.some(p => p.role === 'suppressor'), 'no extra can on the built-in one');
});

test('handling: the Rattler draws fastest, the Boombox climbs most, the HK416 least', () => {
  const ids = Object.keys(rifleModels), climb = id => fireKick(createHandling(), `rifle:${id}`).pitch;
  assert.equal(Math.min(...ids.map(id => drawTime(`rifle:${id}`))), drawTime('rifle:rattler'));
  assert.equal(Math.max(...ids.map(climb)), climb('boombox'));
  assert.equal(Math.min(...ids.map(climb)), climb('hk416'));
  for (const id of ids) for (const key of ['climb', 'recover', 'kick', 'spring', 'aimTime', 'eyeRelief', 'draw', 'reload']) assert.ok(handlingFor(`rifle:${id}`)[key] !== undefined, `${id} ${key}`);
});

test('rifle shapes: real barrel lengths order the muzzles, and the sights sit on the crosshair', () => {
  const reach = id => -weaponModels[`rifle:${id}`].muzzle[2];
  assert.ok(reach('rattler') < reach('boombox') && reach('boombox') < reach('honeybadger') && reach('honeybadger') < reach('m4urgi'));
  assert.ok(Math.abs(reach('m4urgi') - reach('hk416')) < 1e-9, 'same 14.5 in barrel');
  assert.equal(modelFor('rifle'), weaponModels['rifle:m4urgi']);
  for (const id of Object.keys(rifleModels)) {
    const key = `rifle:${id}`, state = mission(id), h = createHandling();
    for (let i = 0; i < 60; i++) stepHandling(h, 1 / 60, key, { aimed: true });
    const pose = weaponPose(h, state, defaults, key, { time: 0 }), sight = modelFor(key).sight;
    assert.ok(Math.abs(pose.position[0] + sight[0]) < 1e-9 && Math.abs(pose.position[1] + sight[1]) < 1e-9, id);
    assert.ok(pose.position[2] + sight[2] < -0.3, `${id} front sight ahead of the eye`);
    assert.ok(modelFor(key).parts.some(p => p.moves === 'magazine') && modelFor(key).parts.some(p => p.moves === 'support'));
  }
});
