import { damageWall, rayBox, removeUnsupportedPieces } from './destruction.js';
import { items, weapons } from './kit.js';
import { alertGuards, damageGuard, damagePlayer, segmentClear, shatterWindow } from './combat.js';
import { damageDoor } from './doors.js';
import { doorCenter, doorSize, elevation, playerEye, windowCenter, windowSize, propBox, decorBox } from './world.js';
import { damageProp, damageDecor } from './furniture-damage.js';
import { durability } from './furniture.js';
import { hitGuard, guardPose } from './npc-body.js';

function nearbyHit(state, map, origin, direction, reach, blockProps = false) {
  let hit = null, closest = reach;
  const consider = (center, size, kind, object) => {
    const d = rayBox(origin, direction, center, size, closest);
    if (d !== null && d < closest) { closest = d; hit = { kind, object, position: origin.map((v, i) => v + direction[i] * d) }; }
  };
  for (const piece of state.wallPieces) if (piece.hp > 0) consider(piece.center, piece.size, 'wall', piece);
  map.doors.forEach((door, i) => { if (!state.doors[i]) consider(doorCenter(door), doorSize(door), 'door', i); });
  (map.windows ?? []).forEach((window, i) => { if (state.windowHealth[i] > 0) consider(windowCenter(window), windowSize(window), 'glass', i); });
  if (blockProps) {
    map.props.forEach((_, index) => { const box = propBox(state, map, index); if (box) consider(box.center, box.size, 'prop', index); });
    (map.decor ?? []).forEach((_, index) => { const box = decorBox(state, map, index); if (box) consider(box.center, box.size, 'decor', index); });
  }
  for (const guard of state.guards) if (guard.health > 0) {
    const bodyHit = hitGuard(guard, origin, direction, closest);
    if (bodyHit && bodyHit.distance < closest) { closest = bodyHit.distance; hit = { ...bodyHit, kind: 'guard', object: guard, position: origin.map((v, i) => v + direction[i] * closest) }; }
  }
  return hit;
}
function event(state, type, position, extra = {}) { state.events.push({ type, position: [...position], ...extra }); }
function breakWindowsAlongPath(state, map, origin, next) {
  const length = Math.hypot(...next.map((v, i) => v - origin[i]));
  if (length < 1e-8) return;
  const direction = next.map((v, i) => (v - origin[i]) / length);
  const hits = (map.windows ?? []).flatMap((window, index) => {
    if (!(state.windowHealth[index] > 0)) return [];
    const distance = rayBox(origin, direction, windowCenter(window), windowSize(window), length);
    return distance === null ? [] : [{ index, distance }];
  }).sort((a, b) => a.distance - b.distance);
  for (const hit of hits) {
    const face = origin.map((v, i) => v + direction[i] * Math.max(0, hit.distance - 0.001));
    // Only break glass the item actually reaches; a wall/door before a pane
    // still blocks the throw. Sweep the full step so thin glass cannot be skipped.
    if (!segmentClear(state, map, origin, face, -1, { glass: false })) break;
    shatterWindow(state, map, hit.index);
  }
}
function blast(state, map, rules, position, radius = 3, power = 120, heading, innerRadius = 0) {
  const within = (target, base = 0) => {
    const dx = target[0] - position[0], dz = target[1] - position[2];
    const d = Math.hypot(dx, dz, base + 1 - position[1]);
    if (d > radius) return 0;
    if (heading !== undefined && d > 0.1 && Math.cos(Math.atan2(dz, dx) - heading) < 0.5) return 0;
    if (!segmentClear(state, map, position, [target[0], base + 1, target[1]], -1, { glass: false })) return 0;
    return innerRadius > 0 ? Math.max(0, 1 - Math.max(0, d - innerRadius) / (radius - innerRadius)) : Math.max(0.25, 1 - d / radius);
  };
  // Resolve exposure against the cover present when the blast starts. A wall or
  // closed door can absorb this blast even when that same blast breaks it.
  const guardExposure = state.guards.map(guard => {
    const torso = guardPose(guard).chest;
    return within([torso[0], torso[2]], torso[1] - 1);
  });
  const exposed=playerEye(state);
  const playerExposure = Math.max(within(state.player, state.playerY ?? 0),within([exposed[0],exposed[2]],exposed[1]-1));
  if (rules.destructibleWalls) for (const piece of state.wallPieces) {
    const d = Math.hypot(...piece.center.map((v, axis) => Math.max(0, Math.abs(v - position[axis]) - piece.size[axis] / 2)));
    if (piece.hp > 0 && Number.isFinite(piece.hp) && d < radius * 0.6) piece.hp = Math.max(0, piece.hp - power / 8 * rules.blastDamage * (1 - d / (radius * 0.75)));
  }
  if (rules.destructibleWalls) removeUnsupportedPieces(state.wallPieces);
  if (rules.destructibleDoors) map.doors.forEach((door, index) => {
    if (state.doors[index]) return;
    const d = Math.hypot(door.position[0] - position[0], door.position[1] - position[2], elevation(door) + 1 - position[1]);
    if (d >= radius) return;
    const exposure = innerRadius > 0 ? Math.max(0, 1 - Math.max(0, d - innerRadius) / (radius - innerRadius)) : Math.max(0.25, 1 - d / radius);
    // Test the blast-facing surface, rather than the center inside the door's own collider.
    const source = position;
    const direction = [(door.position[0] - position[0]) / (d || 1), (elevation(door) + 1 - position[1]) / (d || 1), (door.position[1] - position[2]) / (d || 1)];
    const hitDistance = rayBox(source, direction, doorCenter(door), doorSize(door), d);
    const surface = source.map((v, axis) => v + direction[axis] * Math.max(0, (hitDistance ?? d) - 0.02));
    if (segmentClear(state, map, source, surface, -1, { glass: false })) damageDoor(state, map, index, exposure * power * rules.blastDamage);
  });
  // Furniture takes the blast unless a wall or door shields it. Pieces do not shield each other.
  if (rules.destructibleFurniture !== false) {
    const hurtFurniture = (boxes, hurt) => boxes.forEach((box, index) => {
      if (!box) return;
      const d = Math.hypot(...box.center.map((v, axis) => Math.max(0, Math.abs(v - position[axis]) - box.size[axis] / 2)));
      if (d >= radius) return;
      const surface = box.center.map((v, axis) => Math.min(v + box.size[axis] / 2, Math.max(v - box.size[axis] / 2, position[axis])));
      if (!segmentClear(state, map, position, position.map((v, axis) => v + (surface[axis] - v) * 0.98), -1, { glass: false })) return;
      const exposure = innerRadius > 0 ? Math.max(0, 1 - Math.max(0, d - innerRadius) / (radius - innerRadius)) : Math.max(0.25, 1 - d / radius);
      hurt(state, map, rules, index, 'blast', exposure * power * rules.blastDamage, surface);
    });
    hurtFurniture(map.props.map((_, index) => propBox(state, map, index)), damageProp);
    hurtFurniture((map.decor ?? []).map((_, index) => decorBox(state, map, index)), damageDecor);
  }
  (map.windows ?? []).forEach((window, index) => { if (Math.hypot(...windowCenter(window).map((v, axis) => v - position[axis])) < radius) shatterWindow(state, map, index); });
  state.guards.forEach((guard, index) => damageGuard(state, guard, guardExposure[index] * power * rules.blastDamage));
  if (rules.friendlyFire) damagePlayer(state, rules, playerExposure * power * rules.blastDamage);
  alertGuards(state, rules, position, 24, map); event(state, 'blast', position, { radius });
}
export function detonateCharges(state, map, rules) {
  if (state.status !== 'active') return 0;
  const charges = state.devices.filter(device => device.type === 'detcord');
  state.devices = state.devices.filter(device => device.type !== 'detcord');
  for (const charge of charges) {
    if (charge.door !== undefined) {
      if (rules.destructibleDoors) damageDoor(state, map, charge.door, Infinity, charge.position);
      else state.doors[charge.door] = true;
    }
    if (rules.destructibleWalls && charge.wall !== undefined) for (const piece of state.wallPieces) {
      // Ground under a slope and tree trunks do not breach.
      if (piece.wall === charge.wall && !piece.slope && !piece.tree && Math.hypot(...piece.center.map((v, axis) => v - charge.position[axis])) < 1.2) piece.hp = Math.max(0, piece.hp - (piece.floor ? 60 : Infinity));
    }
    blast(state, map, rules, charge.position, 2.5, 100);
  }
  return charges.length;
}
// A close-range blunt strike with the equipped firearm. It does not consume ammo.
export function weaponStrike(state, map, rules, origin, rawDirection) {
  if (state.status !== 'active' || !weapons[state.inventory.equipped] || state.reloadUntil > state.elapsed || state.elapsed < (state.meleeUntil ?? 0) || (state.playerCover && !state.playerCover.peeking)) return null;
  const length = Math.hypot(...rawDirection);
  if (length < 0.001) return null;
  const direction = rawDirection.map(value => value / length);
  state.meleeUntil = state.elapsed + 0.65;
  state.nextShot = Math.max(state.nextShot, state.meleeUntil);
  const hit = nearbyHit(state, map, origin, direction, 1.6, true);
  if (hit) {
    if (hit.kind === 'guard') damageGuard(state, hit.object, 25);
    if (hit.kind === 'glass') shatterWindow(state, map, hit.object);
    if (hit.kind === 'prop') damageProp(state, map, rules, hit.object, 'melee', durability.raw.strike, hit.position);
    if (hit.kind === 'decor') damageDecor(state, map, rules, hit.object, 'melee', durability.raw.strike, hit.position);
    event(state, 'strike', hit.position);
    alertGuards(state, rules, hit.position, 5, map);
  }
  return { kind: hit?.kind ?? 'miss', killed: hit?.kind === 'guard' && hit.object.health <= 0 };
}
export function useEquipment(state, map, rules, origin, rawDirection) {
  const id = state.inventory.equipped, item = items[id];
  if (!item || state.status !== 'active' || state.elapsed < state.nextUse) return '';
  if (state.inventory.items[id] <= 0) return `${item.name}: none remaining.`;
  const norm = Math.hypot(...rawDirection);
  if (norm < 0.001) return '';
  const direction = rawDirection.map(v => v / norm);
  if (id === 'medkit') {
    if (state.health >= 100) return 'Already at full health. Med kit kept.';
    state.health = Math.min(100, state.health + 50); state.inventory.items[id]--; state.nextUse = state.elapsed + 1;
    event(state, 'heal', origin); return 'Med kit used: health restored.';
  }
  if (id === 'pickgun') {
    const hit = nearbyHit(state, map, origin, direction, 2.5);
    if (hit?.kind !== 'door') return 'Aim at a closed door within reach.';
    if (!state.lockedDoors[hit.object]) return 'This door is already unlocked. E opens it.';
    state.lockedDoors[hit.object] = false; state.doors[hit.object] = true; state.nextUse = state.elapsed + 2;
    return 'Lock opened quietly. Door picking gun kept.';
  }
  if (id === 'knife') {
    const hit = nearbyHit(state, map, origin, direction, 1.6);
    if (hit?.kind !== 'guard') return 'Move close and aim at a guard to use the knife.';
    const guard = hit.object, dx = origin[0] - guard.position[0], dz = origin[2] - guard.position[1], distance = Math.hypot(dx, dz);
    const rear = distance > 0.01 && (dx * Math.cos(guard.heading) + dz * Math.sin(guard.heading)) / distance < -0.5;
    // A rear attack is instantly incapacitating, so there is no surviving-guard
    // injury call and no noise alert. Visual discovery of the body remains active.
    damageGuard(state, guard, rear ? guard.health : 55);
    state.nextUse = state.elapsed + 0.55; event(state, 'strike', hit.position);
    return rear ? 'Silent knife takedown. No noise or radio alert; the body can still be discovered.' : guard.health <= 0 ? 'Guard down. The earlier injury call may have alerted backup.' : 'Knife hit. The injured guard can call for backup.';
  }
  if (id === 'axe' || id === 'crowbar' || id === 'detcord') {
    // Axes and crowbars strike furniture; det cord is placed on structure only.
    const hit = nearbyHit(state, map, origin, direction, 2.5, id !== 'detcord');
    if (!hit) return 'Move closer and aim at a wall, door, window, or guard.';
    if (id === 'detcord') {
      if (hit.kind === 'guard' || hit.kind === 'glass') return 'Place det cord on a wall, floor, or door.';
      state.devices.push({ type: id, position: hit.position, wall: hit.kind === 'wall' ? hit.object.wall : undefined, door: hit.kind === 'door' ? hit.object : undefined });
      state.inventory.items[id]--; state.nextUse = state.elapsed + 0.5;
      return 'Charge placed. Move clear, then press B to detonate placed charges.';
    }
    state.nextUse = state.elapsed + (id === 'axe' ? 0.65 : 0.45);
    if (hit.kind === 'door') {
      if (id === 'axe' && rules.destructibleDoors) damageDoor(state, map, hit.object, 70, hit.position);
      state.doors[hit.object] = true;
      state.lockedDoors[hit.object] = false; alertGuards(state, rules, origin, 7, map);
    }
    if (hit.kind === 'wall' && rules.destructibleWalls) damageWall(state.wallPieces, hit.object, id === 'axe' ? 4 : 1);
    if (hit.kind === 'guard') damageGuard(state, hit.object, id === 'axe' ? 70 : 35);
    if (hit.kind === 'glass') shatterWindow(state, map, hit.object);
    if (hit.kind === 'prop') damageProp(state, map, rules, hit.object, 'melee', durability.raw[id], hit.position);
    if (hit.kind === 'decor') damageDecor(state, map, rules, hit.object, 'melee', durability.raw[id], hit.position);
    if (id === 'axe' || hit.kind === 'glass') alertGuards(state, rules, origin, 7, map);
    event(state, 'strike', hit.position);
    return hit.kind === 'glass' ? `Window shattered with ${item.name.toLowerCase()}.` : hit.kind === 'door' ? 'Door forced open.' : hit.kind === 'wall' && hit.object.blastOnly ? 'Exterior masonry requires explosives.' : `${item.name} strike.`;
  }
  if (id === 'claymore') {
    const position = [origin[0] + direction[0] * 0.8, (state.playerY ?? 0) + 0.15, origin[2] + direction[2] * 0.8];
    if (!segmentClear(state, map, origin, [position[0], origin[1], position[2]])) return 'Placement blocked. Step clear of the wall.';
    state.devices.push({ type: id, position, heading: Math.atan2(direction[2], direction[0]), armedAt: state.elapsed + 1 });
    state.inventory.items[id]--; state.nextUse = state.elapsed + 0.6;
    return 'Claymore placed, facing your aim. Arms in one second.';
  }
  state.projectiles.push({ type: id, position: [...origin], velocity: [direction[0] * 9, direction[1] * 9 + 3, direction[2] * 9], expires: state.elapsed + (id === 'molotov' ? 4 : 1.5), settled: false });
  state.inventory.items[id]--; state.nextUse = state.elapsed + 0.7;
  return `${item.name} thrown.`;
}
export function stepEquipment(state, map, rules, delta) {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const projectile = state.projectiles[i];
    if (!projectile.settled) {
      projectile.velocity[1] -= delta * 9;
      const next = projectile.position.map((v, axis) => v + projectile.velocity[axis] * delta);
      breakWindowsAlongPath(state, map, projectile.position, next);
      if (!segmentClear(state, map, projectile.position, next)) {
        projectile.velocity[0] = 0; projectile.velocity[2] = 0;
        const vertical = [projectile.position[0], next[1], projectile.position[2]];
        if (segmentClear(state, map, projectile.position, vertical)) projectile.position = vertical;
        else if (projectile.velocity[1] < 0) { projectile.settled = true; projectile.velocity[1] = 0; }
        if (projectile.type === 'molotov') projectile.expires = state.elapsed;
      }
      else { projectile.position = next; }
      if (projectile.position[1] <= 0.15) { projectile.position[1] = 0.15; projectile.settled = true; }
    }
    if (projectile.type === 'molotov' && projectile.settled) projectile.expires = state.elapsed;
    if (state.elapsed < projectile.expires) continue;
    state.projectiles.splice(i, 1);
    const p = projectile.position;
    if (projectile.type === 'grenade') blast(state, map, rules, p, 4, 220, undefined, 1.5);
    if (projectile.type === 'flashbang') {
      for (const guard of state.guards) if (guard.health > 0 && Math.hypot(guard.position[0] - p[0], guard.position[1] - p[2], elevation(guard) + 1.5 - p[1]) < 6 && segmentClear(state, map, p, [guard.position[0], elevation(guard) + 1.5, guard.position[1]], -1, { glass: false })) { guard.stunnedUntil = state.elapsed + 5; guard.suspicion = 0; }
      const eye=playerEye(state),dx = p[0] - eye[0], dz = p[2] - eye[2];
      if (Math.hypot(dx, dz, eye[1] - p[1]) < 5 && segmentClear(state, map, eye, p, -1, { glass: false }) && dx * state.facing[0] + dz * state.facing[1] > 0) state.flashUntil = state.elapsed + 1.5;
      event(state, 'flash', p, { radius: 6 }); alertGuards(state, rules, p, 10, map);
    }
    if (projectile.type === 'molotov') { state.fires.push({ position: [...p], until: state.elapsed + 8, radius: 2 }); event(state, 'fire', p); alertGuards(state, rules, p, 10, map); }
  }
  for (let i = state.devices.length - 1; i >= 0; i--) {
    const device = state.devices[i];
    if (device.type !== 'claymore' || state.elapsed < device.armedAt) continue;
    const triggered = state.guards.some(guard => {
      const dx = guard.position[0] - device.position[0], dz = guard.position[1] - device.position[2];
      return guard.health > 0 && Math.hypot(dx, dz, elevation(guard) + 0.15 - device.position[1]) < 3 && Math.cos(Math.atan2(dz, dx) - device.heading) > 0.5 && segmentClear(state, map, [device.position[0], device.position[1] + 0.85, device.position[2]], [guard.position[0], elevation(guard) + 1, guard.position[1]]);
    });
    if (triggered) { state.devices.splice(i, 1); blast(state, map, rules, device.position, 3, 180, device.heading); }
  }
  state.fires = state.fires.filter(fire => fire.until > state.elapsed);
  for (const fire of state.fires) {
    const burning = (target, base = 0) => Math.hypot(target[0] - fire.position[0], target[1] - fire.position[2], base + 0.15 - fire.position[1]) < fire.radius && segmentClear(state, map, [fire.position[0], fire.position[1] + 0.35, fire.position[2]], [target[0], base + 0.5, target[1]]);
    for (const guard of state.guards) if (burning(guard.position, elevation(guard))) damageGuard(state, guard, delta * 35);
    if (rules.destructibleFurniture !== false) {
      // Fire burns furniture on its own level, through the room, not only what it can see.
      const reaches = box => box && Math.abs(box.center[1] - box.size[1] / 2 - fire.position[1]) < 1.6 && Math.hypot(...box.center.map((v, axis) => axis === 1 ? 0 : Math.max(0, Math.abs(v - fire.position[axis]) - box.size[axis] / 2))) < fire.radius;
      map.props.forEach((_, index) => { if (reaches(propBox(state, map, index))) damageProp(state, map, rules, index, 'fire', delta * durability.raw.fire); });
      (map.decor ?? []).forEach((_, index) => { if (reaches(decorBox(state, map, index))) damageDecor(state, map, rules, index, 'fire', delta * durability.raw.fire); });
    }
    if (rules.friendlyFire && burning(state.player, state.playerY ?? 0)) damagePlayer(state, rules, delta * 25);
  }
}
