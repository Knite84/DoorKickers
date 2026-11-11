import { ceilingsFor, rectangle } from './ceilings.js';
// Three successive rooms, with a clear inspection corridor along the south side.
export const partitions = {
  version: 1, id: 'partitions-01', name: 'The long house',
  description: 'Three successive interior partitions. Fire east from the West Gallery entry; use the south corridor to inspect both sides. Retrieve the archive and extract.',
  stamp: 'LONG HOUSE',
  bounds: { minX: -14, maxX: 14, minZ: -12, maxZ: 12 },
  spawn: [-11, 7],
  ceilings: ceilingsFor([{outline:rectangle(-10,-9,10,1)}]),
  entries: {
    courtyard: { position: [-11, 7], yaw: 0, label: 'Courtyard approach' },
    'west gallery': { position: [-8, -4.25], yaw: -Math.PI / 2, label: 'West Gallery · face three partitions' },
  },
  extraction: { position: [-11, 7], radius: 1.7 },
  objective: { position: [8, -6], radius: 1.5, label: 'Archive' },
  rooms: [
    { name: 'WEST GALLERY →', center: [-7, -5], size: [5, 8] },
    { name: 'PARTITION 1 → 2', center: [-2, -5], size: [4, 8] },
    { name: 'PARTITION 2 → 3', center: [2, -5], size: [4, 8] },
    { name: 'EAST ARCHIVE', center: [7, -5], size: [5, 8] },
    { name: 'INSPECTION CORRIDOR', center: [0, 0], size: [20, 2] },
  ],
  walls: [
    { center: [0, -9], size: [20, 0.35] },
    { center: [-10, -4], size: [0.35, 10] },
    { center: [10, -4], size: [0.35, 10] },
    { center: [-9, 1], size: [2, 0.35] },
    { center: [2, 1], size: [16, 0.35] },
    ...[-4, 0, 4].map(x => ({ center: [x, -5], size: [0.35, 8], destructible: true })),
  ],
  doors: [{ position: [-7, 1], size: [2, 0.3] }],
  props: [{ kind: 'table', position: [8, -7.5], size: [2, 1] }],
  patrols: [
    [[7, -4.25], [8, -4.25], [8, -2], [6, -2]],
    [[2, -6], [2, -2]], [[-2, -6], [-2, -2]],
    [[-8, 4], [8, 4]], [[6, 7], [9, 7]],
    [[-8, -7], [-6, -7]], [[11, -7], [11, 7]], [[-12, -7], [-12, 4]],
  ],
};
