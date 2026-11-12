import { BoxGeometry, CylinderGeometry, Mesh } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { doorCenter, doorSize } from './world.js';

export function createPaneledDoor(door, paint, bronze) {
  const [x, height, z] = doorSize(door);
  const width = Math.max(x, z), thickness = Math.min(x, z);
  const leaf = [new BoxGeometry(width, height, thickness)];
  const hardware = [];
  const panelWidth = width * .66, rail = Math.min(.045, panelWidth*.12);
  for (const face of [-1, 1]) {
    const depth = face * (thickness/2 + .005);
    for (const [middle, panelHeight] of [[-.52, .76], [.52, 1.04]]) {
      for (const edge of [-1, 1]) {
        leaf.push(new BoxGeometry(panelWidth, rail, .022)
          .translate(0, middle + edge*(panelHeight-rail)/2, depth));
        leaf.push(new BoxGeometry(rail, panelHeight-2*rail, .022)
          .translate(edge*(panelWidth-rail)/2, middle, depth));
      }
    }
    const handleX = width/2 - Math.min(.12, width*.2);
    hardware.push(new CylinderGeometry(.041, .041, .022, 12).rotateX(Math.PI/2)
      .translate(handleX, -.29, face*(thickness/2+.01)));
    hardware.push(new BoxGeometry(.028, .029, .065)
      .translate(handleX, -.29, face*(thickness/2+.045)));
    hardware.push(new BoxGeometry(.13, .026, .027)
      .translate(handleX-.052, -.29, face*(thickness/2+.074)));
  }
  function combine(parts) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    return geometry;
  }
  const mesh = new Mesh(combine(leaf), paint);
  mesh.position.set(...doorCenter(door));
  if (z > x) mesh.rotation.y = -Math.PI/2;
  mesh.castShadow = mesh.receiveShadow = true;
  const lever = new Mesh(combine(hardware), bronze);
  lever.castShadow = lever.receiveShadow = true;
  mesh.add(lever);
  return mesh;
}
