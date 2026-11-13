import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodySegments, guardPose } from '../src/npc-body.js';
import { restJoints, bones, boneFrames, restFrames, carry, guardLook, buildBody, poseBody, mapGuardMix } from '../src/npc-shape.js';

const close = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const looks = Array.from({ length: 12 }, (_, id) => guardLook('martelli', { id, armored: id === 3 }, 4242));

// Distance from a point to the segment between two joints.
function toSegment(p, a, b) {
  const ab = b.map((v, i) => v - a[i]), ap = p.map((v, i) => v - a[i]);
  const len2 = ab.reduce((s, v) => s + v * v, 0), t = len2 ? Math.max(0, Math.min(1, ap.reduce((s, v, i) => s + v * ab[i], 0) / len2)) : 0;
  return Math.hypot(...p.map((v, i) => v - (a[i] + ab[i] * t)));
}
const insideCapsules = (p, pose, tolerance) => bodySegments.some(([a, b, radius]) => toSegment(p, pose[a], pose[b]) <= radius + tolerance);

test('every vertex is weighted to real bones, and the weights add up to one', () => {
  for (const look of looks) {
    const body = buildBody(look);
    for (let v = 0; v < body.positions.length / 3; v++) {
      const weights = body.skinWeight.slice(v * 4, v * 4 + 4), total = weights.reduce((s, w) => s + w, 0);
      assert.ok(Math.abs(total - 1) < 1e-9);
      for (let k = 0; k < 4; k++) if (weights[k] > 0) assert.ok(body.skinIndex[v * 4 + k] >= 0 && body.skinIndex[v * 4 + k] < bones.length);
    }
    assert.equal(body.indices.length % 3, 0);
    assert.ok(body.indices.length / 3 < 4000, `${body.indices.length / 3} triangles`);
  }
});

test('in the rest pose the body does not move, and each bone carries its two joints exactly', () => {
  const body = buildBody(looks[0]);
  assert.ok(close(poseBody(body, restJoints), body.positions, 1e-9));
  const pose = guardPose({ id: 0, position: [3, -2], heading: 0.7, health: 100, stride: 1.3, aimTarget: [8, 1.6, 4] });
  const rest = restFrames(), now = boneFrames(pose);
  bones.forEach(([, from, to], i) => {
    assert.ok(close(carry(restJoints[from], rest[i], now[i]), pose[from]), `${from}`);
    assert.ok(close(carry(restJoints[to], rest[i], now[i]), pose[to]), `${to}`);
  });
});

test('the solid body stays inside the hit capsules while standing, walking and aiming', () => {
  const poses = [
    guardPose({ id: 0, position: [0, 0], heading: 0, health: 100 }),
    guardPose({ id: 0, position: [0, 0], heading: 1.1, health: 100, stride: 0.9 }),
    guardPose({ id: 0, position: [0, 0], heading: -0.4, health: 100, aimTarget: [5, 1.4, 2] }),
  ];
  for (const look of looks) {
    const body = buildBody(look);
    for (const pose of poses) {
      const placed = poseBody(body, pose);
      for (const part of body.parts.filter(p => p.solid)) for (let v = part.start; v < part.start + part.count; v++) {
        const p = placed.slice(v * 3, v * 3 + 3);
        // 4 cm: the top of the shoulder sits in the seam between the chest and arm zones.
        assert.ok(insideCapsules(p, pose, 0.04), `${part.name} vertex outside every capsule`);
      }
    }
  }
});

test('the body fills the capsules: the torso and head reach most of their radius', () => {
  const body = buildBody({ ...looks[0], girth: 1 }), pose = restJoints;
  for (const [zone, a, b, radius] of [['torso', 'pelvis', 'chest', 0.165], ['head', 'head', 'head', 0.125]]) {
    const part = body.parts.find(p => p.name === zone);
    let widest = 0;
    for (let v = part.start; v < part.start + part.count; v++) widest = Math.max(widest, toSegment(body.positions.slice(v * 3, v * 3 + 3), pose[a], pose[b]));
    assert.ok(widest > radius * 0.7, `${zone} reaches ${widest.toFixed(3)} of ${radius}`);
  }
});

test('looks follow the map mix and the seed, and armoured guards wear plates', () => {
  const count = (mapId, style) => Array.from({ length: 400 }, (_, id) => guardLook(mapId, { id }, 7)).filter(l => l.style === style).length;
  assert.ok(Math.abs(count('lodge', 'tactical') / 400 - mapGuardMix.lodge.tactical) < 0.08);
  assert.ok(Math.abs(count('martelli', 'security') / 400 - mapGuardMix.martelli.security) < 0.08);
  assert.deepEqual(guardLook('martelli', { id: 2 }, 99), guardLook('martelli', { id: 2 }, 99));
  assert.notDeepEqual(guardLook('martelli', { id: 2 }, 99), guardLook('martelli', { id: 2 }, 100));
  assert.equal(guardLook('martelli', { id: 5, armored: true }, 1).vest, 'plate');
});

test('every part is wound so its faces point outward (front faces are drawn, back faces culled)', () => {
  const body = buildBody({ ...looks[1], vest: 'carrier', headwear: 'cap' });
  const P = body.positions, at = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  for (const part of body.parts) {
    const centroid = [0, 0, 0];
    for (let v = part.start; v < part.start + part.count; v++) at(v).forEach((x, k) => { centroid[k] += x / part.count; });
    let outward = 0, total = 0;
    for (let t = 0; t < body.indices.length; t += 3) {
      const [a, b, c] = [body.indices[t], body.indices[t + 1], body.indices[t + 2]];
      if (a < part.start || a >= part.start + part.count) continue;
      const A = at(a), B = at(b), C = at(c), ab = B.map((x, k) => x - A[k]), ac = C.map((x, k) => x - A[k]);
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const mid = A.map((x, k) => (x + B[k] + C[k]) / 3 - centroid[k]);
      if (Math.hypot(...n) < 1e-12) continue;
      total++; if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] > 0) outward++;
    }
    assert.ok(total === 0 || outward / total > 0.9, `${part.name}: ${outward}/${total} faces point outward`);
  }
});
