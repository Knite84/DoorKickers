import * as THREE from 'three';
import { createLightingModel, lightGeometryKey, lightingProfile, sunDirection, useBakedLightSamples } from './lighting.js';
import { affectedLightColumns, captureLightState } from './light-rebake.js';
import { bakeContactField, contactGrid, CONTACT_RANGE } from './contact-shading.js';
import { damageCount } from './spatial.js';
import { activeProps } from './world.js';

export function createSceneLighting(map, pieces = []) {
  const model=createLightingModel(map),cell=.65;
  const width=Math.ceil((map.bounds.maxX-map.bounds.minX)/cell),depth=Math.ceil((map.bounds.maxZ-map.bounds.minZ)/cell);
  const levels=map.levels??[{elevation:0}];
  const heights = map.fixtures ? [0.2, 1.2, 2.2] : [1.2];
  const layers = levels.length * heights.length;
  const data=new Uint8Array(width*depth*layers*4);
  function* bakeField(target, state, columns) {
    let at = 0;
    for (const level of levels) for (const height of heights) {
      for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
        if (columns && !columns[z*width+x]) {
          at += 4;
          continue;
        }
        const sample = model.sample([map.bounds.minX+(x+.5)*cell,map.bounds.minZ+(z+.5)*cell],
          level.elevation, state?.destroyedLights, height, map.fixtures ? state : { timeOfDay: state?.timeOfDay });
        target[at++]=Math.round(sample.daylight*255);
        target[at++]=sample.solar*255;
        target[at++]=Math.round(sample.electric*255);
        target[at++]=sample.interior?255:0;
        yield;
      }
    }
  }
  const bakeStart = performance.now();
  for (const _ of bakeField(data)) { /* Initial field before the scene draws. */ }
  if (map.fixtures) console.info(`Captured room light in ${(performance.now() - bakeStart).toFixed(0)} ms`);
  const texture=new THREE.DataTexture(data,width,depth*layers,THREE.RGBAFormat);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  const uniforms={
    lightField:{value:texture},lightBounds:{value:new THREE.Vector4(map.bounds.minX,map.bounds.minZ,width*cell,depth*cell)},
    lightLevels:{value:levels.length},lightDay:{value:1},lightSunny:{value:1},lightPower:{value:1},lightVision:{value:0},lightTactical:{value:0},
    lightSlices:{value:heights.length},lightSliceDepth:{value:depth},
    lightSolar:{value:1},lightWeather:{value:1},
    // Brief muzzle-flash light (step 5.3): xyz world position, w strength (0 = off).
    muzzleLight:{value:new THREE.Vector4(0,0,0,0)},
  };
  // Baked contact shading (src/contact-shading.js): soft darkening where floors
  // meet walls and furniture and where walls meet the ceiling. It dims ambient
  // and electric light only, never direct sun, and rebakes after damage.
  const contact = contactGrid(map), contactData = bakeContactField(map, pieces, map.props, contact);
  const contactTexture = new THREE.DataTexture(contactData, contact.width, contact.depth * contact.levels.length, THREE.RGFormat);
  contactTexture.minFilter = contactTexture.magFilter = THREE.LinearFilter; contactTexture.needsUpdate = true;
  const ceilings = [0, 1, 2, 3].map(i => contact.ceilings[i] ?? 2.8);
  Object.assign(uniforms, {
    contactField: { value: contactTexture }, contactLevels: { value: contact.levels.length },
    contactBounds: { value: new THREE.Vector4(contact.minX, contact.minZ, contact.width * contact.cell, contact.depth * contact.cell) },
    contactDepth: { value: contact.depth }, contactRange: { value: CONTACT_RANGE },
    contactCeilings: { value: new THREE.Vector4(...ceilings) }, contactStrength: { value: 0.75 },
  });
  let contactKey = 0, contactTime = -Infinity;
  const decorated=new WeakSet();
  // outdoor: always lit as outside (the roof sits inside the house footprint,
  // where the baked field says indoor).
  function decorate(material,heat=0,{outdoor=false}={}){
    if(decorated.has(material)||!material.isMeshStandardMaterial)return material;
    decorated.add(material);
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms, uniforms, {
        bodyHeat: { value: heat }, forceOutdoor: { value: outdoor ? 1 : 0 },
        indoorSpecular: { value: material.metalness >= .7 ? .55 : material.transparent && material.metalness > .2 ? .4 : .1 },
      });
      shader.vertexShader='varying vec3 vLightWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
        vec4 lightWorld=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          lightWorld=instanceMatrix*lightWorld;
        #endif
        vLightWorld=(modelMatrix*lightWorld).xyz;
        #include <project_vertex>`);
      shader.fragmentShader=`varying vec3 vLightWorld;
        uniform sampler2D lightField;uniform vec4 lightBounds;
        uniform float lightLevels,lightDay,lightSunny,lightPower,lightVision,lightTactical,bodyHeat,lightSlices,lightSliceDepth,lightSolar,lightWeather,indoorSpecular,forceOutdoor;
        uniform sampler2D contactField;uniform vec4 contactBounds,contactCeilings;uniform float contactLevels,contactDepth,contactRange,contactStrength;
        uniform vec4 muzzleLight;
        float contactShade(vec3 world,vec3 worldNormal,float indoor){
          vec3 p=world+worldNormal*0.08;
          float level=clamp(floor((p.y+0.03)/3.2),0.0,contactLevels-1.0);
          float height=p.y-level*3.2;
          float ceiling=level<0.5?contactCeilings.x:level<1.5?contactCeilings.y:level<2.5?contactCeilings.z:contactCeilings.w;
          vec2 uv=clamp((p.xz-contactBounds.xy)/contactBounds.zw,vec2(0.0005),vec2(0.9995));
          float edge=0.5/contactDepth;
          uv.y=(clamp(uv.y,edge,1.0-edge)+level)/contactLevels;
          vec2 distance=texture2D(contactField,uv).rg*contactRange;
          float nearFloor=(1.0-smoothstep(0.0,0.65,distance.r))*(1.0-smoothstep(0.05,0.7,height));
          float nearCeiling=(1.0-smoothstep(0.0,0.45,distance.g))*(1.0-smoothstep(0.05,0.5,ceiling-height))*indoor;
          return 1.0-contactStrength*clamp(nearFloor+nearCeiling*0.8,0.0,1.0);
        }
        `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        if(lightTactical<0.5){
          vec2 fieldUV=clamp((vLightWorld.xz-lightBounds.xy)/lightBounds.zw,vec2(0.001),vec2(0.999));
          float lightFloor=clamp(floor((vLightWorld.y+0.03)/3.2),0.0,lightLevels-1.0);
          float edge=0.5/lightSliceDepth;
          fieldUV.y=clamp(fieldUV.y,edge,1.0-edge);
          float slice=clamp(vLightWorld.y-lightFloor*3.2-0.2,0.0,lightSlices-1.0);
          float firstSlice=floor(slice);
          float layer=lightFloor*lightSlices+firstSlice;
          float layerCount=lightLevels*lightSlices;
          vec4 lower=texture2D(lightField,vec2(fieldUV.x,(fieldUV.y+layer)/layerCount));
          float upperLayer=lightFloor*lightSlices+min(firstSlice+1.0,lightSlices-1.0);
          vec4 upper=texture2D(lightField,vec2(fieldUV.x,(fieldUV.y+upperLayer)/layerCount));
          vec4 field=mix(lower,upper,fract(slice));
          float indoor=field.a*(1.0-forceOutdoor);
          float contact=contactShade(vLightWorld,inverseTransformDirection(normal,viewMatrix),indoor);
          float ambient=mix(1.0,0.012+field.r*0.65*lightDay*lightWeather,indoor)*contact;
          float direct=mix(1.0,field.g*lightSunny*lightSolar,indoor);
          outgoingLight=reflectedLight.directDiffuse*direct+reflectedLight.indirectDiffuse*ambient+totalSpecular*mix(1.0,indoorSpecular,indoor)+totalEmissiveRadiance;
          outgoingLight+=diffuseColor.rgb*field.b*lightPower*0.8*contact;
          if(muzzleLight.w>0.0){
            vec3 toFlash=muzzleLight.xyz-vLightWorld;float flashDistance=length(toFlash);
            float reach=max(0.0,1.0-flashDistance/4.5);reach*=reach;
            float facing=max(dot(inverseTransformDirection(normal,viewMatrix),toFlash/max(flashDistance,0.001)),0.0);
            outgoingLight+=diffuseColor.rgb*vec3(1.0,0.68,0.36)*muzzleLight.w*reach*(0.25+0.75*facing)*2.2;
          }
          if(lightVision>0.5&&lightVision<1.5){
            float amplified=dot(outgoingLight,vec3(.2126,.7152,.0722))*5.5+dot(diffuseColor.rgb,vec3(.333))*0.055;
            outgoingLight=vec3(.12,.95,.25)*amplified;
          }else if(lightVision>1.5){
            vec3 cold=vec3(.025,.04,.095)*(0.4+dot(diffuseColor.rgb,vec3(.333)));
            vec3 hot=mix(vec3(1.0,.17,.025),vec3(1.0,.96,.62),bodyHeat);
            outgoingLight=mix(cold,hot,smoothstep(.2,.95,bodyHeat));
          }
        }
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>`architectural-light-${heat}${outdoor?'-outdoor':''}`;
    return material;
  }
  let lightKey='day:intact';
  const pendingData = new Uint8Array(data.length);
  let pending;
  let published;
  function sampleField([worldX, worldY, worldZ]) {
    const clamp = THREE.MathUtils.clamp;
    const x = clamp((worldX-map.bounds.minX)/cell-.5, 0, width-1);
    const z = clamp((worldZ-map.bounds.minZ)/cell-.5, 0, depth-1);
    const level = clamp(Math.floor((worldY+.03)/3.2), 0, levels.length-1);
    const y = clamp(worldY-level*3.2-.2, 0, heights.length-1);
    const x0 = Math.floor(x), z0 = Math.floor(z), y0 = Math.floor(y);
    const x1 = Math.min(x0+1,width-1), z1 = Math.min(z0+1,depth-1), y1 = Math.min(y0+1,heights.length-1);
    const lerp = THREE.MathUtils.lerp;
    const read = (px,pz,py,channel) => data[(((level*heights.length+py)*depth+pz)*width+px)*4+channel];
    function channel(index) {
      const plane = slice => lerp(
        lerp(read(x0,z0,slice,index),read(x1,z0,slice,index),x-x0),
        lerp(read(x0,z1,slice,index),read(x1,z1,slice,index),x-x0), z-z0);
      return lerp(plane(y0),plane(y1),y-y0)/255;
    }
    return { daylight: channel(0), solar: channel(1), electric: channel(2), interior: channel(3) >= .5 };
  }
  function update(state,rules,mapOpen){
    // Rebake contact shading when pieces break, at most a few times a second.
    const damage = state.wallPieces ? damageCount(state) : 0, now = performance.now();
    if (damage !== contactKey && now - contactTime > 250) {
      bakeContactField(map, state.wallPieces, activeProps(state, map), contact, contactData);
      contactTexture.needsUpdate = true; contactKey = damage; contactTime = now;
    }
    if (map.fixtures) useBakedLightSamples(state, sampleField);
    const fixtures = state.destroyedLights?.some(Boolean) ? state.destroyedLights.map(Number).join('') : 'intact';
    const time = state.timeOfDay ?? rules.timeOfDay ?? 'day';
    const profile = lightingProfile(time);
    const nextKey = map.fixtures ? `${time}:${lightGeometryKey(state)}:${fixtures}` : `${time}:${fixtures}`;
    if (nextKey === lightKey) pending = undefined;
    else {
      if (pending?.key !== nextKey || pending.state !== state) {
        const snapshot = map.fixtures ? captureLightState(state) : undefined;
        const columns = snapshot && published?.state === state && published.time === time
          ? affectedLightColumns(map, model.fixtures, state, published.snapshot, snapshot, { width, depth, cell })
          : undefined;
        if (columns) pendingData.set(data);
        pending = { key: nextKey, state, snapshot, bake: bakeField(pendingData, state, columns) };
      }
      const deadline = performance.now() + 3;
      do {
        if (!pending.bake.next().done) continue;
        data.set(pendingData);
        texture.needsUpdate = true;
        lightKey = nextKey;
        published = { state, time, snapshot: pending.snapshot };
        pending = undefined;
        break;
      } while (performance.now() < deadline);
    }
    uniforms.lightDay.value=profile.daylight;
    uniforms.lightSolar.value=profile.solar;
    uniforms.lightWeather.value=rules.weather==='clear'?1:.6;
    uniforms.lightSunny.value=rules.weather==='clear'?1:0;
    uniforms.lightPower.value=state.powerOn===false?0:1;
    uniforms.lightTactical.value=mapOpen?1:0;
    uniforms.lightVision.value=mapOpen?0:state.inventory.vision==='nightvision'?1:state.inventory.vision==='thermal'?2:0;
  }
  return {
    decorate, update, fixtures: model.fixtures, sunDirection,
    capturing: () => Boolean(map.fixtures && pending && published?.state !== pending.state),
    setContactStrength: strength => { uniforms.contactStrength.value = strength; },
    setMuzzleLight: (position, strength) => { if (position) uniforms.muzzleLight.value.set(position.x, position.y, position.z, strength); else uniforms.muzzleLight.value.w = 0; },
    dispose: () => { texture.dispose(); contactTexture.dispose(); },
  };
}
