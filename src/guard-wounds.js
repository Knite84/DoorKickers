import { trait, roll } from './guard-traits.js';
import { reactToHit, guardDisabled } from './npc-body.js';

// Wound, morale and marksmanship behaviour for guards with a temperament sheet.
// Guards without one (fixed-patrol mode) keep the original all-or-nothing rules.

const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Called for every non-lethal hit, before the body reacts. May mark the hit as
// one the guard stays standing through.
export function woundResponse(state, guard, hit) {
  if (!guard.traits) return;
  const nerve = trait(guard, 'nerve'), handling = trait(guard, 'handling'), now = state.elapsed, zone = hit.zone;
  // Any hit: a flinch with wild aim, and a beat before the next shot.
  guard.flinchUntil = now + 0.5 + (1 - nerve) * 0.9;
  guard.nextShot = Math.max(guard.nextShot ?? 0, now + 0.35 + (1 - handling) * 0.4);
  // Each further wound shortens the time a gut-shot guard can keep going.
  if (guard.gutUntil !== undefined) guard.gutUntil -= 4;
  if (zone === 'stomach' && !hit.protectedHit && guard.gutUntil === undefined && !guard.ragdoll) {
    // Gut shot: still in the fight for 6–20 s depending on nerve, then down.
    guard.gutUntil = now + 6 + nerve * 14; hit.standing = true;
  }
  if (zone === 'leftLeg' || zone === 'rightLeg') {
    const other = zone === 'leftLeg' ? 'rightLeg' : 'leftLeg';
    // Both legs: cannot stand again. One leg: may buckle and need a moment.
    if (guard.injuries?.[other]) { guard.crawling = true; guard.downUntil = now + 2.5; }
    else if (roll(guard) < 0.35 + (1 - nerve) * 0.4) guard.downUntil = now + 1.5 + (1 - nerve) * 2;
  }
  // Gun arm hit: time to get the weapon into the other hand.
  if (zone === 'rightArm' && !guard.injuries?.rightArm) guard.nextShot = Math.max(guard.nextShot, now + 1 + (1 - handling) * 1.5);
}

// Pain, isolation and a collapsing team weighed against the guard's nerve.
export function shouldSurrender(state, guard) {
  if (!guard.traits || !guard.wounded || guard.surrendered || guardDisabled(guard)) return false;
  const injuries = guard.injuries ?? {}, count = Object.values(injuries).reduce((sum, n) => sum + n, 0);
  const allies = state.guards.filter(other => other !== guard && !guardDisabled(other));
  const near = allies.some(other => Math.abs((other.elevation ?? 0) - (guard.elevation ?? 0)) < 1 && gap(other.position, guard.position) < 12);
  const lost = state.guards.length > 1 ? 1 - allies.length / (state.guards.length - 1) : 1;
  const stress = Math.min(count, 4) * 0.2 + (100 - guard.health) / 100 * 0.5 + (near ? 0 : 0.25) + lost * 0.25
    + (injuries.leftArm && injuries.rightArm ? 0.5 : 0) + (guard.gutUntil !== undefined ? 0.15 : 0);
  return stress > 0.55 + trait(guard, 'nerve') * 0.9;
}

export function surrender(state, guard) {
  guard.surrendered = true; guard.mode = 'surrender'; guard.suspicion = 0;
  guard.duck = 1; guard.lean = [0, 0]; guard.aimTarget = null; guard.target = null; guard.cover = null; guard.route = [];
  state.surrenders = (state.surrenders ?? 0) + 1;
  state.lastGuardReport = `GUARD ${(guard.id ?? state.guards.indexOf(guard)) + 1}: Don't shoot — I give up!`;
  state.guardReportUntil = state.elapsed + 6;
  state.events?.push({ type: 'surrender', position: [guard.position[0], (guard.elevation ?? 0) + 1, guard.position[1]] });
}

export function afterHit(state, guard) {
  if (shouldSurrender(state, guard)) surrender(state, guard);
}

// Per-frame upkeep: gut-shot clock, getting back up, and morale re-checks.
export function stepWounds(state, guard) {
  if (!guard.traits || guard.health <= 0) return;
  const now = state.elapsed;
  if (guard.gutUntil !== undefined && !guard.incapacitated && now >= guard.gutUntil) {
    const before = guard.injuries?.stomach ?? 0;
    reactToHit(guard, { zone: 'stomach' });
    guard.injuries.stomach = before;
  }
  guard.fallen = !guard.incapacitated && guard.downUntil > now;
  guard.down = !guard.incapacitated && (guard.fallen || !!guard.crawling);
  if (guard.wounded && !guardDisabled(guard) && now >= (guard.nextMoraleAt ?? 0)) {
    guard.nextMoraleAt = now + 1;
    if (shouldSurrender(state, guard)) surrender(state, guard);
  }
}

// Shot dispersion as a fraction of range. A steady hand keeps most rounds on a
// person inside six metres; a poor one misses most shots beyond that.
export function aimSpread(state, guard, rules) {
  let spread = 0.10 - trait(guard, 'handling') * 0.08;
  if (state.gait === 'run') spread += 0.02;
  if (guard.flinchUntil > state.elapsed) spread += 0.3;
  if (guard.down) spread += 0.03;
  return spread / (rules.guardAccuracy ?? 1);
}
