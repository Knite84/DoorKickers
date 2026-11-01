import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { lodge } from '../src/maps/lodge.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission } from '../src/simulation.js';
import { equip, toggleHolster, isArmed } from '../src/kit.js';
import { damageGuard } from '../src/combat.js';

const arena = { ...courtyard, bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 }, walls: [], doors: [], props: [], patrols: [[[0, 0], [1, 0]], [[-6, 4], [-6, 5]], [[-6, -4], [-6, -5]]] };
const rules = { ...defaults, awareness: 3, patrolSpeed: 1.25, sightRange: 8, guardDamage: 5, invulnerable: true };
function ready(map = arena, options = rules) { const state = createMission(map, options); state.status = 'active'; state.player = [3, 0]; return state; }
const tick = (state, map = arena, seconds = 0.05, options = rules, input = { x: 0, z: 0 }) => stepMission(state, map, options, seconds, input);
function advance(state, map, seconds, options = rules) { for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) tick(state, map, 0.05, options); }

test('confirmed sightings communicate the observed location, without tracking an unseen player', () => {
  const state = ready(); tick(state, arena, 0.6);
  assert.ok(state.guardReports.some(report => report.kind === 'sighting' && report.armed));
  assert.deepEqual(state.guards[1].target.position, [3, 0]); assert.equal(state.guards[1].mode, 'pursue');
  state.player = [7, 5]; tick(state);
  assert.deepEqual(state.guards[1].target.position, [3, 0]);
  assert.equal(state.status, 'active');
});

test('unarmed detention keeps movement and inventory available while backup approaches slowly', () => {
  const state = ready(arena, { ...rules, invulnerable: false }); state.player = [1.4, 0]; toggleHolster(state);
  assert.equal(isArmed(state), false); assert.equal(state.inventory.equipped, 'unarmed');
  const before = [...state.guards[1].position]; tick(state, arena, 0.6, { ...rules, invulnerable: false });
  assert.equal(state.detainingGuardId, 0); assert.equal(state.guards[0].mode, 'detain');
  assert.equal(state.guards[1].mode, 'gather'); assert.equal(state.health, 100); assert.equal(state.status, 'active');
  const travel = Math.hypot(...state.guards[1].position.map((v, i) => v - before[i]));
  assert.ok(travel > 0 && travel <= rules.patrolSpeed * 0.45 * 0.6 + 1e-6);
  const playerBefore = [...state.player]; tick(state, arena, 0.1, rules, { x: 0, z: 1 });
  assert.notDeepEqual(state.player, playerBefore); assert.equal(state.status, 'active');
  equip(state, 'pistol'); tick(state, arena, 0.05, { ...rules, invulnerable: false });
  assert.equal(state.detainingGuardId, null); assert.ok(state.guardReports.some(report => report.kind === 'weapon'));
  assert.ok(state.health < 100); assert.equal(state.guards[1].mode, 'pursue');
});

test('holstering preserves magazines and non-weapons differ from dangerous held items', () => {
  const state = ready(); state.ammo = 17; toggleHolster(state); assert.equal(state.ammo, 0);
  toggleHolster(state); assert.equal(state.inventory.equipped, 'rifle'); assert.equal(state.ammo, 17);
  for (const id of ['medkit', 'pickgun', 'unarmed']) { equip(state, id); assert.equal(isArmed(state), false, id); }
  for (const id of ['rifle', 'axe', 'grenade', 'minigun']) { equip(state, id); assert.equal(isArmed(state), true, id); }
});

test('a wounded guard calls immediately even with gunshot alerts disabled; a lethal hit cannot radio', () => {
  const state = ready(); damageGuard(state, state.guards[0], 10);
  assert.equal(state.guardReports.at(-1).kind, 'injury');
  assert.deepEqual(state.guards[1].pendingReport.position, [0, 0]);
  state.player = [7, 5]; tick(state, arena, 0.05, { ...rules, awareness: 0, gunshotAlerts: false });
  assert.equal(state.guards[1].mode, 'investigate');
  const count = state.guardReports.length; damageGuard(state, state.guards[0], 100);
  assert.equal(state.guardReports.length, count); damageGuard(state, state.guards[1], 0);
  assert.equal(state.guardReports.length, count);
});

test('guards visually discover incapacitated teammates and each category of damaged structure', () => {
  for (const kind of ['body', 'stunned', 'wall', 'floor', 'window', 'door']) {
    const map = { ...arena,
      walls: kind === 'wall' ? [{ center: [3, 0], size: [0.3, 4], destructible: true }] : [],
      floors: kind === 'floor' ? [{ center: [1, 0], size: [8, 6], elevation: 3.2 }] : [],
      windows: kind === 'window' ? [{ position: [3, 0], size: [0.08, 2], sill: 0.8, height: 1.5 }] : [],
      doors: kind === 'door' ? [{ position: [3, 0], size: [0.3, 2] }] : [],
    };
    const options = { ...rules, awareness: 0, patrolSpeed: 0 }, state = ready(map, options); state.player = [-7, 5];
    if (kind === 'body' || kind === 'stunned') { state.guards[1].position = [3, 0]; if (kind === 'body') state.guards[1].health = 0; else state.guards[1].stunnedUntil = 10; }
    if (kind === 'wall') state.wallPieces.find(p => p.material === 'drywall' && p.center[0] < 3 && Math.abs(p.center[1] - 1.4) < 0.1 && Math.abs(p.center[2]) < 0.5).hp = 0;
    if (kind === 'floor') { state.guards[0].elevation = 3.2; state.wallPieces.find(p => p.floor && p.material === 'particleboard' && p.center[0] > 2 && Math.abs(p.center[2]) < 1).hp--; }
    if (kind === 'window') state.windowHealth[0] = 0;
    if (kind === 'door') state.doorHealth[0]--;
    tick(state, map, 0.05, options);
    assert.ok(state.guardReports.some(report => kind === 'body' || kind === 'stunned' ? report.kind === 'body' : report.label === kind), kind);
    assert.equal(state.guards[0].mode, 'investigate', kind);
  }
});

test('environment discoveries require line of sight and do not reveal the player location', () => {
  const map = { ...arena, walls: [{ center: [1.5, 0], size: [0.4, 8] }], doors: [{ position: [3, 0], size: [0.3, 2] }] };
  const state = ready(map); state.player = [-7, 5]; state.doorHealth[0]--;
  tick(state, map, 0.05, { ...rules, awareness: 0, patrolSpeed: 0 });
  assert.equal(state.guardReports.length, 0); assert.equal(state.guards[0].target, undefined);
});

test('pursuit routes around walls and opens authorized doors without walking through them', () => {
  const map = { ...arena, walls: [{ center: [0, -3.5], size: [0.3, 5] }, { center: [0, 3.5], size: [0.3, 5] }], doors: [{ position: [0, 0], size: [0.3, 2], locked: true }] };
  const state = ready(map); state.guards = [state.guards[0]]; const guard = state.guards[0];
  guard.position = [-4, 3]; guard.target = { position: [4, 3], elevation: 0, kind: 'player', armed: true, time: 0 }; guard.mode = 'pursue'; state.player = [4, 3];
  for (let i = 0; i < 200; i++) {
    tick(state, map);
    if (Math.abs(guard.position[0]) < 0.4) assert.ok(Math.abs(guard.position[1]) < 0.8);
  }
  assert.ok(guard.position[0] > 2); assert.equal(state.doors[0], true); assert.equal(state.doorHealth[0], 120);
});

test('guards adapt routes to new breaches and use lodge stairs to reach another story', () => {
  const map = { ...arena, walls: [{ center: [0, 0], size: [0.3, 12], destructible: true }] };
  const state = ready(map); state.guards = [state.guards[0]]; const guard = state.guards[0]; guard.position = [-3, 0];
  guard.target = { position: [3, 0], elevation: 0, kind: 'player', armed: true, time: 0 }; guard.mode = 'pursue'; state.player = [3, 0];
  advance(state, map, 2); assert.ok(guard.position[0] < 0);
  for (const piece of state.wallPieces) if (Math.abs(piece.center[2]) < 1) piece.hp = 0;
  advance(state, map, 5); assert.ok(guard.position[0] > 1);
  const upstairs = ready(lodge); upstairs.guards = [upstairs.guards[0]]; const climber = upstairs.guards[0]; climber.position = [-12, 0.5]; climber.elevation = 0;
  climber.mode = 'pursue'; climber.target = { position: [-6, -9], elevation: 3.2, kind: 'player', armed: true, time: 0 }; upstairs.player = [-6, -9]; upstairs.playerY = 3.2;
  advance(upstairs, lodge, 11);
  assert.ok(climber.elevation > 3, JSON.stringify({ position: climber.position, y: climber.elevation, mode: climber.mode, target: climber.target, route: climber.route?.slice(0, 3) })); assert.ok(climber.position[0] > -9);
});
