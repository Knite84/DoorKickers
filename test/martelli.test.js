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
  const route = [[677,560],[677,485],[592.5,485],[592.5,610],[537.5,610],[537.5,485],[680,485],[795,485],[795,625],[930,625],[930,755]];
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
    // Primary bedroom, then out its corner door onto the rear deck.
    [[805,485],[805,350],[805,280],[760,280],[760,122],[690,122]],
    // Laundry -> primary closet -> cased opening -> primary bath -> toilet room.
    [[895,485],[895,395],[895,350],[985,350],[985,280],[1068,280],[1068,345]],
    // Bedroom 3 and its own closet.
    [[1030,485],[1030,620],[1120,620]],
    [[1030,485],[1070,485],[1070,410]],
    // Bedroom 2 -> vanity -> toilet/tub -> vanity -> pocket door into Bedroom 3.
    [[886,485],[886,560],[886,650],[886,750],[942,750],[942,650],[942,555],[960,568],[1040,568]],
    // Bedroom 2's closet is entered from the bedroom.
    [[886,485],[886,560],[886,625],[775,625],[775,550]],
    [[805,485],[805,393],[750,393]],
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
test('the aligned foundation bedrooms, baths and closets remain reachable from the stairs',()=>{
  const state=ready();
  [[677,560],[677,485],[592.5,485],[592.5,610],[537.5,610],[537.5,485],[680,485]].forEach(([x,z])=>walk(state,x,z));
  assert.equal(state.playerY,0);
  const branches=[
    // Bedroom 5 and the closet behind its own door.
    [[680,470],[913,470],[913,320],[913,250],[759,250],[759,340]],
    // Bedroom 4 from the hall, then its closet and bath.
    [[680,470],[913,470],[913,322],[1000,322],[1014,322],[1014,400]],
    [[680,470],[913,470],[913,322],[1000,322],[1107,322],[1107,420]],
    // Bedroom 5's bath opens onto the hall.
    [[680,470],[913,470],[913,375],[850,375]],
    // Mechanical door from the hall into storage.
    [[680,470],[913,470],[913,480],[1000,480]],
    // Wet bar through the arch, and the alcove beside the stairs.
    [[480,440],[340,440]],
    [[478,485],[478,560]],
  ];
  for(const branch of branches){branch.forEach(([x,z])=>walk(state,x,z));[...branch].reverse().forEach(([x,z])=>walk(state,x,z));walk(state,680,485);}
});
test('rooms the plan closes off stay closed: no spurious openings between neighbours',()=>{
  const state=ready();
  const sealed=(a,b,y)=>assert.equal(segmentClear(state,martelli,[...point(...a)].flatMap((v,i)=>i?[y+1.2,v]:[v]),[...point(...b)].flatMap((v,i)=>i?[y+1.2,v]:[v]),-1,{glass:false}),false,`${a} sees ${b}`);
  sealed([690,430],[750,430],3.2);   // great room / powder room
  sealed([690,550],[760,550],3.2);   // entry / Bedroom 2 closet
  sealed([983,485],[983,420],3.2);   // bedroom hall / primary closet
  sealed([1010,410],[1085,410],3.2); // primary closet / Bedroom 3 closet
  sealed([886,620],[960,620],3.2);   // hall stub side of the shared bath
  sealed([690,372],[750,372],0);     // family room / Bedroom 5 closet
  sealed([913,440],[1000,440],0);    // lower hall / Bedroom 4 closet
});
test('stair guard rails stop movement but leave sight lines open above them',()=>{
  const state=ready();
  const eye=([x,z],y)=>[x,y,z];
  assert.equal(segmentClear(state,martelli,eye(point(660,550),4.7),eye(point(592.5,550),4.7),-1,{glass:false}),true);
  assert.equal(segmentClear(state,martelli,eye(point(660,550),3.7),eye(point(592.5,550),3.7),-1,{glass:false}),false);
});
