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

// Rifles (owner, 2026-11-13; POLISH_PLAN step 5.4). One builder fed each rifle's barrel
// length and parts; the receiver, grip and magazine well sit where the old model had them,
// so hands, ejection and aiming work the same. Keys are 'rifle:<model>' (kit.js rifleModels).
// Barrel lengths: M4A1 URG-I and HK416 14.5 in, Rattler 5.5 in, Honey Badger 7 in (inside
// its suppressor). The Noveske N4 (14.5 in) and Q Boombox (9 in) are assumptions.
const inch = 0.0254;
const rifleSpecs = {
  // Long free-float rail in a desert tan, collapsible stock, flash hider.
  m4urgi: { barrel: 14.5 * inch, rail: 0.33, railColor: 0x8a7a5a, body: 0x23292b, stock: 'carbine', magazine: 'stanag', device: 'flash' },
  // Shorter rail with the piston gas block showing ahead of it, slimline stock, steel magazine.
  hk416: { barrel: 14.5 * inch, rail: 0.26, railColor: 0x1f2426, body: 0x1f2426, stock: 'hk', magazine: 'steel', device: 'flash', gasBlock: true },
  // Tiny: 5.5 in barrel, short rail, folding skeleton stock, no buffer tube.
  rattler: { barrel: 5.5 * inch, rail: 0.11, railColor: 0x2a2f31, body: 0x2a2f31, stock: 'folding', magazine: 'stanag', device: 'flash', casing: [0.0045, 0.035] },
  // Slim rail, wide flash hider.
  n4: { barrel: 14.5 * inch, rail: 0.33, railColor: 0x30353a, body: 0x262b2d, stock: 'carbine', magazine: 'stanag', device: 'wide' },
  // 8.6 Blackout: big straight magazine, brake, pistol-style brace.
  boombox: { barrel: 9 * inch, rail: 0.2, railColor: 0x50524c, body: 0x2c2f30, stock: 'pdw', magazine: 'big', device: 'brake', casing: [0.0055, 0.045], receiver: 1.12 },
  // Integral suppressor makes up the whole fore end; PDW stock.
  honeybadger: { barrel: 7 * inch, rail: 0, railColor: 0x2a2d2e, body: 0x2a2d2e, stock: 'pdw', magazine: 'stanag', device: 'integral', casing: [0.0045, 0.035], can: [0.023, 0.27] },
};
function rifleModel(spec) {
  const dark = 0x111517, bore = 0.03, chamber = 0.02, scale = spec.receiver ?? 1;
  const railTop = 0.073, front = -0.06;   // upper receiver front; the rail or can starts here
  const barrelEnd = chamber - spec.barrel;
  const parts = [];
  // Upper and lower receivers, top rail, charging handle.
  parts.push(box([0, 0.045, 0.03], [0.034 * scale, 0.04, 0.18], spec.body));
  parts.push(box([0, railTop - 0.004, 0.03], [0.022, 0.008, 0.18], spec.body));
  for (let i = 0; i < 6; i++) parts.push(box([0, railTop + 0.0005, 0.1 - i * 0.028], [0.023, 0.002, 0.008], dark));
  parts.push(box([0, 0.066, 0.125], [0.03, 0.01, 0.02], dark));
  parts.push(box([0, -0.005, 0.015], [0.036 * scale, 0.045, 0.17], spec.body));
  parts.push(box([0, -0.04, -0.025], [0.04 * scale, 0.04, 0.075], spec.body));           // magazine well
  // Ejection port and forward assist on the right.
  parts.push(box([0.0175 * scale, 0.04, 0.02], [0.002, 0.016, 0.05], dark));
  // Pistol grip, trigger and guard.
  parts.push(box([0, -0.075, 0.075], [0.032, 0.11, 0.045], 0x1b1f20, { rotation: [-0.3, 0, 0] }));
  parts.push(box([0, -0.04, 0.04], [0.006, 0.02, 0.006], dark, { rotation: [-0.2, 0, 0] }));
  parts.push(box([0, -0.055, 0.035], [0.02, 0.004, 0.06], spec.body));
  // Magazine: curved box magazine in two pieces, a steel one, or a big straight 8.6.
  if (spec.magazine === 'big') {
    parts.push(box([0, -0.12, -0.03], [0.034, 0.13, 0.085], dark, { rotation: [0.06, 0, 0], moves: 'magazine' }));
  } else {
    const color = spec.magazine === 'steel' ? 0x3d4244 : 0x1c1f20;
    parts.push(box([0, -0.1, -0.026], [0.026, 0.09, 0.064], color, { rotation: [0.1, 0, 0], moves: 'magazine' }));
    parts.push(box([0, -0.175, -0.04], [0.026, 0.07, 0.062], color, { rotation: [0.3, 0, 0], moves: 'magazine' }));
  }
  // Stock.
  if (spec.stock === 'carbine' || spec.stock === 'hk') {
    parts.push(tube([0, 0.03, 0.2], 0.015, 0.16, dark));
    const hk = spec.stock === 'hk';
    parts.push(box([0, 0.015, 0.34], [hk ? 0.046 : 0.04, hk ? 0.09 : 0.075, 0.16], hk ? 0x1d2122 : 0x2a2f30));
    parts.push(box([0, -0.02, 0.41], [0.042, 0.12, 0.02], 0x151819));
  } else if (spec.stock === 'folding') {
    for (const y of [0.05, -0.005]) parts.push(box([0, y, 0.23], [0.012, 0.012, 0.2], dark));
    parts.push(box([0, 0.02, 0.33], [0.03, 0.09, 0.015], dark));
  } else {
    for (const x of [-0.012, 0.012]) parts.push(tube([x, 0.035, 0.2], 0.005, 0.18, dark));
    parts.push(box([0, 0.02, 0.29], [0.04, 0.085, 0.018], dark));
  }
  // Rear sight ears on the upper rail; the front post goes on the rail or can.
  for (const side of [-1, 1]) parts.push(box([side * 0.007, railTop + 0.009, 0.1], [0.006, 0.018, 0.015], dark));
  let muzzleZ, sightZ, supportZ;
  if (spec.device === 'integral') {
    // The can is the fore end: a thick tube from the receiver to the muzzle, with a short top rail.
    const [radius, length] = spec.can;
    parts.push(tube([0, bore, front - length / 2], radius, length, spec.body));
    parts.push(tube([0, bore, front - length + 0.004], radius * 0.45, 0.01, dark));
    parts.push(box([0, railTop - 0.004, front - 0.05], [0.022, 0.008, 0.1], spec.body));
    muzzleZ = front - length; sightZ = front - 0.09; supportZ = front - 0.08;
  } else {
    // Free-float rail around the barrel, with a top strip and side slots.
    const railFront = front - spec.rail;
    parts.push(box([0, 0.034, front - spec.rail / 2], [0.044, 0.058, spec.rail], spec.railColor));
    parts.push(box([0, railTop - 0.005, front - spec.rail / 2], [0.022, 0.01, spec.rail], spec.railColor));
    for (let z = front - 0.03; z > railFront + 0.02; z -= 0.035) for (const side of [-1, 1]) parts.push(box([side * 0.0225, 0.03, z], [0.002, 0.012, 0.02], dark));
    if (spec.gasBlock) parts.push(box([0, 0.042, railFront - 0.015], [0.026, 0.03, 0.03], dark));
    // Barrel beyond the rail, then the muzzle device.
    if (barrelEnd < railFront) parts.push(tube([0, bore, (railFront + barrelEnd) / 2], 0.0085, railFront - barrelEnd, dark));
    const device = { flash: [0.011, 0.055], wide: [0.016, 0.06], brake: [0.015, 0.06] }[spec.device];
    parts.push(tube([0, bore, barrelEnd - device[1] / 2], device[0], device[1], dark));
    if (spec.device === 'brake') for (const side of [-1, 1]) parts.push(box([side * 0.014, bore, barrelEnd - 0.03], [0.004, 0.012, 0.03], 0x07090a));
    muzzleZ = Math.min(barrelEnd - device[1], railFront);
    sightZ = railFront + 0.012; supportZ = front - Math.min(spec.rail * 0.6, 0.2);
  }
  parts.push(box([0, railTop + 0.009, sightZ], [0.005, 0.018, 0.008], dark));
  // Suppressor (fitted only), except on the integral one.
  const canLength = spec.device === 'integral' ? 0 : 0.17;
  if (canLength) parts.push(tube([0, bore, muzzleZ - canLength / 2], 0.019, canLength, 0x151a1c, { role: 'suppressor' }));
  parts.push(...hands([0, -0.095, 0.075], [0, -0.02, supportZ]));
  const [radius, length] = spec.casing ?? [0.0045, 0.045];
  return {
    muzzle: [0, bore, muzzleZ], sight: [0, railTop + 0.018, sightZ], port: [0.03, 0.045, 0.02],
    casing: [radius, length, brass], suppressorLength: canLength, parts,
  };
}

// DMRs and sniper rifles (owner, 2026-11-13). One builder with a scope instead of iron
// sights: the sight point is the objective lens on the scope's axis, so aiming looks down
// the tube. Bolt actions get a bolt handle that cycles; semi-autos a charging handle.
// Barrel lengths are published specs where known; the MRGG-S, Q Fix and SIG Cross are
// assumptions (18, 16 and 16 in).
const longSpecs = {
  // DMRs: semi-auto 7.62 and 6.5 Creedmoor on AR-10 style receivers, a 2-4x LPVO.
  'dmr:m110a1': { barrel: 16.5 * inch, rail: 0.33, body: 0x8a7a5a, railColor: 0x8a7a5a, stock: 'carbine', magazine: 20, device: 'flash', scope: 'lpvo', receiver: 1.1, casing: [0.006, 0.07] },
  'dmr:sr25': { barrel: 20 * inch, rail: 0.33, body: 0x2a2e2b, railColor: 0x2a2e2b, stock: 'precision', magazine: 20, device: 'flash', scope: 'lpvo', receiver: 1.1, casing: [0.006, 0.07] },
  'dmr:mrggs': { barrel: 18 * inch, rail: 0.36, body: 0x8f7d5e, railColor: 0x8f7d5e, stock: 'carbine', magazine: 20, device: 'brake', scope: 'lpvo', receiver: 1.1, casing: [0.0058, 0.06] },
  'dmr:mk20': { barrel: 20 * inch, rail: 0.3, body: 0x9a8762, railColor: 0x9a8762, stock: 'scar', magazine: 20, device: 'flash', scope: 'lpvo', receiver: 1.15, casing: [0.006, 0.07] },
  // Bolt-action DMRs with folding stocks.
  'dmr:qfix86': { barrel: 16 * inch, rail: 0.3, body: 0x3a3d3e, railColor: 0x3a3d3e, stock: 'folding', magazine: 10, device: 'brake', scope: 'lpvo', action: 'bolt', casing: [0.0055, 0.045] },
  'dmr:qfix65': { barrel: 16 * inch, rail: 0.3, body: 0x3a3d3e, railColor: 0x3a3d3e, stock: 'folding', magazine: 10, device: 'brake', scope: 'lpvo', action: 'bolt', casing: [0.0058, 0.06] },
  'dmr:cross': { barrel: 16 * inch, rail: 0.27, body: 0x6e6450, railColor: 0x2c2f30, stock: 'folding', magazine: 5, device: 'brake', scope: 'lpvo', action: 'bolt', casing: [0.0058, 0.06] },
  // Sniper rifles: long heavy barrels, big scopes, bipods.
  'sniper:mrad338': { barrel: 27 * inch, rail: 0.38, body: 0x7d6d50, railColor: 0x7d6d50, stock: 'folding', magazine: 10, device: 'brake', scope: 'sniper', action: 'bolt', bipod: true, barrelRadius: 0.013, receiver: 1.15, casing: [0.0075, 0.09] },
  'sniper:mrad300': { barrel: 26 * inch, rail: 0.38, body: 0x7d6d50, railColor: 0x7d6d50, stock: 'folding', magazine: 10, device: 'brake', scope: 'sniper', action: 'bolt', bipod: true, barrelRadius: 0.013, receiver: 1.15, casing: [0.0072, 0.085] },
  'sniper:axsr': { barrel: 27 * inch, rail: 0.36, body: 0x55594a, railColor: 0x55594a, stock: 'folding', magazine: 10, device: 'brake', scope: 'sniper', action: 'bolt', bipod: true, barrelRadius: 0.013, receiver: 1.15, casing: [0.0075, 0.09] },
  'sniper:tac50': { barrel: 29 * inch, rail: 0.34, body: 0x262a24, railColor: 0x3b4134, stock: 'thumbhole', magazine: 5, device: 'brake50', scope: 'sniper', action: 'bolt', bipod: true, barrelRadius: 0.016, receiver: 1.3, casing: [0.01, 0.1] },
  'sniper:m107a1': { barrel: 20 * inch, rail: 0.3, body: 0x6b6758, railColor: 0x6b6758, stock: 'barrett', magazine: 10, device: 'brake50', scope: 'sniper', bipod: true, barrelRadius: 0.017, receiver: 1.5, casing: [0.01, 0.1] },
};
function longGunModel(spec) {
  const dark = 0x111517, bore = 0.03, chamber = 0.02, scale = spec.receiver ?? 1;
  const railTop = 0.073, front = -0.07 * scale, body = spec.body;
  const barrelEnd = chamber - spec.barrel, parts = [];
  // Receiver, top rail, controls.
  parts.push(box([0, 0.04, (0.12 + front) / 2], [0.036 * scale, 0.05 * scale, 0.12 - front], body));
  parts.push(box([0, railTop - 0.004, (0.12 + front) / 2], [0.022, 0.008, 0.12 - front], body));
  parts.push(box([0, -0.01, 0.02], [0.036 * scale, 0.045, 0.17], body));
  if (spec.action === 'bolt') {
    parts.push(box([0.032 * scale, 0.045, 0.06], [0.035, 0.01, 0.012], steel, { moves: 'bolt' }));
    parts.push(tube([0.05 * scale, 0.04, 0.06], 0.008, 0.016, dark, { moves: 'bolt' }));
  } else parts.push(box([0, 0.066, 0.12], [0.03, 0.01, 0.02], dark));
  parts.push(box([0.018 * scale, 0.04, 0.02], [0.002, 0.016, 0.06], dark));
  // Grip, trigger, guard.
  parts.push(box([0, -0.075, 0.075], [0.032, 0.11, 0.045], 0x1b1f20, { rotation: [-0.3, 0, 0] }));
  parts.push(box([0, -0.045, 0.04], [0.006, 0.02, 0.006], dark, { rotation: [-0.2, 0, 0] }));
  parts.push(box([0, -0.06, 0.035], [0.02, 0.004, 0.06], body));
  // Straight box magazine, deeper for more rounds.
  const depth = { 5: 0.045, 10: 0.065, 20: 0.1 }[spec.magazine] * Math.max(1, scale * 0.9);
  parts.push(box([0, -0.03 - depth / 2, -0.035], [0.032 * scale, depth, 0.08 * Math.min(scale, 1.3)], dark, { rotation: [0.05, 0, 0], moves: 'magazine' }));
  // Stock.
  if (spec.stock === 'carbine') {
    parts.push(tube([0, 0.03, 0.2], 0.016, 0.16, dark));
    parts.push(box([0, 0.015, 0.34], [0.044, 0.085, 0.16], 0x24282a));
  } else if (spec.stock === 'precision') {
    parts.push(box([0, 0.0, 0.29], [0.042, 0.1, 0.25], body));
    parts.push(box([0, 0.055, 0.25], [0.034, 0.02, 0.12], dark));
  } else if (spec.stock === 'scar') {
    parts.push(box([0, 0.01, 0.3], [0.046, 0.09, 0.22], 0x2a2c26));
    parts.push(box([0, 0.065, 0.27], [0.034, 0.025, 0.1], 0x2a2c26));
  } else if (spec.stock === 'thumbhole') {
    parts.push(box([0, -0.005, 0.27], [0.05, 0.13, 0.3], spec.railColor));
    parts.push(box([0, -0.02, 0.17], [0.052, 0.045, 0.07], 0x07090a));
  } else if (spec.stock === 'barrett') {
    parts.push(box([0, 0.0, 0.3], [0.05, 0.11, 0.24], body));
    parts.push(box([0, -0.035, 0.42], [0.05, 0.14, 0.025], 0x151819));
  } else {
    for (const y of [0.05, -0.035]) parts.push(box([0, y, 0.24], [0.012, 0.012, 0.22], dark));
    parts.push(box([0, 0.065, 0.24], [0.03, 0.025, 0.09], dark));
    parts.push(box([0, 0.005, 0.355], [0.032, 0.14, 0.018], 0x151819));
  }
  // Fore end around the barrel, barrel, muzzle device, bipod.
  const railFront = front - spec.rail, radius = spec.barrelRadius ?? 0.011;
  parts.push(box([0, 0.032, front - spec.rail / 2], [0.046, 0.06, spec.rail], spec.railColor));
  parts.push(box([0, railTop - 0.005, front - spec.rail / 2], [0.022, 0.01, spec.rail], spec.railColor));
  for (let z = front - 0.03; z > railFront + 0.02; z -= 0.04) for (const side of [-1, 1]) parts.push(box([side * 0.0235, 0.03, z], [0.002, 0.012, 0.022], dark));
  if (barrelEnd < railFront) parts.push(tube([0, bore, (railFront + barrelEnd) / 2], radius, railFront - barrelEnd, dark));
  const device = { flash: [0.012, 0.06], brake: [0.017, 0.075], brake50: [0.026, 0.12] }[spec.device];
  parts.push(tube([0, bore, barrelEnd - device[1] / 2], device[0], device[1], dark));
  if (spec.device !== 'flash') for (const side of [-1, 1]) parts.push(box([side * device[0], bore, barrelEnd - device[1] * 0.45], [0.004, device[0], device[1] * 0.5], 0x07090a));
  if (spec.bipod) {
    parts.push(box([0, 0.0, railFront + 0.02], [0.03, 0.02, 0.03], dark));
    for (const side of [-1, 1]) parts.push(box([side * 0.012, -0.008, railFront + 0.12], [0.008, 0.008, 0.2], dark));
  }
  const muzzleZ = Math.min(barrelEnd - device[1], railFront);
  // Scope on two rings: a 2-4x LPVO on DMRs, a long scope on sniper rifles.
  const big = spec.scope === 'sniper', tubeR = big ? 0.017 : 0.015, length = big ? 0.36 : 0.27;
  const scopeY = railTop + (big ? 0.045 : 0.034), ocular = 0.03, objective = ocular - length;
  parts.push(tube([0, scopeY, (ocular + objective) / 2], tubeR, length, 0x151a1c));
  parts.push(tube([0, scopeY, objective - 0.02], big ? 0.028 : 0.02, 0.05, 0x151a1c));
  parts.push(tube([0, scopeY, ocular + 0.02], 0.021, 0.05, 0x151a1c));
  parts.push(box([0, scopeY + tubeR + 0.008, (ocular + objective) / 2], [0.018, 0.018, 0.022], 0x1d2224));
  parts.push(box([tubeR + 0.008, scopeY, (ocular + objective) / 2], [0.016, 0.018, 0.022], 0x1d2224));
  for (const z of [ocular - 0.08, objective + 0.09]) parts.push(box([0, (railTop + scopeY) / 2, z], [0.03, scopeY - railTop, 0.016], dark));
  // Suppressor (fitted only) and hands.
  parts.push(tube([0, bore, muzzleZ - 0.11], device[0] < 0.02 ? 0.023 : 0.028, 0.22, 0x151a1c, { role: 'suppressor' }));
  parts.push(...hands([0, -0.095, 0.075], [0, -0.02, front - Math.min(spec.rail * 0.55, 0.25)]));
  const [cr, cl] = spec.casing;
  return {
    muzzle: [0, bore, muzzleZ], sight: [0, scopeY, objective - 0.045], port: [0.03, 0.045, 0.02],
    casing: [cr, cl, brass], suppressorLength: 0.22, parts,
  };
}

// SMGs (owner, 2026-11-13). MP5 family: slim receiver with the cocking tube over a short
// barrel, drum rear sight and hooded front post, curved magazine. B&T APC: flat top rail,
// straight magazine, folding stock. Barrels: MP5 8.9 in, MP5K 4.5 in, APC 6.9 in.
const smgSpecs = {
  'smg:mp5': { type: 'mp5', barrel: 8.9 * inch, handguard: 0.13, stock: 'retract', body: 0x23272a },
  'smg:mp5k': { type: 'mp5', barrel: 4.5 * inch, handguard: 0.05, stock: 'none', body: 0x23272a, foregrip: true },
  'smg:apc45': { type: 'apc', barrel: 6.9 * inch, handguard: 0.1, stock: 'folding', body: 0x2b2f31, magazine: 0.11 },
  'smg:apc10': { type: 'apc', barrel: 6.9 * inch, handguard: 0.1, stock: 'folding', body: 0x2b2f31, magazine: 0.13, casing: [0.0053, 0.025] },
};
function smgModel(spec) {
  const dark = 0x111517, bore = 0.03, chamber = 0.02, railTop = 0.07, front = -0.06, body = spec.body;
  const barrelEnd = chamber - spec.barrel, guardFront = front - spec.handguard, parts = [];
  parts.push(box([0, 0.04, 0.03], [0.038, 0.05, 0.18], body));
  parts.push(box([0, -0.01, 0.03], [0.034, 0.04, 0.14], body));
  parts.push(box([0, -0.02, -0.025], [0.032, 0.04, 0.05], body));                       // magazine well
  parts.push(box([0, -0.075, 0.075], [0.032, 0.1, 0.045], 0x1b1f20, { rotation: [-0.3, 0, 0] }));
  parts.push(box([0, -0.045, 0.04], [0.006, 0.02, 0.006], dark, { rotation: [-0.2, 0, 0] }));
  parts.push(box([0.0195, 0.04, 0.0], [0.002, 0.014, 0.04], dark));                    // ejection port
  if (spec.type === 'mp5') {
    // Cocking tube over the barrel, slim handguard under it, drum sight and hooded front post.
    parts.push(tube([0, 0.06, (front + guardFront - 0.02) / 2], 0.01, front - guardFront + 0.02, body));
    parts.push(box([0, 0.025, front - spec.handguard / 2], [0.044, 0.042, spec.handguard], 0x1a1d1f));
    parts.push(box([0, railTop + 0.004, 0.11], [0.024, 0.024, 0.024], dark));
    for (const side of [-1, 1]) parts.push(box([side * 0.011, railTop + 0.011, guardFront - 0.012], [0.003, 0.022, 0.016], dark));
    // Curved magazine in two pieces.
    parts.push(box([0, -0.075, -0.03], [0.022, 0.075, 0.04], dark, { rotation: [0.15, 0, 0], moves: 'magazine' }));
    parts.push(box([0, -0.135, -0.045], [0.022, 0.055, 0.038], dark, { rotation: [0.35, 0, 0], moves: 'magazine' }));
  } else {
    parts.push(box([0, railTop - 0.004, 0.03], [0.022, 0.008, 0.18], body));
    parts.push(box([0, 0.032, front - spec.handguard / 2], [0.042, 0.05, spec.handguard], body));
    parts.push(box([0, railTop - 0.004, front - spec.handguard / 2], [0.022, 0.008, spec.handguard], body));
    parts.push(box([0, -0.02 - spec.magazine / 2, -0.03], [0.026, spec.magazine, 0.04], dark, { rotation: [0.05, 0, 0], moves: 'magazine' }));
  }
  // Rear sight ears and front post (the MP5's hood sits round the post).
  for (const side of [-1, 1]) parts.push(box([side * 0.007, railTop + 0.009, 0.09], [0.006, 0.018, 0.012], dark));
  const sightZ = guardFront - 0.012;
  parts.push(box([0, railTop + (spec.type === 'mp5' ? 0.0 : 0.009), sightZ], [0.005, spec.type === 'mp5' ? 0.036 : 0.018, 0.008], dark));
  // Barrel and muzzle.
  if (barrelEnd < guardFront) parts.push(tube([0, bore, (guardFront + barrelEnd) / 2], 0.008, guardFront - barrelEnd, dark));
  const muzzleZ = Math.min(barrelEnd - 0.02, guardFront - 0.01);
  parts.push(tube([0, bore, muzzleZ + 0.01], 0.011, 0.02, dark));
  if (spec.foregrip) parts.push(box([0, -0.04, front - 0.03], [0.026, 0.07, 0.03], 0x1b1f20, { rotation: [0.1, 0, 0] }));
  // Stock.
  if (spec.stock === 'retract') {
    for (const x of [-0.013, 0.013]) parts.push(box([x, 0.03, 0.22], [0.006, 0.01, 0.2], dark));
    parts.push(box([0, 0.02, 0.33], [0.04, 0.1, 0.018], 0x151819));
  } else if (spec.stock === 'folding') {
    for (const y of [0.05, -0.005]) parts.push(box([0, y, 0.22], [0.012, 0.012, 0.18], dark));
    parts.push(box([0, 0.022, 0.31], [0.03, 0.09, 0.015], dark));
  } else parts.push(box([0, 0.04, 0.125], [0.036, 0.04, 0.01], dark));
  parts.push(tube([0, bore, muzzleZ - 0.085], 0.019, 0.17, 0x151a1c, { role: 'suppressor' }));
  const support = spec.foregrip ? [0, -0.055, front - 0.03] : [0, -0.012, front - spec.handguard * 0.55];
  parts.push(...hands([0, -0.095, 0.075], support));
  const [cr, cl] = spec.casing ?? [0.0048, 0.019];
  return {
    muzzle: [0, bore, muzzleZ], sight: [0, railTop + 0.018, sightZ], port: [0.025, 0.045, 0.0],
    casing: [cr, cl, brass], suppressorLength: 0.17, parts,
  };
}

// LMGs (owner, 2026-11-13): belt-fed receivers with a feed cover on top, an ammunition box
// or pouch under the left side (it comes off on a reload), carry handle and bipod.
// Barrels: Mk 46 16.3 in, Mk 48 19.75 in, M240L 20.9 in, M250 17.5 in, MMG 338 24 in.
const lmgSpecs = {
  'lmg:mk46': { barrel: 16.3 * inch, guard: 0.2, body: 0x2a2d2b, stock: 'collapsible', pouch: 0x6d6448, casing: [0.0045, 0.045] },
  'lmg:mk48': { barrel: 19.75 * inch, guard: 0.22, body: 0x2a2d2b, stock: 'collapsible', pouch: 0x6d6448, gasTube: true, casing: [0.006, 0.07] },
  'lmg:m240l': { barrel: 20.9 * inch, guard: 0.24, body: 0x262927, stock: 'skeleton', pouch: 0x4e5340, gasTube: true, handle: true, casing: [0.006, 0.07] },
  'lmg:m250': { barrel: 17.5 * inch, guard: 0.26, body: 0x6e6450, stock: 'folding', pouch: 0x5e5a46, casing: [0.0062, 0.07] },
  'lmg:mmg338': { barrel: 24 * inch, guard: 0.3, body: 0x23262a, stock: 'folding', pouch: 0x4e5340, gasTube: true, handle: true, casing: [0.0075, 0.09], scale: 1.12 },
};
function lmgModel(spec) {
  const dark = 0x111517, bore = 0.03, chamber = 0.02, k = spec.scale ?? 1, body = spec.body;
  const coverTop = 0.095 * k, front = -0.16, barrelEnd = chamber - spec.barrel, guardFront = front - spec.guard, parts = [];
  parts.push(box([0, 0.035, -0.03], [0.05 * k, 0.075 * k, 0.26], body));
  parts.push(box([0, coverTop - 0.012, -0.03], [0.052 * k, 0.024, 0.18], 0x1d2021));
  parts.push(box([0, coverTop - 0.002, -0.03], [0.022, 0.008, 0.16], 0x1d2021));
  parts.push(box([0.026 * k, 0.03, -0.02], [0.002, 0.02, 0.07], dark));
  parts.push(box([0, -0.075, 0.075], [0.032, 0.11, 0.045], 0x1b1f20, { rotation: [-0.3, 0, 0] }));
  parts.push(box([0, -0.045, 0.04], [0.006, 0.02, 0.006], dark, { rotation: [-0.2, 0, 0] }));
  parts.push(box([0, -0.06, 0.035], [0.02, 0.004, 0.06], body));
  // Ammunition pouch or box hung under the left side, with the belt running up into it.
  parts.push(box([-0.012, -0.075, -0.07], [0.075, 0.1, 0.12], spec.pouch, { moves: 'magazine' }));
  parts.push(box([-0.03 * k, 0.005, -0.06], [0.012, 0.045, 0.03], 0xb58b3c, { moves: 'magazine' }));
  // Fore end, barrel, gas tube, carry handle, bipod.
  parts.push(box([0, 0.03, front - spec.guard / 2], [0.048, 0.055, spec.guard], body));
  parts.push(tube([0, bore, (guardFront + barrelEnd) / 2], 0.012, guardFront - barrelEnd, dark));
  if (spec.gasTube) parts.push(tube([0, bore - 0.022, (guardFront + barrelEnd + 0.08) / 2], 0.007, guardFront - barrelEnd - 0.08, dark));
  parts.push(tube([0, bore, barrelEnd - 0.03], 0.013, 0.06, dark));
  if (spec.handle) parts.push(box([0, coverTop - 0.01, front - 0.02], [0.012, 0.03, 0.12], dark));
  for (const side of [-1, 1]) parts.push(box([side * 0.013, 0.0, barrelEnd + 0.13], [0.008, 0.008, 0.22], dark));
  // Rear sight on the feed cover, front post standing up from the barrel.
  for (const side of [-1, 1]) parts.push(box([side * 0.007, coverTop + 0.009, 0.05], [0.006, 0.018, 0.012], dark));
  const sightZ = barrelEnd + 0.08, sightTop = coverTop + 0.018;
  parts.push(box([0, (bore + sightTop) / 2, sightZ], [0.006, sightTop - bore, 0.01], dark));
  // Stock.
  if (spec.stock === 'collapsible') {
    parts.push(tube([0, 0.03, 0.2], 0.016, 0.16, dark));
    parts.push(box([0, 0.015, 0.34], [0.046, 0.09, 0.17], 0x24282a));
  } else if (spec.stock === 'skeleton') {
    for (const y of [0.06, -0.03]) parts.push(box([0, y, 0.25], [0.014, 0.014, 0.25], dark));
    parts.push(box([0, 0.015, 0.37], [0.036, 0.13, 0.02], 0x151819));
  } else {
    for (const y of [0.055, -0.025]) parts.push(box([0, y, 0.23], [0.012, 0.012, 0.21], dark));
    parts.push(box([0, 0.065, 0.24], [0.03, 0.025, 0.09], dark));
    parts.push(box([0, 0.015, 0.34], [0.034, 0.13, 0.018], 0x151819));
  }
  const muzzleZ = barrelEnd - 0.06;
  parts.push(tube([0, bore, muzzleZ - 0.1], 0.026, 0.2, 0x151a1c, { role: 'suppressor' }));
  parts.push(...hands([0, -0.095, 0.075], [0, -0.02, front - spec.guard * 0.5]));
  const [cr, cl] = spec.casing;
  return {
    muzzle: [0, bore, muzzleZ], sight: [0, sightTop, sightZ], port: [0.03, 0.03, -0.02],
    casing: [cr, cl, brass], suppressorLength: 0.2, parts,
  };
}

export const weaponModels = {
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
};

for (const [id, spec] of Object.entries(pistolSpecs)) weaponModels[`pistol:${id}`] = pistolModel(spec);
for (const [id, spec] of Object.entries(rifleSpecs)) weaponModels[`rifle:${id}`] = rifleModel(spec);
// The plain 'pistol' and 'rifle' are the default models, kept off the list so they are not built twice.
Object.defineProperty(weaponModels, 'pistol', { value: weaponModels[`pistol:${defaultPistol}`], enumerable: false });
Object.defineProperty(weaponModels, 'rifle', { value: weaponModels['rifle:m4urgi'], enumerable: false });
for (const [key, spec] of Object.entries(longSpecs)) weaponModels[key] = longGunModel(spec);
for (const [key, spec] of Object.entries(smgSpecs)) weaponModels[key] = smgModel(spec);
for (const [key, spec] of Object.entries(lmgSpecs)) weaponModels[key] = lmgModel(spec);
for (const [id, model] of Object.entries({ dmr: 'm110a1', smg: 'mp5', lmg: 'mk48', sniper: 'mrad338' })) Object.defineProperty(weaponModels, id, { value: weaponModels[`${id}:${model}`], enumerable: false });
// The model for a weapon key ('pistol:mk23'), falling back to the slot's default.
export const modelFor = key => key ? weaponModels[key] ?? weaponModels[key.split(':')[0]] : undefined;

// Length of a fitted suppressor beyond the muzzle, so the flash moves out with it.
export const suppressorLength = { rifle: 0.2, pistol: 0.2, shotgun: 0.2, sniper: 0.22, dmr: 0.22, smg: 0.17, lmg: 0.2 };
for (const key of Object.keys(weaponModels)) if (weaponModels[key].suppressorLength !== undefined) suppressorLength[key] = weaponModels[key].suppressorLength;
export const suppressorFor = key => suppressorLength[key] ?? suppressorLength[key?.split(':')[0]] ?? 0;
