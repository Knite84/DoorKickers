// Metres, Y-up: gameplay coordinates are [x, z].
// Geometry and missions are data, independent of the rendering assets.
export const courtyard = {
  version: 1,
  id: 'courtyard-01',
  name: 'The quiet house',
  bounds: { minX: -14, maxX: 14, minZ: -12, maxZ: 12 },
  spawn: [-10, 8],
  entries: { courtyard: { position: [-10, 8], yaw: -0.55 }, 'west gallery': { position: [-3, -6], yaw: -Math.PI / 2 } },
  extraction: { position: [-10, 8], radius: 1.7 },
  objective: { position: [7, -5], radius: 1.5, label: 'Archive' },
  rooms: [
    { name: 'WEST GALLERY', center: [-5, -4], size: [6, 10] },
    { name: 'ARCHIVE', center: [5, -4], size: [10, 10] },
    { name: 'COURTYARD', center: [0, 5], size: [20, 6] },
  ],
  walls: [
    { center: [0, -9], size: [20, 0.35] },
    { center: [-10, -4], size: [0.35, 10] },
    { center: [10, -5.5], size: [0.35, 7] },
    { center: [10, 0.25], size: [0.35, 1.5] },
    { center: [-6.5, 1], size: [7, 0.35] },
    { center: [4.5, 1], size: [11, 0.35] },
    { center: [-1, -6], size: [0.35, 6], destructible: true },
    { center: [-1, 0], size: [0.35, 2], destructible: true },
  ],
  doors: [
    { position: [-2, 1], size: [2, 0.3] },
    { position: [-1, -2], size: [0.3, 2] },
    { position: [10, -1], size: [0.3, 2] },
  ],
  props: [
    { kind: 'table', position: [6, -6.5], size: [4, 1.2] },
    { kind: 'planter', position: [3, 5], size: [3, 1.2] },
    { kind: 'planter', position: [-5, 5], size: [3, 1.2] },
    { kind: 'crate', position: [-6, -6], size: [1.5, 1.5] },
  ],
  patrols: [
    [[2, -5], [7, -5], [7, -2], [2, -2]],
    [[-8, 3], [7, 3], [7, 8], [-8, 8]],
    [[-8, -7], [-3, -7], [-3, -2], [-8, -2]],
    [[12, -7], [12, 6]],
    [[-7, 10], [8, 10]],
    [[2, -8], [8, -8]],
    [[-12, -6], [-12, 5]],
    [[3, -3], [8, -3]],
  ],
};
