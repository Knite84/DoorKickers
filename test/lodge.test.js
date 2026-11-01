import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lodge } from '../src/maps/lodge.js';
import { courtyard } from '../src/maps/courtyard.js';
import { createMission, stepMission, toggleCrouch, interact, movePlayer, canSee } from '../src/simulation.js';
import { defaults } from '../src/rules.js';
import { damageWall, removeUnsupportedPieces } from '../src/destruction.js';
import { equip, defaultLoadout, validateLoadout } from '../src/kit.js';
import { fireWeapon } from '../src/weapons.js';
import { useEquipment, stepEquipment, detonateCharges } from '../src/equipment.js';
import { segmentClear } from '../src/combat.js';
import { eyeHeight } from '../src/world.js';

const quiet = { ...defaults, awareness: 0, patrolSpeed: 0, friendlyFire: false, invulnerable: true, entryPoint: 'west gallery' };
const arena = { ...courtyard, walls: [], doors: [], props: [], patrols: [[[0, 0], [1, 0]]] };
function ready(map = lodge, rules = quiet) { const state = createMission(map, rules); state.status = 'active'; return state; }
function grenade(state, map, position) { state.projectiles.push({ type: 'grenade', position, expires: state.elapsed, settled: true }); stepEquipment(state, map, quiet, 0.01); }
function travel(state, target) {
  for (let i = 0; i < 1400; i++) {
    if (state.status === 'complete') return;
    const dx = target[0] - state.player[0], dz = target[1] - state.player[1];
    if (Math.hypot(dx, dz) < 0.12) return;
    // Open only unlocked doors encountered along the route.
    lodge.doors.forEach((door, index) => { if (Math.abs((door.elevation ?? 0) - state.playerY) < 0.5 && Math.hypot(door.position[0] - state.player[0], door.position[1] - state.player[1]) < 1.5 && !state.lockedDoors[index]) state.doors[index] = true; });
    const before = [...state.player]; stepMission(state, lodge, quiet, 0.025, { x: dx, z: dz });
    assert.notDeepEqual(state.player, before, `blocked at ${state.player} y=${state.playerY} toward ${target}`);
  }
  assert.fail(`never reached ${target}; at ${state.player}, y=${state.playerY}`);
}

test('lodge structure starts fully supported and has two stories, halls, windows and stronger floor layers', () => {
  const state = ready();
  assert.equal(lodge.levels.length, 2); assert.ok(lodge.rooms.length >= 16); assert.ok(lodge.windows.length >= 12);
  assert.equal(removeUnsupportedPieces(state.wallPieces).length, 0);
  const board = state.wallPieces.find(p => p.material === 'particleboard'), truss = state.wallPieces.find(p => p.material === 'truss');
  assert.ok(board.maxHp >= 20); assert.ok(truss.maxHp >= board.maxHp * 3);
  assert.ok(truss.size[1] > 0.4 && truss.size[0] > 0.038);
  damageWall(state.wallPieces, board, 1); assert.equal(board.hp, board.maxHp - 1);
});

test('a real route walks up stairs, quietly opens the upper archive, collects it and descends', () => {
  const state = ready(); travel(state, [-12, -9]); assert.ok(Math.abs(state.playerY - 3.2) < 0.01);
  travel(state, [0.8, -9]);
  assert.match(interact(state, lodge), /locked/i);
  equip(state, 'pickgun');
  assert.match(useEquipment(state, lodge, quiet, [state.player[0], state.playerY + 1.65, state.player[1]], [1, 0, 0]), /quietly/i);
  travel(state, [8, -9]); assert.match(interact(state, lodge), /secured/i); assert.equal(state.collected, true);
  travel(state, [-12, -9]); travel(state, [-12, 0.5]); assert.equal(state.playerY, 0);
  travel(state, [0, 0]); travel(state, [0, 10.7]);
  equip(state, 'pickgun'); useEquipment(state, lodge, quiet, [0, 1.65, state.player[1]], [0, 0, 1]);
  travel(state, [0, 15]); assert.equal(state.status, 'complete');
});

test('crouching lowers the eye and movement speed; creeping reduces suspicion more than crouching', () => {
  const scores = [];
  for (const posture of ['walk', 'crouch', 'creep']) {
    const rules = { ...defaults, patrolSpeed: 0 }, state = ready(arena, rules); state.player = [3, 0]; state.guards[0].heading = 0;
    if (posture === 'crouch') { toggleCrouch(state, arena); assert.equal(eyeHeight(state), 1); }
    stepMission(state, arena, rules, 0.5, { x: 0, z: 0, creep: posture === 'creep' });
    scores.push(state.guards[0].suspicion);
  }
  assert.ok(scores[2] < scores[1] && scores[1] < scores[0]);
  const state = ready(arena); state.player = [-5, 4]; toggleCrouch(state, arena);
  stepMission(state, arena, quiet, 0.1, { x: 1, z: 0, running: true });
  assert.ok(Math.abs(state.player[0] + 5 - defaults.playerSpeed * defaults.creepMultiplier * 0.1) < 1e-8);
});

test('intact glass admits sight, breaks under a bullet, and can then be climbed through', () => {
  const index = lodge.windows.findIndex(w => w.position[0] === -8 && w.elevation === 0), window = lodge.windows[index];
  const state = ready(); state.player = [-8, 12.9];
  assert.match(interact(state, lodge), /intact/i);
  assert.equal(segmentClear(state, lodge, [-8, 1.65, 13], [-8, 1.65, 11], -1, { glass: false }), true);
  const shot = fireWeapon(state, lodge, quiet, [-8, 1.65, 13], [0, 0, -1]);
  assert.equal(shot.impacts[0].kind, 'glass'); assert.equal(state.windowHealth[index], 0); assert.ok(shot.impacts.length > 1);
  assert.match(interact(state, lodge), /climbed/i); assert.ok(state.player[1] < window.position[1]);
});

test('exterior masonry ignores bullets and axes but explosives make a traversable opening', () => {
  const map = { ...arena, walls: [{ center: [0, 0], size: [0.4, 5] }] }, state = ready(map);
  const original = state.wallPieces.map(p => p.hp);
  fireWeapon(state, map, quiet, [-1, 1.5, 0], [1, 0, 0]);
  equip(state, 'axe'); useEquipment(state, map, quiet, [-1, 1.5, 0], [1, 0, 0]);
  assert.deepEqual(state.wallPieces.map(p => p.hp), original);
  grenade(state, map, [-0.3, 0.15, 0]);
  assert.ok(state.wallPieces.some(p => p.hp <= 0));
  assert.deepEqual(movePlayer([-1, 0], [2, 0], map, state.doors, false, state.wallPieces), [1, 0]);
});

test('floors stop sight and weak shots between stories; a large breach causes a fall', () => {
  const state = ready(); state.player = [6, 4]; state.playerY = 3.2;
  assert.equal(segmentClear(state, lodge, [6, 1.65, 4], [6, 4.85, 4], -1, { glass: false }), false);
  equip(state, 'pistol'); const shot = fireWeapon(state, lodge, quiet, [6, 4.85, 4], [0, -1, 0]);
  assert.equal(shot.impacts[0].material, 'particleboard'); assert.equal(shot.impacts.length, 1);
  for (const piece of state.wallPieces) if (piece.floor && Math.abs(piece.center[0] - 6) < 2 && Math.abs(piece.center[2] - 4) < 2) piece.hp = 0;
  for (let step = 0; step < 50; step++) stepMission(state, lodge, quiet, 0.05, { x: 0, z: 0 });
  assert.equal(state.playerY, 0);
});

test('picking gun is reusable, preserves door durability, and never alerts guards', () => {
  const map = { ...arena, doors: [{ position: [1, 0], size: [0.3, 2], locked: true }] }, state = ready(map, defaults);
  state.player = [0, 0]; state.guards[0].position = [2, 2]; assert.match(interact(state, map), /locked/i); equip(state, 'pickgun');
  assert.match(useEquipment(state, map, defaults, [0, 1.65, 0], [1, 0, 0]), /quietly/i);
  assert.equal(state.doors[0], true); assert.equal(state.lockedDoors[0], false); assert.equal(state.doorHealth[0], 120);
  assert.equal(state.inventory.items.pickgun, 1); assert.equal(state.guards[0].alertUntil, 0);
  const oldKit = defaultLoadout(); delete oldKit.items.pickgun; assert.equal(validateLoadout(oldKit).items.pickgun, 1);
});

test('crouching passes under a low breach and prevents standing into solid geometry', () => {
  const map = { ...arena, walls: [{ center: [0, 0], size: [0.3, 4], elevation: 1.2, height: 1.6 }] }, state = ready(map);
  assert.deepEqual(movePlayer([-1, 0], [2, 0], map, state.doors, false, state.wallPieces), [-1, 0]);
  toggleCrouch(state, map);
  assert.deepEqual(movePlayer([-1, 0], [2, 0], map, state.doors, false, state.wallPieces, { height: 1.1 }), [1, 0]);
  state.player = [0, 0]; assert.match(toggleCrouch(state, map), /clearance/i); assert.equal(state.crouched, true);
});

test('lowered crouch posture hides behind cover that would leave a standing player visible', () => {
  const map = { ...arena, walls: [{ center: [1.5, 0], size: [0.3, 4], height: 1.4 }] }, state = ready(map);
  state.player = [3, 0]; state.guards[0].heading = 0;
  assert.equal(canSee(state.guards[0], state.player, defaults, [], { state, map }), true);
  toggleCrouch(state, map);
  assert.equal(canSee(state.guards[0], state.player, defaults, [], { state, map }), false);
});

test('an upstairs grenade damages sheets before heavy trusses and the floor protects downstairs actors', () => {
  const rules = { ...quiet, friendlyFire: true, invulnerable: false }, state = ready(lodge, rules);
  state.player = [6, 4]; state.playerY = 0; state.guards[0].position = [6, 4];
  state.projectiles.push({ type: 'grenade', position: [6, 3.35, 4], expires: 0, settled: true }); stepEquipment(state, lodge, rules, 0.01);
  assert.equal(state.health, 100); assert.equal(state.guards[0].health, 100);
  assert.ok(state.wallPieces.some(piece => piece.material === 'particleboard' && piece.hp === 0));
  assert.ok(state.wallPieces.some(piece => piece.material === 'truss' && piece.hp > 0 && piece.hp < piece.maxHp));
});
