import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { activeProps, propBox, propTipped } from '../src/world.js';
import { pushProp, tipPose, canTip, tipping } from '../src/furniture-tip.js';
import { fireWeapon } from '../src/weapons.js';
import { equip } from '../src/kit.js';
import { damageCount } from '../src/spatial.js';

const mission = () => { const state = createMission(martelli, { ...defaults, guardCount: 0 }); state.status = 'active'; return state; };
const chair = martelli.props.findIndex(p => p.kind === 'chair');
const stool = martelli.props.findIndex(p => p.kind === 'barStool');
const sofa = martelli.props.findIndex(p => p.kind === 'sofa');

test('chairs and stools can tip; heavier pieces cannot', () => {
  assert.ok(chair >= 0 && stool >= 0);
  assert.ok(canTip(martelli.props[chair]) && canTip(martelli.props[stool]));
  assert.ok(!canTip(martelli.props[sofa]));
  const state = mission();
  assert.equal(pushProp(state, martelli, defaults, sofa, [1, 0], 'blast'), false);
});

test('a chair tips after enough hits, away from them, and only once', () => {
  const state = mission();
  assert.equal(pushProp(state, martelli, defaults, chair, [1, 0], 'bullet'), false);
  assert.equal(pushProp(state, martelli, defaults, chair, [1, 0], 'bullet'), false);
  assert.equal(pushProp(state, martelli, defaults, chair, [1, 0], 'bullet'), true);
  assert.ok(propTipped(state, chair));
  assert.deepEqual(state.propTipped[chair].dir, [1, 0]);
  assert.equal(pushProp(state, martelli, defaults, chair, [-1, 0], 'blast'), false, 'already down');
  assert.ok(state.events.some(e => e.type === 'furniture-tip' && e.index === chair));
});

test('a tipped chair is out of the way: walkable, shots pass, low for sight, and caches see the change', () => {
  const state = mission(), before = damageCount(state);
  pushProp(state, martelli, defaults, stool, [0, 1], 'melee');
  assert.ok(!activeProps(state, martelli).includes(martelli.props[stool]));
  assert.equal(propBox(state, martelli, stool), null);
  assert.equal(propBox(state, martelli, stool, 'bullet'), null);
  const low = propBox(state, martelli, stool, 'sight');
  assert.ok(low.tipped && low.size[1] <= tipping.lyingHeight + 1e-9);
  assert.notEqual(damageCount(state), before, 'route and cover caches refresh');
});

test('the rule "Breakable furniture" off means nothing tips', () => {
  const state = mission();
  assert.equal(pushProp(state, martelli, { ...defaults, destructibleFurniture: false }, chair, [1, 0], 'blast'), false);
});

test('a shotgun blast at a chair knocks it over', () => {
  // Find a chair and a side with a clear shot at it.
  let done = false;
  for (const [index, target] of martelli.props.entries()) {
    if (target.kind !== 'chair' || done) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const state = mission();
      equip(state, 'shotgun'); state.drawStart = undefined;
      const from = [target.position[0] - dx * 1.5, (target.elevation ?? 0) + 0.45, target.position[1] - dz * 1.5];
      const shot = fireWeapon(state, martelli, defaults, from, [dx, 0, dz]);
      if (shot.pellets[0].impacts[0]?.kind !== 'prop' || shot.pellets[0].impacts[0]?.index !== index) continue;
      assert.ok(propTipped(state, index), JSON.stringify(state.propPush));
      assert.ok(Math.sign(state.propTipped[index].dir[0]) === Math.sign(dx) || Math.sign(state.propTipped[index].dir[1]) === Math.sign(dz), 'falls away from the shot');
      done = true; break;
    }
  }
  assert.ok(done, 'found a chair with a clear shot');
});

test('the fall turns about the floor edge toward the push and ends nearly flat', () => {
  const prop = martelli.props[chair], tip = { dir: [1, 0], at: 0 };
  const start = tipPose(prop, tip, 0), end = tipPose(prop, tip, 10);
  assert.equal(start.angle, 0);
  assert.ok(end.done && Math.abs(end.angle - tipping.angle) < 1e-9);
  assert.ok(end.pivot[0] > prop.position[0], 'pivot on the far edge');
  assert.equal(end.pivot[1], prop.elevation ?? 0);
});
