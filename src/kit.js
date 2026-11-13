import { schema } from './rules.js';

// Deliberately abstract game balance, not physical weapon specifications.
export const weapons = {
  rifle: { name: 'Assault rifle', penetration: 4, magazine: 30, reload: 1.4, interval: 0.11, damage: 50, pellets: 1, spread: 0, automatic: true, length: 0.48, color: 0x354438 },
  pistol: { name: 'Pistol', penetration: 2, magazine: 12, reload: 1, interval: 0.25, damage: 35, pellets: 1, spread: 0, automatic: false, length: 0.22, color: 0x56605b },
  shotgun: { name: 'Shotgun', penetration: 1, magazine: 6, reload: 2, interval: 0.8, damage: 12, pellets: 8, spread: 0.055, automatic: false, length: 0.65, color: 0x8b6746 },
  sniper: { name: 'Sniper rifle', penetration: 6, magazine: 5, reload: 2.2, interval: 1.1, damage: 100, pellets: 1, spread: 0, automatic: false, length: 0.8, color: 0x52614a },
  minigun: { name: 'M134 minigun', penetration: 4, magazine: 300, reload: 4.5, interval: 0.04, damage: 42, pellets: 1, spread: 0, automatic: true, canRun: false, length: 0.85, color: 0x323b3d },
};
// The pistol slot carries one of these real pistols (owner, 2026-11-13; POLISH_PLAN step 5.4).
// Each overrides the generic pistol's balance above; magazines are the real standard
// capacities. Handling (draw, climb, kick) is in src/weapon-handling.js `pistolHandling`
// and the shapes in src/weapon-models.js. Sizes in comments are published specs.
export const pistolModels = {
  // 185 mm long, 102 mm barrel. Compact: quick to draw, a little snappier.
  glock19: { name: 'Glock 19', magazine: 15, interval: 0.22, reload: 0.95 },
  // 202 mm, 114 mm barrel. Full size: two more rounds, a touch steadier.
  glock17: { name: 'Glock 17', magazine: 17, interval: 0.23, reload: 1 },
  // 203 mm, 119 mm barrel. Full size, heavier slide, manual safety.
  m17: { name: 'SIG M17', magazine: 17, interval: 0.24, reload: 1.05 },
  // 2011 double-stack: about 216 mm, 112 mm bull barrel. Light single-action trigger, heavy steel frame.
  staccato: { name: 'Staccato 2011', magazine: 17, interval: 0.18, reload: 1 },
  // 245 mm, 149 mm barrel, .45 ACP. Hits hardest and penetrates a little more; big, slow, 12 rounds.
  mk23: { name: 'HK Mk 23', magazine: 12, interval: 0.3, reload: 1.25, damage: 50, penetration: 2.3 },
};
export const defaultPistol = 'glock19';
// A weapon "key" names the exact gun: the slot id, or 'pistol:<model>' for the pistol.
export const weaponKey = (inventory, id) => id === 'pistol' ? `pistol:${pistolModels[inventory?.weapons?.pistol?.model] ? inventory.weapons.pistol.model : defaultPistol}` : id;
export const baseWeapon = key => typeof key === 'string' ? key.split(':')[0] : key;
const specs = {};
// The balance of a weapon key: the slot's numbers with the chosen model's on top.
export function weaponSpec(key) {
  if (!key) return undefined;
  const [id, model] = key.split(':');
  if (!weapons[id]) return undefined;
  if (!model || !pistolModels[model]) return weapons[id];
  return specs[key] ??= { ...weapons[id], ...pistolModels[model], model };
}
// The weapon in hand, as its exact model; undefined for items and empty hands.
export const equippedWeapon = state => weaponSpec(weaponKey(state.inventory, state.inventory.equipped));
export const ammoTypes = {
  standard: { name: 'Standard', damage: 1, wall: 1, penetration: 1, description: 'Medium penetration; depends on firearm and remaining wall layers.' },
  hollow: { name: 'Hollow-point', damage: 1.3, wall: 0.5, penetration: 0.2, description: 'More body damage; lowest penetration, but not guaranteed to stop.' },
  solid: { name: 'Solid core', damage: 0.85, wall: 2, penetration: 4, description: 'Highest penetration through soft walls and guards; reduced body damage.' },
  // Shotgun only: one heavy projectile in place of the buckshot spread (owner, 2026-11-12).
  // Damage and penetration multiply the shotgun's per-pellet numbers: 12 x 7 = 84 in one hit.
  slug: { name: 'Slug', damage: 7, wall: 2.5, penetration: 3, pellets: 1, only: ['shotgun'], description: 'Shotgun only. One heavy slug instead of buckshot: no spread, hits hard and punches through walls and furniture.' },
};
// The ammo a weapon can load: every general type, plus any made for it alone.
export const ammoFor = id => Object.fromEntries(Object.entries(ammoTypes).filter(([, ammo]) => !ammo.only || ammo.only.includes(id)));
export const items = {
  nightvision: { name: 'Night vision goggles', max: 1, count: 1, wearable: true, description: 'Battery-powered light amplification. Wear with your weapon; replaces thermals. N toggles night vision.', action: 'Wear' },
  thermal: { name: 'Thermal goggles', max: 1, count: 1, wearable: true, description: 'Highlights warm bodies in view. Walls still obscure them. Replaces night vision. T toggles thermals.', action: 'Wear' },
  knife: { name: 'Knife', max: 1, count: 1, description: 'Reusable melee weapon. Close rear attacks kill silently; front attacks wound and can trigger an injury call. Bodies can still be discovered.', action: 'Stab' },
  pickgun: { name: 'Door picking gun', max: 1, count: 1, description: 'Reusable placeholder. Aim at a nearby locked door and use to unlock and open it quietly.', action: 'Unlock quietly' },
  medkit: { name: 'Med kit', max: 5, count: 2, description: 'Restore 50 health. Consumed only when hurt.', action: 'Heal' },
  axe: { name: 'Breaching axe', max: 1, count: 1, description: 'Reusable. Close-range strikes break drywall, framing, and window glass.', action: 'Swing axe' },
  crowbar: { name: 'Crowbar', max: 1, count: 1, description: 'Reusable. Pry open a nearby door, chip a wall, or smash window glass.', action: 'Pry / strike' },
  detcord: { name: 'Det cord', max: 5, count: 2, description: 'Place on a nearby wall, floor, or door. B detonates placed charges.', action: 'Place charge' },
  claymore: { name: 'Claymore', max: 5, count: 2, description: 'Place a directional proximity trap facing your aim. Arms after 1 second.', action: 'Place trap' },
  grenade: { name: 'Grenade', max: 8, count: 3, description: 'Throw a fused explosive through window glass, shattering it. Full damage up close, falling off with distance. Damages guards, doors, walls, and you.', action: 'Throw grenade' },
  flashbang: { name: 'Flashbang', max: 8, count: 2, description: 'Throw through window glass, shattering it, to stun visible guards. Looking at a nearby burst briefly obscures your view.', action: 'Throw flashbang' },
  molotov: { name: 'Molotov cocktail', max: 8, count: 2, description: 'Throw through window glass, shattering it. Creates a temporary fire patch on solid impact or landing that damages anyone inside.', action: 'Throw Molotov' },
};
export function defaultLoadout() {
  return { primary: 'rifle', vision: 'off', weapons: Object.fromEntries(Object.keys(weapons).map(id => [id, { carried: true, suppressor: false, velocity: 'supersonic', ammoType: 'standard', ...(id === 'pistol' ? { model: defaultPistol } : {}) }])), items: Object.fromEntries(Object.entries(items).map(([id, item]) => [id, item.count])) };
}
export function validateLoadout(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid loadout.');
  const result = defaultLoadout();
  for (const id of Object.keys(weapons)) {
    const config = input.weapons?.[id];
    // Add the new weapon to older saved kits without discarding their choices.
    if (id === 'minigun' && config === undefined && input.weapons) continue;
    if (!config || typeof config.carried !== 'boolean' || typeof config.suppressor !== 'boolean' || !['subsonic', 'supersonic'].includes(config.velocity) || !Object.hasOwn(ammoFor(id), config.ammoType)) throw new Error(`Invalid ${weapons[id].name} configuration.`);
    result.weapons[id] = { carried: config.carried, suppressor: config.suppressor, velocity: config.velocity, ammoType: config.ammoType };
    // Kits saved before the pistol choice get the default model.
    if (id === 'pistol') {
      if (config.model !== undefined && !Object.hasOwn(pistolModels, config.model)) throw new Error('Invalid pistol model.');
      result.weapons.pistol.model = config.model ?? defaultPistol;
    }
  }
  if (!Object.keys(weapons).some(id => result.weapons[id].carried)) throw new Error('Carry at least one weapon.');
  result.primary = result.weapons[input.primary]?.carried ? input.primary : Object.keys(weapons).find(id => result.weapons[id].carried);
  for (const [id, item] of Object.entries(items)) {
    const count = input.items?.[id];
    if (['pickgun', 'knife', 'nightvision', 'thermal'].includes(id) && count === undefined && input.items) continue;
    if (!Number.isInteger(count) || count < 0 || count > item.max) throw new Error(`Invalid ${item.name} quantity.`);
    result.items[id] = count;
  }
  const vision=input.vision??'off';
  if(!['off','nightvision','thermal'].includes(vision)||vision!=='off'&&result.items[vision]<1)throw new Error('Choose one carried vision device, or Off.');
  result.vision=vision;
  return result;
}
export function createInventory(loadout = defaultLoadout()) {
  const kit = validateLoadout(loadout);
  return { ...kit, equipped: kit.primary, magazines: Object.fromEntries(Object.keys(weapons).map(id => [id, weaponSpec(weaponKey(kit, id)).magazine])) };
}
export function restockEquipment(state) {
  if (!['active', 'paused'].includes(state.status)) return 0;
  let added = 0;
  for (const [id, item] of Object.entries(items)) {
    added += Math.max(0, item.max - state.inventory.items[id]);
    state.inventory.items[id] = item.max;
  }
  // Temporary debug refill, using the same cash cap as the sandbox settings.
  added += Math.max(0, schema.budget.max - state.budget);
  state.budget = Math.max(state.budget, schema.budget.max);
  return added;
}
export function equip(state, id) {
  if(items[id]?.wearable){
    if(!(state.inventory.items[id]>0))return false;
    state.inventory.vision=state.inventory.vision===id?'off':id;return true;
  }
  if (id !== 'unarmed' && !state.inventory.weapons[id]?.carried && !(state.inventory.items[id] > 0)) return false;
  if (weapons[state.inventory.equipped]) state.inventory.magazines[state.inventory.equipped] = state.ammo;
  if (weapons[state.inventory.equipped]) state.inventory.lastWeapon = state.inventory.equipped;
  // A switch starts the lower-and-raise; weapon-handling.js decides when the new item is ready.
  if (id !== state.inventory.equipped) { state.drawFrom = state.inventory.equipped; state.drawStart = state.elapsed ?? 0; }
  state.inventory.equipped = id; state.reloadUntil = 0;
  state.ammo = state.inventory.magazines[id] ?? 0;
  return true;
}
// Number-key slots, in order: weapon1 is slot 1. The mouse wheel cycles through
// the same list, skipping anything not carried or used up.
export const slotOrder = ['rifle', 'pistol', 'shotgun', 'sniper', 'minigun', 'grenade', 'flashbang', 'detcord'];
const slotReady = (state, id) => weapons[id] ? !!state.inventory.weapons[id]?.carried : state.inventory.items[id] > 0;
// Step to the next (+1) or previous (-1) ready slot from what is in hand. From
// something off the list (hands, knife), +1 starts at the first slot and -1 at
// the last. Returns the id equipped, or null when nothing else is ready.
export function cycleEquipped(state, step) {
  const current = slotOrder.indexOf(state.inventory.equipped), count = slotOrder.length;
  for (let offset = 1; offset <= count; offset++) {
    const index = current < 0 ? (step > 0 ? offset - 1 : count - offset) : ((current + step * offset) % count + count) % count;
    const id = slotOrder[index];
    if (id === state.inventory.equipped) return null;
    if (slotReady(state, id) && equip(state, id)) return id;
  }
  return null;
}
export function isArmed(state) {
  return Object.hasOwn(weapons, state.inventory.equipped) || ['knife', 'axe', 'crowbar', 'detcord', 'claymore', 'grenade', 'flashbang', 'molotov'].includes(state.inventory.equipped);
}
export function toggleHolster(state) {
  return equip(state, state.inventory.equipped === 'unarmed' ? state.inventory.lastWeapon ?? state.inventory.primary : 'unarmed');
}
