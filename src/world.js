export const elevation = object => object?.elevation ?? 0;
// Furniture is waist-high cover unless a prop states its own height (beds are low).
export const propHeight = prop => prop.height ?? 1.1;
export const eyeHeight = state => (state.playerY ?? 0) + (state.playerCover ? state.playerCover.peeking ? 1.65 : .85 : state.crouched ? 1 : 1.65);
export const playerEye = state => [state.player[0]+(state.playerCover?.offset?.[0]??0),eyeHeight(state),state.player[1]+(state.playerCover?.offset?.[1]??0)];
export const bodyHeight = state => state.playerCover ? state.playerCover.peeking ? 1.8 : 1.08 : state.crouched ? 1.1 : 1.8;
export const doorCenter = door => [door.position[0], elevation(door) + 1.4, door.position[1]];
export const doorSize = door => [door.size[0], 2.8, door.size[1]];
export const windowCenter = window => [window.position[0], elevation(window) + (window.sill ?? 0.8) + (window.height ?? 1.5) / 2, window.position[1]];
export const windowSize = window => [window.size[0], window.height ?? 1.5, window.size[1]];
export function inside(position, center, size, padding = 0) {
  return position.every((v, i) => Math.abs(v - center[i]) <= size[i] / 2 + padding);
}
export function stairHeight(map, position) {
  for (const stair of map.stairs ?? []) {
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
  for (const piece of state.wallPieces) {
    if (!piece.floor || piece.hp <= 0) continue;
    const top = piece.center[1] + piece.size[1] / 2;
    if (top > fromY + 0.12 || top <= height) continue;
    if (inside(position, [piece.center[0], piece.center[2]], [piece.size[0], piece.size[2]], 0.08)) height = top;
  }
  return height;
}
