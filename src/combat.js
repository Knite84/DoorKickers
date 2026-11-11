import { rayBox } from './destruction.js';
import { doorCenter, doorSize, windowCenter, windowSize, playerEye } from './world.js';
import { reactToHit, guardDisabled } from './npc-body.js';
import { woundResponse, afterHit } from './guard-wounds.js';
import { sendGuardReport } from './guard-radio.js';
import { piecesAlong } from './spatial.js';
export { sendGuardReport };
export function shatterWindow(state, map, index) {
  if (!(state.windowHealth?.[index] > 0)) return false;
  state.windowHealth[index] = 0;
  state.events.push({ type: 'glass-break', position: windowCenter(map.windows[index]), radius: 0.6 });
  return true;
}
export function damageGuard(state, guard, damage, hit) {
  if (guard.health <= 0 || damage <= 0) return false;
  guard.health = Math.max(0, guard.health - damage);
  if (guard.health === 0) { state.kills++; guard.suspicion = 0; reactToHit(guard, hit, true); return true; }
  guard.wounded = true;
  guard.woundThreat = hit?.origin ? [...hit.origin] : playerEye(state);
  guard.cover = null; guard.nextCoverAt = 0;
  if (!guard.injuryReported || state.elapsed >= (guard.nextInjuryCall ?? 0)) {
    guard.injuryReported = true; guard.nextInjuryCall = state.elapsed + 1;
    sendGuardReport(state, guard, { kind: 'injury', position: [...guard.position], elevation: guard.elevation ?? 0 });
    if (guard.target?.kind !== 'player') {
      guard.mode = 'investigate'; guard.target = { kind: 'site', position: [...guard.position], elevation: guard.elevation ?? 0, time: state.elapsed };
    }
  }
  const impact = hit ?? {};
  woundResponse(state, guard, impact);
  if (hit) reactToHit(guard, impact);
  afterHit(state, guard);
  return false;
}
export function damagePlayer(state, rules, damage) {
  if (damage <= 0 || rules.invulnerable || state.status !== 'active') return;
  state.health = Math.max(0, state.health - damage); state.hurtUntil = state.elapsed + 0.25;
  if (state.health === 0) state.status = 'captured';
}
export function alertGuards(state, rules, origin, radius = 18) {
  if (!rules.gunshotAlerts) return;
  for (const guard of state.guards) {
    if (guardDisabled(guard) || Math.hypot(guard.position[0] - origin[0], guard.position[1] - origin[2]) > radius) continue;
    guard.alertUntil = state.elapsed + 5;
    guard.noiseTarget = { position: [origin[0], origin[2]], elevation: origin[1] > 3.2 ? 3.2 : 0, time: state.elapsed };
    guard.heading = Math.atan2(origin[2] - guard.position[1], origin[0] - guard.position[0]);
  }
}
export function segmentClear(state, map, a, b, ignoreWall = -1, { glass = true } = {}) {
  const distance = Math.hypot(...b.map((v, i) => v - a[i]));
  if (distance < 0.001) return true;
  const direction = b.map((v, i) => (v - a[i]) / distance);
  for (const piece of piecesAlong(state.wallPieces, a, b)) {
    if (piece.hp <= 0 || piece.wall === ignoreWall) continue;
    if (rayBox(a, direction, piece.center, piece.size, distance - 0.02) !== null) return false;
  }
  for (let i = 0; i < map.doors.length; i++) if (!state.doors[i]) {
    const door = map.doors[i];
    if (rayBox(a, direction, doorCenter(door), doorSize(door), distance - 0.02) !== null) return false;
  }
  if (glass) for (const [index, window] of (map.windows ?? []).entries()) if (state.windowHealth[index] > 0 && rayBox(a, direction, windowCenter(window), windowSize(window), distance - 0.02) !== null) return false;
  return true;
}
