import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli as map } from '../src/maps/martelli.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { fireWeapon } from '../src/weapons.js';
import { defaultLoadout, equip } from '../src/kit.js';

// .50 BMG breaks masonry walls (owner, 2026-11-13); every other round still stops at them.
const mission = (kind, model) => {
  const loadout = defaultLoadout(); if (model) loadout.weapons[kind].model = model;
  const state = createMission(map, { ...defaults, guardCount: 0 }, loadout); state.status = 'active';
  equip(state, kind); state.drawStart = undefined;
  return state;
};
// A masonry wall piece and a shot that reaches it first, square on from 1.5 m away.
function target(state) {
  for (const piece of state.wallPieces) {
    if (piece.material !== 'masonry' || !piece.blastOnly || piece.floor || piece.stair || piece.hp <= 0) continue;
    const thin = piece.size[0] < piece.size[2] ? 0 : 2;
    for (const side of [-1, 1]) {
      const direction = [0, 0, 0]; direction[thin] = -side;
      const origin = [...piece.center]; origin[thin] += side * 1.5;
      if (origin[1] < 0.5) continue;
      const probe = mission('rifle');
      const shot = fireWeapon(probe, map, defaults, origin, direction);
      if (shot?.impacts[0]?.piece === piece.id) return { id: piece.id, origin, direction };
    }
  }
  return null;
}

test('a .50 BMG breaks a masonry wall in three hits and the round carries on through', () => {
  for (const model of ['tac50', 'm107a1']) {
    const state = mission('sniper', model), aim = target(state);
    assert.ok(aim, 'found a masonry wall to shoot');
    const piece = () => state.wallPieces.find(p => p.id === aim.id);
    const first = fireWeapon(state, map, defaults, aim.origin, aim.direction);
    assert.ok(piece().hp < 10 && piece().hp > 0, `${model} chips it`);
    assert.ok(!first.stopped || first.impacts.length > 1, `${model} goes through`);
    for (let i = 0; i < 2; i++) { state.elapsed += 2; state.reloadUntil = 0; fireWeapon(state, map, defaults, aim.origin, aim.direction); }
    assert.ok(piece().hp <= 0, `${model} breaks it`);
  }
});

test('other rounds, the .338 sniper included, still stop at masonry and leave it whole', () => {
  for (const [kind, model] of [['rifle'], ['sniper', 'mrad338'], ['lmg', 'mmg338']]) {
    const state = mission(kind, model), aim = target(state);
    const shot = fireWeapon(state, map, defaults, aim.origin, aim.direction);
    assert.equal(state.wallPieces.find(p => p.id === aim.id).hp, 10, `${kind} ${model ?? ''}`);
    assert.ok(shot.stopped, 'stops in the wall');
  }
});
