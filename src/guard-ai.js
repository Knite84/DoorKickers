import { segmentClear, sendGuardReport } from './combat.js';
import { isArmed } from './kit.js';
import { elevation, playerEye, doorCenter, doorSize, windowCenter, windowSize, stairHeight, supportHeight } from './world.js';
import { rayBox } from './destruction.js';
import { findGuardPath, navigationFor } from './navigation.js';
import { guardDisabled, guardSpeed, guardShotInterval, guardEye } from './npc-body.js';
import { stepWoundedCover, fireGuardShot, coverClear } from './guard-tactics.js';
import { sightHalfAngle, suspicionFactor } from './guard-traits.js';
import { stepRoutine } from './guard-posts.js';

const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const eye = guardEye;
const weatherRange = rules => rules.sightRange * (rules.weather === 'fog' ? 0.6 : rules.weather === 'rain' ? 0.85 : 1);
function evidence(state, map) {
  const result = [];
  state.guards.forEach((guard, index) => {
    if (guardDisabled(guard) || guard.stunnedUntil > state.elapsed) result.push({ id: `body:${index}:${guardDisabled(guard) ? 'down' : guard.stunnedUntil}`, kind: 'body', guardId: index, center: [guard.position[0], elevation(guard) + 0.3, guard.position[1]], size: [0.8, 0.6, 0.8], elevation: elevation(guard), label: 'incapacitated guard' });
  });
  state.wallPieces.forEach(piece => {
    if (piece.hp < piece.maxHp) result.push({ id: `wall:${piece.wall}`, kind: 'damage', center: piece.center, size: piece.size, elevation: (piece.level ?? 0) * 3.2, label: piece.floor ? 'floor' : 'wall' });
  });
  map.doors.forEach((door, index) => {
    if (state.doorHealth[index] < state.doorMaxHealth[index]) result.push({ id: `door:${index}`, kind: 'damage', center: doorCenter(door), size: doorSize(door), elevation: elevation(door), label: 'door' });
  });
  (map.windows ?? []).forEach((window, index) => {
    if (state.windowHealth[index] <= 0) result.push({ id: `window:${index}`, kind: 'damage', center: windowCenter(window), size: windowSize(window), elevation: elevation(window), label: 'window' });
  });
  return result;
}
function observable(state, map, rules, guard, item) {
  const origin = eye(guard), length = Math.hypot(...item.center.map((v, i) => v - origin[i]));
  if (length > weatherRange(rules) + 0.5) return false;
  const angle = Math.atan2(item.center[2] - guard.position[1], item.center[0] - guard.position[0]);
  if (Math.cos(angle - guard.heading) < Math.cos(sightHalfAngle(guard)) && length > 0.8) return false;
  const direction = item.center.map((v, i) => (v - origin[i]) / (length || 1));
  const entry = rayBox(origin, direction, item.center, item.size, length) ?? length;
  const face = origin.map((v, i) => v + direction[i] * Math.max(0, entry - 0.04));
  return segmentClear(state, map, origin, face, -1, { glass: false });
}
function remember(guard, report) {
  guard.target = { position: [...report.position], elevation: report.elevation ?? 0, kind: ['sighting', 'weapon'].includes(report.kind) ? 'player' : report.kind === 'detain' ? 'gather' : 'site', armed: report.armed, time: report.time, senderId: report.senderId };
  guard.mode = guard.target.kind === 'player' ? 'pursue' : guard.target.kind === 'gather' ? 'gather' : 'investigate';
  guard.nextPathAt = 0;
}
function walk(guard, target, speed, state, map, delta, movePlayer) {
  if (speed <= 0 || gap(guard.position, target.position) < (target.precise?0.045:0.25) && Math.abs(elevation(guard) - target.elevation) < 0.3) return;
  const signature = navigationFor(state, map).signature;
  if (state.elapsed >= (guard.nextPathAt ?? 0) || guard.routeSignature !== signature || !guard.route || gap(guard.routeGoal ?? target.position, target.position) > 0.8) {
    guard.route = findGuardPath(state, map, guard.position, elevation(guard), target.position, target.elevation);
    guard.routeGoal = [...target.position]; guard.routeSignature = signature; guard.nextPathAt = state.elapsed + 1;
  }
  while (guard.route?.length && gap(guard.position, guard.route[0].position) < 0.16) guard.route.shift();
  const waypoint = target.precise && gap(guard.position,target.position)<0.7 ? target : guard.route?.[0];
  // Do not take a straight shortcut through an unreachable wall or floor.
  if (!waypoint) return;
  const dx = waypoint.position[0] - guard.position[0], dz = waypoint.position[1] - guard.position[1], length = Math.hypot(dx, dz);
  const travel = Math.min(length, speed * guardSpeed(guard) * delta);
  guard.heading = Math.atan2(dz, dx);
  // Guards have door access; opening it remains part of the shared world state.
  map.doors.forEach((door, index) => {
    if (!state.doors[index] && Math.abs(elevation(door) - elevation(guard)) < 0.55 && gap(guard.position, door.position) < 1.25) { state.lockedDoors[index] = false; state.doors[index] = true; }
  });
  const before = guard.position;
  guard.position = movePlayer(guard.position, [dx / (length || 1) * travel, dz / (length || 1) * travel], map, state.doors, false, state.wallPieces, { elevation: elevation(guard), height: 1.8, windows: state.windowHealth });
  guard.stride = (guard.stride ?? 0) + gap(before, guard.position) * 7;
  const stair = stairHeight(map, guard.position);
  guard.elevation = stair !== null && Math.abs(stair - elevation(guard)) < 0.5 ? stair : supportHeight(state, map, guard.position, elevation(guard));
}

export function stepGuards(state, map, rules, delta, { canSee, movePlayer }) {
  const armed = isArmed(state), priorLeader = state.guards.find(g => g.id === state.detainingGuardId && !g.wounded && !guardDisabled(g) && g.stunnedUntil <= state.elapsed);
  let leader = priorLeader && !armed ? priorLeader : null;
  state.detainingGuardId = null;
  const candidates = state.guards.some(g => g.health > 0 && state.elapsed >= (g.nextEvidenceAt ?? 0)) ? evidence(state, map) : [];
  for (const guard of state.guards) {
    guard.aimTarget = null;
    guard.recoil = Math.max(0, (guard.recoil ?? 0) - delta * 7);
    if (guardDisabled(guard)) { guard.suspicion = 0; guard.mode = guard.health <= 0 ? 'incapacitated' : 'wounded'; continue; }
    if (guard.stunnedUntil > state.elapsed) { guard.mode = 'stunned'; guard.duck=0; guard.lean=[0,0]; continue; }
    guard.mode ??= 'patrol'; guard.evidenceSeen ??= [];
    if (guard.pendingReport) {
      const report = guard.pendingReport; delete guard.pendingReport;
      const keepDetaining = guard === leader && guard.mode === 'detain' && report.armed === false;
      if (!(guard.target?.kind === 'player' && state.elapsed - guard.target.time < 10 && !['sighting', 'weapon', 'detain'].includes(report.kind))) remember(guard, report);
      if (keepDetaining) guard.mode = 'detain';
      if (['sighting', 'weapon'].includes(report.kind)) guard.suspicion = 1;
    }
    if (leader && guard !== leader && !armed) {
      guard.mode = 'gather'; guard.target = { position: [...leader.position], elevation: elevation(leader), kind: 'gather', senderId: leader.id, time: state.elapsed };
    }
    const rangeFactor = state.gait === 'creep' ? 0.65 : state.gait === 'crouch' ? 0.8 : 1;
    let seen = canSee(guard, state.player, rules, [], { state, map, rangeFactor }) && coverClear(state,map,eye(guard),playerEye(state));
    const gain = state.gait === 'creep' ? 0.15 : state.gait === 'crouch' ? 0.3 : state.gait === 'run' ? 0.9 : 0.6;
    guard.suspicion = Math.max(0, Math.min(1, guard.suspicion + delta * (seen ? rules.awareness * gain * suspicionFactor(guard) : -0.3)));
    if (seen && rules.awareness > 0 && (guard.suspicion >= 1 || guard.target?.kind === 'player' || guard.mode === 'detain' || guard.mode === 'gather')) {
      const priorArmed = guard.target?.armed, wasDetaining = guard.mode === 'detain';
      const report = { kind: armed && (wasDetaining || priorArmed === false) ? 'weapon' : 'sighting', position: [...state.player], elevation: state.playerY ?? 0, armed, time: state.elapsed };
      guard.target = { ...report, kind: 'player' }; guard.mode = 'pursue';
      if (state.elapsed >= (guard.nextSightReport ?? 0) || priorArmed !== armed) { sendGuardReport(state, guard, report); guard.nextSightReport = state.elapsed + 1; }
      if (!armed && !guard.wounded && gap(guard.position, state.player) <= 1.7 && Math.abs(elevation(guard) - (state.playerY ?? 0)) < 0.6 && (!leader || leader === guard)) {
        leader = guard; state.detainingGuardId = guard.id; guard.mode = 'detain';
        if (!wasDetaining || state.elapsed >= (guard.nextDetainReport ?? 0)) {
          sendGuardReport(state, guard, { kind: 'detain', position: [...guard.position], elevation: elevation(guard), armed: false }); guard.nextDetainReport = state.elapsed + 3;
        }
      } else if (!armed && leader && leader !== guard) {
        guard.mode = 'gather'; guard.target = { position: [...leader.position], elevation: elevation(leader), kind: 'gather', senderId: leader.id, time: state.elapsed };
      }
    }
    if (guard.mode === 'detain' && (!seen || armed || gap(guard.position, state.player) > 1.7)) { guard.mode = 'pursue'; if (leader === guard) leader = null; }
    if (state.elapsed >= (guard.nextEvidenceAt ?? 0)) {
      guard.nextEvidenceAt = state.elapsed + 0.65;
      const nearby = candidates.filter(item => item.guardId !== guard.id && !guard.evidenceSeen.includes(item.id) && Math.hypot(item.center[0] - guard.position[0], item.center[2] - guard.position[1]) <= weatherRange(rules) + 0.5).sort((a, b) => gap([a.center[0], a.center[2]], guard.position) - gap([b.center[0], b.center[2]], guard.position));
      const item = nearby.find(item => observable(state, map, rules, guard, item));
      if (item) {
        guard.evidenceSeen.push(item.id);
        const report = { kind: item.kind, position: [item.center[0], item.center[2]], elevation: item.elevation, label: item.label, time: state.elapsed };
        sendGuardReport(state, guard, report);
        if (guard.target?.kind !== 'player' && guard.mode !== 'gather' && guard.mode !== 'detain') remember(guard, report);
      }
    }
    if (guard.noiseTarget && guard.noiseTarget.time > (guard.lastNoiseAt ?? -1)) {
      guard.lastNoiseAt = guard.noiseTarget.time;
      if (!guard.target || state.elapsed - guard.target.time > 12) remember(guard, { ...guard.noiseTarget, kind: 'noise' });
    }
    if (guard.mode === 'gather') {
      const anchor = state.guards.find(g => g.id === guard.target?.senderId && !guardDisabled(g) && g.stunnedUntil <= state.elapsed);
      if (!anchor) { guard.mode = 'investigate'; if (guard.target) guard.target.kind = 'site'; }
    }
    if (guard.target && state.elapsed - guard.target.time > 14 && guard.mode !== 'detain') { guard.target = null; guard.route = []; guard.mode = 'patrol'; }
    const defense=stepWoundedCover(state,map,rules,guard,delta,seen,(target,speed)=>walk(guard,target,speed,state,map,delta,movePlayer));
    if (!defense) { guard.duck=0; guard.lean=[0,0]; }
    if (defense) { /* Wounded movement and cover cycles take priority over pursuit. */ }
    else if (guard.mode === 'detain') guard.heading = Math.atan2(state.player[1] - guard.position[1], state.player[0] - guard.position[0]);
    else if (guard.target) {
      const stop = guard.mode === 'gather' ? 2.6 : guard.target.kind === 'player' && !armed && seen ? 1.4 : 0.45;
      const multiplier = guard.mode === 'gather' ? 0.45 : guard.mode === 'pursue' ? 1.6 : 0.85;
      const blockedRendezvous = guard.mode === 'gather' && !segmentClear(state, map, eye(guard), [guard.target.position[0], guard.target.elevation + 1.5, guard.target.position[1]]);
      if (gap(guard.position, guard.target.position) > stop || Math.abs(elevation(guard) - guard.target.elevation) > 0.5 || blockedRendezvous) walk(guard, guard.target, rules.patrolSpeed * multiplier, state, map, delta, movePlayer);
      else if (guard.mode !== 'gather') { guard.mode = 'search'; guard.heading += delta * 0.7; }
    } else if (guard.routine) stepRoutine(guard, state, rules, (target, speed) => walk(guard, target, speed, state, map, delta, movePlayer));
    else {
      const target = guard.path[guard.waypoint];
      if (gap(guard.position, target) < 0.55) guard.waypoint = (guard.waypoint + 1) % guard.path.length;
      else walk(guard, { position: target, elevation: guard.patrolElevation ?? elevation(guard) }, rules.patrolSpeed, state, map, delta, movePlayer);
    }
    if (map.floors?.length) guard.elevation = supportHeight(state, map, guard.position, elevation(guard));
    const firingSight=coverClear(state,map,eye(guard),playerEye(state)) && (seen || defense?.canFire && canSee(guard,state.player,rules,[],{state,map,rangeFactor}));
    if (armed && (guard.target?.kind === 'player' || guard.wounded) && firingSight && (!defense || defense.canFire) && !(guard.injuries?.leftArm && guard.injuries?.rightArm)) {
      guard.aimTarget = playerEye(state);
      guard.heading = Math.atan2(state.player[1] - guard.position[1], state.player[0] - guard.position[0]);
      if (state.elapsed >= guard.nextShot) {
        guard.nextShot = state.elapsed + (guard.mode==='peek'?Math.max(2.4,guardShotInterval(guard)):guardShotInterval(guard));
        fireGuardShot(state,map,rules,guard);
      }
    }
  }
}
