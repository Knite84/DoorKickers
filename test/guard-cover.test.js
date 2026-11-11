import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission, obstacles, intersectsBox } from '../src/simulation.js';
import { damageGuard } from '../src/combat.js';
import { coverClear, findWoundedCover, fireGuardShot } from '../src/guard-tactics.js';
import { guardEye, guardPose, hitGuard } from '../src/npc-body.js';
import { equip } from '../src/kit.js';
import { findGuardPath } from '../src/navigation.js';

const map={...courtyard,bounds:{minX:-9,maxX:9,minZ:-8,maxZ:8},walls:[{center:[1,1.5],size:[0.4,3]}],doors:[],props:[],patrols:[[[3,-2],[4,-2]]]};
const rules={...defaults,guardCount:1,awareness:3,patrolSpeed:2,sightRange:16,invulnerable:true};
function ready(layout=map,injury={zone:'leftArm'}) {
  const state=createMission(layout,rules); state.status='active'; state.player=[-5,0];
  const guard=state.guards[0]; guard.heading=Math.PI; guard.suspicion=1;
  damageGuard(state,guard,25,injury);
  return state;
}
const tick=(state,layout=map,dt=.05)=>stepMission(state,layout,rules,dt,{x:0,z:0});
test('a mobile wounded guard retreats along a real route, hides and occasionally peeks to fire',()=>{
  const state=ready(),guard=state.guards[0],start=[...guard.position];
  const phases=new Set(),shots=[],hiddenFrames=[];
  for(let i=0;i<360;i++) {
    state.events=[]; tick(state); phases.add(guard.mode);
    for(const event of state.events) if(event.type==='guard-shot') shots.push({time:state.elapsed,mode:guard.mode,event});
    if(guard.mode==='cover') {
      hiddenFrames.push(i);
      assert.equal(guard.aimTarget,null);
      assert.equal(coverClear(state,map,guard.woundThreat,guardEye(guard)),false);
      assert.equal(guard.duck,1);
    }
    assert.equal(obstacles(map,state.doors,state.wallPieces,true,guard.elevation).some(box=>intersectsBox(guard.position,guard.position,box,.26)),false,'retreat must not cross walls');
  }
  assert.notDeepEqual(guard.position,start);
  assert.ok(phases.has('retreat')); assert.ok(phases.has('cover')); assert.ok(phases.has('peek'));
  assert.ok(hiddenFrames.length>100);
  assert.ok(shots.length>=2 && shots.length<=5,`expected occasional shots, got ${shots.length}`);
  assert.ok(shots.every(s=>s.mode==='peek'));
  assert.ok(shots.slice(1).every((s,i)=>s.time-shots[i].time>2.5));
});
test('low props provide crouched cover and foliage hides without stopping high bullets',()=>{
  const low={...map,walls:[],props:[{kind:'crate',position:[0,0],size:[1,3]}]};
  const state=ready(low),guard=state.guards[0];
  const cover=findWoundedCover(state,low,guard);
  assert.ok(cover); assert.ok(cover.peek);
  assert.equal(coverClear(state,low,guard.woundThreat,[cover.position[0],.85,cover.position[1]]),false);
  assert.equal(coverClear(state,low,guard.woundThreat,[cover.position[0],1.65,cover.position[1]]),true);
  const plants={...low,props:[{...low.props[0],kind:'planter'}]};
  assert.equal(coverClear(state,plants,[-5,1.65,0],[3,1.65,0]),false);
  assert.equal(coverClear(state,plants,[-5,1.65,0],[3,1.65,0],false),true);
});
test('destroyed cover is abandoned, and absence of reachable cover makes a guard retreat away',()=>{
  const state=ready(),guard=state.guards[0];
  for(let i=0;i<160 && guard.mode!=='cover';i++) tick(state);
  assert.equal(guard.mode,'cover');
  for(const piece of state.wallPieces) piece.hp=0;
  tick(state); assert.notEqual(guard.mode,'cover'); assert.equal(guard.cover,null);
  const open={...map,walls:[]},outside=ready(open),g=outside.guards[0];
  const initial=Math.hypot(g.position[0]+5,g.position[1]);
  for(let i=0;i<40;i++) tick(outside,open);
  assert.equal(g.mode,'retreat');
  assert.ok(Math.hypot(g.position[0]+5,g.position[1])>initial);
});
test('leaning exposes the shared hittable upper body while legs remain at cover',()=>{
  const state=ready(),guard=state.guards[0];
  for(let i=0;i<260 && guard.mode!=='peek';i++) tick(state);
  assert.equal(guard.mode,'peek');
  assert.ok(Math.hypot(...guard.lean)>0,'wall cover uses a sideways lean');
  const pose=guardPose(guard),target=pose.head,origin=[-5,target[1],0];
  const offset=target.map((v,i)=>v-origin[i]),length=Math.hypot(...offset);
  assert.equal(hitGuard(guard,origin,offset.map(v=>v/length)).zone,'head');
  assert.ok(Math.hypot(pose.pelvis[0]-guard.position[0],pose.pelvis[2]-guard.position[1])<Math.hypot(...guard.lean));
});
test('injury dispersion causes real misses, worsens with wounds and respects solid cover',()=>{
  const open={...map,walls:[]},sample=(health,injuries={})=>{
    const state=createMission(open,rules); state.status='active'; state.player=[-7,0];
    const guard=state.guards[0]; guard.position=[3,0]; guard.heading=Math.PI; guard.health=health; guard.wounded=health<100; guard.injuries=injuries;
    let hits=0,error=0;
    for(let i=0;i<200;i++) {fireGuardShot(state,open,rules,guard);hits+=Number(state.events.at(-1).hitPlayer);error+=Math.abs(guard.aimTarget[1]-1.65)+Math.abs(guard.aimTarget[2]);}
    return {hits,error};
  };
  const healthy=sample(100),light=sample(90),severe=sample(20,{leftArm:1});
  assert.equal(healthy.hits,200); assert.ok(light.hits<healthy.hits); assert.ok(severe.hits<light.hits); assert.ok(severe.error>light.error*2);
  const state=ready(),guard=state.guards[0]; guard.position=[3,1.5]; state.player=[-5,1.5];
  for(let i=0;i<20;i++) fireGuardShot(state,map,{...rules,invulnerable:false},guard);
  assert.equal(state.health,100); assert.ok(state.events.filter(e=>e.type==='guard-shot').every(e=>!e.hitPlayer));
});
test('unarmed targets, stun, incapacitation and pause suppress cover fire; deployment clears wounds',()=>{
  const state=ready(),guard=state.guards[0];
  for(let i=0;i<160 && guard.mode!=='cover';i++) tick(state);
  state.status='paused'; const before=structuredClone(guard); tick(state); assert.deepEqual(guard,before);
  state.status='active'; equip(state,'unarmed'); state.events=[];
  for(let i=0;i<120;i++) tick(state);
  assert.ok(!state.events.some(e=>e.type==='guard-shot'));
  guard.stunnedUntil=state.elapsed+2; state.events=[]; tick(state); assert.equal(guard.mode,'stunned'); assert.equal(guard.aimTarget,null);
  damageGuard(state,guard,1,{zone:'chest'}); tick(state); assert.ok(guard.incapacitated); assert.equal(guard.aimTarget,null);
  const fresh=createMission(map,rules).guards[0]; assert.equal(fresh.cover,undefined); assert.equal(fresh.wounded,undefined);
});
test('cover selection respects sealed rooms and floor elevation',()=>{
  const sealed={...map,walls:[
    {center:[0,0],size:[.4,4]},{center:[2,0],size:[.4,4]},
    {center:[1,-2],size:[2,.4]},{center:[1,2],size:[2,.4]},
  ]};
  const state=ready(sealed),guard=state.guards[0],cover=findWoundedCover(state,sealed,guard);
  assert.ok(cover);
  assert.ok(!(cover.position[0]>.2&&cover.position[0]<1.8&&Math.abs(cover.position[1])<1.8),'sealed interior cannot be selected');
  const path=findGuardPath(state,sealed,guard.position,0,cover.position,0);
  assert.ok(path.length);
  assert.ok(Math.hypot(...path.at(-1).position.map((v,i)=>v-cover.position[i]))<.35);
  const upper={...map,walls:[{center:[1,1.5],size:[.4,3],elevation:3.2}],levels:[{elevation:0},{elevation:3.2}],floors:[{center:[1,1.5],size:[6,6],elevation:3.2}]};
  const lower=ready(upper);
  assert.equal(findWoundedCover(lower,upper,lower.guards[0]),null,'cover on another story does not hide a ground-floor guard');
});
test('a hiding guard keeps the last observed threat rather than tracking through a wall',()=>{
  const state=ready(),guard=state.guards[0];
  for(let i=0;i<160&&guard.mode!=='cover';i++) tick(state);
  const remembered=[...guard.woundThreat];
  state.player=[-6,2];
  for(let i=0;i<8;i++) tick(state);
  assert.deepEqual(guard.woundThreat,remembered);
  assert.equal(guard.aimTarget,null);
});
