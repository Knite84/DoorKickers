// Drawn-only pitched roof as plain triangle data. No Three.js here.
//
// A map may declare `roof: { eave, pitch, overhang, fascia, wings }`, where each
// wing is a wall-line rectangle [minX, minZ, maxX, maxZ] in metres. Every wing
// becomes a hip roof at the same eave height and pitch; overlapping wings
// intersect the way real hip roofs do, so an L or T plan needs no special case.
//
// The roof never collides and never blocks sight or shots: it is not in
// map.walls, map.props or the mission state (convention 8 in POLISH_PLAN.md).
// The scene hides it in the overhead and tactical views, like ceilings.

export const roofKinds = ['shingle', 'fascia', 'soffit'];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const triangleNormal = ([a, b, c]) => cross(sub(b, a), sub(c, a));

// Wing footprint including the eave overhang, as [minX, minZ, maxX, maxZ].
export function wingOutline(roof, wing) {
  const o = roof.overhang ?? 0;
  return [wing[0] - o, wing[1] - o, wing[2] + o, wing[3] + o];
}

// Ridge height of one wing: half the short side times the pitch, above the eave.
export function ridgeHeight(roof, wing) {
  const [x1, z1, x2, z2] = wingOutline(roof, wing);
  return roof.eave + Math.min(x2 - x1, z2 - z1) / 2 * roof.pitch;
}

// Triangles { kind, wing, points: [[x, y, z] x3], uv: [[u, v] x3] }, each wound so its
// front face points outward (slopes up and out, fascia out, soffit down).
// Shingle UVs are metres: u along the eave, v up the slope from the eave.
export function roofFor(map) {
  const roof = map.roof;
  if (!roof?.wings?.length) return [];
  const out = [], fascia = roof.fascia ?? 0.2, slope = Math.hypot(1, roof.pitch);
  let wingIndex = 0;
  function face(kind, polygon, outward, uv = () => [0, 0]) {
    for (let i = 1; i < polygon.length - 1; i++) {
      let points = [polygon[0], polygon[i], polygon[i + 1]];
      const normal = triangleNormal(points);
      if (Math.hypot(...normal) < 1e-9) continue; // a square wing's hip meets in a point
      if (dot(normal, outward) < 0) points = [points[0], points[2], points[1]];
      out.push({ kind, wing: wingIndex, points, uv: points.map(uv) });
    }
  }
  roof.wings.forEach((wing, index) => {
    wingIndex = index;
    const [x1, z1, x2, z2] = wingOutline(roof, wing), e = roof.eave;
    // Work in (a, b): a runs along the ridge (the long side), b across it.
    const alongX = x2 - x1 >= z2 - z1;
    const [a1, a2, b1, b2] = alongX ? [x1, x2, z1, z2] : [z1, z2, x1, x2];
    const P = (a, y, b) => alongX ? [a, y, b] : [b, y, a];
    const V = (a, y, b) => alongX ? [a, y, b] : [b, y, a];
    const half = (b2 - b1) / 2, mid = (b1 + b2) / 2, top = e + half * roof.pitch;
    const r1 = P(a1 + half, top, mid), r2 = P(a2 - half, top, mid);
    const A = p => alongX ? p[0] : p[2], B = p => alongX ? p[2] : p[0];
    // Long sides (trapezoids) and hipped ends (triangles).
    face('shingle', [P(a1, e, b1), P(a2, e, b1), r2, r1], V(0, 1, -1), p => [A(p), (B(p) - b1) * slope]);
    face('shingle', [P(a1, e, b2), P(a2, e, b2), r2, r1], V(0, 1, 1), p => [A(p), (b2 - B(p)) * slope]);
    face('shingle', [P(a1, e, b1), P(a1, e, b2), r1], V(-1, 1, 0), p => [B(p), (A(p) - a1) * slope]);
    face('shingle', [P(a2, e, b1), P(a2, e, b2), r2], V(1, 1, 0), p => [B(p), (a2 - A(p)) * slope]);
    // Fascia boards round the eave, and a flat soffit underneath. Each wing's
    // soffit sits a hair lower than the last so overlapping wings never z-fight.
    const low = e - fascia - index * 0.002;
    const corners = [[x1, z1], [x2, z1], [x2, z2], [x1, z2]];
    corners.forEach(([xa, za], i) => {
      const [xb, zb] = corners[(i + 1) % 4], outward = [zb - za, 0, -(xb - xa)];
      face('fascia', [[xa, low, za], [xb, low, zb], [xb, e, zb], [xa, e, za]], outward);
    });
    face('soffit', corners.map(([x, z]) => [x, low, z]), [0, -1, 0]);
  });
  return out;
}
