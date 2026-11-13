import { rayBox } from './destruction.js';
import { doorCenter, doorSize, windowCenter, windowSize, playerEye } from './world.js';
import { reactToHit, guardDisabled } from './npc-body.js';
import { woundResponse, afterHit } from './guard-wounds.js';
import { sendGuardReport } from './guard-radio.js';
import { piecesAlong } from './spatial.js';
import { guardHears, footstepNotice } from './sound-plan.js';
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
export function damagePlayer(state, rules, damage, source) {
  if (damage <= 0 || rules.invulnerable || state.status !== 'active') return;
  state.health = Math.max(0, state.health - damage); state.hurtUntil = state.elapsed + 0.25;
  if (source) state.lastHit = { time: state.elapsed, from: [source[0], source[1]] }; // drives the HUD damage arrow
  if (state.health === 0) state.status = 'captured';
}
// A noise at `origin` that carries `radius` metres in open air. With a map and the
// "Guards hear through walls" rule on, walls, doors, glass and floors in between cut
// it (src/sound-plan.js, the same model the player's speakers use).
export function alertGuards(state, rules, origin, radius = 18, map = null) {
  if (!rules.gunshotAlerts) return;
  for (const guard of state.guards) {
    if (guardDisabled(guard) || !guardHears(state, map, rules, guard, origin, radius)) continue;
    guard.alertUntil = state.elapsed + 5;
    guard.noiseTarget = { position: [origin[0], origin[2]], elevation: origin[1] > 3.2 ? 3.2 : 0, time: state.elapsed };
    guard.heading = Math.atan2(origin[2] - guard.position[1], origin[0] - guard.position[0]);
  }
}
// The player's footstep at `position` (feet), at pace `gait` on `surface`. With the rule
// "Guards hear footsteps" above zero, a guard who hears it (the shared hearing model)
// turns toward it and goes to look, at most once per cooldown. Returns how many heard.
export function hearFootstep(state, map, rules, position, gait, surface) {
  const scale = rules.footstepHearing ?? 1;
  if (!(scale > 0) || state.status !== 'active') return 0;
  const reach = (footstepNotice.reach[gait] ?? footstepNotice.reach.walk) * (footstepNotice.surface[surface] ?? 1) * scale;
  const source = [position[0], position[1] + 0.1, position[2]];
  let heard = 0;
  for (const guard of state.guards) {
    if (guardDisabled(guard) || state.elapsed - (guard.heardStepAt ?? -Infinity) < footstepNotice.cooldown) continue;
    if (!guardHears(state, map, rules, guard, source, reach)) continue;
    guard.heardStepAt = state.elapsed; heard++;
    guard.noiseTarget = { position: [position[0], position[2]], elevation: position[1] > 3.2 ? 3.2 : 0, time: state.elapsed };
    guard.heading = Math.atan2(position[2] - guard.position[1], position[0] - guard.position[0]);
  }
  return heard;
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
