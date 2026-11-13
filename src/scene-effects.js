// Impact effects, marks, explosions and fire (POLISH_PLAN step 6.1): the Three.js glue.
// What to spawn comes from src/impacts.js; this file only draws it.
//
// Everything is pooled and drawn in a few batches, so a minigun burst costs no
// more draw calls than a single shot:
// - chips: one InstancedMesh of small lit boxes (bits, splinters, shards, debris)
// - casings: one InstancedMesh of small cylinders (spent brass and shotgun hulls)
// Chips and casings bounce off the house and come to rest (src/loose-bits.js, step 6.2).
// - puffs: one Points cloud, normal blending (dust, smoke, fluff, blood mist)
// - glows: one Points cloud, additive (fire, fireballs, flashes, sparks)
// - marks: one InstancedMesh of lit quads from a painted atlas (holes, blood, scorch)
// Marks follow the visibility of what they sit on (POLISH_PLAN rendering convention 3).
import * as THREE from 'three';
import { recipes, shotMarks, blastMarks, breakEffect, markCells, fraction } from './impacts.js';
import { supportHeight } from './world.js';
import { looseBits, stepBits, wakeBits } from './loose-bits.js';
import { damageCount } from './spatial.js';

export const effectLimits = { chips: 500, casings: looseBits.limit.casing, puffs: 500, glows: 400, marks: 400 };

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = list => list[Math.floor(Math.random() * list.length)];

export function createSceneEffects({ scene, renderer, lighting, map }) {
  const color = new THREE.Color(), dummy = new THREE.Object3D(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const disposables = [];

  // ---- chips and casings (loose bits) ----------------------------------------
  // Each item wraps a loose bit (position, velocity, radius, life) with how it is drawn.
  function bitPool(geometry, count, roughness, metalness = 0) {
    const material = lighting.decorate(new THREE.MeshStandardMaterial({ roughness, metalness }));
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
    for (let i = 0; i < count; i++) { mesh.setMatrixAt(i, zero); mesh.setColorAt(i, color.set(0xffffff)); }
    scene.add(mesh); disposables.push(material, geometry);
    const items = Array.from({ length: count }, () => ({ bit: { position: [0, 0, 0], velocity: [0, 0, 0], radius: 0.01, life: 0, kind: 'debris', resting: false }, max: 1, rotation: new THREE.Euler(), spin: new THREE.Vector3(), scale: new THREE.Vector3(), laid: false, cleared: true }));
    return { mesh, items, next: 0 };
  }
  const chipPool = bitPool(new THREE.BoxGeometry(1, 1, 1), effectLimits.chips, 0.8);
  // Casings: a unit cylinder along z, scaled to radius and length per casing.
  const casingPool = bitPool(new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2), effectLimits.casings, 0.35, 0.7);
  function spawnBit(pool, position, velocity, scale, tint, life, kind, radius) {
    const index = pool.next, item = pool.items[index]; pool.next = (pool.next + 1) % pool.items.length;
    const bit = item.bit;
    bit.position[0] = position.x; bit.position[1] = position.y; bit.position[2] = position.z;
    bit.velocity[0] = velocity.x; bit.velocity[1] = velocity.y; bit.velocity[2] = velocity.z;
    bit.radius = radius; bit.life = item.max = life; bit.kind = kind; bit.resting = false; bit.still = 0;
    item.rotation.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)); item.spin.set(rand(-14, 14), rand(-14, 14), rand(-14, 14));
    item.scale.copy(scale); item.laid = false;
    pool.mesh.setColorAt(index, color.set(tint)); pool.mesh.instanceColor.needsUpdate = true;
  }
  const chipScale = new THREE.Vector3();
  // `life` is how long the bit lasts in all; most debris lies a while before fading (looseBits.life).
  function spawnChip(position, velocity, size, tint, life, shape) {
    const s = size * rand(0.6, 1.4);
    if (shape === 'splinter') chipScale.set(s * 0.45, s * 0.45, s * 3.2);
    else if (shape === 'flat') chipScale.set(s * 1.6, s * 0.15, s * 1.2);
    else chipScale.set(s, s * rand(0.6, 1), s * rand(0.7, 1.2));
    spawnBit(chipPool, position, velocity, chipScale, tint, life, 'debris', Math.max(0.005, Math.min(chipScale.x, chipScale.y, chipScale.z) / 2));
  }
  // A spent casing in world space: position and velocity as Vector3, radius and length in metres.
  function casing(position, velocity, radius, length, tint) {
    spawnBit(casingPool, position, velocity, chipScale.set(radius, radius, length), tint, looseBits.life.casing * rand(0.85, 1), tint === 0x8e2a22 ? 'hull' : 'casing', radius + 0.002);
  }
  let structureKey = null;
  const landings = [], impacts = [];

  // ---- puffs and glows (point clouds) -------------------------------------
  const pointShader = additive => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { scale: { value: 600 }, shade: { value: 1 }, vision: { value: 0 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 tint; uniform float scale;
      varying float vAlpha; varying vec3 vTint;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = size > 0.0 ? size * scale / max(-mv.z, 0.05) : 0.0; vAlpha = alpha; vTint = tint; }`,
    fragmentShader: `uniform float shade; uniform float vision; varying float vAlpha; varying vec3 vTint;
      void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
        float a = pow(max(0.0, 1.0 - d), ${additive ? '1.2' : '1.8'}) * vAlpha; if (a < 0.004) discard;
        vec3 col = vTint * ${additive ? '1.8' : 'shade'};
        if (vision > 0.5 && vision < 1.5) col = vec3(0.12, 0.95, 0.25) * dot(col, vec3(0.2126, 0.7152, 0.0722)) * ${additive ? '2.0' : '3.0'};
        else if (vision > 1.5) col = ${additive ? 'mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.95, 0.7), clamp(dot(col, vec3(0.33)), 0.0, 1.0))' : 'vec3(0.03, 0.05, 0.11)'};
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  function pointCloud(count, additive) {
    const geometry = new THREE.BufferGeometry();
    const attrs = { position: new Float32Array(count * 3), size: new Float32Array(count), alpha: new Float32Array(count), tint: new Float32Array(count * 3) };
    for (const [name, array] of Object.entries(attrs)) geometry.setAttribute(name, new THREE.BufferAttribute(array, name === 'position' || name === 'tint' ? 3 : 1).setUsage(THREE.DynamicDrawUsage));
    const material = pointShader(additive), points = new THREE.Points(geometry, material);
    points.frustumCulled = false; points.renderOrder = additive ? 3 : 2; scene.add(points); disposables.push(geometry, material);
    const items = Array.from({ length: count }, () => ({ life: 0, max: 1, position: new THREE.Vector3(), velocity: new THREE.Vector3(), size0: 0, size1: 0, alpha: 0, tint: new THREE.Color(), rise: 0, drag: 0, gravity: 0, floor: -Infinity }));
    return { geometry, material, points, attrs, items, next: 0 };
  }
  const puffs = pointCloud(effectLimits.puffs, false), glows = pointCloud(effectLimits.glows, true);
  function spawnPoint(cloud, position, velocity, size0, size1, alpha, tint, life, { rise = 0, drag = 1.5, gravity = 0, floor = -Infinity } = {}) {
    const item = cloud.items[cloud.next]; cloud.next = (cloud.next + 1) % cloud.items.length;
    item.life = item.max = life; item.position.copy(position); item.velocity.copy(velocity);
    item.size0 = size0; item.size1 = size1; item.alpha = alpha; item.tint.set(tint); item.rise = rise; item.drag = drag; item.gravity = gravity; item.floor = floor;
  }

  // ---- marks (decals) ------------------------------------------------------
  const atlas = paintAtlas(); disposables.push(atlas);
  const markMaterial = lighting.decorate(new THREE.MeshStandardMaterial({ map: atlas, transparent: true, depthWrite: false, alphaTest: 0.02, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  {
    const previous = markMaterial.onBeforeCompile, previousKey = markMaterial.customProgramCacheKey?.bind(markMaterial);
    markMaterial.onBeforeCompile = (shader, r) => {
      previous?.call(markMaterial, shader, r);
      shader.vertexShader = 'attribute vec2 markCell;\n' + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * vec2(0.25, 0.5) + markCell;');
    };
    markMaterial.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}-mark-atlas`;
  }
  const markGeometry = new THREE.PlaneGeometry(1, 1);
  const cellAttribute = new THREE.InstancedBufferAttribute(new Float32Array(effectLimits.marks * 2), 2);
  markGeometry.setAttribute('markCell', cellAttribute);
  const markMesh = new THREE.InstancedMesh(markGeometry, markMaterial, effectLimits.marks);
  markMesh.frustumCulled = false; markMesh.receiveShadow = true; markMesh.renderOrder = 1;
  for (let i = 0; i < effectLimits.marks; i++) markMesh.setMatrixAt(i, zero);
  scene.add(markMesh); disposables.push(markMaterial, markGeometry);
  const marks = Array.from({ length: effectLimits.marks }, () => ({ used: false, owner: null, matrix: new THREE.Matrix4(), shown: false }));
  let nextMark = 0;
  const normalVector = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, 1), roll = new THREE.Quaternion();
  function addMark({ cell, point, normal, size, owner }) {
    const slot = marks[nextMark], index = nextMark; nextMark = (nextMark + 1) % marks.length;
    normalVector.set(...normal).normalize();
    dummy.position.set(...point).addScaledVector(normalVector, 0.004);
    dummy.quaternion.setFromUnitVectors(forward, normalVector);
    roll.setFromAxisAngle(forward, fraction(point[0] * 31.7 + point[1] * 17.3 + point[2] * 7.9) * Math.PI * 2);
    dummy.quaternion.multiply(roll);
    dummy.scale.set(size, size, size); dummy.updateMatrix();
    slot.used = true; slot.owner = owner; slot.matrix.copy(dummy.matrix); slot.shown = null;
    const at = markCells.indexOf(cell);
    cellAttribute.setXY(index, (at % 4) * 0.25, (1 - Math.floor(at / 4)) * 0.5); cellAttribute.needsUpdate = true;
  }

  // ---- lights --------------------------------------------------------------
  const flashes = [];   // { position, color, strength, radius, life, max }
  function addLight(position, colorHex, strength, radius, life) {
    color.set(colorHex);
    flashes.push({ position: [...position], color: [color.r, color.g, color.b], strength, radius, life, max: life });
    if (flashes.length > 6) flashes.shift();
  }

  // ---- spawning ------------------------------------------------------------
  const point = new THREE.Vector3(), velocity = new THREE.Vector3(), normalSpray = new THREE.Vector3();
  const floorUnder = (state, p) => state?.wallPieces ? supportHeight(state, map, [p[0], p[2]], p[1] + 0.05) : 0;
  function burst(effect, at, normal, state, amount = 1) {
    const recipe = recipes[effect];
    if (!recipe) return;
    const floor = floorUnder(state, at);
    const n = normal && Math.hypot(...normal) > 0 ? normalSpray.set(...normal) : null;
    const outward = () => n ? velocity.copy(n).multiplyScalar(rand(0.4, 1)) : velocity.set(rand(-1, 1), rand(0, 1), rand(-1, 1));
    if (recipe.chips) {
      const { count, colors, size, speed, life, splinter, flat } = recipe.chips;
      for (let i = 0; i < Math.round(count * amount); i++) {
        outward().add(normalSpray.set(rand(-0.6, 0.6), rand(-0.2, 0.8), rand(-0.6, 0.6))).multiplyScalar(speed * rand(0.5, 1));
        if (n) normalSpray.set(...normal);
        point.set(...at);
        spawnChip(point, velocity, size, pick(colors), effect === 'flesh' ? life * rand(0.7, 1.2) : looseBits.life.debris * rand(0.5, 1), splinter ? 'splinter' : flat ? 'flat' : 'chunk');
      }
    }
    if (recipe.puff) {
      const { count, color: tint, size, life, rise } = recipe.puff;
      for (let i = 0; i < Math.max(1, Math.round(count * amount)); i++) {
        point.set(...at); if (n) point.addScaledVector(n, 0.04);
        outward().multiplyScalar(0.5).add(normalSpray.set(rand(-0.15, 0.15), rand(-0.05, 0.15), rand(-0.15, 0.15)));
        if (n) normalSpray.set(...normal);
        spawnPoint(puffs, point, velocity, size * 0.35, size * rand(1.6, 2.4), effect === 'flesh' ? 0.7 : 0.38, tint, life * rand(0.8, 1.2), { rise, drag: 2.5 });
      }
    }
    if (recipe.sparks) {
      const { count, life } = recipe.sparks;
      for (let i = 0; i < Math.round(count * amount); i++) {
        outward().multiplyScalar(4).add(normalSpray.set(rand(-2, 2), rand(-1, 2), rand(-2, 2)));
        if (n) normalSpray.set(...normal);
        point.set(...at);
        spawnPoint(glows, point, velocity, 0.03, 0.01, 1, effect === 'glass' ? 0xdff6ff : 0xffc36a, life * rand(0.6, 1.3), { drag: 0.5, gravity: 9.8, floor });
      }
    }
  }
  function shot(pellet, state) {
    const { bursts, marks: newMarks } = shotMarks(state, map, pellet);
    for (const b of bursts) burst(b.effect, b.point, b.normal, state, b.small ? 0.5 : 1);
    // The first impact of each pellet is heard (step 6.4); exit holes and later layers are not.
    const first = bursts.find(b => !b.small);
    if (first) { impacts.push({ effect: first.effect, position: [...first.point] }); if (impacts.length > 24) impacts.shift(); }
    for (const m of newMarks) addMark(m);
  }
  // Wall pieces a shot knocked out throw bigger chunks and dust.
  function breach(pieces, state) {
    for (const piece of pieces.slice(0, 4)) {
      const effect = piece.material === 'drywall' ? 'drywall' : piece.material === 'timber' ? 'wood' : 'masonry';
      burst(effect, piece.center, null, state, 2.5);
    }
  }
  function blast(event, state) {
    const at = event.position, r = event.radius ?? 3, floor = floorUnder(state, at);
    for (let i = 0; i < 14; i++) {
      point.set(...at).add(velocity.set(rand(-0.4, 0.4), rand(-0.2, 0.4), rand(-0.4, 0.4)));
      velocity.set(rand(-3, 3), rand(0, 3), rand(-3, 3));
      spawnPoint(glows, point, velocity, r * 0.25, r * rand(0.5, 0.8), 0.9, pick([0xffd28a, 0xff9a3c, 0xffe7b0]), rand(0.25, 0.45), { drag: 4 });
    }
    for (let i = 0; i < 18; i++) {
      point.set(...at).add(velocity.set(rand(-0.6, 0.6), rand(0, 0.6), rand(-0.6, 0.6)));
      velocity.set(rand(-2, 2), rand(0.5, 2), rand(-2, 2));
      spawnPoint(puffs, point, velocity, r * 0.3, r * rand(0.8, 1.3), 0.55, pick([0x3d3a36, 0x55514b, 0x2e2c2a]), rand(3, 5), { rise: 0.35, drag: 1.8 });
    }
    for (let i = 0; i < 30; i++) {
      point.set(...at); velocity.set(rand(-1, 1), rand(0.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(3, 8));
      spawnChip(point, velocity, 0.045, pick([0x5d5a55, 0x8a8478, 0x6e4e33, 0x2b2927]), looseBits.life.debris * rand(0.7, 1), Math.random() < 0.3 ? 'splinter' : 'chunk');
    }
    for (let i = 0; i < 30; i++) {
      point.set(...at); velocity.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(4, 10));
      spawnPoint(glows, point, velocity, 0.04, 0.015, 1, 0xffc070, rand(0.3, 0.7), { drag: 0.6, gravity: 9.8, floor });
    }
    if (state?.wallPieces) for (const mark of blastMarks(state, map, at, r)) addMark(mark);
    addLight(at, 0xffa255, 6, r * 2.4, 0.45);
  }
  function flash(event, state) {
    const at = event.position;
    for (let i = 0; i < 6; i++) { point.set(...at); velocity.set(rand(-1, 1), rand(0, 1), rand(-1, 1)); spawnPoint(glows, point, velocity, 0.6, rand(2, 3), 1, 0xffffff, rand(0.12, 0.25), { drag: 4 }); }
    for (let i = 0; i < 8; i++) { point.set(...at); velocity.set(rand(-1, 1), rand(0, 1), rand(-1, 1)); spawnPoint(puffs, point, velocity, 0.3, rand(1, 1.6), 0.4, 0xb9b6ae, rand(2, 3.5), { rise: 0.25, drag: 2 }); }
    addLight(at, 0xf4f6ff, 9, 10, 0.3);
  }
  // A burst of debris that is not a shot: doors, glass, furniture. No normal: sprays every way.
  function shatter(effect, at, state, amount) { burst(effect, at, null, state, amount); }
  function event(e, state) {
    switch (e.type) {
      case 'blast': blast(e, state); return true;
      case 'flash': flash(e, state); return true;
      case 'fire': addLight(e.position, 0xff8a3a, 4, 6, 0.5); for (let i = 0; i < 12; i++) { point.set(...e.position); velocity.set(rand(-2, 2), rand(1, 3), rand(-2, 2)); spawnPoint(glows, point, velocity, 0.4, 1.2, 0.9, 0xff9a40, rand(0.3, 0.6), { drag: 3 }); } return true;
      case 'glass-break': shatter('glass', e.position, state, 4); return true;
      case 'door-break': shatter('wood', e.position, state, 4); burst('drywall', e.position, null, state, 1); return true;
      case 'furniture-break': { const effect = breakEffect(map, e); shatter(effect, e.position, state, 4); if (effect !== 'fabric') burst('drywall', e.position, null, state, 0.6); else burst('fabric', e.position, null, state, 2); return true; }
      case 'strike': burst('drywall', e.position, null, state, 0.6); return true;
      case 'furniture-tip': burst('wood', e.position, null, state, 0.3); return true;   // a chair or stool knocked over
      case 'surrender': case 'guard-reload': case 'guard-jam': return true;   // heard, not drawn (step 6.4)
      default: return false;
    }
  }

  // ---- per frame -------------------------------------------------------------
  let flameClock = 0;
  const fireLights = [];
  function update(dt, camera, state, markVisible, { daylight = 1, vision = 'off' } = {}) {
    dt = Math.min(dt, 0.1);
    // Fires keep burning: flames, smoke and a flickering light while state.fires lasts.
    flameClock += dt; fireLights.length = 0;
    for (const fire of (state.fires ?? []).slice(0, 3)) {
      const r = (fire.radius ?? 2) * 0.4, floor = fire.position[1];
      for (let i = 0; i < Math.round(180 * dt + Math.random() * 0.5); i++) {
        const a = rand(0, 6.3), d = Math.sqrt(Math.random()) * r;
        point.set(fire.position[0] + Math.cos(a) * d, floor + 0.05, fire.position[2] + Math.sin(a) * d);
        // Taller at the centre: flames near the middle rise faster and live longer.
        const core = 1 - d / r;
        velocity.set(rand(-0.15, 0.15), rand(1.4, 2.6) * (0.6 + core), rand(-0.15, 0.15));
        spawnPoint(glows, point, velocity, rand(0.3, 0.6) * (0.7 + core * 0.6), rand(0.05, 0.12), 0.55, pick([0xff8a2a, 0xffb347, 0xff6a1a, 0xffd27a]), rand(0.25, 0.5) * (0.6 + core), { drag: 0.6 });
      }
      if (Math.random() < dt * 5) { point.set(fire.position[0] + rand(-r, r) * 0.5, floor + 1, fire.position[2] + rand(-r, r) * 0.5); velocity.set(rand(-0.2, 0.2), 0.8, rand(-0.2, 0.2)); spawnPoint(puffs, point, velocity, 0.4, 1.4, 0.35, 0x2f2c29, rand(2.5, 4), { rise: 0.3, drag: 0.6 }); }
      const flicker = 1.4 + 0.35 * Math.sin(flameClock * 23 + fire.position[0]) + 0.25 * Math.sin(flameClock * 37);
      fireLights.push({ position: [fire.position[0], floor + 0.6, fire.position[2]], color: [1, 0.55, 0.22], strength: flicker, radius: 6 });
    }
    // Chips and casings: swept contacts against the house (src/loose-bits.js), then they
    // lie still and shrink away at the end of their life. A change to the structure or doors wakes them.
    const key = state?.wallPieces ? damageCount(state) + ':' + state.doors.join('') + ':' + (state.propBroken ?? 0) : structureKey;
    if (key !== structureKey) { structureKey = key; wakeBits(chipPool.items.map(i => i.bit)); wakeBits(casingPool.items.map(i => i.bit)); }
    for (const pool of [chipPool, casingPool]) {
      const bits = [];
      for (const item of pool.items) if (item.bit.life > 0) { item.bit.life -= dt; if (item.bit.life > 0) bits.push(item.bit); }
      landings.push(...stepBits(bits, state, map, dt));
      let moved = false;
      pool.items.forEach((item, i) => {
        const bit = item.bit;
        if (bit.life <= 0) { if (!item.cleared) { pool.mesh.setMatrixAt(i, zero); item.cleared = true; moved = true; } return; }
        item.cleared = false;
        if (bit.resting) {
          // Lie flat: casings on their side, chips on a broad face, both at a random turn.
          if (!item.laid) { item.laid = true; item.rotation.set(0, item.rotation.y, 0); }
          else if (bit.life > looseBits.fade) return;   // nothing changes until it starts to fade
        } else { item.rotation.x += item.spin.x * dt; item.rotation.y += item.spin.y * dt; item.rotation.z += item.spin.z * dt; }
        const fade = Math.min(1, bit.life / Math.min(looseBits.fade, item.max * 0.3));
        // At rest the bit sits on its lowest face; in flight its centre is the bit's centre.
        const lift = bit.resting ? item.scale.y / 2 - bit.radius : 0;
        dummy.position.set(bit.position[0], bit.position[1] + lift, bit.position[2]);
        dummy.rotation.copy(item.rotation); dummy.scale.copy(item.scale).multiplyScalar(fade); dummy.updateMatrix();
        pool.mesh.setMatrixAt(i, dummy.matrix); moved = true;
      });
      if (moved) pool.mesh.instanceMatrix.needsUpdate = true;
    }
    if (landings.length > 64) landings.splice(0, landings.length - 64);
    // Point clouds.
    const scale = renderer.domElement.height * camera.projectionMatrix.elements[5] / 2;
    for (const cloud of [puffs, glows]) {
      cloud.material.uniforms.scale.value = scale;
      cloud.material.uniforms.shade.value = daylight;
      cloud.material.uniforms.vision.value = vision === 'nightvision' ? 1 : vision === 'thermal' ? 2 : 0;
      const { position, size, alpha, tint } = cloud.attrs;
      let any = false;
      cloud.items.forEach((item, i) => {
        if (item.life <= 0) { if (size[i] !== 0) { size[i] = 0; any = true; } return; }
        item.life -= dt; any = true;
        const t = 1 - Math.max(0, item.life) / item.max;
        item.velocity.multiplyScalar(Math.max(0, 1 - item.drag * dt));
        item.velocity.y += (item.rise - item.gravity) * dt;
        item.position.addScaledVector(item.velocity, dt);
        if (item.position.y < item.floor) { item.position.y = item.floor; item.velocity.y *= -0.3; }
        position[i * 3] = item.position.x; position[i * 3 + 1] = item.position.y; position[i * 3 + 2] = item.position.z;
        size[i] = item.life > 0 ? item.size0 + (item.size1 - item.size0) * Math.sqrt(t) : 0;
        alpha[i] = item.alpha * (1 - t) * Math.min(1, t * 12 + 0.3);
        tint[i * 3] = item.tint.r; tint[i * 3 + 1] = item.tint.g; tint[i * 3 + 2] = item.tint.b;
      });
      if (any) for (const name of ['position', 'size', 'alpha', 'tint']) cloud.geometry.attributes[name].needsUpdate = true;
    }
    // Marks follow what they sit on.
    let marksChanged = false;
    marks.forEach((mark, i) => {
      if (!mark.used) return;
      const shown = !!markVisible(mark.owner);
      if (shown === mark.shown) return;
      mark.shown = shown; markMesh.setMatrixAt(i, shown ? mark.matrix : zero); marksChanged = true;
    });
    if (marksChanged) markMesh.instanceMatrix.needsUpdate = true;
    // Lights fade.
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].life -= dt; if (flashes[i].life <= 0) flashes.splice(i, 1); }
  }
  // The effect lights this frame, strongest first (the caller adds the muzzle flash).
  function lights() {
    const list = flashes.map(f => ({ ...f, strength: f.strength * (f.life / f.max) ** 1.5 }));
    return [...list, ...fireLights].sort((a, b) => b.strength - a.strength);
  }
  function reset() {
    for (const pool of [chipPool, casingPool]) {
      pool.items.forEach((item, i) => { item.bit.life = 0; item.cleared = true; pool.mesh.setMatrixAt(i, zero); });
      pool.mesh.instanceMatrix.needsUpdate = true; pool.next = 0;
    }
    landings.length = 0;
    for (const cloud of [puffs, glows]) { for (const item of cloud.items) item.life = 0; cloud.attrs.size.fill(0); cloud.geometry.attributes.size.needsUpdate = true; }
    for (const mark of marks) { mark.used = false; mark.owner = null; }
    for (let i = 0; i < marks.length; i++) markMesh.setMatrixAt(i, zero);
    markMesh.instanceMatrix.needsUpdate = true;
    flashes.length = 0; nextMark = 0;
  }
  function dispose() { for (const item of disposables) item.dispose(); }
  return {
    shot, breach, event, update, lights, reset, dispose, casing,
    // Bits that hit a floor hard enough to hear since the last call: [{ position, speed, kind }] (for step 6.4).
    takeLandings: () => landings.splice(0),
    // Bullet impacts since the last call: [{ effect, position }] (the 6.1 effect class, for sound).
    takeImpacts: () => impacts.splice(0),
    count: () => ({ marks: marks.filter(m => m.used).length, chips: chipPool.items.filter(i => i.bit.life > 0).length, casings: casingPool.items.filter(i => i.bit.life > 0).length, resting: [...chipPool.items, ...casingPool.items].filter(i => i.bit.life > 0 && i.bit.resting).length,
      casingSpots: casingPool.items.filter(i => i.bit.life > 0).slice(0, 8).map(i => i.bit.position.map(v => +v.toFixed(2))) }),
  };
}

// The decal atlas, painted once: 4 columns by 2 rows of 128 px, in the order of
// markCells: drywall, wood, masonry, metal / fabric, blood, scorch, chip.
function paintAtlas() {
  const cell = 128, canvas = document.createElement('canvas');
  canvas.width = cell * 4; canvas.height = cell * 2;
  const g = canvas.getContext('2d');
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const blob = (x, y, radius, jitter, points = 14) => {
    g.beginPath();
    for (let i = 0; i <= points; i++) {
      const a = i / points * Math.PI * 2, r = radius * (1 - jitter / 2 + random() * jitter);
      if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  };
  const at = (index, paint) => { g.save(); g.translate((index % 4) * cell + cell / 2, Math.floor(index / 4) * cell + cell / 2); paint(); g.restore(); };
  // drywall: torn paper ring, chalky crumble, dark hole
  at(0, () => { g.fillStyle = 'rgba(205,198,182,0.95)'; blob(0, 0, 40, 0.5, 18); g.fillStyle = 'rgba(160,152,136,0.95)'; blob(0, 0, 25, 0.4); g.fillStyle = 'rgba(28,25,22,1)'; blob(0, 0, 14, 0.3); });
  // wood: dark hole with splintered rays
  at(1, () => { g.strokeStyle = 'rgba(176,132,88,0.9)'; g.lineWidth = 4; for (let i = 0; i < 9; i++) { const a = random() * 6.3, r = 22 + random() * 26; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); } g.fillStyle = 'rgba(70,46,28,0.95)'; blob(0, 0, 20, 0.4); g.fillStyle = 'rgba(20,14,10,1)'; blob(0, 0, 12, 0.3); });
  // masonry: rough pock
  at(2, () => { g.fillStyle = 'rgba(120,114,104,0.85)'; blob(0, 0, 46, 0.6, 16); g.fillStyle = 'rgba(80,76,70,0.95)'; blob(0, 0, 28, 0.5); g.fillStyle = 'rgba(40,38,35,1)'; blob(0, 0, 14, 0.4); });
  // metal: small dent with a bright rim
  at(3, () => { g.fillStyle = 'rgba(210,214,216,0.7)'; blob(0, 0, 30, 0.2); g.fillStyle = 'rgba(30,32,34,1)'; blob(0, 0, 18, 0.2); });
  // fabric: dark tear with frayed fibres
  at(4, () => { g.strokeStyle = 'rgba(230,226,215,0.85)'; g.lineWidth = 2; for (let i = 0; i < 18; i++) { const a = random() * 6.3, r = 16 + random() * 22; g.beginPath(); g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); } g.fillStyle = 'rgba(25,22,20,1)'; blob(0, 0, 15, 0.5); });
  // blood: spatter with droplets thrown outward
  at(5, () => { g.fillStyle = 'rgba(92,10,8,0.92)'; blob(0, 0, 26, 0.7, 20); for (let i = 0; i < 40; i++) { const a = random() * 6.3, r = 20 + random() * 38; g.globalAlpha = 0.6 + random() * 0.4; blob(Math.cos(a) * r, Math.sin(a) * r, 1.5 + random() * 5, 0.4, 8); } g.globalAlpha = 1; });
  // scorch: soft dark burn
  at(6, () => { const grad = g.createRadialGradient(0, 0, 0, 0, 0, 62); grad.addColorStop(0, 'rgba(12,10,9,0.95)'); grad.addColorStop(0.5, 'rgba(20,17,15,0.7)'); grad.addColorStop(1, 'rgba(30,26,22,0)'); g.fillStyle = grad; blob(0, 0, 62, 0.25, 24); });
  // chip: ceramic chip with cracks
  at(7, () => { g.strokeStyle = 'rgba(80,80,78,0.8)'; g.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const a = random() * 6.3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * (25 + random() * 30), Math.sin(a) * (25 + random() * 30)); g.stroke(); } g.fillStyle = 'rgba(170,168,160,0.95)'; blob(0, 0, 16, 0.5); g.fillStyle = 'rgba(60,58,55,1)'; blob(0, 0, 7, 0.3); });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
