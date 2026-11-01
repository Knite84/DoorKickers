import { damageWall, rayBox } from './destruction.js';
import { weapons, ammoTypes } from './kit.js';
import { alertGuards, damageGuard, shatterWindow } from './combat.js';
import { damageDoor } from './doors.js';
import { doorCenter, doorSize, elevation, windowCenter, windowSize } from './world.js';
import { hitGuard } from './npc-body.js';
export const MAGAZINE = 30;
// Drywall is easy to cross; framing and bodies consume the same heavier budget.
const penetrationCosts = { drywall: 1, timber: 4, body: 4, door: 3, particleboard: 6, truss: 12 };
export function reload(state) {
  const weapon = weapons[state.inventory.equipped];
  if (!weapon || state.status !== 'active' || state.reloadUntil > state.elapsed || state.ammo === weapon.magazine) return false;
  state.reloadUntil = state.elapsed + weapon.reload;
  return true;
}
export function finishReload(state) {
  if (state.reloadUntil && state.elapsed >= state.reloadUntil) {
    state.ammo = weapons[state.inventory.equipped].magazine;
    state.inventory.magazines[state.inventory.equipped] = state.ammo; state.reloadUntil = 0;
  }
}
function traceShot(state, map, rules, origin, direction, damage, wallPower, penetration) {
  const doorPower = wallPower;
  const hits = [];
  function consider(center, size, kind, object, zone) {
    const d = rayBox(origin, direction, center, size, 80);
    if (d !== null) hits.push({ distance: d, kind, object, zone });
  }
  for (const piece of state.wallPieces) if (piece.hp > 0) consider(piece.center, piece.size, 'wall', piece);
  map.doors.forEach((door, i) => { if (!state.doors[i]) consider(doorCenter(door), doorSize(door), 'door', i); });
  (map.windows ?? []).forEach((window, i) => { if (state.windowHealth[i] > 0) consider(windowCenter(window), windowSize(window), 'glass', i); });
  for (const prop of map.props) consider([prop.position[0], elevation(prop) + 0.55, prop.position[1]], [prop.size[0], 1.1, prop.size[1]], 'prop', prop);
  for (const guard of state.guards) if (guard.health > 0) {
    const hit = hitGuard(guard, origin, direction);
    if (hit) hits.push({ ...hit, kind: 'guard', object: guard });
  }
  if (direction[1] < 0) hits.push({ distance: origin[1] / -direction[1], kind: 'ground' });
  hits.sort((a, b) => a.distance - b.distance);
  let last = { distance: 80, kind: 'miss' }, removed = [], killed = false, guardHit = false, headshot = false, doorDestroyed = false, doorHit = null;
  const hitGuards = new Set();
  const impacts = [];
  for (const hit of hits) {
    if (hit.distance > 80 || hit.kind === 'wall' && hit.object.hp <= 0 || hit.kind === 'door' && state.doors[hit.object] || hit.kind === 'guard' && (hit.object.health <= 0 || hitGuards.has(hit.object))) continue;
    last = hit;
    const position = origin.map((v, i) => v + direction[i] * hit.distance);
    impacts.push({ position, material: hit.kind === 'door' ? 'timber' : hit.object?.material, kind: hit.kind, zone: hit.zone, wall: hit.kind === 'wall' ? hit.object.wall : null, damage, penetration });
    let resistance = Infinity;
    if (hit.kind === 'wall' && rules.destructibleWalls) {
      removed.push(...damageWall(state.wallPieces, hit.object, wallPower));
      resistance = penetrationCosts[hit.object.material] ?? Infinity;
    }
    if (hit.kind === 'glass') { shatterWindow(state, map, hit.object); resistance = 0.1; }
    if (hit.kind === 'door') {
      doorHit = hit.object;
      if (rules.destructibleDoors) {
        doorDestroyed = damageDoor(state, map, hit.object, damage * doorPower, position) || doorDestroyed;
        resistance = penetrationCosts.door;
      }
    }
    if (hit.kind === 'guard') {
      headshot ||= hit.zone === 'head';
      killed = damageGuard(state, hit.object, hit.zone === 'head' ? hit.object.health : damage, { zone: hit.zone, joint: hit.joint, direction, position }) || killed;
      hitGuards.add(hit.object); guardHit = true; resistance = penetrationCosts.body;
    }
    if (penetration <= resistance) break;
    penetration -= resistance; damage *= 0.8; wallPower *= 0.8;
  }
  return { origin, position: origin.map((v, i) => v + direction[i] * last.distance), kind: guardHit ? 'guard' : last.kind, material: last.kind === 'door' ? 'timber' : last.object?.material, removed, killed, headshot, doorDestroyed, doorHit, impacts };
}
export function fireWeapon(state, map, rules, origin, rawDirection) {
  const weapon = weapons[state.inventory.equipped];
  if (!weapon || state.status !== 'active' || state.elapsed < state.nextShot || state.reloadUntil > state.elapsed || (!rules.unlimitedAmmo && state.ammo === 0)) return null;
  const length = Math.hypot(...rawDirection);
  if (length < 1e-8) return null;
  const direction = rawDirection.map(value => value / length);
  const config = state.inventory.weapons[state.inventory.equipped], ammo = ammoTypes[config.ammoType];
  if (!rules.unlimitedAmmo) state.ammo--;
  state.inventory.magazines[state.inventory.equipped] = state.ammo;
  state.nextShot = state.elapsed + weapon.interval; state.shots++;
  const damage = weapon.damage * rules.weaponDamage / 50 * ammo.damage * (config.velocity === 'subsonic' ? 0.8 : 1);
  const pellets = [];
  for (let i = 0; i < weapon.pellets; i++) {
    const right = Math.hypot(direction[0], direction[2]) > 0.001 ? [-direction[2], 0, direction[0]] : [1, 0, 0];
    const rlen = Math.hypot(...right); right.forEach((_, index) => { right[index] /= rlen; });
    const up = [direction[1] * right[2], direction[2] * right[0] - direction[0] * right[2], -direction[1] * right[0]];
    const angle = i * 2.39996, spread = weapon.pellets > 1 ? weapon.spread * Math.sqrt(i / weapon.pellets) : 0;
    const ray = direction.map((v, axis) => v + right[axis] * Math.cos(angle) * spread + up[axis] * Math.sin(angle) * spread);
    const norm = Math.hypot(...ray); ray.forEach((_, axis) => { ray[axis] /= norm; });
    const penetration = weapon.penetration * ammo.penetration * (config.velocity === 'subsonic' ? 0.85 : 1);
    pellets.push(traceShot(state, map, rules, origin, ray, damage, rules.wallDamage * ammo.wall, penetration));
  }
  const radius = (config.suppressor ? 6 : 18) * (config.velocity === 'subsonic' ? 0.5 : 1);
  alertGuards(state, rules, origin, radius);
  return { ...pellets[0], kind: pellets.some(p => p.kind === 'guard') ? 'guard' : pellets[0].kind, removed: pellets.flatMap(p => p.removed), killed: pellets.some(p => p.killed), headshot: pellets.some(p => p.headshot), doorDestroyed: pellets.some(p => p.doorDestroyed), doorHit: pellets.find(p => p.doorHit !== null)?.doorHit ?? null, pellets, suppressed: config.suppressor };
}
