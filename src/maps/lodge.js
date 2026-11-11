import { ceilingsFor, rectangle } from './ceilings.js';
// Fictional, two-story lodge. Every opening is absent from the wall geometry.
const walls = [], windows = [], doors = [], rooms = [];
function wall(center, size, level, extra = {}) { walls.push({ center, size, elevation: level * 3.2, level, ...extra }); }
function partitionX(x, lo, hi, gap, level, locked = false) {
  if (gap - 1 > lo) wall([x, (lo + gap - 1) / 2], [0.3, gap - 1 - lo], level, { destructible: true });
  if (gap + 1 < hi) wall([x, (gap + 1 + hi) / 2], [0.3, hi - gap - 1], level, { destructible: true });
  doors.push({ position: [x, gap], size: [0.3, 2], elevation: level * 3.2, locked });
}
function partitionZ(z, lo, hi, gap, level) {
  wall([(lo + gap - 1) / 2, z], [gap - 1 - lo, 0.3], level, { destructible: true });
  wall([(gap + 1 + hi) / 2, z], [hi - gap - 1, 0.3], level, { destructible: true });
  doors.push({ position: [gap, z], size: [2, 0.3], elevation: level * 3.2 });
}
function facade(axis, fixed, lo, hi, openings, level) {
  let cursor = lo;
  for (const opening of openings) {
    const a = opening.at - opening.width / 2, b = opening.at + opening.width / 2;
    const add = (start, end, base = 0, height = 2.8) => {
      if (end <= start) return;
      wall(axis === 'x' ? [(start + end) / 2, fixed] : [fixed, (start + end) / 2], axis === 'x' ? [end - start, 0.4] : [0.4, end - start], level, { elevation: level * 3.2 + base, height, exterior: true });
    };
    add(cursor, a);
    if (opening.door) doors.push({ position: [opening.at, fixed], size: [opening.width, 0.3], elevation: level * 3.2, locked: level === 0 });
    else {
      add(a, b, 0, 0.8); add(a, b, 2.3, 0.5);
      windows.push({ position: axis === 'x' ? [opening.at, fixed] : [fixed, opening.at], size: axis === 'x' ? [opening.width, 0.08] : [0.08, opening.width], elevation: level * 3.2, sill: 0.8, height: 1.5 });
    }
    cursor = b;
  }
  if (cursor < hi) wall(axis === 'x' ? [(cursor + hi) / 2, fixed] : [fixed, (cursor + hi) / 2], axis === 'x' ? [hi - cursor, 0.4] : [0.4, hi - cursor], level, { exterior: true });
}
for (const level of [0, 1]) {
  facade('x', 12, -14, 14, [{ at: -8, width: 2.4 }, { at: 0, width: 2, door: level === 0 }, { at: 8, width: 2.4 }], level);
  facade('x', -12, -14, 14, [{ at: -6, width: 2.4 }, { at: 7, width: 2.4 }], level);
  facade('z', -14, -12, 12, [{ at: -5, width: 2 }, { at: 6, width: 2.4 }], level);
  facade('z', 14, -12, 12, [{ at: -8, width: 2.4 }, { at: 5, width: 2.4 }], level);
  partitionX(-2, -12, -1.5, -9, level);
  partitionX(-2, 1.5, 12, 4, level);
  partitionX(2, -12, -1.5, -9, level, level === 1);
  partitionX(2, 1.5, 12, 4, level);
  partitionZ(-1.5, -10, -2, -5, level); partitionZ(1.5, -14, -2, -6, level);
  partitionZ(-1.5, 2, 14, 6, level); partitionZ(1.5, 2, 14, 6, level);
  partitionZ(7, -14, -2, -6, level); partitionZ(7, 2, 14, 8, level);
  // Stairwell's east wall ends short of the north landing.
  wall([-10, -4.5], [0.3, 7], level, { destructible: true });
  for (const [name, center, size] of [
    ['CENTRAL HALL', [0, -4], [4, 16]], ['CROSS HALL', [6, 0], [16, 3]],
    ['STAIR HALL', [-12, -4], [4, 8]],
    [level ? 'UPPER STUDY' : 'LIBRARY', [-6, -6], [8, 9]],
    [level ? 'LOCKED ARCHIVE' : 'OFFICE', [8, -6], [12, 9]],
    [level ? 'WEST BEDROOM' : 'DINING ROOM', [-8, 4], [12, 5.5]],
    [level ? 'EAST BEDROOM' : 'LOUNGE', [8, 4], [12, 5.5]],
    [level ? 'WEST SUITE' : 'KITCHEN', [-8, 9.5], [12, 5]],
    [level ? 'EAST SUITE' : 'RECEPTION', [8, 9.5], [12, 5]],
  ]) rooms.push({ name, center, size, level, elevation: level * 3.2 });
}
export const lodge = {
  version: 2, id: 'lodge-01', name: 'Meridian Lodge', stamp: 'MERIDIAN LODGE · TWO STORIES',
  description: 'Two stories with rooms, central and cross hallways, and a west stairwell. The archive is upstairs behind a locked door. Shoot window glass, then E to climb through. Equip the door picking gun for quiet entry. Explosives breach exterior masonry.',
  bounds: { minX: -20, maxX: 20, minZ: -18, maxZ: 18 },
  levels: [{ name: 'Ground floor', elevation: 0 }, { name: 'Upper floor', elevation: 3.2 }],
  ceilings: ceilingsFor([
    {outline:rectangle(-14,-12,14,12),height:2.4,holes:[rectangle(-13.6,-8.4,-10.4,.4)]},
    {outline:rectangle(-14,-12,14,12),elevation:3.2},
  ]),
  spawn: [0, 15],
  entries: { courtyard: { position: [0, 15], yaw: 0, label: 'Front approach · locked entry' }, 'west gallery': { position: [-12, 0.5], yaw: 0, label: 'West stair hall · inside' } },
  objective: { position: [8, -9], elevation: 3.2, radius: 1.5, label: 'Archive' },
  extraction: { position: [0, 15], radius: 1.7 },
  walls, windows, doors, rooms,
  floors: [
    { center: [2, 0], size: [24, 24], elevation: 3.2 },
    { center: [-13.6, 0], size: [0.8, 24], elevation: 3.2 },
    { center: [-11.6, 6], size: [3.2, 12], elevation: 3.2 },
    { center: [-11.6, -10], size: [3.2, 4], elevation: 3.2 },
  ],
  stairs: [{ center: [-12, -4], size: [2.4, 8], from: [-12, 0], to: [-12, -8], bottom: 0, top: 3.2 }],
  props: [
    { kind: 'table', position: [8, -6], size: [3, 1], elevation: 0 },
    { kind: 'table', position: [-6, -6], size: [3, 1], elevation: 3.2 },
    { kind: 'crate', position: [11, 10], size: [1.5, 1.5] },
  ],
  patrols: [
    [[0, 8], [0, -8]], [[6, -9], [12, -9]], [[-8, 4], [-4, 4]],
    [[6, 4], [12, 4]], [[0, -8], [0, 8]], [[-8, 9], [-4, 9]],
    [[-6, -8], [-4, -8]], [[8, 8], [12, 8]],
  ],
  guardElevations: [0, 3.2, 0, 0, 3.2, 3.2, 3.2, 0],
};
