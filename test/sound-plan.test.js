import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { defaults, schema } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { weapons } from '../src/kit.js';
import { obstruction, hearing, guardHears, roomReverb, occlusion, gunSounds, stepSounds, stepLoudness, loudness, reverbs } from '../src/sound-plan.js';
import { surfaceKinds } from '../src/surface-plan.js';

const point = (x, z, y) => { const [px, pz] = [(x - 600) * 0.02, (z - 500) * 0.02]; return [px, y, pz]; };
const mission = () => createMission(martelli, { ...defaults, guardCount: 0 });

test('the rule exists and is on by default', () => assert.equal(schema.sharedHearing.value, true));

test('open air matches the old alert radius exactly', () => {
  // An empty world: nothing between source and listener.
  const empty = { wallPieces: [], doors: [], windowHealth: [] }, openMap = { doors: [], windows: [] };
  const at = [0, 1.6, 0];
  assert.ok(hearing(empty, openMap, at, [17.9, 1.6, 0], 18).level > 0);
  assert.ok(hearing(empty, openMap, at, [18.1, 1.6, 0], 18).level < 0);
  for (const x of [5, 17.9, 18.1, 30]) {
    const guard = { position: [x, 0], elevation: 0 };
    assert.equal(guardHears(empty, openMap, defaults, guard, at, 18), guardHears(empty, openMap, { ...defaults, sharedHearing: false }, guard, at, 18), `at ${x} m`);
  }
});

test('a partition counts once, and a hole through it lets the sound pass', () => {
  const state = mission();
  // Across the stairwell wall at plan x 510 (Main), head height.
  const a = point(540, 550, 4.8), b = point(480, 550, 4.8);
  const through = obstruction(state, martelli, a, b);
  const walls = through.obstacles.filter(o => o.kind === 'drywall');
  assert.equal(walls.length, 1, JSON.stringify(through.obstacles));
  assert.equal(through.db, occlusion.drywall.db);
  // Knock out every drywall skin of that wall along the line: the wall stops counting.
  const id = walls[0].id;
  for (const piece of state.wallPieces) if (piece.wall === id && piece.material === 'drywall' && Math.abs(piece.center[1] - 4.8) < 0.3 && Math.abs(piece.center[2] - a[2]) < 0.3) piece.hp = 0;
  assert.equal(obstruction(state, martelli, a, b).obstacles.filter(o => o.kind === 'drywall').length, 0);
});

test('a closed door muffles and an open one does not', () => {
  const state = mission();
  const index = martelli.doors.findIndex(d => (d.elevation ?? 0) > 3);
  const door = martelli.doors[index], alongX = door.size[0] >= door.size[1];
  const y = door.elevation + 1.2;
  const a = alongX ? [door.position[0], y, door.position[1] - 1] : [door.position[0] - 1, y, door.position[1]];
  const b = alongX ? [door.position[0], y, door.position[1] + 1] : [door.position[0] + 1, y, door.position[1]];
  assert.ok(obstruction(state, martelli, a, b).obstacles.some(o => o.kind === 'door' && o.id === index));
  state.doors[index] = true;
  assert.ok(!obstruction(state, martelli, a, b).obstacles.some(o => o.kind === 'door'));
});

test('walls shrink how far a guard hears a suppressed shot, but an unsuppressed one still carries', () => {
  const state = mission();
  const source = point(540, 550, 4.8);
  // A guard 4 m away behind the stairwell wall.
  const guard = { position: [source[0] - 4, source[2]], elevation: 3.2 };
  assert.equal(guardHears(state, martelli, defaults, guard, source, 18), true);
  const suppressedReach = 4.4;   // just past the guard in open air
  assert.equal(guardHears(state, martelli, { ...defaults, sharedHearing: false }, guard, source, suppressedReach), true);
  assert.equal(guardHears(state, martelli, defaults, guard, source, suppressedReach), false);
});

test('room reverb follows the room size, and outside is open air', () => {
  assert.equal(roomReverb(martelli, point(470, 470, 4.8)), 'large');
  assert.equal(roomReverb(martelli, point(620, -180, 1.6)), 'outdoor');
  for (const name of Object.values(Object.fromEntries(['small', 'medium', 'large', 'outdoor'].map(k => [k, k])))) assert.ok(reverbs[name]);
});

test('every firearm and guard has a report, every floor finish a footstep, every pace a loudness', () => {
  for (const id of Object.keys(weapons)) assert.ok(gunSounds[id], id);
  assert.ok(gunSounds.guard);
  for (const kind of surfaceKinds.filter(k => !['none', 'paint', 'siding', 'ceilingPaint', 'grass'].includes(k))) assert.ok(stepSounds[kind], kind);
  for (const gait of ['walk', 'run', 'crouch', 'creep']) assert.ok(stepLoudness[gait] > 0);
});

test('speaker loudness is full up close, fades with distance and is silent well below audible', () => {
  assert.equal(loudness(40), 1);
  assert.ok(loudness(10) < loudness(20) && loudness(20) < 1);
  assert.ok(loudness(-3) > 0 && loudness(-3) < loudness(0));
  assert.equal(loudness(-7), 0);
});

test('stage B: every effect recipe is well formed, every impact and break class has one, and events map to recipes', async () => {
  const { effectSounds, eventSounds, landingSound } = await import('../src/sound-plan.js');
  const { recipes } = await import('../src/impacts.js');
  for (const [name, recipe] of Object.entries(effectSounds)) for (const layer of recipe.layers) {
    assert.ok((layer.noise || layer.tone) && layer.decay > 0 && layer.gain > 0, name);
  }
  for (const cls of Object.keys(recipes)) assert.ok(effectSounds[`impact-${cls}`], `impact-${cls}`);
  for (const cls of ['wood', 'fabric', 'metal', 'ceramic', 'masonry']) assert.ok(effectSounds[`break-${cls}`], `break-${cls}`);
  for (const sound of Object.values(eventSounds)) assert.ok(effectSounds[sound], sound);
  assert.equal(landingSound('casing', 'greyTile'), 'casingHard');
  assert.equal(landingSound('casing', 'carpet'), 'casingSoft');
  assert.equal(landingSound('hull', 'concrete'), 'hullHard');
  assert.equal(landingSound('debris', 'outdoor'), 'debrisSoft');
});

test('stage B: reload cues fire once each as the reload passes them, and the shotgun clicks once per missing shell', async () => {
  const { handlingCues } = await import('../src/sound-plan.js');
  const run = (state, weapon, style, until) => { const cues = []; for (let t = 0; t < until; t += 1 / 60) cues.push(...handlingCues(state, t, t + 1 / 60, { weapon, style })); return cues; };
  const rifle = { ...weapons.rifle }, state = { reloadUntil: rifle.reload, ammo: 4, shots: 0 };
  assert.deepEqual(run(state, rifle, 'magazine', rifle.reload + 0.2), ['magOut', 'magIn', 'charge']);
  const shotgun = { ...weapons.shotgun }, shells = { reloadUntil: shotgun.reload, ammo: 3, shots: 0 };
  const cues = run(shells, shotgun, 'shells', shotgun.reload + 0.2);
  assert.equal(cues.filter(c => c === 'shellIn').length, shotgun.magazine - 3);
  assert.equal(cues.at(-1), 'pump');
});

test('stage B: the sniper bolt and shotgun pump sound once after each shot', async () => {
  const { handlingCues } = await import('../src/sound-plan.js');
  for (const [id, cycle, cue] of [['sniper', 'bolt', 'bolt'], ['shotgun', 'pump', 'pump']]) {
    const weapon = weapons[id], state = { reloadUntil: 0, shots: 1, nextShot: weapon.interval };
    const cues = []; for (let t = 0; t < weapon.interval; t += 1 / 60) cues.push(...handlingCues(state, t, t + 1 / 60, { weapon, cycle }));
    assert.deepEqual(cues, [cue]);
  }
});

test('stage C: a walking guard steps every stride, a running guard less often, a teleport is not a step', async () => {
  const { guardStep, guardSteps } = await import('../src/sound-plan.js');
  const walk = (speed, seconds) => { const tracker = {}, guard = { position: [0, 0], health: 100 }; let steps = 0; for (let t = 0; t < seconds; t += 1 / 60) { guard.position = [speed * t, 0]; if (guardStep(tracker, guard, 1 / 60)) steps++; } return steps; };
  const walked = walk(1.2, 10);
  assert.ok(Math.abs(walked - 12 / guardSteps.stride.walk) <= 1, `${walked} steps`);
  assert.ok(Math.abs(walk(3.5, 10) - 35 / guardSteps.stride.run) <= 1);
  const tracker = {}, guard = { position: [0, 0], health: 100 };
  guardStep(tracker, guard, 1 / 60); guard.position = [5, 0];
  assert.equal(guardStep(tracker, guard, 1 / 60), null);
});

test('stage C: ambience follows inside, time of day and weather', async () => {
  const { ambienceMix } = await import('../src/sound-plan.js');
  const day = ambienceMix({ indoor: false, time: 'day' }), inside = ambienceMix({ indoor: true, time: 'day' });
  assert.equal(day.call.sound, 'bird'); assert.equal(day.roomTone, 0);
  assert.ok(inside.roomTone > 0 && inside.wind < day.wind && inside.call.gain < 1);
  assert.equal(ambienceMix({ indoor: false, time: 'night' }).call.sound, 'cricket');
  const rain = ambienceMix({ indoor: true, weather: 'rain' });
  assert.ok(rain.rain > 0 && rain.rainDull > 0 && rain.call === null);
});

test('guards hear footsteps: walking nearby is heard, creeping is not, the rule scales and switches it off, with a cooldown', async () => {
  const { hearFootstep } = await import('../src/combat.js');
  const { courtyard } = await import('../src/maps/courtyard.js');
  const setup = rules => {
    const state = createMission(courtyard, { ...rules, guardCount: 1 }); state.status = 'active';
    const guard = state.guards[0];
    // Stand the player 2 m from the guard in the open.
    return { state, guard, feet: [guard.position[0] + 2, guard.elevation ?? 0, guard.position[1]] };
  };
  let { state, guard, feet } = setup(defaults);
  assert.equal(hearFootstep(state, courtyard, defaults, feet, 'walk', 'outdoor'), 1);
  assert.ok(guard.noiseTarget && Math.abs(guard.noiseTarget.position[0] - feet[0]) < 1e-9);
  assert.equal(hearFootstep(state, courtyard, defaults, feet, 'run', 'outdoor'), 0, 'cooldown');
  ({ state, feet } = setup(defaults));
  assert.equal(hearFootstep(state, courtyard, defaults, feet, 'creep', 'outdoor'), 0);
  ({ state, feet } = setup(defaults));
  assert.equal(hearFootstep(state, courtyard, { ...defaults, footstepHearing: 0 }, feet, 'run', 'concrete'), 0);
  ({ state, feet } = setup(defaults));
  assert.equal(hearFootstep(state, courtyard, { ...defaults, footstepHearing: 2 }, feet, 'crouch', 'floor'), 1);
});
