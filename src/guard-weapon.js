import { trait, roll } from './guard-traits.js';
import { playerEye } from './world.js';

// Sidearm state for guards with a temperament sheet: a magazine that runs dry,
// reloads, and the occasional stoppage. Fixed-patrol guards fire without limit.
export const MAGAZINE = 12;

const weaponOf = guard => guard.weapon ??= { rounds: MAGAZINE, state: 'ready', until: 0 };
export const weaponReady = guard => !guard.traits || weaponOf(guard).state === 'ready';
export const reloadTime = guard => 1.6 + (1 - trait(guard, 'handling')) * 2.4;
export const jamChance = guard => 0.008 + (1 - trait(guard, 'discipline')) * 0.02;

function occupy(state, guard, kind, seconds, shout) {
  const weapon = weaponOf(guard);
  weapon.state = kind; weapon.until = state.elapsed + seconds;
  // Disciplined guards get behind something first; sloppy ones fumble in the open.
  guard.weaponBusy = trait(guard, 'discipline') >= 0.3;
  if (guard.weaponBusy && !guard.wounded) { guard.woundThreat = playerEye(state); guard.cover = null; guard.nextCoverAt = 0; }
  // Talkative guards announce it, which the player can hear and exploit.
  if (shout && trait(guard, 'communication') >= 0.4) {
    state.lastGuardReport = `GUARD ${(guard.id ?? state.guards.indexOf(guard)) + 1}: ${shout}`;
    state.guardReportUntil = state.elapsed + 4;
  }
  state.events?.push({ type: kind === 'jammed' ? 'guard-jam' : 'guard-reload', position: [guard.position[0], (guard.elevation ?? 0) + 1.2, guard.position[1]] });
}

// Called after each shot leaves the barrel.
export function afterShot(state, guard) {
  if (!guard.traits) return;
  const weapon = weaponOf(guard), handling = trait(guard, 'handling');
  weapon.rounds--;
  if (weapon.rounds > 0 && roll(guard) < jamChance(guard)) {
    // A drilled shooter taps and racks in a second; others stare at it first,
    // and may need a second try.
    occupy(state, guard, 'jammed', 1.2 + (1 - handling) * 4 + (roll(guard) < 1 - handling ? 2 : 0), "Weapon's jammed!");
  } else if (weapon.rounds <= 0) occupy(state, guard, 'reloading', reloadTime(guard), 'Reloading!');
}

export function stepWeapon(state, guard, seen) {
  if (!guard.traits) return;
  const weapon = weaponOf(guard);
  if (seen) weapon.lastSeenAt = state.elapsed;
  if (weapon.state !== 'ready') {
    if (state.elapsed < weapon.until) return;
    if (weapon.state === 'reloading') weapon.rounds = MAGAZINE;
    weapon.state = 'ready'; guard.weaponBusy = false;
    if (!guard.wounded) {
      guard.woundThreat = null; guard.cover = null;
      if (['cover', 'peek', 'retreat'].includes(guard.mode)) guard.mode = guard.target ? guard.target.kind === 'player' ? 'pursue' : 'investigate' : 'patrol';
    }
    return;
  }
  // Disciplined guards top up during a lull instead of waiting to run dry.
  if (weapon.rounds <= MAGAZINE * 0.4 && trait(guard, 'discipline') > 0.5 && weapon.lastSeenAt !== undefined && state.elapsed - weapon.lastSeenAt > 2) occupy(state, guard, 'reloading', reloadTime(guard), null);
}
