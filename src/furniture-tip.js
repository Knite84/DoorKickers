// Chairs and stools that tip over (owner, 2026-11-12; POLISH_PLAN step 6.2).
// Pure simulation, tested in Node; src/scene.js draws the fall.
//
// Light seats collect a push from what hits them: bullets, shotgun pellets, melee
// strikes and blasts. Past one full push the piece tips over, away from whatever hit
// it. A tipped piece no longer blocks movement or stops shots (you can step over it and
// guards path past it), hides only what is below knee height, makes a noise guards can
// hear, and counts as disturbed furniture a guard who sees it reports. It does not
// stand back up. The rule "Breakable furniture" switches tipping off with breaking.
import { propBroken, propTipped, elevation } from './world.js';
import { alertGuards } from './combat.js';

export const tipping = {
  kinds: ['chair', 'barStool'],
  // Push per hit; a piece tips at a total of 1.
  push: { bullet: 0.35, sniper: 0.7, pellet: 0.2, slug: 1, melee: 1.2, blast: 2 },
  angle: Math.PI / 2 * 0.95,   // how far it falls (just short of flat, resting on its back)
  time: 0.45,                  // seconds for the fall
  lyingHeight: 0.45,           // height of a tipped seat, for sight
  noise: 6,                    // open-air reach of the clatter for guards, metres
};

export const canTip = prop => tipping.kinds.includes(prop?.kind);

// Add a push to a piece from `direction` ([x, z] or [x, y, z], the way the hit travelled).
// Returns true the moment it tips.
export function pushProp(state, map, rules, index, direction, kind) {
  const prop = map.props[index];
  if (rules?.destructibleFurniture === false || !canTip(prop) || propBroken(state, index) || propTipped(state, index)) return false;
  const amount = tipping.push[kind] ?? tipping.push.bullet;
  state.propPush ??= {}; state.propPush[index] = (state.propPush[index] ?? 0) + amount;
  if (state.propPush[index] < 1) return false;
  const dx = direction[0], dz = direction.length === 3 ? direction[2] : direction[1], length = Math.hypot(dx, dz) || 1;
  state.propTipped ??= {};
  state.propTipped[index] = { dir: [dx / length, dz / length], at: state.elapsed ?? 0 };
  // The broken-furniture count doubles as "props no longer in the way" for caches (routes, cover).
  state.propBroken = (state.propBroken ?? 0) + 1;
  state.propStamp = (state.propStamp ?? 0) + 1;
  const position = [prop.position[0], elevation(prop) + 0.3, prop.position[1]];
  state.events?.push({ type: 'furniture-tip', position, index });
  if (rules) alertGuards(state, rules, position, tipping.noise, map);
  return true;
}

// The fall as a rotation: about a horizontal axis through the floor edge the piece tips
// over, by `angle` radians at mission time `now`. { pivot: [x, y, z], axis: [x, 0, z], angle }.
export function tipPose(prop, tip, now) {
  const [dx, dz] = tip.dir, [sx, sz] = prop.size;
  const reach = Math.abs(dx) * sx / 2 + Math.abs(dz) * sz / 2;
  const pivot = [prop.position[0] + dx * reach, elevation(prop), prop.position[1] + dz * reach];
  const t = Math.max(0, Math.min(1, (now - tip.at) / tipping.time));
  // Falls slowly at first and quickly at the end, like something toppling.
  return { pivot, axis: [dz, 0, -dx], angle: tipping.angle * t * t, done: t >= 1 };
}
