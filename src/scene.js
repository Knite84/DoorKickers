import * as THREE from 'three';
import { distance, lineOfSight, obstacles } from './simulation.js';
import { buildWallPieces } from './destruction.js';
import { weapons, items, weaponKey, baseWeapon, isSuppressed } from './kit.js';
import { elevation, eyeHeight, playerEye, doorCenter, doorSize, windowCenter, windowSize, activeProps } from './world.js';
import { sightHalfAngle, sightRangeFactor } from './guard-traits.js';
import { segmentClear } from './combat.js';
import { createGuardVisual } from './npc-visual.js';
import { guardLook } from './npc-shape.js';
import { guardDisabled, guardEye } from './npc-body.js';
import { coverClear } from './guard-tactics.js';
import { createSceneLighting } from './scene-lighting.js';
import { lightingProfile } from './lighting.js';
import { piecesInArea } from './spatial.js';
import { isFurniture, furnitureClass } from './furniture.js';
import { propBroken, decorBroken } from './world.js';
import { tipPose } from './furniture-tip.js';
import { batchFurnitureMeshes, createFurnitureMaterials, furnitureMeshes } from './furniture-mesh.js';
import { createSurfaceShading } from './surface-materials.js';
import { exposureRange, graphicsPresets } from './graphics.js';
import { createSceneSky } from './scene-sky.js';
import { createPaneledDoor } from './door-visual.js';
import { trimFor, trimKinds } from './trim.js';
import { weaponModels, suppressorFor } from './weapon-models.js';
import { handlingFor, createHandling, resetHandling, fireKick, stepHandling, weaponPose, shownItem, drawDrop, cycleProgress, ejectsBetween, scopeUp, fieldOfView, weaponReady, hipPosition } from './weapon-handling.js';
import { stairDressFor, dressKinds, railWalls } from './stair-dress.js';
import { createScenePost } from './scene-post.js';
import { createSceneEffects } from './scene-effects.js';
import { doorFrame, chooseSwing, swingAngle, stepSwing, easeSwing } from './door-swing.js';
import { createRoofMesh } from './roof-mesh.js';
import { createSiteMesh } from './site-mesh.js';
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
  let lookSensitivity = 1, lookInvert = 1, roofShown = true;
  let view = 'first', mapOpen = false, yaw = -0.55, pitch = 0, selectedLevel = 0;
  // Weapon handling (src/weapon-handling.js): springs, aim blend, sway and muzzle climb.
  const hand = createHandling();
  let lastYaw = yaw, lastPitch = pitch, scopedNow = false, ejectQueued = null, lastCycle = null, flashSize = 1, puffQueued = 0;
  let currentCamera = firstPerson;
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.65);
  const pointerMove = event => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    if ((document.pointerLockElement === canvas || (event.buttons & 2) !== 0) && !mapOpen && view === 'first') {
      yaw -= event.movementX * 0.002 * lookSensitivity; pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.002 * lookSensitivity * lookInvert, -1.35, 1.35);
    }
  };
  canvas.addEventListener('pointermove', pointerMove);
  const structure = buildWallPieces(map);
  const lighting = createSceneLighting(map, structure);
  const sky = createSceneSky(renderer, scene, lighting.sunDirection);
  // Impact particles, bullet holes, blood, scorch, explosions and fire (src/scene-effects.js).
  const impactEffects = createSceneEffects({ scene, renderer, lighting, map });
  let drawnState = null, muzzleLight = null;
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
  const hiddenRails = railWalls(map); // drawn as railings instead (src/stair-dress.js)
  const wallBatches = [], wallDisplay = new Uint8Array(structure.length).fill(2);
  fitSunShadow(sun, structure);
  let currentSunDirection = lighting.sunDirection;
  const unitBox = new THREE.BoxGeometry(1, 1, 1), instanceTransform = new THREE.Object3D();
  for (const kind of new Set(structure.map(piece => piece.material))) {
    const indices = structure.flatMap((piece, index) => piece.material === kind ? [index] : []);
    const baseColor = ({ ceiling: 0xd8d7cd, timber: 0xa16d3f, drywall: 0xd5ceb5, particleboard: 0xa68552, truss: 0x79512e, earth: 0x59734c, concrete: 0xaaa99d, deck: 0x8c7253, post: 0x5f6b75, trunk: 0x5b4636 })[kind] ?? 0xb7b198;
    const mesh = new THREE.InstancedMesh(unitBox, material(baseColor), indices.length);
    // Maps that declare room finishes (map.surfaces) get textured floors, paint and siding.
    surfaceShading?.dress(mesh, kind, indices.map(index => structure[index]), baseColor, lighting.decorate);
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
    wallBatches.push({ mesh, indices });
  }
  // Painted trim (src/trim.js): one instanced mesh per kind, each box following
  // the visibility of the wall piece it hangs on (convention 3 in POLISH_PLAN.md).
  const trimBatches = [], trimDisplay = new Map();
  if (map.surfaces) {
    const boxes = [...trimFor(map, structure), ...stairDressFor(map, structure)];
    const paint = (color, roughness) => lighting.decorate(new THREE.MeshStandardMaterial({ color, roughness }));
    const finishes = { baseboard: paint(0xf3f0e8, 0.5), casing: paint(0xf3f0e8, 0.5), doorFrame: paint(0xf3f0e8, 0.5), return: paint(0xf3f0e8, 0.55),
      handrail: paint(0x6b4a30, 0.55), newel: paint(0x6b4a30, 0.55), baluster: paint(0x17191b, 0.4), carpet: paint(0xb7a68c, 1), tread: paint(0x8c7253, 0.8), stringer: paint(0x4e4034, 0.85) };
    for (const kind of [...trimKinds, ...dressKinds]) {
      const items = boxes.filter(item => item.kind === kind);
      if (!items.length) continue;
      const mesh = new THREE.InstancedMesh(unitBox, finishes[kind], items.length);
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
      trimDisplay.set(mesh, new Uint8Array(items.length).fill(2));
      trimBatches.push({ mesh, items });
    }
  }
  // Drawn-only pitched roof (src/roof.js), hidden in the overhead and tactical views.
  const roof = createRoofMesh(map, lighting.decorate);
  if (roof) scene.add(roof);
  // Lawn slopes, retaining walls, porch screens and trees (src/site.js).
  const site = createSiteMesh(map, lighting.decorate, surfaceShading?.grass);
  if (site) scene.add(site.group);
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
  // Swinging doors, drawn only (src/door-swing.js, step 6.2). Each leaf and its cracks
  // hang from a pivot at the hinge end; the simulation still sees open or closed.
  const doorSwings = map.doors.map(() => { const pivot = new THREE.Group(); scene.add(pivot); return { pivot, hinge: 0, side: 1, t: 0, open: false }; });
  let swingState = null;
  function hangDoor(i, hinge) {
    const swingInfo = doorSwings[i], [hx, hz] = doorFrame(map.doors[i]).end(hinge);
    for (const object of [doors[i], doorCracks[i]]) { object.updateWorldMatrix(true, false); scene.attach(object); }
    swingInfo.pivot.rotation.y = 0; swingInfo.pivot.position.set(hx, 0, hz); swingInfo.pivot.updateMatrixWorld(true);
    for (const object of [doors[i], doorCracks[i]]) swingInfo.pivot.attach(object);
    swingInfo.hinge = hinge;
  }
  // Whoever is nearest the door on its floor when it opens: the player or a guard.
  function doorOpener(state, door) {
    const level = Math.round(elevation(door) / 3.2);
    let best = null, nearest = Infinity;
    const consider = (x, z, y) => { if (Math.round((y ?? 0) / 3.2) !== level) return; const d = Math.hypot(x - door.position[0], z - door.position[1]); if (d < nearest) { nearest = d; best = [x, z]; } };
    consider(state.player[0], state.player[1], state.playerY);
    for (const guard of state.guards) if (guard.health > 0) consider(guard.position[0], guard.position[1], guard.elevation);
    return nearest < 3 ? best : null;
  }
  function swingDoors(state, dt) {
    const fresh = swingState !== state;
    swingState = state;
    doorSwings.forEach((swingInfo, i) => {
      const door = map.doors[i], open = !!state.doors[i];
      if (fresh || (open && !swingInfo.open && swingInfo.t === 0)) {
        // A new mission snaps every door; otherwise a door picks its hinge as it starts to open.
        const pick = chooseSwing(state, map, door, fresh ? null : doorOpener(state, door));
        if (pick.hinge !== swingInfo.hinge) hangDoor(i, pick.hinge);
        swingInfo.side = pick.side;
        if (fresh) swingInfo.t = open ? 1 : 0;
      }
      swingInfo.open = open;
      swingInfo.t = stepSwing(swingInfo.t, open, dt);
      swingInfo.pivot.rotation.y = swingAngle(door, swingInfo.hinge, swingInfo.side) * easeSwing(swingInfo.t);
    });
  }
  const weapon = new THREE.Group();
  // First-person items are drawn in front of everything else, so a barrel never
  // pokes through a wall (POLISH_PLAN 5.3). Their depth is squeezed into the front
  // 2% of the range, which keeps the order within the weapon. Wraps any earlier patch.
  const inFront = mat => {
    const previous = mat.onBeforeCompile, previousKey = mat.customProgramCacheKey?.bind(mat);
    mat.onBeforeCompile = (shader, renderer) => {
      previous?.call(mat, shader, renderer);
      shader.vertexShader = shader.vertexShader.replace('#include <logdepthbuf_vertex>', 'gl_Position.z = mix(-gl_Position.w, gl_Position.z, 0.02);\n#include <logdepthbuf_vertex>');
    };
    mat.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}-in-front`;
    return mat;
  };
  const viewMaterials = {};
  const viewMaterial = (color, roughness = 0.7) => viewMaterials[color] ??= inFront(lighting.decorate(new THREE.MeshStandardMaterial({ color, roughness })));
  // Firearm models come from src/weapon-models.js: one group per weapon, shown when equipped.
  // The group's origin is the rear of the grip, which is also the pivot for kick and sway.
  const cylinders = new Map();
  const cylinder = (radius, length) => { const key = radius + ',' + length; if (!cylinders.has(key)) cylinders.set(key, new THREE.CylinderGeometry(radius, radius, length, 12).rotateX(Math.PI / 2)); return cylinders.get(key); };
  const weaponModelGroups = {};
  for (const [id, model] of Object.entries(weaponModels)) {
    const group = new THREE.Group(); group.visible = false; weapon.add(group);
    const suppressorParts = [], moving = { magazine: [], support: [], bolt: [], pump: [] };
    for (const part of model.parts) {
      const mesh = new THREE.Mesh(part.shape === 'box' ? new THREE.BoxGeometry(...part.size) : cylinder(part.radius, part.length), viewMaterial(part.color));
      mesh.position.set(...part.position); if (part.rotation) mesh.rotation.set(...part.rotation);
      group.add(mesh); if (part.role === 'suppressor') suppressorParts.push(mesh);
      if (part.moves) moving[part.moves].push({ mesh, base: mesh.position.clone() });
    }
    // A shell for the shotgun's loading animation.
    let shell = null;
    if (handlingFor(id)?.reload === 'shells') { shell = new THREE.Mesh(cylinder(model.casing[0], model.casing[1]), viewMaterial(model.casing[2])); shell.visible = false; group.add(shell); }
    weaponModelGroups[id] = { group, suppressorParts, moving, shell, muzzle: model.muzzle };
  }
  // Muzzle flash: a star facing the eye plus two crossed flame planes along the barrel,
  // drawn additively with a random turn and size each shot.
  const canvasTexture = (width, height, paint) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; paint(canvas.getContext('2d'), width, height); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture; };
  const starTexture = canvasTexture(128, 128, (g, w, h) => {
    const glow = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(255,255,240,1)'); glow.addColorStop(0.25, 'rgba(255,214,140,0.9)'); glow.addColorStop(0.6, 'rgba(255,140,40,0.25)'); glow.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2); g.fillStyle = 'rgba(255,225,160,0.85)';
    for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-5, 0); g.lineTo(0, -w * (i % 2 ? 0.34 : 0.48)); g.lineTo(5, 0); g.fill(); }
  });
  const flameTexture = canvasTexture(64, 128, (g, w, h) => {
    g.translate(w / 2, h); g.scale(1, h / w * 1.4);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    glow.addColorStop(0, 'rgba(255,250,225,1)'); glow.addColorStop(0.4, 'rgba(255,190,90,0.8)'); glow.addColorStop(1, 'rgba(255,110,20,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(0, 0, w / 2, 0, Math.PI * 2); g.fill();
  });
  const flashMaterials = [
    inFront(new THREE.SpriteMaterial({ map: starTexture, color: 0xffe0b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })),
    inFront(new THREE.MeshBasicMaterial({ map: flameTexture, color: 0xffd2a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, fog: false })),
  ];
  // Brighter than white, so the flash still reads against a sunlit room after tone mapping.
  for (const mat of flashMaterials) mat.color.multiplyScalar(4);
  const flamePlane = new THREE.PlaneGeometry(0.14, 0.42).rotateX(-Math.PI / 2).translate(0, 0, -0.2);
  function makeFlash() {
    const group = new THREE.Group(), star = new THREE.Sprite(flashMaterials[0]);
    star.scale.setScalar(0.3); group.add(star);
    for (const turn of [0, Math.PI / 2]) { const plane = new THREE.Mesh(flamePlane, flashMaterials[1]); plane.rotation.z = turn; group.add(plane); }
    group.visible = false; return group;
  }
  const flash = makeFlash(); weapon.add(flash);
  firstPerson.add(weapon);
  const minigun = new THREE.Group(), rotor = new THREE.Group();
  const minigunBase = [0.3, -0.35, -0.65];
  minigun.position.set(...minigunBase); minigun.add(rotor); firstPerson.add(minigun);
  const miniBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.4), viewMaterial(0x323b3d));
  miniBody.position.z = 0.13; minigun.add(miniBody);
  for (let barrel = 0; barrel < 6; barrel++) {
    const angle = barrel * Math.PI / 3;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.8, 10), viewMaterial(0x172022));
    tube.rotation.x = Math.PI / 2; tube.position.set(Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, -0.35); rotor.add(tube);
  }
  for (const z of [-0.05, -0.6]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 18), viewMaterial(0x56615d));
    collar.position.z = z; rotor.add(collar);
  }
  const miniHandle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.19, 0.12), viewMaterial(0x172022));
  miniHandle.position.set(0, 0.2, 0.15); minigun.add(miniHandle);
  const miniFlash = makeFlash(); miniFlash.position.z = -0.78; minigun.add(miniFlash);
  // Spent casings leave the ejection port in world space and are handed to the loose
  // bits in src/scene-effects.js, which bounce them off the house and let them lie (step 6.2).
  const portWorld = new THREE.Vector3(), cameraRight = new THREE.Vector3(), cameraUp = new THREE.Vector3(), cameraBack = new THREE.Vector3(), casingVelocity = new THREE.Vector3();
  function ejectCasing(id) {
    const model = weaponModels[id], shown = weaponModelGroups[id];
    if (!model || !shown) return;
    shown.group.updateWorldMatrix(true, false);
    portWorld.set(...model.port); shown.group.localToWorld(portWorld);
    cameraRight.set(1, 0, 0).applyQuaternion(firstPerson.quaternion); cameraUp.set(0, 1, 0).applyQuaternion(firstPerson.quaternion); cameraBack.set(0, 0, 1).applyQuaternion(firstPerson.quaternion);
    casingVelocity.copy(cameraRight).multiplyScalar(1.1 + Math.random() * 0.5).addScaledVector(cameraUp, 1.3 + Math.random() * 0.5).addScaledVector(cameraBack, -0.5);
    impactEffects.casing(portWorld, casingVelocity, model.casing[0], model.casing[1], model.casing[2]);
  }
  // A small smoke puff left at the muzzle; dimmer at dusk and night so it never glows.
  const puffTexture = canvasTexture(64, 64, (g, w, h) => { const glow = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); glow.addColorStop(0, 'rgba(255,255,255,0.8)'); glow.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = glow; g.fillRect(0, 0, w, h); });
  const puffPool = Array.from({ length: 8 }, () => { const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture, color: 0x9a9890, transparent: true, depthWrite: false, opacity: 0 })); sprite.visible = false; scene.add(sprite); return { sprite, life: 0, strength: 0 }; });
  let nextPuff = 0;
  const flashWorld = new THREE.Vector3();
  function stepPuffs(dt, shade) {
    for (const puff of puffPool) {
      if (!puff.sprite.visible) continue;
      puff.life -= dt;
      if (puff.life <= 0) { puff.sprite.visible = false; continue; }
      const age = 1 - puff.life / 0.7;
      puff.sprite.scale.setScalar(0.06 + 0.3 * age); puff.sprite.position.y += dt * 0.25;
      puff.sprite.material.opacity = puff.strength * (1 - age); puff.sprite.material.color.setScalar(0.6 * shade);
    }
  }
  const heldItems = {};
  function heldBox(group, position, size, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), viewMaterial(color)); mesh.position.set(...position); group.add(mesh); return mesh;
  }
  for (const id of Object.keys(items)) {
    const group = new THREE.Group(); group.position.set(0.32, -0.3, -0.65); firstPerson.add(group); heldItems[id] = group;
    if (id === 'axe') { heldBox(group, [0, -0.1, 0], [0.04, 0.65, 0.04], 0x956a43); heldBox(group, [0.04, 0.22, 0], [0.3, 0.14, 0.06], 0xb84836); }
    else if (id === 'crowbar') { heldBox(group, [0, 0, 0], [0.035, 0.6, 0.035], 0x858e87); heldBox(group, [0.05, 0.28, 0], [0.12, 0.04, 0.035], 0x858e87); }
    else if (id === 'pickgun') { heldBox(group, [0, 0, 0], [0.12, 0.12, 0.2], 0x65747c); heldBox(group, [0, -0.1, 0.04], [0.07, 0.18, 0.08], 0x283331); heldBox(group, [0, 0.02, -0.19], [0.015, 0.015, 0.2], 0xc4c9c2); }
    else if (id === 'knife') { heldBox(group, [0, -0.12, 0], [0.05, 0.2, 0.07], 0x3a453a); heldBox(group, [0, 0.03, 0], [0.12, 0.025, 0.09], 0x7b8685); const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.36, 3), viewMaterial(0xc2cdca)); blade.position.y = 0.21; blade.scale.z = 0.3; group.add(blade); }
    else if (id === 'medkit') { heldBox(group, [0, 0, 0], [0.3, 0.22, 0.12], 0xb6c4ac); heldBox(group, [0, 0, 0.066], [0.14, 0.035, 0.015], 0xc55f49); heldBox(group, [0, 0, 0.066], [0.035, 0.14, 0.015], 0xc55f49); }
    else if (id === 'molotov') { const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.32, 10), viewMaterial(0x805c35)); group.add(bottle); heldBox(group, [0, 0.2, 0], [0.04, 0.12, 0.04], 0xd4c9ab); }
    else if (id === 'detcord') { const spool = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 18), viewMaterial(0xc48e55)); group.add(spool); }
    else heldBox(group, [0, 0, 0], id === 'claymore' ? [0.28, 0.18, 0.08] : [0.09, 0.18, 0.09], id === 'flashbang' ? 0xaab0a5 : 0x516344);
  }
  const dynamicMeshes = new Map();
  const deviceGeometry = new THREE.BoxGeometry(0.25, 0.15, 0.12);
  const projectileGeometry = new THREE.SphereGeometry(0.09, 8, 6);
  const fireGeometry = new THREE.ConeGeometry(0.35, 0.8, 6);
  function syncDynamic(state) {
    const active = new Set();
    // Fires are drawn by src/scene-effects.js as flames and smoke.
    for (const object of [...state.devices, ...state.projectiles]) {
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
  function shotEffect(shot, state = drawnState) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...shot.origin), new THREE.Vector3(...shot.position)]), new THREE.LineBasicMaterial({ color: 0xffdf9a, transparent: true, opacity: 0.85 }));
    scene.add(line); effects.push({ mesh: line, life: 0.075, disposable: true });
    if (!state) return;
    impactEffects.shot(shot, state);
    if (shot.removed?.length) impactEffects.breach(shot.removed.filter(piece => piece && piece.center), state);
  }
  function eventEffect(event, state = drawnState) {
    if (event.type === 'footstep') return;   // heard, not drawn
    if (impactEffects.event(event, state)) return;
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
  const furnished = [...map.props.map((prop, index) => ({ prop, owner: { kind: 'prop', index } })), ...(map.decor ?? []).map((prop, index) => ({ prop, owner: { kind: 'decor', index } }))];
  const furnitureParts = [];
  const fixtureMeshes = new Map();
  for (const { prop, owner } of furnished) {
    if (!isFurniture(prop)) continue;
    const meshes = furnitureMeshes(prop, furnitureMaterial, glass);
    meshes.forEach(mesh => {
      furnitureParts.push({ prop, mesh, owner });
      if (mesh.userData.fixture) fixtureMeshes.set(mesh.position.toArray().join(','), mesh);
    });
  }
  const furnitureRender = batchFurnitureMeshes(furnitureParts);
  furnitureRender.forEach(({ mesh }) => scene.add(mesh));
  // Tipped chairs and stools (src/furniture-tip.js): every part of the piece turns about the
  // floor edge it falls over. Each prop's parts, batched or single, with their standing matrix.
  const propParts = new Map();
  for (const { mesh } of furnitureRender) {
    if (mesh.isInstancedMesh) mesh.userData.owners?.forEach((owner, instance) => { if (owner.kind === 'prop') { if (!propParts.has(owner.index)) propParts.set(owner.index, []); propParts.get(owner.index).push({ mesh, instance, base: mesh.userData.matrices[instance] }); } });
    else if (mesh.userData.owner?.kind === 'prop') { mesh.updateMatrix(); const index = mesh.userData.owner.index; if (!propParts.has(index)) propParts.set(index, []); propParts.get(index).push({ mesh, base: mesh.matrix.clone() }); }
  }
  const tipMatrix = new THREE.Matrix4(), tipStep = new THREE.Matrix4(), tipAxis = new THREE.Vector3(), tipPart = new THREE.Matrix4();
  const tipShown = new Map();   // prop index -> angle drawn
  let tipState = null;
  function placeParts(index, matrix) {
    for (const part of propParts.get(index) ?? []) {
      if (part.instance !== undefined) {
        // A broken piece stays hidden (scale zero); only standing or tipped pieces are placed.
        if (propBroken(tipState, index)) continue;
        part.mesh.setMatrixAt(part.instance, matrix ? tipPart.multiplyMatrices(matrix, part.base) : part.base); part.mesh.instanceMatrix.needsUpdate = true;
      } else {
        part.mesh.matrixAutoUpdate = !matrix;
        if (matrix) { part.mesh.matrix.multiplyMatrices(matrix, part.base); part.mesh.matrixWorldNeedsUpdate = true; }
      }
    }
  }
  function applyTips(state) {
    if (tipState !== state) { const old = [...tipShown.keys()]; tipState = state; for (const index of old) placeParts(index, null); tipShown.clear(); }
    for (const [key, tip] of Object.entries(state.propTipped ?? {})) {
      const index = Number(key), pose = tipPose(map.props[index], tip, state.elapsed ?? 0);
      if (tipShown.get(index) === pose.angle) continue;
      tipShown.set(index, pose.angle);
      tipAxis.set(...pose.axis).normalize();
      tipMatrix.makeTranslation(...pose.pivot).multiply(tipStep.makeRotationAxis(tipAxis, pose.angle)).multiply(tipStep.makeTranslation(-pose.pivot[0], -pose.pivot[1], -pose.pivot[2]));
      placeParts(index, tipMatrix);
    }
  }
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
  // Broken furniture (POLISH_PLAN 6.5): hidden inside its batch, and a low pile drawn in its place.
  // Damage darkens a piece; decor (TVs, mirrors, rugs) has no pile, it just disappears.
  const debrisPiles = new Map(), furnitureSeen = { state: null, stamp: -1 };
  const pileColors = { soft: 0x756f62, wood: 0x6a4a30, heavy: 0x575b5d, fixture: 0xcfd1cf };
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0), tintColor = new THREE.Color();
  function debrisPile(prop, index) {
    const pile = new THREE.Group(), [w, d] = prop.size, base = elevation(prop), color = pileColors[furnitureClass(prop)] ?? 0x666666;
    // A scatter of shards, deterministic per piece, peaking near 0.9 m in the middle.
    for (let i = 0; i < 7; i++) {
      const u = Math.sin(index * 12.9898 + i * 78.233) * 43758.5453, r = u - Math.floor(u), v = (Math.sin(index * 4.1 + i * 9.7) * 9973) % 1;
      const px = (r - 0.5) * w * 0.8, pz = (Math.abs(v) - 0.5) * d * 0.8, height = 0.25 + 0.65 * (1 - Math.min(1, Math.hypot(px / (w / 2), pz / (d / 2))));
      const shard = new THREE.Mesh(unitBox, material(i % 3 === 0 ? color + 0x101010 : color, 1));
      shard.scale.set(Math.max(0.12, w * (0.22 + 0.12 * Math.abs(v))), height, Math.max(0.12, d * (0.25 + 0.1 * r)));
      shard.position.set(prop.position[0] + px, base + height / 2, prop.position[1] + pz);
      shard.rotation.y = r * 3;
      shard.castShadow = true; shard.receiveShadow = true;
      pile.add(shard);
    }
    pile.visible = false; scene.add(pile); debrisPiles.set(index, pile);
  }
  function syncFurniture(state) {
    if (furnitureSeen.state === state && furnitureSeen.stamp === state.propStamp) return;
    furnitureSeen.state = state; furnitureSeen.stamp = state.propStamp;
    const health = owner => owner.kind === 'prop' ? [state.propHealth?.[owner.index], state.propMaxHealth?.[owner.index]] : [state.decorHealth?.[owner.index], state.decorMaxHealth?.[owner.index]];
    for (const { mesh } of furnitureRender) {
      if (mesh.isInstancedMesh) {
        const { owners, matrices, state: shown } = mesh.userData;
        let moved = false, tinted = false;
        owners.forEach((owner, instance) => {
          const [now, max] = health(owner), alive = !(now <= 0), tint = alive && Number.isFinite(max) ? 1 - 0.5 * (1 - now / max) : 1;
          if (shown[instance].shown !== Number(alive)) { mesh.setMatrixAt(instance, alive ? matrices[instance] : zeroMatrix); shown[instance].shown = Number(alive); moved = true; }
          if (Math.abs(shown[instance].tint - tint) > 0.04) { mesh.setColorAt(instance, tintColor.setScalar(tint)); shown[instance].tint = tint; tinted = true; }
        });
        if (moved) mesh.instanceMatrix.needsUpdate = true;
        if (tinted && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      } else if (mesh.userData.owner) {
        // Pieces drawn as single meshes (glass, fixtures, lamps) share materials, so the first
        // time one is damaged it gets its own copy, which darkens like the batched pieces do.
        const [now, max] = health(mesh.userData.owner), alive = !(now <= 0);
        mesh.userData.broken = !alive;
        const tint = alive && Number.isFinite(max) ? 1 - 0.5 * (1 - now / max) : 1;
        if (Math.abs((mesh.userData.tint ?? 1) - tint) > 0.04 && mesh.material?.color) {
          if (!mesh.userData.ownMaterial) {
            const shared = mesh.material, own = shared.clone();
            // clone() leaves out the shader patches (lighting, rounded edges); keep them.
            own.onBeforeCompile = shared.onBeforeCompile; own.customProgramCacheKey = shared.customProgramCacheKey;
            mesh.material = own; mesh.userData.ownMaterial = true; mesh.userData.baseColor = shared.color.clone();
          }
          mesh.material.color.copy(mesh.userData.baseColor).multiplyScalar(tint); mesh.userData.tint = tint;
        }
      }
    }
    map.props.forEach((prop, index) => { if (propBroken(state, index) && !debrisPiles.has(index) && isFurniture(prop)) debrisPile(prop, index); });
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
  // Skinned guard bodies (step 5.1): one shared vertex-colour material, warm in thermal.
  // Each guard's outfit depends on the mission, so its body is rebuilt in draw() when the
  // mission or the guard changes (rebuildGuard below); these start as placeholders.
  const guardBodyMaterial = lighting.decorate(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 0.9);
  const lookSeeds = new WeakMap();   // missions without a seed still get one look per deployment
  function rebuildGuard(i, state, guard) {
    const seed = state.missionSeed || (lookSeeds.has(state) ? lookSeeds.get(state) : lookSeeds.set(state, Math.floor(Math.random() * 1e6)).get(state));
    const key = `${seed}:${guard.id}:${!!guard.armored}`;
    if (guards[i].userData.lookKey === key) return;
    const old = guards[i], fresh = createGuardVisual(heatMaterial, { body: 'skinned', look: guardLook(map.id, guard, seed), bodyMaterial: guardBodyMaterial });
    fresh.userData.lookKey = key; fresh.visible = old.visible;
    scene.remove(old); old.traverse(object => { if (object.isSkinnedMesh) { object.geometry.dispose(); object.skeleton.dispose(); } });
    scene.add(fresh); guards[i] = fresh;
  }
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
  const feelOffset = new THREE.Vector3();
  function draw(state, rules, dt, controls = {}) {
    lighting.update(state,rules,mapOpen);
    currentCamera = mapOpen ? mapCamera : view === 'first' ? firstPerson : camera;
    firstPerson.position.set(...playerEye(state));
    // Movement feel (src/player-motion.js): drawn only, in first person, never in cover.
    const feel = view === 'first' && !mapOpen && !(state.playerCover && !state.playerCover.peeking) ? controls.feel : null;
    if (feel) firstPerson.position.add(feelOffset.set(Math.cos(yaw) * feel.side, feel.up, -Math.sin(yaw) * feel.side));
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
    // Weapon handling (src/weapon-handling.js). Mouse movement since the last frame
    // drives the look lag; muzzle climb was already added to pitch and yaw by fired().
    const firstView = view === 'first' && !mapOpen;
    const equipped = state.inventory.equipped, shownId = shownItem(state, rules), spec = weapons[shownId], config = state.inventory.weapons[shownId];
    // The exact gun shown: 'pistol:mk23' for the chosen pistol model.
    const shownKey = weaponKey(state.inventory, shownId);
    const steadyHands = state.status === 'active' && weaponReady(state, rules) && !(state.reloadUntil > state.elapsed) && shownId === equipped;
    const aimedNow = !!controls.aimed && firstView && !!spec && steadyHands;
    const recovery = stepHandling(hand, dt, shownKey, { aimed: aimedNow, look: firstView ? { yaw: yaw - lastYaw, pitch: pitch - lastPitch } : { yaw: 0, pitch: 0 } });
    if (firstView) { yaw += recovery.yaw; pitch = THREE.MathUtils.clamp(pitch + recovery.pitch, -1.35, 1.35); }
    lastYaw = yaw; lastPitch = pitch;
    firstPerson.rotation.set(pitch, yaw, feel ? -feel.roll : 0);
    scopedNow = aimedNow && shownId === 'sniper' && scopeUp(hand);
    const fov = fieldOfView(hand, spec ? shownKey : null, { scoped: scopedNow, zoom: controls.scopeZoom ?? 4 });
    if (Math.abs(firstPerson.fov - fov) > 1e-4) { firstPerson.fov = fov; firstPerson.updateProjectionMatrix(); }
    const strike = state.status === 'active' ? Math.sin(Math.PI * Math.max(0, Math.min(1, ((state.meleeUntil ?? 0) - state.elapsed) / .65))) : 0;
    const bob = controls.feel ? controls.feel.weapon : Math.sin(state.elapsed * (controls.running ? 14 : 9)) * (controls.moving ? 0.008 : 0);
    const inCover = !!(state.playerCover && !state.playerCover.peeking);
    const pose = weaponPose(hand, state, rules, shownKey, { bob, cover: inCover, strike });
    const shown = weaponModelGroups[shownKey];
    for (const [id, entry] of Object.entries(weaponModelGroups)) entry.group.visible = id === shownKey;
    weapon.position.set(...pose.position); weapon.rotation.set(...pose.rotation);
    if (shown) {
      shown.suppressorParts.forEach(mesh => { mesh.visible = !!config?.suppressor; });
      const quiet = isSuppressed(state.inventory, shownId);
      const offsets = { magazine: pose.parts.magazine.offset, support: pose.parts.support, bolt: pose.parts.bolt, pump: pose.parts.pump };
      for (const [kind, list] of Object.entries(shown.moving)) for (const { mesh, base } of list) {
        mesh.position.set(base.x + offsets[kind][0], base.y + offsets[kind][1], base.z + offsets[kind][2]);
        if (kind === 'magazine') mesh.visible = pose.parts.magazine.visible;
      }
      if (shown.shell) { shown.shell.visible = !!pose.parts.shell; if (pose.parts.shell) shown.shell.position.set(...pose.parts.shell); }
      flash.position.set(shown.muzzle[0], shown.muzzle[1], shown.muzzle[2] - (quiet ? suppressorFor(shownKey) : 0) - 0.02);
    }
    const weaponVisible = !!spec && firstView && !scopedNow && !controls.menuVisible;
    weapon.visible = weaponVisible && shownId !== 'minigun';
    minigun.visible = weaponVisible && shownId === 'minigun';
    minigun.position.set(minigunBase[0] + pose.position[0] - hipPosition[0], minigunBase[1] + pose.position[1] - hipPosition[1], minigunBase[2] + pose.position[2] - hipPosition[2]);
    minigun.rotation.set(pose.rotation[0] * 0.5, pose.rotation[1], pose.rotation[2] * 0.6);
    if (shownId === 'minigun' && controls.firing && steadyHands && (state.ammo > 0 || rules.unlimitedAmmo)) rotor.rotation.z += dt * 35;
    // Thrown items and tools only lower and rise with a switch.
    const drop = drawDrop(state, rules);
    for (const [id, model] of Object.entries(heldItems)) {
      model.visible = id === shownId && firstView && !controls.menuVisible;
      model.position.y = -0.3 - 0.3 * drop + bob; model.rotation.x = -0.9 * drop - (inCover ? 0.7 : 0);
    }
    // Casings leave on the shot (rifle, pistol) or partway through the bolt or pump.
    const cycle = cycleProgress(state, shownKey);
    if (firstView && ejectsBetween(lastCycle, cycle)) ejectCasing(shownKey);
    lastCycle = cycle;
    if (ejectQueued) { if (firstView && ejectQueued === shownKey) ejectCasing(shownKey); ejectQueued = null; }
    // Flash, puff and the brief light on nearby walls.
    const flashAge = hand.time - hand.lastShot, flashing = flashAge < 0.05 && state.status === 'active' && !isSuppressed(state.inventory, shownId) && hand.lastWeapon === shownKey && firstView;
    const activeFlash = shownId === 'minigun' ? miniFlash : flash;
    flash.visible = flashing && activeFlash === flash && weapon.visible;
    miniFlash.visible = flashing && activeFlash === miniFlash && minigun.visible;
    if (puffQueued || flashing) { firstPerson.updateMatrixWorld(true); activeFlash.getWorldPosition(flashWorld); }
    if (puffQueued && firstView) {
      const puff = puffPool[nextPuff++ % puffPool.length];
      puff.sprite.position.copy(flashWorld); puff.life = 0.7; puff.strength = puffQueued; puff.sprite.visible = true;
    }
    puffQueued = 0;
    muzzleLight = flashing ? { position: flashWorld.toArray(), color: [1, 0.68, 0.36], strength: flashSize * (1 - flashAge / 0.05), radius: 4.5 } : null;
    stepPuffs(dt, Math.max(0.25, lightingProfile(state.timeOfDay ?? rules.timeOfDay ?? 'day').daylight ?? 1));
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.life -= dt;
      if (effect.velocity) { effect.velocity.y -= dt * 8; effect.mesh.position.addScaledVector(effect.velocity, dt); effect.mesh.position.y = Math.max(0.1, effect.mesh.position.y); effect.mesh.rotation.x += dt * 3; }
      if (effect.life <= 0) { scene.remove(effect.mesh); if (effect.disposable) { effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); } effects.splice(i, 1); }
    }
    for (const { mesh, indices } of wallBatches) {
      let changed = false;
      indices.forEach((index, instance) => {
        const piece = state.wallPieces[index], visible = Number(piece.hp > 0 && !hiddenRails.has(piece.wall) && !piece.slope && !piece.tree && !piece.open && (!overview || !piece.ceiling&&(piece.stair || (piece.level ?? 0) === selectedLevel)));
        if (wallDisplay[index] === visible) return;
        wallDisplay[index] = visible; instanceTransform.position.set(...piece.center); instanceTransform.scale.set(...(visible ? piece.size : [0, 0, 0]));
        instanceTransform.updateMatrix(); mesh.setMatrixAt(instance, instanceTransform.matrix); changed = true;
      });
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    }
    for (const { mesh, items } of trimBatches) {
      const shown = trimDisplay.get(mesh); let changed = false;
      items.forEach((item, instance) => {
        const piece = state.wallPieces[item.piece], visible = Number(piece.hp > 0 && (!overview || !piece.ceiling && (piece.stair || (piece.level ?? 0) === selectedLevel)));
        if (shown[instance] === visible) return;
        shown[instance] = visible; instanceTransform.position.set(...item.center); instanceTransform.scale.set(...(visible ? item.size : [0, 0, 0]));
        // Sloped stair rails carry a rotation (src/stair-dress.js); everything else is axis-aligned.
        instanceTransform.rotation.set(...(item.rotation ?? [0, 0, 0]));
        instanceTransform.updateMatrix(); mesh.setMatrixAt(instance, instanceTransform.matrix); changed = true;
      });
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    }
    instanceTransform.rotation.set(0, 0, 0);
    windowMeshes.forEach((mesh, i) => { mesh.visible = state.windowHealth[i] > 0 && onLevel(map.windows[i]); windowFrames[i].forEach(frame => { frame.visible = onLevel(map.windows[i]); }); });
    propMeshes.forEach((meshes, i) => meshes.forEach(mesh => { mesh.visible = onLevel(map.props[i]) && !(overview && mesh.userData.overhead); }));
    syncFurniture(state);
    applyTips(state);
    furnitureRender.forEach(({ prop, mesh }) => { mesh.visible = onLevel(prop) && !(overview && mesh.userData.overhead) && !mesh.userData.broken; });
    for (const [index, pile] of debrisPiles) pile.visible = propBroken(state, index) && onLevel(map.props[index]);
    syncDynamic(state);
    const exposed=playerEye(state);
    player.position.set(state.player[0], state.playerY ?? 0, state.player[1]); player.scale.y = state.playerCover&&!state.playerCover.peeking ? 0.51 : state.crouched&&!state.playerCover ? 0.65 : 1;
    playerLean.set(exposed[0]-state.player[0],0,exposed[2]-state.player[1]).applyAxisAngle(playerUp,-player.rotation.y);
    player.children[0].position.set(playerLean.x*.5,.85,playerLean.z*.5);
    player.children[0].quaternion.setFromUnitVectors(playerUp,playerLean.clone().setY(1).normalize());
    player.children[1].position.set(playerLean.x,1.65,playerLean.z);
    player.children[2].position.set(.27+playerLean.x*.6,1.15,playerLean.z*.6);
    player.visible = overview && Math.round((state.playerY ?? 0) / 3.2) === selectedLevel;
    swingDoors(state, dt);
    doors.forEach((mesh, i) => {
      // An open door stays drawn, swung against the wall; only a broken one is gone.
      mesh.visible = state.doorHealth[i] > 0 && onLevel(map.doors[i]);
      const damage = 1 - state.doorHealth[i] / state.doorMaxHealth[i];
      mesh.material.color.copy(doorColor).lerp(damagedDoorColor, damage);
      doorCracks[i].visible = mesh.visible && damage > 0;
      doorCracks[i].material.opacity = Math.min(1, damage * 2);
    });
    objective.visible = !state.collected && onLevel(map.objective);
    // Marks follow what they sit on: wall pieces, closed doors, intact furniture, the shown floor.
    drawnState = state;
    impactEffects.update(dt, currentCamera, state, owner => {
      switch (owner.kind) {
        case 'piece': return wallDisplay[owner.index] === 1;
        // Bullet holes on a door are drawn where it hangs closed, so they wait for it to shut.
        case 'door': return doors[owner.index]?.visible && doorSwings[owner.index].t === 0;
        case 'prop': return !propBroken(state, owner.index) && onLevel(map.props[owner.index]);
        case 'decor': return !decorBroken(state, owner.index) && onLevel(map.decor[owner.index]);
        case 'world': return !overview || owner.level === undefined || owner.level === selectedLevel;
        default: return false;
      }
    }, { daylight: Math.max(0.2, lightingProfile(state.timeOfDay ?? rules.timeOfDay ?? 'day').daylight ?? 1), vision: mapOpen ? 'off' : state.inventory.vision });
    lighting.setDynamicLights([...(muzzleLight ? [muzzleLight] : []), ...impactEffects.lights()].slice(0, 4));
    objective.rotation.y += dt * 0.6;
    extraction.material.opacity = state.collected ? 0.7 + Math.sin(state.elapsed * 4) * 0.25 : 0.4;
    grid.visible = rules.floorPlan && overview; grid.position.y = selectedLevel * 3.2 + 0.08;
    labels.forEach((l, i) => { l.visible = grid.visible && onLevel(map.rooms[i]); });
    extraction.visible = onLevel(map.extraction); extractionLabel.visible = grid.visible && onLevel(map.extraction);
    scenery.forEach(mesh => { mesh.visible = !overview || selectedLevel === 0; });
    if (roof) roof.visible = !overview && roofShown;
    site?.update(overview, selectedLevel);
    for (let i = 0; i < 8; i++) {
      const guard = state.guards[i];
      if (guard) rebuildGuard(i, state, guard);
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
      const boxes = obstacles(map, state.doors, piecesInArea(state.wallPieces, guard.position[0] - reach, guard.position[0] + reach, guard.position[1] - reach, guard.position[1] + reach), false, elevation(guard), 1.8, [], activeProps(state, map));
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
    // A shot left the gun (once per trigger pull, not per pellet). With climb on,
    // the aim lifts; the weapon kicks, flashes and ejects either way.
    fired: (id, { aimed = false, crouched = false, climb = true, suppressed = false } = {}) => {
      const lift = fireKick(hand, id, { aimed, crouched, climb: climb && view === 'first' && !mapOpen });
      yaw += lift.yaw; pitch = THREE.MathUtils.clamp(pitch + lift.pitch, -1.35, 1.35);
      lastYaw = yaw; lastPitch = pitch;
      flashSize = ({ shotgun: 1.4, sniper: 1.25, pistol: 0.75, minigun: 0.9, 'pistol:mk23': 0.9 })[id] ?? ({ pistol: 0.75 })[baseWeapon(id)] ?? 1;
      for (const group of [flash, miniFlash]) { group.rotation.z = Math.random() * Math.PI; group.scale.setScalar(flashSize * (0.8 + Math.random() * 0.4)); }
      if (!handlingFor(id)?.cycle && id !== 'minigun') ejectQueued = id;
      puffQueued = suppressed ? 0.1 : 0.22;
    },
    // For sound (step 6.4): casing and debris landings and bullet impacts since the last call.
    takeLandings: () => impactEffects.takeLandings(),
    takeImpacts: () => impactEffects.takeImpacts(),
    // For preview pages: how many marks and chips are alive.
    effectCounts: () => impactEffects.count(),
    // True while the sniper scope overlay should show (the scope has reached the eye).
    scoped: () => scopedNow,
    // For preview pages: 0 turns the baked contact shading off.
    setContactShading: strength => lighting.setContactStrength(strength),
    // Preview switch for before/after comparisons of baseboards and casings.
    setTrim: on => trimBatches.forEach(({ mesh }) => { mesh.visible = !!on; }),
    setRoof: on => { roofShown = !!on; },
    capturingLight: lighting.capturing,
    renderStats: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      width: canvas.width,
      height: canvas.height,
    }),
    dispose: () => {
      post?.dispose(); sky.dispose(); lighting.dispose(); surfaceShading?.dispose(); impactEffects.dispose();
      for (const { mesh } of furnitureRender) if (mesh.isInstancedMesh) mesh.dispose();
      resizeObserver.disconnect(); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('wheel', zoomWheel);
      const geometries = new Set(), sceneMaterials = new Set(Object.values(materials)), textures = new Set();
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
    // Mouse look scale and vertical inversion (src/settings.js).
    setLook: ({ sensitivity = 1, invertY = false } = {}) => { lookSensitivity = sensitivity; lookInvert = invertY ? -1 : 1; },
    look: (horizontal, vertical) => { if (view === 'first' && !mapOpen) { yaw -= horizontal; pitch = THREE.MathUtils.clamp(pitch + vertical, -1.35, 1.35); } },
    reset: (heading = -0.55) => { impactEffects.reset(); yaw = lastYaw = heading; pitch = lastPitch = 0; resetHandling(hand); lastCycle = null; ejectQueued = null; puffQueued = 0; for (const puff of puffPool) puff.sprite.visible = false; selectedLevel = 0; for (const effect of effects) { scene.remove(effect.mesh); if (effect.disposable) { effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); } } effects.length = 0; },
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
