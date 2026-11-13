// Drawn-only wall trim as data: baseboards, door and window casings, and door
// frame linings. No Three.js here, so it can be tested in Node.
//
// Every box hangs on one breakable wall piece (`piece` is its index in the
// array from buildWallPieces) and must disappear with it. Trim never reaches
// map.props, map.walls or the mission state, so it cannot change collision,
// sight lines or the walking grid. Only maps that declare room finishes
// (map.surfaces, today Martelli) get trim.
import { piecesInArea } from './spatial.js';
import { exteriorFaces } from './surface-plan.js';
import { doorCenter, doorSize, windowCenter, windowSize } from './world.js';

export const trimKinds = ['baseboard', 'casing', 'doorFrame', 'return'];
export const trimSize = { baseboardHeight: 0.11, baseboardProud: 0.012, casingWidth: 0.07, casingProud: 0.015, headProud: 0.02, frameLining: 0.03 };

const SKIN_OFFSET = 0.085;                      // drywall skin centre from the wall centre (destruction.js)
const isWallPiece = p => !p.floor && !p.stair && p.wall !== undefined;

// The wall piece containing a world point, or null.
function pieceAt(pieces, x, y, z) {
  for (const p of piecesInArea(pieces, x - 0.05, x + 0.05, z - 0.05, z + 0.05)) {
    if (!isWallPiece(p)) continue;
    if (Math.abs(x - p.center[0]) <= p.size[0] / 2 + 0.01 && Math.abs(y - p.center[1]) <= p.size[1] / 2 + 0.01 && Math.abs(z - p.center[2]) <= p.size[2] / 2 + 0.01) return p;
  }
  return null;
}

function baseboards(map, pieces, out) {
  const floors = (map.levels ?? []).map(level => level.elevation);
  for (const piece of pieces) {
    if (!isWallPiece(piece)) continue;
    const wall = map.walls[piece.wall];
    // Rails (1 m) are guard rails, not room walls. Only a wall that starts at a
    // floor level has a bottom row sitting on the floor.
    if (!wall || wall.height === 1 || !floors.some(e => Math.abs(e - wall.elevation) < 0.01)) continue;
    if (Math.abs(piece.center[1] - piece.size[1] / 2 - wall.elevation) > 0.01) continue;
    const thin = piece.size[0] <= piece.size[2] ? 0 : 2, along = thin === 0 ? 2 : 0;
    let sides;
    if (piece.material === 'drywall') {
      sides = [Math.sign(piece.center[thin] - wall.center[thin === 0 ? 0 : 1]) || 1];
    } else if (piece.material === 'masonry' && piece.blastOnly && wall.exterior) {
      const faces = exteriorFaces(map, piece), outward = faces.outward[thin === 0 ? 0 : 1];
      if (faces.all || !outward) continue;
      sides = [-outward];                         // inside face only
    } else continue;
    const { baseboardHeight: height, baseboardProud: proud } = trimSize;
    for (const side of sides) {
      const center = [...piece.center], size = [...piece.size];
      center[thin] = piece.center[thin] + side * (piece.size[thin] / 2 + proud / 2);
      center[1] = wall.elevation + height / 2;
      size[thin] = proud; size[1] = height;
      out.push({ kind: 'baseboard', center, size, piece: piece.id });
    }
  }
}

// The wall piece a trim box on `side` of an opening hangs on, and that face's
// distance from the wall centre line. Interior walls hang trim on the drywall
// skin; an exterior wall takes trim on its inside face only.
function facePiece(map, pieces, opening, across, side, along, y) {
  const x = across === 0 ? opening.position[0] + side * SKIN_OFFSET : along, z = across === 0 ? along : opening.position[1] + side * SKIN_OFFSET;
  const skin = pieceAt(pieces, x, y, z);
  if (skin?.material === 'drywall') return skin;
  const wall = pieceAt(pieces, across === 0 ? opening.position[0] : along, y, across === 0 ? along : opening.position[1]);
  if (wall?.material !== 'masonry' || !wall.blastOnly) return null;
  const outward = exteriorFaces(map, wall).outward[across === 0 ? 0 : 1];
  return outward === -side ? wall : null;
}

function openings(map, pieces, out) {
  const entries = [...(map.doors ?? []).map(opening => ({ opening, door: true })), ...(map.windows ?? []).map(opening => ({ opening, door: false }))];
  for (const { opening, door } of entries) {
    const horizontal = opening.size[0] > opening.size[1], along = horizontal ? 0 : 2, across = horizontal ? 2 : 0;
    const center = door ? doorCenter(opening) : windowCenter(opening), size = door ? doorSize(opening) : windowSize(opening);
    const half = size[along] / 2, bottom = center[1] - size[1] / 2, top = center[1] + size[1] / 2;
    const { casingWidth: wide, casingProud: proud, headProud, frameLining } = trimSize;
    const make = (kind, a, y, faceAcross, side, sizeAlong, sizeY, thick, hang) => {
      const c = [0, y, 0], s = [0, sizeY, 0];
      c[along] = a; s[along] = sizeAlong; c[across] = faceAcross + side * thick / 2; s[across] = thick;
      out.push({ kind, center: c, size: s, piece: hang.id });
    };
    for (const side of [-1, 1]) {
      // Jambs stand beside the opening; windows also get a head and a sill apron.
      const probes = [[-1, (bottom + top) / 2], [1, (bottom + top) / 2]];
      for (const [end, y] of probes) {
        const a = center[along] + end * (half + wide / 2);
        const hang = facePiece(map, pieces, opening, across, side, a, y);
        if (!hang) continue;
        const face = hang.center[across] + side * hang.size[across] / 2;
        if (door) make('casing', a, bottom + (size[1] + wide) / 2, face, side, wide, size[1] + wide, proud, hang);
        else make('casing', a, (bottom + top) / 2 + 0.01, face, side, wide, size[1] + 0.12, proud, hang);
      }
      // Doors get a head casing once there is a wall header above them.
      const aboveHang = facePiece(map, pieces, opening, across, side, center[along], top + 0.1);
      if (aboveHang) make('casing', center[along], top + wide / 2, aboveHang.center[across] + side * aboveHang.size[across] / 2, side, size[along] + 2 * wide, wide, headProud, aboveHang);
      if (door) continue;
      const belowHang = facePiece(map, pieces, opening, across, side, center[along], bottom - 0.1);
      if (belowHang) make('casing', center[along], bottom - 0.025, belowHang.center[across] + side * belowHang.size[across] / 2, side, size[along] + 2 * wide, 0.05, headProud, belowHang);
    }
    if (!door) continue;
    // A thin lining over each wall end, just outside the clear opening.
    for (const end of [-1, 1]) {
      const a = center[along] + end * (half + frameLining / 2);
      const hang = [-1, 1].map(side => facePiece(map, pieces, opening, across, side, a, bottom + 1)).find(Boolean)
        ?? pieceAt(pieces, across === 0 ? opening.position[0] : a, bottom + 1, across === 0 ? a : opening.position[1]);
      if (!hang) continue;
      const exterior = hang.material === 'masonry', thick = (exterior ? 0.28 : 0.215) + 0.015;
      const c = [0, bottom + size[1] / 2, 0], s = [0, size[1], 0];
      c[along] = a; s[along] = frameLining; c[across] = opening.position[across === 0 ? 0 : 1]; s[across] = thick;
      out.push({ kind: 'doorFrame', center: c, size: s, piece: hang.id });
    }
  }
}

// Plain passages (map.passages) have no casings, so each wall end gets a thin white drywall
// return instead of showing raw studs. One box per row of wall pieces, so each hides with its
// own piece. (The photos' top trim along these openings is left out.)
function passageReturns(map, pieces, out) {
  for (const passage of map.passages ?? []) {
    const horizontal = passage.size[0] > passage.size[1], along = horizontal ? 0 : 2, across = horizontal ? 2 : 0;
    const half = passage.size[horizontal ? 0 : 1] / 2, base = passage.elevation ?? 0, lining = trimSize.frameLining;
    for (const end of [-1, 1]) {
      // The return lies against the wall end, inside the clear opening; the piece it hangs on is just beyond.
      const a = passage.position[along === 0 ? 0 : 1] + end * (half - lining / 2), beyond = passage.position[along === 0 ? 0 : 1] + end * (half + 0.03);
      // Probe the drywall skins on either side first, then the centre line (studs and plates).
      const probe = y => [SKIN_OFFSET, -SKIN_OFFSET, 0].map(offset => { const p = [0, y, 0]; p[along] = beyond; p[across] = passage.position[across === 0 ? 0 : 1] + offset; return pieceAt(pieces, p[0], p[1], p[2]); }).find(Boolean);
      // Walk up the wall end one piece at a time.
      for (let y = base + 0.01; y < base + passage.height - 0.01;) {
        const hit = probe(y + 0.05);
        if (!hit) { y += 0.1; continue; }
        const top = Math.min(hit.center[1] + hit.size[1] / 2, base + passage.height), bottom = Math.max(y, hit.center[1] - hit.size[1] / 2);
        if (top - bottom > 0.02) {
          const c = [0, (top + bottom) / 2, 0], s = [0, top - bottom, 0];
          c[along] = a; s[along] = lining; c[across] = passage.position[across === 0 ? 0 : 1]; s[across] = 0.23;
          out.push({ kind: 'return', center: c, size: s, piece: hit.id });
        }
        y = top + 0.001;
      }
    }
  }
}

// Interior wall ends that stop in open space (a stub, the end of a partition) would
// show the raw studs and plates, so they get the same thin drywall return as passages.
// An end is free when, just beyond it, there is no other wall, door, window or passage.
// Railing walls (height 1, drawn as railings) are skipped.
function freeEndReturns(map, pieces, out) {
  const openingBoxes = [
    ...(map.doors ?? []).map(d => ({ center: doorCenter(d), size: doorSize(d) })),
    ...(map.windows ?? []).map(w => ({ center: windowCenter(w), size: windowSize(w) })),
    // A passage's own returns cover only the ends of its own wall line (`axis`), not a wall meeting it square.
    ...(map.passages ?? []).map(p => ({ center: [p.position[0], (p.elevation ?? 0) + p.height / 2, p.position[1]], size: [p.size[0], p.height, p.size[1]], axis: p.size[0] > p.size[1] ? 'x' : 'z' })),
  ];
  const inBox = (box, p, pad = 0.02) => [0, 1, 2].every(i => Math.abs(p[i] - box.center[i]) <= box.size[i] / 2 + pad);
  map.walls.forEach((wall, index) => {
    if (!wall.destructible || wall.height === 1) return;
    const along = wall.axis === 'x' ? 0 : 2, across = 2 - along, length = wall.size[along === 0 ? 0 : 1];
    const base = wall.elevation ?? 0, height = wall.height ?? 2.8, mid = [wall.center[0], base + height / 2, wall.center[1]];
    const lining = trimSize.frameLining;
    for (const end of [-1, 1]) {
      const endAt = mid[along] + end * length / 2;
      const beyond = [...mid]; beyond[along] = endAt + end * 0.06;
      // Something there at mid height, or near the top or bottom (a header or sill line)?
      // Probe along each drywall skin line (the centre line is hollow between studs) at one
      // height. A row is covered only if both skin lines run into something there: a wall
      // that overshoots a corner, or meets a wall that starts higher, shows its end.
      const lineBlocked = (offset, y) => {
        const p = [...beyond]; p[1] = y; p[across] += offset;
        const piece = pieceAt(pieces, p[0], p[1], p[2]);
        // A railing wall (height 1) is drawn as a railing, so it does not hide a wall end.
        return (piece && piece.wall !== index && map.walls[piece.wall]?.height !== 1) || openingBoxes.some(box => (!box.axis || box.axis === wall.axis) && inBox(box, p));
      };
      // Walk up the end, one box per row of this wall's own pieces.
      const inside = endAt - end * 0.02;
      const probe = y => [SKIN_OFFSET, -SKIN_OFFSET, 0].map(offset => { const p = [...mid]; p[1] = y; p[along] = inside; p[across] += offset; return pieceAt(pieces, p[0], p[1], p[2]); }).find(piece => piece && piece.wall === index);
      for (let y = base + 0.01; y < base + height - 0.01;) {
        const hit = probe(y + 0.05);
        if (!hit) { y += 0.1; continue; }
        const top = Math.min(hit.center[1] + hit.size[1] / 2, base + height), bottom = Math.max(y, hit.center[1] - hit.size[1] / 2);
        const middle = (top + bottom) / 2;
        if (top - bottom > 0.02 && !(lineBlocked(SKIN_OFFSET, middle) && lineBlocked(-SKIN_OFFSET, middle))) {
          const c = [0, (top + bottom) / 2, 0], s = [0, top - bottom, 0];
          c[along] = endAt + end * lining / 2; s[along] = lining; c[across] = mid[across]; s[across] = 0.23;
          out.push({ kind: 'return', center: c, size: s, piece: hit.id, freeEnd: true });
        }
        y = top + 0.001;
      }
    }
  });
}

// A baseboard on a wall that ends inside a door's leaf would poke through it.
// Cut each run back to the door's edge along the run.
function clipToDoors(map, out) {
  const doors = (map.doors ?? []).map(door => ({ center: doorCenter(door), size: doorSize(door) }));
  const result = [];
  for (const box of out) {
    if (box.kind !== 'baseboard') { result.push(box); continue; }
    const along = box.size[0] >= box.size[2] ? 0 : 2, across = 2 - along;
    let lo = box.center[along] - box.size[along] / 2, hi = box.center[along] + box.size[along] / 2;
    for (const door of doors) {
      const overlaps = i => Math.abs(box.center[i] - door.center[i]) < (box.size[i] + door.size[i]) / 2 - 0.002;
      if (!overlaps(across) || !overlaps(1)) continue;
      const a = door.center[along] - door.size[along] / 2, b = door.center[along] + door.size[along] / 2;
      if (b <= lo || a >= hi) continue;
      if (a > lo && b < hi) { if (a - lo >= hi - b) hi = a; else lo = b; } // door in the middle: keep the longer side
      else if (a <= lo && b >= hi) hi = lo;
      else if (a <= lo) lo = b;
      else hi = a;
    }
    if (hi - lo < 0.02) continue;
    const clipped = { ...box, center: [...box.center], size: [...box.size] };
    clipped.center[along] = (lo + hi) / 2; clipped.size[along] = hi - lo;
    result.push(clipped);
  }
  return result;
}

export function trimFor(map, pieces) {
  if (!map.surfaces) return [];
  const out = [];
  baseboards(map, pieces, out);
  openings(map, pieces, out);
  passageReturns(map, pieces, out);
  freeEndReturns(map, pieces, out);
  return clipToDoors(map, out);
}
