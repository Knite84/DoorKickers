// One schema drives the controls, defaults, and imported rules validation.
// Mission setup values apply on deployment; everything else applies immediately.
export const schema = {
  entryPoint: { label: 'Entry point', group: 'Mission', options: ['courtyard', 'west gallery'], value: 'courtyard', setup: true },
  guardCount: { label: 'Guard count', group: 'Mission', min: 0, max: 8, step: 1, value: 3, setup: true },
  armoredGuards: { label: 'Armored guards', group: 'Mission', min: 0, max: 8, step: 1, value: 0, setup: true },
  budget: { label: 'Support budget', group: 'Mission', min: 0, max: 10000, step: 250, value: 1000, setup: true, unit: '$' },
  weather: { label: 'Weather', group: 'World', options: ['clear', 'rain', 'fog'], value: 'clear' },
  timeOfDay: { label: 'Time of day', group: 'World', options: ['day', 'night'], value: 'day', setup: true },
  playerSpeed: { label: 'Movement speed', group: 'World', min: 1, max: 8, step: 0.5, value: 3.5, unit: 'm/s' },
  runMultiplier: { label: 'Running speed', group: 'World', min: 1, max: 3, step: 0.1, value: 1.7, unit: '×' },
  creepMultiplier: { label: 'Creeping speed', group: 'World', min: 0.1, max: 1, step: 0.1, value: 0.4, unit: '×' },
  weaponDamage: { label: 'Weapon damage', group: 'Gunplay & destruction', min: 10, max: 100, step: 10, value: 50 },
  wallDamage: { label: 'Wall damage', group: 'Gunplay & destruction', min: 1, max: 4, step: 1, value: 1, unit: '×' },
  destructibleWalls: { label: 'Breakable walls & floors', group: 'Gunplay & destruction', value: true },
  destructibleDoors: { label: 'Breakable doors', group: 'Gunplay & destruction', value: true },
  doorDurability: { label: 'Door durability', group: 'Gunplay & destruction', min: 30, max: 300, step: 30, value: 120, setup: true },
  gunshotAlerts: { label: 'Guards react to gunfire', group: 'Gunplay & destruction', value: true },
  unlimitedAmmo: { label: 'Unlimited magazine', group: 'Gunplay & destruction', value: false },
  gunVolume: { label: 'Gunfire volume', group: 'Gunplay & destruction', min: 0, max: 1, step: 0.1, value: 0.3 },
  guardDamage: { label: 'Incoming damage', group: 'Gunplay & destruction', min: 0, max: 50, step: 5, value: 35 },
  blastDamage: { label: 'Blast damage', group: 'Gunplay & destruction', min: 0, max: 2, step: 0.1, value: 1, unit: '×' },
  friendlyFire: { label: 'Self damage from equipment', group: 'Gunplay & destruction', value: true },
  inventoryPause: { label: 'Pause while inventory is open', group: 'Intel & freedom', value: true },
  patrolSpeed: { label: 'Patrol speed', group: 'Guards', min: 0, max: 3, step: 0.25, value: 1.25, unit: 'm/s' },
  sightRange: { label: 'Guard sight range', group: 'Guards', min: 2, max: 16, step: 0.5, value: 7, unit: 'm' },
  awareness: { label: 'Suspicion gain', group: 'Guards', min: 0, max: 3, step: 0.1, value: 1, unit: '×' },
  fullIntel: { label: 'Live guard tracking', group: 'Intel & freedom', value: false },
  floorPlan: { label: 'Floor grid & room labels', group: 'Intel & freedom', value: true },
  showVision: { label: 'Show guard sight cones', group: 'Intel & freedom', value: true },
  showRoutes: { label: 'Reveal patrol routes', group: 'Intel & freedom', value: false },
  invulnerable: { label: 'Ignore player damage', group: 'Intel & freedom', value: false },
  ghost: { label: 'Walk through walls', group: 'Intel & freedom', value: false },
};
export const defaults = Object.fromEntries(Object.entries(schema).map(([key, field]) => [key, field.value]));
export const presets = {
  Recommended: { ...defaults },
  'Ghost story': { ...defaults, guardCount: 5, floorPlan: false, showVision: false, awareness: 1.6, budget: 500 },
  'Trillionaire': { ...defaults, budget: 10000, fullIntel: true, showRoutes: true, awareness: 0.5 },
  'Free play': { ...defaults, budget: 10000, fullIntel: true, showRoutes: true, invulnerable: true, ghost: true },
};
export function validateRules(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a rules object.');
  const result = { ...defaults };
  for (const [key, field] of Object.entries(schema)) {
    if (!(key in input)) continue;
    const value = input[key];
    if (field.options) {
      if (!field.options.includes(value)) throw new Error(`Invalid ${field.label}.`);
    } else if (typeof field.value === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`Invalid ${field.label}.`);
    } else if (!Number.isFinite(value) || value < field.min || value > field.max || Math.abs((value - field.min) / field.step - Math.round((value - field.min) / field.step)) > 0.00001) {
      throw new Error(`${field.label} must be ${field.min}–${field.max}, in steps of ${field.step}.`);
    }
    result[key] = value;
  }
  return result;
}

// Retire the old practice preset without leaving returning players in its guard-free setup.
export function restoreSavedRules(input) {
  if (input?.entryPoint !== 'breach practice') return validateRules(input);
  const legacyLab = { ...defaults, entryPoint: 'breach practice', guardCount: 0, invulnerable: true, unlimitedAmmo: true };
  if (Object.keys(defaults).every(key => input[key] === undefined || input[key] === legacyLab[key])) return { ...defaults };
  return validateRules({ ...input, entryPoint: 'west gallery' });
}
