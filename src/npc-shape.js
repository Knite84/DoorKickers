// Guard bodies as data (POLISH_PLAN step 5.1). No Three.js here, so the shape, the
// skeleton maths and the outfit choice run in Node tests; src/npc-visual.js turns
// them into one skinned mesh per guard.
//
// The simulation's 16 joints (src/npc-body.js) stay the only truth about where a
// guard is. Each bone here spans two of those joints; every frame its transform is
// the one that carries the bone's rest span onto the current span, so walking,
// aiming, wounds and ragdolls all carry over. The body is built to fill the hit
// capsules (bodySegments), so what you see is what you can hit.
import { seededRandom } from './guard-traits.js';

// Rest joints, metres, Y up, +X forward, -Z the guard's left (same as npc-body.js).
export const restJoints = {
  pelvis: [0, 0.88, 0], chest: [0, 1.18, 0], neck: [0, 1.43, 0], head: [0, 1.65, 0],
  leftShoulder: [0, 1.35, -0.29], leftElbow: [0.03, 1.05, -0.36], leftHand: [0.22, 0.87, -0.34],
  rightShoulder: [0, 1.35, 0.29], rightElbow: [0.03, 1.05, 0.36], rightHand: [0.22, 0.87, 0.34],
  leftHip: [0, 0.87, -0.15], leftKnee: [0.025, 0.48, -0.15], leftFoot: [0.06, 0.12, -0.15],
  rightHip: [0, 0.87, 0.15], rightKnee: [0.025, 0.48, 0.15], rightFoot: [0.06, 0.12, 0.15],
};

// Bones: [name, from joint, to joint, twist reference]. The reference fixes how the
// bone turns about its own length: 'hips' and 'shoulders' use the line across the
// body, 'arm' uses the plane the arm bends in.
export const bones = [
  ['pelvis', 'pelvis', 'chest', 'hips'],
  ['chest', 'chest', 'neck', 'shoulders'],
  ['head', 'neck', 'head', 'shoulders'],
  ['leftUpperArm', 'leftShoulder', 'leftElbow', 'arm'], ['leftForearm', 'leftElbow', 'leftHand', 'arm'],
  ['rightUpperArm', 'rightShoulder', 'rightElbow', 'arm'], ['rightForearm', 'rightElbow', 'rightHand', 'arm'],
  ['leftThigh', 'leftHip', 'leftKnee', 'hips'], ['leftShin', 'leftKnee', 'leftFoot', 'hips'],
  ['rightThigh', 'rightHip', 'rightKnee', 'hips'], ['rightShin', 'rightKnee', 'rightFoot', 'hips'],
];
export const boneIndex = Object.fromEntries(bones.map(([name], i) => [name, i]));

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const length = a => Math.hypot(a[0], a[1], a[2]);
const unit = (a, fallback = [1, 0, 0]) => { const l = length(a); return l > 1e-9 ? scale(a, 1 / l) : fallback; };

// One bone's frame from a pose: { origin, x (along the bone), y, z } orthonormal.
function frame(pose, [, from, to, reference], name) {
  const origin = pose[from], x = unit(sub(pose[to], origin), [0, 1, 0]);
  const side = name.startsWith('left') ? 'left' : 'right';
  const across = reference === 'hips' ? sub(pose.leftHip, pose.rightHip) : sub(pose.leftShoulder, pose.rightShoulder);
  let ref = across;
  if (reference === 'arm') {
    // The bend plane of the whole arm; nearly straight arms fall back to the body's line across.
    const upper = sub(pose[`${side}Elbow`], pose[`${side}Shoulder`]), fore = sub(pose[`${side}Hand`], pose[`${side}Elbow`]);
    const bend = cross(upper, fore), strength = length(bend) / Math.max(1e-6, length(upper) * length(fore));
    const blend = Math.min(1, strength / 0.25);
    ref = add(scale(unit(across), 1 - blend), scale(unit(bend, unit(across)), blend * (side === 'left' ? 1 : -1)));
  }
  let y = sub(ref, scale(x, dot(ref, x)));
  if (length(y) < 1e-6) y = sub([0, 0, 1], scale(x, x[2]));   // degenerate: any perpendicular
  y = unit(y);
  return { origin, x, y, z: cross(x, y), length: length(sub(pose[to], origin)) };
}
// Frames for every bone in a pose (an object of joint name -> [x, y, z]).
export const boneFrames = pose => bones.map(bone => frame(pose, bone, bone[0]));
export const restFrames = () => boneFrames(restJoints);
// Where a rest-space point lands when carried by a bone from its rest frame to `now`.
export function carry(point, rest, now) {
  const d = sub(point, rest.origin), local = [dot(d, rest.x), dot(d, rest.y), dot(d, rest.z)];
  // Stretch along the bone so a slightly longer or shorter span still meets both joints.
  const stretch = rest.length > 1e-6 ? now.length / rest.length : 1;
  return add(add(add(now.origin, now.x, local[0] * stretch), now.y, local[1]), now.z, local[2]);
}

// ---- Outfits -------------------------------------------------------------------

// Each map sets its mix of the two looks; a guard's look then comes from the mission
// seed and its number. Maps without a mix get an even one.
export const mapGuardMix = { martelli: { security: 0.65, tactical: 0.35 }, lodge: { security: 0.3, tactical: 0.7 }, courtyard: { security: 0.5, tactical: 0.5 } };
export const outfits = {
  security: {
    tops: [0x1f2a44, 0x1b1c1e, 0x33363a, 0x2f3d33, 0xc9c6bc], bottoms: [0x1b1c1e, 0x6f6247, 0x3a3c40, 0x2a2f3a],
    headwear: { cap: 0.55, none: 0.45 }, shortSleeves: 0.6, vest: 0.35, gloves: 0.15, balaclava: 0,
    accents: [0x1b1c1e, 0x31353b],
  },
  tactical: {
    tops: [0x3e4a3a, 0x6b5a40, 0x1e2022, 0x55573f, 0x464a4e], bottoms: [0x3e4a3a, 0x6b5a40, 0x2b2d2f, 0x55573f],
    headwear: { helmet: 0.7, cap: 0.3 }, shortSleeves: 0, vest: 1, gloves: 0.9, balaclava: 0.65,
    accents: [0x2d3328, 0x4a4433, 0x1c1e1f],
  },
};
export const skinTones = [0xe6c3a1, 0xd8a97f, 0xbf8a5f, 0x9c6a45, 0x7a4f32, 0x5b3a26];
export const boots = [0x1f1b17, 0x3a3027, 0x4f4334];

// The look of one guard: style, colours and gear. Armoured guards always wear a plate carrier.
export function guardLook(mapId, guard, seed = 0) {
  const random = seededRandom((seed * 7919 + (guard.id ?? 0) * 104729 + 17) >>> 0);
  const pick = list => list[Math.floor(random() * list.length) % list.length];
  const chance = p => random() < p;
  const mix = mapGuardMix[mapId] ?? { security: 0.5, tactical: 0.5 };
  const style = random() < mix.tactical / (mix.tactical + mix.security) ? 'tactical' : 'security';
  const kit = outfits[style];
  const headRoll = random(); let headwear = 'none', sum = 0;
  for (const [name, p] of Object.entries(kit.headwear)) { sum += p; if (headRoll < sum) { headwear = name; break; } }
  const armored = !!guard.armored;
  return {
    style, top: pick(kit.tops), bottom: pick(kit.bottoms), skin: pick(skinTones), boots: pick(boots), accent: pick(kit.accents),
    headwear, shortSleeves: chance(kit.shortSleeves), gloves: chance(kit.gloves),
    vest: armored ? 'plate' : chance(kit.vest) ? (style === 'tactical' ? 'carrier' : 'soft') : 'none',
    balaclava: chance(kit.balaclava), girth: 0.94 + random() * 0.08,
  };
}

// ---- The mesh ---------------------------------------------------------------------

// Builds the body in rest space. Returns flat arrays ready for a BufferGeometry:
// positions, colors (0..1 rgb), skinIndex and skinWeight (4 per vertex), indices, and
// `parts` naming vertex ranges ({ name, start, count, solid }) where `solid` parts
// must stay inside the hit capsules and the rest (boots, hands, gear) may stand proud.
export function buildBody(look) {
  const positions = [], colors = [], skinIndex = [], skinWeight = [], indices = [], parts = [];
  const rgb = hex => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const vertex = (p, color, weights) => {
    positions.push(...p); colors.push(...rgb(color));
    const w = weights.slice(0, 4); while (w.length < 4) w.push([0, 0]);
    const total = w.reduce((s, [, x]) => s + x, 0) || 1;
    for (const [bone, weight] of w) { skinIndex.push(bone); skinWeight.push(weight / total); }
    return positions.length / 3 - 1;
  };
  const begin = (name, solid) => ({ name, start: positions.length / 3, solid });
  const end = part => { part.count = positions.length / 3 - part.start; parts.push(part); };
  const g = look.girth ?? 1;

  // A tube along a rest-space segment, elliptical in section: profile(t) -> [ry, rz]
  // half-widths along the frame's y and z, color(t, angle), weights(t). Caps close each end.
  function tube(name, solid, from, to, across, rings, radial, profile, color, weights, caps = [true, true], extend = [0, 0]) {
    const part = begin(name, solid);
    const axis = unit(sub(to, from)), y = unit(sub(across, scale(axis, dot(across, axis)))), z = cross(axis, y);
    const start = add(from, axis, -extend[0]), span = length(sub(to, from)) + extend[0] + extend[1];
    const rows = [];
    for (let r = 0; r <= rings; r++) {
      const t = r / rings, center = add(start, axis, span * t), [ry, rz] = profile(t), row = [];
      for (let k = 0; k < radial; k++) {
        const a = k / radial * Math.PI * 2;
        row.push(vertex(add(add(center, y, Math.cos(a) * ry), z, Math.sin(a) * rz), color(t, a), weights(t)));
      }
      rows.push(row);
    }
    for (let r = 0; r < rings; r++) for (let k = 0; k < radial; k++) {
      const a = rows[r][k], b = rows[r][(k + 1) % radial], c = rows[r + 1][k], d = rows[r + 1][(k + 1) % radial];
      indices.push(a, b, c, b, d, c);   // counter-clockwise seen from outside
    }
    caps.forEach((cap, i) => {
      if (!cap) return;
      const t = i ? 1 : 0, row = rows[i ? rings : 0], center = vertex(add(start, axis, span * t + (i ? 1 : -1) * Math.min(...profile(t)) * 0.5), color(t, 0), weights(t));
      for (let k = 0; k < radial; k++) { const a = row[k], b = row[(k + 1) % radial]; if (i) indices.push(a, b, center); else indices.push(b, a, center); }
    });
    end(part);
  }
  // An ellipsoid around a rest-space centre, axes along x, y, z, one bone or a blend.
  function blob(name, solid, center, [rx, ry, rz], color, weights, bands = 8, slices = 12) {
    const part = begin(name, solid), rows = [];
    for (let i = 0; i <= bands; i++) {
      const v = i / bands * Math.PI, row = [];
      for (let j = 0; j < slices; j++) {
        const u = j / slices * Math.PI * 2, n = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)];
        row.push(vertex([center[0] + n[0] * rx, center[1] + n[1] * ry, center[2] + n[2] * rz], typeof color === 'function' ? color(n) : color, weights));
      }
      rows.push(row);
    }
    for (let i = 0; i < bands; i++) for (let j = 0; j < slices; j++) {
      const a = rows[i][j], b = rows[i][(j + 1) % slices], c = rows[i + 1][j], d = rows[i + 1][(j + 1) % slices];
      indices.push(a, b, c, b, d, c);
    }
    end(part);
  }
  // A box (gear: plates, pouches, a cap brim), centred and sized in rest space.
  function box(name, center, size, color, weights) {
    const part = begin(name, false), [hx, hy, hz] = size.map(v => v / 2), corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push(vertex([center[0] + sx * hx, center[1] + sy * hy, center[2] + sz * hz], color, weights));
    const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    for (const [a, b, c, d] of faces) indices.push(corners[a], corners[b], corners[c], corners[a], corners[c], corners[d]);
    end(part);
  }

  const J = restJoints, B = boneIndex, lerp = (a, b, t) => a + (b - a) * t;
  const between = (a, b, t0, t1) => t => { const s = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))); return [[a, 1 - s], [b, s]]; };
  const top = look.top, bottom = look.bottom, skin = look.skin;

  // Torso: one tube from below the hips to the base of the neck, wider than deep,
  // pelvis bone below the waist blending into the chest bone above it.
  const waist = 0.95, torsoBottom = 0.8, torsoTop = 1.45;
  tube('torso', true, [0, torsoBottom, 0], [0, torsoTop, 0], [1, 0, 0], 10, 14,
    t => {
      const y = lerp(torsoBottom, torsoTop, t);
      const width = y < 0.9 ? 0.15 : y < 1.0 ? lerp(0.15, 0.14, (y - 0.9) / 0.1) : y < 1.3 ? lerp(0.14, 0.17, (y - 1.0) / 0.3) : lerp(0.17, 0.1, (y - 1.3) / 0.15);
      const depth = y < 1.0 ? 0.1 : y < 1.3 ? lerp(0.1, 0.11, (y - 1.0) / 0.3) : lerp(0.11, 0.07, (y - 1.3) / 0.15);
      return [depth * g, width * g];
    },
    t => (lerp(torsoBottom, torsoTop, t) < waist ? bottom : top),
    t => between(B.pelvis, B.chest, 1.06, 1.26)(lerp(torsoBottom, torsoTop, t)));
  // Shoulders: a short tube from the side of the chest out to each shoulder joint, so the
  // arm grows out of the torso. Chest-weighted at the body, arm-weighted at the joint.
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    const joint = J[`${side}Shoulder`];
    tube(`${side}Shoulder`, true, [0, joint[1] - 0.02, sign * 0.1], [joint[0], joint[1], joint[2]], [0, 1, 0], 4, 10,
      t => { const r = lerp(0.062, 0.056, t) * g; return [r, r * 0.6]; }, () => top,
      t => between(B.chest, B[`${side}UpperArm`], 0.5, 1.05)(t), [false, true], [0, 0.02]);
  }
  // Neck and head. A balaclava covers all but an eye band; otherwise plain skin.
  tube('neck', true, [0, 1.4, 0], [0, 1.56, 0], [1, 0, 0], 3, 10, () => [0.055, 0.06],
    () => (look.balaclava ? look.accent : skin), t => between(B.chest, B.head, 0, 1)(t), [false, false]);
  const head = J.head;
  blob('head', true, head, [0.105, 0.12, 0.09], n => {
    if (!look.balaclava) return skin;
    const eyes = n[0] > 0.55 && n[1] > -0.05 && n[1] < 0.3;   // the eye opening faces forward
    return eyes ? skin : look.accent;
  }, [[B.head, 1]], 10, 14);
  if (!look.balaclava) blob('nose', false, [head[0] + 0.1, head[1] - 0.005, 0], [0.025, 0.03, 0.018], skin, [[B.head, 1]], 4, 6);
  for (const sign of [-1, 1]) if (!look.balaclava) blob('ear', false, [head[0], head[1], sign * 0.088], [0.02, 0.03, 0.012], skin, [[B.head, 1]], 4, 6);

  // Arms: sleeve to the elbow (short sleeves) or the wrist; forearm skin or sleeve.
  for (const side of ['left', 'right']) {
    const upper = B[`${side}UpperArm`], fore = B[`${side}Forearm`];
    const s = J[`${side}Shoulder`], e = J[`${side}Elbow`], h = J[`${side}Hand`];
    const forward = [1, 0, 0];
    tube(`${side}UpperArm`, true, s, e, forward, 5, 10, t => { const r = lerp(0.056, 0.045, t) * g; return [r, r]; },
      t => (look.shortSleeves && t > 0.55 ? skin : top), t => (t < 0.8 ? [[upper, 1]] : between(upper, fore, 0.8, 1.2)(t)), [false, false], [0.02, 0.02]);
    tube(`${side}Forearm`, true, e, h, forward, 5, 10, t => { const r = lerp(0.045, 0.034, t) * g; return [r, r]; },
      () => (look.shortSleeves ? skin : top), t => (t < 0.2 ? between(upper, fore, -0.2, 0.2)(t) : [[fore, 1]]), [false, false], [0.02, 0]);
    // Hand (glove or skin), past the wrist joint along the forearm.
    const dir = unit(sub(h, e));
    blob(`${side}Hand`, false, add(h, dir, 0.045), [0.05, 0.05, 0.03], look.gloves ? 0x1d1f1e : skin, [[fore, 1]], 5, 8);
  }
  // Legs: trousers to the ankle, then a boot reaching forward from the foot joint.
  for (const side of ['left', 'right']) {
    const thigh = B[`${side}Thigh`], shin = B[`${side}Shin`];
    const hip = J[`${side}Hip`], knee = J[`${side}Knee`], foot = J[`${side}Foot`];
    tube(`${side}Thigh`, true, hip, knee, [1, 0, 0], 6, 10, t => { const r = lerp(0.082, 0.06, t) * g; return [r, r]; },
      () => bottom, t => (t < 0.8 ? [[thigh, 1]] : between(thigh, shin, 0.8, 1.2)(t)), [false, false], [0.04, 0.02]);
    tube(`${side}Shin`, true, knee, foot, [1, 0, 0], 6, 10, t => { const r = lerp(0.06, 0.045, t) * g; return [r, r]; },
      t => (t > 0.85 ? look.boots : bottom), t => (t < 0.2 ? between(thigh, shin, -0.2, 0.2)(t) : [[shin, 1]]), [false, true], [0.02, 0]);
    blob(`${side}Boot`, false, [foot[0] + 0.06, foot[1] - 0.06, foot[2]], [0.13, 0.055, 0.055], look.boots, [[shin, 1]], 5, 10);
  }

  // Gear.
  if (look.vest !== 'none') {
    const plate = look.vest === 'plate', color = plate ? 0x263b32 : look.vest === 'carrier' ? look.accent : 0x1d1f22;
    const thick = plate ? 0.04 : 0.025, height = plate ? 0.3 : 0.34, width = plate ? 0.27 : 0.3;
    for (const sign of [1, -1]) box(sign > 0 ? 'vestFront' : 'vestBack', [sign * (0.105 + thick / 2) * g, 1.2, 0], [thick, height, width * g], color, [[B.chest, 0.7], [B.pelvis, 0.3]]);
    if (look.vest !== 'soft') for (const z of [-0.08, 0, 0.08]) box('pouch', [(0.105 + thick + 0.02) * g, 1.1, z], [0.04, 0.08, 0.06], look.accent, [[B.chest, 0.5], [B.pelvis, 0.5]]);
  }
  if (look.headwear === 'helmet') {
    blob('helmet', false, [head[0] - 0.005, head[1] + 0.03, 0], [0.125, 0.105, 0.11], look.accent, [[B.head, 1]], 8, 14);
  } else if (look.headwear === 'cap') {
    blob('cap', false, [head[0] - 0.005, head[1] + 0.05, 0], [0.11, 0.07, 0.095], look.accent, [[B.head, 1]], 6, 12);
    box('brim', [head[0] + 0.12, head[1] + 0.045, 0], [0.09, 0.012, 0.13], look.accent, [[B.head, 1]]);
  }
  // A belt at the waist.
  box('belt', [0, waist, 0], [0.21 * g, 0.04, 0.31 * g], 0x1a1714, [[B.pelvis, 1]]);
  return { positions, colors, skinIndex, skinWeight, indices, parts };
}

// Moves rest-space body vertices into a pose on the CPU, the same sum the GPU skinning
// does. Used by tests (and could serve a preview without skinning).
export function poseBody(body, pose) {
  const rest = restFrames(), now = boneFrames(pose), out = new Array(body.positions.length);
  for (let v = 0; v < body.positions.length / 3; v++) {
    const p = body.positions.slice(v * 3, v * 3 + 3), sum = [0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const w = body.skinWeight[v * 4 + k]; if (!w) continue;
      const bone = body.skinIndex[v * 4 + k], moved = carry(p, rest[bone], now[bone]);
      sum[0] += moved[0] * w; sum[1] += moved[1] * w; sum[2] += moved[2] * w;
    }
    out[v * 3] = sum[0]; out[v * 3 + 1] = sum[1]; out[v * 3 + 2] = sum[2];
  }
  return out;
}
