import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maps } from '../src/maps/index.js';
import { martelli } from '../src/maps/martelli.js';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission, canSee, obstacles, intersectsBox } from '../src/simulation.js';
import { findGuardPath } from '../src/navigation.js';
import { mapPosts, assignGuards } from '../src/guard-posts.js';
import { seededRandom, rollTraits, traitNames, sightHalfAngle, sightRangeFactor, suspicionFactor, paceFactor, lingerFactor } from '../src/guard-traits.js';

const quiet = { ...defaults, awareness: 0, invulnerable: true, guardCount: 8 };
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const homes = state => state.guards.map(g => `${g.path[0]}|${g.pathElevations?.[0] ?? g.elevation}`);

test('without a seed the fixed patrol lines and neutral guards are unchanged', () => {
  const state = createMission(martelli, quiet);
  assert.equal(state.missionSeed, 0);
  state.guards.forEach((guard, index) => {
    assert.deepEqual(guard.position, martelli.patrols[index][0]);
    assert.equal(guard.path, martelli.patrols[index]);
    assert.equal(guard.traits, undefined); assert.equal(guard.routine, undefined);
    assert.equal(sightHalfAngle(guard), Math.PI / 5);
    for (const factor of [sightRangeFactor, suspicionFactor, paceFactor, lingerFactor]) assert.equal(factor(guard), 1);
  });
});

test('a seed replays exactly and different seeds place guards differently', () => {
  const a = createMission(martelli, { ...quiet, missionSeed: 4242 }), b = createMission(martelli, { ...quiet, missionSeed: 4242 });
  assert.deepEqual(a.guards, b.guards); assert.equal(a.missionSeed, 4242);
  const layouts = new Set();
  for (let seed = 1; seed <= 25; seed++) layouts.add(homes(createMission(martelli, { ...quiet, missionSeed: seed })).join('|'));
  assert.ok(layouts.size >= 24, `only ${layouts.size} distinct layouts in 25 seeds`);
});

test('every Martelli post is standable and reachable on foot from the entry', () => {
  const state = createMission(martelli, { ...quiet, guardCount: 0 }), posts = mapPosts(martelli);
  assert.ok(posts.length >= 16);
  const entry = posts.find(p => p.name === 'entry');
  for (const post of posts) {
    const boxes = obstacles(martelli, state.doors, state.wallPieces, true, post.elevation);
    assert.equal(boxes.some(box => intersectsBox(post.position, post.position, box, 0.3)), false, `${post.name} is obstructed`);
    const route = findGuardPath(state, martelli, entry.position, entry.elevation, post.position, post.elevation);
    assert.ok(post === entry || route.length && gap(route.at(-1).position, post.position) < 0.5, `${post.name} is unreachable`);
  }
});

test('seeded guards start apart, on clear ground, with a round of at least two posts on every map', () => {
  for (const map of Object.values(maps)) for (let seed = 1; seed <= 30; seed++) {
    const state = createMission(map, { ...quiet, missionSeed: seed });
    assert.equal(state.guards.length, Math.min(8, quiet.guardCount));
    state.guards.forEach((guard, index) => {
      assert.ok(guard.path.length >= 2 && guard.path.length <= 4);
      assert.ok(new Set(guard.path.map((p, n) => `${p}|${guard.pathElevations[n]}`)).size === guard.path.length, 'a round repeats a post');
      assert.ok(Number.isFinite(guard.heading));
      const boxes = obstacles(map, state.doors, state.wallPieces, true, guard.elevation);
      assert.equal(boxes.some(box => intersectsBox(guard.position, guard.position, box, 0.28)), false, `${map.name} seed ${seed} guard ${index} starts obstructed`);
      for (const name of traitNames) assert.ok(guard.traits[name] >= 0 && guard.traits[name] <= 1);
    });
    assert.equal(new Set(homes(state)).size, state.guards.length, `${map.name} seed ${seed} stacks guards`);
  }
});

test('critical posts are usually covered but never guaranteed', () => {
  const counts = {};
  for (let seed = 1; seed <= 300; seed++) for (const plan of assignGuards(martelli, 3, seed)) counts[plan.pathNames[0]] = (counts[plan.pathNames[0]] ?? 0) + 1;
  assert.ok(counts.archive > counts['primary bath'] * 3, JSON.stringify(counts));
  assert.ok(counts.archive > 60 && counts.archive < 240, `archive guarded in ${counts.archive}/300 missions`);
  assert.ok(Object.keys(counts).length >= 20, 'some posts are never used');
});

test('perception widens or narrows what a guard notices; traits average out to ordinary', () => {
  const guard = perception => ({ position: [0, 0], heading: 0, traits: { perception } });
  const rules = { ...defaults, sightRange: 8 };
  const at = degrees => [Math.cos(degrees * Math.PI / 180) * 3, Math.sin(degrees * Math.PI / 180) * 3];
  assert.equal(canSee(guard(1), at(42), rules, []), true);
  assert.equal(canSee(guard(0.5), at(42), rules, []), false);
  assert.equal(canSee(guard(0.5), at(33), rules, []), true);
  assert.equal(canSee(guard(0), at(33), rules, []), false);
  assert.equal(canSee(guard(1), [8.8, 0], rules, []), true);
  assert.equal(canSee(guard(0.5), [8.8, 0], rules, []), false);
  assert.ok(suspicionFactor(guard(1)) > 1.4 && suspicionFactor(guard(0)) < 0.7);
  const random = seededRandom(7), rolls = Array.from({ length: 2000 }, () => rollTraits(random).perception);
  const mean = rolls.reduce((sum, v) => sum + v, 0) / rolls.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03);
  assert.ok(rolls.some(v => v < 0.15) && rolls.some(v => v > 0.85));
});

test('guards walk their rounds, pause to look around, and the whole run is reproducible', () => {
  const run = (seed, steps) => {
    const rules = { ...quiet, guardCount: 5, missionSeed: seed }, state = createMission(martelli, rules);
    state.status = 'active'; state.player = [-15, 13];
    const visited = state.guards.map(() => new Set()), paused = state.guards.map(() => false);
    let early = null;
    for (let step = 0; step < steps; step++) {
      if (step === 500) early = structuredClone(state.guards.map(g => [g.position, g.heading, g.waypoint]));
      stepMission(state, martelli, rules, 0.05, { x: 0, z: 0 });
      state.guards.forEach((guard, index) => {
        guard.path.forEach((stop, n) => { if (gap(guard.position, stop) < 0.6 && Math.abs(guard.elevation - guard.pathElevations[n]) < 0.5) visited[index].add(n); });
        if (guard.routine.pauseUntil != null) paused[index] = true;
      });
    }
    return { state, visited, paused, early: early ?? structuredClone(state.guards.map(g => [g.position, g.heading, g.waypoint])) };
  };
  const first = run(31, 2400), second = run(31, 500);
  assert.deepEqual(first.early, second.early);
  first.state.guards.forEach((guard, index) => {
    assert.equal(guard.mode, 'patrol');
    assert.ok(first.visited[index].size >= 2, `guard ${index} reached ${first.visited[index].size} of ${guard.path.length} posts (${guard.pathNames})`);
    assert.ok(first.paused[index], `guard ${index} never paused`);
    const boxes = obstacles(martelli, first.state.doors, first.state.wallPieces, true, guard.elevation);
    assert.equal(boxes.some(box => intersectsBox(guard.position, guard.position, box, 0.2)), false, `guard ${index} ended inside an obstacle`);
  });
});

test('a round interrupted by an alert resumes without skipping posts as "stuck"', () => {
  const rules = { ...quiet, guardCount: 1, missionSeed: 5 }, state = createMission(courtyard, rules);
  state.status = 'active'; state.player = [50, 50];
  const guard = state.guards[0];
  stepMission(state, courtyard, rules, 0.05, { x: 0, z: 0 });
  guard.target = { position: [...guard.path[0]], elevation: guard.elevation, kind: 'site', time: state.elapsed }; guard.mode = 'investigate';
  stepMission(state, courtyard, rules, 0.05, { x: 0, z: 0 });
  assert.notEqual(guard.mode, 'patrol');
  const waypoint = guard.waypoint;
  for (let step = 0; step < 300; step++) stepMission(state, courtyard, rules, 0.05, { x: 0, z: 0 });
  assert.equal(guard.mode, 'patrol');
  // On the first step back, a 15 s absence is not mistaken for 5 s without progress.
  stepMission(state, courtyard, rules, 0.05, { x: 0, z: 0 });
  assert.ok(guard.waypoint === waypoint || guard.routine.pauseUntil != null || gap(guard.position, guard.path[waypoint]) < 0.6);
});

test('Martelli guards can cross doorways and change floors by the half landing', () => {
  const state = createMission(martelli, { ...quiet, guardCount: 0 });
  const route = (from, fromY, to, toY) => findGuardPath(state, martelli, from, fromY, to, toY);
  const posts = Object.fromEntries(mapPosts(martelli).map(p => [p.name, p]));
  for (const [a, b] of [['entry', 'archive'], ['archive', 'primary bath'], ['bedroom 4', 'bedroom 2'], ['bar', 'rear deck']]) {
    const path = route(posts[a].position, posts[a].elevation, posts[b].position, posts[b].elevation);
    assert.ok(path.length && gap(path.at(-1).position, posts[b].position) < 0.4 && Math.abs(path.at(-1).elevation - posts[b].elevation) < 0.1, `${a} -> ${b}`);
    if (posts[a].elevation !== posts[b].elevation) assert.ok(path.some(step => Math.abs(step.elevation - 1.6) < 0.05), `${a} -> ${b} skips the landing`);
  }
});
