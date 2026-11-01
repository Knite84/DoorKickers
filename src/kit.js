// Deliberately abstract game balance, not physical weapon specifications.
export const weapons = {
  rifle: { name: 'Assault rifle', penetration: 4, magazine: 30, reload: 1.4, interval: 0.11, damage: 50, pellets: 1, spread: 0, automatic: true, length: 0.48, color: 0x354438 },
  pistol: { name: 'Pistol', penetration: 2, magazine: 12, reload: 1, interval: 0.25, damage: 35, pellets: 1, spread: 0, automatic: false, length: 0.22, color: 0x56605b },
  shotgun: { name: 'Shotgun', penetration: 1, magazine: 6, reload: 2, interval: 0.8, damage: 12, pellets: 8, spread: 0.055, automatic: false, length: 0.65, color: 0x8b6746 },
  sniper: { name: 'Sniper rifle', penetration: 6, magazine: 5, reload: 2.2, interval: 1.1, damage: 100, pellets: 1, spread: 0, automatic: false, length: 0.8, color: 0x52614a },
  minigun: { name: 'M134 minigun', penetration: 4, magazine: 300, reload: 4.5, interval: 0.04, damage: 42, pellets: 1, spread: 0, automatic: true, canRun: false, length: 0.85, color: 0x323b3d },
};
export const ammoTypes = {
  standard: { name: 'Standard', damage: 1, wall: 1, penetration: 1, description: 'Medium penetration; depends on firearm and remaining wall layers.' },
  hollow: { name: 'Hollow-point', damage: 1.3, wall: 0.5, penetration: 0.2, description: 'More body damage; lowest penetration, but not guaranteed to stop.' },
  solid: { name: 'Solid core', damage: 0.85, wall: 2, penetration: 4, description: 'Highest penetration through soft walls and guards; reduced body damage.' },
};
export const items = {
  knife: { name: 'Knife', max: 1, count: 1, description: 'Reusable melee weapon. Close rear attacks kill silently; front attacks wound and can trigger an injury call. Bodies can still be discovered.', action: 'Stab' },
  pickgun: { name: 'Door picking gun', max: 1, count: 1, description: 'Reusable placeholder. Aim at a nearby locked door and use to unlock and open it quietly.', action: 'Unlock quietly' },
  medkit: { name: 'Med kit', max: 5, count: 2, description: 'Restore 50 health. Consumed only when hurt.', action: 'Heal' },
  axe: { name: 'Breaching axe', max: 1, count: 1, description: 'Reusable. Close-range strikes break drywall and framing.', action: 'Swing axe' },
  crowbar: { name: 'Crowbar', max: 1, count: 1, description: 'Reusable. Pry open a nearby door or chip a wall.', action: 'Pry / strike' },
  detcord: { name: 'Det cord', max: 5, count: 2, description: 'Place on a nearby wall, floor, or door. B detonates placed charges.', action: 'Place charge' },
  claymore: { name: 'Claymore', max: 5, count: 2, description: 'Place a directional proximity trap facing your aim. Arms after 1 second.', action: 'Place trap' },
  grenade: { name: 'Grenade', max: 8, count: 3, description: 'Throw a fused explosive. Full damage up close, falling off with distance. Damages guards, doors, walls, and you.', action: 'Throw grenade' },
  flashbang: { name: 'Flashbang', max: 8, count: 2, description: 'Throw to stun visible guards. Looking at a nearby burst briefly obscures your view.', action: 'Throw flashbang' },
  molotov: { name: 'Molotov cocktail', max: 8, count: 2, description: 'Throw to create a temporary fire patch that damages anyone inside.', action: 'Throw Molotov' },
};
export function defaultLoadout() {
  return { primary: 'rifle', weapons: Object.fromEntries(Object.keys(weapons).map(id => [id, { carried: true, suppressor: false, velocity: 'supersonic', ammoType: 'standard' }])), items: Object.fromEntries(Object.entries(items).map(([id, item]) => [id, item.count])) };
}
export function validateLoadout(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid loadout.');
  const result = defaultLoadout();
  for (const id of Object.keys(weapons)) {
    const config = input.weapons?.[id];
    // Add the new weapon to older saved kits without discarding their choices.
    if (id === 'minigun' && config === undefined && input.weapons) continue;
    if (!config || typeof config.carried !== 'boolean' || typeof config.suppressor !== 'boolean' || !['subsonic', 'supersonic'].includes(config.velocity) || !Object.hasOwn(ammoTypes, config.ammoType)) throw new Error(`Invalid ${weapons[id].name} configuration.`);
    result.weapons[id] = { carried: config.carried, suppressor: config.suppressor, velocity: config.velocity, ammoType: config.ammoType };
  }
  if (!Object.keys(weapons).some(id => result.weapons[id].carried)) throw new Error('Carry at least one weapon.');
  result.primary = result.weapons[input.primary]?.carried ? input.primary : Object.keys(weapons).find(id => result.weapons[id].carried);
  for (const [id, item] of Object.entries(items)) {
    const count = input.items?.[id];
    if (['pickgun', 'knife'].includes(id) && count === undefined && input.items) continue;
    if (!Number.isInteger(count) || count < 0 || count > item.max) throw new Error(`Invalid ${item.name} quantity.`);
    result.items[id] = count;
  }
  return result;
}
export function createInventory(loadout = defaultLoadout()) {
  const kit = validateLoadout(loadout);
  return { ...kit, equipped: kit.primary, magazines: Object.fromEntries(Object.entries(weapons).map(([id, weapon]) => [id, weapon.magazine])) };
}
export function equip(state, id) {
  if (id !== 'unarmed' && !state.inventory.weapons[id]?.carried && !(state.inventory.items[id] > 0)) return false;
  if (weapons[state.inventory.equipped]) state.inventory.magazines[state.inventory.equipped] = state.ammo;
  if (weapons[state.inventory.equipped]) state.inventory.lastWeapon = state.inventory.equipped;
  state.inventory.equipped = id; state.reloadUntil = 0;
  state.ammo = state.inventory.magazines[id] ?? 0;
  return true;
}
export function isArmed(state) {
  return Object.hasOwn(weapons, state.inventory.equipped) || ['knife', 'axe', 'crowbar', 'detcord', 'claymore', 'grenade', 'flashbang', 'molotov'].includes(state.inventory.equipped);
}
export function toggleHolster(state) {
  return equip(state, state.inventory.equipped === 'unarmed' ? state.inventory.lastWeapon ?? state.inventory.primary : 'unarmed');
}
