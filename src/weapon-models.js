// First-person firearm models as data: lists of boxes and cylinders, plus the
// gloved hands that hold them. No Three.js here, so the shapes can be tested;
// scene.js turns them into meshes.
//
// Coordinates are in metres in the weapon's own frame: +x right, +y up, -z
// forward (the way the barrel points), origin at the rear of the grip. Each part
// is { shape: 'box', position, size, color } or { shape: 'cylinder', position,
// radius, length, color } (a cylinder runs along z). `rotation` is optional
// [x, y, z] in radians. `role` marks parts the scene shows or hides:
// 'suppressor' (only when fitted) and 'hand' (glove and sleeve). `moves` marks
// parts that step 5.3 animates: 'magazine' (drops and returns on reload),
// 'bolt' and 'pump' (cycle after a shot), 'support' (the front hand, which
// follows the magazine or pump).
// `muzzle` is where the flash appears with no suppressor fitted. `sight` is the
// point that sits on the crosshair when aiming down the sights. `port` is where
// spent casings leave the gun, and `casing` their [radius, length, colour].

import { defaultPistol } from './kit.js';

const metal = 0x1c2123, steel = 0x2d3436, glove = 0x22292b, sleeve = 0x39453a;
const box = (position, size, color, extra = {}) => ({ shape: 'box', position, size, color, ...extra });
const tube = (position, radius, length, color, extra = {}) => ({ shape: 'cylinder', position, radius, length, color, ...extra });

// A gloved hand on the grip and one supporting the front, each with a forearm
// running back to the bottom of the view.
const hands = (grip, support) => [
  box(grip, [0.075, 0.085, 0.09], glove, { role: 'hand' }),
  box([grip[0] + 0.01, grip[1] - 0.06, grip[2] + 0.25], [0.085, 0.085, 0.42], sleeve, { role: 'hand', rotation: [0.28, 0, 0] }),
  box(support, [0.085, 0.07, 0.11], glove, { role: 'hand', moves: 'support' }),
  box([support[0] - 0.05, support[1] - 0.09, support[2] + 0.3], [0.085, 0.085, 0.5], sleeve, { role: 'hand', moves: 'support', rotation: [0.32, 0.12, 0] }),
];
const brass = 0xb58b3c;


// Pistols (owner, 2026-11-13; POLISH_PLAN step 5.4). One builder, fed each pistol's
// published size, so the five read differently at a glance: length and barrel, slide
// height and width, grip angle and height, colours and a few telling details. No
// markings or logos. Keys are 'pistol:<model>' (kit.js pistolModels).
const pistolSpecs = {
  // Boxy slide with square edges, black polymer frame, rail, U-notch rear sight.
  glock19: { length: 0.185, barrel: 0.102, height: 0.128, slide: [0.0255, 0.03], frame: 0.028, grip: [0.032, 0.048, 0.2], slideColor: 0x2b2f31, frameColor: 0x1d2123, rail: true },
  glock17: { length: 0.202, barrel: 0.114, height: 0.139, slide: [0.0255, 0.03], frame: 0.028, grip: [0.032, 0.049, 0.2], slideColor: 0x2b2f31, frameColor: 0x1d2123, rail: true },
  // Coyote slide and frame, optic plate, front serrations, thumb safety.
  m17: { length: 0.203, barrel: 0.119, height: 0.14, slide: [0.0254, 0.032], frame: 0.029, grip: [0.033, 0.05, 0.17], slideColor: 0x8c7b5d, frameColor: 0x75664b, rail: true, optic: true, frontSerrations: true, safety: true },
  // 2011: thin steel slide tapered at the nose, bull barrel, hammer, beavertail, flared magwell.
  staccato: { length: 0.216, barrel: 0.112, height: 0.14, slide: [0.023, 0.029], frame: 0.027, grip: [0.034, 0.052, 0.17], slideColor: 0x232729, frameColor: 0x3b4043, gripColor: 0x1a1d1f, rail: true, taper: true, hammer: true, beavertail: true, magwell: true, frontSerrations: true, bull: true },
  // Large .45: tall slide, threaded barrel standing proud, hooked trigger guard, decocker.
  mk23: { length: 0.245, barrel: 0.149, height: 0.15, slide: [0.029, 0.036], frame: 0.033, grip: [0.036, 0.058, 0.2], slideColor: 0x1e2223, frameColor: 0x17191a, rail: true, grooves: true, threaded: true, taper: true, hook: true, decocker: true, casing: [0.006, 0.023], suppressor: [0.02, 0.22] },
};
const bore = 0.03;
function pistolModel(spec) {
  const [slideW, slideH] = spec.slide, [gripW, gripLen, angle] = spec.grip;
  const rear = 0.045, proud = spec.threaded ? 0.014 : 0;
  const muzzleZ = rear - spec.length, slideFront = muzzleZ + proud;
  const slideCy = bore + 0.004, slideTop = slideCy + slideH / 2, slideBottom = slideCy - slideH / 2;
  const frameH = 0.02, frameCy = slideBottom - frameH / 2, frameBottom = slideBottom - frameH;
  const slideLen = rear - slideFront, gripColor = spec.gripColor ?? spec.frameColor, dark = 0x0e1112;
  // Grip hangs from the frame behind the trigger guard and rakes back by `angle`.
  const gripH = Math.max(0.07, spec.height - (slideTop - frameBottom) - 0.012);
  const gripTop = [0, frameBottom, rear - gripLen / 2 - 0.004];
  const along = d => [gripTop[0], gripTop[1] - d * Math.cos(angle), gripTop[2] + d * Math.sin(angle)];
  const gripCenter = along(gripH / 2), rake = [-angle, 0, 0];
  const guardFront = gripTop[2] - gripLen / 2 - 0.048, guardRear = gripTop[2] - gripLen / 2;
  const guardBottom = frameBottom - 0.026;
  const sightZ = slideFront + 0.012, rearSightZ = rear - 0.012, postH = 0.01;
  const parts = [];
  // Slide: one block, or a full-width rear and a slimmer, lower nose.
  if (spec.taper) {
    const nose = slideLen * 0.36;
    parts.push(box([0, slideCy, rear - (slideLen - nose) / 2], [slideW, slideH, slideLen - nose], spec.slideColor));
    parts.push(box([0, slideCy - slideH * 0.04, slideFront + nose / 2], [slideW * 0.86, slideH * 0.92, nose], spec.slideColor));
  } else parts.push(box([0, slideCy, rear - slideLen / 2], [slideW, slideH, slideLen], spec.slideColor));
  // Grip serrations at the back of the slide (and the front on some).
  for (let i = 0; i < 5; i++) for (const side of [-1, 1]) {
    parts.push(box([side * (slideW / 2 + 0.0004), slideCy, rear - 0.008 - i * 0.005], [0.001, slideH * 0.72, 0.0022], dark));
    if (spec.frontSerrations) parts.push(box([side * (slideW / 2 + 0.0004), slideCy, slideFront + 0.05 + i * 0.005], [0.001, slideH * 0.6, 0.0022], dark));
  }
  // Ejection port on the right, over the chamber.
  const chamber = muzzleZ + spec.barrel;
  parts.push(box([slideW * 0.18, slideTop + 0.0004, chamber + 0.012], [slideW * 0.62, 0.0015, 0.03], dark));
  // Sights: a front post and two rear ears with a gap the post shows through.
  parts.push(box([0, slideTop + postH / 2, sightZ], [0.0055, postH, 0.008], dark));
  for (const side of [-1, 1]) parts.push(box([side * 0.0078, slideTop + postH / 2, rearSightZ], [0.0065, postH, 0.01], dark));
  if (spec.optic) parts.push(box([0, slideTop + 0.0015, rearSightZ - 0.03], [slideW * 0.9, 0.003, 0.04], 0x6f6149));
  // Barrel crown, bull barrel, or threaded barrel standing out of the slide.
  if (spec.threaded) {
    parts.push(tube([0, bore, muzzleZ + proud / 2 + 0.002], 0.0075, proud + 0.004, steel));
    parts.push(tube([0, bore, slideFront - 0.002], 0.0095, 0.004, 0x30302c));   // the O-ring
  } else parts.push(tube([0, bore, muzzleZ + 0.004], spec.bull ? 0.0075 : 0.0058, 0.008, dark));
  // Frame: dust cover under the slide, with a rail, and the trigger guard and trigger.
  const coverFront = slideFront + (spec.taper ? 0.006 : 0.012);
  parts.push(box([0, frameCy, (rear + coverFront) / 2], [spec.frame, frameH, rear - coverFront], spec.frameColor));
  if (spec.rail) for (let i = 0; i < 3; i++) parts.push(box([0, frameBottom - 0.002, coverFront + 0.01 + i * 0.01], [spec.frame * 0.9, 0.004, 0.005], spec.frameColor));
  if (spec.grooves) for (const side of [-1, 1]) parts.push(box([side * (spec.frame / 2 + 0.0004), frameCy - 0.004, coverFront + 0.03], [0.001, 0.003, 0.05], dark));
  parts.push(box([0, (frameBottom + guardBottom) / 2, guardFront], [spec.frame * 0.7, frameBottom - guardBottom, 0.006], spec.frameColor, { rotation: [0.25, 0, 0] }));
  parts.push(box([0, guardBottom, (guardFront + guardRear) / 2], [spec.frame * 0.7, 0.005, guardRear - guardFront], spec.frameColor));
  if (spec.hook) parts.push(box([0, guardBottom - 0.003, guardFront - 0.004], [spec.frame * 0.7, 0.008, 0.008], spec.frameColor, { rotation: [0.6, 0, 0] }));
  parts.push(box([0, frameBottom - 0.011, guardRear - 0.018], [0.007, 0.02, 0.006], dark, { rotation: [-0.25, 0, 0] }));
  // Grip and magazine. The magazine is the part that drops on a reload; its base shows under the grip.
  parts.push(box(gripCenter, [gripW, gripH, gripLen], gripColor, { rotation: rake }));
  const magazine = along(gripH / 2 + 0.006);
  parts.push(box(magazine, [gripW * 0.82, gripH, gripLen * 0.62], dark, { rotation: rake, moves: 'magazine' }));
  if (spec.magwell) parts.push(box(along(gripH - 0.006), [gripW + 0.006, 0.014, gripLen + 0.006], spec.frameColor, { rotation: rake }));
  // Controls.
  if (spec.hammer) parts.push(box([0, slideTop - 0.004, rear + 0.006], [0.008, 0.014, 0.008], dark, { rotation: [-0.5, 0, 0] }));
  if (spec.beavertail) parts.push(box([0, frameBottom + 0.002, rear + 0.012], [spec.frame * 0.9, 0.009, 0.026], spec.frameColor, { rotation: [0.35, 0, 0] }));
  if (spec.safety) parts.push(box([-(spec.frame / 2 + 0.002), frameCy - 0.003, guardRear + 0.012], [0.004, 0.006, 0.014], dark));
  if (spec.decocker) parts.push(box([-(spec.frame / 2 + 0.002), frameCy - 0.002, guardRear + 0.02], [0.004, 0.009, 0.012], dark));
  // Suppressor and hands.
  const [canRadius, canLength] = spec.suppressor ?? [0.017, 0.2];
  parts.push(tube([0, bore, muzzleZ - canLength / 2], canRadius, canLength, 0x151a1c, { role: 'suppressor' }));
  parts.push(...hands([0, gripCenter[1] - 0.015, gripCenter[2] + 0.01], [0.03, gripCenter[1] + 0.005, gripCenter[2] - 0.01]));
  const [radius, length] = spec.casing ?? [0.0048, 0.019];
  return {
    muzzle: [0, bore, muzzleZ], sight: [0, slideTop + postH, sightZ], port: [slideW / 2 - 0.004, slideTop - 0.004, chamber + 0.012],
    casing: [radius, length, brass], suppressorLength: canLength, parts,
  };
}

export const weaponModels = {
  rifle: {
    muzzle: [0, 0.03, -0.78], sight: [0, 0.1025, -0.52], port: [0.03, 0.05, -0.08], casing: [0.0045, 0.045, brass],
    parts: [
      box([0, -0.01, -0.06], [0.06, 0.075, 0.32], metal),
      box([0, 0.045, -0.12], [0.056, 0.06, 0.44], steel),
      tube([0, 0.03, -0.42], 0.034, 0.3, 0x354438),
      tube([0, 0.03, -0.64], 0.011, 0.2, metal),
      tube([0, 0.03, -0.74], 0.02, 0.06, steel),
      box([0, -0.12, -0.1], [0.036, 0.17, 0.065], metal, { rotation: [0.12, 0, 0], moves: 'magazine' }),
      box([0, -0.085, 0.07], [0.042, 0.12, 0.05], metal, { rotation: [-0.3, 0, 0] }),
      box([0, 0.0, 0.3], [0.052, 0.085, 0.24], 0x2a3a30),
      box([0, 0.085, -0.52], [0.012, 0.035, 0.012], metal),
      // Rear sight: two ears with a gap, so the front post shows between them.
      box([-0.011, 0.093, 0.0], [0.008, 0.03, 0.035], metal),
      box([0.011, 0.093, 0.0], [0.008, 0.03, 0.035], metal),
      tube([0, 0.03, -0.84], 0.027, 0.2, 0x151a1c, { role: 'suppressor' }),
      ...hands([0, -0.095, 0.075], [0, -0.025, -0.42]),
    ],
  },
  shotgun: {
    muzzle: [0, 0.03, -0.9], sight: [0, 0.065, -0.88], port: [0.03, 0.02, -0.12], casing: [0.0105, 0.065, 0x8e2a22],
    parts: [
      box([0, 0, -0.1], [0.056, 0.085, 0.32], 0x2a2f2e),
      tube([0, 0.03, -0.55], 0.017, 0.7, steel),
      tube([0, -0.012, -0.52], 0.015, 0.55, metal),
      box([0, -0.015, -0.42], [0.058, 0.055, 0.2], 0x8b6746, { moves: 'pump' }),
      box([0, -0.06, 0.12], [0.04, 0.12, 0.05], 0x8b6746, { rotation: [-0.25, 0, 0] }),
      box([0, -0.01, 0.34], [0.05, 0.1, 0.3], 0x8b6746),
      box([0, 0.058, -0.88], [0.01, 0.014, 0.01], steel),
      tube([0, 0.03, -1.02], 0.027, 0.2, 0x151a1c, { role: 'suppressor' }),
      ...hands([0, -0.085, 0.09], [0, -0.01, -0.42]),
    ],
  },
  sniper: {
    muzzle: [0, 0.035, -1.05], sight: [0, 0.115, -0.33], port: [0.03, 0.04, -0.05], casing: [0.006, 0.07, brass],
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
      box([0.05, 0.03, -0.02], [0.03, 0.02, 0.02], steel, { moves: 'bolt' }),
      box([0, -0.12, -0.1], [0.036, 0.1, 0.06], metal, { moves: 'magazine' }),
      box([0, -0.07, 0.1], [0.042, 0.13, 0.05], 0x2a3a30, { rotation: [-0.3, 0, 0] }),
      box([0, 0.01, 0.34], [0.058, 0.12, 0.3], 0x52614a),
      tube([0, 0.035, -1.2], 0.03, 0.22, 0x151a1c, { role: 'suppressor' }),
      ...hands([0, -0.095, 0.1], [0, -0.04, -0.46]),
    ],
  },
};

for (const [id, spec] of Object.entries(pistolSpecs)) weaponModels[`pistol:${id}`] = pistolModel(spec);
// The plain 'pistol' is the default model, kept off the list so it is not built twice.
Object.defineProperty(weaponModels, 'pistol', { value: weaponModels[`pistol:${defaultPistol}`], enumerable: false });
// The model for a weapon key ('pistol:mk23'), falling back to the slot's default.
export const modelFor = key => key ? weaponModels[key] ?? weaponModels[key.split(':')[0]] : undefined;

// Length of a fitted suppressor beyond the muzzle, so the flash moves out with it.
export const suppressorLength = { rifle: 0.2, pistol: 0.2, shotgun: 0.2, sniper: 0.22 };
for (const id of Object.keys(pistolSpecs)) suppressorLength[`pistol:${id}`] = weaponModels[`pistol:${id}`].suppressorLength;
export const suppressorFor = key => suppressorLength[key] ?? suppressorLength[key?.split(':')[0]] ?? 0;
