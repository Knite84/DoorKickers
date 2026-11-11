import * as THREE from 'three';
import { createLightingModel, sunDirection } from './lighting.js';

export function createSceneLighting(map) {
  const model=createLightingModel(map),cell=.65;
  const width=Math.ceil((map.bounds.maxX-map.bounds.minX)/cell),depth=Math.ceil((map.bounds.maxZ-map.bounds.minZ)/cell);
  const levels=map.levels??[{elevation:0}],data=new Uint8Array(width*depth*levels.length*4);
  function fillField(destroyed=[]) {
  levels.forEach((level,l)=>{
    for(let z=0;z<depth;z++)for(let x=0;x<width;x++){
      const sample=model.sample([map.bounds.minX+(x+.5)*cell,map.bounds.minZ+(z+.5)*cell],level.elevation,destroyed);
      const at=((l*depth+z)*width+x)*4;
      data[at]=Math.round(sample.daylight*255);data[at+1]=sample.solar*255;data[at+2]=Math.round(sample.electric*255);data[at+3]=sample.interior?255:0;
    }
  });
  }
  fillField();
  const texture=new THREE.DataTexture(data,width,depth*levels.length,THREE.RGBAFormat);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  const uniforms={
    lightField:{value:texture},lightBounds:{value:new THREE.Vector4(map.bounds.minX,map.bounds.minZ,width*cell,depth*cell)},
    lightLevels:{value:levels.length},lightDay:{value:1},lightSunny:{value:1},lightPower:{value:1},lightVision:{value:0},lightTactical:{value:0},
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
        uniform float lightLevels,lightDay,lightSunny,lightPower,lightVision,lightTactical,bodyHeat;
        `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        if(lightTactical<0.5){
          vec2 fieldUV=clamp((vLightWorld.xz-lightBounds.xy)/lightBounds.zw,vec2(0.001),vec2(0.999));
          float lightFloor=clamp(floor((vLightWorld.y+0.03)/3.2),0.0,lightLevels-1.0);
          fieldUV.y=(fieldUV.y+lightFloor)/lightLevels;
          vec4 field=texture2D(lightField,fieldUV);
          float indoor=field.a;
          float ambient=mix(1.0,0.012+field.r*(lightDay>0.5?0.65:0.08),indoor);
          float direct=mix(1.0,field.g*lightSunny*lightDay,indoor);
          outgoingLight=reflectedLight.directDiffuse*direct+reflectedLight.indirectDiffuse*ambient+totalSpecular*mix(1.0,0.1,indoor)+totalEmissiveRadiance;
          outgoingLight+=diffuseColor.rgb*field.b*indoor*lightPower*0.8;
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
  let lightKey='';
  function update(state,rules,mapOpen){
    const nextKey=(state.destroyedLights??[]).map(Number).join('');
    if(nextKey!==lightKey){fillField(state.destroyedLights);texture.needsUpdate=true;lightKey=nextKey;}
    uniforms.lightDay.value=(state.timeOfDay??rules.timeOfDay??'day')==='day'?1:0;
    uniforms.lightSunny.value=rules.weather==='clear'?1:0;
    uniforms.lightPower.value=state.powerOn===false?0:1;
    uniforms.lightTactical.value=mapOpen?1:0;
    uniforms.lightVision.value=mapOpen?0:state.inventory.vision==='nightvision'?1:state.inventory.vision==='thermal'?2:0;
  }
  return {decorate,update,fixtures:model.fixtures,sunDirection,dispose:()=>texture.dispose()};
}
