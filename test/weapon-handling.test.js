import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults, schema } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { equip, weapons } from '../src/kit.js';
import { fireWeapon, reload } from '../src/weapons.js';
import { weaponModels } from '../src/weapon-models.js';
import {
  handling, drawTime, holsterShare, quickDraw, weaponReady, drawWindow, shownItem, drawDrop,
  createHandling, fireKick, stepHandling, weaponPose, cycleProgress, ejectsBetween, scopeUp, fieldOfView, hipPosition,
} from '../src/weapon-handling.js';

const DT = 1 / 60;
const mission = (rules = defaults) => { const state = createMission(courtyard, { ...rules, guardCount: 0 }); state.status = 'active'; return state; };

test('both new gunplay rules exist and are on by default', () => {
  assert.equal(schema.muzzleClimb.value, true);
  assert.equal(schema.drawDelay.value, true);
});

test('a fresh mission starts with the weapon ready', () => {
  const state = mission();
  assert.ok(weaponReady(state, defaults));
  assert.equal(drawWindow(state, defaults), null);
});

test('switching lowers the old item, raises the new one, and only then is it ready', () => {
  const state = mission();
  state.elapsed = 10;
  assert.ok(equip(state, 'pistol'));
  const span = drawWindow(state, defaults);
  assert.ok(Math.abs(span.lowered - (10 + drawTime('rifle') * holsterShare)) < 1e-9);
  assert.ok(Math.abs(span.end - span.lowered - drawTime('pistol')) < 1e-9);
  assert.ok(!weaponReady(state, defaults));
  state.elapsed = span.lowered - 0.01;
  assert.equal(shownItem(state, defaults), 'rifle');
  state.elapsed = span.lowered + 0.01;
  assert.equal(shownItem(state, defaults), 'pistol');
  assert.ok(drawDrop(state, defaults) > 0.9);
  state.elapsed = span.end;
  assert.ok(weaponReady(state, defaults));
  assert.equal(drawDrop(state, defaults), 0);
});

test('re-selecting the item already in hand does not start a switch', () => {
  const state = mission();
  state.elapsed = 5;
  equip(state, 'rifle');
  assert.ok(weaponReady(state, defaults));
});

test('with the draw-delay rule off the weapon is always ready and the animation is quicker', () => {
  const rules = { ...defaults, drawDelay: false }, state = mission(rules);
  state.elapsed = 3; equip(state, 'sniper');
  assert.ok(weaponReady(state, rules));
  const quick = drawWindow(state, rules), full = drawWindow(state, defaults);
  assert.ok(Math.abs((quick.end - quick.start) - (full.end - full.start) * quickDraw) < 1e-9);
});

test('the weapon simulation itself is untouched: fireWeapon still fires straight after a switch', () => {
  const state = mission();
  state.elapsed = 1; equip(state, 'pistol');
  assert.ok(fireWeapon(state, courtyard, defaults, [0, 1.6, 0], [0, 0, -1]));
});

test('every handled firearm has a model sight, a casing and a moving magazine or box', () => {
  for (const [id, spec] of Object.entries(handling)) {
    assert.ok(weapons[id], `${id} is a weapon`);
    if (id === 'minigun') continue;
    const model = weaponModels[id];
    assert.equal(model.sight.length, 3); assert.equal(model.port.length, 3); assert.equal(model.casing.length, 3);
    if (spec.reload === 'magazine') assert.ok(model.parts.some(p => p.moves === 'magazine'), `${id} has a magazine`);
    assert.ok(model.parts.some(p => p.moves === 'support'), `${id} has a support hand`);
    if (spec.cycle) assert.ok(model.parts.some(p => p.moves === spec.cycle), `${id} has a ${spec.cycle}`);
  }
});

test('each shot lifts the aim, holding fire climbs, and part of it settles back afterwards', () => {
  const h = createHandling();
  let pitch = 0;
  for (let shot = 0; shot < 10; shot++) {
    pitch += fireKick(h, 'rifle').pitch;
    for (let t = 0; t < weapons.rifle.interval - 1e-9; t += DT) pitch += stepHandling(h, DT, 'rifle').pitch;
  }
  const peak = pitch;
  assert.ok(peak > 0.08, `ten rifle shots climbed ${peak.toFixed(3)} rad`);
  for (let i = 0; i < 120; i++) pitch += stepHandling(h, DT, 'rifle').pitch;
  const settled = peak - pitch;
  assert.ok(settled > peak * 0.45 && settled < peak * 0.75, `settled ${settled.toFixed(3)} of ${peak.toFixed(3)}`);
});

test('aiming and crouching steady the climb; the rule off removes it but keeps the drawn kick', () => {
  const plain = fireKick(createHandling(), 'pistol').pitch;
  const steadied = fireKick(createHandling(), 'pistol', { aimed: true, crouched: true }).pitch;
  assert.ok(steadied < plain * 0.7);
  const h = createHandling(), off = fireKick(h, 'pistol', { climb: false });
  assert.deepEqual(off, { pitch: 0, yaw: 0 });
  stepHandling(h, 0.02, 'pistol');
  assert.ok(h.rise > 0.05, 'the weapon still kicks up');
});

test('the drawn kick springs back to rest', () => {
  const h = createHandling();
  fireKick(h, 'shotgun');
  for (let i = 0; i < 90; i++) stepHandling(h, DT, 'shotgun');
  assert.ok(Math.abs(h.back) < 1e-3 && Math.abs(h.rise) < 1e-3 && Math.abs(h.roll) < 1e-3);
});

test('aiming down the sights puts the sight on the crosshair', () => {
  for (const id of ['rifle', 'pistol', 'shotgun', 'sniper']) {
    const h = createHandling(), state = mission();
    for (let i = 0; i < 60; i++) stepHandling(h, DT, id, { aimed: true });
    assert.ok(scopeUp(h));
    const pose = weaponPose(h, state, defaults, id, { time: 0 });
    const sight = weaponModels[id].sight;
    // With no sway at time 0 and no kick, the sight lies on the camera's forward axis.
    assert.ok(Math.abs(pose.position[0] + sight[0]) < 1e-9, `${id} x`);
    assert.ok(Math.abs(pose.position[1] + sight[1]) < 1e-9, `${id} y`);
    assert.ok(pose.position[2] + sight[2] < -0.3, `${id} sight is in front of the eye`);
    assert.ok(fieldOfView(h, id) < 76);
  }
  const h = createHandling();
  assert.deepEqual(weaponPose(h, mission(), defaults, 'rifle', { time: 0 }).position, hipPosition);
});

test('the reload drops the magazine out of view and brings a new one back', () => {
  const state = mission();
  state.elapsed = 2; state.ammo = 10; assert.ok(reload(state));
  const h = createHandling(), at = r => { state.elapsed = 2 + weapons.rifle.reload * r; return weaponPose(h, state, defaults, 'rifle').parts.magazine; };
  assert.equal(at(0.4).visible, false);
  assert.ok(at(0.3).offset[1] < -0.1);
  assert.ok(Math.abs(at(0.95).offset[1]) < 1e-9);
});

test('the shotgun loads one shell per missing round and the sniper bolt cycles after a shot', () => {
  const state = mission();
  equip(state, 'shotgun'); state.drawStart = undefined;
  state.elapsed = 1; state.ammo = 4; reload(state);
  const h = createHandling();
  let shown = 0, last = false;
  for (let r = 0.15; r < 0.85; r += 0.005) {
    state.elapsed = 1 + weapons.shotgun.reload * r;
    const has = !!weaponPose(h, state, defaults, 'shotgun').parts.shell;
    if (has && !last) shown++;
    last = has;
  }
  assert.equal(shown, 2);

  const sniper = mission();
  equip(sniper, 'sniper'); sniper.drawStart = undefined; sniper.elapsed = 5;
  assert.ok(fireWeapon(sniper, courtyard, defaults, [0, 1.6, 0], [0, 0, -1]));
  let before = cycleProgress(sniper, 'sniper'), ejected = 0, travel = 0;
  for (let t = 0; t < weapons.sniper.interval; t += DT) {
    sniper.elapsed = 5 + t;
    const now = cycleProgress(sniper, 'sniper');
    if (ejectsBetween(before, now)) ejected++;
    before = now;
    travel = Math.max(travel, weaponPose(h, sniper, defaults, 'sniper').parts.bolt[2]);
  }
  assert.equal(ejected, 1);
  assert.ok(travel > 0.05);
});
