import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { rayBox } from '../src/destruction.js';
import { fireWeapon } from '../src/weapons.js';
import { equip } from '../src/kit.js';

const map={...courtyard,walls:[{center:[0,0],size:[4,.2],destructible:true}],doors:[],windows:[],props:[],patrols:[],floors:[],ceilings:[]};
test('pistol, rifle and sniper only damage drywall intersected by the bullet',()=>{
  for(const weapon of ['pistol','rifle','sniper']) {
    const state=createMission(map,defaults);state.status='active';equip(state,weapon);
    const origin=[.25,1.1,-2],direction=[0,0,1];
    const drywall=state.wallPieces.filter(p=>p.material==='drywall');
    const adjacent=drywall.filter(p=>rayBox(origin,direction,p.center,p.size)===null);
    fireWeapon(state,map,defaults,origin,direction);
    assert.ok(drywall.some(p=>p.hp<p.maxHp),weapon);
    assert.ok(adjacent.every(p=>p.hp===p.maxHp),weapon);
  }
});
