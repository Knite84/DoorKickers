import { buildWallPieces } from './destruction.js';
import { createInventory, weapons } from './kit.js';
import { finishReload } from './weapons.js';
import { segmentClear } from './combat.js';
import { stepEquipment } from './equipment.js';
import { DEFAULT_DOOR_HEALTH } from './doors.js';
import { elevation, bodyHeight, eyeHeight, playerEye, stairHeight, supportHeight, propHeight } from './world.js';
import { stepPlayerCover, leavePlayerCover } from './player-cover.js';
import { darknessSightFactor, roomLights } from './lighting.js';
import { nearbyInteraction, climbWindow } from './window-traversal.js';
import { stepGuards } from './guard-ai.js';
import { stepBodies, guardEye } from './npc-body.js';
// Pure gameplay functions: no Three.js or DOM, so rules can be tested independently.
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function intersectsBox(a, b, box, padding = 0) {
  const min = box.center.map((v, i) => v - box.size[i] / 2 - padding);
  const max = box.center.map((v, i) => v + box.size[i] / 2 + padding);
  let near = 0, far = 1;
  for (let axis = 0; axis < 2; axis++) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-8) {
      if (a[axis] < min[axis] || a[axis] > max[axis]) return false;
    } else {
      const t1 = (min[axis] - a[axis]) / delta;
      const t2 = (max[axis] - a[axis]) / delta;
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
      if (near > far) return false;
    }
  }
  return true;
}
export function obstacles(map, doors, pieces, movement = false, baseY = 0, height = 1.8, windowHealth = []) {
  const overlaps = (bottom, top) => movement ? bottom < baseY + height && top > baseY + 0.12 : bottom <= baseY + 1.5 && top >= baseY + 1.5;
  const walls = pieces ? pieces.filter(p => p.hp > 0 && !(movement && p.stair) && overlaps(p.center[1] - p.size[1] / 2, p.center[1] + p.size[1] / 2)).map(p => ({ center: [p.center[0], p.center[2]], size: [p.size[0], p.size[2]] })) : map.walls.filter(w => overlaps(elevation(w), elevation(w) + (w.height ?? 2.8)));
  return [...walls, ...map.props.filter(p => overlaps(elevation(p), elevation(p) + propHeight(p))).map(p => ({ center: p.position, size: p.size, prop: true })), ...map.doors.filter((d, i) => !doors[i] && overlaps(elevation(d), elevation(d) + 2.8)).map(d => ({ center: d.position, size: d.size })), ...(movement ? (map.windows ?? []).filter((w, i) => windowHealth[i] > 0 && overlaps(elevation(w) + (w.sill??.8), elevation(w) + (w.sill??.8) + (w.height??1.5))).map(w => ({ center: w.position, size: w.size })) : [])];
}
export function lineOfSight(a, b, boxes) {
  return !boxes.some(box => intersectsBox(a, b, box));
}
export function movePlayer(position, delta, map, doors, ghost = false, pieces, options = {}) {
  const next = [...position];
  for (let axis = 0; axis < 2; axis++) {
    const candidate = [...next];
    candidate[axis] += delta[axis];
    const bound = axis === 0 ? ['minX', 'maxX'] : ['minZ', 'maxZ'];
    candidate[axis] = Math.max(map.bounds[bound[0]] + 0.3, Math.min(map.bounds[bound[1]] - 0.3, candidate[axis]));
    const baseY = options.elevation ?? 0, stair = stairHeight(map, candidate);
    const nextY = stair !== null && Math.abs(stair - baseY) < 0.5 ? stair : baseY;
    // The stair ramp owns foot support inside its opening; the rounded player
    // must not catch on the adjacent landing's panel or truss edges.
    const collisionPieces = stair !== null && Math.abs(stair - baseY) < 0.5 ? pieces?.filter(p => !p.floor) : pieces;
    const boxes = ghost ? [] : obstacles(map, doors, collisionPieces, true, nextY, options.height ?? 1.8, options.windows);
    if (!boxes.some(box => {
      if (!intersectsBox(next, candidate, box, 0.28)) return false;
      if (box.prop && intersectsBox(next, next, box, 0.28)) {
        const before = next[axis] - box.center[axis], after = candidate[axis] - box.center[axis];
        if (Math.abs(after) > Math.abs(before) && before * after >= 0) return false;
      }
      return true;
    })) next[axis] = candidate[axis];
  }
  return next;
}
export function canSee(guard, player, rules, boxes, context) {
  if(context) { const eye=playerEye(context.state);player=[eye[0],eye[2]]; }
  const range = rules.sightRange * (rules.weather === 'fog' ? 0.6 : rules.weather === 'rain' ? 0.85 : 1) * (context?.rangeFactor ?? 1) * (context?darknessSightFactor(context.state,context.map,rules):1);
  if (distance(guard.position, player) > range) return false;
  const angle = Math.atan2(player[1] - guard.position[1], player[0] - guard.position[0]);
  const difference = Math.atan2(Math.sin(angle - guard.heading), Math.cos(angle - guard.heading));
  const clear = context ? segmentClear(context.state, context.map, guardEye(guard), playerEye(context.state), -1, { glass: false }) : lineOfSight(guard.position, player, boxes);
  return Math.abs(difference) < Math.PI / 5 && clear;
}
export function createMission(map, rules, loadout) {
  const entry = map.entries?.[rules.entryPoint];
  const inventory = createInventory(loadout);
  const doorMaxHealth = map.doors.map(door => door.health ?? rules.doorDurability ?? DEFAULT_DOOR_HEALTH);
  return {
    timeOfDay: rules.timeOfDay??'day', powerOn: true, destroyedLights: roomLights(map).map(() => false),
    player: [...(entry?.position ?? map.spawn)], playerY: elevation(entry), velocityY: 0, crouched: false, gait: 'walk', spawnYaw: entry?.yaw ?? 0, doors: map.doors.map(() => false), lockedDoors: map.doors.map(d => !!d.locked), windowHealth: (map.windows ?? []).map(() => 1), wallPieces: buildWallPieces(map),
    doorHealth: [...doorMaxHealth], doorMaxHealth,
    inventory, ammo: inventory.magazines[inventory.equipped], reloadUntil: 0, nextShot: 0, shots: 0, kills: 0,
    health: 100, hurtUntil: 0, flashUntil: 0, nextUse: 0, projectiles: [], devices: [], fires: [], events: [], facing: [0, -1], guardReports: [], lastGuardReport: '', guardReportUntil: 0, detainingGuardId: null,
    guards: map.patrols.slice(0, rules.guardCount).map((path, index) => ({ id: index, armored: index < (rules.armoredGuards ?? 0), armorHits: index < (rules.armoredGuards ?? 0) ? 10 : 0, mode: 'patrol', evidenceSeen: [], position: [...path[0]], elevation: map.guardElevations?.[index] ?? 0, patrolElevation: map.guardElevations?.[index] ?? 0, path, waypoint: 1, heading: Math.atan2(path[1][1] - path[0][1], path[1][0] - path[0][0]), suspicion: 0, health: 100, alertUntil: 0, nextShot: 0, stunnedUntil: 0 })),
    status: 'planning', collected: false, elapsed: 0, budget: rules.budget, scanUntil: 0,
  };
}
export function movementGait(state, input) {
  if(state.playerCover&&!state.playerCover.peeking) return 'crouch';
  if (input.creep) return 'creep';
  if (input.crouch || state.crouched) return 'crouch';
  return input.running && weapons[state.inventory.equipped]?.canRun !== false ? 'run' : 'walk';
}
export function toggleCrouch(state, map) {
  if(state.playerCover) leavePlayerCover(state,map);
  if (state.crouched) {
    const boxes = obstacles(map, state.doors, state.wallPieces, true, (state.playerY ?? 0) + 1.1, 0.7, state.windowHealth);
    if (boxes.some(box => intersectsBox(state.player, state.player, box, 0.25))) return 'Not enough clearance to stand.';
  }
  state.crouched = !state.crouched;
  return state.crouched ? 'Crouched. C to stand; hold Ctrl to creep even more quietly.' : 'Standing.';
}
export function jump(state, map) {
  if (state.status !== 'active' || Math.abs(state.velocityY) > 0.001) return false;
  const floor = playerSupport(state, map, state.playerY);
  if (Math.abs(state.playerY - floor) > 0.15) return false;
  if (state.playerCover) leavePlayerCover(state, map);
  state.velocityY = 5.2;
  return true;
}
function playerSupport(state, map, fromY) {
  let floor = supportHeight(state, map, state.player, fromY);
  for (const prop of map.props) {
    const top = elevation(prop) + propHeight(prop);
    if (top <= fromY + 0.12 && top > floor && intersectsBox(state.player, state.player, { center: prop.position, size: prop.size })) floor = top;
  }
  return floor;
}
export function stepMission(state, map, rules, delta, input) {
  if (state.status !== 'active') return;
  state.elapsed += delta;
  finishReload(state);
  stepPlayerCover(state,map,input);
  const gait = movementGait(state, input), slow = gait === 'creep' || gait === 'crouch'; state.gait = gait;
  const speed = rules.playerSpeed * (slow ? rules.creepMultiplier : gait === 'run' ? rules.runMultiplier : 1);
  const length = Math.hypot(input.x, input.z) || 1;
  state.player = movePlayer(state.player, [input.x / length * speed * delta, input.z / length * speed * delta], map, state.doors, rules.ghost, state.wallPieces, { elevation: state.playerY, height: bodyHeight(state), windows: state.windowHealth });
  const stair = stairHeight(map, state.player);
  if (state.velocityY <= 0 && stair !== null && Math.abs(stair - state.playerY) < 0.5) { state.playerY = stair; state.velocityY = 0; }
  else {
    const previousY = state.playerY;
    state.velocityY -= 9.8 * delta;
    let nextY = previousY + state.velocityY * delta;
    if (nextY > previousY && !rules.ghost) {
      const head = previousY + bodyHeight(state), nextHead = nextY + bodyHeight(state);
      for (const piece of state.wallPieces) {
        if (piece.hp <= 0 || !piece.floor) continue;
        const bottom = piece.center[1] - piece.size[1] / 2;
        if (head <= bottom && nextHead > bottom && intersectsBox(state.player, state.player, { center: [piece.center[0], piece.center[2]], size: [piece.size[0], piece.size[2]] }, 0.25)) {
          nextY = Math.min(nextY, bottom - bodyHeight(state)); state.velocityY = 0;
        }
      }
    }
    const floor = playerSupport(state, map, previousY);
    state.playerY = Math.max(floor, nextY);
    if (state.playerY === floor && state.velocityY < 0) state.velocityY = 0;
  }
  if(state.playerCover&&Math.abs(state.playerY-state.playerCover.elevation)>.25) leavePlayerCover(state,map);
  stepGuards(state, map, rules, delta, { canSee, movePlayer });
  stepEquipment(state, map, rules, delta);
  stepBodies(state, map, delta);
  if (state.status === 'active' && state.collected && Math.abs(state.playerY - elevation(map.extraction)) < 0.5 && distance(state.player, map.extraction.position) < map.extraction.radius) state.status = 'complete';
}
export function interact(state, map) {
  if (state.status !== 'active') return '';
  if(state.playerCover) leavePlayerCover(state,map);
  if (!state.collected && Math.abs((state.playerY ?? 0) - elevation(map.objective)) < 0.5 && distance(state.player, map.objective.position) < map.objective.radius) {
    state.collected = true;
    return 'Archive secured. Return to the green extraction zone.';
  }
  const nearby=nearbyInteraction(state,map);
  const doorIndex=nearby?.kind==='door'?nearby.index:-1;
  if (doorIndex !== -1) {
    if (state.doorHealth[doorIndex] <= 0) return 'Door destroyed. The doorway is clear.';
    if (state.lockedDoors?.[doorIndex]) return 'Door locked. Equip the door picking gun for quiet entry, or breach it.';
    // Closing a door over the player would trap their collision circle.
    if (state.doors[doorIndex] && intersectsBox(state.player, state.player, { center: map.doors[doorIndex].position, size: map.doors[doorIndex].size }, 0.3)) return 'Step clear of the doorway to close it.';
    state.doors[doorIndex] = !state.doors[doorIndex];
    return state.doors[doorIndex] ? 'Door opened.' : 'Door closed.';
  }
  if(nearby?.kind==='window')return climbWindow(state,map,nearby.index);
  return 'Move closer to a door, window, or the archive to interact.';
}
