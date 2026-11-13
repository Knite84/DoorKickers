// Movement feel (POLISH_PLAN step 6.3), as pure functions so it runs in Node tests.
//
// This layer sits between the keyboard and the simulation: it shapes the movement
// input (acceleration, deceleration), watches how far the player really moved, and
// derives footstep events and the camera's bob, sway, roll and landing dip.
// It never touches collision: movePlayer and stepMission are unchanged, and the
// camera effect is drawn only (shots and aim keep using the true eye position).
//
// Every tuning number is in `motion` below. The owner asked for a pronounced feel;
// the "View bob" setting scales the camera effect from 0 to 1.5.
import { surfaceAt } from './surface-plan.js';
import { stairHeight } from './world.js';

export const motion = {
  accelTime: 0.15,                    // seconds from rest to full speed
  decelTime: 0.10,                    // seconds from full speed to rest
  // metres of ground covered per footstep
  stride: { walk: 1.6, run: 2.2, crouch: 1.0, creep: 1.0 },
  // vertical camera bob per gait, in metres (peak to rest)
  bob: { walk: 0.025, run: 0.04, crouch: 0.012, creep: 0.006 },
  sway: 0.015,                        // sideways camera sway, metres
  roll: 0.021,                        // camera roll at full strafe, radians (about 1.2 degrees)
  rollRate: 8,                        // how fast the roll follows the strafe, per second
  landing: { depth: 0.12, time: 0.25, minSpeed: 2.5, fullSpeed: 8 },
  weaponBob: 0.014,                   // extra up-and-down of the held weapon, metres
};

export function createMotion() {
  return { vx: 0, vz: 0, pace: 0, steps: 0, foot: 1, lateral: 0, dip: 0, dipPeak: 0, lastVy: 0, travelled: 0 };
}
export function resetMotion(m) { Object.assign(m, createMotion()); }

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// `want` is the held movement as a world-space vector (any length, 0 when no key is down).
// Returns the input for stepMission: a direction plus `pace`, the fraction of full speed.
export function shapeInput(m, want, dt, { smoothing = true, frozen = false } = {}) {
  const length = Math.hypot(want.x, want.z), wx = length ? want.x / length : 0, wz = length ? want.z / length : 0;
  if (frozen) { m.vx = m.vz = 0; return { x: 0, z: 0, pace: 0 }; }
  if (!smoothing) { m.vx = wx; m.vz = wz; }
  else {
    // Speeding up and slowing down use different rates; a reversal slows first.
    const dx = wx - m.vx, dz = wz - m.vz, gap = Math.hypot(dx, dz);
    const speedingUp = length > 0 && Math.hypot(m.vx, m.vz) < 1 - 1e-6 && (m.vx * wx + m.vz * wz) >= 0;
    const step = dt / (speedingUp ? motion.accelTime : motion.decelTime);
    if (gap <= step) { m.vx = wx; m.vz = wz; } else { m.vx += dx / gap * step; m.vz += dz / gap * step; }
  }
  const pace = Math.min(1, Math.hypot(m.vx, m.vz));
  m.pace = pace < 1e-3 ? 0 : pace;
  if (!m.pace) { m.vx = m.vz = 0; return { x: 0, z: 0, pace: 0 }; }
  return { x: m.vx / pace, z: m.vz / pace, pace: m.pace };
}

// Called after the simulation step with the positions before and after it.
// `speed` is the gait's top speed in m/s. Returns { events, view } where `view` is the
// camera offset for this frame: { up, side, roll, weapon } in metres and radians.
export function observeMotion(m, state, map, before, gait, speed, dt, { localX = 0, bobScale = 1 } = {}) {
  const events = [];
  const moved = Math.hypot(state.player[0] - before[0], state.player[1] - before[1]);
  const grounded = (state.velocityY ?? 0) === 0 && !state.playerCover;
  // What the player really did replaces the wished-for speed, so a wall stops you and you slide along it.
  const wanted = speed * dt * m.pace;
  if (wanted > 1e-6 && moved < wanted * 0.999) {
    const real = moved / (speed * dt), now = Math.hypot(m.vx, m.vz) || 1;
    const scale = Math.min(1, real / now);
    m.vx *= scale; m.vz *= scale;
    if (moved < wanted * 0.3) m.vx = m.vz = 0;
  }
  if (grounded && moved > 1e-6) {
    m.travelled += moved;
    const length = motion.stride[gait] ?? motion.stride.walk;
    while (m.travelled >= length) {
      m.travelled -= length; m.steps++; m.foot *= -1;
      events.push(footstep(state, map, gait, m.foot));
    }
  } else if (!grounded) m.travelled = 0;

  // Landing: the frame the player becomes grounded after falling fast.
  const vy = state.velocityY ?? 0, { depth, time, minSpeed, fullSpeed } = motion.landing;
  if (m.lastVy <= -minSpeed && vy === 0) {
    m.dipPeak = depth * clamp(-m.lastVy / fullSpeed, 0.3, 1); m.dip = m.dipPeak;
    events.push({ ...footstep(state, map, gait, m.foot), landing: true });
  } else if (m.dip > 0) m.dip = Math.max(0, m.dip - m.dipPeak / time * dt);
  m.lastVy = vy;

  // Bob follows distance, so it stops when you stop. Cover and peeking get none.
  const strafe = grounded ? localX * m.pace : 0;
  m.lateral += (strafe - m.lateral) * Math.min(1, dt * motion.rollRate);
  const cycle = m.steps + m.travelled / (motion.stride[gait] ?? motion.stride.walk);
  const amount = bobScale * m.pace * (grounded ? 1 : 0);
  const bob = (motion.bob[gait] ?? motion.bob.walk) * amount;
  const view = {
    // The eye dips a little at every footfall (0 down to -bob), and sways from side to side every second step.
    up: (Math.cos(cycle * 2 * Math.PI) - 1) * 0.5 * bob - m.dip * bobScale,
    side: Math.sin(cycle * Math.PI) * motion.sway * amount,
    roll: m.lateral * motion.roll * bobScale,
    weapon: Math.sin(cycle * 2 * Math.PI) * motion.weaponBob * amount,
  };
  return { events, view };
}

// A footstep event. The floor type comes from the room finishes; stairs, and maps
// without finishes, fall back to plain names.
function footstep(state, map, gait, foot) {
  const level = Math.round((state.playerY ?? 0) / 3.2);
  const finish = surfaceAt(map, state.player[0], state.player[1], level);
  const surface = stairHeight(map, state.player) !== null ? 'stairs' : finish?.outdoor ? 'outdoor' : finish?.kind ?? 'floor';
  return { type: 'footstep', position: [state.player[0], state.playerY ?? 0, state.player[1]], surface, gait, foot };
}
