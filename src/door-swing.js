// Swinging doors, drawn only (POLISH_PLAN step 6.2). Pure functions, tested in Node.
//
// The simulation still treats a door as open or closed (state.doors), and that is
// what blocks movement, sight, shots and guard routes. This module only decides how
// the drawn leaf turns: which end is the hinge, which way it swings, and how far it
// has got. A door swings away from whoever opened it, on the hinge whose open leaf
// clears walls and furniture best.
import { piecesInArea } from './spatial.js';
import { activeProps, propHeight, elevation, doorHeight } from './world.js';

export const swing = {
  time: 0.45,               // seconds from closed to open (and back)
  open: Math.PI / 2 * 0.96, // how far an open door turns, radians (just short of the wall)
  leaf: 0.04,               // thickness of the drawn leaf, metres
};

// The door's long axis: 'x' or 'z', its length, and the plan position of each end.
export function doorFrame(door) {
  const alongX = door.size[0] >= door.size[1], length = alongX ? door.size[0] : door.size[1];
  const end = sign => alongX ? [door.position[0] + sign * length / 2, door.position[1]] : [door.position[0], door.position[1] + sign * length / 2];
  return { alongX, length, end };
}

// The plan box an open leaf takes, hinged at end `hinge` (-1 or 1) and swung to
// side `side` (-1 or 1, along the door's normal). Returns { center, size } in 3D.
export function openLeafBox(door, hinge, side) {
  const { alongX, length, end } = doorFrame(door), [hx, hz] = end(hinge), base = elevation(door), height = doorHeight(door);
  const center = alongX ? [hx - hinge * swing.leaf / 2, base + height / 2, hz + side * length / 2] : [hx + side * length / 2, base + height / 2, hz - hinge * swing.leaf / 2];
  const size = alongX ? [swing.leaf, height, length] : [length, height, swing.leaf];
  return { center, size };
}

// The rotation about the vertical axis that takes the leaf from closed to `side`,
// hinged at `hinge`, for a full open of `angle` radians (Three.js y rotation sense).
export function swingAngle(door, hinge, side, angle = swing.open) {
  const { alongX } = doorFrame(door);
  return (alongX ? side * hinge : -side * hinge) * angle;
}

const overlap = (a, b) => [0, 1, 2].reduce((volume, axis) => volume * Math.max(0, Math.min(a.center[axis] + a.size[axis] / 2, b.center[axis] + b.size[axis] / 2) - Math.max(a.center[axis] - a.size[axis] / 2, b.center[axis] - b.size[axis] / 2)), 1);

// How badly an open leaf would cut into walls and furniture (0 is clear).
export function leafClash(state, map, door, hinge, side) {
  const leaf = openLeafBox(door, hinge, side);
  // Shrink a little so a leaf resting flat against a wall or its own jamb does not count.
  const test = { center: leaf.center, size: leaf.size.map(v => Math.max(0.01, v - 0.08)) };
  let clash = 0;
  const lo = [0, 2].map(a => test.center[a] - test.size[a] / 2), hi = [0, 2].map(a => test.center[a] + test.size[a] / 2);
  for (const piece of piecesInArea(state.wallPieces, lo[0], hi[0], lo[1], hi[1])) {
    if (piece.hp > 0 && !piece.floor && !piece.open) clash += overlap(test, piece);
  }
  for (const prop of activeProps(state, map)) {
    const height = propHeight(prop);
    clash += overlap(test, { center: [prop.position[0], elevation(prop) + height / 2, prop.position[1]], size: [prop.size[0], height, prop.size[1]] });
  }
  return clash;
}

// Pick the hinge and side for opening `door` from `opener` ([x, z] plan position,
// or null). A map can fix either with door.hinge and door.swing (each -1 or 1).
export function chooseSwing(state, map, door, opener) {
  const { alongX } = doorFrame(door);
  const away = opener ? -Math.sign((alongX ? opener[1] - door.position[1] : opener[0] - door.position[0]) || 1) : 1;
  const side = door.swing ?? away;
  if (door.hinge) return { hinge: door.hinge, side };
  const options = [-1, 1].map(hinge => ({ hinge, clash: leafClash(state, map, door, hinge, side) }));
  // Ties keep the same end every time, so a door does not hop between hinges.
  options.sort((a, b) => a.clash - b.clash || a.hinge - b.hinge);
  return { hinge: options[0].hinge, side };
}

// Move the open fraction (0 closed, 1 open) toward the door's state over swing.time.
// Returns the eased fraction to draw.
export function stepSwing(current, open, dt) {
  const target = open ? 1 : 0, step = dt / swing.time;
  const next = current < target ? Math.min(target, current + step) : Math.max(target, current - step);
  return next;
}
export const easeSwing = t => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3);
