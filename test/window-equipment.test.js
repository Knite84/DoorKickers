import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { lodge } from '../src/maps/lodge.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { equip } from '../src/kit.js';
import { useEquipment, stepEquipment } from '../src/equipment.js';
import { segmentClear } from '../src/combat.js';

const pane = x => ({ position: [x, 0], size: [0.04, 2], sill: 0.3, height: 2 });
const arena = { ...courtyard, walls: [], doors: [], props: [], windows: [pane(1)], patrols: [[[2, 0], [3, 0]]] };
const rules = { ...defaults, patrolSpeed: 0, friendlyFire: false };
const ready = (map = arena) => { const state = createMission(map, rules); state.status = 'active'; return state; };
const tick = (state, map, dt = 0.05) => { state.elapsed += dt; stepEquipment(state, map, rules, dt); };

test('axe and crowbar shatter the nearest pane, keep reusable tools, and cannot strike the guard behind it', () => {
  for (const tool of ['axe', 'crowbar']) {
    const state = ready(); equip(state, tool);
    const result = useEquipment(state, arena, rules, [0, 1.65, 0], [1, 0, 0]);
    assert.match(result, /window shattered/i);
    assert.equal(state.windowHealth[0], 0);
    assert.equal(state.guards[0].health, 100);
    assert.equal(state.inventory.items[tool], 1);
    assert.equal(state.events.filter(e => e.type === 'glass-break').length, 1);
    assert.ok(state.guards[0].alertUntil > state.elapsed);
    assert.equal(segmentClear(state, arena, [0, 1.65, 0], [1.5, 1.65, 0]), true);
  }
});

test('melee glass hits respect reach, elevation, walls, doors, and cooldown', () => {
  for (const tool of ['axe', 'crowbar']) {
    for (const map of [
      { ...arena, windows: [pane(3)] },
      { ...arena, windows: [{ ...pane(1), elevation: 3.2 }] },
      { ...arena, walls: [{ center: [0.5, 0], size: [0.2, 3] }] },
      { ...arena, doors: [{ position: [0.5, 0], size: [0.2, 3] }] },
    ]) {
      const state = ready(map); equip(state, tool);
      useEquipment(state, map, rules, [0, 1.65, 0], [1, 0, 0]);
      assert.equal(state.windowHealth[0], 1);
    }
    const map = { ...arena, windows: [pane(1), pane(1.5)] }, state = ready(map); equip(state, tool);
    useEquipment(state, map, rules, [0, 1.65, 0], [1, 0, 0]);
    useEquipment(state, map, rules, [0, 1.65, 0], [1, 0, 0]);
    assert.deepEqual(state.windowHealth, [0, 1]);
    state.elapsed = state.nextUse;
    useEquipment(state, map, rules, [0, 1.65, 0], [1, 0, 0]);
    assert.deepEqual(state.windowHealth, [0, 0]);
  }
});

test('intact glass blocks knife attacks and invalid charge placement preserves det cord', () => {
  for (const tool of ['knife', 'detcord']) {
    const state = ready(); state.guards[0].position = [1.3, 0]; equip(state, tool);
    const count = state.inventory.items[tool];
    useEquipment(state, arena, rules, [0, 1.65, 0], [1, 0, 0]);
    assert.equal(state.windowHealth[0], 1); assert.equal(state.guards[0].health, 100);
    assert.equal(state.inventory.items[tool], count); assert.equal(state.devices.length, 0);
  }
});

test('grenades, flashbangs and molotovs break glass and continue flying without early detonation', () => {
  for (const type of ['grenade', 'flashbang', 'molotov']) {
    const state = ready(); equip(state, type);
    const count = state.inventory.items[type];
    useEquipment(state, arena, rules, [0, 1.65, 0], [1, 0, 0]);
    const projectile = state.projectiles[0], fuse = projectile.expires;
    for (let i = 0; i < 4; i++) tick(state, arena);
    assert.equal(state.windowHealth[0], 0, type);
    assert.ok(projectile.position[0] > 1.5, type);
    assert.equal(projectile.velocity[0], 9); assert.equal(projectile.settled, false);
    assert.equal(projectile.expires, fuse); assert.equal(state.projectiles.length, 1);
    assert.equal(state.inventory.items[type], count - 1);
    assert.equal(state.events.filter(e => e.type === 'glass-break').length, 1);
    assert.ok(!state.events.some(e => ['blast', 'flash', 'fire'].includes(e.type)));
  }
});

test('projectile sweeps break multiple thin panes but solid cover shields glass beyond it', () => {
  for (const cover of ['none', 'wall', 'door']) {
    const map = { ...arena, windows: [pane(0.5), pane(1.25)] };
    if (cover === 'wall') map.walls = [{ center: [0.9, 0], size: [0.1, 3] }];
    if (cover === 'door') map.doors = [{ position: [0.9, 0], size: [0.1, 3] }];
    const state = ready(map); equip(state, 'flashbang');
    useEquipment(state, map, rules, [0, 1.65, 0], [1, 0, 0]); tick(state, map, 0.2);
    assert.deepEqual(state.windowHealth, cover === 'none' ? [0, 0] : [0, 1]);
    assert.equal(state.projectiles[0].velocity[0], cover === 'none' ? 9 : 0);
  }
  const map = { ...arena, doors: [{ position: [0.5, 0], size: [0.1, 3] }] }, state = ready(map);
  equip(state, 'grenade'); useEquipment(state, map, rules, [0, 1.65, 0], [1, 0, 0]); tick(state, map, 0.2);
  assert.equal(state.windowHealth[0], 1, 'closed door in front shields the first pane too');
});

test('throwing past a pane or through already broken glass does not emit a new break', () => {
  for (const origin of [[0, 4.85, 0], [0, 1.65, 2]]) {
    const state = ready(); equip(state, 'grenade'); useEquipment(state, arena, rules, origin, [1, 0, 0]);
    tick(state, arena, 0.2); assert.equal(state.windowHealth[0], 1);
  }
  const state = ready(); state.windowHealth[0] = 0; equip(state, 'flashbang');
  useEquipment(state, arena, rules, [0, 1.65, 0], [1, 0, 0]); tick(state, arena, 0.2);
  assert.ok(state.projectiles[0].position[0] > 1);
  assert.ok(!state.events.some(e => e.type === 'glass-break'));
});

test('actual lodge window openings admit thrown items on both stories', () => {
  for (const base of [0, 3.2]) for (const type of ['grenade', 'flashbang', 'molotov']) {
    const state = ready(lodge), index = lodge.windows.findIndex(w => w.position[0] === -8 && w.position[1] === 12 && (w.elevation ?? 0) === base);
    assert.ok(index >= 0); equip(state, type);
    useEquipment(state, lodge, rules, [-8, base + 1.65, 13], [0, 0, -1]);
    for (let i = 0; i < 4; i++) tick(state, lodge);
    assert.equal(state.windowHealth[index], 0, `${type} floor ${base}`);
    assert.ok(state.projectiles[0].position[2] < 12);
    assert.equal(state.projectiles[0].settled, false);
  }
});
