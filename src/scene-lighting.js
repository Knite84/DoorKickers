import * as THREE from 'three';
import { createLightingModel, sunDirection } from './lighting.js';

export function createSceneLighting(map) {
  const model=createLightingModel(map),cell=.65;
  const width=Math.ceil((map.bounds.maxX-map.bounds.minX)/cell),depth=Math.ceil((map.bounds.maxZ-map.bounds.minZ)/cell);
  const levels=map.levels??[{elevation:0}];
  const heights = map.fixtures ? [0.2, 1.2, 2.2] : [1.2];
  const layers = levels.length * heights.length;
  const data=new Uint8Array(width*depth*layers*4);
  function fillField(destroyed=[]) {
  levels.forEach((level,l)=>heights.forEach((height,h)=>{
    for(let z=0;z<depth;z++)for(let x=0;x<width;x++){
      const sample=model.sample([map.bounds.minX+(x+.5)*cell,map.bounds.minZ+(z+.5)*cell],level.elevation,destroyed,height);
      const at=(((l*heights.length+h)*depth+z)*width+x)*4;
      data[at]=Math.round(sample.daylight*255);data[at+1]=sample.solar*255;data[at+2]=Math.round(sample.electric*255);data[at+3]=sample.interior?255:0;
    }
  }));
  }
  const bakeStart = performance.now();
  fillField();
  if (map.fixtures) console.info(`Captured room light in ${(performance.now() - bakeStart).toFixed(0)} ms`);
  const texture=new THREE.DataTexture(data,width,depth*layers,THREE.RGBAFormat);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  const uniforms={
    lightField:{value:texture},lightBounds:{value:new THREE.Vector4(map.bounds.minX,map.bounds.minZ,width*cell,depth*cell)},
    lightLevels:{value:levels.length},lightDay:{value:1},lightSunny:{value:1},lightPower:{value:1},lightVision:{value:0},lightTactical:{value:0},
    lightSlices:{value:heights.length},lightSliceDepth:{value:depth},
  };
  const decorated=new WeakSet();
  function decorate(material,heat=0){
    if(decorated.has(material)||!material.isMeshStandardMaterial)return material;
    decorated.add(material);
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms,{bodyHeat:{value:heat}});
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
        uniform float lightLevels,lightDay,lightSunny,lightPower,lightVision,lightTactical,bodyHeat,lightSlices,lightSliceDepth;
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
          float indoor=field.a;
          float ambient=mix(1.0,0.012+field.r*(lightDay>0.5?0.65:0.08),indoor);
          float direct=mix(1.0,field.g*lightSunny*lightDay,indoor);
          outgoingLight=reflectedLight.directDiffuse*direct+reflectedLight.indirectDiffuse*ambient+totalSpecular*mix(1.0,0.1,indoor)+totalEmissiveRadiance;
          outgoingLight+=diffuseColor.rgb*field.b*lightPower*0.8;
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
    material.customProgramCacheKey=()=>`architectural-light-${heat}`;
    return material;
  }
  let lightKey='intact';
  function update(state,rules,mapOpen){
    const nextKey=state.destroyedLights?.some(Boolean) ? state.destroyedLights.map(Number).join('') : 'intact';
    if(nextKey!==lightKey){fillField(state.destroyedLights);texture.needsUpdate=true;lightKey=nextKey;}
    uniforms.lightDay.value=(state.timeOfDay??rules.timeOfDay??'day')==='day'?1:0;
    uniforms.lightSunny.value=rules.weather==='clear'?1:0;
    uniforms.lightPower.value=state.powerOn===false?0:1;
    uniforms.lightTactical.value=mapOpen?1:0;
    uniforms.lightVision.value=mapOpen?0:state.inventory.vision==='nightvision'?1:state.inventory.vision==='thermal'?2:0;
  }
  return {decorate,update,fixtures:model.fixtures,sunDirection,dispose:()=>texture.dispose()};
}
