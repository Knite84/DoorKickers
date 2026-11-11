import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission } from '../src/simulation.js';
import { damageGuard, sendGuardReport } from '../src/combat.js';
import { fireWeapon } from '../src/weapons.js';
import { equip } from '../src/kit.js';
import { guardPose, guardWeaponPose, hitGuard, stepBodies, rayCapsule } from '../src/npc-body.js';
import { createGuardVisual } from '../src/npc-visual.js';
import * as THREE from 'three';

const arena = { ...courtyard, walls: [], doors: [], props: [], patrols: [[[2, 0], [6, 0]], [[-5, 2], [-5, 4]]] };
const rules = { ...defaults, awareness: 0, patrolSpeed: 1, gunshotAlerts: false };
const ready = () => { const state = createMission(arena, rules); state.status = 'active'; return state; };
const advance = (state, seconds, map = arena, hz = 60) => { for (let i = 0; i < seconds * hz; i++) stepMission(state, map, rules, 1 / hz, { x: 0, z: 0 }); };
const shoot = (state, y, z = 0) => { equip(state, 'pistol'); return fireWeapon(state, arena, { ...rules, weaponDamage: 10 }, [0, y, z], [1, 0, 0]); };

test('engaging guards raise their arms, face the player and fire from the visible muzzle', () => {
  const state = ready(), guard = state.guards[0]; state.guards = [guard];
  state.player = [5,1]; guard.suspicion = 1;
  const combatRules = { ...rules, patrolSpeed: 0, awareness: 3, invulnerable: true };
  stepMission(state,arena,combatRules,0.05,{x:0,z:0});
  assert.deepEqual(guard.aimTarget,[5,1.65,1]);
  assert.equal(guard.heading,Math.atan2(1,3));
  const pose = guardPose(guard), attachment = guardWeaponPose(guard);
  for (const side of ['left','right']) {
    assert.ok(pose[`${side}Hand`][1] > 1.3);
    const reach = pose[`${side}Hand`].map((v,i)=>v-pose[`${side}Shoulder`][i]);
    assert.ok(reach[0]*3+reach[2] > 1.3,'hands extend toward player');
  }
  assert.deepEqual(state.events.find(e=>e.type==='guard-shot').origin,attachment.muzzle);
  const visual = createGuardVisual(color=>new THREE.MeshStandardMaterial({color}));
  visual.userData.update(guard);
  const gun = visual.getObjectByName('guard-pistol');
  assert.equal(gun.visible,true);
  assert.deepEqual(gun.position.toArray(),attachment.position);
  assert.ok(new THREE.Vector3(1,0,0).applyQuaternion(gun.quaternion).distanceTo(new THREE.Vector3(...attachment.direction))<1e-8);
  state.events = [];
  stepMission(state,arena,combatRules,0.1,{x:0,z:0});
  assert.ok(guard.aimTarget,'arms stay raised during the firing cooldown');
  assert.equal(state.events.some(e=>e.type==='guard-shot'),false);
  assert.ok(guard.recoil<1);
  state.crouched = true;
  stepMission(state,arena,combatRules,0.05,{x:0,z:0});
  assert.equal(guard.aimTarget[1],1);
  assert.ok(guardWeaponPose(guard).direction[1]<0,'pistol tracks crouching player');
  guard.stunnedUntil = state.elapsed+1;
  stepMission(state,arena,combatRules,0.05,{x:0,z:0});
  assert.equal(guard.aimTarget,null);
  assert.ok(guardPose(guard).rightHand[1]<1);
});

test('aiming follows elevation and injuries, then clears for cover, holstering and death', () => {
  const guard = ready().guards[0];
  guard.elevation = 3.2; guard.aimTarget = [7,6,0]; guard.injuries = { rightArm: 1 };
  const pose = guardPose(guard), weapon = guardWeaponPose(guard);
  assert.deepEqual(weapon.position,pose.leftHand);
  assert.ok(pose.leftHand[1]>4.6);
  assert.ok(pose.rightHand[1]<4.5,'injured arm stays tucked in');
  assert.ok(weapon.direction[1]>0);
  guard.injuries.leftArm = 1;
  assert.equal(guardWeaponPose(guard).visible,false);
  for (const end of ['cover','holster','death']) {
    const state = ready(), g = state.guards[0]; state.guards = [g];
    state.player = [5,0]; g.suspicion = 1;
    const combatRules = { ...rules, patrolSpeed: 0, awareness: 3, invulnerable: true };
    stepMission(state,arena,combatRules,0.05,{x:0,z:0});
    assert.ok(g.aimTarget);
    if (end==='cover') state.player = [-5,0];
    if (end==='holster') equip(state,'unarmed');
    if (end==='death') damageGuard(state,g,100,{zone:'head'});
    stepMission(state,arena,combatRules,0.05,{x:0,z:0});
    assert.equal(g.aimTarget,null,end);
    if (end==='death') assert.equal(guardWeaponPose(g).visible,false);
  }
});

test('shots distinguish legs, arms, stomach, chest and head, with heading-aware hit capsules', () => {
  for (const [y, z, zone] of [[0.45, -0.15, 'leftLeg'], [0.45, 0.15, 'rightLeg'], [1.06, -0.36, 'leftArm'], [1.06, 0.36, 'rightArm'], [1, 0, 'stomach'], [1.43, 0, 'chest'], [1.65, 0, 'head']]) {
    const state = ready(), guard = state.guards[0];
    const result = shoot(state, y, z);
    assert.equal(result.impacts.find(p => p.kind === 'guard')?.zone, zone);
    assert.equal(guard.lastHitZone, zone);
    assert.equal(state.kills, zone === 'head' ? 1 : 0);
  }
  const guard = ready().guards[0]; guard.heading = Math.PI / 2;
  assert.equal(hitGuard(guard, [2.36, 1.06, -2], [0, 0, 1]).zone, 'leftArm');
  assert.equal(hitGuard(guard, [2, 1.65, -2], [0, 0, 1]).zone, 'head');
  assert.ok(Math.abs(rayCapsule([0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], 0.2) - 1.8) < 1e-8);
});

test('leg wounds persist, reduce actual travel, animate a limp, and reset on deployment', () => {
  const healthy = ready(), wounded = ready(); shoot(wounded, 0.45, -0.15);
  // Isolate the same patrol gait from the injury's retreat and backup request.
  wounded.guards[0].woundThreat = null;
  wounded.guards[0].target = null; wounded.guards[0].mode = 'patrol';
  advance(healthy, 0.5); advance(wounded, 0.5);
  const normalTravel = healthy.guards[0].position[0] - 2, limpTravel = wounded.guards[0].position[0] - 2;
  assert.ok(limpTravel > 0 && limpTravel < normalTravel * 0.55);
  const pose = guardPose(wounded.guards[0]);
  assert.notEqual(pose.leftFoot[0] - pose.leftHip[0], pose.rightFoot[0] - pose.rightHip[0]);
  assert.equal(wounded.guards[0].ragdoll, undefined);
  assert.equal(ready().guards[0].injuries, undefined);
});

test('arm wounds bring the other hand across, slow fire, and two injured arms prevent firing', () => {
  const state = ready(), guard = state.guards[0]; state.guards = [guard]; shoot(state, 1.06, -0.36);
  const pose = guardPose(guard);
  assert.ok(pose.rightHand[2] < 0, 'healthy hand reaches across to wounded arm');
  assert.ok(pose.leftHand[1] > 1, 'wounded arm bends protectively');
  guard.suspicion = 1; state.player = [4, 0];
  const combatRules = { ...rules, awareness: 3, sightRange: 10, guardDamage: 5 };
  stepMission(state, arena, combatRules, 0.05, { x: 0, z: 0 });
  assert.equal(guard.nextShot, state.elapsed + 1.8);
  damageGuard(state, guard, 1, { zone: 'rightArm' });
  state.events = []; guard.nextShot = 0;
  stepMission(state, arena, combatRules, 0.05, { x: 0, z: 0 });
  assert.ok(!state.events.some(e => e.type === 'guard-shot'));
});

test('nonlethal chest/stomach hits incapacitate without kills or further AI/radio activity', () => {
  for (const y of [1, 1.43]) {
    const state = ready(), guard = state.guards[0]; shoot(state, y);
    assert.ok(guard.health > 0 && guard.incapacitated);
    assert.equal(state.kills, 0);
    assert.ok(state.guardReports.some(r => r.kind === 'injury'));
    const count = state.guardReports.length;
    sendGuardReport(state, guard, { kind: 'sighting', position: state.player });
    assert.equal(state.guardReports.length, count);
    advance(state, 4);
    assert.equal(guard.mode, 'wounded');
    assert.ok(guardPose(guard).head[1] < 0.6);
    assert.ok(!state.events.some(e => e.type === 'guard-shot'));
  }
});

test('headshots drop under gravity near the original location; joints settle without stretching', () => {
  const state = ready(), guard = state.guards[0]; shoot(state, 1.65);
  const initial = [...guardPose(guard).head];
  advance(state, 5);
  const pose = guardPose(guard);
  assert.equal(guard.ragdoll.reaction, 'limp');
  assert.ok(pose.head[1] < initial[1] - 1);
  assert.ok(Math.hypot(guard.position[0] - 2, guard.position[1]) < 1);
  for (const p of Object.values(pose)) assert.ok(p.every(Number.isFinite) && p[1] >= 0.089);
  assert.ok(Math.abs(Math.hypot(...pose.head.map((v, i) => v - pose.neck[i])) - 0.22) < 0.025);
  assert.ok(Math.hypot(...pose.leftFoot.map((v, i) => v - pose.leftHip[i])) >= 0.30);
});

test('abdominal survivors roll onto a side; death releases their active curl and posed hits can finish them', () => {
  const state = ready(), guard = state.guards[0]; shoot(state, 1);
  advance(state, 5);
  const pose = guardPose(guard);
  assert.ok(Math.abs(pose.leftShoulder[1] - pose.rightShoulder[1]) > 0.35);
  assert.equal(hitGuard(guard, [0, 1.65, 0], [1, 0, 0]), null, 'old standing head hitbox is gone');
  const head = pose.head;
  state.elapsed += 1;
  const result = fireWeapon(state, arena, rules, [head[0], head[1] + 2, head[2]], [0, -1, 0]);
  assert.equal(result.headshot, true); assert.equal(guard.health, 0); assert.equal(state.kills, 1);
  assert.equal(guard.ragdoll.reaction, 'limp');
});

test('bodies rest on remaining upper-floor support and fall when it is destroyed', () => {
  const state = ready(), guard = state.guards[0]; guard.elevation = 3.2;
  state.wallPieces = [{ center: [2, 3.1, 0], size: [8, 0.2, 8], hp: 100, floor: true }];
  damageGuard(state, guard, 100, { zone: 'head' }); advance(state, 4);
  for (const point of Object.values(guardPose(guard))) assert.ok(point[1] >= 3.28);
  state.wallPieces[0].hp = 0; advance(state, 4);
  assert.ok(guardPose(guard).head[1] < 0.6);
});

test('ragdolls respect walls/closed doors and paused simulation freezes their pose', () => {
  for (const kind of ['wall', 'door', 'prop', 'window']) {
    const state = ready(), guard = state.guards[0]; guard.position = [0, 0];
    const map = { ...arena, doors: [], props: [], windows: [] };
    const center = [0.4, 1.4, 0], size = [0.1, 2.8, 4];
    if (kind === 'wall') state.wallPieces = [{ center, size, hp: 100 }];
    if (kind === 'door') { map.doors = [{ position: [0.4, 0], size: [0.1, 4] }]; state.doors = [false]; }
    if (kind === 'prop') map.props = [{ position: [0.4, 0], size: [0.1, 4] }];
    if (kind === 'window') { map.windows = [{ position: [0.4, 0], size: [0.1, 4], sill: 0, height: 2.8 }]; state.windowHealth = [1]; }
    damageGuard(state, guard, 100, { zone: 'head' }); advance(state, 3, map);
    for (const point of Object.values(guardPose(guard))) assert.ok(point[0] < 0.36, `${kind} must block collapse`);
    state.status = 'paused'; const pose = structuredClone(guardPose(guard)); advance(state, 1, map);
    assert.deepEqual(guardPose(guard), pose);
  }
});

test('fixed physics steps agree at 30/60/120 fps, and meshes follow simulated joints', () => {
  const poses = [30, 60, 120].map(hz => {
    const state = ready(); damageGuard(state, state.guards[0], 100, { zone: 'head' });
    for (let i = 0; i < hz * 3; i++) stepBodies(state, arena, 1 / hz);
    return guardPose(state.guards[0]);
  });
  assert.deepEqual(poses[0], poses[1]); assert.deepEqual(poses[1], poses[2]);
  const guard = ready().guards[0], visual = createGuardVisual(color => new THREE.MeshStandardMaterial({ color }));
  visual.userData.update(guard);
  assert.ok(visual.children.some(mesh => mesh.position.distanceTo(new THREE.Vector3(...guardPose(guard).head)) < 1e-8));
  assert.ok(visual.children.every(mesh => mesh.position.toArray().every(Number.isFinite) && mesh.quaternion.toArray().every(Number.isFinite)));
  const shaft = visual.children[0]; shaft.geometry.computeBoundingBox();
  const height = shaft.geometry.boundingBox.max.y - shaft.geometry.boundingBox.min.y;
  const pose = guardPose(guard), expectedLength = Math.hypot(...pose.pelvis.map((v, i) => v - pose.chest[i]));
  assert.ok(Math.abs(height * shaft.scale.y - expectedLength) < 1e-8, 'rendered torso length matches hit capsule endpoints');
});
