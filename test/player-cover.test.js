import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission, stepMission, canSee } from '../src/simulation.js';
import { togglePlayerCover, setPlayerPeek, leavePlayerCover } from '../src/player-cover.js';
import { playerEye, eyeHeight, bodyHeight } from '../src/world.js';
import { coverClear, fireGuardShot } from '../src/guard-tactics.js';
import { fireWeapon } from '../src/weapons.js';
import { equip } from '../src/kit.js';

const rules={...defaults,guardCount:1,awareness:3,patrolSpeed:0,sightRange:16,guardDamage:10};
const low={...courtyard,bounds:{minX:-8,maxX:8,minZ:-7,maxZ:7},walls:[],doors:[],props:[{kind:'crate',position:[0,0],size:[1,3]}],patrols:[[[4,0],[5,0]]]};
function ready(map=low){const state=createMission(map,rules);state.status='active';state.player=[-1,0];state.facing=[1,0];state.guards[0].heading=Math.PI;return state;}
const tick=(state,map=low,input={x:0,z:0})=>stepMission(state,map,rules,.05,input);
test('Q takes nearby cover, holding peek exposes you, releasing hides and blocks firing',()=>{
  const state=ready(); equip(state,'pistol');
  assert.match(togglePlayerCover(state,low),/in cover/i);
  const anchor=[...state.player],ammo=state.ammo;
  assert.equal(eyeHeight(state),.85);assert.equal(bodyHeight(state),1.08);
  assert.equal(fireWeapon(state,low,rules,playerEye(state),[1,0,0]),null);assert.equal(state.ammo,ammo);
  assert.equal(setPlayerPeek(state,low,true),true);assert.equal(eyeHeight(state),1.65);
  const shot=fireWeapon(state,low,rules,playerEye(state),[1,0,0]);
  assert.ok(shot);assert.deepEqual(shot.origin,playerEye(state));assert.equal(state.ammo,ammo-1);
  setPlayerPeek(state,low,false);
  assert.equal(eyeHeight(state),.85);assert.deepEqual(state.player,anchor);
  assert.equal(fireWeapon(state,low,rules,playerEye(state),[1,0,0]),null);
});
test('solid cover stops enemy fire while popping up exposes a damageable player',()=>{
  const state=ready(),guard=state.guards[0];togglePlayerCover(state,low);
  assert.equal(coverClear(state,low,[4,1.65,0],playerEye(state)),false);
  fireGuardShot(state,low,rules,guard);assert.equal(state.health,100);assert.equal(state.events.at(-1).hitPlayer,false);
  setPlayerPeek(state,low,true);
  assert.equal(coverClear(state,low,[4,1.65,0],playerEye(state)),true);
  fireGuardShot(state,low,rules,guard);assert.equal(state.health,90);assert.equal(state.events.at(-1).hitPlayer,true);
  setPlayerPeek(state,low,false);fireGuardShot(state,low,rules,guard);assert.equal(state.health,90);
});
test('tall cover peeks around an edge; the camera, guards and bullets use the exposed position',()=>{
  const wall={...low,props:[],walls:[{center:[0,1.5],size:[.4,3]}]};
  const state=ready(wall);state.player=[-.7,.2];state.guards[0].position=[4,0];
  togglePlayerCover(state,wall);
  assert.equal(coverClear(state,wall,[4,1.65,0],playerEye(state)),false);
  assert.equal(setPlayerPeek(state,wall,true),true);
  const exposed=playerEye(state);assert.ok(exposed[2]<0);assert.equal(state.player[1],.2);
  assert.ok(canSee(state.guards[0],state.player,rules,[],{state,map:wall}));
  fireGuardShot(state,wall,rules,state.guards[0]);assert.equal(state.health,90);
  assert.deepEqual(state.guards[0].aimTarget,exposed);
  setPlayerPeek(state,wall,false);assert.equal(playerEye(state)[2],.2);
});
test('a long wall or low ceiling blocks an unsafe peek without spending ammo',()=>{
  const wall={...low,props:[],walls:[{center:[0,0],size:[.4,10]}]},state=ready(wall);
  togglePlayerCover(state,wall);assert.equal(setPlayerPeek(state,wall,true),false);assert.equal(state.playerCover.blocked,true);
  const ammo=state.ammo;assert.equal(fireWeapon(state,wall,rules,playerEye(state),[1,0,0]),null);assert.equal(state.ammo,ammo);
  const ceiling={...low,walls:[{center:[-1,0],size:[2,3],elevation:1.3,height:.25}]},under=ready(ceiling);
  under.crouched=true;togglePlayerCover(under,ceiling);
  assert.ok(under.playerCover);assert.equal(setPlayerPeek(under,ceiling,true),false);
  assert.equal(under.playerCover.peeking,false);
});
test('movement exits cover; crouched posture survives it; opened doors and breached walls release cover',()=>{
  const state=ready();state.crouched=true;togglePlayerCover(state,low);tick(state,low,{x:0,z:1,peek:true});
  assert.equal(state.playerCover,null);assert.equal(state.crouched,true);assert.ok(state.player[1]>0);
  const wall={...low,props:[],walls:[{center:[0,0],size:[.4,4]}]},breach=ready(wall);
  togglePlayerCover(breach,wall);for(const piece of breach.wallPieces)piece.hp=0;tick(breach,wall);assert.equal(breach.playerCover,null);
  const door={...low,props:[],doors:[{position:[0,0],size:[.3,3]}]},opened=ready(door);
  togglePlayerCover(opened,door);assert.ok(opened.playerCover);opened.doors[0]=true;tick(opened,door);assert.equal(opened.playerCover,null);
});
test('cover requires proximity and facing, respects elevation and never grants immunity',()=>{
  const state=ready();state.facing=[-1,0];assert.match(togglePlayerCover(state,low),/no nearby/i);assert.equal(state.playerCover,undefined);
  state.facing=[1,0];state.player=[-3,0];assert.match(togglePlayerCover(state,low),/no nearby/i);
  const upper={...low,props:[{...low.props[0],elevation:3.2}],floors:[{center:[0,0],size:[10,10],elevation:3.2}],levels:[{elevation:0},{elevation:3.2}]},up=ready(upper);
  assert.match(togglePlayerCover(up,upper),/no nearby/i);
  up.playerY=3.2;assert.match(togglePlayerCover(up,upper),/in cover/i);assert.equal(eyeHeight(up),4.05);setPlayerPeek(up,upper,true);assert.ok(Math.abs(eyeHeight(up)-4.85)<1e-8);
  const flank=ready();togglePlayerCover(flank,low);flank.guards[0].position=[-4,0];flank.guards[0].heading=0;
  fireGuardShot(flank,low,rules,flank.guards[0]);assert.equal(flank.health,90,'an enemy behind you can still hit you in cover');
});
test('key release returns to cover even when paused, and deployment clears the cover stance',()=>{
  const state=ready();togglePlayerCover(state,low);setPlayerPeek(state,low,true);state.status='paused';
  setPlayerPeek(state,low,false);assert.equal(eyeHeight(state),.85);
  const before=structuredClone(state.playerCover);tick(state);assert.deepEqual(state.playerCover,before);
  leavePlayerCover(state,low);assert.equal(state.playerCover,null);
  assert.equal(createMission(low,rules).playerCover,undefined);
});
