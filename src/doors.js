export const DEFAULT_DOOR_HEALTH = 120;

// Open/closed is separate from damage: a destroyed door can never be closed again.
export function damageDoor(state, map, index, amount, position) {
  if (state.doorHealth[index] <= 0 || amount <= 0) return false;
  state.doorHealth[index] = Math.max(0, state.doorHealth[index] - amount);
  if (state.doorHealth[index] > 0) return false;
  state.doors[index] = true;
  const door = map.doors[index];
  if (state.lockedDoors) state.lockedDoors[index] = false;
  state.events.push({ type: 'door-break', position: position ?? [door.position[0], (door.elevation ?? 0) + 1.4, door.position[1]] });
  return true;
}
