import * as THREE from 'three';
import { distance, lineOfSight, obstacles } from './simulation.js';
import { buildWallPieces } from './destruction.js';
import { weapons, items } from './kit.js';
import { elevation, eyeHeight, playerEye, doorCenter, doorSize, windowCenter, windowSize } from './world.js';
import { sightHalfAngle, sightRangeFactor } from './guard-traits.js';
import { segmentClear } from './combat.js';
import { createGuardVisual } from './npc-visual.js';
import { guardDisabled, guardEye } from './npc-body.js';
import { coverClear } from './guard-tactics.js';
import { createSceneLighting } from './scene-lighting.js';
import { lightingProfile } from './lighting.js';
import { piecesInArea } from './spatial.js';
import { isFurniture } from './furniture.js';
import { batchFurnitureMeshes, createFurnitureMaterials, furnitureMeshes } from './furniture-mesh.js';
import { createSurfaceShading } from './surface-materials.js';
import { exposureRange, graphicsPresets } from './graphics.js';
import { createSceneSky } from './scene-sky.js';
import { createPaneledDoor } from './door-visual.js';
import { createScenePost } from './scene-post.js';
import { fitSunShadow, tuneSunShadow } from './scene-shadows.js';

// Asset boundary: replace these factories with GLB-backed factories later.
// The simulation only knows positions and collision boxes, never meshes.
export function createScene(canvas, map, preset = graphicsPresets.Medium) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: preset.antialias });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x142421);
  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0x9baaa0, 0);
  scene.fog = fog;
  const camera = new THREE.OrthographicCamera(-20, 20, 16, -16, 0.1, 150);
  camera.position.set(0, 32, 25);
  camera.lookAt(0, 0, -1);
  const firstPerson = new THREE.PerspectiveCamera(76, 1, 0.04, 150);
  firstPerson.rotation.order = 'YXZ';
  scene.add(firstPerson);
  const mapCamera = new THREE.OrthographicCamera(-17, 17, 14, -14, 0.1, 100);
  mapCamera.position.set(0, 45, 0); mapCamera.up.set(0, 0, -1); mapCamera.lookAt(0, 0, 0);
  let view = 'first', mapOpen = false, yaw = -0.55, pitch = 0, recoil = 0, selectedLevel = 0;
  let currentCamera = firstPerson;
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.65);
  const pointerMove = event => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    if ((document.pointerLockElement === canvas || (event.buttons & 2) !== 0) && !mapOpen && view === 'first') {
      yaw -= event.movementX * 0.002; pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.002, -1.35, 1.35);
    }
  };
  canvas.addEventListener('pointermove', pointerMove);
  const structure = buildWallPieces(map);
  const lighting = createSceneLighting(map, structure);
  const sky = createSceneSky(renderer, scene, lighting.sunDirection);
  const ambient=new THREE.HemisphereLight(0xd9ecdf,0x344438,2.5);scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffebc4, 3.2);
  sun.position.set(...lighting.sunDirection.map(v=>v*35));
  sun.castShadow = true;
  scene.add(sun);
  const materials = {};
  const material = (color, roughness = 0.85) => materials[color] ??= lighting.decorate(new THREE.MeshStandardMaterial({ color, roughness }));
  function box(position, size, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  const surfaceShading = map.surfaces ? createSurfaceShading(map) : null;
  const ground = box([0, -0.4, 0], [map.bounds.maxX - map.bounds.minX + 4, 0.7, map.bounds.maxZ - map.bounds.minZ + 4], 0x46564a);
  if (surfaceShading) ground.material = surfaceShading.grass(lighting.decorate(new THREE.MeshStandardMaterial()));
  const scenery = (map.scenery ?? []).map(item => box([item.center[0], elevation(item), item.center[1]], [item.size[0], 0.03, item.size[1]], item.color));
  if (!map.scenery) {
    box([0, -0.03, -4], [20, 0.12, 10], 0x898975);
    box([0, -0.02, 5], [20, 0.12, 6], 0x6b7567);
    for (let x = -9; x < 10; x += 2) {
      for (let z = 2; z < 8; z += 2) box([x, 0.05, z + 0.9], [1.94, 0.03, 1.94], 0x748070);
    }
  }
  // Thousands of damageable pieces share a handful of draw calls.
  const wallBatches = [], wallDisplay = new Uint8Array(structure.length).fill(2);
  fitSunShadow(sun, structure);
  let currentSunDirection = lighting.sunDirection;
  const unitBox = new THREE.BoxGeometry(1, 1, 1), instanceTransform = new THREE.Object3D();
  for (const kind of new Set(structure.map(piece => piece.material))) {
    const indices = structure.flatMap((piece, index) => piece.material === kind ? [index] : []);
    const baseColor = ({ ceiling: 0xd8d7cd, timber: 0xa16d3f, drywall: 0xd5ceb5, particleboard: 0xa68552, truss: 0x79512e, earth: 0x59734c, concrete: 0xaaa99d, deck: 0x8c7253 })[kind] ?? 0xb7b198;
    const mesh = new THREE.InstancedMesh(unitBox, material(baseColor), indices.length);
    // Maps that declare room finishes (map.surfaces) get textured floors, paint and siding.
    surfaceShading?.dress(mesh, kind, indices.map(index => structure[index]), baseColor, lighting.decorate);
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
    wallBatches.push({ mesh, indices });
  }
  const windowGlass = lighting.decorate(new THREE.MeshStandardMaterial(map.surfaces
    ? { color: 0xb8d8db, transparent: true, opacity: 0.24, roughness: 0.065, metalness: 0.28, side: THREE.DoubleSide, depthWrite: false }
    : { color: 0x8bdce4, transparent: true, opacity: 0.27, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  const windowMeshes = (map.windows ?? []).map(window => {
    const mesh = box(windowCenter(window), windowSize(window), 0x8bdce4);
    mesh.material = windowGlass; mesh.castShadow = false;
    return mesh;
  });
  const windowFrames = (map.windows ?? []).map(window => {
    const horizontal = window.size[0] > window.size[1], center = windowCenter(window), size = windowSize(window), frames = [];
    for (const side of [-1, 1]) {
      const upright = [...center]; upright[horizontal ? 0 : 2] += side * (horizontal ? size[0] : size[2]) / 2;
      frames.push(box(upright, [0.09, size[1] + 0.12, 0.09], 0x5d6a66));
      const rail = [...center]; rail[1] += side * size[1] / 2;
      frames.push(box(rail, horizontal ? [size[0], 0.09, 0.12] : [0.12, 0.09, size[2]], 0x5d6a66));
    }
    return frames;
  });
  const furnitureMaterial = createFurnitureMaterials(lighting.decorate);
  const doorColor = new THREE.Color(map.surfaces ? 0xf1eee5 : 0x92784e);
  const damagedDoorColor = new THREE.Color(0x3f2d20);
  const doors = map.doors.map(d => {
    if (surfaceShading) {
      const paint = lighting.decorate(furnitureMaterial(doorColor.getHex(), 'paintedCabinet').clone());
      const mesh = createPaneledDoor(d, paint, furnitureMaterial(0x694834, 'brushedMetal'));
      scene.add(mesh);
      return mesh;
    }
    const mesh = box(doorCenter(d), doorSize(d), 0x92784e);
    mesh.material = lighting.decorate(mesh.material.clone()); return mesh;
  });
  const doorCracks = map.doors.map(d => {
    const horizontal = d.size[0] > d.size[1], half = (horizontal ? d.size[1] : d.size[0]) / 2 + 0.003;
    const points = [];
    const cracks = [[-0.3, 2.1, -0.05, 1.7], [-0.05, 1.7, -0.2, 1.35], [-0.2, 1.35, 0.1, 0.8], [-0.05, 1.7, 0.3, 1.5], [-0.2, 1.35, -0.4, 1.1], [0.1, 0.8, 0.05, 0.5]];
    for (const side of [-1, 1]) for (const [a, y1, b, y2] of cracks) {
      for (const [u, y] of [[a, y1], [b, y2]]) points.push(new THREE.Vector3(d.position[0] + (horizontal ? u : half * side), elevation(d) + y, d.position[1] + (horizontal ? half * side : u)));
    }
    const mesh = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x281d14, transparent: true })); scene.add(mesh); return mesh;
  });
  const weapon = new THREE.Group();
  function weaponBox(position, size, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
    mesh.position.set(...position); weapon.add(mesh); return mesh;
  }
  const weaponBody = weaponBox([0.22, -0.23, -0.48], [0.13, 0.15, 0.48], 0x28312e);
  const weaponBarrel = weaponBox([0.22, -0.21, -0.84], [0.06, 0.06, 0.35], 0x161e1d);
  weaponBox([0.22, -0.36, -0.4], [0.09, 0.22, 0.12], 0x4d5545);
  weaponBox([0.22, -0.13, -0.53], [0.04, 0.06, 0.06], 0x111b18);
  const suppressor = weaponBox([0.22, -0.21, -1.03], [0.1, 0.1, 0.23], 0x222b28);
  const scopeModel = weaponBox([0.22, -0.1, -0.62], [0.09, 0.09, 0.26], 0x16211d);
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xffd486 }));
  flash.position.set(0.22, -0.21, -1.04); flash.visible = false; weapon.add(flash);
  firstPerson.add(weapon);
  const minigun = new THREE.Group(), rotor = new THREE.Group();
  minigun.position.set(0.3, -0.35, -0.65); minigun.add(rotor); firstPerson.add(minigun);
  const miniBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.4), material(0x323b3d));
  miniBody.position.z = 0.13; minigun.add(miniBody);
  for (let barrel = 0; barrel < 6; barrel++) {
    const angle = barrel * Math.PI / 3;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.8, 10), material(0x172022));
    tube.rotation.x = Math.PI / 2; tube.position.set(Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, -0.35); rotor.add(tube);
  }
  for (const z of [-0.05, -0.6]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 18), material(0x56615d));
    collar.position.z = z; rotor.add(collar);
  }
  const miniHandle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.19, 0.12), material(0x172022));
  miniHandle.position.set(0, 0.2, 0.15); minigun.add(miniHandle);
  const miniFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), flash.material);
  miniFlash.position.z = -0.82; minigun.add(miniFlash);
  const heldItems = {};
  function heldBox(group, position, size, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color)); mesh.position.set(...position); group.add(mesh); return mesh;
  }
  for (const id of Object.keys(items)) {
    const group = new THREE.Group(); group.position.set(0.32, -0.3, -0.65); firstPerson.add(group); heldItems[id] = group;
    if (id === 'axe') { heldBox(group, [0, -0.1, 0], [0.04, 0.65, 0.04], 0x956a43); heldBox(group, [0.04, 0.22, 0], [0.3, 0.14, 0.06], 0xb84836); }
    else if (id === 'crowbar') { heldBox(group, [0, 0, 0], [0.035, 0.6, 0.035], 0x858e87); heldBox(group, [0.05, 0.28, 0], [0.12, 0.04, 0.035], 0x858e87); }
    else if (id === 'pickgun') { heldBox(group, [0, 0, 0], [0.12, 0.12, 0.2], 0x65747c); heldBox(group, [0, -0.1, 0.04], [0.07, 0.18, 0.08], 0x283331); heldBox(group, [0, 0.02, -0.19], [0.015, 0.015, 0.2], 0xc4c9c2); }
    else if (id === 'knife') { heldBox(group, [0, -0.12, 0], [0.05, 0.2, 0.07], 0x3a453a); heldBox(group, [0, 0.03, 0], [0.12, 0.025, 0.09], 0x7b8685); const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.36, 3), material(0xc2cdca)); blade.position.y = 0.21; blade.scale.z = 0.3; group.add(blade); }
    else if (id === 'medkit') { heldBox(group, [0, 0, 0], [0.3, 0.22, 0.12], 0xb6c4ac); heldBox(group, [0, 0, 0.066], [0.14, 0.035, 0.015], 0xc55f49); heldBox(group, [0, 0, 0.066], [0.035, 0.14, 0.015], 0xc55f49); }
    else if (id === 'molotov') { const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.32, 10), material(0x805c35)); group.add(bottle); heldBox(group, [0, 0.2, 0], [0.04, 0.12, 0.04], 0xd4c9ab); }
    else if (id === 'detcord') { const spool = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 18), material(0xc48e55)); group.add(spool); }
    else heldBox(group, [0, 0, 0], id === 'claymore' ? [0.28, 0.18, 0.08] : [0.09, 0.18, 0.09], id === 'flashbang' ? 0xaab0a5 : 0x516344);
  }
  const dynamicMeshes = new Map();
  const deviceGeometry = new THREE.BoxGeometry(0.25, 0.15, 0.12);
  const projectileGeometry = new THREE.SphereGeometry(0.09, 8, 6);
  const fireGeometry = new THREE.ConeGeometry(0.35, 0.8, 6);
  function syncDynamic(state) {
    const active = new Set();
    for (const object of [...state.devices, ...state.projectiles, ...state.fires]) {
      active.add(object);
      let mesh = dynamicMeshes.get(object);
      if (!mesh) {
        mesh = new THREE.Mesh(object.until ? fireGeometry : object.armedAt !== undefined || object.type === 'detcord' ? deviceGeometry : projectileGeometry, material(object.until ? 0xe49743 : object.type === 'flashbang' ? 0xe2d9b5 : 0x657b4d));
        scene.add(mesh); dynamicMeshes.set(object, mesh);
      }
      mesh.position.set(...object.position);
      if (object.until) { mesh.position.y = object.position[1] + 0.35; mesh.scale.set(4, 0.7 + Math.sin(state.elapsed * 13) * 0.2, 4); }
      if (object.heading !== undefined) mesh.rotation.y = -object.heading;
    }
    for (const [object, mesh] of dynamicMeshes) if (!active.has(object)) { scene.remove(mesh); dynamicMeshes.delete(object); }
  }
  const effects = [];
  const chipGeometry = new THREE.BoxGeometry(0.065, 0.04, 0.06);
  function shotEffect(shot) {
    recoil = 0.045;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...shot.origin), new THREE.Vector3(...shot.position)]), new THREE.LineBasicMaterial({ color: 0xffdf9a, transparent: true, opacity: 0.85 }));
    scene.add(line); effects.push({ mesh: line, life: 0.075, disposable: true });
    // Show every entry/exit-layer impact, including those beyond the first wall.
    for (const impact of shot.impacts ?? []) {
      const chip = new THREE.Mesh(chipGeometry, material(impact.material === 'timber' ? 0xa16d3f : 0xe3dbc3));
      chip.position.set(...impact.position); scene.add(chip);
      effects.push({ mesh: chip, life: 0.8, velocity: new THREE.Vector3(0, 0.8, 0) });
    }
    const color = shot.material === 'timber' ? 0xa16d3f : shot.kind === 'guard' ? 0xc89058 : 0xe3dbc3;
    for (let i = 0; i < (shot.removed.length ? 15 : 5); i++) {
      const chip = new THREE.Mesh(chipGeometry, material(color)); chip.position.set(...shot.position);
      scene.add(chip); effects.push({ mesh: chip, life: 1 + Math.random(), velocity: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3) });
    }
  }
  function eventEffect(event) {
    if (event.type === 'door-break' || event.type === 'glass-break') {
      for (let i = 0; i < 18; i++) {
        const chip = new THREE.Mesh(chipGeometry, material(event.type === 'glass-break' ? 0x9edce7 : 0xa57946)); chip.position.set(...event.position);
        chip.scale.set(2, 1 + Math.random() * 6, 2); scene.add(chip);
        effects.push({ mesh: chip, life: 1.2 + Math.random(), velocity: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4) });
      }
      return;
    }
    if (event.type === 'guard-shot') {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...event.origin), new THREE.Vector3(...event.position)]), new THREE.LineBasicMaterial({ color: 0xf39a72 }));
      scene.add(line); effects.push({ mesh: line, life: 0.12, disposable: true }); return;
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: event.type === 'flash' ? 0xfff9e0 : event.type === 'heal' ? 0x91edb2 : 0xffb052, transparent: true, opacity: 0.45, wireframe: event.type === 'strike', depthWrite: false }));
    mesh.position.set(...event.position); mesh.scale.setScalar(event.radius ?? 0.3); scene.add(mesh);
    effects.push({ mesh, life: event.type === 'blast' ? 0.25 : 0.15, disposable: true });
  }
  const propMeshes = [], glass = lighting.decorate(new THREE.MeshStandardMaterial({ color: 0xbfe3ea, roughness: 0.1, transparent: true, opacity: 0.28, depthWrite: false }));
  // Kit furniture (src/furniture.js); map.decor is drawn only and never collides.
  const furnished = [...map.props, ...(map.decor ?? [])];
  const furnitureParts = [];
  const fixtureMeshes = new Map();
  for (const prop of furnished) {
    if (!isFurniture(prop)) continue;
    const meshes = furnitureMeshes(prop, furnitureMaterial, glass);
    meshes.forEach(mesh => {
      furnitureParts.push({ prop, mesh });
      if (mesh.userData.fixture) fixtureMeshes.set(mesh.position.toArray().join(','), mesh);
    });
  }
  const furnitureRender = batchFurnitureMeshes(furnitureParts);
  furnitureRender.forEach(({ mesh }) => scene.add(mesh));
  for (const [index, prop] of map.props.entries()) {
    if (isFurniture(prop)) continue;
    const firstMesh = scene.children.length, base = elevation(prop);
    const [x, z] = prop.position;
    if (prop.kind === 'bed') {
      // Low frame, mattress, blanket and pillows, with a headboard on the lake side.
      const [w, d] = prop.size, head = z - d / 2;
      box([x, base + 0.15, z], [w, 0.3, d], 0x5a4632);
      box([x, base + 0.42, z], [w - 0.08, 0.24, d - 0.08], 0xe4dfd2);
      box([x, base + 0.5, z + d * 0.17], [w - 0.04, 0.12, d * 0.62], 0x5f7f96);
      for (const side of [-1, 1]) box([x + side * w * 0.24, base + 0.6, head + 0.3], [w * 0.36, 0.12, 0.36], 0xf4f1e8);
      box([x, base + 0.5, head + 0.04], [w, 1.0, 0.08], 0x4a3828);
    } else box([x, base + 0.45, z], [prop.size[0], 0.9, prop.size[1]], prop.kind === 'crate' ? 0x776347 : 0x394e46);
    if (prop.kind === 'planter') {
      for (let i = -1; i <= 1; i++) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 0), material(0x658267));
        bush.position.set(x + i * 0.8, base + 1.15, z);
        bush.castShadow = true;
        scene.add(bush);
      }
    }
    if (prop.kind === 'table') box([x, base + 0.95, z], [prop.size[0] + 0.15, 0.12, prop.size[1] + 0.15], 0xb6a582);
    propMeshes[index] = scene.children.slice(firstMesh);
  }
  const gridWidth = Math.max(map.bounds.maxX - map.bounds.minX, map.bounds.maxZ - map.bounds.minZ);
  const grid = new THREE.GridHelper(gridWidth, gridWidth, 0x9eb5a2, 0x758b7a);
  grid.position.y = 0.08;
  grid.material.transparent = true;
  grid.material.opacity = 0.16;
  scene.add(grid);
  function label(text, x, z, base = 0) {
    const surface = document.createElement('canvas');
    surface.width = 512; surface.height = 64;
    const ctx = surface.getContext('2d');
    ctx.font = '500 28px monospace'; ctx.fillStyle = '#d0d9c5';
    ctx.textAlign = 'center'; ctx.fillText(text, 256, 40);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(surface), transparent: true, opacity: 0.8, depthTest: false }));
    sprite.position.set(x, base + 0.3, z); sprite.scale.set(6, 0.75, 1);
    scene.add(sprite); return sprite;
  }
  const labels = map.rooms.map(r => label(r.name, r.center[0], r.center[1], elevation(r)));
  const electricFixtures = lighting.fixtures.map(fixture => {
    const mounted = fixture.mountedOnFurniture ? fixtureMeshes.get(fixture.position.join(',')) : undefined;
    const mesh = mounted
      ?? box(fixture.position, fixture.size ?? [.46, .07, .46], 0xffd79a);
    if (fixture.id) {
      mesh.material = lighting.decorate(new THREE.MeshStandardMaterial({
        color: 0x514d45, emissive: fixture.color, emissiveIntensity: 0,
      }));
    } else {
      mesh.material = new THREE.MeshBasicMaterial({ color: 0xffd79a });
    }
    return mesh;
  });
  function actor(color) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.9, 4, 8), material(color));
    body.position.y = 0.85; body.castShadow = true; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), material(0xd5bd91));
    head.position.y = 1.65; group.add(head);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.13), material(color));
    nose.position.set(0.27, 1.15, 0); group.add(nose);
    scene.add(group); return group;
  }
  const player = actor(0x95d9bb);
  const playerLean = new THREE.Vector3(), playerUp = new THREE.Vector3(0,1,0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.46, 32), new THREE.MeshBasicMaterial({ color: 0x9ef5ca, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; player.add(ring);
  const objective = box([map.objective.position[0], elevation(map.objective) + 0.5, map.objective.position[1]], [0.65, 0.7, 0.5], 0xe9b55d);
  const extraction = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.6, 48), new THREE.MeshBasicMaterial({ color: 0x9ef5ca, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  extraction.rotation.x = -Math.PI / 2;
  extraction.position.set(...[map.extraction.position[0], elevation(map.extraction) + 0.13, map.extraction.position[1]]);
  scene.add(extraction);
  const extractionLabel = label('EXTRACT', map.extraction.position[0], map.extraction.position[1] + 2.2, elevation(map.extraction));
  const guards = [], cones = [], routes = [];
  const heatMaterials={};
  const heatMaterial=color=>heatMaterials[color]??=lighting.decorate(new THREE.MeshStandardMaterial({color}),color===0xd5bd91?1:.82);
  for (let i = 0; i < 8; i++) {
    const guardVisual = createGuardVisual(heatMaterial); scene.add(guardVisual); guards.push(guardVisual);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(32 * 9), 3));
    const cone = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xeac777, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
    cone.frustumCulled = false; scene.add(cone); cones.push(cone);
    const routeY = (map.guardElevations?.[i] ?? 0) + 0.16;
    const points = [...map.patrols[i], map.patrols[i][0]].map(p => new THREE.Vector3(p[0], routeY, p[1]));
    const route = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: 0xe9bb80, dashSize: 0.3, gapSize: 0.3, transparent: true, opacity: 0.5 }));
    route.computeLineDistances(); scene.add(route); routes.push(route);
  }
  // Original procedural scenery; no downloaded or generated third-party art.
  for (let i = 0; i < 16; i++) {
    const x = i % 2 ? map.bounds.minX - 1 : map.bounds.maxX + 1;
    const z = -15 + Math.floor(i / 2) * 4;
    box([x, 0.9, z], [0.35, 1.8, 0.35], 0x5a5945);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.8, 7), material(0x304d40));
    crown.position.set(x, 3.3, z); crown.castShadow = true; scene.add(crown);
  }
  const rainPositions = new Float32Array(600 * 3);
  for (let i = 0; i < rainPositions.length; i += 3) {
    rainPositions[i] = Math.random() * 30 - 15;
    rainPositions[i + 1] = Math.random() * 15;
    rainPositions[i + 2] = Math.random() * 26 - 13;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xc1d9dc, size: 0.045, transparent: true, opacity: 0.6 }));
  scene.add(rain);
  let post;
  const usePost = () => preset.occlusion || preset.bloom || preset.smaa;
  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const pixelRatio = Math.min(window.devicePixelRatio, 2) * preset.resolution;
    if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    post?.resize(canvas.width, canvas.height);
    const aspect = width / height;
    firstPerson.aspect = aspect; firstPerson.updateProjectionMatrix();
    const halfHeight = Math.max(14, (map.bounds.maxZ - map.bounds.minZ) / 2 + 1, (map.bounds.maxX - map.bounds.minX) / 2 / aspect + 1);
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    mapCamera.left = -halfHeight * aspect; mapCamera.right = halfHeight * aspect;
    mapCamera.top = halfHeight; mapCamera.bottom = -halfHeight; mapCamera.updateProjectionMatrix();
  }
  function setGraphics(nextPreset) {
    preset = nextPreset;
    if (sun.shadow.mapSize.x !== preset.shadowSize) {
      sun.shadow.mapSize.setScalar(preset.shadowSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.needsUpdate = true;
    }
    tuneSunShadow(sun.shadow);
    // Screen-space occlusion on High covers part of what the baked contact shading does.
    lighting.setContactStrength(preset.occlusion ? 0.45 : 0.75);
    resize();
  }
  setGraphics(preset);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  const zoomWheel = e => {
    if (view === 'first' && !mapOpen) return;
    e.preventDefault();
    camera.zoom = THREE.MathUtils.clamp(camera.zoom - e.deltaY * 0.001, 0.7, 1.65);
    camera.updateProjectionMatrix();
  };
  canvas.addEventListener('wheel', zoomWheel, { passive: false });
  function draw(state, rules, dt, controls = {}) {
    lighting.update(state,rules,mapOpen);
    currentCamera = mapOpen ? mapCamera : view === 'first' ? firstPerson : camera;
    firstPerson.position.set(...playerEye(state));
    if (view === 'first' && !mapOpen) selectedLevel = Math.max(0, Math.round((state.playerY ?? 0) / 3.2));
    const overview = view !== 'first' || mapOpen;
    const onLevel = object => !overview || Math.round(elevation(object) / 3.2) === selectedLevel;
    electricFixtures.forEach((mesh, i) => {
      const fixture = lighting.fixtures[i];
      mesh.visible = onLevel(fixture);
      const powered = state.powerOn !== false && !state.destroyedLights?.[i]
        && (fixture.kind !== 'porch' || (state.timeOfDay ?? 'day') !== 'day');
      if (fixture.id) mesh.material.emissiveIntensity = powered ? 1.5 + fixture.strength : 0;
      else mesh.material.color.setHex(powered ? 0xffd79a : 0x22252a);
    });
    firstPerson.rotation.set(pitch + recoil * 0.4, yaw, 0);
    const equipped = state.inventory.equipped, spec = weapons[equipped], config = state.inventory.weapons[equipped];
    const scoped = controls.aimed && equipped === 'sniper' && !mapOpen && view === 'first';
    const fov = controls.aimed && spec ? (scoped ? 76 / controls.scopeZoom : 55) : 76;
    if (firstPerson.fov !== fov) { firstPerson.fov = fov; firstPerson.updateProjectionMatrix(); }
    if (spec) {
      weaponBody.scale.z = spec.length / 0.48; weaponBody.material = material(spec.color);
      weaponBarrel.scale.z = spec.length / 0.48; weaponBarrel.position.z = -0.6 - spec.length * 0.5;
      suppressor.visible = config.suppressor; suppressor.position.z = -0.6 - spec.length;
      scopeModel.visible = equipped === 'sniper'; flash.position.z = suppressor.position.z - 0.13;
    }
    const strike = state.status === 'active' ? Math.sin(Math.PI * Math.max(0, Math.min(1, ((state.meleeUntil ?? 0) - state.elapsed) / .65))) : 0;
    weapon.position.set(-0.03 + strike * 0.12, -0.05 + Math.sin(state.elapsed * (controls.running ? 14 : 9)) * (controls.moving ? 0.008 : 0), -0.2 + recoil);
    weapon.rotation.z = -strike * 0.55;
    weapon.rotation.x = state.playerCover&&!state.playerCover.peeking ? -0.7 : state.reloadUntil > state.elapsed ? -0.5 : recoil;
    const weaponVisible = !!spec && view === 'first' && !mapOpen && !scoped && !controls.menuVisible;
    weapon.visible = weaponVisible && equipped !== 'minigun';
    minigun.visible = weaponVisible && equipped === 'minigun';
    minigun.position.y = -0.35 + recoil * 0.1;
    minigun.rotation.z = -strike * 0.4;
    minigun.rotation.x = state.playerCover&&!state.playerCover.peeking ? -0.7 : state.reloadUntil > state.elapsed ? -0.4 : recoil * 0.3;
    if (equipped === 'minigun' && controls.firing && state.reloadUntil <= state.elapsed && (state.ammo > 0 || rules.unlimitedAmmo)) rotor.rotation.z += dt * 35;
    miniFlash.visible = recoil > 0.025 && state.status === 'active' && !config?.suppressor;
    for (const [id, model] of Object.entries(heldItems)) { model.visible = id === equipped && view === 'first' && !mapOpen && !controls.menuVisible; model.rotation.x = recoil * 5; }
    flash.visible = recoil > 0.025 && state.status === 'active' && !config?.suppressor;
    recoil = Math.max(0, recoil - dt * 0.5);
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.life -= dt;
      if (effect.velocity) { effect.velocity.y -= dt * 8; effect.mesh.position.addScaledVector(effect.velocity, dt); effect.mesh.position.y = Math.max(0.1, effect.mesh.position.y); effect.mesh.rotation.x += dt * 3; }
      if (effect.life <= 0) { scene.remove(effect.mesh); if (effect.disposable) { effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); } effects.splice(i, 1); }
    }
    for (const { mesh, indices } of wallBatches) {
      let changed = false;
      indices.forEach((index, instance) => {
        const piece = state.wallPieces[index], visible = Number(piece.hp > 0 && (!overview || !piece.ceiling&&(piece.stair || (piece.level ?? 0) === selectedLevel)));
        if (wallDisplay[index] === visible) return;
        wallDisplay[index] = visible; instanceTransform.position.set(...piece.center); instanceTransform.scale.set(...(visible ? piece.size : [0, 0, 0]));
        instanceTransform.updateMatrix(); mesh.setMatrixAt(instance, instanceTransform.matrix); changed = true;
      });
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    }
    windowMeshes.forEach((mesh, i) => { mesh.visible = state.windowHealth[i] > 0 && onLevel(map.windows[i]); windowFrames[i].forEach(frame => { frame.visible = onLevel(map.windows[i]); }); });
    propMeshes.forEach((meshes, i) => meshes.forEach(mesh => { mesh.visible = onLevel(map.props[i]) && !(overview && mesh.userData.overhead); }));
    furnitureRender.forEach(({ prop, mesh }) => { mesh.visible = onLevel(prop) && !(overview && mesh.userData.overhead); });
    syncDynamic(state);
    const exposed=playerEye(state);
    player.position.set(state.player[0], state.playerY ?? 0, state.player[1]); player.scale.y = state.playerCover&&!state.playerCover.peeking ? 0.51 : state.crouched&&!state.playerCover ? 0.65 : 1;
    playerLean.set(exposed[0]-state.player[0],0,exposed[2]-state.player[1]).applyAxisAngle(playerUp,-player.rotation.y);
    player.children[0].position.set(playerLean.x*.5,.85,playerLean.z*.5);
    player.children[0].quaternion.setFromUnitVectors(playerUp,playerLean.clone().setY(1).normalize());
    player.children[1].position.set(playerLean.x,1.65,playerLean.z);
    player.children[2].position.set(.27+playerLean.x*.6,1.15,playerLean.z*.6);
    player.visible = overview && Math.round((state.playerY ?? 0) / 3.2) === selectedLevel;
    doors.forEach((mesh, i) => {
      mesh.visible = !state.doors[i] && onLevel(map.doors[i]);
      const damage = 1 - state.doorHealth[i] / state.doorMaxHealth[i];
      mesh.material.color.copy(doorColor).lerp(damagedDoorColor, damage);
      doorCracks[i].visible = mesh.visible && damage > 0;
      doorCracks[i].material.opacity = Math.min(1, damage * 2);
    });
    objective.visible = !state.collected && onLevel(map.objective);
    objective.rotation.y += dt * 0.6;
    extraction.material.opacity = state.collected ? 0.7 + Math.sin(state.elapsed * 4) * 0.25 : 0.4;
    grid.visible = rules.floorPlan && overview; grid.position.y = selectedLevel * 3.2 + 0.08;
    labels.forEach((l, i) => { l.visible = grid.visible && onLevel(map.rooms[i]); });
    extraction.visible = onLevel(map.extraction); extractionLabel.visible = grid.visible && onLevel(map.extraction);
    scenery.forEach(mesh => { mesh.visible = !overview || selectedLevel === 0; });
    for (let i = 0; i < 8; i++) {
      const guard = state.guards[i];
      const visible = !!guard && onLevel(guard) && (!overview || rules.fullIntel || state.scanUntil > state.elapsed || (distance(guard.position, state.player) < 9 && coverClear(state,map,playerEye(state),guardEye(guard))));
      guards[i].visible = visible;
      cones[i].visible = visible && !guardDisabled(guard) && rules.showVision && (view !== 'first' || mapOpen);
      routes[i].visible = !!guard && onLevel(guard) && !guardDisabled(guard) && rules.showRoutes && overview;
      if (!guard) continue;
      // Rounds are drawn per mission, so the revealed route follows the guard.
      if (routes[i].userData.path !== guard.path) {
        routes[i].userData.path = guard.path;
        const stops = guard.path.map((p, n) => new THREE.Vector3(p[0], (guard.pathElevations?.[n] ?? guard.patrolElevation ?? 0) + 0.16, p[1]));
        routes[i].geometry.dispose(); routes[i].geometry = new THREE.BufferGeometry().setFromPoints([...stops, stops[0]]); routes[i].computeLineDistances();
      }
      guards[i].userData.update(guard);
      if (!cones[i].visible) continue;
      const reach = rules.sightRange * sightRangeFactor(guard) + 0.5;
      const boxes = obstacles(map, state.doors, piecesInArea(state.wallPieces, guard.position[0] - reach, guard.position[0] + reach, guard.position[1] - reach, guard.position[1] + reach), false, elevation(guard));
      cones[i].material.color.setHex(guard.stunnedUntil > state.elapsed ? 0xc7d8ec : ({ retreat: 0xf2ae63, cover: 0xf2ae63, peek: 0xff8067, detain: 0xffd278, gather: 0x77cced, pursue: 0xff8067, investigate: 0xd6a0e8, search: 0xd6a0e8 })[guard.mode] ?? (guard.suspicion > 0.2 ? 0xff8067 : 0xeac777));
      const range = rules.sightRange * (rules.weather === 'fog' ? 0.6 : rules.weather === 'rain' ? 0.85 : 1) * sightRangeFactor(guard), half = sightHalfAngle(guard);
      const points = [];
      for (let ray = 0; ray <= 32; ray++) {
        const angle = guard.heading - half + ray / 32 * half * 2;
        let low = 0, high = range;
        for (let j = 0; j < 8; j++) {
          const mid = (low + high) / 2;
          if (lineOfSight(guard.position, [guard.position[0] + Math.cos(angle) * mid, guard.position[1] + Math.sin(angle) * mid], boxes)) low = mid;
          else high = mid;
        }
        points.push([guard.position[0] + Math.cos(angle) * low, guard.position[1] + Math.sin(angle) * low]);
      }
      const positions = cones[i].geometry.attributes.position;
      for (let segment = 0; segment < 32; segment++) {
        positions.setXYZ(segment * 3, guard.position[0], elevation(guard) + 0.12, guard.position[1]);
        positions.setXYZ(segment * 3 + 1, points[segment][0], elevation(guard) + 0.12, points[segment][1]);
        positions.setXYZ(segment * 3 + 2, points[segment + 1][0], elevation(guard) + 0.12, points[segment + 1][1]);
      }
      positions.needsUpdate = true;
    }
    const foggy = rules.weather === 'fog';
    fog.density = foggy ? 0.018 : 0;
    const time = state.timeOfDay ?? rules.timeOfDay ?? 'day';
    const profile = lightingProfile(time);
    const clearWeather = !rules.weather || rules.weather === 'clear';
    if (currentSunDirection !== profile.direction) {
      currentSunDirection = profile.direction;
      sun.position.set(...currentSunDirection.map(value => value * 35));
      fitSunShadow(sun, structure);
      tuneSunShadow(sun.shadow);
    }
    const vision=mapOpen?'off':state.inventory.vision??'off';
    const filmic = currentCamera === firstPerson && vision === 'off';
    renderer.toneMapping = filmic ? THREE.AgXToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = (controls.exposure ?? exposureRange.initial) * profile.exposure;
    sky.update(firstPerson, filmic, time, rules.weather, currentSunDirection);
    sun.intensity = mapOpen ? 3.2 : (time === 'day' && !filmic ? 3.2 : profile.sun) * (clearWeather ? 1 : .46);
    sun.color.setHex(mapOpen ? 0xffebc4 : profile.color);
    ambient.intensity = mapOpen ? 2.5 : (time === 'day' && !filmic ? 1.8 : profile.ambient) * (clearWeather ? 1 : .75);
    renderer.setClearColor(vision==='nightvision'?0x031207:vision==='thermal'?0x040711:time==='day'?0x8eaba9:profile.haze);
    fog.color.setHex(vision==='nightvision'?0x123719:vision==='thermal'?0x070b1a:profile.haze);
    rain.visible = rules.weather === 'rain';
    if (rain.visible) {
      for (let i = 1; i < rainPositions.length; i += 3) rainPositions[i] = (rainPositions[i] - dt * 12 + 15) % 15;
      rainGeo.attributes.position.needsUpdate = true;
    }
    if (filmic && usePost()) {
      post ??= createScenePost(renderer, scene, firstPerson);
      post.draw(dt, preset);
    } else {
      renderer.render(scene, currentCamera);
    }
  }
  return {
    draw, shotEffect, eventEffect, setGraphics,
    // For preview pages: 0 turns the baked contact shading off.
    setContactShading: strength => lighting.setContactStrength(strength),
    capturingLight: lighting.capturing,
    renderStats: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      width: canvas.width,
      height: canvas.height,
    }),
    dispose: () => {
      post?.dispose(); sky.dispose(); lighting.dispose(); surfaceShading?.dispose();
      for (const { mesh } of furnitureRender) if (mesh.isInstancedMesh) mesh.dispose();
      resizeObserver.disconnect(); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('wheel', zoomWheel);
      const geometries = new Set([chipGeometry]), sceneMaterials = new Set(Object.values(materials)), textures = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) sceneMaterials.add(mat);
        object.shadow?.map?.dispose();
      });
      for (const mat of sceneMaterials) { for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value); mat.dispose(); }
      for (const texture of textures) texture.dispose();
      for (const geometry of geometries) geometry.dispose();
      renderer.dispose();
    },
    face: (x, z) => { if (x || z) player.rotation.y = -Math.atan2(z, x); },
    setView: value => { view = value; },
    setMap: value => { mapOpen = value; },
    getFloor: () => selectedLevel,
    setFloor: level => { selectedLevel = Math.max(0, Math.min((map.levels?.length ?? 1) - 1, Math.trunc(level) || 0)); },
    cycleFloor: () => { selectedLevel = (selectedLevel + 1) % (map.levels?.length ?? 1); return map.levels?.[selectedLevel]?.name ?? 'Ground floor'; },
    look: (horizontal, vertical) => { if (view === 'first' && !mapOpen) { yaw -= horizontal; pitch = THREE.MathUtils.clamp(pitch + vertical, -1.35, 1.35); } },
    reset: (heading = -0.55) => { yaw = heading; pitch = 0; recoil = 0; selectedLevel = 0; for (const effect of effects) { scene.remove(effect.mesh); if (effect.disposable) { effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); } } effects.length = 0; },
    movement: (x, z) => view === 'first' ? [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)] : [x, z],
    aim: state => {
      const origin = playerEye(state);
      if (view === 'first') return { origin, direction: [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)] };
      plane.constant = -eyeHeight(state); raycaster.setFromCamera(pointer, mapOpen ? mapCamera : camera);
      const target = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      return { origin, direction: target ? [target.x - origin[0], 0, target.z - origin[2]] : [0, 0, -1] };
    },
  };
}
