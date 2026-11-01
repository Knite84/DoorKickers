import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { stepEquipment } from '../src/equipment.js';
import { damagePlayer } from '../src/combat.js';

const rules = { ...defaults, friendlyFire: true, guardCount: 1 };
const arena = { ...courtyard, walls: [], doors: [], props: [], patrols: [[[1, 0], [2, 0]]] };
function ready(map) {
  const state = createMission(map, rules); state.status = 'active'; return state;
}
function grenade(state, map, position) {
  state.projectiles.push({ type: 'grenade', position, expires: state.elapsed, settled: true });
  stepEquipment(state, map, rules, 0.01);
}

test('an intact partition protects the player and NPC from the grenade that destroys it', () => {
  const map = { ...arena, walls: [{ center: [0, 0], size: [0.35, 5], destructible: true }] };
  const state = ready(map); state.player = [-0.8, 0]; state.guards[0].position = [-1, 0];
  grenade(state, map, [0.8, 0.15, 0]);
  assert.equal(state.health, 100); assert.equal(state.guards[0].health, 100);
  assert.equal(state.hurtUntil, 0); assert.equal(state.status, 'active');
  assert.ok(state.wallPieces.some(piece => piece.hp <= 0));
  // Once the opening exists, it no longer protects against a later grenade.
  grenade(state, map, [0.8, 0.15, 0]);
  assert.equal(state.health, 0); assert.equal(state.guards[0].health, 0);
});

test('a grenade in the next room spares a player behind the wall beside an open doorway', () => {
  const map = { ...arena, walls: [
    { center: [0, -2.5], size: [0.35, 3], destructible: true },
    { center: [0, 2.5], size: [0.35, 3], destructible: true },
  ], doors: [{ position: [0, 0], size: [0.3, 2] }] };
  const covered = ready(map); covered.doors[0] = true; covered.player = [-0.8, 2.8];
  grenade(covered, map, [0.8, 0.15, 0]);
  assert.equal(covered.health, 100); assert.equal(covered.hurtUntil, 0);
  const exposed = ready(map); exposed.doors[0] = true; exposed.player = [-0.8, 0];
  grenade(exposed, map, [0.8, 0.15, 0]);
  assert.equal(exposed.health, 0);
});

test('closed doors and masonry provide cover; open or previously destroyed doors do not', () => {
  for (const kind of ['closed', 'open', 'destroyed', 'masonry']) {
    const map = { ...arena,
      walls: kind === 'masonry' ? [{ center: [0, 0], size: [0.35, 5] }] : [],
      doors: kind === 'masonry' ? [] : [{ position: [0, 0], size: [0.3, 2] }],
    };
    const state = ready(map); state.player = [-0.8, 0];
    if (kind === 'open' || kind === 'destroyed') state.doors[0] = true;
    if (kind === 'destroyed') state.doorHealth[0] = 0;
    grenade(state, map, [0.8, 0.15, 0]);
    assert.equal(state.health, ['closed', 'masonry'].includes(kind) ? 100 : 0, kind);
  }
});

test('decorative concealment does not absorb grenade damage and zero damage gives no hurt feedback', () => {
  const map = { ...arena, props: [{ kind: 'planter', position: [0, 0], size: [0.3, 3] }] };
  const state = ready(map); state.player = [-0.8, 0];
  grenade(state, map, [0.8, 0.15, 0]); assert.equal(state.health, 0);
  const unhurt = ready(arena); unhurt.elapsed = 5;
  damagePlayer(unhurt, rules, 0); assert.equal(unhurt.hurtUntil, 0); assert.equal(unhurt.health, 100);
});
