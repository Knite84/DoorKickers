import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { resolveMap } from '../src/maps/index.js';
import { createMission, stepMission, interact, obstacles, intersectsBox } from '../src/simulation.js';
import { defaults } from '../src/rules.js';
import { supportHeight } from '../src/world.js';
import { removeUnsupportedPieces } from '../src/destruction.js';
import { segmentClear } from '../src/combat.js';

const point = (x,z) => [(x-600)*0.02,(z-500)*0.02];
const rules = { ...defaults, guardCount: 0, awareness: 0, invulnerable: true };
function ready(entryPoint = 'courtyard') {
  const state = createMission(martelli, { ...rules, entryPoint });
  state.status = 'active'; return state;
}
function walk(state, x, z) {
  const target = point(x,z);
  for (let i = 0; i < 1500; i++) {
    if (Math.hypot(target[0]-state.player[0],target[1]-state.player[1]) < 0.06 || state.status === 'complete') return;
    martelli.doors.forEach((door,index) => {
      if (Math.abs(door.elevation-state.playerY) < 0.5 && Math.hypot(door.position[0]-state.player[0],door.position[1]-state.player[1]) < 1.4) state.doors[index] = true;
    });
    const before = [...state.player];
    stepMission(state,martelli,rules,0.015,{x:target[0]-state.player[0],z:target[1]-state.player[1]});
    assert.notDeepEqual(state.player,before,`blocked at ${state.player}, y=${state.playerY}, heading to ${x},${z}`);
  }
  assert.fail(`failed to reach ${x},${z}`);
}
test('Martelli is selectable and both exterior starts have main-floor support', () => {
  assert.equal(resolveMap('martelli'),martelli);
  assert.deepEqual(martelli.levels.map(f=>f.name),['Foundation','Main']);
  for (const entryPoint of Object.keys(martelli.entries)) {
    const state = ready(entryPoint);
    stepMission(state,martelli,rules,0.1,{x:0,z:0});
    assert.ok(Math.abs(state.playerY-3.2) < 0.02);
    assert.equal(obstacles(martelli,state.doors,state.wallPieces,true,state.playerY).some(box=>intersectsBox(state.player,state.player,box,0.28)),false);
  }
});
test('walk from outside through Main, down both return flights, collect and extract', () => {
  const state = ready();
  const route = [[677,560],[677,485],[592.5,485],[592.5,610],[537.5,610],[537.5,485],[680,485],[680,545],[795,545],[795,625],[930,625],[930,755]];
  route.forEach(([x,z])=>walk(state,x,z));
  assert.equal(state.playerY,0); assert.match(interact(state,martelli),/secured/i);
  [...route].reverse().forEach(([x,z])=>walk(state,x,z));
  assert.ok(Math.abs(state.playerY-3.2)<0.02);
  walk(state,677,1010); assert.equal(state.status,'complete');
});
test('floor separates stories and the complete stair opening remains clear', () => {
  const state = ready();
  const [x,z] = point(650,350);
  assert.equal(segmentClear(state,martelli,[x,1.65,z],[x,4.85,z],-1,{glass:false}),false);
  assert.equal(supportHeight(state,martelli,point(537.5,490),0),0);
  assert.equal(supportHeight(state,martelli,point(565,610),1.6),1.6);
  assert.equal(removeUnsupportedPieces(state.wallPieces).length,0);
});
test('main bedrooms, service rooms, shared bath and garage have walking access', () => {
  const state = ready();
  walk(state,677,485);
  // Each branch returns to the open bedroom hall before taking the next door.
  const branches = [
    [[805,485],[805,350],[805,280]],
    [[878,485],[878,395]],
    [[983,485],[983,395],[1085,406]],
    [[1030,485],[1030,620],[1120,620]],
    [[880,485],[880,560],[880,650],[880,618],[960,618],[960,750]],
    [[805,485],[805,377],[750,377]],
  ];
  for (const branch of branches) {
    branch.forEach(([x,z])=>walk(state,x,z));
    [...branch].reverse().forEach(([x,z])=>walk(state,x,z));
    walk(state,677,485);
  }
  walk(state,480,485); walk(state,480,550); walk(state,480,700);
});
test('patrol waypoints start clear of walls, furniture and closed doors on both floors', () => {
  const state = ready();
  martelli.patrols.forEach((path,index) => {
    const boxes = obstacles(martelli,state.doors,state.wallPieces,true,martelli.guardElevations[index]);
    path.forEach(position => assert.equal(boxes.some(box=>intersectsBox(position,position,box,0.28)),false,`patrol ${index} obstructed at ${position}`));
  });
});
