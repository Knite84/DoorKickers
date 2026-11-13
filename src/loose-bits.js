// Loose bits (POLISH_PLAN step 6.2): spent casings, chips, splinters, shards and
// chunks that bounce off the house and come to rest. Pure functions, so they run
// in Node tests; src/scene-effects.js draws them.
//
// Bits are drawn only. They read the mission state (wall pieces, doors, glass,
// furniture) but never change it, and nothing in the game reacts to them.
// Contacts use the same solids the ragdolls collide with (src/npc-body.js).
//
// A bit is { position: [x, y, z], velocity: [x, y, z], radius, resting, still }.
// Every tuning number is in `looseBits`.
import { piecesInArea } from './spatial.js';
import { doorCenter, doorSize, windowCenter, windowSize, activeProps, propHeight, elevation } from './world.js';
import { rayBox } from './destruction.js';
import { boxFaces } from './impacts.js';

export const looseBits = {
  gravity: 9.8,
  bounce: 0.32,          // share of speed into a surface kept after the bounce
  friction: 0.55,        // share of sliding speed lost on each bounce off a floor
  rollDrag: 3,           // per second, while sliding along a floor
  sleepSpeed: 0.12,      // m/s: slower than this on a floor counts as still
  sleepTime: 0.2,        // s of being still before a bit rests
  life: { casing: 20, debris: 8 },
  fade: 1,               // s of shrinking away at the end of a life
  limit: { casing: 60 }, // oldest casings are recycled past this
  reach: 0.6,            // m around the moving bits searched for solids each frame
};

// The solids near a group of bits, gathered once a frame: wall, floor and stair
// pieces, closed doors, intact glass and standing furniture.
export function gatherSolids(state, map, low, high) {
  const r = looseBits.reach, lo = low.map(v => v - r), hi = high.map(v => v + r);
  const near = (center, size) => [0, 1, 2].every(a => center[a] + size[a] / 2 >= lo[a] && center[a] - size[a] / 2 <= hi[a]);
  const solids = [];
  for (const piece of piecesInArea(state.wallPieces, lo[0], hi[0], lo[2], hi[2])) {
    if (piece.hp > 0 && !piece.open && near(piece.center, piece.size)) solids.push({ center: piece.center, size: piece.size });
  }
  map.doors.forEach((door, i) => { if (!state.doors[i]) { const center = doorCenter(door), size = doorSize(door); if (near(center, size)) solids.push({ center, size }); } });
  (map.windows ?? []).forEach((w, i) => { if (state.windowHealth?.[i] > 0) { const center = windowCenter(w), size = windowSize(w); if (near(center, size)) solids.push({ center, size }); } });
  for (const prop of activeProps(state, map)) {
    const height = propHeight(prop), center = [prop.position[0], elevation(prop) + height / 2, prop.position[1]], size = [prop.size[0], height, prop.size[1]];
    if (near(center, size)) solids.push({ center, size });
  }
  return solids;
}

// Advance one bit by dt against the given solids. Moves are swept, so a fast
// chip cannot pass through a 4.5 cm drywall skin. Returns a landing
// { position, speed } the first frame the bit hits a floor hard enough to hear,
// otherwise null.
export function stepBit(bit, solids, dt) {
  if (bit.resting) return null;
  let landing = null, left = dt;
  bit.velocity[1] -= looseBits.gravity * dt;
  for (let pass = 0; pass < 3 && left > 1e-6; pass++) {
    const speed = Math.hypot(...bit.velocity);
    if (speed < 1e-6) break;
    const direction = bit.velocity.map(v => v / speed), travel = speed * left;
    let first = null;
    for (const solid of solids) {
      const size = solid.size.map(v => v + bit.radius * 2);
      if (rayBox(bit.position, direction, solid.center, size, travel) === null) continue;
      const faces = boxFaces(bit.position, direction, solid.center, size);
      if (!faces || faces.entry.distance > travel) continue;
      // Already inside (resting contact or spawned in): push out instead of sweeping.
      if (faces.entry.distance <= 0) { pushOut(bit, solid); continue; }
      if (!first || faces.entry.distance < first.distance) first = faces.entry;
    }
    // The open ground outside is a floor at height 0.
    const groundTime = bit.velocity[1] < 0 ? (bit.position[1] - bit.radius) / -bit.velocity[1] : Infinity;
    if (groundTime >= 0 && groundTime < left && (!first || groundTime * speed < first.distance)) first = { distance: groundTime * speed, normal: [0, 1, 0], point: bit.position.map((v, i) => v + bit.velocity[i] * groundTime) };
    if (!first) { for (let i = 0; i < 3; i++) bit.position[i] += bit.velocity[i] * left; break; }
    const t = first.distance / speed;
    for (let i = 0; i < 3; i++) bit.position[i] += bit.velocity[i] * t - first.normal[i] * 1e-4;
    left -= t;
    // Bounce: keep part of the speed into the surface, lose some sliding speed on floors.
    const n = first.normal, into = bit.velocity[0] * n[0] + bit.velocity[1] * n[1] + bit.velocity[2] * n[2];
    if (into < 0) {
      for (let i = 0; i < 3; i++) bit.velocity[i] -= (1 + looseBits.bounce) * into * n[i];
      if (n[1] > 0.7) {
        bit.velocity[0] *= 1 - looseBits.friction; bit.velocity[2] *= 1 - looseBits.friction;
        if (-into > 0.8 && !landing) landing = { position: [...bit.position], speed: -into };
      }
    }
    if (n[1] > 0.7) bit.support = true;
  }
  // Sliding along a floor slows down, and a slow bit on a floor comes to rest.
  const speed = Math.hypot(...bit.velocity);
  if (bit.support) {
    const drag = Math.max(0, 1 - looseBits.rollDrag * dt);
    bit.velocity[0] *= drag; bit.velocity[2] *= drag;
    if (Math.abs(bit.velocity[1]) < 0.5 && speed < looseBits.sleepSpeed * 4) bit.velocity[1] = Math.min(0, bit.velocity[1]);
  }
  bit.still = bit.support && speed < looseBits.sleepSpeed ? (bit.still ?? 0) + dt : 0;
  if (bit.still >= looseBits.sleepTime) { bit.resting = true; bit.velocity = [0, 0, 0]; }
  bit.support = false;
  return landing;
}

function pushOut(bit, solid) {
  const p = bit.position, r = bit.radius;
  const depth = [0, 1, 2].map(a => solid.size[a] / 2 + r - Math.abs(p[a] - solid.center[a]));
  if (depth.some(d => d <= 0)) return;
  // Leave through the shallowest face; prefer upward when nearly level, so bits settle on top.
  let axis = depth.indexOf(Math.min(...depth));
  if (axis !== 1 && depth[1] < depth[axis] + 0.01 && p[1] > solid.center[1]) axis = 1;
  const sign = p[axis] >= solid.center[axis] ? 1 : -1;
  p[axis] = solid.center[axis] + sign * (solid.size[axis] / 2 + r);
  if (bit.velocity[axis] * sign < 0) bit.velocity[axis] *= -looseBits.bounce;
  if (axis === 1 && sign > 0) bit.support = true;
}

// Step every moving bit in a list, gathering solids once around them. Resting
// bits cost nothing. Returns the landings this frame.
export function stepBits(bits, state, map, dt) {
  const moving = bits.filter(bit => bit && !bit.resting && bit.life > 0);
  if (!moving.length || !state?.wallPieces) return [];
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (const bit of moving) for (let i = 0; i < 3; i++) {
    const reach = Math.abs(bit.velocity[i]) * dt + bit.radius;
    low[i] = Math.min(low[i], bit.position[i] - reach); high[i] = Math.max(high[i], bit.position[i] + reach);
  }
  const solids = gatherSolids(state, map, low, high), landings = [];
  for (const bit of moving) {
    // Only the solids this bit can reach this frame.
    const reach = Math.hypot(...bit.velocity) * dt + bit.radius + 0.05;
    const mine = solids.filter(s => [0, 1, 2].every(a => Math.abs(bit.position[a] - s.center[a]) <= s.size[a] / 2 + reach));
    const landing = stepBit(bit, mine, dt);
    if (landing) landings.push({ ...landing, kind: bit.kind });
  }
  return landings;
}

// Wake resting bits, for example after the structure around them changed.
export function wakeBits(bits) { for (const bit of bits) if (bit?.resting && bit.life > 0) { bit.resting = false; bit.still = 0; } }
