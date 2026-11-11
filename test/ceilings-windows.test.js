import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maps } from '../src/maps/index.js';
import { martelli } from '../src/maps/martelli.js';
import { courtyard } from '../src/maps/courtyard.js';
import { createMission, interact, obstacles, intersectsBox, stepMission, movePlayer } from '../src/simulation.js';
import { buildWallPieces, rayBox, removeUnsupportedPieces } from '../src/destruction.js';
import { segmentClear } from '../src/combat.js';
import { defaults } from '../src/rules.js';
import { supportHeight } from '../src/world.js';
const rules={...defaults,guardCount:0,awareness:0,invulnerable:true};
function ready(map){const state=createMission(map,rules);state.status='active';return state;}
const clear=(state,map)=>!obstacles(map,state.doors,state.wallPieces,true,state.playerY,state.crouched?1.1:1.8,state.windowHealth).some(b=>intersectsBox(state.player,state.player,b,.28));

test('every building has supported ceiling geometry that blocks sight and shots above rooms',()=>{
  for(const map of Object.values(maps)){
    const state=ready(map),ceilings=state.wallPieces.filter(p=>p.ceiling);
    assert.ok(ceilings.length>0,map.name);
    const piece=ceilings.find(p=>p.level===(map.levels?.length??1)-1),[x,y,z]=piece.center;
    assert.equal(segmentClear(state,map,[x,y-.5,z],[x,y+.5,z]),false,map.name);
    assert.ok(rayBox([x,y-.5,z],[0,1,0],piece.center,piece.size)!==null);
    assert.ok(map.ceilings.every(c=>c.size.every(v=>v>0)));
    assert.equal(removeUnsupportedPieces(state.wallPieces).filter(p=>p.ceiling).length,0,`unsupported ceiling in ${map.name}`);
  }
});
test('short facade pieces keep their authored direction instead of protruding across openings',()=>{
  const map={...courtyard,ceilings:[],walls:[{center:[1,2],size:[.28,.08],axis:'z'}],doors:[],props:[]};
  const pieces=buildWallPieces(map);
  assert.ok(pieces.every(p=>Math.abs(p.center[0]-1)<1e-9));
  assert.ok(pieces.every(p=>Math.abs(p.center[2]-2)+p.size[2]/2<=.040001));
});
test('all 15 climbable Martelli windows work both ways, crouched and standing, without landing in walls',()=>{
  let count=0;
  for(const [index,window] of martelli.windows.entries()){
    if(window.climbable===false)continue;
    count++;
    for(const side of [-1,1])for(const crouched of [false,true])for(const tangent of [-.12,.12]){
      const state=ready(martelli),axis=window.size[0]<window.size[1]?0:1;
      state.windowHealth[index]=0;state.player=[...window.position];state.player[axis]+=side*.65;state.player[1-axis]+=tangent;
      state.playerY=window.elevation;state.crouched=crouched;state.facing=axis===0?[-side,0]:[0,-side];
      assert.ok(clear(state,martelli),`invalid source window ${index}`);
      const sourceSide=Math.sign(state.player[axis]-window.position[axis]);
      assert.match(interact(state,martelli),/climbed/i,`window ${index}, side ${side}, crouched ${crouched}`);
      assert.equal(Math.sign(state.player[axis]-window.position[axis]),-sourceSide);
      assert.ok(clear(state,martelli),`blocked landing window ${index}`);
      state.facing=axis===0?[side,0]:[0,side];
      assert.match(interact(state,martelli),/climbed/i,`return through window ${index}`);
      assert.ok(clear(state,martelli));
    }
  }
  assert.equal(count,15);
});
test('windows with supported ground on both sides remain usable after physics ticks',()=>{
  for(const [index,window] of martelli.windows.entries()){
    if(window.climbable===false)continue;
    const state=ready(martelli),axis=window.size[0]<window.size[1]?0:1;
    const sides=[-1,1].map(side=>{const p=[...window.position];p[axis]+=side*.65;return p;});
    if(sides.some(p=>Math.abs(supportHeight(state,martelli,p,window.elevation+.15)-window.elevation)>.15))continue;
    state.windowHealth[index]=0;state.player=sides[0];state.playerY=window.elevation;
    for(let cycle=0;cycle<8;cycle++){
      state.facing=axis===0?[Math.sign(window.position[axis]-state.player[axis]),0]:[0,Math.sign(window.position[axis]-state.player[axis])];
      assert.match(interact(state,martelli),/climbed/i);
      for(let step=0;step<3;step++)stepMission(state,martelli,rules,.025,{x:0,z:0});
      assert.ok(Math.abs(state.playerY-window.elevation)<.02,`floor mismatch window ${index}`);
      assert.ok(clear(state,martelli));
    }
  }
});
const paneMap={...courtyard,ceilings:[],walls:[{center:[0,0],size:[.2,3],height:.8},{center:[0,0],size:[.2,3],elevation:2.3,height:.5}],doors:[],props:[],windows:[{position:[0,0],size:[.08,2],sill:.8,height:1.5}]};
test('a clear endpoint cannot teleport a window climber through a second wall',()=>{
  const map={...paneMap,walls:[...paneMap.walls,{center:[.4,0],size:[.2,3],elevation:.8,height:2}]},state=ready(map);
  state.player=[-.65,0];state.facing=[1,0];state.windowHealth[0]=0;
  assert.match(interact(state,map),/blocked/i);assert.deepEqual(state.player,[-.65,0]);
});
test('E chooses the closer faced window instead of a nearby unrelated door',()=>{
  const map={...paneMap,doors:[{position:[-.8,1.4],size:[.2,.8]}]},state=ready(map);
  state.player=[-.8,0];state.facing=[1,0];state.windowHealth[0]=0;
  assert.match(interact(state,map),/climbed/i);assert.equal(state.doors[0],false);
});
test('intact panes, obstructed headroom, unsafe stairwell landings and real drops report correctly',()=>{
  const state=ready(paneMap);state.player=[-.65,0];state.facing=[1,0];assert.match(interact(state,paneMap),/intact/i);
  const low={...paneMap,ceilings:[{center:[0,0],size:[4,4],elevation:1.5,level:0}]},under=ready(low);under.player=[-.65,0];under.facing=[1,0];under.crouched=true;under.windowHealth[0]=0;
  assert.match(interact(under,low),/blocked/i);
  const stair=martelli.windows.findIndex(w=>w.climbable===false),window=martelli.windows[stair],stairs=ready(martelli);
  stairs.player=[window.position[0],window.position[1]+.65];stairs.playerY=window.elevation;stairs.facing=[0,-1];stairs.windowHealth[stair]=0;
  assert.match(interact(stairs,martelli),/no level landing/i);
  const index=martelli.windows.findIndex(w=>w.elevation===3.2&&w.position[1]<-8),high=martelli.windows[index],drop=ready(martelli);
  drop.player=[high.position[0],high.position[1]+.65];drop.playerY=3.2;drop.facing=[0,-1];drop.windowHealth[index]=0;
  assert.match(interact(drop,martelli),/drop/i);
});
test('Martelli cellar storage has no yard blocks embedded inside its usable footprint',()=>{
  const state=ready(martelli);
  for(const [x,z] of [[1100,550],[930,755],[960,750],[1160,610]]){
    const p=[(x-600)*.02,(z-500)*.02];
    assert.ok(!obstacles(martelli,state.doors,state.wallPieces,true,0).some(b=>intersectsBox(p,p,b,.25)),`embedded yard or wall at ${x},${z}`);
    assert.notDeepEqual(movePlayer(p,[.03,0],martelli,state.doors,false,state.wallPieces),p);
  }
});
