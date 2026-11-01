import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, restoreSavedRules } from '../src/rules.js';
import { courtyard as map } from '../src/maps/courtyard.js';
import { buildWallPieces, damageWall, rayBox } from '../src/destruction.js';
import { createMission, stepMission, movePlayer, obstacles, lineOfSight } from '../src/simulation.js';
import { fireWeapon, reload } from '../src/weapons.js';

test('retired lab settings restore guards without resetting other custom rule sets', () => {
  const oldLab = { ...defaults, entryPoint: 'breach practice', guardCount: 0, invulnerable: true, unlimitedAmmo: true };
  assert.deepEqual(restoreSavedRules(oldLab), defaults);
  assert.deepEqual(restoreSavedRules({ ...oldLab, budget: 500 }), { ...oldLab, entryPoint: 'west gallery', budget: 500 });
  const custom = { ...defaults, guardCount: 0, unlimitedAmmo: true };
  assert.deepEqual(restoreSavedRules(custom), custom);
});

test('both normal entry points keep guards and destructible walls in the same mission', () => {
  for (const entryPoint of ['courtyard', 'west gallery']) {
    const state = createMission(map, { ...defaults, entryPoint });
    assert.equal(state.guards.length, 3);
    assert.equal(state.ammo, 30);
    assert.ok(state.wallPieces.some(piece => piece.material === 'drywall' && piece.hp > 0));
    assert.deepEqual(state.player, map.entries[entryPoint].position);
  }
});

test('3D ray hits nearest surface and misses above or beside geometry', () => {
  assert.equal(rayBox([-2, 1, 0], [1, 0, 0], [0, 1, 0], [0.2, 2, 2]), 1.9);
  assert.equal(rayBox([-2, 3, 0], [1, 0, 0], [0, 1, 0], [0.2, 2, 2]), null);
  assert.equal(rayBox([-2, 1, 3], [1, 0, 0], [0, 1, 0], [0.2, 2, 2]), null);
});
test('drywall skins break independently and expose durable framing', () => {
  const pieces = buildWallPieces(map);
  const skin = pieces.find(p => p.material === 'drywall' && p.center[1] > 1);
  const opposite = pieces.find(p => p.material === 'drywall' && p.center[0] !== skin.center[0] && p.center[1] === skin.center[1] && p.center[2] === skin.center[2]);
  assert.ok(opposite);
  damageWall(pieces, skin, 1);
  assert.ok(skin.hp <= 0); assert.equal(opposite.hp, 1);
  const stud = pieces.find(p => p.material === 'timber');
  damageWall(pieces, stud, 1); assert.equal(stud.hp, 3);
  damageWall(pieces, stud, 3); assert.equal(stud.hp, 0);
});
test('wall holes change sight and passage; a high hole alone cannot be walked through', () => {
  const state = createMission(map, defaults);
  const a = [-2, -5], b = [0, -5];
  assert.equal(lineOfSight(a, b, obstacles(map, state.doors, state.wallPieces)), false);
  for (const piece of state.wallPieces) if (piece.wall === 6 && piece.center[1] > 1.2 && piece.center[1] < 2) piece.hp = 0;
  assert.equal(lineOfSight(a, b, obstacles(map, state.doors, state.wallPieces)), true);
  assert.deepEqual(movePlayer(a, [2, 0], map, state.doors, false, state.wallPieces), a);
  for (const piece of state.wallPieces) if (piece.wall === 6) piece.hp = 0;
  assert.deepEqual(movePlayer(a, [2, 0], map, state.doors, false, state.wallPieces), b);
});
test('shots respect wall occlusion, then hit a guard through a cleared opening', () => {
  const rules = { ...defaults, gunshotAlerts: false };
  const state = createMission(map, rules); state.status = 'active';
  // Standard pistol rounds stop inside an intact partition.
  state.inventory.equipped = 'pistol';
  const origin = [-3, 1.1, -5], direction = [1, 0, 0];
  const shot = fireWeapon(state, map, rules, origin, direction);
  assert.equal(shot.kind, 'wall'); assert.equal(state.guards[0].health, 100);
  for (const piece of state.wallPieces) if (piece.wall === 6) piece.hp = 0;
  state.elapsed = 1; assert.equal(fireWeapon(state, map, rules, origin, direction).kind, 'guard');
  assert.equal(state.guards[0].health, 65);
  state.elapsed = 2; fireWeapon(state, map, rules, origin, direction);
  assert.equal(state.guards[0].health, 30);
  state.elapsed = 3; fireWeapon(state, map, rules, origin, direction);
  assert.equal(state.guards[0].health, 0); assert.equal(state.kills, 1);
});
test('ammo, cooldown, reload, unlimited mode, pause, and wall immunity', () => {
  const state = createMission(map, { ...defaults, guardCount: 0 }); state.status = 'active';
  const args = [map, defaults, [-3, 1.65, -5], [1, 0, 0]];
  fireWeapon(state, ...args); assert.equal(state.ammo, 29);
  assert.equal(fireWeapon(state, ...args), null);
  assert.equal(reload(state), true);
  state.elapsed = 1; assert.equal(fireWeapon(state, ...args), null);
  stepMission(state, map, defaults, 0.5, { x: 0, z: 0 }); assert.equal(state.ammo, 30);
  fireWeapon(state, map, { ...defaults, unlimitedAmmo: true }, args[2], args[3]); assert.equal(state.ammo, 30);
  state.ammo = 0; state.elapsed = 3;
  assert.ok(fireWeapon(state, map, { ...defaults, unlimitedAmmo: true }, args[2], args[3]));
  assert.equal(state.ammo, 0);
  state.status = 'paused'; state.elapsed = 4; assert.equal(fireWeapon(state, ...args), null);
  state.status = 'active';
  state.ammo = 30;
  const before = state.wallPieces.map(p => p.hp);
  fireWeapon(state, map, { ...defaults, destructibleWalls: false }, args[2], args[3]);
  assert.deepEqual(state.wallPieces.map(p => p.hp), before);
});
test('sustained fire actually clears both skins and a stud before reaching a guard', () => {
  const rules = { ...defaults, unlimitedAmmo: true, gunshotAlerts: false };
  const state = createMission(map, rules); state.status = 'active';
  state.guards[0].position = [2, -6];
  const hits = [];
  for (let i = 0; i < 8; i++) {
    state.elapsed = i * 0.12;
    const hit = fireWeapon(state, map, rules, [-3, 1.1, -6], [1, 0, 0]);
    hits.push(hit.material ?? hit.kind);
  }
  assert.deepEqual(hits, ['timber', 'timber', 'timber', 'timber', 'timber', 'guard', 'guard', 'guard']);
  assert.equal(state.guards[0].health, 0);
});
test('creeping overrides running, and each speed is configurable', () => {
  function travel(input) {
    const state = createMission(map, { ...defaults, guardCount: 0 }); state.status = 'active';
    stepMission(state, map, defaults, 0.1, { x: 1, z: 0, ...input });
    return state.player[0] - map.spawn[0];
  }
  assert.ok(Math.abs(travel({ running: true }) / travel({}) - defaults.runMultiplier) < 1e-8);
  assert.ok(Math.abs(travel({ running: true, creep: true }) / travel({}) - defaults.creepMultiplier) < 1e-8);
});
test('gunfire alerts living guards; disabled alerts and dead guards remain inactive', () => {
  for (const enabled of [false, true]) {
    const state = createMission(map, defaults); state.status = 'active';
    fireWeapon(state, map, { ...defaults, gunshotAlerts: enabled }, [0, 1.65, 5], [0, 1, 0]);
    assert.equal(state.guards[0].alertUntil > 0, enabled);
  }
  const state = createMission(map, defaults); state.status = 'active'; state.guards[0].health = 0; state.guards[0].suspicion = 1;
  stepMission(state, map, defaults, 0.1, { x: 0, z: 0 });
  assert.equal(state.guards[0].suspicion, 0); assert.equal(state.status, 'active');
});
