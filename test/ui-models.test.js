import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maps } from '../src/maps/index.js';
import { planBounds, planFit, drawPlan } from '../src/plan-view.js';
import { createTimeline, observeMission, summarize } from '../src/debrief.js';

test('plan bounds and fit keep every map inside the canvas', () => {
  for (const [id, map] of Object.entries(maps)) for (const level of (map.levels ?? [{ elevation: 0 }]).map((_, i) => i)) {
    const bounds = planBounds(map, level), fit = planFit(bounds, 400, 300);
    assert.ok(bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ, `${id} level ${level}`);
    for (const [x, z] of [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.maxZ]]) {
      assert.ok(fit.x(x) >= 0 && fit.x(x) <= 400 && fit.z(z) >= 0 && fit.z(z) <= 300, `${id} level ${level} leaves the canvas`);
    }
  }
});

test('drawing a plan only issues canvas calls, for every map and floor', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, name) => typeof name === 'string' ? (...args) => { calls.push(name); } : undefined, set: () => true });
  for (const map of Object.values(maps)) for (let level = 0; level < (map.levels?.length ?? 1); level++) drawPlan(ctx, map, level, 400, 300);
  assert.ok(calls.filter(name => name === 'fillRect').length > 50);
});

const state = (extra = {}) => ({ elapsed: 0, kills: 0, surrenders: 0, collected: false, health: 100, powerOn: true, guards: [{ health: 100, suspicion: 0, mode: 'patrol' }], doors: [], doorHealth: [], status: 'active', shots: 0, ...extra });

test('the timeline records what changed and when, and nothing when nothing did', () => {
  const timeline = createTimeline(), s = state();
  observeMission(timeline, s); observeMission(timeline, s);
  assert.deepEqual(timeline.events.map(e => e.text), ['Deployed.']);
  s.elapsed = 12; s.guards[0].mode = 'pursue'; observeMission(timeline, s);
  s.elapsed = 20; s.kills = 1; s.guards[0].health = 0; observeMission(timeline, s);
  s.elapsed = 31; s.collected = true; s.health = 20; observeMission(timeline, s);
  assert.deepEqual(timeline.events.map(e => `${e.clock} ${e.text}`), ['00:00 Deployed.', '00:12 Guards are hunting you.', '00:20 Guard eliminated.', '00:31 Archive secured.', '00:31 Critical injury.']);
  assert.equal(timeline.events[1].kind, 'danger');
});

test('the summary reports outcome, counts and the worst alert reached', () => {
  const timeline = createTimeline(), s = state({ guards: [{ health: 100, mode: 'patrol', suspicion: 0 }, { health: 100, mode: 'patrol', suspicion: 0 }] });
  observeMission(timeline, s);
  s.guards[0].suspicion = 0.5; observeMission(timeline, s);
  s.guards[0].suspicion = 0; observeMission(timeline, s);
  Object.assign(s, { elapsed: 95, status: 'complete', shots: 7, kills: 1, collected: true });
  const summary = summarize(s, timeline);
  assert.deepEqual([summary.outcome, summary.time, summary.shots, summary.kills, summary.untouched, summary.peakAlert, summary.archive], ['success', '01:35', 7, 1, 1, 'Suspected', true]);
  assert.equal(summarize({ ...s, status: 'captured' }, timeline).outcome, 'failure');
});
