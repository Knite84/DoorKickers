// Per-guard temperament. Every trait runs 0–1 with 0.5 meaning "the guard this
// game has always had": a guard without a trait sheet behaves exactly as before.

// Small deterministic generator (mulberry32) so one mission seed replays exactly.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const traitNames = ['perception', 'discipline', 'communication', 'handling', 'nerve'];

// Two rolls averaged: most guards are ordinary, a few are notably sharp or sloppy.
export function rollTraits(random) {
  return Object.fromEntries(traitNames.map(name => [name, Math.round((random() + random()) * 50) / 100]));
}

export const trait = (guard, name) => guard?.traits?.[name] ?? 0.5;

// Map a trait onto a multiplier that is exactly 1 at the neutral 0.5.
export const scaled = (value, low, high) => value < 0.5 ? low + (1 - low) * value * 2 : 1 + (high - 1) * (value - 0.5) * 2;

// Perception: half-angle of the view cone (about 28°–45°, 36° neutral), how far
// the guard can make someone out, and how quickly a glimpse becomes certainty.
export const sightHalfAngle = guard => Math.PI / 5 * scaled(trait(guard, 'perception'), 0.78, 1.25);
export const sightRangeFactor = guard => scaled(trait(guard, 'perception'), 0.85, 1.15);
export const suspicionFactor = guard => scaled(trait(guard, 'perception'), 0.6, 1.5);

// Discipline: how briskly a guard walks a round and how long they loiter at a post.
export const paceFactor = guard => scaled(trait(guard, 'discipline'), 0.85, 1.1);
export const lingerFactor = guard => scaled(trait(guard, 'discipline'), 2.2, 0.7);
