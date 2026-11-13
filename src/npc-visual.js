import * as THREE from 'three';
import { bodySegments, guardPose, guardWeaponPose } from './npc-body.js';
import { boneFrames, restFrames, buildBody, guardLook } from './npc-shape.js';
import { weaponModels } from './weapon-models.js';

// A guard as drawn. The simulation's 16 joints (npc-body.js) drive everything.
//   body: 'skinned' (step 5.1): one skinned mesh in the guard's outfit, from
//         src/npc-shape.js, its bones following the joints every frame.
//   body: 'capsules' (the default until the owner approves the skinned body in play):
//         the old articulated capsules, which are exactly the hit zones.
// `material(color)` makes a lit material for a flat colour (capsules, the pistol);
// `bodyMaterial` is a lit material with vertex colours for the skinned body.
// `look` comes from guardLook() in npc-shape.js (outfit, colours, gear).
export function createGuardVisual(material, { body = 'capsules', look = null, bodyMaterial = null } = {}) {
  const group = new THREE.Group();
  const update = body === 'capsules' ? capsuleBody(group, material) : skinnedBody(group, look ?? guardLook('', { id: 0 }), bodyMaterial ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  // The pistol: the 5.2 first-person model without hands or suppressor, turned so its
  // barrel runs along the attachment's +X.
  const weapon = new THREE.Group(); weapon.name = 'guard-pistol'; group.add(weapon);
  const model = new THREE.Group(); model.rotation.y = -Math.PI / 2; model.position.x = -0.03; weapon.add(model);
  for (const part of weaponModels.pistol.parts) {
    if (part.role) continue;
    const geometry = part.shape === 'box' ? new THREE.BoxGeometry(...part.size) : new THREE.CylinderGeometry(part.radius, part.radius, part.length, 10).rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material(part.color));
    mesh.position.set(...part.position); if (part.rotation) mesh.rotation.set(...part.rotation);
    mesh.castShadow = true; model.add(mesh);
  }
  const muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0xffd486 }));
  muzzleFlash.position.x = -weaponModels.pistol.muzzle[2] + 0.02; weapon.add(muzzleFlash);
  const forward = new THREE.Vector3(1, 0, 0), direction = new THREE.Vector3();
  group.userData.update = guard => {
    const pose = guardPose(guard);
    update(guard, pose);
    const attachment = guardWeaponPose(guard, pose);
    weapon.visible = attachment.visible;
    weapon.position.set(...attachment.position);
    weapon.quaternion.setFromUnitVectors(forward, direction.set(...attachment.direction));
    muzzleFlash.visible = !!guard.aimTarget && (guard.recoil ?? 0) > 0.65;
  };
  return group;
}

// One skinned mesh. Bones are flat children of the group (no hierarchy); each frame a
// bone's matrix is set to carry its rest span onto the current span (npc-shape.js carry()).
function skinnedBody(group, look, bodyMaterial) {
  const data = buildBody(look), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(data.skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(data.skinWeight, 4));
  geometry.setIndex(data.indices); geometry.computeVertexNormals();
  const rest = restFrames(), basis = new THREE.Matrix4(), stretch = new THREE.Matrix4();
  const frameMatrix = (f, out) => out.makeBasis(new THREE.Vector3(...f.x), new THREE.Vector3(...f.y), new THREE.Vector3(...f.z)).setPosition(...f.origin);
  const bones = rest.map(() => { const bone = new THREE.Bone(); bone.matrixAutoUpdate = false; group.add(bone); return bone; });
  const inverses = rest.map(f => frameMatrix(f, new THREE.Matrix4()).invert());
  const skeleton = new THREE.Skeleton(bones, inverses);
  const mesh = new THREE.SkinnedMesh(geometry, bodyMaterial);
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  group.add(mesh); mesh.bind(skeleton, new THREE.Matrix4());
  group.userData.look = look;
  return (guard, pose) => {
    const now = boneFrames(pose);
    now.forEach((f, i) => {
      const along = rest[i].length > 1e-6 ? f.length / rest[i].length : 1;
      bones[i].matrix.copy(frameMatrix(f, basis).multiply(stretch.makeScale(along, 1, 1)));
      bones[i].matrixWorldNeedsUpdate = true;
    });
  };
}

// The old drawing: one capsule per hit zone. Kept for comparison on the preview page.
function capsuleBody(group, material) {
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10), sphere = new THREE.SphereGeometry(1, 10, 8);
  const pieces = bodySegments.map(([a, b, radius, zone]) => {
    const color = zone === 'head' ? 0xd5bd91 : zone.endsWith('Leg') ? 0x39453d : zone.endsWith('Arm') ? 0x9a7057 : 0x765c49;
    const make = geometry => { const mesh = new THREE.Mesh(geometry, material(color)); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh; };
    return { a, b, radius, zone, shaft: a === b ? null : make(cylinder), start: make(sphere), end: a === b ? null : make(sphere) };
  });
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  return (guard, pose) => {
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
  };
}
