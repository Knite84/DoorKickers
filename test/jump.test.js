import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission, jump, stepMission } from '../src/simulation.js';

const map={...courtyard,walls:[],doors:[],floors:[],ceilings:[],stairs:[],props:[{position:[0,0],size:[2,2]}],patrols:[]};
const input={x:0,z:0};
test('jump is grounded, reaches above furniture, lands, and cannot be repeated in the air',()=>{
 const state=createMission(map,defaults); state.status='active'; state.player=[3,0];
 assert.equal(jump(state,map),true); assert.equal(jump(state,map),false);
 let peak=0; for(let i=0;i<120;i++){stepMission(state,map,defaults,.02,input);peak=Math.max(peak,state.playerY);}
 assert.ok(peak>1.1); assert.equal(state.playerY,0); assert.equal(jump(state,map),true);
});
test('falling onto a prop lands on it, and someone embedded in it can move out',()=>{
 const state=createMission(map,defaults);state.status='active';state.player=[0,0];state.playerY=2;
 for(let i=0;i<100;i++)stepMission(state,map,defaults,.02,input);
 assert.equal(state.playerY,1.1); assert.equal(jump(state,map),true);
 state.playerY=0;state.velocityY=0;
 for(let i=0;i<30;i++)stepMission(state,map,defaults,.02,{x:1,z:0});
 assert.ok(state.player[0]>1.28);
});
