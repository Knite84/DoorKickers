import { piecesInArea } from './spatial.js';
import { furnitureHeight, furnitureClass, furnitureBounds, durability } from './furniture.js';
export const elevation = object => object?.elevation ?? 0;
// Furniture is waist-high cover unless a prop states its own height (beds are low)
// or is a kit piece (src/furniture.js), whose variant sets it.
export const propHeight = prop => prop.height ?? furnitureHeight(prop) ?? 1.1;
// Furniture damage lives in the mission state (propHealth, decorHealth), never in
// the map. A broken piece leaves low debris: walkable, hides sight, stops nothing.
export const propBroken = (state, index) => state?.propHealth?.[index] <= 0;
export const decorBroken = (state, index) => state?.decorHealth?.[index] <= 0;
// A chair or stool knocked over (src/furniture-tip.js): no longer in the way, low to the floor.
export const propTipped = (state, index) => !!state?.propTipped?.[index];
export const propDown = (state, index) => propBroken(state, index) || propTipped(state, index);
// What a piece does, by use:
//   solid  - blocks walking, standing, ragdolls and the walking grid
//   sight  - hides what is behind it (soft pieces and debris included)
//   bullet - stops shots (soft pieces and debris never do)
// Returns { center, size } or null.
export function propBox(state, map, index, use = 'solid') {
  const prop = map.props[index], base = elevation(prop);
  if (propBroken(state, index)) {
    if (use !== 'sight') return null;
    const height = durability.debrisHeight;
    return { center: [prop.position[0], base + height / 2, prop.position[1]], size: [prop.size[0], height, prop.size[1]], debris: true };
  }
  if (propTipped(state, index)) {
    // Lying on its back: you can step over it, shots pass, and it hides only what is below knee height.
    if (use !== 'sight') return null;
    const height = 0.45;
    return { center: [prop.position[0], base + height / 2, prop.position[1]], size: [prop.size[0], height, prop.size[1]], tipped: true };
  }
  if (use === 'bullet' && !durability.classes[furnitureClass(prop)].stopsBullets) return null;
  const height = propHeight(prop);
  return { center: [prop.position[0], base + height / 2, prop.position[1]], size: [prop.size[0], height, prop.size[1]] };
}
// The props that still block movement. Returns map.props itself when nothing has broken.
export function activeProps(state, map) {
  if (!state?.propBroken) return map.props;
  return map.props.filter((_, index) => !propDown(state, index));
}
// Intact decor (TVs, mirrors, rugs) as hit boxes; decor never collides.
export function decorBox(state, map, index) {
  if (decorBroken(state, index)) return null;
  return furnitureBounds(map.decor[index]);
}
export const eyeHeight = state => (state.playerY ?? 0) + (state.playerCover ? state.playerCover.peeking ? 1.65 : .85 : state.crouched ? 1 : 1.65);
export const playerEye = state => [state.player[0]+(state.playerCover?.offset?.[0]??0),eyeHeight(state),state.player[1]+(state.playerCover?.offset?.[1]??0)];
export const bodyHeight = state => state.playerCover ? state.playerCover.peeking ? 1.8 : 1.08 : state.crouched ? 1.1 : 1.8;
// Doors fill their opening to 2.8 m unless the map gives a lower leaf height
// (Martelli does, with a wall header above).
export const doorHeight = door => door.height ?? 2.8;
export const doorCenter = door => [door.position[0], elevation(door) + doorHeight(door) / 2, door.position[1]];
export const doorSize = door => [door.size[0], doorHeight(door), door.size[1]];
export const windowCenter = window => [window.position[0], elevation(window) + (window.sill ?? 0.8) + (window.height ?? 1.5) / 2, window.position[1]];
export const windowSize = window => [window.size[0], window.height ?? 1.5, window.size[1]];
export function inside(position, center, size, padding = 0) {
  return position.every((v, i) => Math.abs(v - center[i]) <= size[i] / 2 + padding);
}
// Stairs and outdoor slopes (map.slopes) are both ramps: smooth foot support
// from `bottom` at `from` to `top` at `to`, inside an axis-aligned rectangle.
export function stairHeight(map, position) {
  for (const stair of map.slopes ? [...(map.stairs ?? []), ...map.slopes] : map.stairs ?? []) {
    if (!inside(position, stair.center, stair.size)) continue;
    const dz = stair.to[1] - stair.from[1], dx = stair.to[0] - stair.from[0];
    const t = Math.max(0, Math.min(1, ((position[0] - stair.from[0]) * dx + (position[1] - stair.from[1]) * dz) / (dx * dx + dz * dz)));
    return stair.bottom + t * (stair.top - stair.bottom);
  }
  return null;
}
export function supportHeight(state, map, position, fromY) {
  const stair = stairHeight(map, position);
  if (stair !== null && stair <= fromY + 0.4) return stair;
  let height = 0;
  for (const piece of piecesInArea(state.wallPieces, position[0] - 0.1, position[0] + 0.1, position[1] - 0.1, position[1] + 0.1)) {
    if (!piece.floor || piece.hp <= 0) continue;
    const top = piece.center[1] + piece.size[1] / 2;
    if (top > fromY + 0.12 || top <= height) continue;
    if (inside(position, [piece.center[0], piece.center[2]], [piece.size[0], piece.size[2]], 0.08)) height = top;
  }
  return height;
}
