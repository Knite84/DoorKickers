// First-person firearm models as data: lists of boxes and cylinders, plus the
// gloved hands that hold them. No Three.js here, so the shapes can be tested;
// scene.js turns them into meshes.
//
// Coordinates are in metres in the weapon's own frame: +x right, +y up, -z
// forward (the way the barrel points), origin at the rear of the grip. Each part
// is { shape: 'box', position, size, color } or { shape: 'cylinder', position,
// radius, length, color } (a cylinder runs along z). `rotation` is optional
// [x, y, z] in radians. `role` marks parts the scene shows or hides:
// 'suppressor' (only when fitted) and 'hand' (glove and sleeve).
// `muzzle` is where the flash appears with no suppressor fitted.

const metal = 0x1c2123, steel = 0x2d3436, glove = 0x22292b, sleeve = 0x39453a;
const box = (position, size, color, extra = {}) => ({ shape: 'box', position, size, color, ...extra });
const tube = (position, radius, length, color, extra = {}) => ({ shape: 'cylinder', position, radius, length, color, ...extra });

// A gloved hand on the grip and one supporting the front, each with a forearm
// running back to the bottom of the view.
const hands = (grip, support) => [
  box(grip, [0.075, 0.085, 0.09], glove, { role: 'hand' }),
  box([grip[0] + 0.01, grip[1] - 0.06, grip[2] + 0.25], [0.085, 0.085, 0.42], sleeve, { role: 'hand', rotation: [0.28, 0, 0] }),
  box(support, [0.085, 0.07, 0.11], glove, { role: 'hand' }),
  box([support[0] - 0.05, support[1] - 0.09, support[2] + 0.3], [0.085, 0.085, 0.5], sleeve, { role: 'hand', rotation: [0.32, 0.12, 0] }),
];

export const weaponModels = {
  rifle: {
    muzzle: [0, 0.03, -0.78],
    parts: [
      box([0, -0.01, -0.06], [0.06, 0.075, 0.32], metal),
      box([0, 0.045, -0.12], [0.056, 0.06, 0.44], steel),
      tube([0, 0.03, -0.42], 0.034, 0.3, 0x354438),
      tube([0, 0.03, -0.64], 0.011, 0.2, metal),
      tube([0, 0.03, -0.74], 0.02, 0.06, steel),
      box([0, -0.12, -0.1], [0.036, 0.17, 0.065], metal, { rotation: [0.12, 0, 0] }),
      box([0, -0.085, 0.07], [0.042, 0.12, 0.05], metal, { rotation: [-0.3, 0, 0] }),
      box([0, 0.0, 0.3], [0.052, 0.085, 0.24], 0x2a3a30),
      box([0, 0.085, -0.52], [0.012, 0.035, 0.012], metal),
      box([0, 0.085, 0.0], [0.03, 0.025, 0.04], metal),
      tube([0, 0.03, -0.84], 0.027, 0.2, 0x151a1c, { role: 'suppressor' }),
      ...hands([0, -0.095, 0.075], [0, -0.025, -0.42]),
    ],
  },
  pistol: {
    muzzle: [0, 0.03, -0.2],
    parts: [
      box([0, 0.03, -0.07], [0.032, 0.042, 0.22], steel),
      box([0, -0.005, -0.06], [0.034, 0.03, 0.18], metal),
      box([0, -0.07, 0.03], [0.034, 0.12, 0.05], 0x2b3130, { rotation: [-0.2, 0, 0] }),
      box([0, 0.058, -0.15], [0.008, 0.012, 0.01], metal),
      tube([0, 0.03, -0.215], 0.009, 0.04, 0x111517),
      tube([0, 0.03, -0.32], 0.024, 0.2, 0x151a1c, { role: 'suppressor' }),
      ...hands([0, -0.085, 0.04], [0.03, -0.065, 0.02]),
    ],
  },
  shotgun: {
    muzzle: [0, 0.03, -0.9],
    parts: [
      box([0, 0, -0.1], [0.056, 0.085, 0.32], 0x2a2f2e),
      tube([0, 0.03, -0.55], 0.017, 0.7, steel),
      tube([0, -0.012, -0.52], 0.015, 0.55, metal),
      box([0, -0.015, -0.42], [0.058, 0.055, 0.2], 0x8b6746),
      box([0, -0.06, 0.12], [0.04, 0.12, 0.05], 0x8b6746, { rotation: [-0.25, 0, 0] }),
      box([0, -0.01, 0.34], [0.05, 0.1, 0.3], 0x8b6746),
      box([0, 0.058, -0.88], [0.01, 0.014, 0.01], steel),
      tube([0, 0.03, -1.02], 0.027, 0.2, 0x151a1c, { role: 'suppressor' }),
      ...hands([0, -0.085, 0.09], [0, -0.01, -0.42]),
    ],
  },
  sniper: {
    muzzle: [0, 0.035, -1.05],
    parts: [
      box([0, -0.005, -0.1], [0.06, 0.085, 0.4], 0x2b342b),
      tube([0, 0.035, -0.62], 0.014, 0.85, metal),
      tube([0, 0.035, -1.0], 0.02, 0.1, steel),
      box([0, -0.025, -0.45], [0.05, 0.05, 0.4], 0x52614a),
      tube([0, 0.115, -0.15], 0.03, 0.34, 0x151a1c),
      tube([0, 0.115, -0.33], 0.04, 0.05, 0x151a1c),
      tube([0, 0.115, 0.03], 0.036, 0.05, 0x151a1c),
      box([0, 0.075, -0.12], [0.02, 0.04, 0.03], metal),
      box([0, 0.075, -0.3], [0.02, 0.04, 0.03], metal),
      box([0.05, 0.03, -0.02], [0.03, 0.02, 0.02], steel),
      box([0, -0.12, -0.1], [0.036, 0.1, 0.06], metal),
      box([0, -0.07, 0.1], [0.042, 0.13, 0.05], 0x2a3a30, { rotation: [-0.3, 0, 0] }),
      box([0, 0.01, 0.34], [0.058, 0.12, 0.3], 0x52614a),
      tube([0, 0.035, -1.2], 0.03, 0.22, 0x151a1c, { role: 'suppressor' }),
      ...hands([0, -0.095, 0.1], [0, -0.04, -0.46]),
    ],
  },
};

// Length of a fitted suppressor beyond the muzzle, so the flash moves out with it.
export const suppressorLength = { rifle: 0.2, pistol: 0.2, shotgun: 0.2, sniper: 0.22 };
