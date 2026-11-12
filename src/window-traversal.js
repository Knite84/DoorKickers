import { rayBox } from './destruction.js';
import { segmentClear } from './combat.js';
import { elevation, bodyHeight, playerEye, doorCenter, doorSize, windowCenter, windowSize, supportHeight, propHeight, activeProps } from './world.js';

const radius=.28;
function boxes(state,map){
  return [
    ...state.wallPieces.filter(p=>p.hp>0&&!p.stair).map(p=>({center:p.center,size:p.size})),
    ...activeProps(state,map).map(p=>({center:[p.position[0],elevation(p)+propHeight(p)/2,p.position[1]],size:[p.size[0],propHeight(p),p.size[1]]})),
    ...map.doors.flatMap((d,i)=>state.doors[i]?[]:[{center:doorCenter(d),size:doorSize(d)}]),
    ...(map.windows??[]).flatMap((w,i)=>state.windowHealth[i]>0?[{center:windowCenter(w),size:windowSize(w)}]:[]),
  ];
}
function sweep(a,b,base,height,solids){
  const origin=[a[0],base+height/2,a[1]],delta=[b[0]-a[0],0,b[1]-a[1]],length=Math.hypot(...delta),direction=length?delta.map(v=>v/length):[1,0,0];
  return !solids.some(box=>{
    if(box.center[1]+box.size[1]/2<=base+.1||box.center[1]-box.size[1]/2>=base+height-.01)return false;
    return rayBox(origin,direction,box.center,[box.size[0]+radius*2,box.size[1]+height,box.size[2]+radius*2],length)!==null;
  });
}
export function nearbyInteraction(state,map){
  const eye=playerEye(state),candidates=[];
  for(const [kind,objects] of [['door',map.doors],['window',map.windows??[]]]) objects.forEach((object,index)=>{
    if(Math.abs((state.playerY??0)-elevation(object))>.55)return;
    const dx=object.position[0]-state.player[0],dz=object.position[1]-state.player[1],distance=Math.hypot(dx,dz);
    if(distance>1.8)return;
    const center=kind==='door'?doorCenter(object):windowCenter(object),size=kind==='door'?doorSize(object):windowSize(object);
    const length=Math.hypot(...center.map((v,i)=>v-eye[i])),direction=center.map((v,i)=>(v-eye[i])/(length||1));
    const entry=rayBox(eye,direction,center,size,length)??length;
    const face=eye.map((v,i)=>v+direction[i]*Math.max(0,entry-.04));
    if(!segmentClear(state,map,eye,face))return;
    const dot=(dx*(state.facing?.[0]??0)+dz*(state.facing?.[1]??-1))/(distance||1);
    candidates.push({kind,index,score:distance-dot*.35});
  });
  candidates.sort((a,b)=>a.score-b.score);return candidates[0]??null;
}
export function climbWindow(state,map,index){
  const window=map.windows[index];
  if(window.climbable===false)return window.climbReason??'This window has no safe landing. Use another opening.';
  if(state.windowHealth[index]>0)return 'Window glass intact. Break it before climbing through.';
  const axis=window.size[0]<window.size[1]?0:1,along=1-axis,width=window.size[along],height=window.height??1.5;
  if(width<.72||height<1.15)return 'This window opening is too small to climb through.';
  const side=Math.sign(state.player[axis]-window.position[axis])||1,half=width/2-radius-.06;
  const aligned=Math.max(-half,Math.min(half,state.player[along]-window.position[along]));
  const offsets=[aligned,0,-half,half].filter((v,i,a)=>a.findIndex(n=>Math.abs(n-v)<.01)===i);
  const solids=boxes(state,map),base=elevation(window),vaultHeight=Math.min(1.1,height-.12),sill=window.sill??.8;
  for(const offset of offsets){
    const source=[...state.player];source[along]=window.position[along]+offset;
    if(!sweep(state.player,source,state.playerY??0,bodyHeight(state),solids))continue;
    for(const distance of [.65,.85,1.1,1.4,1.7]){
      const target=[...window.position];target[along]+=offset;target[axis]-=side*distance;
      if(target[0]<=map.bounds.minX+radius||target[0]>=map.bounds.maxX-radius||target[1]<=map.bounds.minZ+radius||target[1]>=map.bounds.maxZ-radius)continue;
      if(!sweep(target,target,base,bodyHeight(state),solids))continue;
      for(const lift of [sill+.06,sill+height-vaultHeight-.06]){
        if(!sweep(source,target,base+lift,vaultHeight,solids))continue;
        // The sill is crossed at crouched vault height, but the landing must
        // clear the player's actual posture. Never ignore a wall along the way.
        const support=supportHeight(state,map,target,base+.15),drop=base-support;
        state.player=target;state.playerY=drop<.25?support:base;state.velocityY=0;
        return drop>.6?'Climbed through the broken window. Lower ground beyond: you will drop; use the stairs to return to this floor.':'Climbed through the broken window.';
      }
    }
  }
  return 'Window route blocked by a wall, furniture, ceiling or landing. Move clear of the jamb or use another opening.';
}
