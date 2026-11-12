// Drawn-only site dressing as plain triangle data. No Three.js here.
//
//   map.slopes          ramps (same shape as map.stairs); foot support comes from
//                       stairHeight in src/world.js, collision from the earth steps
//                       src/destruction.js builds under them. Drawn here as lawn.
//   map.retainingWalls  { from, to, top: [a, b], bottom: [a, b] } in metres: a
//                       stucco wall with a brick cap; the slabs behind it collide.
//   map.screens         { from, to, bottom, top }: porch screen panels, see-through.
//
// Triangles are { kind, points: [[x, y, z] x3] }, wound so the front face points
// outward. Kinds: lawn, stucco, brick, screen.

export const siteKinds = ['lawn', 'stucco', 'brick', 'screen'];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const triangleNormal = ([a, b, c]) => cross(sub(b, a), sub(c, a));

// Height of a ramp's surface at a plan point (the same rule as stairHeight).
export function rampHeight(ramp, [x, z]) {
  const dx = ramp.to[0] - ramp.from[0], dz = ramp.to[1] - ramp.from[1];
  const t = Math.max(0, Math.min(1, ((x - ramp.from[0]) * dx + (z - ramp.from[1]) * dz) / (dx * dx + dz * dz)));
  return ramp.bottom + t * (ramp.top - ramp.bottom);
}

export function siteFor(map) {
  const out = [];
  function face(kind, polygon, outward) {
    for (let i = 1; i < polygon.length - 1; i++) {
      let points = [polygon[0], polygon[i], polygon[i + 1]];
      const normal = triangleNormal(points);
      if (Math.hypot(...normal) < 1e-9) continue;
      if (dot(normal, outward) < 0) points = [points[0], points[2], points[1]];
      out.push({ kind, points });
    }
  }
  // Lawn: the ramp's top, plus skirts down to the ground on all four sides
  // (hidden where they meet a neighbour, visible at the map edge).
  for (const ramp of map.slopes ?? []) {
    const [cx, cz] = ramp.center, [w, d] = ramp.size;
    const corners = [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]];
    const top = corners.map(c => [c[0], rampHeight(ramp, c), c[1]]);
    face('lawn', top, [0, 1, 0]);
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % 4], ta = top[i], tb = top[(i + 1) % 4];
      if (ta[1] < 0.01 && tb[1] < 0.01) return;
      face('lawn', [[a[0], 0, a[1]], [b[0], 0, b[1]], tb, ta], [b[1] - a[1], 0, -(b[0] - a[0])]);
    });
  }
  // Retaining walls: a 0.2 m stucco wall from the low grade to the high grade,
  // under a 0.3 m brick cap standing 0.1 m proud of the high grade.
  for (const wall of map.retainingWalls ?? []) {
    const [ax, az] = wall.from, [bx, bz] = wall.to, length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-6) continue;
    const ux = (bx - ax) / length, uz = (bz - az) / length, nx = -uz, nz = ux; // n: one side
    const [topA, topB] = wall.top, [lowA, lowB] = wall.bottom;
    const slab = (half, bottomA, bottomB, upA, upB, kind) => {
      const at = (x, z, s, y) => [x + nx * half * s, y, z + nz * half * s];
      const lo = s => [at(ax, az, s, bottomA), at(bx, bz, s, bottomB)], hi = s => [at(ax, az, s, upA), at(bx, bz, s, upB)];
      for (const s of [-1, 1]) {
        const [a0, b0] = lo(s), [a1, b1] = hi(s);
        face(kind, [a0, b0, b1, a1], [nx * s, 0, nz * s]);
      }
      const [a1, b1] = hi(-1), [c1, d1] = hi(1);
      face(kind, [a1, b1, d1, c1], [0, 1, 0]);
      for (const [end, s] of [[0, -1], [1, 1]]) {
        const p = end ? [bx, bz] : [ax, az], y0 = end ? bottomB : bottomA, y1 = end ? upB : upA;
        face(kind, [at(p[0], p[1], -1, y0), at(p[0], p[1], 1, y0), at(p[0], p[1], 1, y1), at(p[0], p[1], -1, y1)], [ux * s, 0, uz * s]);
      }
    };
    slab(0.1, lowA - 0.05, lowB - 0.05, topA, topB, 'stucco');
    slab(0.15, topA, topB, topA + 0.1, topB + 0.1, 'brick');
  }
  // Screens: one panel per run, facing both ways (drawn double-sided).
  for (const screen of map.screens ?? []) {
    const [ax, az] = screen.from, [bx, bz] = screen.to;
    face('screen', [[ax, screen.bottom, az], [bx, screen.bottom, bz], [bx, screen.top, bz], [ax, screen.top, az]], [-(bz - az), 0, bx - ax]);
  }
  return out;
}
