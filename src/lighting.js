import { rayBox } from './destruction.js';
import { elevation, windowCenter, playerEye } from './world.js';

// Architectural light field: windows admit daylight, walls stop it, and room
// fixtures supply electric light. Kept independent of Three.js for verification.
export const sunDirection = [-0.62,0.46,0.64];
const outdoors=/COURTYARD|DECK|OUTSIDE|APPROACH|UNEXCAVATED/;
const inside=(p,c,s)=>Math.abs(p[0]-c[0])<=s[0]/2&&Math.abs(p[1]-c[1])<=s[1]/2;
export function roomLights(map) {
  return map.rooms.filter(r=>!outdoors.test(r.name)).map(r=>{
    const ceiling=(map.ceilings??[]).filter(c=>c.elevation>elevation(r)+1.8&&c.elevation<elevation(r)+3&&inside(r.center,c.center,c.size)).sort((a,b)=>a.elevation-b.elevation)[0];
    return {position:[r.center[0],ceiling?ceiling.elevation-.12:elevation(r)+2.55,r.center[1]],elevation:elevation(r),room:r};
  });
}
export function createLightingModel(map) {
  const fixtures=roomLights(map),windows=map.windows??[];
  const boxes=map.walls.map(w=>({center:[w.center[0],elevation(w)+(w.height??2.8)/2,w.center[1]],size:[w.size[0],w.height??2.8,w.size[1]]}));
  function clear(a,b) {
    const length=Math.hypot(...b.map((v,i)=>v-a[i])),direction=b.map((v,i)=>(v-a[i])/(length||1));
    return !boxes.some(box=>rayBox(a,direction,box.center,box.size,length-.04)!==null);
  }
  function sample(position,base=0,destroyed=[]) {
    const room=fixtures.some(f=>Math.abs(f.elevation-base)<.2&&inside(position,f.room.center,f.room.size));
    const slab=(map.floors??[]).some(f=>Math.abs(f.elevation-base)<.1&&(!f.solid||base===0&&f.material==='concrete')&&inside(position,f.center,f.size));
    if(!room&&!slab) return {interior:false,daylight:1,solar:1,electric:0};
    let daylight=0,solar=0,electric=0;
    const eye=[position[0],base+1.2,position[1]];
    for(const window of windows) {
      if(Math.abs(elevation(window)-base)>.2) continue;
      const center=windowCenter(window),distance=Math.hypot(...center.map((v,i)=>v-eye[i]));
      if(distance<16&&clear(eye,center)) daylight=Math.max(daylight,Math.exp(-distance*.28));
      const axis=window.size[0]<window.size[1]?0:2,along=axis===0?2:0;
      const origin=[position[0],base+.08,position[1]],t=(center[axis]-origin[axis])/sunDirection[axis];
      if(t<=0||t>18) continue;
      const hit=origin.map((v,i)=>v+sunDirection[i]*t);
      if(Math.abs(hit[along]-center[along])<window.size[along===0?0:1]/2&&hit[1]>base+(window.sill??.8)&&hit[1]<base+(window.sill??.8)+(window.height??1.5)&&clear(origin,hit)) solar=1;
    }
    for(const [index,fixture] of fixtures.entries()) {
      if(destroyed[index]||Math.abs(fixture.elevation-base)>.2)continue;
      const distance=Math.hypot(position[0]-fixture.position[0],position[1]-fixture.position[2]);
      if(distance<10&&clear(eye,[fixture.position[0],base+1.8,fixture.position[2]])) electric=Math.max(electric,1/(1+distance*distance*.12));
    }
    return {interior:true,daylight,solar,electric};
  }
  return {sample,fixtures,clear};
}
export function lightLevel(sample,state,rules={}) {
  const day=(state.timeOfDay??rules.timeOfDay??'day')==='day',sunny=rules.weather==='clear'||!rules.weather;
  if(!sample.interior)return day?sunny?1:.55:.035;
  return .008+(day?sample.daylight*(sunny?.45:.23)+sample.solar*(sunny?.55:0):sample.daylight*.02)+(state.powerOn!==false?sample.electric*.7:0);
}
export function cutPower(state) {
  if(!['active','paused'].includes(state.status)||state.powerOn===false)return false;
  state.powerOn=false;return true;
}
const models=new WeakMap(),samples=new WeakMap();
export function darknessSightFactor(state,map,rules) {
  if((state.timeOfDay??rules.timeOfDay??'day')==='day'&&state.powerOn!==false&&!state.destroyedLights?.some(Boolean))return 1;
  let model=models.get(map);if(!model){model=createLightingModel(map);models.set(map,model);}
  const eye=playerEye(state),base=Math.round((state.playerY??0)/3.2)*3.2;
  const key=`${Math.round(eye[0]*2)},${Math.round(eye[2]*2)},${base},${(state.destroyedLights??[]).map(Number).join('')}`;
  let cached=samples.get(state);
  if(!cached||cached.map!==map||cached.key!==key){cached={map,key,sample:model.sample([eye[0],eye[2]],base,state.destroyedLights)};samples.set(state,cached);}
  return Math.min(1,.28+.72*Math.sqrt(Math.max(0,lightLevel(cached.sample,state,rules))));
}
