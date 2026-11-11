import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courtyard } from '../src/maps/courtyard.js';
import { defaults } from '../src/rules.js';
import { createMission } from '../src/simulation.js';
import { weaponStrike } from '../src/equipment.js';
import { equip } from '../src/kit.js';
import { fireWeapon } from '../src/weapons.js';
const map={...courtyard,walls:[],doors:[],windows:[],props:[],patrols:[[[1.3,0],[2,0]]]};
function setup(layout=map){const state=createMission(layout,{...defaults,guardCount:1});state.status='active';return state;}
test('weapon strike damages a nearby enemy without ammunition and enforces cooldown',()=>{
 const state=setup(),ammo=state.ammo;
 assert.equal(weaponStrike(state,map,defaults,[0,1.1,0],[1,0,0]).kind,'guard');
 assert.equal(state.guards[0].health,75);assert.equal(state.ammo,ammo);
 assert.equal(weaponStrike(state,map,defaults,[0,1.1,0],[1,0,0]),null);
 assert.equal(fireWeapon(state,map,defaults,[0,1.1,0],[1,0,0]),null);
 state.elapsed=.7;assert.equal(weaponStrike(state,map,defaults,[0,1.1,0],[1,0,0]).kind,'guard');
});
test('strike respects range, occlusion, equipment and covered stance',()=>{
 const state=setup();assert.equal(weaponStrike(state,map,defaults,[-2,1.1,0],[1,0,0]).kind,'miss');
 state.elapsed=1;equip(state,'knife');assert.equal(weaponStrike(state,map,defaults,[0,1.1,0],[1,0,0]),null);
 equip(state,'rifle');state.playerCover={peeking:false};assert.equal(weaponStrike(state,map,defaults,[0,1.1,0],[1,0,0]),null);
 const blocked={...map,props:[{position:[.6,0],size:[.2,1]}]},other=setup(blocked);
 assert.equal(weaponStrike(other,blocked,defaults,[0,1.1,0],[1,0,0]).kind,'prop');assert.equal(other.guards[0].health,100);
});
