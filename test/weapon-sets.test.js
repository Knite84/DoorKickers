import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard as map } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { fireWeapon, reload, finishReload } from '../src/weapons.js';
import { weapons, modelSets, defaultModels, defaultLoadout, validateLoadout, equip, equippedWeapon, weaponSpec, categoryOf } from '../src/kit.js';
import { modelFor, weaponModels } from '../src/weapon-models.js';
import { handlingFor, createHandling, fireKick, stepHandling, weaponPose, cycleProgress } from '../src/weapon-handling.js';

// The owner's SMG, DMR, LMG and sniper lists (2026-11-13).
const sets = { smg: 4, dmr: 7, lmg: 5, sniper: 5 };
const mission = (kind, model) => {
  const loadout = defaultLoadout(); loadout.weapons[kind].model = model;
  const state = createMission(map, { ...defaults, guardCount: 0 }, loadout); state.status = 'active';
  equip(state, kind); state.drawStart = undefined;
  return state;
};

test('every list is in, each kind in its own category, with a default model', () => {
  for (const [kind, count] of Object.entries(sets)) {
    assert.equal(Object.keys(modelSets[kind]).length, count, kind);
    assert.equal(categoryOf(kind), kind);
    assert.ok(modelSets[kind][defaultModels[kind]], kind);
  }
  // Older kits get the new weapons added, ready to pick.
  const old = defaultLoadout(); for (const kind of ['dmr', 'smg', 'lmg']) delete old.weapons[kind];
  const kit = validateLoadout(old);
  for (const kind of ['dmr', 'smg', 'lmg']) assert.equal(kit.weapons[kind].model, defaultModels[kind]);
});

test('every model fires, cycles and reloads with its own numbers', () => {
  for (const kind of Object.keys(sets)) for (const [id, model] of Object.entries(modelSets[kind])) {
    const state = mission(kind, id), spec = equippedWeapon(state), name = `${kind}:${id}`;
    assert.equal(state.ammo, model.magazine, name);
    assert.ok(fireWeapon(state, map, defaults, [0, 1.6, 0], [0, 0, -1]), name);
    assert.ok(Math.abs(state.nextShot - spec.interval) < 1e-9, name);
    // Bolt actions show the bolt cycling after a shot; semi-autos do not.
    state.elapsed = spec.interval * 0.5;
    assert.equal(cycleProgress(state, name) !== null, handlingFor(name).cycle === 'bolt', `${name} cycle`);
    state.elapsed = 1; assert.ok(reload(state), name); state.elapsed = 10; finishReload(state);
    assert.equal(state.ammo, model.magazine, name);
  }
});

test('scopes: DMRs a 2-4x LPVO, snipers 2-8x; others aim over iron sights', () => {
  for (const id of Object.keys(modelSets.dmr)) assert.deepEqual(weaponSpec(`dmr:${id}`).scope, [2, 4]);
  for (const id of Object.keys(modelSets.sniper)) assert.deepEqual(weaponSpec(`sniper:${id}`).scope, [2, 8]);
  for (const kind of ['smg', 'lmg', 'rifle', 'pistol']) assert.equal(weapons[kind].scope, undefined);
});

test('the shape of things: calibre sets damage, and the .50s and the 8.6 hit hardest in their sets', () => {
  const most = kind => Object.keys(modelSets[kind]).reduce((a, b) => weaponSpec(`${kind}:${a}`).damage >= weaponSpec(`${kind}:${b}`).damage ? a : b);
  assert.equal(most('sniper'), 'tac50');
  assert.equal(most('lmg'), 'mmg338');
  assert.equal(most('smg'), 'apc45');
  assert.ok(weaponSpec('dmr:qfix86').damage > weaponSpec('dmr:m110a1').damage, 'bolt guns hit harder');
  assert.ok(weaponSpec('sniper:m107a1').interval < weaponSpec('sniper:tac50').interval, 'the M107A1 is semi-auto');
  assert.ok(weaponSpec('lmg:mk46').magazine === 200);
});

test('models: every one aims down its sights or scope, and the long guns are longer', () => {
  for (const kind of Object.keys(sets)) for (const id of Object.keys(modelSets[kind])) {
    const key = `${kind}:${id}`, model = modelFor(key), h = createHandling();
    assert.ok(model && model.parts.length >= 10, key);
    assert.ok(model.parts.some(p => p.moves === 'magazine') && model.parts.some(p => p.moves === 'support'), key);
    if (handlingFor(key).cycle === 'bolt') assert.ok(model.parts.some(p => p.moves === 'bolt'), `${key} has a bolt`);
    for (let i = 0; i < 60; i++) stepHandling(h, 1 / 60, key, { aimed: true });
    const pose = weaponPose(h, mission(kind, id), defaults, key, { time: 0 });
    assert.ok(Math.abs(pose.position[0] + model.sight[0]) < 1e-9 && Math.abs(pose.position[1] + model.sight[1]) < 1e-9, key);
    assert.ok(fireKick(createHandling(), key).pitch > 0, key);
  }
  const reach = key => -weaponModels[key].muzzle[2];
  assert.ok(reach('smg:mp5k') < reach('smg:mp5') && reach('smg:mp5') < reach('dmr:m110a1') && reach('dmr:m110a1') < reach('sniper:mrad338') && reach('sniper:mrad338') < reach('sniper:tac50'));
});
