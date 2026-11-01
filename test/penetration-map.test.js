import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitions } from '../src/maps/partitions.js';
import { resolveMap } from '../src/maps/index.js';
import { defaults } from '../src/rules.js';
import { createMission, movePlayer, interact } from '../src/simulation.js';
import { equip } from '../src/kit.js';
import { fireWeapon } from '../src/weapons.js';
import { removeUnsupportedPieces } from '../src/destruction.js';

function shoot(weapon, ammoType, { z = -4.25, velocity = 'supersonic', map = partitions, rules = defaults } = {}) {
  const state = createMission(map, rules); state.status = 'active'; equip(state, weapon);
  Object.assign(state.inventory.weapons[weapon], { ammoType, velocity });
  const shot = fireWeapon(state, map, rules, [-8, 1, z], [1, 0, 0]);
  return { state, shot, impacts: shot.pellets[0].impacts };
}
const layers = result => result.impacts.filter(i => i.kind === 'wall' && i.material !== 'masonry');

test('successive intact walls show ammunition and firearm penetration differences', () => {
  for (const [weapon, expected] of Object.entries({ shotgun: [1, 1, 4], pistol: [1, 2, 6], rifle: [1, 4, 6], sniper: [2, 6, 6] })) {
    for (const [index, ammo] of ['hollow', 'standard', 'solid'].entries()) {
      const result = shoot(weapon, ammo, { rules: { ...defaults, guardCount: 0 } });
      assert.equal(layers(result).length, expected[index], `${weapon}/${ammo}`);
    }
  }
});

test('solid core reaches a guard beyond three walls with reduced body damage', () => {
  const result = shoot('rifle', 'solid');
  assert.equal(new Set(layers(result).map(i => i.wall)).size, 3);
  assert.equal(result.shot.kind, 'guard');
  const expectedDamage = 50 * 0.85 * 0.8 ** 6;
  assert.ok(Math.abs(result.state.guards[0].health - (100 - expectedDamage)) < 1e-8);
  assert.equal(shoot('rifle', 'standard').state.guards[0].health, 100);
  assert.equal(shoot('rifle', 'hollow').state.guards[0].health, 100);
});

test('timber consumes more penetration than an empty stud bay and subsonic reduces the penetration budget', () => {
  const bay = shoot('rifle', 'standard');
  const stud = shoot('rifle', 'standard', { z: -5 });
  assert.equal(stud.impacts.at(-1).material, 'timber');
  assert.ok(layers(stud).length < layers(bay).length);
  assert.ok(shoot('sniper', 'standard', { velocity: 'subsonic' }).impacts.at(-1).penetration < shoot('sniper', 'standard').impacts.at(-1).penetration);
});

test('masonry and disabled wall damage stop even solid core; open holes do not consume penetration', () => {
  const result = shoot('sniper', 'solid', { rules: { ...defaults, guardCount: 0 } });
  assert.equal(result.impacts.at(-1).material, 'masonry');
  assert.ok(result.shot.position[0] < 10);
  const disabled = shoot('sniper', 'solid', { rules: { ...defaults, destructibleWalls: false } });
  assert.equal(disabled.impacts.length, 1);
  assert.equal(disabled.state.guards[0].health, 100);
  const state = createMission(partitions, defaults); state.status = 'active';
  for (const piece of state.wallPieces) if (piece.wall === 5) piece.hp = 0;
  const shot = fireWeapon(state, partitions, defaults, [-8, 1, -4.25], [1, 0, 0]);
  assert.equal(shot.impacts[0].wall, 6);
});

test('long house entries, inspection corridor, objective route, and deployment reset work', () => {
  assert.equal(resolveMap('partitions'), partitions);
  assert.notEqual(resolveMap('__proto__'), partitions);
  const state = createMission(partitions, defaults); state.status = 'active';
  assert.equal(state.guards.length, 3);
  assert.equal(removeUnsupportedPieces(state.wallPieces).length, 0);
  for (const target of [[-7, 7], [-7, 0], [8, 0], [8, -6]]) {
    while (Math.hypot(state.player[0] - target[0], state.player[1] - target[1]) > 0.01) {
      if (state.player[0] === -7 && state.player[1] >= 0 && state.player[1] <= 3) state.doors[0] = true;
      const delta = target.map((v, i) => Math.max(-0.2, Math.min(0.2, v - state.player[i])));
      const next = movePlayer(state.player, delta, partitions, state.doors, false, state.wallPieces);
      assert.notDeepEqual(next, state.player, `route blocked at ${state.player}`);
      state.player = next;
    }
  }
  assert.match(interact(state, partitions), /archive/i);
  assert.equal(state.collected, true);
  state.wallPieces.find(p => p.material === 'drywall').hp = 0;
  const fresh = createMission(partitions, defaults);
  assert.ok(fresh.wallPieces.every(p => p.hp > 0));
  assert.deepEqual(createMission(partitions, { ...defaults, entryPoint: 'west gallery' }).player, [-8, -4.25]);
});
