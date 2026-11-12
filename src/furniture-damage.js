import { furnitureDamage, furnitureHealth } from './furniture.js';
import { decorBroken, propBroken } from './world.js';

// Furniture damage, in the mission state. Same pattern as doors.js: health in
// state, a break event for the scene and for guards. See POLISH_PLAN step 6.5
// and the tuning table (`durability`) in furniture.js.

// Called from createMission. `scale` is the "Furniture durability" rule (percent).
export function furnitureState(map, rules) {
  const scale = (rules.furnitureDurability ?? 100) / 100;
  const propMaxHealth = map.props.map(prop => furnitureHealth(prop, scale));
  const decorMaxHealth = (map.decor ?? []).map(prop => furnitureHealth(prop, scale));
  return { propHealth: [...propMaxHealth], propMaxHealth, decorHealth: [...decorMaxHealth], decorMaxHealth, propBroken: 0, decorBroken: 0, propStamp: 0 };
}

function hurt(state, map, rules, list, maxList, index, source, raw, position, kind) {
  if (rules.destructibleFurniture === false) return false;
  const health = state[list];
  if (!health || !(health[index] > 0) || !Number.isFinite(health[index]) || !(raw > 0)) return false;
  const prop = kind === 'prop' ? map.props[index] : map.decor[index];
  health[index] = Math.max(0, health[index] - furnitureDamage(prop, source, raw));
  state.propStamp++;
  if (health[index] > 0) return false;
  state[kind === 'prop' ? 'propBroken' : 'decorBroken']++;
  state.events.push({ type: 'furniture-break', position: position ?? [prop.position[0], (prop.elevation ?? 0) + 0.4, prop.position[1]], kind, index });
  return true;
}
// source: blast, fire, shotgun, bullet or melee. Returns true when this call broke it.
export const damageProp = (state, map, rules, index, source, raw, position) => hurt(state, map, rules, 'propHealth', 'propMaxHealth', index, source, raw, position, 'prop');
export const damageDecor = (state, map, rules, index, source, raw, position) => hurt(state, map, rules, 'decorHealth', 'decorMaxHealth', index, source, raw, position, 'decor');
export { propBroken, decorBroken };
