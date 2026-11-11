import * as THREE from 'three';
import { bodySegments, guardPose, guardWeaponPose } from './npc-body.js';

// Procedural articulated actor; replace with a skinned asset at this boundary.
export function createGuardVisual(material) {
  const group = new THREE.Group(), cylinder = new THREE.CylinderGeometry(1, 1, 1, 10), sphere = new THREE.SphereGeometry(1, 10, 8);
  const pieces = bodySegments.map(([a, b, radius, zone]) => {
    const color = zone === 'head' ? 0xd5bd91 : zone.endsWith('Leg') ? 0x39453d : zone.endsWith('Arm') ? 0x9a7057 : 0x765c49;
    const make = geometry => {
      const mesh = new THREE.Mesh(geometry, material(color));
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    return { a, b, radius, zone, shaft: a === b ? null : make(cylinder), start: make(sphere), end: a === b ? null : make(sphere) };
  });
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const weapon = new THREE.Group(); weapon.name = 'guard-pistol'; group.add(weapon);
  for (const [position, size] of [[[0.13, 0, 0], [0.32, 0.075, 0.075]], [[0, -0.07, 0], [0.075, 0.16, 0.07]]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(0x202a29));
    mesh.position.set(...position); mesh.castShadow = true; weapon.add(mesh);
  }
  const muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.085), new THREE.MeshBasicMaterial({ color: 0xffd486 }));
  muzzleFlash.position.x = 0.34; weapon.add(muzzleFlash);
  const forward = new THREE.Vector3(1, 0, 0);
  group.userData.update = guard => {
    const pose = guardPose(guard);
    for (const { a, b, radius, zone, shaft, start, end } of pieces) {
      if (zone === 'chest' || zone === 'stomach') {
        const torsoMaterial = material(guard.armored && guard.armorHits > 0 ? 0x263b32 : 0x765c49);
        start.material = torsoMaterial; if (shaft) shaft.material = torsoMaterial; if (end) end.material = torsoMaterial;
      }
      start.position.set(...pose[a]); start.scale.setScalar(radius);
      if (!shaft) continue;
      end.position.set(...pose[b]); end.scale.setScalar(radius);
      direction.subVectors(end.position, start.position);
      const length = direction.length();
      shaft.position.copy(start.position).add(end.position).multiplyScalar(0.5);
      shaft.scale.set(radius, Math.max(length, 0.0001), radius);
      shaft.quaternion.setFromUnitVectors(up, direction.normalize());
    }
    const attachment = guardWeaponPose(guard, pose);
    weapon.visible = attachment.visible;
    weapon.position.set(...attachment.position);
    weapon.quaternion.setFromUnitVectors(forward, direction.set(...attachment.direction));
    muzzleFlash.visible = !!guard.aimTarget && (guard.recoil ?? 0) > 0.65;
  };
  return group;
}
