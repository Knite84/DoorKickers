import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertState, headingDegrees, compassPoint, damageBearing, damageArrowOpacity, healthTier, interactionPrompt, formatClock } from '../src/hud-model.js';

const guard = extra => ({ health: 100, suspicion: 0, mode: 'patrol', ...extra });

test('alert state is the most urgent live guard and ignores downed ones', () => {
  assert.equal(alertState({ guards: [] }).level, 0);
  assert.equal(alertState({ guards: [guard(), guard({ suspicion: 0.5 })] }).label, 'SUSPICIOUS');
  assert.equal(alertState({ guards: [guard({ mode: 'search' }), guard({ suspicion: 0.9 })] }).label, 'SEARCHING');
  assert.equal(alertState({ guards: [guard({ mode: 'pursue' }), guard()] }).label, 'HUNTED');
  assert.equal(alertState({ guards: [guard({ mode: 'pursue', health: 0 }), guard({ mode: 'pursue', incapacitated: true }), guard({ mode: 'surrender' })] }).level, 0);
});

test('compass headings run clockwise from plan up', () => {
  assert.equal(headingDegrees([0, -1]), 0);
  assert.equal(headingDegrees([1, 0]), 90);
  assert.equal(headingDegrees([0, 1]), 180);
  assert.equal(headingDegrees([-1, 0]), 270);
  assert.deepEqual([0, 45, 90, 180, 270, 359].map(compassPoint), ['N', 'NE', 'E', 'S', 'W', 'N']);
});

test('damage bearing is relative to where the player faces', () => {
  const player = [0, 0], facing = [0, -1];
  assert.equal(damageBearing(player, facing, [0, -5]), 0);
  assert.equal(damageBearing(player, facing, [5, 0]), 90);
  assert.equal(damageBearing(player, facing, [0, 5]), 180);
  assert.equal(damageBearing(player, facing, [-5, 0]), 270);
  assert.equal(damageBearing(player, [1, 0], [0, -5]), 270);
});

test('the damage arrow fades out and is absent before any hit', () => {
  assert.equal(damageArrowOpacity({ elapsed: 3 }), 0);
  const state = { elapsed: 10, lastHit: { time: 10, from: [0, 0] } };
  assert.equal(damageArrowOpacity(state), 1);
  state.elapsed = 10.8; assert.ok(Math.abs(damageArrowOpacity(state) - 0.5) < 1e-9);
  state.elapsed = 20; assert.equal(damageArrowOpacity(state), 0);
});

test('health tiers, prompts and the clock', () => {
  assert.deepEqual([100, 80, 50, 25, 0].map(healthTier), ['ok', 'hurt', 'low', 'critical', 'down']);
  assert.equal(interactionPrompt(null), '');
  assert.equal(interactionPrompt({ kind: 'door' }), 'E · Open door');
  assert.equal(interactionPrompt({ kind: 'door', open: true }), 'E · Close door');
  assert.equal(interactionPrompt({ kind: 'door', locked: true }), 'E · Locked');
  assert.equal(interactionPrompt({ kind: 'door', broken: true }), '');
  assert.equal(interactionPrompt({ kind: 'window', broken: true }), 'E · Climb through');
  assert.equal(interactionPrompt({ kind: 'window' }), '', 'intact glass has no prompt');
  assert.equal(interactionPrompt({ kind: 'window', broken: true, climbable: false }), '');
  assert.equal(formatClock(75.9), '01:15');
});
