import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard as map } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { fireWeapon } from '../src/weapons.js';
import { ammoTypes, ammoFor, defaultLoadout, validateLoadout, equip, weapons } from '../src/kit.js';

const mission = ammoType => {
  const loadout = defaultLoadout(); loadout.weapons.shotgun.ammoType = ammoType;
  const state = createMission(map, { ...defaults, guardCount: 0 }, loadout); state.status = 'active';
  equip(state, 'shotgun'); state.drawStart = undefined;
  return state;
};

test('slugs are offered for the shotgun only', () => {
  assert.ok(ammoFor('shotgun').slug);
  for (const id of Object.keys(weapons).filter(id => id !== 'shotgun')) assert.ok(!ammoFor(id).slug, id);
  const loadout = defaultLoadout(); loadout.weapons.rifle.ammoType = 'slug';
  assert.throws(() => validateLoadout(loadout));
  const ok = defaultLoadout(); ok.weapons.shotgun.ammoType = 'slug';
  assert.equal(validateLoadout(ok).weapons.shotgun.ammoType, 'slug');
});

test('a slug is one heavy projectile with no spread; buckshot stays eight pellets', () => {
  const slug = fireWeapon(mission('slug'), map, defaults, [0, 1.6, 0], [0, 0, -1]);
  const buck = fireWeapon(mission('standard'), map, defaults, [0, 1.6, 0], [0, 0, -1]);
  assert.equal(slug.pellets.length, 1);
  assert.equal(buck.pellets.length, weapons.shotgun.pellets);
  const firstDamage = shot => shot.pellets[0].impacts[0]?.damage ?? 0;
  if (slug.pellets[0].impacts.length && buck.pellets[0].impacts.length) assert.ok(firstDamage(slug) > firstDamage(buck) * 5);
  assert.ok(ammoTypes.slug.penetration > ammoTypes.standard.penetration);
});
