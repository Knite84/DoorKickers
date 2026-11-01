import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validateRules } from '../src/rules.js';
import { courtyard as map } from '../src/maps/courtyard.js';
import { intersectsBox, lineOfSight, movePlayer, canSee, createMission, stepMission, interact, distance } from '../src/simulation.js';

test('rules imports reject out-of-range, malformed, and off-step values', () => {
  for (const rules of [{ guardCount: 99 }, { guardCount: 2.2 }, { awareness: null }, { ghost: 'true' }, { weather: 'hail' }, []]) {
    assert.throws(() => validateRules(rules));
  }
  assert.deepEqual(validateRules({ ghost: true }), { ...defaults, ghost: true });
});
test('line of sight handles parallel, grazing, and crossing segments', () => {
  const wall = { center: [0, 0], size: [2, 2] };
  assert.equal(intersectsBox([-3, 0], [3, 0], wall), true);
  assert.equal(intersectsBox([-3, 2], [3, 2], wall), false);
  assert.equal(intersectsBox([-3, 1], [3, 1], wall), true);
  assert.equal(lineOfSight([-3, 0], [3, 0], [wall]), false);
});
test('closed doors stop movement; open doors and ghost mode permit it', () => {
  const start = [-2, 1.8];
  const closed = map.doors.map(() => false);
  const open = map.doors.map(() => true);
  assert.deepEqual(movePlayer(start, [0, -1.5], map, closed), start);
  assert.deepEqual(movePlayer(start, [0, -1.5], map, open), [-2, 0.30000000000000004]);
  assert.deepEqual(movePlayer(start, [0, -1.5], map, closed, true), [-2, 0.30000000000000004]);
});
test('guard sight respects facing, obstructions, and weather', () => {
  const guard = { position: [0, 0], heading: 0 };
  assert.equal(canSee(guard, [5, 0], defaults, []), true);
  assert.equal(canSee(guard, [-2, 0], defaults, []), false);
  assert.equal(canSee(guard, [5, 0], { ...defaults, weather: 'fog' }, []), false);
  assert.equal(canSee(guard, [5, 0], defaults, [{ center: [2, 0], size: [0.3, 2] }]), false);
});
test('capture immunity and zero awareness are functional independent rules', () => {
  for (const modifier of [{}, { invulnerable: true }, { awareness: 0 }]) {
    const rules = { ...defaults, patrolSpeed: 0, ...modifier };
    const state = createMission(map, rules); state.status = 'active'; state.player = [4, -5];
    for (let i = 0; i < 100; i++) stepMission(state, map, rules, 0.05, { x: 0, z: 0 });
    assert.equal(state.status, modifier.invulnerable || modifier.awareness === 0 ? 'active' : 'captured');
  }
});
test('pause freezes mission time, suspicion, and movement', () => {
  const state = createMission(map, defaults); state.status = 'paused';
  const before = structuredClone(state);
  stepMission(state, map, defaults, 1, { x: 1, z: 0 });
  assert.deepEqual(state, before);
});
test('mission requires collection before extraction, and interaction works', () => {
  const state = createMission(map, { ...defaults, guardCount: 0 }); state.status = 'active';
  stepMission(state, map, defaults, 0.1, { x: 0, z: 0 });
  assert.equal(state.status, 'active');
  state.player = [...map.objective.position]; interact(state, map);
  assert.equal(state.collected, true);
  state.player = [...map.spawn]; stepMission(state, map, defaults, 0.1, { x: 0, z: 0 });
  assert.equal(state.status, 'complete');
});
test('default map has a traversable retrieval route without ghost mode', () => {
  const rules = { ...defaults, guardCount: 0 };
  const state = createMission(map, rules); state.status = 'active';
  const travelTo = target => {
    for (let i = 0; i < 1000 && distance(state.player, target) > 0.08; i++) {
      stepMission(state, map, rules, 0.01, { x: target[0] - state.player[0], z: target[1] - state.player[1] });
    }
    assert.ok(distance(state.player, target) < 0.1, `Blocked en route to ${target}: ${state.player}`);
  };
  travelTo([-2, 3]); travelTo([-2, 2]); interact(state, map);
  assert.equal(state.doors[0], true);
  travelTo([-2, -2]); interact(state, map);
  assert.equal(state.doors[1], true);
  travelTo([1, -2]); travelTo([7, -2]); travelTo([7, -5]); interact(state, map);
  assert.equal(state.collected, true);
  travelTo([7, -2]); travelTo([-2, -2]); travelTo([-2, 3]);
  // Stop just inside the extraction radius: winning freezes simulation.
  for (let i = 0; i < 1000 && state.status === 'active'; i++) stepMission(state, map, rules, 0.01, { x: -10 - state.player[0], z: 8 - state.player[1] });
  assert.equal(state.status, 'complete');
});
