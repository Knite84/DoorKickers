// Weapon handling feel (POLISH_PLAN step 5.3), as pure functions so it runs in Node tests.
//
// Two parts change play, each behind a mission rule (both on by default):
// - Muzzle climb (rules.muzzleClimb): every shot lifts the aim. Part of the lift
//   settles back by itself once you stop firing; the rest you pull down.
// - Draw delay (rules.drawDelay): after switching, the old item is lowered and the
//   new one raised before it can fire, throw or reload.
// Everything else here is drawn only: the weapon's kick, sway, aim-down-sights
// position, and the reload, draw, bolt and pump animations. Hit rays, cadence,
// magazines and penetration stay in weapons.js and are not touched.
//
// Every tuning number is in `handling` and `sway` below. Angles are radians,
// distances metres, times seconds.
import { weaponSpec, weaponKey, baseWeapon } from './kit.js';
import { weaponModels, modelFor } from './weapon-models.js';

export const handling = {
  rifle: {
    climb: { pitch: 0.0105, yaw: 0.0035, drift: 0.0012 },   // aim lift per shot; drift pulls slightly right
    recover: { share: 0.6, delay: 0.14, time: 0.12 },        // share of the lift that settles back, after delay, at this time constant
    kick: { back: 0.035, rise: 0.05, roll: 0.02 },           // drawn kick of the weapon itself
    spring: { stiffness: 260, damping: 26 },
    aimTime: 0.18, aimFov: 55, eyeRelief: 0.26, draw: 0.45, reload: 'magazine',
  },
  pistol: {
    climb: { pitch: 0.026, yaw: 0.006, drift: 0 },
    recover: { share: 0.8, delay: 0.06, time: 0.08 },
    kick: { back: 0.03, rise: 0.16, roll: 0.03 },
    spring: { stiffness: 320, damping: 26 },
    aimTime: 0.12, aimFov: 62, eyeRelief: 0.42, draw: 0.3, reload: 'magazine',
  },
  shotgun: {
    climb: { pitch: 0.055, yaw: 0.01, drift: 0 },
    recover: { share: 0.7, delay: 0.1, time: 0.15 },
    kick: { back: 0.09, rise: 0.2, roll: 0.05 },
    spring: { stiffness: 180, damping: 20 },
    aimTime: 0.2, aimFov: 62, eyeRelief: 0.3, draw: 0.5, reload: 'shells', cycle: 'pump',
  },
  sniper: {
    climb: { pitch: 0.07, yaw: 0.008, drift: 0 },
    recover: { share: 0.75, delay: 0.12, time: 0.2 },
    kick: { back: 0.08, rise: 0.14, roll: 0.03 },
    spring: { stiffness: 150, damping: 18 },
    aimTime: 0.25, aimFov: 55, eyeRelief: 0.145, draw: 0.6, reload: 'magazine', cycle: 'bolt',
  },
  // Added 2026-11-13 with the owner's lists. DMRs aim through a 2-4x LPVO, so their eye
  // relief is set for the scope, like the sniper's.
  dmr: {
    climb: { pitch: 0.03, yaw: 0.006, drift: 0 },
    recover: { share: 0.75, delay: 0.1, time: 0.15 },
    kick: { back: 0.05, rise: 0.08, roll: 0.02 },
    spring: { stiffness: 200, damping: 22 },
    aimTime: 0.22, aimFov: 55, eyeRelief: 0.145, draw: 0.55, reload: 'magazine',
  },
  smg: {
    climb: { pitch: 0.007, yaw: 0.003, drift: 0.0008 },
    recover: { share: 0.65, delay: 0.1, time: 0.1 },
    kick: { back: 0.025, rise: 0.035, roll: 0.015 },
    spring: { stiffness: 300, damping: 28 },
    aimTime: 0.14, aimFov: 58, eyeRelief: 0.26, draw: 0.38, reload: 'magazine',
  },
  lmg: {
    climb: { pitch: 0.008, yaw: 0.0045, drift: 0.0015 },
    recover: { share: 0.55, delay: 0.12, time: 0.15 },
    kick: { back: 0.03, rise: 0.035, roll: 0.02 },
    spring: { stiffness: 220, damping: 26 },
    aimTime: 0.3, aimFov: 58, eyeRelief: 0.26, draw: 0.75, reload: 'magazine',
  },
  minigun: {
    climb: { pitch: 0.0045, yaw: 0.003, drift: 0 },
    recover: { share: 0.6, delay: 0.08, time: 0.15 },
    kick: { back: 0.012, rise: 0.01, roll: 0.006 },
    spring: { stiffness: 400, damping: 30 },
    aimTime: 0.3, aimFov: 62, draw: 1.0, reload: 'box',
  },
};
// The pistol models (kit.js pistolModels) change only what differs from the generic
// pistol above. Weapon functions below take a key: 'rifle', or 'pistol:mk23' for a model.
export const pistolHandling = {
  // Compact and light: fastest out of the holster, snappiest.
  glock19: { draw: 0.27, climb: { pitch: 0.027, yaw: 0.0065, drift: 0 }, kick: { back: 0.03, rise: 0.17, roll: 0.035 } },
  glock17: { draw: 0.3, climb: { pitch: 0.024, yaw: 0.006, drift: 0 } },
  // Heavier slide and higher bore: a little more rise, a slower draw.
  m17: { draw: 0.32, climb: { pitch: 0.025, yaw: 0.005, drift: 0 }, kick: { back: 0.032, rise: 0.15, roll: 0.03 } },
  // Steel frame and a light single-action trigger: flattest and quickest to settle.
  staccato: { draw: 0.32, aimTime: 0.11, climb: { pitch: 0.017, yaw: 0.004, drift: 0 }, recover: { share: 0.85, delay: 0.05, time: 0.07 }, kick: { back: 0.026, rise: 0.12, roll: 0.02 } },
  // Big and heavy, with a .45 push: slow to draw and aim, a long roll back down.
  mk23: { draw: 0.45, aimTime: 0.15, climb: { pitch: 0.031, yaw: 0.007, drift: 0 }, recover: { share: 0.75, delay: 0.08, time: 0.11 }, kick: { back: 0.04, rise: 0.17, roll: 0.03 }, spring: { stiffness: 260, damping: 24 } },
};
// The owner's rifles (kit.js rifleModels).
export const rifleHandling = {
  m4urgi: {},
  // Piston and weight: a little steadier, a little slower to bring up.
  hk416: { draw: 0.5, climb: { pitch: 0.0092, yaw: 0.003, drift: 0.001 }, spring: { stiffness: 240, damping: 25 } },
  // 5.5 in barrel and a folding stock: fast to draw and aim, but it jumps more.
  rattler: { draw: 0.34, aimTime: 0.14, climb: { pitch: 0.0125, yaw: 0.0045, drift: 0.0015 }, kick: { back: 0.03, rise: 0.06, roll: 0.025 } },
  n4: { draw: 0.47, climb: { pitch: 0.01, yaw: 0.0033, drift: 0.0012 } },
  // 8.6 Blackout: the biggest kick of the rifles.
  boombox: { draw: 0.45, aimTime: 0.2, climb: { pitch: 0.017, yaw: 0.005, drift: 0.002 }, recover: { share: 0.6, delay: 0.16, time: 0.14 }, kick: { back: 0.05, rise: 0.075, roll: 0.03 } },
  // The suppressor soaks some kick; short and handy.
  honeybadger: { draw: 0.37, aimTime: 0.15, climb: { pitch: 0.0105, yaw: 0.0035, drift: 0.001 }, kick: { back: 0.03, rise: 0.045, roll: 0.018 } },
};
export const smgHandling = {
  mp5: {},
  mp5k: { draw: 0.3, aimTime: 0.12, climb: { pitch: 0.0095, yaw: 0.004, drift: 0.0012 } },
  // Hydraulic buffer: flattest of the SMGs despite the .45.
  apc45: { climb: { pitch: 0.0065, yaw: 0.0025, drift: 0.0006 }, kick: { back: 0.022, rise: 0.03, roll: 0.012 } },
  apc10: { climb: { pitch: 0.0105, yaw: 0.0038, drift: 0.001 }, kick: { back: 0.03, rise: 0.045, roll: 0.018 } },
};
// Bolt-action models cycle the bolt between shots.
const bolt = { cycle: 'bolt', draw: 0.6, climb: { pitch: 0.05, yaw: 0.007, drift: 0 }, kick: { back: 0.07, rise: 0.11, roll: 0.025 } };
export const dmrHandling = {
  m110a1: {},
  sr25: { draw: 0.6, climb: { pitch: 0.031, yaw: 0.006, drift: 0 } },
  mrggs: { climb: { pitch: 0.025, yaw: 0.005, drift: 0 } },
  mk20: { climb: { pitch: 0.032, yaw: 0.006, drift: 0 } },
  qfix86: { ...bolt, draw: 0.5 },
  qfix65: { ...bolt, draw: 0.5 },
  cross: { ...bolt, draw: 0.45 },
};
export const lmgHandling = {
  mk46: { draw: 0.6, climb: { pitch: 0.0065, yaw: 0.004, drift: 0.0012 } },
  mk48: {},
  m240l: { draw: 0.85, aimTime: 0.34, climb: { pitch: 0.009, yaw: 0.005, drift: 0.0015 } },
  m250: { draw: 0.8, climb: { pitch: 0.0095, yaw: 0.005, drift: 0.0015 } },
  // .338: the heaviest kick of anything held.
  mmg338: { draw: 0.9, aimTime: 0.36, climb: { pitch: 0.014, yaw: 0.006, drift: 0.002 }, kick: { back: 0.045, rise: 0.05, roll: 0.025 } },
};
export const sniperHandling = {
  mrad338: {},
  mrad300: { climb: { pitch: 0.065, yaw: 0.008, drift: 0 } },
  axsr: {},
  tac50: { draw: 0.75, aimTime: 0.3, climb: { pitch: 0.1, yaw: 0.012, drift: 0 }, kick: { back: 0.12, rise: 0.18, roll: 0.04 } },
  // Semi-automatic: no bolt to work, but a lot of kick per shot.
  m107a1: { cycle: null, draw: 0.8, aimTime: 0.32, climb: { pitch: 0.085, yaw: 0.012, drift: 0 }, recover: { share: 0.8, delay: 0.1, time: 0.18 }, kick: { back: 0.11, rise: 0.15, roll: 0.04 } },
};
const modelHandling = { pistol: pistolHandling, rifle: rifleHandling, smg: smgHandling, dmr: dmrHandling, lmg: lmgHandling, sniper: sniperHandling };
const merged = {};
// Handling for a weapon key; undefined for items.
export function handlingFor(key) {
  if (!key) return undefined;
  const [id, model] = key.split(':');
  const extra = modelHandling[id]?.[model];
  if (!extra) return handling[id];
  return merged[key] ??= { ...handling[id], ...extra };
}
export const itemDraw = 0.3;            // grenades, tools and other carried items
export const holsterShare = 0.5;        // lowering takes this share of the item's own draw time
export const quickDraw = 0.4;           // with the draw-delay rule off, the animation plays this much faster and never blocks
export const steady = { aimed: 0.8, crouched: 0.8 };   // climb multipliers
export const sway = {
  breath: 0.0035, breathRate: 1.3,      // idle drift of the held weapon
  aimed: 0.25,                          // sway and lag multiplier while aiming
  lookLag: 0.006, lookMax: 0.04, lagRate: 12,   // weapon trails fast mouse turns
};
// Where the weapon sits at the hip, in camera space (the rear of the grip).
export const hipPosition = [0.14, -0.2, -0.65];
// Casing ejection: when in the bolt or pump cycle the casing leaves the gun.
export const cycleEject = 0.4;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
// 0 before a, rising to 1 by b, holding to c, falling to 0 by d.
const window4 = (t, a, b, c, d) => t <= a || t >= d ? 0 : t < b ? ease((t - a) / (b - a)) : t <= c ? 1 : 1 - ease((t - c) / (d - c));

export function drawTime(id) {
  if (!id || id === 'unarmed') return 0;
  return handlingFor(id)?.draw ?? itemDraw;
}

// The current switch, if any: lowering the old item until `lowered`, raising the new one until `end`.
export function drawWindow(state, rules) {
  if (state.drawStart === undefined || state.drawStart === null) return null;
  const scale = rules?.drawDelay === false ? quickDraw : 1;
  const lower = drawTime(weaponKey(state.inventory, state.drawFrom)) * holsterShare * scale, raise = drawTime(weaponKey(state.inventory, state.inventory.equipped)) * scale;
  return { start: state.drawStart, lowered: state.drawStart + lower, end: state.drawStart + lower + raise };
}

// Whether what is in hand can fire, throw or reload yet.
export function weaponReady(state, rules) {
  if (rules?.drawDelay === false) return true;
  const span = drawWindow(state, rules);
  return !span || (state.elapsed ?? 0) >= span.end - 1e-9;
}

export function createHandling() {
  return {
    time: 0, shots: 0, lastShot: -Infinity, lastWeapon: null,
    pendingPitch: 0, pendingYaw: 0,
    back: 0, backV: 0, rise: 0, riseV: 0, roll: 0, rollV: 0,
    aim: 0, lagX: 0, lagY: 0,
  };
}
export function resetHandling(h) { Object.assign(h, createHandling()); }

// A shot was fired. Returns how far the aim moves: { pitch, yaw } (pitch up is
// positive, yaw positive turns left). Zero when the muzzle-climb rule is off; the
// weapon still kicks visibly.
export function fireKick(h, id, { aimed = false, crouched = false, climb = true } = {}) {
  const spec = handlingFor(id);
  if (!spec) return { pitch: 0, yaw: 0 };
  h.shots++; h.lastShot = h.time; h.lastWeapon = id;
  // Drawn kick: an impulse on each spring. The peak of a damped spring hit with
  // velocity v is about v / (omega * e), so scale v to reach the wanted peak.
  const calm = aimed ? 0.6 : 1, omega = Math.sqrt(spec.spring.stiffness);
  const side = Math.sin(h.shots * 2.39996) >= 0 ? 1 : -1;
  h.backV += spec.kick.back * calm * omega * Math.E;
  h.riseV += spec.kick.rise * calm * omega * Math.E;
  h.rollV += spec.kick.roll * calm * side * omega * Math.E;
  if (!climb) return { pitch: 0, yaw: 0 };
  const factor = (aimed ? steady.aimed : 1) * (crouched ? steady.crouched : 1);
  // A fixed, repeating pattern rather than random: you can learn it.
  const pitch = spec.climb.pitch * factor;
  const yaw = -(spec.climb.yaw * Math.sin(h.shots * 1.7) + spec.climb.drift) * factor;
  h.pendingPitch += pitch * spec.recover.share;
  h.pendingYaw += yaw * spec.recover.share;
  return { pitch, yaw };
}

// Advance springs, aim blend and sway by dt. `look` is how far the view turned this
// frame ({ yaw, pitch } in radians). Returns the aim recovery to apply this frame
// as { pitch, yaw } (usually negative pitch: the muzzle settling back down).
export function stepHandling(h, dt, id, { aimed = false, look = { yaw: 0, pitch: 0 } } = {}) {
  h.time += dt;
  const spec = handlingFor(id) ?? handlingFor(h.lastWeapon);
  const recovery = { pitch: 0, yaw: 0 };
  const recoverSpec = handlingFor(h.lastWeapon)?.recover;
  if (recoverSpec && h.time - h.lastShot >= recoverSpec.delay && (h.pendingPitch || h.pendingYaw)) {
    const f = 1 - Math.exp(-dt / recoverSpec.time);
    recovery.pitch = -h.pendingPitch * f; recovery.yaw = -h.pendingYaw * f;
    h.pendingPitch += recovery.pitch; h.pendingYaw += recovery.yaw;
    if (Math.abs(h.pendingPitch) < 1e-5 && Math.abs(h.pendingYaw) < 1e-5) h.pendingPitch = h.pendingYaw = 0;
  }
  // Springs, in small sub-steps so a slow frame cannot blow them up.
  const { stiffness, damping } = (handlingFor(h.lastWeapon) ?? spec ?? handling.rifle).spring;
  for (let left = dt; left > 1e-6; left -= 1 / 120) {
    const step = Math.min(left, 1 / 120);
    for (const [x, v] of [['back', 'backV'], ['rise', 'riseV'], ['roll', 'rollV']]) {
      h[v] += (-stiffness * h[x] - damping * h[v]) * step;
      h[x] += h[v] * step;
    }
  }
  // Aim blend, linear here and eased in the pose.
  const aimTime = spec?.aimTime ?? 0.2;
  h.aim = clamp(h.aim + (aimed && spec ? 1 : -1) * dt / aimTime, 0, 1);
  // The weapon trails fast turns: turning left (yaw up) leaves it to the right.
  const calm = 1 - (1 - sway.aimed) * ease(h.aim);
  const rate = dt > 0 ? 1 / dt : 0;
  const targetX = clamp(look.yaw * rate * sway.lookLag, -sway.lookMax, sway.lookMax) * calm;
  const targetY = clamp(-look.pitch * rate * sway.lookLag, -sway.lookMax, sway.lookMax) * calm;
  const follow = 1 - Math.exp(-dt * sway.lagRate);
  h.lagX += (targetX - h.lagX) * follow; h.lagY += (targetY - h.lagY) * follow;
  return recovery;
}

// The weapon shown right now: during the lowering half of a switch it is still
// the old one.
export function shownItem(state, rules) {
  const span = drawWindow(state, rules), now = state.elapsed ?? 0;
  if (span && now < span.lowered && state.drawFrom) return state.drawFrom;
  return state.inventory.equipped;
}

// How far the held item is lowered by a switch: 0 in hand, 1 fully down.
export function drawDrop(state, rules) {
  const span = drawWindow(state, rules), now = state.elapsed ?? 0;
  if (!span || now >= span.end) return 0;
  if (now < span.lowered) return ease((now - span.start) / Math.max(1e-6, span.lowered - span.start));
  return 1 - ease((now - span.lowered) / Math.max(1e-6, span.end - span.lowered));
}

// Progress through the bolt or pump cycle after the last shot: 0 to 1, or null.
export function cycleProgress(state, id) {
  const spec = handlingFor(id), weapon = weaponSpec(id);
  if (!spec?.cycle || !weapon || state.inventory.equipped !== baseWeapon(id) || !(state.shots > 0)) return null;
  const since = (state.elapsed ?? 0) - (state.nextShot - weapon.interval);
  const u = since / weapon.interval;
  return u >= 0 && u < 1 ? u : null;
}
// True when the casing should leave the gun between two cycle readings.
export const ejectsBetween = (before, after) => after !== null && after >= cycleEject && (before === null || before < cycleEject);

// Camera-space pose of the held firearm. Returns
// { position, rotation, aim, parts: { magazine, support, bolt, pump, shell } }
// where each part entry is an offset [x, y, z] in the model's frame
// (`magazine.visible` false while it is off screen, `shell` null when none).
export function weaponPose(h, state, rules, id, { time = h.time, bob = 0, cover = false, strike = 0 } = {}) {
  const spec = handlingFor(id), model = modelFor(id);
  const aim = ease(h.aim);
  const ads = model && spec?.eyeRelief !== undefined ? [-model.sight[0], -model.sight[1], -spec.eyeRelief] : hipPosition;
  const position = hipPosition.map((v, i) => v + (ads[i] - v) * aim);
  const rotation = [0, 0, 0];
  const calm = 1 - (1 - sway.aimed) * aim;
  // Idle breathing and look lag.
  position[0] += Math.sin(time * sway.breathRate * 0.5) * sway.breath * calm + h.lagX;
  position[1] += Math.sin(time * sway.breathRate) * sway.breath * 0.6 * calm + h.lagY + bob * (1 - 0.7 * aim);
  rotation[1] += h.lagX * 1.5; rotation[0] += -h.lagY * 1.5;
  // Kick.
  position[2] += h.back;
  rotation[0] += h.rise; rotation[2] += h.roll;
  // Melee strike swings the weapon across.
  position[0] += strike * 0.12; rotation[2] -= strike * 0.55;

  const parts = { magazine: { offset: [0, 0, 0], visible: true }, support: [0, 0, 0], bolt: [0, 0, 0], pump: [0, 0, 0], shell: null };
  const weapon = weaponSpec(id), now = state.elapsed ?? 0;
  if (weapon && state.inventory.equipped === baseWeapon(id) && state.reloadUntil > now) {
    const r = clamp(1 - (state.reloadUntil - now) / weapon.reload, 0, 1);
    const tilt = window4(r, 0, 0.15, 0.85, 1);
    if (spec?.reload === 'magazine') {
      rotation[2] += 0.45 * tilt; rotation[0] += 0.12 * tilt; position[1] -= 0.03 * tilt;
      // Old magazine drops away, a new one comes up from below and seats.
      let dy = 0;
      if (r < 0.18) dy = 0;
      else if (r < 0.38) dy = -0.3 * ease((r - 0.18) / 0.2);
      else if (r < 0.45) { dy = -0.3; parts.magazine.visible = false; }
      else if (r < 0.72) dy = -0.3 + 0.28 * ease((r - 0.45) / 0.27);
      else if (r < 0.8) dy = -0.02 + 0.02 * ease((r - 0.72) / 0.08);
      parts.magazine.offset = [0, dy, 0];
      const reach = window4(r, 0.22, 0.4, 0.74, 0.86);
      parts.support = [0, Math.min(dy, -0.02) * reach, 0.04 * reach];
    } else if (spec?.reload === 'shells') {
      rotation[2] -= 0.5 * tilt; rotation[0] += 0.1 * tilt;
      // One shell per missing round, pushed up into the loading port.
      const count = clamp(weapon.magazine - (state.ammo ?? 0), 1, weapon.magazine);
      if (r >= 0.15 && r < 0.85) {
        const q = (r - 0.15) / 0.7 * count, f = q - Math.floor(q);
        const lift = f < 0.6 ? -0.12 + 0.12 * ease(f / 0.6) : 0;
        parts.shell = f < 0.6 ? [0, lift - 0.02, -0.12] : null;
        parts.support = [0, f < 0.6 ? lift : -0.12 * ease((f - 0.6) / 0.4), 0.32];
      }
      if (r >= 0.88) { const pump = window4(r, 0.88, 0.93, 0.94, 0.99) * 0.08; parts.pump = [0, 0, pump]; parts.support = [0, 0, pump]; }
    } else if (spec?.reload === 'box') {
      position[1] -= 0.25 * tilt; rotation[0] -= 0.4 * tilt;
    }
  }
  const u = cycleProgress(state, id);
  if (u !== null) {
    const travel = window4(u, 0.2, 0.35, 0.5, 0.7) * 0.08;
    if (spec.cycle === 'pump') { parts.pump = [0, 0, travel]; parts.support = [0, 0, travel]; rotation[0] -= window4(u, 0.15, 0.3, 0.55, 0.75) * 0.06; }
    else { parts.bolt = [0, 0.01 * Math.sign(travel), travel]; rotation[2] += window4(u, 0.1, 0.25, 0.55, 0.75) * 0.25 * (1 - aim * 0.6); }
  }
  // Switching: the item drops below the view and tips down.
  const drop = drawDrop(state, rules);
  position[1] -= 0.3 * drop; position[2] += 0.05 * drop; rotation[0] -= 0.9 * drop;
  if (cover) rotation[0] -= 0.7;
  return { position, rotation, aim, parts };
}

// The sniper's scope overlay shows only once the scope has come up to the eye.
export const scopeUp = h => h.aim >= 0.98;
// Field of view for this frame.
export function fieldOfView(h, id, { base = 76, scoped = false, zoom = 4 } = {}) {
  if (scoped) return base / zoom;
  const spec = handlingFor(id);
  return spec ? base + (spec.aimFov - base) * ease(h.aim) : base;
}
