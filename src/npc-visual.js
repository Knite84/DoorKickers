import * as THREE from 'three';
import { bodySegments, guardPose } from './npc-body.js';

// Procedural articulated actor; replace with a skinned asset at this boundary.
export function createGuardVisual(material) {
  const group = new THREE.Group(), cylinder = new THREE.CylinderGeometry(1, 1, 1, 10), sphere = new THREE.SphereGeometry(1, 10, 8);
  const pieces = bodySegments.map(([a, b, radius, zone]) => {
    const color = zone === 'head' ? 0xd5bd91 : zone.endsWith('Leg') ? 0x39453d : zone.endsWith('Arm') ? 0x9a7057 : 0x765c49;
    const make = geometry => {
      const mesh = new THREE.Mesh(geometry, material(color));
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    return { a, b, radius, shaft: a === b ? null : make(cylinder), start: make(sphere), end: a === b ? null : make(sphere) };
  });
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  group.userData.update = guard => {
    const pose = guardPose(guard);
    for (const { a, b, radius, shaft, start, end } of pieces) {
      start.position.set(...pose[a]); start.scale.setScalar(radius);
      if (!shaft) continue;
      end.position.set(...pose[b]); end.scale.setScalar(radius);
      direction.subVectors(end.position, start.position);
      const length = direction.length();
      shaft.position.copy(start.position).add(end.position).multiplyScalar(0.5);
      shaft.scale.set(radius, Math.max(length, 0.0001), radius);
      shaft.quaternion.setFromUnitVectors(up, direction.normalize());
    }
  };
  return group;
}
