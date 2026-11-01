import { doorCenter, doorSize, windowCenter, windowSize } from './world.js';

// Metres, Y up, local +X forward. These joints drive visuals AND shot capsules.
const rest = {
  pelvis: [0, 0.88, 0], chest: [0, 1.18, 0], neck: [0, 1.43, 0], head: [0, 1.65, 0],
  leftShoulder: [0, 1.35, -0.29], leftElbow: [0.03, 1.05, -0.36], leftHand: [0.22, 0.87, -0.34],
  rightShoulder: [0, 1.35, 0.29], rightElbow: [0.03, 1.05, 0.36], rightHand: [0.22, 0.87, 0.34],
  leftHip: [0, 0.87, -0.15], leftKnee: [0.025, 0.48, -0.15], leftFoot: [0.06, 0.12, -0.15],
  rightHip: [0, 0.87, 0.15], rightKnee: [0.025, 0.48, 0.15], rightFoot: [0.06, 0.12, 0.15],
};
export const bodySegments = [
  ['pelvis', 'chest', 0.23, 'stomach'], ['chest', 'neck', 0.2, 'chest'],
  ['head', 'head', 0.2, 'head'],
  ...['left', 'right'].flatMap(side => [
    [`${side}Shoulder`, `${side}Elbow`, 0.095, `${side}Arm`],
    [`${side}Elbow`, `${side}Hand`, 0.08, `${side}Arm`],
    [`${side}Hip`, `${side}Knee`, 0.12, `${side}Leg`],
    [`${side}Knee`, `${side}Foot`, 0.1, `${side}Leg`],
  ]),
];
const separation = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const links = [
  ...bodySegments.filter(([a, b]) => a !== b).map(([a, b]) => [a, b]),
  ['neck', 'head'], ['chest', 'leftShoulder'], ['chest', 'rightShoulder'],
  ['leftShoulder', 'rightShoulder'], ['pelvis', 'leftHip'], ['pelvis', 'rightHip'], ['leftHip', 'rightHip'],
  ['leftShoulder', 'pelvis'], ['rightShoulder', 'pelvis'], ['leftHip', 'chest'], ['rightHip', 'chest'],
].map(([a, b]) => [a, b, separation(rest[a], rest[b])]);
// Limit extreme folding without fixing the body to a canned death animation.
const bendLimits = [
  ['pelvis', 'neck', 0.48, 0.55], ['chest', 'head', 0.4, 0.47],
  ...['left', 'right'].flatMap(side => [[`${side}Hip`, `${side}Foot`, 0.32, 0.76], [`${side}Shoulder`, `${side}Hand`, 0.18, 0.62]]),
];
const constraints = [...links, ...bendLimits];
const radii = Object.fromEntries(Object.keys(rest).map(name => [name, name === 'head' ? 0.2 : ['pelvis', 'chest'].includes(name) ? 0.23 : name === 'neck' ? 0.12 : 0.09]));

function worldPose(guard, local) {
  const c = Math.cos(guard.heading), s = Math.sin(guard.heading);
  return Object.fromEntries(Object.entries(local).map(([name, [x, y, z]]) => [name, [guard.position[0] + x * c - z * s, (guard.elevation ?? 0) + y, guard.position[1] + x * s + z * c]]));
}
export function guardPose(guard) {
  if (guard.ragdoll) return Object.fromEntries(Object.entries(guard.ragdoll.points).map(([name, point]) => [name, point.position]));
  const pose = structuredClone(rest), injuries = guard.injuries ?? {}, phase = guard.stride ?? 0;
  const limp = injuries.leftLeg || injuries.rightLeg;
  const bob = limp ? Math.abs(Math.sin(phase)) * -0.07 : Math.abs(Math.sin(phase)) * 0.018;
  for (const point of Object.values(pose)) point[1] += bob;
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const stride = Math.sin(phase) * sign * (injuries[`${side}Leg`] ? 0.07 : 0.23);
    pose[`${side}Knee`][0] += stride * 0.5;
    pose[`${side}Foot`][0] += stride;
    pose[`${side}Foot`][1] += Math.max(0, stride) * 0.35 - bob;
    if (injuries[`${side}Arm`]) {
      pose[`${side}Elbow`] = [0.05, 1.06 + bob, sign * -0.32];
      pose[`${side}Hand`] = [0.24, 1.13 + bob, sign * -0.12];
      const other = side === 'left' ? 'right' : 'left';
      if (!injuries[`${other}Arm`]) {
        pose[`${other}Elbow`] = [0.24, 1.16 + bob, sign * 0.18];
        pose[`${other}Hand`] = [0.12, 1.22 + bob, sign * -0.29];
      }
    }
  }
  return worldPose(guard, pose);
}

// Exact ray/capsule intersection, including both spherical caps; direction is normalized.
export function rayCapsule(origin, direction, a, b, radius, limit = 80) {
  const ba = b.map((v, i) => v - a[i]), oa = origin.map((v, i) => v - a[i]);
  const dot = (u, v) => u.reduce((sum, n, i) => sum + n * v[i], 0);
  const baba = dot(ba, ba), bard = dot(ba, direction), baoa = dot(ba, oa);
  const closest = baba ? Math.max(0, Math.min(1, baoa / baba)) : 0;
  if (separation(origin, a.map((v, i) => v + ba[i] * closest)) <= radius) return 0;
  let result = Infinity;
  for (const center of [a, b]) {
    const offset = origin.map((v, i) => v - center[i]), projection = dot(offset, direction);
    const discriminant = projection * projection - dot(offset, offset) + radius * radius;
    if (discriminant >= 0) {
      const t = -projection - Math.sqrt(discriminant);
      if (t >= 0) result = Math.min(result, t);
    }
  }
  const aa = baba - bard * bard, bb = baba * dot(oa, direction) - baoa * bard;
  const cc = baba * dot(oa, oa) - baoa * baoa - radius * radius * baba;
  const h = bb * bb - aa * cc;
  if (aa > 1e-10 && h >= 0) {
    const t = (-bb - Math.sqrt(h)) / aa, y = baoa + t * bard;
    if (t >= 0 && y >= 0 && y <= baba) result = Math.min(result, t);
  }
  return result <= limit ? result : null;
}
export function hitGuard(guard, origin, direction, limit = 80) {
  const pose = guardPose(guard);
  let hit = null;
  for (const [a, b, radius, zone] of bodySegments) {
    const distance = rayCapsule(origin, direction, pose[a], pose[b], radius, limit);
    if (distance !== null && (!hit || distance < hit.distance)) hit = { distance, zone, joint: a };
  }
  return hit;
}

export const guardDisabled = guard => guard.health <= 0 || !!guard.incapacitated;
export const guardSpeed = guard => guard.injuries?.leftLeg && guard.injuries?.rightLeg ? 0.25 : guard.injuries?.leftLeg || guard.injuries?.rightLeg ? 0.48 : 1;
export const guardShotInterval = guard => guard.injuries?.leftArm || guard.injuries?.rightArm ? 1.8 : 0.8;

export function reactToHit(guard, hit = {}, dead = false) {
  const zone = hit.zone ?? 'chest';
  guard.injuries ??= {};
  guard.injuries[zone] = (guard.injuries[zone] ?? 0) + 1;
  guard.lastHitZone = zone;
  if (!dead && !['chest', 'stomach'].includes(zone) && !guard.ragdoll) return;
  guard.incapacitated = true; guard.mode = dead ? 'incapacitated' : 'wounded'; guard.suspicion = 0;
  if (!guard.ragdoll) {
    const pose = guardPose(guard);
    guard.ragdoll = {
      age: 0, accumulator: 0, reaction: dead ? 'limp' : zone,
      anchor: [...guard.position], heading: guard.heading, base: guard.elevation ?? 0,
      points: Object.fromEntries(Object.entries(pose).map(([name, position]) => [name, { position: [...position], previous: [...position] }])),
    };
    // A tiny asymmetry breaks the perfectly balanced standing pose. Headshots
    // receive no ballistic launch; gravity folds the unsupported joints in place.
    guard.ragdoll.points.pelvis.previous[0] -= Math.cos(guard.heading) * 0.002;
  }
  if (dead) guard.ragdoll.reaction = 'limp';
  if (zone !== 'head' && hit.direction) {
    const point = guard.ragdoll.points[hit.joint ?? (zone === 'stomach' ? 'pelvis' : 'chest')];
    if (point) point.previous = point.previous.map((v, i) => v - hit.direction[i] * 0.012);
  }
}

function collide(point, radius, boxes, bounds) {
  const p = point.position;
  p[1] = Math.max(radius, p[1]);
  p[0] = Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, p[0]));
  p[2] = Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, p[2]));
  for (const box of boxes) {
    const nearest = p.map((v, i) => Math.max(box.center[i] - box.size[i] / 2, Math.min(box.center[i] + box.size[i] / 2, v)));
    const dist = separation(p, nearest);
    if (dist >= radius) continue;
    if (dist > 1e-8) {
      for (let i = 0; i < 3; i++) p[i] += (p[i] - nearest[i]) / dist * (radius - dist);
    } else {
      const faces = p.map((v, i) => box.size[i] / 2 - Math.abs(v - box.center[i]));
      const axis = faces.indexOf(Math.min(...faces));
      p[axis] = box.center[axis] + (p[axis] >= box.center[axis] ? 1 : -1) * (box.size[axis] / 2 + radius);
    }
  }
  // Contact friction damps sliding without freezing bodies above a newly breached floor.
  if (p[1] <= radius + 0.001 || boxes.some(box => Math.abs(p[1] - radius - box.center[1] - box.size[1] / 2) < 0.003 && Math.abs(p[0] - box.center[0]) < box.size[0] / 2 + radius && Math.abs(p[2] - box.center[2]) < box.size[2] / 2 + radius)) {
    point.previous[0] += (p[0] - point.previous[0]) * 0.35;
    point.previous[2] += (p[2] - point.previous[2]) * 0.35;
  }
}

export function stepBodies(state, map, delta) {
  for (const guard of state.guards) {
    // Also handle deaths caused by existing tools, blasts, and fire.
    if (guard.health <= 0 && !guard.ragdoll) reactToHit(guard, {}, true);
    const body = guard.ragdoll;
    if (!body) continue;
    body.accumulator += Math.min(Math.max(delta, 0), 0.25);
    const points = Object.values(body.points);
    // Broad phase once per body/frame, rather than each constraint iteration.
    const low = [0, 1, 2].map(i => Math.min(...points.map(p => p.position[i])) - 0.65);
    const high = [0, 1, 2].map(i => Math.max(...points.map(p => p.position[i])) + 0.65);
    const near = (center, size) => {
      for (let axis = 0; axis < 3; axis++) if (center[axis] + size[axis] / 2 < low[axis] || center[axis] - size[axis] / 2 > high[axis]) return false;
      return true;
    };
    const boxes = state.wallPieces.filter(p => p.hp > 0 && near(p.center, p.size));
    map.doors.forEach((door, i) => { const center = doorCenter(door), size = doorSize(door); if (!state.doors[i] && near(center, size)) boxes.push({ center, size }); });
    (map.windows ?? []).forEach((w, i) => { const center = windowCenter(w), size = windowSize(w); if (state.windowHealth[i] > 0 && near(center, size)) boxes.push({ center, size }); });
    for (const prop of map.props) { const center = [prop.position[0], (prop.elevation ?? 0) + 0.55, prop.position[1]], size = [prop.size[0], 1.1, prop.size[1]]; if (near(center, size)) boxes.push({ center, size }); }
    const dt = 1 / 120;
    while (body.accumulator + 1e-10 >= dt) {
      body.accumulator -= dt; body.age += dt;
      for (const [name, point] of Object.entries(body.points)) {
        const before = [...point.position];
        point.position = point.position.map((v, i) => v + (v - point.previous[i]) * 0.993 - (i === 1 ? 9.8 * dt * dt : 0));
        point.previous = before;
        // A surviving abdominal casualty actively curls and rolls onto a side.
        // This muscle force ends on death; headshots never use a target pose.
        if (body.reaction === 'stomach' && body.age > 0.25) {
          const [x, y, z] = rest[name], bend = name.includes('Knee') ? 0.48 : name.includes('Foot') ? 0.2 : 0;
          const local = { [name]: [x + bend, 0.48 - z, y - 0.85] };
          const target = worldPose({ position: body.anchor, elevation: body.base, heading: body.heading }, local)[name];
          for (let i = 0; i < 3; i++) point.position[i] += (target[i] - point.position[i]) * 45 * dt * dt;
        }
      }
      for (let iteration = 0; iteration < 8; iteration++) {
        for (const [a, b, min, max = min] of constraints) {
          const p = body.points[a].position, q = body.points[b].position, dist = separation(p, q);
          if (dist < 1e-8) continue;
          const length = Math.max(min, Math.min(max, dist));
          for (let axis = 0; axis < 3; axis++) {
            const correction = (q[axis] - p[axis]) * (dist - length) / dist * 0.5;
            p[axis] += correction; q[axis] -= correction;
          }
        }
        for (const [name, point] of Object.entries(body.points)) collide(point, radii[name], boxes, map.bounds);
      }
    }
    const root = body.points.pelvis.position;
    guard.position = [root[0], root[2]]; guard.elevation = Math.max(0, root[1] - radii.pelvis);
  }
}
