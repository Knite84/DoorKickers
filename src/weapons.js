import { damageWall, rayBox } from './destruction.js';
import { weapons, ammoTypes } from './kit.js';
import { alertGuards, damageGuard, shatterWindow } from './combat.js';
import { damageDoor } from './doors.js';
import { doorCenter, doorSize, elevation, windowCenter, windowSize, propBox, decorBox } from './world.js';
import { damageProp, damageDecor } from './furniture-damage.js';
import { pushProp } from './furniture-tip.js';
import { furnitureClass, durability } from './furniture.js';
import { hitGuard } from './npc-body.js';
import { roomLights } from './lighting.js';
export const MAGAZINE = 30;
// Drywall is easy to cross; framing and bodies consume the same heavier budget.
const penetrationCosts = { drywall: 1, ceiling: 1, timber: 4, body: 4, door: 3, particleboard: 6, truss: 12 };
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
  // Shotguns break furniture quicker than rifles and pistols; the multipliers are in furniture.js.
  const source = state.inventory.equipped === 'shotgun' ? 'shotgun' : 'bullet';
  const hits = [];
  function consider(center, size, kind, object, zone) {
    const d = rayBox(origin, direction, center, size, 80);
    if (d !== null) hits.push({ distance: d, kind, object, zone });
  }
  roomLights(map).forEach((fixture, i) => { if (!state.destroyedLights?.[i]) consider(fixture.position, fixture.size ?? [.46, .07, .46], 'light', i); });
  for (const piece of state.wallPieces) if (piece.hp > 0) consider(piece.center, piece.size, 'wall', piece);
  map.doors.forEach((door, i) => { if (!state.doors[i]) consider(doorCenter(door), doorSize(door), 'door', i); });
  (map.windows ?? []).forEach((window, i) => { if (state.windowHealth[i] > 0) consider(windowCenter(window), windowSize(window), 'glass', i); });
  // Every intact piece takes damage from a shot that reaches it; soft pieces then let it through.
  map.props.forEach((prop, index) => { const box = propBox(state, map, index); if (box) consider(box.center, box.size, 'prop', index); });
  (map.decor ?? []).forEach((_, index) => { const box = decorBox(state, map, index); if (box) consider(box.center, box.size, 'decor', index); });
  for (const guard of state.guards) if (guard.health > 0) {
    const hit = hitGuard(guard, origin, direction);
    if (hit) hits.push({ ...hit, kind: 'guard', object: guard });
  }
  if (direction[1] < 0) hits.push({ distance: origin[1] / -direction[1], kind: 'ground' });
  hits.sort((a, b) => a.distance - b.distance);
  let last = { distance: 80, kind: 'miss' }, removed = [], killed = false, guardHit = false, headshot = false, doorDestroyed = false, doorHit = null;
  const hitGuards = new Set(), drywallImpacts = new Set();
  const impacts = [];
  // Drawn-only data for impact effects (src/impacts.js): soft furniture and decor the shot passed through.
  const softHits = [];
  let stopped = false;
  for (const hit of hits) {
    if (hit.kind === 'decor') {
      // Drawn-only TVs, mirrors and rugs take damage but never stop a shot.
      if (rules.destructibleFurniture !== false) damageDecor(state, map, rules, hit.object, source, damage, origin.map((v, i) => v + direction[i] * hit.distance));
      softHits.push({ kind: 'decor', index: hit.object, distance: hit.distance, position: origin.map((v, i) => v + direction[i] * hit.distance), soft: true });
      continue;
    }
    if (hit.kind === 'prop' && !durability.classes[furnitureClass(map.props[hit.object])].stopsBullets) {
      damageProp(state, map, rules, hit.object, source, damage, origin.map((v, i) => v + direction[i] * hit.distance));
      softHits.push({ kind: 'prop', index: hit.object, distance: hit.distance, position: origin.map((v, i) => v + direction[i] * hit.distance), soft: true });
      continue;
    }
    if (hit.distance > 80 || hit.kind === 'wall' && hit.object.hp <= 0 || hit.kind === 'door' && state.doors[hit.object] || hit.kind === 'guard' && (hit.object.health <= 0 || hitGuards.has(hit.object))) continue;
    if (hit.kind === 'wall' && hit.object.material === 'drywall') {
      const key = `${hit.object.wall}:${Math.round(hit.distance * 1e7)}`;
      if (drywallImpacts.has(key)) continue;
      drywallImpacts.add(key);
    }
    last = hit;
    const position = origin.map((v, i) => v + direction[i] * hit.distance);
    impacts.push({ position, material: hit.kind === 'door' ? 'timber' : hit.object?.material, kind: hit.kind, zone: hit.zone, wall: hit.kind === 'wall' ? hit.object.wall : null, damage, penetration,
      // For drawing only: which piece or object was hit, and how far along the ray.
      piece: hit.kind === 'wall' ? hit.object.id : undefined, index: typeof hit.object === 'number' ? hit.object : undefined, distance: hit.distance });
    let resistance = Infinity;
    if (hit.kind === 'prop') {
      damageProp(state, map, rules, hit.object, source, damage, position);
      // A chair or stool hit hard enough tips over (src/furniture-tip.js).
      pushProp(state, map, rules, hit.object, direction, state.inventory.weapons[state.inventory.equipped]?.ammoType === 'slug' ? 'slug' : source === 'shotgun' ? 'pellet' : state.inventory.equipped === 'sniper' ? 'sniper' : 'bullet');
      resistance = durability.classes[furnitureClass(map.props[hit.object])].bulletCost ?? Infinity;
    }
    if (hit.kind === 'wall' && rules.destructibleWalls) {
      removed.push(...damageWall(state.wallPieces, hit.object, wallPower, ['pistol', 'rifle', 'sniper'].includes(state.inventory.equipped) ? 'precise' : 'impact'));
      resistance = penetrationCosts[hit.object.material] ?? Infinity;
    }
    if (hit.kind === 'light') { (state.destroyedLights ??= [])[hit.object] = true; resistance = 0.1; }
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
      const protectedHit = hit.object.armored && (hit.object.armorHits ?? 0) > 0 && (hit.zone === 'chest' || hit.zone === 'stomach');
      if (protectedHit) hit.object.armorHits--;
      const bodyDamage = protectedHit ? damage * 0.35 : damage;
      killed = damageGuard(state, hit.object, hit.zone === 'head' ? hit.object.health : bodyDamage, { zone: hit.zone, joint: hit.joint, direction, position, origin, protectedHit }) || killed;
      hitGuards.add(hit.object); guardHit = true; resistance = penetrationCosts.body;
    }
    if (penetration <= resistance) { stopped = true; break; }
    penetration -= resistance; damage *= 0.8; wallPower *= 0.8;
  }
  return { origin, position: origin.map((v, i) => v + direction[i] * last.distance), kind: guardHit ? 'guard' : last.kind, material: last.kind === 'door' ? 'timber' : last.object?.material, removed, killed, headshot, doorDestroyed, doorHit, impacts, softHits, stopped };
}
export function fireWeapon(state, map, rules, origin, rawDirection) {
  if(state.playerCover&&!state.playerCover.peeking) return null;
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
  // Slugs replace the shotgun's pellets with one projectile (ammo.pellets).
  const pelletCount = ammo.pellets ?? weapon.pellets;
  for (let i = 0; i < pelletCount; i++) {
    const right = Math.hypot(direction[0], direction[2]) > 0.001 ? [-direction[2], 0, direction[0]] : [1, 0, 0];
    const rlen = Math.hypot(...right); right.forEach((_, index) => { right[index] /= rlen; });
    const up = [direction[1] * right[2], direction[2] * right[0] - direction[0] * right[2], -direction[1] * right[0]];
    const angle = i * 2.39996, spread = pelletCount > 1 ? weapon.spread * Math.sqrt(i / pelletCount) : 0;
    const ray = direction.map((v, axis) => v + right[axis] * Math.cos(angle) * spread + up[axis] * Math.sin(angle) * spread);
    const norm = Math.hypot(...ray); ray.forEach((_, axis) => { ray[axis] /= norm; });
    const penetration = weapon.penetration * ammo.penetration * (config.velocity === 'subsonic' ? 0.85 : 1);
    pellets.push(traceShot(state, map, rules, origin, ray, damage, rules.wallDamage * ammo.wall, penetration));
  }
  const radius = (config.suppressor ? 6 : 18) * (config.velocity === 'subsonic' ? 0.5 : 1);
  alertGuards(state, rules, origin, radius, map);
  return { ...pellets[0], kind: pellets.some(p => p.kind === 'guard') ? 'guard' : pellets[0].kind, removed: pellets.flatMap(p => p.removed), killed: pellets.some(p => p.killed), headshot: pellets.some(p => p.headshot), doorDestroyed: pellets.some(p => p.doorDestroyed), doorHit: pellets.find(p => p.doorHit !== null)?.doorHit ?? null, pellets, suppressed: config.suppressor };
}
