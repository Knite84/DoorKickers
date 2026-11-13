// Impact effects and marks (POLISH_PLAN step 6.1), as pure functions so they run in Node tests.
//
// Given a shot result from weapons.js (or an explosion), this works out which face
// of what was hit, what it is made of, and which marks to leave: bullet holes on
// the face a bullet entered and the face it left, blood behind a hit guard, and
// scorch around a blast. src/scene-effects.js turns the results into particles
// and decals. Nothing here changes the simulation.
//
// Every tuning number for the look is in `recipes` below.
import { rayBox } from './destruction.js';
import { furnitureClass } from './furniture.js';
import { surfaceAt } from './surface-plan.js';
import { doorCenter, doorSize, windowCenter, windowSize, propBox, decorBox, supportHeight } from './world.js';
import { piecesAlong } from './spatial.js';

// What each effect class throws up when hit.
//   chips  - solid bits:   count, colours, size (m), speed (m/s), life (s)
//   puff   - soft cloud:   count, colour, size (m), life (s), rise (m/s)
//   sparks - bright streaks: count, life (s)
//   mark   - decal cell in the atlas (see `markCells`) and size (m), or null
export const recipes = {
  drywall: { chips: { count: 5, colors: [0xe8e3d4, 0xd9d2bd], size: 0.022, speed: 2.2, life: 1.4 }, puff: { count: 3, color: 0xe9e4d8, size: 0.28, life: 0.9, rise: 0.15 }, mark: { cell: 'drywall', size: 0.06 } },
  wood: { chips: { count: 6, colors: [0xa77a4c, 0x7d5636, 0xc89a68], size: 0.03, speed: 2.6, life: 1.6, splinter: true }, puff: { count: 1, color: 0xb59a7a, size: 0.16, life: 0.6, rise: 0.05 }, mark: { cell: 'wood', size: 0.05 } },
  masonry: { chips: { count: 5, colors: [0x9a958a, 0x7e7a71, 0xb3ada0], size: 0.025, speed: 2.4, life: 1.4 }, puff: { count: 3, color: 0xa29d92, size: 0.3, life: 1.1, rise: 0.12 }, mark: { cell: 'masonry', size: 0.07 } },
  metal: { chips: { count: 2, colors: [0x6d7377], size: 0.015, speed: 3, life: 0.8 }, sparks: { count: 10, life: 0.25 }, mark: { cell: 'metal', size: 0.04 } },
  ceramic: { chips: { count: 6, colors: [0xf2f0ea, 0xdedbd2], size: 0.025, speed: 2.8, life: 1.4 }, puff: { count: 1, color: 0xf0eee8, size: 0.14, life: 0.5, rise: 0.05 }, mark: { cell: 'chip', size: 0.06 } },
  fabric: { chips: { count: 2, colors: [0xd8d2c4], size: 0.02, speed: 1.2, life: 1.2 }, puff: { count: 4, color: 0xe2ddd2, size: 0.2, life: 1.3, rise: 0.08 }, mark: { cell: 'fabric', size: 0.05 } },
  glass: { chips: { count: 8, colors: [0xbfe3ea, 0xe5f5f7], size: 0.02, speed: 2.4, life: 2.2, flat: true }, sparks: { count: 4, life: 0.15 }, mark: null },
  dirt: { chips: { count: 6, colors: [0x5b4b36, 0x4d5a3c], size: 0.025, speed: 2.4, life: 1.2 }, puff: { count: 3, color: 0x8a7a60, size: 0.32, life: 1, rise: 0.05 }, mark: null },
  flesh: { puff: { count: 4, color: 0x5e0f0c, size: 0.16, life: 0.55, rise: -0.2 }, chips: { count: 3, colors: [0x6b1410, 0x4a0c09], size: 0.012, speed: 1.6, life: 0.8 }, mark: null },
};
// Blood behind a hit guard, and on the floor under them.
export const blood = { reach: 1.8, size: [0.18, 0.4], floorSize: [0.15, 0.32], floorChance: 0.6 };
// Scorch around a blast: rays in this many directions find the nearest walls.
export const scorch = { rays: 10, wallSize: 0.9, floorSize: 1.6 };
// Atlas layout for the decal texture: 4 columns by 2 rows.
export const markCells = ['drywall', 'wood', 'masonry', 'metal', 'fabric', 'blood', 'scorch', 'chip'];
// Decals sitting closer than this to the next layer are inside the wall cavity and never seen.
const cavity = 0.2;

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b, s = 1) => a.map((v, i) => v + b[i] * s);
const unit = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };

// Where a ray enters and leaves an axis-aligned box: { entry, exit } each as
// { point, normal, distance } (normals point out of the box), or null on a miss.
export function boxFaces(origin, direction, center, size) {
  let near = -Infinity, far = Infinity, nearAxis = 0, farAxis = 0, nearSign = 1, farSign = 1;
  for (let axis = 0; axis < 3; axis++) {
    const min = center[axis] - size[axis] / 2, max = center[axis] + size[axis] / 2;
    if (Math.abs(direction[axis]) < 1e-9) { if (origin[axis] < min || origin[axis] > max) return null; continue; }
    const a = (min - origin[axis]) / direction[axis], b = (max - origin[axis]) / direction[axis];
    const enter = Math.min(a, b), leave = Math.max(a, b);
    if (enter > near) { near = enter; nearAxis = axis; nearSign = direction[axis] > 0 ? -1 : 1; }
    if (leave < far) { far = leave; farAxis = axis; farSign = direction[axis] > 0 ? 1 : -1; }
  }
  if (near > far || far < 0) return null;
  const normal = (axis, sign) => [0, 1, 2].map(i => (i === axis ? sign : 0));
  return {
    entry: { point: add(origin, direction, Math.max(near, 0)), normal: normal(nearAxis, nearSign), distance: Math.max(near, 0) },
    exit: { point: add(origin, direction, far), normal: normal(farAxis, farSign), distance: far },
  };
}

const floorFinish = { carpet: 'fabric', bamboo: 'wood', woodTile: 'wood', plankTile: 'wood', deckBoards: 'wood', vinyl: 'wood', greyTile: 'ceramic', stoneTile: 'ceramic', concrete: 'masonry', grass: 'dirt' };
const pieceClass = { drywall: 'drywall', ceiling: 'drywall', timber: 'wood', particleboard: 'wood', truss: 'wood', deck: 'wood', trunk: 'wood', masonry: 'masonry', concrete: 'masonry', earth: 'dirt', post: 'metal' };
const propKindClass = { fridge: 'metal', laundryMachine: 'metal', furnace: 'metal', waterHeater: 'metal', fireplace: 'masonry', barCounter: 'masonry', arch: 'masonry', island: 'masonry', cabinets: 'wood', wallTV: 'glass', mirror: 'glass', ceilingFan: 'wood' };
const furnitureClassEffect = { soft: 'fabric', wood: 'wood', heavy: 'metal', fixture: 'ceramic', glass: 'glass', unbreakable: 'wood' };

// The effect class for something a shot hit.
export function effectClass(map, hit) {
  switch (hit.kind) {
    case 'guard': return 'flesh';
    case 'glass': case 'light': return 'glass';
    case 'door': return 'wood';
    case 'ground': return 'dirt';
    case 'prop': case 'decor': {
      const prop = (hit.kind === 'prop' ? map.props : map.decor ?? [])[hit.index];
      if (!prop) return 'wood';
      return propKindClass[prop.kind] ?? furnitureClassEffect[furnitureClass(prop)] ?? 'wood';
    }
    case 'wall': {
      if (hit.pieceObject?.floor && hit.position && map.surfaces) {
        const level = Math.max(0, Math.round((hit.position[1] - 0.05) / 3.2));
        const finish = surfaceAt(map, hit.position[0], hit.position[2], level);
        if (finish && floorFinish[finish.kind] && hit.normal?.[1] > 0.5) return floorFinish[finish.kind];
      }
      return pieceClass[hit.material] ?? 'masonry';
    }
    default: return 'masonry';
  }
}

// The box an impact hit, and who owns the mark: { center, size, owner } or null.
// Owners: { kind: 'piece', index } follows that structure piece's visibility,
// 'door' and 'prop' / 'decor' follow theirs, 'world' is always shown.
function struck(state, map, impact) {
  if (impact.kind === 'wall') {
    const piece = state.wallPieces[impact.piece];
    return piece ? { center: piece.center, size: piece.size, owner: { kind: 'piece', index: impact.piece }, piece } : null;
  }
  if (impact.kind === 'door') { const door = map.doors[impact.index]; return door ? { center: doorCenter(door), size: doorSize(door), owner: { kind: 'door', index: impact.index } } : null; }
  if (impact.kind === 'glass') { const window = map.windows?.[impact.index]; return window ? { center: windowCenter(window), size: windowSize(window), owner: { kind: 'window', index: impact.index } } : null; }
  if (impact.kind === 'prop' || impact.kind === 'decor') {
    const box = impact.kind === 'prop' ? propBox(null, map, impact.index) : decorBox(null, map, impact.index);
    return box ? { ...box, owner: { kind: impact.kind, index: impact.index } } : null;
  }
  if (impact.kind === 'ground') return { center: [impact.position[0], -0.5, impact.position[2]], size: [2, 1, 2], owner: { kind: 'world' } };
  return null;
}

// Everything one pellet leaves behind. Returns { bursts, marks } where a burst is
// { effect, point, normal } (particles to spawn) and a mark is
// { cell, point, normal, size, owner, exit }.
export function shotMarks(state, map, pellet) {
  const bursts = [], marks = [];
  const hits = [...(pellet.impacts ?? []), ...(pellet.softHits ?? [])].sort((a, b) => a.distance - b.distance);
  if (!hits.length) return { bursts, marks };
  const direction = unit(sub(hits[0].position, pellet.origin));
  const faces = hits.map(hit => {
    const box = struck(state, map, hit);
    const sides = box && boxFaces(pellet.origin, direction, box.center, box.size);
    return { hit, box, sides };
  });
  faces.forEach(({ hit, box, sides }, i) => {
    const entry = sides?.entry ?? { point: hit.position, normal: direction.map(v => -v) };
    const cls = effectClass(map, { ...hit, pieceObject: box?.piece, normal: entry.normal });
    bursts.push({ effect: cls, point: entry.point, normal: entry.normal });
    if (cls === 'flesh') { marks.push(...bloodMarks(state, map, hit.position, direction, faces.slice(i + 1))); return; }
    const recipe = recipes[cls];
    if (!recipe.mark || !box || !sides) return;
    const previous = faces[i - 1]?.sides?.exit, next = faces[i + 1]?.sides?.entry;
    if (!previous || entry.distance - previous.distance > cavity) marks.push({ cell: recipe.mark.cell, point: entry.point, normal: entry.normal, size: recipe.mark.size, owner: box.owner, exit: false });
    // A hole on the far side when the bullet carried on through this layer.
    const through = i < faces.length - 1 || pellet.stopped === false || hit.soft;
    if (through && (!next || next.distance - sides.exit.distance > cavity)) {
      marks.push({ cell: recipe.mark.cell, point: sides.exit.point, normal: sides.exit.normal, size: recipe.mark.size * 1.3, owner: box.owner, exit: true });
      if (cls === 'drywall' || cls === 'wood' || cls === 'masonry') bursts.push({ effect: cls, point: sides.exit.point, normal: sides.exit.normal, small: true });
    }
  });
  return { bursts, marks };
}

// Blood: a spray mark on the first surface behind the guard within reach, and
// sometimes a smaller one on the floor below the hit.
export function bloodMarks(state, map, point, direction, after = []) {
  const marks = [], end = add(point, direction, blood.reach);
  // A later layer the same bullet reached is the surface behind.
  let best = null;
  for (const { hit, box, sides } of after) {
    if (hit.kind === 'guard' || !sides) continue;
    if (sides.entry.distance - (after[0]?.sides?.entry?.distance ?? 0) > blood.reach) break;
    best = { point: sides.entry.point, normal: sides.entry.normal, owner: box.owner }; break;
  }
  if (!best && state.wallPieces) {
    let nearest = Infinity;
    for (const piece of piecesAlong(state.wallPieces, point, end)) {
      if (piece.hp <= 0 || piece.open) continue;
      const d = rayBox(point, direction, piece.center, piece.size, blood.reach);
      if (d === null || d >= nearest || d < 0.02) continue;
      const sides = boxFaces(point, direction, piece.center, piece.size);
      if (sides) { nearest = d; best = { point: sides.entry.point, normal: sides.entry.normal, owner: { kind: 'piece', index: piece.id } }; }
    }
  }
  const pick = (seed, [lo, hi]) => lo + (hi - lo) * fraction(seed);
  if (best) marks.push({ cell: 'blood', ...best, size: pick(point[0] * 7.1 + point[2], blood.size), exit: false });
  if (state.wallPieces && fraction(point[0] * 3.3 + point[1] * 5.7 + point[2]) < blood.floorChance) {
    const at = add(point, [direction[0], 0, direction[2]], 0.35);
    const floor = supportHeight(state, map, [at[0], at[2]], point[1]);
    if (point[1] - floor < 2) marks.push({ cell: 'blood', point: [at[0], floor, at[2]], normal: [0, 1, 0], size: pick(point[2] * 9.7, blood.floorSize), owner: { kind: 'world', level: Math.round(floor / 3.2) }, exit: false });
  }
  return marks;
}

// Scorch marks around a blast: the floor beneath and the nearest wall faces.
export function blastMarks(state, map, center, radius) {
  const marks = [];
  const floor = supportHeight(state, map, [center[0], center[2]], center[1] + 0.2);
  if (center[1] - floor < radius) marks.push({ cell: 'scorch', point: [center[0], floor, center[2]], normal: [0, 1, 0], size: scorch.floorSize * Math.min(1.5, radius / 3), owner: { kind: 'world', level: Math.round(floor / 3.2) }, exit: false });
  const reach = Math.min(radius, 3), seen = new Set();
  for (let i = 0; i < scorch.rays; i++) {
    const angle = i / scorch.rays * Math.PI * 2, direction = [Math.cos(angle), 0, Math.sin(angle)];
    const end = add(center, direction, reach);
    let nearest = null;
    for (const piece of piecesAlong(state.wallPieces, center, end)) {
      if (piece.hp <= 0 || piece.floor || piece.open) continue;
      const sides = boxFaces(center, direction, piece.center, piece.size);
      if (!sides || sides.entry.distance > reach || (nearest && sides.entry.distance >= nearest.distance)) continue;
      nearest = { ...sides.entry, piece };
    }
    if (nearest && !seen.has(nearest.piece.id)) {
      seen.add(nearest.piece.id);
      marks.push({ cell: 'scorch', point: nearest.point, normal: nearest.normal, size: scorch.wallSize * (1 - nearest.distance / reach * 0.5), owner: { kind: 'piece', index: nearest.piece.id }, exit: false });
    }
  }
  return marks;
}

// What a breaking piece of furniture throws up.
export function breakEffect(map, event) {
  const prop = map.props?.[event.index];
  if (event.kind === 'decor') { const decor = map.decor?.[event.index]; return decor ? propKindClass[decor.kind] ?? furnitureClassEffect[furnitureClass(decor)] ?? 'wood' : 'wood'; }
  if (!prop) return 'wood';
  return propKindClass[prop.kind] ?? furnitureClassEffect[furnitureClass(prop)] ?? 'wood';
}

// A repeatable 0..1 value from a number, so marks vary without Math.random in tests.
export function fraction(seed) { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
