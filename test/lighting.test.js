import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLightingModel, defaultRoomLights, lightLevel, cutPower } from '../src/lighting.js';
import { courtyard } from '../src/maps/courtyard.js';
import { martelli } from '../src/maps/martelli.js';
import { affectedLightColumns, captureLightState } from '../src/light-rebake.js';
import { createMission, canSee } from '../src/simulation.js';
import { defaults, validateRules } from '../src/rules.js';
import { defaultLoadout, validateLoadout, equip, toggleHolster } from '../src/kit.js';

test('dusk is a deployment option and reduces available daylight before night', () => {
  const rules = validateRules({ ...defaults, timeOfDay: 'dusk' });
  assert.equal(createMission(courtyard, rules).timeOfDay, 'dusk');
  const sample = { interior: true, daylight: .6, solar: .4, electric: 0 };
  const level = timeOfDay => lightLevel(sample, { timeOfDay, powerOn: false }, { weather: 'clear' });
  assert.ok(level('day') > level('dusk'));
  assert.ok(level('dusk') > level('night'));
});

const map={...courtyard,rooms:[{name:'WINDOW ROOM',center:[0,0],size:[12,8]},{name:'INNER ROOM',center:[0,6],size:[12,4]}],
  walls:[{center:[0,4],size:[12,.3]}],
  windows:[{position:[-6,0],size:[.08,3],elevation:0,sill:.8,height:1.5}],props:[],doors:[]};

test('Martelli room and furniture fixtures share the mission power state', () => {
  const model = createLightingModel(martelli);
  const state = createMission(martelli, { ...defaults, timeOfDay: 'night' });
  state.status = 'active';
  assert.equal(state.destroyedLights.length, model.fixtures.length);
  assert.equal(new Set(model.fixtures.map(fixture => fixture.id)).size, model.fixtures.length);
  for (const { room } of defaultRoomLights(martelli)) {
    assert.ok(model.fixtures.some(fixture => fixture.room === room), room.name);
  }
  const porch = model.sample([2.1, 2.5], 3.2);
  assert.equal(porch.interior, false);
  assert.ok(porch.electric > 0);
  const lit = lightLevel(porch, state);
  assert.ok(cutPower(state));
  assert.ok(lightLevel(porch, state) < lit);
});

test('authored lamps illuminate samples more strongly at fixture height', () => {
  const layout = {
    ...map, walls: [], windows: [],
    fixtures: [{ id: 'lamp', kind: 'lamp', position: [0, 1.5, 0], elevation: 0, strength: 1 }],
  };
  const model = createLightingModel(layout);
  assert.ok(model.sample([0, 0], 0, [], 1.5).electric > model.sample([0, 0], 0, [], 0.2).electric);
  assert.equal(model.sample([0, 0], 0, [true], 1.5).electric, 0);
});

test('live light samples respond to a closed door and removed wall pieces', () => {
  const layout = {
    ...map, walls: [], windows: [],
    doors: [{ position: [1, 0], size: [.15, 1.2], elevation: 0 }],
    fixtures: [{ id: 'lamp', kind: 'lamp', position: [2, 1.2, 0], elevation: 0 }],
  };
  const model = createLightingModel(layout);
  const state = { doors: [false], doorHealth: [100], wallPieces: [] };
  const sample = () => model.sample([0, 0], 0, [], 1.2, state).electric;
  assert.equal(sample(), 0);
  state.doors[0] = true;
  assert.ok(sample() > 0);
  const piece = { center: [1, 1.2, 0], size: [.15, 2.4, 1.2], hp: 100 };
  state.wallPieces = [piece];
  assert.equal(sample(), 0);
  piece.hp = 0;
  assert.ok(sample() > 0);
});

test('rebaking a door and a fixture preserves distant probes and covers both changes', () => {
  const layout = {
    bounds: { minX: 0, minZ: 0 },
    doors: [{ position: [22, 25], size: [.2, 1], elevation: 0 }],
  };
  const fixtures = [{ position: [75, 25, 25] }];
  const grid = { cell: 1, width: 100, depth: 50 };
  const state = { doors: [false], destroyedLights: [false] };
  const published = captureLightState(state);
  state.doors[0] = true;
  state.destroyedLights[0] = true;
  const columns = affectedLightColumns(layout, fixtures, state, published, captureLightState(state), grid);
  assert.equal(columns[25*100+22], 1);
  assert.equal(columns[25*100+40], 1, 'sunlight can reach beyond the local light radius');
  assert.equal(columns[25*100+75], 1);
  assert.equal(columns[25*100+55], 0);
});
test('time-of-day selection validates, survives saved rules and applies to a new deployment',()=>{
  const rules=validateRules({...defaults,timeOfDay:'night'});
  assert.equal(createMission(map,rules).timeOfDay,'night');assert.equal(validateRules({}).timeOfDay,'day');
  assert.throws(()=>validateRules({timeOfDay:'noon'}));
});
test('daylight falls with window distance, walls keep inner rooms substantially darker',()=>{
  const model=createLightingModel(map),near=model.sample([-5,0]),far=model.sample([4,0]),inner=model.sample([0,6]);
  assert.ok(near.daylight>far.daylight*5);
  assert.equal(inner.daylight,0);
  const state={timeOfDay:'day',powerOn:false},weather={weather:'clear'};
  assert.ok(lightLevel(near,state,weather)>lightLevel(inner,state,weather)*10);
  assert.ok(lightLevel(near,{...state,timeOfDay:'night'},weather)<lightLevel(near,state,weather)*.15);
});
test('sunlight enters a directional window band only in sunny daylight',()=>{
  const model=createLightingModel(map);
  const band=model.sample([-4,-2]),outsideBand=model.sample([-4,2]);
  assert.equal(band.solar,1);assert.equal(outsideBand.solar,0);
  const state={timeOfDay:'day',powerOn:false};
  assert.ok(lightLevel(band,state,{weather:'clear'})>lightLevel(band,state,{weather:'rain'})*2);
  assert.ok(lightLevel(band,{...state,timeOfDay:'night'},{weather:'clear'})<.05);
});
test('power cut extinguishes electric room lighting, persists and resets on deployment',()=>{
  const state=createMission(map,{...defaults,timeOfDay:'night'});state.status='paused';
  const sample=createLightingModel(map).sample([0,6]);
  assert.ok(sample.electric>.5);
  const before=lightLevel(sample,state,defaults);
  assert.equal(cutPower(state),true);assert.ok(lightLevel(sample,state,defaults)<before*.05);
  assert.equal(cutPower(state),false);assert.equal(state.powerOn,false);
  assert.equal(createMission(map,defaults).powerOn,true);
  assert.equal(cutPower({...state,status:'planning',powerOn:true}),false);
});
test('only one optic can be worn, and switching preserves the ready weapon and ammunition',()=>{
  const state=createMission(map,defaults);state.status='active';state.ammo=7;
  assert.equal(equip(state,'nightvision'),true);assert.equal(state.inventory.vision,'nightvision');
  assert.equal(state.inventory.equipped,'rifle');assert.equal(state.ammo,7);
  assert.equal(equip(state,'thermal'),true);assert.equal(state.inventory.vision,'thermal');
  assert.equal(equip(state,'thermal'),true);assert.equal(state.inventory.vision,'off');
  equip(state,'nightvision');equip(state,'pistol');assert.equal(state.inventory.vision,'nightvision');
  toggleHolster(state);assert.equal(state.inventory.vision,'nightvision');
  state.inventory.items.thermal=0;assert.equal(equip(state,'thermal'),false);assert.equal(state.inventory.vision,'nightvision');
});
test('old kits gain optics safely and a starting device must actually be carried',()=>{
  const kit=defaultLoadout();delete kit.vision;delete kit.items.nightvision;delete kit.items.thermal;
  const migrated=validateLoadout(kit);assert.equal(migrated.vision,'off');assert.equal(migrated.items.nightvision,1);
  const starting=defaultLoadout();starting.vision='thermal';
  const state=createMission(map,defaults,starting);assert.equal(state.inventory.vision,'thermal');
  state.status='paused';cutPower(state);assert.equal(state.inventory.vision,'thermal');
  starting.items.thermal=0;assert.throws(()=>validateLoadout(starting));
  starting.vision=['nightvision','thermal'];assert.throws(()=>validateLoadout(starting));
});
test('blackouts reduce guard detection range, and wearing optics does not give guards night vision',()=>{
  const layout={...map,walls:[],windows:[],rooms:[{name:'HALL',center:[0,0],size:[24,10]}]},rules={...defaults,timeOfDay:'night',sightRange:16};
  const state=createMission(layout,rules);state.status='active';state.player=[4,0];const guard=state.guards[0];guard.position=[-5,0];guard.heading=0;
  assert.equal(canSee(guard,state.player,rules,[],{state,map:layout}),true);
  cutPower(state);assert.equal(canSee(guard,state.player,rules,[],{state,map:layout}),false);
  equip(state,'nightvision');assert.equal(canSee(guard,state.player,rules,[],{state,map:layout}),false);
  state.player=[-3,0];assert.equal(canSee(guard,state.player,rules,[],{state,map:layout}),true,'nearby targets are still detectable');
});
import { fireWeapon } from '../src/weapons.js';

test('shooting a fixture extinguishes its light and a new mission restores it',()=>{
  const layout={...map,walls:[],windows:[],ceilings:[],rooms:[{name:'HALL',center:[0,0],size:[10,10]}]};
  const rules={...defaults,timeOfDay:'night'},state=createMission(layout,rules);
  state.status='active';
  const model=createLightingModel(layout),fixture=model.fixtures[0];
  assert.ok(model.sample([0,0],0,state.destroyedLights).electric>.9);
  const shot=fireWeapon(state,layout,rules,[0,1,0],[0,1,0]);
  assert.equal(shot.impacts[0].kind,'light');
  assert.equal(state.destroyedLights[0],true);
  assert.equal(model.sample([0,0],0,state.destroyedLights).electric,0);
  assert.equal(createMission(layout,rules).destroyedLights[0],false);
  assert.equal(fixture.position[1],2.55);
});
test('solid cover blocks shots aimed at a light',()=>{
  const layout={...map,walls:[{center:[0,0],size:[4,.3],height:2.8}],windows:[],ceilings:[],rooms:[{name:'HALL',center:[0,2],size:[10,10]}]};
  const rules={...defaults,destructibleWalls:false},state=createMission(layout,rules);state.status='active';
  fireWeapon(state,layout,rules,[0,1,-2],[0,1.55,4]);
  assert.equal(state.destroyedLights[0],false);
});
