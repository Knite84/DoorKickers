// What the in-mission HUD shows, as plain functions of the mission state.
// No DOM here so the rules can be tested; main.js draws the results.

const TAU = Math.PI * 2;
const wrap = angle => ((angle % TAU) + TAU) % TAU;

// Guard alert state for the whole mission: the most urgent thing any guard is doing.
// Returns { level: 0..3, label }.
export function alertState(state) {
  let level = 0;
  for (const guard of state.guards ?? []) {
    if (guard.health <= 0 || guard.incapacitated || guard.mode === 'surrender' || guard.mode === 'incapacitated' || guard.mode === 'wounded') continue;
    const mode = guard.mode;
    const here = mode === 'pursue' || mode === 'detain' ? 3
      : mode === 'investigate' || mode === 'search' || mode === 'gather' ? 2
      : (guard.suspicion ?? 0) >= 0.35 ? 1 : 0;
    level = Math.max(level, here);
  }
  return { level, label: ['UNDETECTED', 'SUSPICIOUS', 'SEARCHING', 'HUNTED'][level] };
}

// Facing as a compass heading in degrees, clockwise from north.
// `facing` is the aim direction on the plan, [x, z]. `planUp` is the compass
// heading of plan up (-z): 0 when plan up is north, 180 when it is south
// (map.planUpHeading).
export function headingDegrees(facing, planUp = 0) {
  return Math.round(wrap(Math.atan2(facing[0], -facing[1]) + planUp * Math.PI / 180) * 180 / Math.PI) % 360;
}
export const compassPoint = degrees => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(wrap(degrees * Math.PI / 180) / (TAU / 8)) % 8];

// Where a hit came from, relative to where the player faces: 0 = ahead, 90 = right.
export function damageBearing(player, facing, source) {
  const toSource = Math.atan2(source[0] - player[0], -(source[1] - player[1]));
  const ahead = Math.atan2(facing[0], -facing[1]);
  return Math.round(wrap(toSource - ahead) * 180 / Math.PI) % 360;
}
// 1 right after the hit, fading to 0 over `seconds`.
export const damageArrowOpacity = (state, seconds = 1.6) => state.lastHit ? Math.max(0, 1 - (state.elapsed - state.lastHit.time) / seconds) : 0;

export function healthTier(health) {
  return health <= 0 ? 'down' : health <= 25 ? 'critical' : health <= 50 ? 'low' : health < 100 ? 'hurt' : 'ok';
}

// Prompt for the door or window the player is next to, or ''.
// `target` is { kind: 'door' | 'window', open, locked, broken, climbable } or null.
export function interactionPrompt(target) {
  if (!target) return '';
  if (target.kind === 'window') return target.broken && target.climbable !== false ? 'E · Climb through' : '';
  if (target.broken) return '';
  return target.locked ? 'E · Locked' : target.open ? 'E · Close door' : 'E · Open door';
}

export function formatClock(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
