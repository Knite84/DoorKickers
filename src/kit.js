import { schema } from './rules.js';

// Deliberately abstract game balance, not physical weapon specifications.
export const weapons = {
  rifle: { name: 'Assault rifle', penetration: 4, magazine: 30, reload: 1.4, interval: 0.11, damage: 50, pellets: 1, spread: 0, automatic: true, length: 0.48, color: 0x354438 },
  pistol: { name: 'Pistol', penetration: 2, magazine: 12, reload: 1, interval: 0.25, damage: 35, pellets: 1, spread: 0, automatic: false, length: 0.22, color: 0x56605b },
  shotgun: { name: 'Shotgun', penetration: 1, magazine: 6, reload: 2, interval: 0.8, damage: 12, pellets: 8, spread: 0.055, automatic: false, length: 0.65, color: 0x8b6746 },
  sniper: { name: 'Sniper rifle', penetration: 6, magazine: 5, reload: 2.2, interval: 1.1, damage: 100, pellets: 1, spread: 0, automatic: false, length: 0.8, color: 0x52614a, scope: [2, 8], push: 'sniper' },
  // Added with the owner's lists (2026-11-13). `scope` is the magnification range the mouse
  // wheel steps through while aiming; DMRs carry a 2-4x LPVO (owner).
  dmr: { name: 'DMR', penetration: 5, magazine: 20, reload: 1.8, interval: 0.25, damage: 78, pellets: 1, spread: 0, automatic: false, length: 0.75, color: 0x3d4a3c, scope: [2, 4], push: 'sniper' },
  smg: { name: 'SMG', penetration: 2, magazine: 30, reload: 1.2, interval: 0.075, damage: 35, pellets: 1, spread: 0, automatic: true, length: 0.4, color: 0x2b3031 },
  lmg: { name: 'LMG', penetration: 4, magazine: 100, reload: 5, interval: 0.085, damage: 50, pellets: 1, spread: 0, automatic: true, length: 0.9, color: 0x313a33 },
  minigun: { name: 'M134 minigun', category: 'other', penetration: 4, magazine: 300, reload: 4.5, interval: 0.04, damage: 42, pellets: 1, spread: 0, automatic: true, canRun: false, length: 0.85, color: 0x323b3d },
};
// Weapon categories, in menu order (owner, 2026-11-13). A weapon's category is its id
// unless it says otherwise; categories with no weapon yet are not shown.
export const weaponCategories = [['rifle', 'Rifle'], ['dmr', 'DMR'], ['smg', 'SMG'], ['lmg', 'LMG'], ['pistol', 'Pistol'], ['shotgun', 'Shotgun'], ['sniper', 'Sniper'], ['other', 'Other']];
export const categoryOf = id => weapons[id]?.category ?? id;
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
// The owner's rifles (2026-11-13). Calibre sets the ballistics: `subsonic` is what subsonic
// ammo keeps of damage and penetration (5.56 loses more than the Blackout rounds, which are
// made for it). `integralSuppressor` means always suppressed. Lengths are in weapon-models.js.
const blackout = { damage: 0.95, penetration: 0.9 };
export const rifleModels = {
  // 14.5 in barrel under a long free-float rail: the reference rifle, the old assault rifle's numbers.
  m4urgi: { name: 'M4A1 URG-I', caliber: '5.56 NATO', magazine: 30 },
  // Piston-driven and heavier: steadier, a touch slower to cycle and reload.
  hk416: { name: 'HK416', caliber: '5.56 NATO', magazine: 30, interval: 0.115, reload: 1.5 },
  // 5.5 in barrel, folding stock: quickest to handle; Blackout hits a bit harder, penetrates less.
  rattler: { name: 'SIG MCX Rattler', caliber: '.300 BLK', magazine: 30, damage: 55, penetration: 3.2, reload: 1.35, subsonic: blackout },
  // Longer barrel: a little more damage and penetration.
  n4: { name: 'Noveske N4', caliber: '5.56 NATO', magazine: 30, damage: 52, penetration: 4.4 },
  // 8.6 Blackout: the heavy hitter. 20-round magazine, slower cadence, more climb.
  boombox: { name: 'Q Boombox', caliber: '8.6 BLK', magazine: 20, interval: 0.14, reload: 1.6, damage: 70, penetration: 5, subsonic: blackout },
  // Integral suppressor: always quiet. Compact with a PDW stock.
  honeybadger: { name: 'Q Honey Badger', caliber: '.300 BLK', magazine: 30, damage: 55, penetration: 3.2, subsonic: blackout, integralSuppressor: true },
};
// SMGs (owner, 2026-11-13).
export const smgModels = {
  mp5: { name: 'HK MP5', caliber: '9mm', magazine: 30 },
  // Ultra-compact: fastest cadence and draw, more climb, a little less damage.
  mp5k: { name: 'HK MP5K', caliber: '9mm', magazine: 30, interval: 0.067, damage: 33, penetration: 1.9 },
  // .45: hits harder; the hydraulic buffer keeps it flat. 25 rounds.
  apc45: { name: 'B&T APC45', caliber: '.45 ACP', magazine: 25, interval: 0.09, damage: 48, penetration: 2.2, reload: 1.25 },
  // 10mm: the heavy hitter of the SMGs, with the most penetration and climb.
  apc10: { name: 'B&T APC10', caliber: '10mm Auto', magazine: 30, interval: 0.08, damage: 45, penetration: 2.8, reload: 1.25 },
};
// DMRs (owner, 2026-11-13). The Q Fix and SIG Cross are bolt actions: slower to fire, harder
// hitting, smaller magazines. `cycle: 'bolt'` is in weapon-handling.js.
export const dmrModels = {
  m110a1: { name: 'HK M110A1 CSASS', caliber: '7.62 NATO', magazine: 20, interval: 0.22, damage: 80, penetration: 5.5 },
  sr25: { name: 'KAC SR-25 / M110', caliber: '7.62 NATO', magazine: 20, interval: 0.25, damage: 82, penetration: 5.7, reload: 1.9 },
  mrggs: { name: 'Geissele MRGG-S', caliber: '6.5 CM', magazine: 20, interval: 0.22, damage: 76, penetration: 6.2 },
  mk20: { name: 'FN Mk 20 SSR', caliber: '7.62 NATO', magazine: 20, interval: 0.24, damage: 80, penetration: 5.6 },
  qfix86: { name: 'Q Fix', caliber: '8.6 BLK', magazine: 10, interval: 0.9, damage: 90, penetration: 6.5, reload: 2, subsonic: blackout },
  qfix65: { name: 'Q Fix', caliber: '6.5 CM', magazine: 10, interval: 0.9, damage: 88, penetration: 7, reload: 2 },
  cross: { name: 'SIG Sauer Cross', caliber: '6.5 CM', magazine: 5, interval: 0.95, damage: 88, penetration: 7, reload: 2 },
};
// LMGs (owner, 2026-11-13): belts and long reloads.
export const lmgModels = {
  mk46: { name: 'FN Mk 46', caliber: '5.56 NATO', magazine: 200, interval: 0.075, damage: 50, penetration: 4, reload: 5 },
  mk48: { name: 'FN Mk 48', caliber: '7.62 NATO', magazine: 100, interval: 0.085, damage: 72, penetration: 5.5, reload: 5.5 },
  m240l: { name: 'M240L', caliber: '7.62 NATO', magazine: 100, interval: 0.09, damage: 72, penetration: 5.5, reload: 6 },
  m250: { name: 'SIG M250', caliber: '6.8x51 Common', magazine: 100, interval: 0.09, damage: 78, penetration: 6.5, reload: 5 },
  mmg338: { name: 'SIG MMG 338', caliber: '.338 NM', magazine: 100, interval: 0.1, damage: 95, penetration: 8, reload: 6.5 },
};
// Sniper rifles (owner, 2026-11-13). The M107A1 is semi-automatic; the rest are bolt actions.
// The .50s knock chairs over at one hit (`push`) and break masonry walls (`breaksMasonry`,
// owner 2026-11-13): see weapons.js.
export const sniperModels = {
  mrad338: { name: 'Barrett Mk22 MRAD', caliber: '.338 NM', magazine: 10, damage: 115, penetration: 8 },
  mrad300: { name: 'Barrett Mk22 MRAD', caliber: '.300 NM', magazine: 10, interval: 1.05, damage: 108, penetration: 7.5 },
  axsr: { name: 'Accuracy International AXSR', caliber: '.338 LM', magazine: 10, damage: 115, penetration: 8 },
  tac50: { name: 'McMillan TAC-50', caliber: '.50 BMG', magazine: 5, interval: 1.4, reload: 2.6, damage: 160, penetration: 12, push: 'slug', breaksMasonry: true },
  m107a1: { name: 'Barrett M107A1', caliber: '.50 BMG', magazine: 10, interval: 0.45, reload: 2.6, damage: 150, penetration: 11, push: 'slug', breaksMasonry: true },
};
for (const model of Object.values(pistolModels)) model.caliber ??= '9mm';
pistolModels.mk23.caliber = '.45 ACP';
// Weapons with a choice of real models, and the model each starts with.
export const modelSets = { pistol: pistolModels, rifle: rifleModels, smg: smgModels, dmr: dmrModels, lmg: lmgModels, sniper: sniperModels };
export const defaultModels = { pistol: defaultPistol, rifle: 'm4urgi', smg: 'mp5', dmr: 'm110a1', lmg: 'mk48', sniper: 'mrad338' };
const chosenModel = (kit, id) => modelSets[id]?.[kit?.weapons?.[id]?.model] ? kit.weapons[id].model : defaultModels[id];
// A weapon "key" names the exact gun: the slot id, or '<id>:<model>' for weapons with models.
export const weaponKey = (inventory, id) => modelSets[id] ? `${id}:${chosenModel(inventory, id)}` : id;
export const baseWeapon = key => typeof key === 'string' ? key.split(':')[0] : key;
const specs = {};
// The balance of a weapon key: the slot's numbers with the chosen model's on top.
export function weaponSpec(key) {
  if (!key) return undefined;
  const [id, model] = key.split(':');
  if (!weapons[id]) return undefined;
  if (!model || !modelSets[id]?.[model]) return weapons[id];
  return specs[key] ??= { ...weapons[id], ...modelSets[id][model], model };
}
// Whether a weapon fires suppressed: a fitted suppressor, or one built in.
export const isSuppressed = (inventory, id) => !!(inventory?.weapons?.[id]?.suppressor || weaponSpec(weaponKey(inventory, id))?.integralSuppressor);
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
  nightvision: { group: 'gear', name: 'Night vision goggles', max: 1, count: 1, wearable: true, description: 'Battery-powered light amplification. Wear with your weapon; replaces thermals. N toggles night vision.', action: 'Wear' },
  thermal: { group: 'gear', name: 'Thermal goggles', max: 1, count: 1, wearable: true, description: 'Highlights warm bodies in view. Walls still obscure them. Replaces night vision. T toggles thermals.', action: 'Wear' },
  knife: { group: 'gear', name: 'Knife', max: 1, count: 1, description: 'Reusable melee weapon. Close rear attacks kill silently; front attacks wound and can trigger an injury call. Bodies can still be discovered.', action: 'Stab' },
  pickgun: { group: 'equipment', name: 'Door picking gun', max: 1, count: 1, description: 'Reusable placeholder. Aim at a nearby locked door and use to unlock and open it quietly.', action: 'Unlock quietly' },
  medkit: { group: 'gear', name: 'Med kit', max: 5, count: 2, description: 'Restore 50 health. Consumed only when hurt.', action: 'Heal' },
  axe: { group: 'equipment', name: 'Breaching axe', max: 1, count: 1, description: 'Reusable. Close-range strikes break drywall, framing, and window glass.', action: 'Swing axe' },
  crowbar: { group: 'equipment', name: 'Crowbar', max: 1, count: 1, description: 'Reusable. Pry open a nearby door, chip a wall, or smash window glass.', action: 'Pry / strike' },
  detcord: { group: 'equipment', name: 'Det cord', max: 5, count: 2, description: 'Place on a nearby wall, floor, or door. B detonates placed charges.', action: 'Place charge' },
  claymore: { group: 'equipment', name: 'Claymore', max: 5, count: 2, description: 'Place a directional proximity trap facing your aim. Arms after 1 second.', action: 'Place trap' },
  grenade: { group: 'throwable', name: 'Grenade', max: 8, count: 3, description: 'Throw a fused explosive through window glass, shattering it. Full damage up close, falling off with distance. Damages guards, doors, walls, and you.', action: 'Throw grenade' },
  flashbang: { group: 'throwable', name: 'Flashbang', max: 8, count: 2, description: 'Throw through window glass, shattering it, to stun visible guards. Looking at a nearby burst briefly obscures your view.', action: 'Throw flashbang' },
  molotov: { group: 'throwable', name: 'Molotov cocktail', max: 8, count: 2, description: 'Throw through window glass, shattering it. Creates a temporary fire patch on solid impact or landing that damages anyone inside.', action: 'Throw Molotov' },
};
// Item groups (owner, 2026-11-13): throwables are for the fight and each has its own key;
// equipment is setup gear for a breach or an ambush and shares one key that cycles it.
export const itemGroups = [['throwable', 'Throwables'], ['equipment', 'Equipment'], ['gear', 'Gear']];

export function defaultLoadout() {
  return { primary: 'rifle', alternate: 'pistol', vision: 'off', weapons: Object.fromEntries(Object.keys(weapons).map(id => [id, { carried: id === 'rifle' || id === 'pistol', suppressor: false, velocity: 'supersonic', ammoType: 'standard', ...(defaultModels[id] ? { model: defaultModels[id] } : {}) }])), items: Object.fromEntries(Object.entries(items).map(([id, item]) => [id, item.count])) };
}
export function validateLoadout(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid loadout.');
  const result = defaultLoadout();
  for (const id of Object.keys(weapons)) {
    const config = input.weapons?.[id];
    // Add the new weapon to older saved kits without discarding their choices.
    if (['minigun', 'dmr', 'smg', 'lmg'].includes(id) && config === undefined && input.weapons) continue;
    if (!config || typeof config.carried !== 'boolean' || typeof config.suppressor !== 'boolean' || !['subsonic', 'supersonic'].includes(config.velocity) || !Object.hasOwn(ammoFor(id), config.ammoType)) throw new Error(`Invalid ${weapons[id].name} configuration.`);
    result.weapons[id] = { carried: config.carried, suppressor: config.suppressor, velocity: config.velocity, ammoType: config.ammoType };
    // Kits saved before a weapon had a choice of models get the default model.
    if (modelSets[id]) {
      if (config.model !== undefined && !Object.hasOwn(modelSets[id], config.model)) throw new Error(`Invalid ${weapons[id].name} model.`);
      result.weapons[id].model = config.model ?? defaultModels[id];
    }
  }
  // You carry two weapons: a primary and an alternate (owner, 2026-11-13). Older kits only
  // marked weapons carried; their starting weapon becomes the primary and the alternate is
  // another weapon they carried, the pistol if they had it.
  if (input.alternate !== undefined) {
    if (!weapons[input.primary] || !weapons[input.alternate] || input.primary === input.alternate) throw new Error('Choose two different weapons: a primary and an alternate.');
    result.primary = input.primary; result.alternate = input.alternate;
  } else {
    const carried = Object.keys(weapons).filter(id => result.weapons[id].carried);
    if (!carried.length) throw new Error('Carry at least one weapon.');
    result.primary = carried.includes(input.primary) ? input.primary : carried[0];
    const others = carried.filter(id => id !== result.primary);
    result.alternate = others.includes('pistol') ? 'pistol' : others[0] ?? (result.primary === 'pistol' ? 'rifle' : 'pistol');
  }
  for (const id of Object.keys(weapons)) result.weapons[id].carried = id === result.primary || id === result.alternate;
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
// Put a weapon in the primary or alternate slot. A weapon already in the other slot swaps
// across. Works on a loadout or a mission inventory.
export function assignSlot(kit, slot, id) {
  if (!weapons[id] || !['primary', 'alternate'].includes(slot)) return false;
  const other = slot === 'primary' ? 'alternate' : 'primary';
  if (kit[other] === id) kit[other] = kit[slot];
  kit[slot] = id;
  for (const key of Object.keys(weapons)) if (kit.weapons[key]) kit.weapons[key].carried = key === kit.primary || key === kit.alternate;
  return true;
}
export function equip(state, id) {
  if(items[id]?.wearable){
    if(!(state.inventory.items[id]>0))return false;
    state.inventory.vision=state.inventory.vision===id?'off':id;return true;
  }
  const inventory = state.inventory;
  if (id !== 'unarmed' && !weapons[id] && !(inventory.items[id] > 0)) return false;
  // Any firearm can be taken from the menu (cheat mode): it replaces the slot in hand, or the alternate.
  if (weapons[id] && !inventory.weapons[id]?.carried) assignSlot(inventory, inventory.equipped === inventory.primary ? 'primary' : 'alternate', id);
  if (weapons[inventory.equipped]) inventory.magazines[inventory.equipped] = state.ammo;
  if (weapons[inventory.equipped]) inventory.lastWeapon = inventory.equipped;
  // A switch starts the lower-and-raise; weapon-handling.js decides when the new item is ready.
  if (id !== inventory.equipped) { state.drawFrom = inventory.equipped; state.drawStart = state.elapsed ?? 0; }
  inventory.equipped = id; state.reloadUntil = 0;
  state.ammo = inventory.magazines[id] ?? 0;
  if (items[id]?.group === 'equipment') inventory.lastEquipment = id;
  return true;
}
// Number keys (owner, 2026-11-13): 1 primary, 2 alternate, 3 frag, 4 flashbang, 5 Molotov,
// 6 equipment (press again for the next piece), 7 knife, 8 med kit. weapon1 is slot 1.
export const slotOrder = ['primary', 'alternate', 'grenade', 'flashbang', 'molotov', 'equipment', 'knife', 'medkit'];
export const equipmentCycle = ['detcord', 'claymore', 'pickgun', 'crowbar', 'axe'];
// What a slot would equip right now: a weapon or item id, or null.
export function slotItem(state, slot) {
  const key = slotOrder[slot - 1], inventory = state.inventory;
  if (key === 'primary' || key === 'alternate') return inventory[key] ?? null;
  if (key === 'equipment') return nextEquipment(state);
  return key && inventory.items[key] > 0 ? key : null;
}
// The equipment key: the last piece used, or the next one after the piece in hand,
// skipping any used up. Null when there is nothing else to take out.
export function nextEquipment(state) {
  const inventory = state.inventory, list = equipmentCycle, current = list.indexOf(inventory.equipped);
  const start = current >= 0 ? current + 1 : Math.max(0, list.indexOf(inventory.lastEquipment));
  for (let k = 0; k < list.length; k++) {
    const id = list[(start + k) % list.length];
    if (id !== inventory.equipped && inventory.items[id] > 0) return id;
  }
  return null;
}
export function equipSlot(state, slot) {
  const id = slotItem(state, slot);
  return id && equip(state, id) ? id : null;
}
// The mouse wheel swaps between the primary and the alternate; from anything else it
// takes out the primary. Returns the id equipped, or null.
export function cycleEquipped(state) {
  const inventory = state.inventory, target = inventory.equipped === inventory.primary ? inventory.alternate : inventory.primary;
  return target && target !== inventory.equipped && equip(state, target) ? target : null;
}
export function isArmed(state) {
  return Object.hasOwn(weapons, state.inventory.equipped) || ['knife', 'axe', 'crowbar', 'detcord', 'claymore', 'grenade', 'flashbang', 'molotov'].includes(state.inventory.equipped);
}
export function toggleHolster(state) {
  return equip(state, state.inventory.equipped === 'unarmed' ? state.inventory.lastWeapon ?? state.inventory.primary : 'unarmed');
}
