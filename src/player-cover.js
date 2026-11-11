import { rayBox } from './destruction.js';
import { damageCount } from './spatial.js';
import { elevation, doorCenter, doorSize, windowCenter, windowSize, playerEye, supportHeight, propHeight } from './world.js';

const colliderCache=new WeakMap();
function solids(state,map) {
  const signature=damageCount(state)+':'+state.doors.join(',')+':'+state.windowHealth.join(',')+':'+map.props.length;
  let cached=colliderCache.get(state);
  if(!cached||cached.signature!==signature||cached.map!==map){
  const boxes=[
    ...state.wallPieces.filter(p=>p.hp>0&&!p.stair).map(p=>({center:p.center,size:p.size,kind:'wall',id:p.wall,floor:p.floor})),
    ...map.props.map((p,id)=>({center:[p.position[0],elevation(p)+propHeight(p)/2,p.position[1]],size:[p.size[0],propHeight(p),p.size[1]],kind:'prop',id})),
    ...map.doors.flatMap((d,id)=>state.doors[id]?[]:[{center:doorCenter(d),size:doorSize(d),kind:'door',id}]),
    ...(map.windows??[]).flatMap((w,id)=>state.windowHealth[id]>0?[{center:windowCenter(w),size:windowSize(w),kind:'glass',id}]:[]),
  ];
  cached={signature,map,boxes};colliderCache.set(state,cached);
  }
  // Only nearby solids can intersect a cover stance; avoid rebuilding thousands
  // of structural colliders every frame on the larger floorplan maps.
  const base=state.playerY??0;
  return cached.boxes.filter(box=>Math.abs(box.center[0]-state.player[0])<box.size[0]/2+3&&Math.abs(box.center[2]-state.player[1])<box.size[2]/2+3&&box.center[1]+box.size[1]/2>base+.6&&box.center[1]-box.size[1]/2<base+2.1);
}
const matches=(box,cover)=>box.kind===cover.kind&&box.id===cover.id&&!box.floor;
function clearHead(a,b,boxes) {
  const length=Math.hypot(...b.map((v,i)=>v-a[i]));
  const direction=b.map((v,i)=>(v-a[i])/(length||1));
  return !boxes.some(box=>rayBox(a,direction,box.center,box.size.map(v=>v+.4),length+.001)!==null);
}
function withinBounds(position,map) {
  return position[0]>map.bounds.minX+.28&&position[0]<map.bounds.maxX-.28&&position[2]>map.bounds.minZ+.28&&position[2]<map.bounds.maxZ-.28;
}
function blockedView(eye,cover,boxes,map) {
  const direction=[cover.normal[0],0,cover.normal[1]];
  return boxes.some(box=>{
    if(!matches(box,cover)) return false;
    const size=[...box.size],center=[...box.center];
    if(box.kind==='prop'&&map.props[box.id].kind==='planter'){size[1]=2.1;center[1]=elevation(map.props[box.id])+1.05;}
    return rayBox(eye,direction,center,size,2)!==null;
  });
}
export function leavePlayerCover(state,map) {
  state.playerCover=null;
  // Keep a crouch if the cover or ceiling prevents a safe return to standing.
  if(!state.crouched){
    const a=[state.player[0],(state.playerY??0)+.85,state.player[1]],b=[a[0],(state.playerY??0)+1.65,a[2]];
    if(!clearHead(a,b,solids(state,map))) state.crouched=true;
  }
}
export function togglePlayerCover(state,map) {
  if(state.status!=='active') return '';
  if(state.playerCover){leavePlayerCover(state,map);return 'Left cover. WASD moves; Q takes nearby cover.';}
  const boxes=solids(state,map), origin=[state.player[0],(state.playerY??0)+.85,state.player[1]];
  const length=Math.hypot(...state.facing)||1,normal=state.facing.map(v=>v/length),direction=[normal[0],0,normal[1]];
  let nearest=null;
  for(const box of boxes){
    if(box.floor||box.kind==='glass') continue;
    const hit=rayBox(origin,direction,box.center,box.size,1.6);
    if(hit!==null&&hit>.22&&(!nearest||hit<nearest.distance)) nearest={...box,distance:hit};
  }
  if(!nearest) return 'No nearby cover ahead. Face a wall, crate, table or planter within 1.6 metres, then press Q.';
  if(!clearHead(playerEye(state),origin,boxes)) return 'Not enough room to crouch into cover.';
  state.playerCover={kind:nearest.kind,id:nearest.id,normal,anchor:[...state.player],elevation:state.playerY??0,peeking:false,offset:[0,0],blocked:false,concealment:nearest.kind==='prop'&&map.props[nearest.id].kind==='planter'};
  return 'In cover. Hold X to pop out and fire; release X to duck back. Q or WASD leaves cover.';
}
export function setPlayerPeek(state,map,held) {
  const cover=state.playerCover;
  if(!cover) return false;
  cover.peeking=false;cover.offset=[0,0];cover.blocked=false;
  if(!held||state.status!=='active') return false;
  const boxes=solids(state,map),hidden=[state.player[0],(state.playerY??0)+.85,state.player[1]],base=state.playerY??0;
  // Prefer popping above low cover, then try either side of a tall surface.
  for(const amount of [0,.65,-.65,.85,-.85]) {
    const offset=[-cover.normal[1]*amount,cover.normal[0]*amount];
    const eye=[state.player[0]+offset[0],base+1.65,state.player[1]+offset[1]];
    if(!withinBounds(eye,map)||blockedView(eye,cover,boxes,map)||!clearHead(hidden,eye,boxes)) continue;
    cover.peeking=true;cover.offset=offset;return true;
  }
  cover.blocked=true;return false;
}
export function stepPlayerCover(state,map,input) {
  const cover=state.playerCover;
  if(!cover) return;
  if(input.x||input.z||Math.abs((state.playerY??0)-cover.elevation)>.25||Math.hypot(...state.player.map((v,i)=>v-cover.anchor[i]))>.2||supportHeight(state,map,state.player,state.playerY)<(state.playerY??0)-.2){leavePlayerCover(state,map);return;}
  const boxes=solids(state,map),eye=[state.player[0],(state.playerY??0)+.85,state.player[1]],direction=[cover.normal[0],0,cover.normal[1]];
  if(!boxes.some(box=>matches(box,cover)&&rayBox(eye,direction,box.center,box.size,1.6)!==null)){leavePlayerCover(state,map);return;}
  setPlayerPeek(state,map,!!input.peek);
}
