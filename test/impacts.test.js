import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { partitions } from '../src/maps/partitions.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { equip } from '../src/kit.js';
import { fireWeapon } from '../src/weapons.js';
import { boxFaces, effectClass, shotMarks, blastMarks, breakEffect, recipes, markCells } from '../src/impacts.js';

const mission = map => { const state = createMission(map, { ...defaults, guardCount: 0 }); state.status = 'active'; return state; };
const point = (x, z) => [(x - 600) * 0.02, (z - 500) * 0.02];

test('a ray enters and leaves a box on the faces it crosses, with outward normals', () => {
  const faces = boxFaces([0, 1, -5], [0, 0, 1], [0, 1, 0], [1, 1, 0.2]);
  assert.deepEqual(faces.entry.normal, [0, 0, -1]);
  assert.deepEqual(faces.exit.normal, [0, 0, 1]);
  assert.ok(Math.abs(faces.entry.point[2] + 0.1) < 1e-9 && Math.abs(faces.exit.point[2] - 0.1) < 1e-9);
  assert.equal(boxFaces([5, 1, -5], [0, 0, 1], [0, 1, 0], [1, 1, 0.2]), null);
});

test('every effect class has a recipe and every mark cell is in the atlas', () => {
  for (const [name, recipe] of Object.entries(recipes)) {
    assert.ok(recipe.chips || recipe.puff || recipe.sparks, name);
    if (recipe.mark) assert.ok(markCells.includes(recipe.mark.cell), `${name} mark cell`);
  }
  assert.ok(markCells.includes('blood') && markCells.includes('scorch'));
});

test('furniture and decor map to the material they are made of', () => {
  const index = kind => martelli.props.findIndex(p => p.kind === kind);
  assert.equal(effectClass(martelli, { kind: 'prop', index: index('sofa') }), 'fabric');
  assert.equal(effectClass(martelli, { kind: 'prop', index: index('dresser') }), 'wood');
  assert.equal(effectClass(martelli, { kind: 'prop', index: index('fridge') }), 'metal');
  assert.equal(effectClass(martelli, { kind: 'prop', index: index('toilet') }), 'ceramic');
  assert.equal(effectClass(martelli, { kind: 'guard' }), 'flesh');
  assert.equal(effectClass(martelli, { kind: 'door' }), 'wood');
  assert.equal(effectClass(martelli, { kind: 'wall', material: 'drywall' }), 'drywall');
  assert.equal(breakEffect(martelli, { kind: 'prop', index: index('sofa') }), 'fabric');
});

test('a shot through a partition leaves an entry hole on the near face and an exit hole on the far face, not inside the cavity', () => {
  const state = mission(martelli);
  equip(state, 'rifle'); state.drawStart = undefined;
  // From the stairwell toward the mudroom-side wall (plan x 510) at Main, head height.
  const [x, z] = point(540, 550);
  const shot = fireWeapon(state, martelli, defaults, [x, 4.6, z], [-1, 0, 0]);
  const pellet = shot.pellets[0];
  assert.ok(pellet.impacts.filter(i => i.kind === 'wall' && i.material === 'drywall').length >= 2, JSON.stringify(pellet.impacts.map(i => i.material)));
  const { marks, bursts } = shotMarks(state, martelli, pellet);
  // Only the first wall: the bullet goes on to stop inside the next one, which gets an entry hole only.
  const firstWall = pellet.impacts[0].distance + 0.4;
  const drywall = marks.filter(m => m.cell === 'drywall' && Math.hypot(m.point[0] - x, m.point[2] - z) < firstWall);
  const entry = drywall.find(m => !m.exit), exit = drywall.find(m => m.exit);
  assert.ok(entry && exit, JSON.stringify(drywall));
  assert.equal(marks.filter(m => m.cell === 'drywall').length, 3, 'two at the first wall, one where it stopped');
  assert.deepEqual(entry.normal, [1, 0, 0]); assert.deepEqual(exit.normal, [-1, 0, 0]);
  const gap = entry.point[0] - exit.point[0];
  assert.ok(gap > 0.1 && gap < 0.3, `gap ${gap}`);
  assert.equal(drywall.length, 2, 'no holes inside the cavity');
  assert.ok(drywall.every(m => m.owner.kind === 'piece'));
  assert.ok(bursts.some(b => b.effect === 'drywall'));
});

test('a blast leaves a scorch on the floor and on nearby walls', () => {
  const state = mission(martelli);
  const marks = blastMarks(state, martelli, [point(470, 470)[0], 3.4, point(470, 470)[1]], 4);
  assert.ok(marks.some(m => m.cell === 'scorch' && m.normal[1] === 1));
  assert.ok(marks.every(m => m.cell === 'scorch'));
});

test('shooting a guard sprays blood on the wall behind them', () => {
  const state = mission(martelli);
  const { bloodMarks } = awaitImport;
  const [x, z] = point(540, 550);
  const marks = bloodMarks(state, martelli, [x, 4.6, z], [-1, 0, 0]);
  const wall = marks.find(m => m.owner.kind === 'piece');
  assert.ok(wall, JSON.stringify(marks));
  assert.deepEqual(wall.normal, [1, 0, 0]);
  assert.ok(marks.every(m => m.cell === 'blood'));
});
const awaitImport = await import('../src/impacts.js');
