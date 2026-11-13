import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weapons } from '../src/kit.js';
import { weaponModels, suppressorLength } from '../src/weapon-models.js';

test('every firearm except the minigun has a model with a muzzle, a suppressor and hands', () => {
  for (const id of Object.keys(weapons)) {
    if (id === 'minigun') { assert.ok(!weaponModels[id]); continue; }
    const model = weaponModels[id];
    assert.ok(model, `${id} has no model`);
    assert.ok(model.parts.length >= 10, id);
    for (const role of ['suppressor', 'hand']) assert.ok(model.parts.some(p => p.role === role), `${id} lacks ${role}`);
    assert.ok(suppressorLength[id] > 0);
  }
});

test('parts are well formed and the barrel points forward', () => {
  for (const [id, model] of Object.entries(weaponModels)) {
    assert.ok(model.muzzle[2] < -0.1, `${id} muzzle is not forward`);
    for (const part of model.parts) {
      assert.ok(['box', 'cylinder'].includes(part.shape));
      assert.equal(part.position.length, 3);
      assert.ok(part.position.every(Number.isFinite));
      if (part.shape === 'box') assert.ok(part.size.length === 3 && part.size.every(v => v > 0));
      else assert.ok(part.radius > 0 && part.length > 0);
      assert.ok(Number.isInteger(part.color));
      if (part.role !== 'suppressor') assert.ok(part.position[2] - (part.shape === 'box' ? part.size[2] : part.length) / 2 >= model.muzzle[2] - 0.2, `${id} part sticks out past the muzzle`);
    }
    // A fitted suppressor starts at the muzzle and extends forward of it.
    for (const part of model.parts.filter(p => p.role === 'suppressor')) assert.ok(part.position[2] - part.length / 2 <= model.muzzle[2] + 0.01);
  }
});

test('longer weapons have longer models: pistol < SMG < rifle < DMR < sniper', () => {
  // The default models, at true size since 2026-11-13. The shotgun is still the old
  // placeholder (too long) until its list arrives, so it is left out.
  const reach = id => -weaponModels[id].muzzle[2];
  assert.ok(reach('pistol') < reach('smg') && reach('smg') < reach('rifle') && reach('rifle') < reach('dmr') && reach('dmr') < reach('sniper'));
});
