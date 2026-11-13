import { test } from 'node:test';
import assert from 'node:assert/strict';
import { martelli } from '../src/maps/martelli.js';
import { resolveMap } from '../src/maps/index.js';
import { createMission, stepMission, interact, obstacles, intersectsBox } from '../src/simulation.js';
import { defaults } from '../src/rules.js';
import { supportHeight, propHeight } from '../src/world.js';
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
  const route = [[677,560],[677,485],[592.5,485],[592.5,610],[537.5,610],[537.5,485],[680,485],[913,470],[913,480],[1000,480],[1010,520],[1030,580],[1150,590]];
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
    [[805,485],[805,350],[805,280],[775,280],[775,122],[690,122]],
    // Laundry -> primary closet -> cased opening -> primary bath -> toilet room.
    [[895,485],[895,395],[895,350],[985,350],[985,295],[1068,295],[1068,345]],
    // Bedroom 3 and its own closet.
    [[1030,485],[1045,620],[1120,620]],
    [[1030,485],[1070,485],[1070,420]],
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
test('the player can pass the dining chairs, the fridge and the family-room sectional in both directions', () => {
  const state = ready();
  state.player = point(451,280);
  walk(state,451,242);
  walk(state,451,280);

  // Squeeze between the island and the fridge into the great room (owner).
  state.player = point(330,457);
  walk(state,470,457);
  walk(state,330,457);

  state.player = point(460,445);
  state.playerY = 0;
  walk(state,460,350);
  walk(state,460,445);
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
test('Bedroom 4 bath is sealed from storage and beds are low furniture',()=>{
  const state=ready();
  const at=([x,z],y)=>[x,y,z];
  assert.equal(segmentClear(state,martelli,at(point(1100,480),1.2),at(point(1165,480),1.2),-1,{glass:false}),false);
  assert.equal(segmentClear(state,martelli,at(point(1100,480),1.2),at(point(1100,540),1.2),-1,{glass:false}),false);
  const beds=martelli.props.filter(p=>p.kind==='bed');
  assert.equal(beds.length,5); assert.ok(beds.every(b=>propHeight(b)<=(({bunk:1.7,daybed:0.8})[b.variant]??0.6)));
});
test('every Martelli prop and decor piece sits on one of the map floors', () => {
  const floors = martelli.levels.map(level => level.elevation);
  for (const prop of [...martelli.props, ...(martelli.decor ?? [])])
    assert.ok(floors.includes(prop.elevation ?? 0), `${prop.kind}/${prop.variant} at ${prop.position} has elevation ${prop.elevation}`);
});
test('only the two garage doors are drawn as overhead doors without a lever', () => {
  const garage = martelli.doors.filter(door => door.garage);
  assert.equal(garage.length, 2);
  // The 4.9 m and 3.0 m openings on the garage's outside walls.
  assert.deepEqual(garage.map(door => Math.round(Math.max(...door.size) * 10) / 10).sort(), [3, 4.9]);
});
test('Martelli doors stop short of the ceiling under a wall header', () => {
  for (const door of martelli.doors) {
    assert.equal(door.height, door.garage ? 2.13 : 2.03);
    const header = martelli.walls.find(wall => Math.abs(wall.elevation - (door.elevation + door.height)) < 1e-9
      && Math.abs(wall.center[0] - door.position[0]) < 1e-6 && Math.abs(wall.center[1] - door.position[1]) < 1e-6);
    assert.ok(header, `no header over the door at ${door.position}`);
  }
});

// --- Step 4.4: great-room windows and the garage (owner's answers, 2026-11-12)
const FLOOR = 3.2 - 0.72;
test('the great room has three lake windows; only the one with clear floor behind it is climbable', () => {
  const lake = martelli.windows.filter(w => w.elevation === 3.2 && Math.abs(w.position[1] - point(0, 198)[1]) < 0.01);
  assert.equal(lake.length, 3);
  assert.deepEqual(lake.map(w => w.climbable !== false), [true, false, false]);
  assert.ok(lake.filter(w => w.climbable === false).every(w => /sectional|table/.test(w.climbReason)));
});

test('the garage floor is four steps (0.72 m) below Main, with Main-level doors on steps', () => {
  const floorTops = martelli.floors.filter(f => f.material === 'concrete' && Math.abs(f.elevation - FLOOR) < 1e-9);
  assert.equal(floorTops.length, 5);
  const overhead = martelli.doors.filter(d => d.garage), others = martelli.doors.filter(d => !d.garage && d.elevation > 2 && d.elevation < 3.3 && d.position[0] < point(260, 0)[0] + 0.1);
  assert.equal(overhead.length, 2);
  assert.ok(overhead.every(d => Math.abs(d.elevation - FLOOR) < 1e-9), 'overhead doors stand on the garage floor');
  const sill = martelli.doors.filter(d => d.elevation === 3.2 && d.position[0] < point(520, 0)[0] && d.position[1] > point(0, 470)[1] && d.position[1] < point(0, 600)[1]);
  assert.equal(sill.length, 2, 'the side door and the mudroom door');
  const garageStairs = martelli.stairs.filter(s => s.bottom === FLOOR && s.top === 3.2);
  assert.equal(garageStairs.length, 2);
  assert.ok(garageStairs.every(s => s.steps === 4 && (s.top - s.bottom) / s.steps < 0.2));
  assert.ok(martelli.slopes.filter(s => s.paving).length === 2 && martelli.slopes.filter(s => s.paving).every(s => s.bottom === FLOOR && s.top === 3.2));
  assert.ok(others.length >= 0);
  // Garage walls rise from the lowered floor to the same wall top as the rest of Main (6.0 m).
  const garageWalls = martelli.walls.filter(w => Math.abs(w.elevation - FLOOR) < 1e-9 || (w.elevation > FLOOR && w.elevation < 3.2 + 1e-9 && w.elevation !== 3.2 && w.elevation !== 0));
  assert.ok(garageWalls.length >= 12);
  assert.ok(garageWalls.filter(w => Math.abs(w.elevation + w.height - 6.0) < 1e-6).length >= 12, 'garage wall tops reach 6.0 m');
  assert.ok(garageWalls.every(w => w.elevation + w.height <= 6.0 + 1e-6));
});

test('the garage can be walked in from the driveway and out by the mudroom and side doors', () => {
  const state = ready();
  state.player = point(145, 1150); state.playerY = 3.2;
  walk(state, 110, 1000); walk(state, 110, 850); walk(state, 300, 720);
  assert.ok(Math.abs(state.playerY - FLOOR) < 0.05, 'standing on the garage floor');
  walk(state, 480, 700); walk(state, 480, 550);              // up the mudroom steps
  assert.ok(Math.abs(state.playerY - 3.2) < 0.05);
  walk(state, 480, 700); walk(state, 300, 720); walk(state, 149, 560); walk(state, 149, 440); // up the side steps and out
  assert.ok(Math.abs(state.playerY - 3.2) < 0.05);
});

test('the stair landing is walled off from the garage from the foundation floor to the Main ceiling', () => {
  // Owner report, 2026-11-12: the landing's garage side (plan x 510, z 590 to 646) was open,
  // showing the garage and the dark space under its slab from the stairs.
  const pz = v => v / 0.02 + 500, px = v => v / 0.02 + 600;
  const side = martelli.walls.filter(w => Math.abs(px(w.center[0]) - 510) < 1 && pz(w.center[1] - w.size[1] / 2) <= 591 && pz(w.center[1] + w.size[1] / 2) >= 645);
  const spans = side.map(w => [w.elevation, w.elevation + w.height]).sort((a, b) => a[0] - b[0]);
  assert.ok(spans.length >= 1 && Math.abs(spans[0][0]) < 1e-9, JSON.stringify(spans));
  let top = spans[0][1];
  for (const [low, high] of spans.slice(1)) { assert.ok(low <= top + 1e-6, 'no gap between wall pieces'); top = Math.max(top, high); }
  assert.ok(top >= 3.2 + 2.8 - 1e-6, `wall reaches ${top}`);
});
