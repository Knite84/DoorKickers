import { rayBox } from './destruction.js';
import { doorCenter, doorSize, elevation, windowCenter, playerEye } from './world.js';
import { damageCount, piecesAlong } from './spatial.js';

// Architectural light field: windows admit daylight, walls stop it, and room
// fixtures supply electric light. Kept independent of Three.js for verification.
export const sunDirection = [-0.62,0.46,0.64];
const lightProfiles = {
  day: { direction: sunDirection, daylight: 1, solar: 1, sun: 2.8, ambient: 1.65, exposure: 1, color: 0xffebc4, haze: 0x9baaa0 },
  dusk: { direction: [sunDirection[0], 0.16, sunDirection[2]], daylight: 0.48, solar: 0.48, sun: 1.15, ambient: 0.63, exposure: 0.9, color: 0xffab66, haze: 0x9d7880 },
  night: { direction: sunDirection, daylight: 0.08, solar: 0, sun: 0.04, ambient: 0.15, exposure: 0.78, color: 0x718ebd, haze: 0x020611 },
};
export const lightingProfile = time => lightProfiles[time] ?? lightProfiles.day;
const outdoors=/COURTYARD|DECK|OUTSIDE|APPROACH|UNEXCAVATED/;
const inside=(p,c,s)=>Math.abs(p[0]-c[0])<=s[0]/2&&Math.abs(p[1]-c[1])<=s[1]/2;
export function roomLights(map) {
  if (map.fixtures) return map.fixtures;
  return defaultRoomLights(map);
}

export function defaultRoomLights(map) {
  return map.rooms.filter(r=>!outdoors.test(r.name)).map(r=>{
    const ceiling=(map.ceilings??[]).filter(c=>c.elevation>elevation(r)+1.8&&c.elevation<elevation(r)+3&&inside(r.center,c.center,c.size)).sort((a,b)=>a.elevation-b.elevation)[0];
    return {position:[r.center[0],ceiling?ceiling.elevation-.12:elevation(r)+2.55,r.center[1]],elevation:elevation(r),room:r};
  });
}
export function createLightingModel(map) {
  const fixtures=roomLights(map),windows=map.windows??[];
  const indoorRooms = map.rooms.filter(room => !outdoors.test(room.name));
  const porchFixtures = fixtures.map((fixture, index) => ({ fixture, index }))
    .filter(({ fixture }) => fixture.kind === 'porch');
  const boxes=map.walls.map(w=>({center:[w.center[0],elevation(w)+(w.height??2.8)/2,w.center[1]],size:[w.size[0],w.height??2.8,w.size[1]]}));
  const doors = (map.doors ?? []).map(door => ({ center: doorCenter(door), size: doorSize(door) }));
  function clear(a,b,state) {
    const length=Math.hypot(...b.map((v,i)=>v-a[i])),direction=b.map((v,i)=>(v-a[i])/(length||1));
    const hits = box => rayBox(a, direction, box.center, box.size, length - .04) !== null;
    const obstacles = state?.wallPieces ? piecesAlong(state.wallPieces, a, b) : boxes;
    return !obstacles.some(box => (box.hp ?? 1) > 0 && hits(box))
      && !(map.fixtures && doors.some((door, index) => !state?.doors?.[index]
        && (state?.doorHealth?.[index] ?? 1) > 0 && hits(door)));
  }
  function sample(position,base=0,destroyed=[],height=1.2,state) {
    const direction = lightingProfile(state?.timeOfDay).direction;
    const unobstructed = (a, b) => clear(a, b, state);
    const room=indoorRooms.some(r=>Math.abs(elevation(r)-base)<.2&&inside(position,r.center,r.size));
    const slab=(map.floors??[]).some(f=>Math.abs(f.elevation-base)<.1&&(!f.solid||base===0&&f.material==='concrete')&&inside(position,f.center,f.size));
    if(!room&&!slab) {
      let electric = 0;
      const receiver = [position[0], base + height, position[1]];
      for (const { fixture, index } of porchFixtures) {
        if (state?.timeOfDay === 'day' || destroyed[index] || Math.abs(fixture.elevation - base) > 0.2) continue;
        const distance = Math.hypot(...fixture.position.map((value, axis) => value - receiver[axis]));
        if (distance < 3 && unobstructed(receiver, fixture.position)) {
          electric = Math.max(electric, fixture.strength * (1 - distance / 3) / (1 + distance ** 2));
        }
      }
      return {interior:false,daylight:1,solar:1,electric};
    }
    let daylight=0,solar=0,electric=0;
    const eye=[position[0],base+height,position[1]];
    for(const window of windows) {
      if(Math.abs(elevation(window)-base)>.2) continue;
      const center=windowCenter(window),distance=Math.hypot(...center.map((v,i)=>v-eye[i]));
      if(distance<16&&unobstructed(eye,center)) daylight=Math.max(daylight,Math.exp(-distance*.28));
      const axis=window.size[0]<window.size[1]?0:2,along=axis===0?2:0;
      const origin=[position[0],base+.08,position[1]],t=(center[axis]-origin[axis])/direction[axis];
      if(t<=0||t>18) continue;
      const hit=origin.map((v,i)=>v+direction[i]*t);
      if(Math.abs(hit[along]-center[along])<window.size[along===0?0:1]/2&&hit[1]>base+(window.sill??.8)&&hit[1]<base+(window.sill??.8)+(window.height??1.5)&&unobstructed(origin,hit)) solar=1;
    }
    if (state?.wallPieces) {
      const sun = eye.map((coordinate, axis) => coordinate + 32 * direction[axis]);
      if (unobstructed(eye, sun)) {
        solar = 1;
        daylight = Math.max(daylight, .55);
      }
    }
    for(const [index,fixture] of fixtures.entries()) {
      if(destroyed[index]||Math.abs(fixture.elevation-base)>.2||fixture.kind==='porch'&&state?.timeOfDay==='day')continue;
      const distance=Math.hypot(position[0]-fixture.position[0],position[1]-fixture.position[2],
        height === 1.2 && !fixture.id ? 0 : eye[1]-fixture.position[1]);
      const source = fixture.kind === 'lamp' || fixture.kind === 'vanity'
        ? fixture.position : [fixture.position[0],base+1.8,fixture.position[2]];
      if(distance<10&&unobstructed(eye,source)) electric=Math.max(electric,(fixture.strength??1)/(1+distance*distance*.12));
    }
    return {interior:true,daylight,solar,electric};
  }
  return {sample,fixtures,clear};
}
export function lightLevel(sample,state,rules={}) {
  const profile = lightingProfile(state.timeOfDay ?? rules.timeOfDay);
  const sunny = rules.weather === 'clear' || !rules.weather;
  const electric = state.powerOn !== false ? sample.electric * .7 : 0;
  if (!sample.interior) return profile.daylight * (sunny ? 1 : .55) + electric;
  return .008 + sample.daylight * profile.daylight * (sunny ? .45 : .23)
    + sample.solar * profile.solar * (sunny ? .55 : 0) + electric;
}
export function cutPower(state) {
  if(!['active','paused'].includes(state.status)||state.powerOn===false)return false;
  state.powerOn=false;return true;
}
const models=new WeakMap(),samples=new WeakMap();
const bakedSamples = new WeakMap();
export function useBakedLightSamples(state, sample) {
  bakedSamples.set(state, sample);
}
export function lightGeometryKey(state) {
  const doors = state.doors?.map((open, index) => Number(open || state.doorHealth?.[index] <= 0)).join('') ?? '';
  return `${state.wallPieces ? damageCount(state) : 0}:${doors}`;
}
export function darknessSightFactor(state,map,rules) {
  if((state.timeOfDay??rules.timeOfDay??'day')==='day'&&state.powerOn!==false&&!state.destroyedLights?.some(Boolean))return 1;
  let model=models.get(map);if(!model){model=createLightingModel(map);models.set(map,model);}
  const eye=playerEye(state),base=Math.round((state.playerY??0)/3.2)*3.2;
  const baked = bakedSamples.get(state)?.(eye);
  if (baked) return Math.min(1,.28+.72*Math.sqrt(Math.max(0,lightLevel(baked,state,rules))));
  const geometry = map.fixtures ? lightGeometryKey(state) : '';
  const key=`${Math.round(eye[0]*2)},${Math.round(eye[2]*2)},${Math.round(eye[1]*4)},${base},${state.timeOfDay},${geometry},${(state.destroyedLights??[]).map(Number).join('')}`;
  let cached=samples.get(state);
  if(!cached||cached.map!==map||cached.key!==key){cached={map,key,sample:model.sample([eye[0],eye[2]],base,state.destroyedLights,map.fixtures?eye[1]-base:1.2,map.fixtures?state:undefined)};samples.set(state,cached);}
  return Math.min(1,.28+.72*Math.sqrt(Math.max(0,lightLevel(cached.sample,state,rules))));
}
