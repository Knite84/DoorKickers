import { segmentClear, damagePlayer } from './combat.js';
import { elevation, playerEye, doorCenter, doorSize, propBox } from './world.js';
import { navigationFor, findGuardPath } from './navigation.js';
import { rayBox } from './destruction.js';
import { guardEye, guardWeaponPose, rayCapsule } from './npc-body.js';
import { aimSpread } from './guard-wounds.js';

const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
// Foliage can hide a guard above its planter, but only solid geometry stops fire.
export function coverClear(state,map,a,b,concealment = true) {
  if (!segmentClear(state,map,a,b,-1,{glass:false})) return false;
  const length = Math.hypot(...b.map((v,i)=>v-a[i]));
  const direction = b.map((v,i)=>(v-a[i])/(length||1));
  // Concealment (sight) counts soft pieces and low debris; bullets (concealment off) only what stops a shot.
  return !map.props.some((prop,index) => {
    if (concealment && prop.kind === 'planter') return rayBox(a,direction,[prop.position[0],elevation(prop)+1.05,prop.position[1]],[prop.size[0],2.1,prop.size[1]],length-0.02)!==null;
    const box=propBox(state,map,index,concealment?'sight':'bullet');
    return box!==null&&rayBox(a,direction,box.center,box.size,length-0.02)!==null;
  });
}
// On a fine walking grid, consider every few cells so searches stay cheap.
function skipped(graph,id) {
  const stride=Math.max(1,Math.round(0.6/(graph.cell??0.65))), at=id%graph.plane;
  return at%graph.width%stride!==0 || Math.floor(at/graph.width)%stride!==0;
}
function hidden(state,map,position,y,threat) {
  return !coverClear(state,map,threat,[position[0],y+0.85,position[1]]) &&
    !coverClear(state,map,threat,[position[0],y+0.58,position[1]]);
}
function peekAt(state,map,position,y,threat) {
  const dx=threat[0]-position[0], dz=threat[2]-position[1], length=Math.hypot(dx,dz)||1;
  for (const lean of [0,0.65,-0.65,0.8,-0.8]) {
    const offset=[-dz/length*lean,dx/length*lean];
    const head=[position[0]+offset[0],y+1.65,position[1]+offset[1]];
    if (coverClear(state,map,head,threat) && coverClear(state,map,[position[0],y+0.85,position[1]],head,false)) return offset;
  }
  return null;
}
export function findWoundedCover(state,map,guard) {
  const graph=navigationFor(state,map), threat=guard.woundThreat, options=[];
  if (!threat) return null;
  for (let id=0; id<graph.blocked.length; id++) {
    if (skipped(graph,id) || graph.blocked[id] || graph.onStair[id] || Math.abs(graph.heights[id]-elevation(guard))>0.15) continue;
    const position=graph.point(id), travel=distance(position,guard.position);
    if (travel>8 || distance(position,[threat[0],threat[2]])<1.5) continue;
    if (!hidden(state,map,position,elevation(guard),threat)) continue;
    const peek=peekAt(state,map,position,elevation(guard),threat);
    const solid=!coverClear(state,map,threat,[position[0],elevation(guard)+0.85,position[1]],false);
    options.push({position,elevation:elevation(guard),peek,score:travel+(solid?0:2.5)+(peek?0:3)});
  }
  options.sort((a,b)=>a.score-b.score);
  for (const candidate of options.slice(0,12)) {
    const route=findGuardPath(state,map,guard.position,elevation(guard),candidate.position,candidate.elevation);
    if (distance(guard.position,candidate.position)>0.3 && (!route.length || distance(route.at(-1).position,candidate.position)>0.35)) continue;
    return {...candidate,precise:true,signature:graph.signature,phase:'retreat',until:0,threat:[...threat]};
  }
  return null;
}
export function stepWoundedCover(state,map,rules,guard,delta,seen,walk) {
  // Wounded guards, and those with an empty or jammed weapon, fall back to cover.
  if (!(guard.wounded || guard.weaponBusy) || !guard.woundThreat) return null;
  if (seen) guard.woundThreat=playerEye(state);
  let cover=guard.cover;
  const changed=cover && (cover.signature!==navigationFor(state,map).signature || distance([cover.threat[0],cover.threat[2]],[guard.woundThreat[0],guard.woundThreat[2]])>1.5);
  if ((!cover || changed) && state.elapsed>=(guard.nextCoverAt??0)) {
    guard.cover=cover=findWoundedCover(state,map,guard);
    guard.nextCoverAt=state.elapsed+1.5;
    guard.route=null;
  }
  if (!cover) {
    // With no usable cover, move away along a reachable route instead of charging.
    guard.mode='retreat'; guard.duck=0; guard.lean=[0,0];
    if (state.elapsed>=(guard.nextFleeAt??0)) {
      const graph=navigationFor(state,map), dx=guard.position[0]-guard.woundThreat[0], dz=guard.position[1]-guard.woundThreat[2], length=Math.hypot(dx,dz)||1;
      const options=[];
      for (let id=0;id<graph.blocked.length;id++) {
        if (skipped(graph,id) || graph.blocked[id] || graph.onStair[id] || Math.abs(graph.heights[id]-elevation(guard))>0.15) continue;
        const p=graph.point(id), d=distance(p,guard.position);
        if (d>5 || d<1) continue;
        options.push({position:p,elevation:elevation(guard),score:(p[0]-guard.position[0])*dx/length+(p[1]-guard.position[1])*dz/length});
      }
      options.sort((a,b)=>b.score-a.score); guard.fleeTo=null;
      for (const option of options.slice(0,6)) {
        const path=findGuardPath(state,map,guard.position,elevation(guard),option.position,option.elevation);
        if (path.length && distance(path.at(-1).position,option.position)<0.35) { guard.fleeTo=option; break; }
      }
      guard.nextFleeAt=state.elapsed+2;
    }
    if (guard.fleeTo) walk(guard.fleeTo,rules.patrolSpeed*1.2);
    return {canFire:seen};
  }
  if (changed || !hidden(state,map,cover.position,cover.elevation,guard.woundThreat)) {
    guard.cover=null; guard.nextCoverAt=0; guard.mode='retreat'; guard.duck=0; guard.lean=[0,0]; return {canFire:false};
  }
  if (distance(guard.position,cover.position)>0.055) {
    guard.mode='retreat'; guard.duck=0; guard.lean=[0,0];
    walk(cover,rules.patrolSpeed*1.2);
    // A blocked doorway or changed route must not leave the guard stuck forever.
    if (distance(guard.position,cover.position)<(cover.bestDistance??Infinity)-0.03) { cover.bestDistance=distance(guard.position,cover.position); cover.progressAt=state.elapsed; }
    else if (state.elapsed-(cover.progressAt??state.elapsed)>3) { guard.cover=null; guard.nextCoverAt=state.elapsed+1; }
    return {canFire:false};
  }
  if (cover.phase==='retreat') { cover.phase='hide'; cover.until=state.elapsed+2.2+(guard.id??0)*0.17; }
  if (state.elapsed>=cover.until) {
    if (cover.phase==='hide') {
      cover.peek=peekAt(state,map,guard.position,elevation(guard),guard.woundThreat);
      cover.phase=cover.peek?'peek':'hide';
      cover.until=state.elapsed+(cover.peek?0.95:2.5);
    } else { cover.phase='hide'; cover.until=state.elapsed+2.8+(100-guard.health)*0.015; }
  }
  const peeking=cover.phase==='peek';
  guard.mode=peeking?'peek':'cover'; guard.duck=peeking?0:1; guard.lean=peeking?cover.peek:[0,0];
  guard.heading=Math.atan2(guard.woundThreat[2]-guard.position[1],guard.woundThreat[0]-guard.position[0]);
  return {canFire:peeking && coverClear(state,map,guardEye(guard),playerEye(state))};
}

// A seeded stream keeps injury dispersion reproducible without making every shot hit.
function random(guard) {
  guard.aimSeed=(Math.imul(guard.aimSeed??((guard.id??0)+1)*7919,1664525)+1013904223)>>>0;
  return guard.aimSeed/4294967296;
}
export function fireGuardShot(state,map,rules,guard) {
  const target=playerEye(state);
  // Wounds always disturb aim; guards with a temperament also have ordinary human dispersion.
  const severity=(100-guard.health)/100;
  const spread=(guard.wounded?0.055+severity*0.16+(guard.injuries?.leftArm||guard.injuries?.rightArm?0.06:0):0)+(guard.traits?aimSpread(state,guard,rules):0);
  if (spread>0) {
    const eye=guardEye(guard), length=Math.hypot(...target.map((v,i)=>v-eye[i]));
    const angle=random(guard)*Math.PI*2, radius=Math.sqrt(random(guard))*length*spread;
    const dx=target[0]-guard.position[0], dz=target[2]-guard.position[1], horizontal=Math.hypot(dx,dz)||1;
    target[0]+=-dz/horizontal*Math.cos(angle)*radius;
    target[2]+=dx/horizontal*Math.cos(angle)*radius;
    target[1]+=Math.sin(angle)*radius;
  }
  guard.aimTarget=target; guard.recoil=1;
  const origin=guardWeaponPose(guard).muzzle, length=Math.hypot(...target.map((v,i)=>v-origin[i]));
  const direction=target.map((v,i)=>(v-origin[i])/(length||1));
  let stop=length+0.4;
  const block=(center,size)=> { const hit=rayBox(origin,direction,center,size,stop); if(hit!==null) stop=Math.min(stop,hit); };
  for (const piece of state.wallPieces) if(piece.hp>0) block(piece.center,piece.size);
  map.doors.forEach((door,i)=> { if(!state.doors[i]) block(doorCenter(door),doorSize(door)); });
  map.props.forEach((_,index)=> { const box=propBox(state,map,index,'bullet'); if(box) block(box.center,box.size); });
  const exposed=playerEye(state);
  const hit=rayCapsule(origin,direction,[state.player[0],(state.playerY??0)+0.3,state.player[1]],[exposed[0],exposed[1]-0.05,exposed[2]],0.28,stop);
  if(hit!==null) { stop=hit; damagePlayer(state,rules,rules.guardDamage,[origin[0],origin[2]]); }
  state.events.push({type:'guard-shot',origin,position:origin.map((v,i)=>v+direction[i]*stop),hitPlayer:hit!==null});
}
