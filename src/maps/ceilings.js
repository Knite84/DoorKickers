const inside=(x,z,polygon)=>{
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [a,b]=polygon[i],[c,d]=polygon[j];
    if((b>z)!==(d>z)&&x<(c-a)*(z-b)/(d-b)+a)result=!result;
  }
  return result;
};
export const rectangle=(x1,z1,x2,z2)=>[[x1,z1],[x2,z1],[x2,z2],[x1,z2]];
// Exact orthogonal roof coverage, with open stair shafts rather than caps that
// cut across the walking route. Every returned rectangle becomes shared geometry.
export function ceilingsFor(footprints){
  return footprints.flatMap(({outline,holes=[],elevation=0,height=2.8})=>{
    const polygons=[outline,...holes],xs=[...new Set(polygons.flatMap(p=>p.map(v=>v[0])))].sort((a,b)=>a-b),zs=[...new Set(polygons.flatMap(p=>p.map(v=>v[1])))].sort((a,b)=>a-b),result=[];
    for(let j=0;j<zs.length-1;j++){
      let start=null;
      for(let i=0;i<xs.length;i++){
        const x=(xs[i]+xs[i+1])/2,z=(zs[j]+zs[j+1])/2;
        const fill=i<xs.length-1&&inside(x,z,outline)&&!holes.some(p=>inside(x,z,p));
        if(fill&&start===null)start=xs[i];
        if(!fill&&start!==null){result.push({center:[(start+xs[i])/2,(zs[j]+zs[j+1])/2],size:[xs[i]-start,zs[j+1]-zs[j]],elevation:elevation+height,level:Math.round(elevation/3.2)});start=null;}
      }
    }
    return result;
  });
}
