// Sound decisions (POLISH_PLAN step 6.4), as pure functions so they run in Node tests.
// src/audio.js plays what this decides; nothing here touches Web Audio.
//
// Shared hearing: one model says how loud a sound is where someone is listening.
// The player's speakers use it, and with the "Guards hear through walls" rule on,
// so do the guards (combat.js alertGuards). In open air it matches the old alert
// radii exactly; walls, closed doors, glass and floors in between cut it.
//
// Levels are decibels relative to "just audible". A source is described by the
// distance at which it is just audible in open air (its `reach`, the old alert
// radius); at distance d the level is 20·log10(reach / d) minus what is in the way.
import { rayBox } from './destruction.js';
import { piecesAlong } from './spatial.js';
import { doorCenter, doorSize, windowCenter, windowSize, elevation } from './world.js';
import { roomAt } from './surface-plan.js';

// How much each thing in the way cuts a sound, in dB, and how much it dulls it
// (0 none, 1 fully muffled). A wall counts once however many of its layers are crossed;
// a wall with a hole the sound passes through does not count.
// The cut shrinks how far a sound carries: 2 dB is about 80% of the open-air reach,
// 4 dB about 63%. Gunfire stays loud through walls; a suppressed shot or a quiet
// tool is what walls really hide. The dull is what the player hears as muffling.
export const occlusion = {
  drywall: { db: 2, dull: 0.45 },    // a stud partition: reach × 0.8
  masonry: { db: 4, dull: 0.8 },     // an outside wall: reach × 0.63
  floor: { db: 4.5, dull: 0.7 },     // floor or ceiling between storeys: reach × 0.6
  door: { db: 1.5, dull: 0.35 },     // a closed door: reach × 0.84
  glass: { db: 1, dull: 0.25 },      // an intact window: reach × 0.9
  max: 20,                           // never cut more than this in all
};

// Dull from 0 to 1 combined: each obstacle removes its share of what is left.
const combineDull = (a, b) => 1 - (1 - a) * (1 - b);

// What lies between two points: { db, dull, obstacles: [{ kind, id }] }.
export function obstruction(state, map, a, b) {
  const distance = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const result = { db: 0, dull: 0, obstacles: [] };
  if (distance < 0.05 || !state?.wallPieces) return result;
  const direction = [(b[0] - a[0]) / distance, (b[1] - a[1]) / distance, (b[2] - a[2]) / distance];
  // Group the intact pieces the line crosses by wall; a wall counts if any of its pieces block.
  const walls = new Map();
  for (const piece of piecesAlong(state.wallPieces, a, b)) {
    if (piece.hp <= 0 || piece.open || piece.slope || piece.tree) continue;
    if (rayBox(a, direction, piece.center, piece.size, distance - 0.02) === null) continue;
    const kind = piece.floor || piece.ceiling ? 'floor' : piece.material === 'masonry' || piece.material === 'concrete' || piece.material === 'earth' ? 'masonry' : 'drywall';
    // Drywall walls are only solid where a skin is intact: a line through a hole meets
    // studs at most, which do not stop sound.
    if (kind === 'drywall' && piece.material === 'timber') continue;
    const entry = walls.get(piece.wall);
    if (!entry || occlusion[kind].db > occlusion[entry].db) walls.set(piece.wall, kind);
  }
  for (const [id, kind] of walls) result.obstacles.push({ kind, id });
  (map.doors ?? []).forEach((door, i) => {
    if (state.doors?.[i]) return;
    if (rayBox(a, direction, doorCenter(door), doorSize(door), distance - 0.02) !== null) result.obstacles.push({ kind: 'door', id: i });
  });
  (map.windows ?? []).forEach((window, i) => {
    if (!(state.windowHealth?.[i] > 0)) return;
    if (rayBox(a, direction, windowCenter(window), windowSize(window), distance - 0.02) !== null) result.obstacles.push({ kind: 'glass', id: i });
  });
  for (const { kind } of result.obstacles) { result.db += occlusion[kind].db; result.dull = combineDull(result.dull, occlusion[kind].dull); }
  result.db = Math.min(occlusion.max, result.db);
  return result;
}

// Level (dB above just audible) of a source with open-air `reach` metres, heard at
// `listener`. Positive means heard. Also returns the distance and the obstruction.
export function hearing(state, map, source, listener, reach) {
  const distance = Math.max(0.5, Math.hypot(listener[0] - source[0], listener[1] - source[1], listener[2] - source[2]));
  const blocked = obstruction(state, map, source, listener);
  return { level: 20 * Math.log10(reach / distance) - blocked.db, distance, dull: blocked.dull, obstacles: blocked.obstacles };
}

// Whether a guard hears a sound. With the rule off, the old straight-line radius.
export function guardHears(state, map, rules, guard, source, reach) {
  const flat = Math.hypot(guard.position[0] - source[0], guard.position[1] - source[2]);
  if (rules?.sharedHearing === false || !map) return flat <= reach;
  if (flat > reach) return false;   // nothing is heard further than in open air
  const ear = [guard.position[0], (guard.elevation ?? 0) + 1.6, guard.position[1]];
  return hearing(state, map, source, ear, reach).level >= 0;
}

// The reverb that fits where the listener stands.
export const reverbs = {
  small: { time: 0.35, wet: 0.18 },    // bathrooms, closets, halls
  medium: { time: 0.7, wet: 0.22 },    // bedrooms, kitchens
  large: { time: 1.3, wet: 0.26 },     // great room, family room, garage
  outdoor: { time: 0.25, wet: 0.06 },  // open air: a short, faint slap
};
export function roomReverb(map, position) {
  const level = Math.max(0, Math.round((position[1] - 1) / 3.2));
  const room = roomAt(map, position[0], position[2], level);
  if (!room || /deck|yard|lawn|drive|walk|outside|porch|patio/i.test(room.name ?? '')) return 'outdoor';
  const area = room.size[0] * room.size[1];
  return area < 9 ? 'small' : area < 24 ? 'medium' : 'large';
}

// Synthesised gun reports, as layers the engine builds from noise and oscillators.
//   crack: bright noise burst   { gain, highpass Hz, decay s }
//   body:  mid noise            { gain, lowpass Hz, decay s }
//   thump: falling tone         { gain, from Hz, to Hz, decay s }
//   tail:  long dark noise      { gain, lowpass Hz, decay s }
//   click: the action cycling   { gain, delay s }
// `reach` is the open-air alert radius (weapons.js uses the same numbers).
export const gunSounds = {
  rifle: { crack: { gain: 0.9, highpass: 1800, decay: 0.03 }, body: { gain: 0.8, lowpass: 2200, decay: 0.12 }, thump: { gain: 0.6, from: 160, to: 55, decay: 0.12 }, tail: { gain: 0.25, lowpass: 900, decay: 0.5 }, click: { gain: 0.12, delay: 0.03 } },
  pistol: { crack: { gain: 0.8, highpass: 2400, decay: 0.022 }, body: { gain: 0.6, lowpass: 2800, decay: 0.08 }, thump: { gain: 0.35, from: 200, to: 80, decay: 0.08 }, tail: { gain: 0.15, lowpass: 1100, decay: 0.35 }, click: { gain: 0.1, delay: 0.02 } },
  shotgun: { crack: { gain: 0.7, highpass: 1200, decay: 0.04 }, body: { gain: 1, lowpass: 1500, decay: 0.2 }, thump: { gain: 0.9, from: 110, to: 40, decay: 0.2 }, tail: { gain: 0.35, lowpass: 700, decay: 0.8 } },
  sniper: { crack: { gain: 1, highpass: 1500, decay: 0.04 }, body: { gain: 0.9, lowpass: 1800, decay: 0.18 }, thump: { gain: 0.9, from: 120, to: 35, decay: 0.22 }, tail: { gain: 0.45, lowpass: 650, decay: 1.4 } },
  minigun: { crack: { gain: 0.6, highpass: 2000, decay: 0.018 }, body: { gain: 0.55, lowpass: 2000, decay: 0.05 }, thump: { gain: 0.4, from: 150, to: 70, decay: 0.05 }, tail: { gain: 0.08, lowpass: 900, decay: 0.3 } },
  guard: { crack: { gain: 0.8, highpass: 2000, decay: 0.025 }, body: { gain: 0.7, lowpass: 2400, decay: 0.1 }, thump: { gain: 0.45, from: 180, to: 70, decay: 0.1 }, tail: { gain: 0.2, lowpass: 1000, decay: 0.45 } },
};
// A suppressor turns the report into a thump and the action's clack; subsonic ammo loses the crack.
export const suppressed = { crack: 0.08, body: 0.35, thump: 0.6, tail: 0.15, click: 2.5, lowpass: 0.45 };
export const subsonic = { crack: 0.3 };

// Footsteps: a short filtered noise tap plus a low knock, shaped per floor.
//   tap:   { gain, bandpass Hz, q, decay s }   knock: { gain, from Hz, decay s }   scuff: grit layer gain
export const stepSounds = {
  floor: { tap: { gain: 0.6, bandpass: 1400, q: 1.2, decay: 0.05 }, knock: { gain: 0.35, from: 110, decay: 0.06 } },
  carpet: { tap: { gain: 0.35, bandpass: 500, q: 0.8, decay: 0.07 }, knock: { gain: 0.25, from: 80, decay: 0.07 } },
  woodTile: { tap: { gain: 0.6, bandpass: 1800, q: 1.5, decay: 0.04 }, knock: { gain: 0.45, from: 140, decay: 0.07 } },
  bamboo: { tap: { gain: 0.6, bandpass: 1700, q: 1.5, decay: 0.04 }, knock: { gain: 0.45, from: 150, decay: 0.07 } },
  plankTile: { tap: { gain: 0.6, bandpass: 1600, q: 1.4, decay: 0.045 }, knock: { gain: 0.45, from: 130, decay: 0.07 } },
  vinyl: { tap: { gain: 0.5, bandpass: 2000, q: 1, decay: 0.035 }, knock: { gain: 0.3, from: 120, decay: 0.05 } },
  greyTile: { tap: { gain: 0.7, bandpass: 3200, q: 2, decay: 0.03 }, knock: { gain: 0.3, from: 160, decay: 0.04 } },
  stoneTile: { tap: { gain: 0.7, bandpass: 3000, q: 2, decay: 0.03 }, knock: { gain: 0.3, from: 160, decay: 0.04 } },
  concrete: { tap: { gain: 0.65, bandpass: 2600, q: 1.2, decay: 0.035 }, knock: { gain: 0.25, from: 100, decay: 0.04 }, scuff: 0.25 },
  deckBoards: { tap: { gain: 0.55, bandpass: 1200, q: 1.2, decay: 0.06 }, knock: { gain: 0.6, from: 95, decay: 0.12 } },
  stairs: { tap: { gain: 0.55, bandpass: 1300, q: 1.3, decay: 0.05 }, knock: { gain: 0.6, from: 90, decay: 0.12 } },
  outdoor: { tap: { gain: 0.3, bandpass: 900, q: 0.7, decay: 0.08 }, knock: { gain: 0.15, from: 70, decay: 0.05 }, scuff: 0.5 },
};
export const stepLoudness = { walk: 0.55, run: 1, crouch: 0.3, creep: 0.15 };
// How far a footstep carries in open air for the speakers, by pace.
export const stepReach = { walk: 9, run: 16, crouch: 5, creep: 3 };
// How far a guard notices the player's footstep (rule "Guards hear footsteps" scales it):
// open-air reach by pace, softer floors carry less, and a guard reacts at most once per
// `cooldown` seconds. A guard who hears one turns toward it and goes to look (a noise,
// like a gunshot heard, but without raising the alarm).
export const footstepNotice = {
  reach: { walk: 4.5, run: 9, crouch: 2.2, creep: 1 },
  surface: { carpet: 0.6, outdoor: 0.7, grass: 0.7, deckBoards: 1.1, stairs: 1.1 },
  cooldown: 1.5,
};

// Speaker gain (0..1) for a sound heard at `level` dB above just audible: full at
// `nearLevel` and above, falling like real distance below it, and silent a little
// under zero (the player hears slightly further than a guard notices).
export function loudness(level, nearLevel = 30) {
  if (level <= -6) return 0;
  const gain = Math.pow(10, (Math.min(level, nearLevel) - nearLevel) / 20);
  return level >= 0 ? gain : gain * (1 + level / 6);
}

// ---- Stage B: handling, the house and big moments --------------------------------

// The player's speakers hear further than a guard notices: a sound fades to silence
// at this many times its alert reach. Use hearing(..., reach * speakerReach) for speakers.
export const speakerReach = 3;

// Effect recipes: lists of layers the engine plays together.
//   { noise: filterType, freq, q, gain, decay, delay, rate }   a filtered noise burst
//   { tone: wave, from, to, gain, decay, delay }                a pitched blip or ring
// `count` repeats a layer with random delays up to `spread` seconds and pitch scatter.
// `reach` is how far the sound carries (as an alert reach) for the speakers' hearing model.
const click = (freq, gain = 0.5, delay = 0) => ({ noise: 'bandpass', freq, q: 3, gain, decay: 0.008, delay });
export const effectSounds = {
  // weapon handling (the player's own, so no reach)
  magOut: { layers: [click(2600, 0.5), { noise: 'bandpass', freq: 1200, q: 1, gain: 0.3, decay: 0.05, delay: 0.015 }] },
  magIn: { layers: [click(1900, 0.7), { tone: 'triangle', from: 320, to: 220, gain: 0.35, decay: 0.03 }, click(2800, 0.4, 0.04)] },
  charge: { layers: [click(3000, 0.5), { noise: 'bandpass', freq: 1600, q: 1.5, gain: 0.25, decay: 0.04, delay: 0.02 }, click(2400, 0.7, 0.11)] },
  shellIn: { layers: [click(2200, 0.5), { noise: 'bandpass', freq: 900, q: 1, gain: 0.25, decay: 0.04, delay: 0.01 }] },
  pump: { layers: [{ noise: 'bandpass', freq: 1300, q: 1.2, gain: 0.45, decay: 0.05 }, click(1800, 0.7, 0.05), { noise: 'bandpass', freq: 1500, q: 1.2, gain: 0.45, decay: 0.05, delay: 0.14 }, click(2200, 0.8, 0.2)] },
  bolt: { layers: [click(2600, 0.5), { noise: 'bandpass', freq: 1700, q: 1.5, gain: 0.35, decay: 0.06, delay: 0.05 }, { noise: 'bandpass', freq: 1900, q: 1.5, gain: 0.35, decay: 0.05, delay: 0.17 }, click(2400, 0.7, 0.26)] },
  draw: { layers: [{ noise: 'bandpass', freq: 1400, q: 0.5, gain: 0.25, decay: 0.12, rate: 0.6 }, click(2400, 0.35, 0.18)] },
  holster: { layers: [{ noise: 'bandpass', freq: 1100, q: 0.5, gain: 0.2, decay: 0.1, rate: 0.6 }] },
  dryFire: { layers: [click(3500, 0.6)] },
  boxSwap: { layers: [{ tone: 'triangle', from: 180, to: 120, gain: 0.5, decay: 0.08 }, click(1500, 0.6, 0.05)] },
  // casings and debris landing
  casingHard: { reach: 8, layers: [{ tone: 'sine', from: 3400, gain: 0.25, decay: 0.06 }, { tone: 'sine', from: 5300, gain: 0.18, decay: 0.05 }, { tone: 'sine', from: 7100, gain: 0.12, decay: 0.04 }, click(4500, 0.3)] },
  casingSoft: { reach: 4, layers: [{ noise: 'lowpass', freq: 700, gain: 0.3, decay: 0.02 }] },
  hullHard: { reach: 7, layers: [{ tone: 'triangle', from: 900, to: 700, gain: 0.35, decay: 0.03 }, click(2000, 0.3)] },
  debrisHard: { reach: 6, layers: [{ noise: 'bandpass', freq: 2200, q: 1, gain: 0.3, decay: 0.015 }] },
  debrisSoft: { reach: 3, layers: [{ noise: 'lowpass', freq: 600, gain: 0.25, decay: 0.02 }] },
  // bullet impacts, by the 6.1 effect class
  'impact-drywall': { reach: 10, layers: [{ noise: 'lowpass', freq: 900, gain: 0.6, decay: 0.04 }, { noise: 'highpass', freq: 2500, gain: 0.25, decay: 0.06, delay: 0.01 }] },
  'impact-wood': { reach: 10, layers: [{ tone: 'triangle', from: 260, to: 200, gain: 0.5, decay: 0.04 }, { noise: 'bandpass', freq: 900, q: 1, gain: 0.5, decay: 0.03 }] },
  'impact-masonry': { reach: 12, layers: [{ noise: 'highpass', freq: 2500, gain: 0.6, decay: 0.02 }, { noise: 'bandpass', freq: 1200, q: 0.8, gain: 0.35, decay: 0.05, delay: 0.005 }] },
  'impact-metal': { reach: 14, layers: [{ tone: 'sine', from: 2100, gain: 0.35, decay: 0.15 }, { tone: 'sine', from: 3350, gain: 0.25, decay: 0.12 }, click(4000, 0.4)] },
  'impact-ceramic': { reach: 10, layers: [{ tone: 'sine', from: 2800, gain: 0.3, decay: 0.05 }, { noise: 'highpass', freq: 3000, gain: 0.35, decay: 0.04 }] },
  'impact-fabric': { reach: 5, layers: [{ noise: 'lowpass', freq: 400, gain: 0.5, decay: 0.03 }] },
  'impact-glass': { reach: 12, layers: [{ tone: 'sine', from: 4200, gain: 0.25, decay: 0.08, count: 4, spread: 0.08 }, { noise: 'highpass', freq: 3500, gain: 0.4, decay: 0.05 }] },
  'impact-flesh': { reach: 6, layers: [{ noise: 'lowpass', freq: 320, gain: 0.7, decay: 0.05 }, { tone: 'sine', from: 95, to: 60, gain: 0.4, decay: 0.05 }] },
  'impact-dirt': { reach: 8, layers: [{ noise: 'lowpass', freq: 600, gain: 0.5, decay: 0.05 }, { noise: 'bandpass', freq: 2000, q: 0.7, gain: 0.2, decay: 0.08, delay: 0.01 }] },
  // the house
  doorOpen: { reach: 7, layers: [click(2000, 0.5), { tone: 'sawtooth', from: 300, to: 420, gain: 0.05, decay: 0.15, delay: 0.05 }, { noise: 'bandpass', freq: 600, q: 0.7, gain: 0.15, decay: 0.12, delay: 0.05 }] },
  doorClose: { reach: 9, layers: [{ tone: 'sine', from: 95, to: 60, gain: 0.55, decay: 0.08 }, { noise: 'lowpass', freq: 700, gain: 0.4, decay: 0.05 }, click(2200, 0.6, 0.03)] },
  doorLocked: { reach: 7, layers: [click(1500, 0.6), click(1700, 0.6, 0.06), click(1500, 0.5, 0.12), { tone: 'triangle', from: 260, gain: 0.15, decay: 0.03, delay: 0.06 }] },
  doorBreak: { reach: 14, layers: [{ noise: 'lowpass', freq: 1400, gain: 0.9, decay: 0.25 }, { noise: 'highpass', freq: 2500, gain: 0.5, decay: 0.05 }, { tone: 'sine', from: 80, to: 40, gain: 0.8, decay: 0.2 }, { noise: 'bandpass', freq: 900, q: 1, gain: 0.3, decay: 0.03, count: 5, spread: 0.4 }] },
  glassBreak: { reach: 10, layers: [{ noise: 'highpass', freq: 3000, gain: 0.7, decay: 0.15 }, { tone: 'sine', from: 4500, gain: 0.18, decay: 0.08, count: 14, spread: 0.6 }] },
  breachDrywall: { reach: 10, layers: [{ noise: 'bandpass', freq: 1100, q: 0.8, gain: 0.7, decay: 0.18 }, { tone: 'sine', from: 90, to: 55, gain: 0.45, decay: 0.1 }, { noise: 'highpass', freq: 2500, gain: 0.2, decay: 0.03, count: 4, spread: 0.3 }] },
  breachTimber: { reach: 12, layers: [{ noise: 'highpass', freq: 2000, gain: 0.7, decay: 0.04 }, { tone: 'triangle', from: 240, to: 160, gain: 0.5, decay: 0.08 }, { noise: 'bandpass', freq: 800, q: 1, gain: 0.4, decay: 0.1 }] },
  'break-wood': { reach: 12, layers: [{ noise: 'highpass', freq: 1800, gain: 0.7, decay: 0.05 }, { tone: 'triangle', from: 220, to: 150, gain: 0.5, decay: 0.1 }, { noise: 'bandpass', freq: 700, q: 1, gain: 0.3, decay: 0.03, count: 6, spread: 0.5 }] },
  'break-fabric': { reach: 6, layers: [{ noise: 'bandpass', freq: 2500, q: 0.6, gain: 0.4, decay: 0.15 }, { noise: 'lowpass', freq: 400, gain: 0.4, decay: 0.08 }] },
  'break-metal': { reach: 16, layers: [{ tone: 'sine', from: 420, gain: 0.4, decay: 0.4 }, { tone: 'sine', from: 655, gain: 0.3, decay: 0.35 }, { tone: 'sine', from: 990, gain: 0.25, decay: 0.3 }, { noise: 'lowpass', freq: 1200, gain: 0.5, decay: 0.1 }] },
  'break-ceramic': { reach: 12, layers: [{ noise: 'highpass', freq: 2500, gain: 0.7, decay: 0.12 }, { tone: 'sine', from: 2600, gain: 0.2, decay: 0.06, count: 8, spread: 0.35 }] },
  'break-masonry': { reach: 12, layers: [{ noise: 'lowpass', freq: 900, gain: 0.8, decay: 0.2 }, { noise: 'highpass', freq: 2200, gain: 0.3, decay: 0.03, count: 6, spread: 0.4 }] },
  // big moments
  blast: { reach: 24, layers: [{ tone: 'sine', from: 70, to: 25, gain: 1, decay: 0.6 }, { noise: 'lowpass', freq: 700, gain: 1, decay: 0.45 }, { noise: 'highpass', freq: 1500, gain: 0.6, decay: 0.05 }, { noise: 'lowpass', freq: 220, gain: 0.8, decay: 1.4, rate: 0.5 }, { noise: 'bandpass', freq: 1400, q: 1, gain: 0.2, decay: 0.03, count: 10, spread: 1.2, delay: 0.3 }] },
  flashbang: { reach: 10, layers: [{ noise: 'highpass', freq: 1000, gain: 1, decay: 0.08 }, { tone: 'sine', from: 140, to: 50, gain: 0.8, decay: 0.25 }, { noise: 'lowpass', freq: 500, gain: 0.5, decay: 0.5 }] },
  fireIgnite: { reach: 10, layers: [{ noise: 'lowpass', freq: 900, gain: 0.7, decay: 0.4, rate: 0.5 }, click(1200, 0.4), { noise: 'highpass', freq: 3000, gain: 0.2, decay: 0.2, delay: 0.05 }] },
  firePop: { reach: 8, layers: [{ noise: 'highpass', freq: 2200, gain: 0.35, decay: 0.008 }] },
  meleeHit: { reach: 7, layers: [{ noise: 'lowpass', freq: 700, gain: 0.7, decay: 0.06 }, { tone: 'sine', from: 120, to: 70, gain: 0.4, decay: 0.06 }] },
};
// Ears ringing after a flashbang: a high tone and the rest of the mix dulled for this long.
export const ringing = { tone: 3600, gain: 0.22, seconds: 3.5, dullTo: 600 };
// A burning fire: a low roar loop plus random pops per second, per fire.
export const fireSound = { roar: { freq: 450, gain: 0.35 }, pops: 10, reach: 10 };

// Which recipe each simulation event plays.
export const eventSounds = {
  'door-break': 'doorBreak', 'glass-break': 'glassBreak', blast: 'blast', flash: 'flashbang', fire: 'fireIgnite', strike: 'meleeHit',
  'guard-reload': 'guardReload', 'guard-jam': 'guardJam',
};

// The surface a bit lands on: hard floors ring, soft ones thud.
const softFloors = new Set(['carpet', 'grass', 'outdoor']);
// `kind` is 'casing' (brass), 'hull' (a shotgun shell) or 'debris'.
export function landingSound(kind, surface) {
  const soft = softFloors.has(surface);
  if (kind === 'casing' || kind === 'hull') return soft ? 'casingSoft' : kind === 'hull' ? 'hullHard' : 'casingHard';
  return soft ? 'debrisSoft' : 'debrisHard';
}

// Handling cues crossed between two moments `from` and `to` (seconds of mission time):
// magazine out and in, shells, pump and bolt after a shot, and the draw on a switch.
// Returns cue names in order. Timings follow the animations in weapon-handling.js.
export const reloadCues = {
  magazine: [[0.2, 'magOut'], [0.7, 'magIn'], [0.86, 'charge']],
  box: [[0.25, 'boxSwap'], [0.8, 'charge']],
};
export const cycleCues = { pump: [[0.2, 'pump']], bolt: [[0.15, 'bolt']] };
export function handlingCues(state, from, to, { weapon, style, cycle, drawSpan, magazine = weapon?.magazine ?? 0 }) {
  const cues = [];
  const crossed = (value, at) => value(from) < at && value(to) >= at;
  if (weapon && state.reloadUntil > from) {
    const progress = t => 1 - (state.reloadUntil - t) / weapon.reload;
    if (style === 'shells') {
      // One insert per missing round across 15%..85%, then the pump at 90%.
      const count = Math.max(1, Math.min(magazine, magazine - (state.ammo ?? 0)));
      for (let k = 0; k < count; k++) if (crossed(progress, 0.15 + (k + 0.55) / count * 0.7)) cues.push('shellIn');
      if (crossed(progress, 0.9)) cues.push('pump');
    } else for (const [at, cue] of reloadCues[style] ?? []) if (crossed(progress, at)) cues.push(cue);
  }
  if (weapon && cycle && state.shots > 0) {
    const shotAt = state.nextShot - weapon.interval, progress = t => (t - shotAt) / weapon.interval;
    for (const [at, cue] of cycleCues[cycle] ?? []) if (crossed(progress, at)) cues.push(cue);
  }
  // The holster sound plays when a switch starts (main.js sees state.drawStart change);
  // the draw sound when the new item starts to rise.
  if (drawSpan && drawSpan.lowered > from && drawSpan.lowered <= to && drawSpan.end > drawSpan.lowered) cues.push('draw');
  return cues;
}

// ---- Stage C: guards and atmosphere ---------------------------------------------

Object.assign(effectSounds, {
  // A guard reloading or clearing a jam, heard from where they stand.
  guardReload: { reach: 8, layers: [click(2400, 0.5), { noise: 'bandpass', freq: 1200, q: 1, gain: 0.3, decay: 0.05, delay: 0.02 }, click(1900, 0.7, 0.9), { tone: 'triangle', from: 300, to: 220, gain: 0.3, decay: 0.03, delay: 0.9 }, click(2800, 0.6, 1.25)] },
  guardJam: { reach: 8, layers: [click(3200, 0.6), click(2600, 0.6, 0.35), { noise: 'bandpass', freq: 1600, q: 1.5, gain: 0.35, decay: 0.06, delay: 0.5 }, click(2400, 0.7, 0.62)] },
  // Radio: a squelch, about a second of garbled speech-band chatter, and the closing squelch.
  radio: { reach: 9, layers: [click(2600, 0.6), { noise: 'bandpass', freq: 1300, q: 2.2, gain: 0.35, decay: 0.05, count: 10, spread: 0.95, delay: 0.06 }, { tone: 'square', from: 1100, gain: 0.02, decay: 0.25, delay: 0.1 }, { noise: 'bandpass', freq: 2600, q: 3, gain: 0.4, decay: 0.03, delay: 1.1 }] },
  // Ambience one-shots.
  bird: { layers: [{ tone: 'sine', from: 3200, to: 4300, gain: 0.08, decay: 0.035, count: 4, spread: 0.45 }] },
  cricket: { layers: [{ tone: 'sine', from: 4600, gain: 0.04, decay: 0.008, count: 7, spread: 0.22 }] },
});

// Guard footsteps: guards' movement is tracked between frames and a step plays every stride.
// A guard moving faster than `runSpeed` m/s is running.
export const guardSteps = { stride: { walk: 1.5, run: 2.1 }, runSpeed: 2.4, earshot: 1.4 };
// Advance one guard's step tracker; returns the gait of a step taken this frame, or null.
// `tracker` is { last: [x, z], travelled } and is updated in place.
export function guardStep(tracker, guard, dt) {
  const here = guard.position;
  if (!tracker.last) { tracker.last = [...here]; tracker.travelled = 0; return null; }
  const moved = Math.hypot(here[0] - tracker.last[0], here[1] - tracker.last[1]);
  tracker.last = [...here];
  // A teleport (respawn, ragdoll settling, a jump between frames) is not walking.
  if (moved > 1 || dt <= 0 || guard.health <= 0 || guard.ragdoll) { tracker.travelled = 0; return null; }
  const gait = moved / dt > guardSteps.runSpeed ? 'run' : 'walk';
  tracker.travelled += moved;
  if (tracker.travelled < guardSteps.stride[gait]) return null;
  tracker.travelled = 0;
  return gait;
}

// Ambience: looping beds and occasional calls, by time of day, weather and whether the
// listener is inside. Gains are before the Ambience volume setting.
export const ambience = {
  roomTone: { lowpass: 180, gain: 0.05 },               // the low hum of a house
  wind: { lowpass: 500, gain: { day: 0.07, dusk: 0.06, night: 0.05 }, indoor: 0.25, sway: 0.12 },
  rain: { highpass: 1400, gain: 0.12, indoor: 0.45 },    // indoors: rain on the roof, duller
  calls: { day: { sound: 'bird', perSecond: 0.35 }, dusk: { sound: 'bird', perSecond: 0.12 }, night: { sound: 'cricket', perSecond: 1.2 } },
  indoorCalls: 0.3,                                      // calls through the walls are quieter
};
// The ambience mix for a moment: gains for each bed and the call to play now and then.
export function ambienceMix({ indoor, time = 'day', weather = 'clear' }) {
  const wind = (ambience.wind.gain[time] ?? ambience.wind.gain.day) * (indoor ? ambience.wind.indoor : 1) * (weather === 'clear' ? 1 : 1.4);
  const rain = weather === 'rain' ? ambience.rain.gain * (indoor ? ambience.rain.indoor : 1) : 0;
  const call = ambience.calls[time] ?? ambience.calls.day;
  return {
    roomTone: indoor ? ambience.roomTone.gain : 0, wind, rain,
    rainDull: indoor ? 0.6 : 0,
    call: weather === 'rain' && call.sound === 'bird' ? null : { sound: call.sound, perSecond: call.perSecond, gain: indoor ? ambience.indoorCalls : 1 },
  };
}
