import './style.css';
import './ui.css';
import { schema, defaults, presets, restoreSavedRules } from './rules.js';
import { maps, resolveMap } from './maps/index.js';
import { createMission, stepMission, interact, distance, movementGait, toggleCrouch, jump } from './simulation.js';
import { createScene } from './scene.js';
import { fireWeapon, reload } from './weapons.js';
import { weaponReady } from './weapon-handling.js';
import { createGunAudio } from './audio.js';
import { createMotion, resetMotion, shapeInput, observeMotion } from './player-motion.js';
import { weapons, items, ammoTypes, defaultLoadout, validateLoadout, equip, toggleHolster, restockEquipment, slotOrder, cycleEquipped } from './kit.js';
import { useEquipment, detonateCharges, weaponStrike } from './equipment.js';
import { createKitMenu } from './menus.js';
import { bindCombatMouse } from './combat-input.js';
import { togglePlayerCover, setPlayerPeek } from './player-cover.js';
import { cutPower } from './lighting.js';
import { exposureRange, graphicsPresets, loadGraphics, saveGraphics } from './graphics.js';
import { alertState, headingDegrees, compassPoint, damageBearing, damageArrowOpacity, interactionPrompt, formatClock } from './hud-model.js';
import { loadSettings, saveSettings, loadBindings, saveBindings, actionLookup, keyLabel } from './settings.js';
import { createSettingsMenu } from './settings-menu.js';
import { createScreens } from './screens.js';
import { createTimeline, observeMission } from './debrief.js';
import { nearbyInteraction } from './window-traversal.js';

const app = document.querySelector('#app');
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Stealth sandbox home"><span class="brand-mark">⌑</span><span>UNTITLED<span class="brand-sub">A STEALTH SANDBOX</span></span></a>
    <span class="build-tag">FIELD LAB <span> / </span> 003</span>
    <div class="view-tools"><button id="inventory-toggle" class="quiet">Tab · Inventory / kit</button><button id="view-toggle" class="quiet">V · First person</button><button id="map-toggle" class="quiet" aria-pressed="false">M · Map</button></div>
    <button id="open-settings" class="quiet">Settings <span>⚙</span></button>
  </header>
  <main>
    <section class="viewport" aria-label="Playable mission">
      <canvas id="world" tabindex="0" aria-label="3D mission. Movement, view, inventory and the other controls are listed in the control hints and can be changed in Settings."></canvas>
      <div id="cover-status" hidden role="status"></div>
      <div id="crosshair" data-style="plus" aria-hidden="true"></div><div id="hit-marker" aria-hidden="true">×</div>
      <div id="scope-overlay" hidden aria-label="Sniper scope"><div class="scope-reticle"></div><span id="scope-zoom">4×</span></div><div id="damage-overlay" aria-hidden="true"></div><div id="flash-overlay" aria-hidden="true"></div>
      <div id="damage-arrow" aria-hidden="true"><i></i></div>
      <button id="capture-mouse" class="capture-hint">Click here to aim · Esc releases mouse</button>
      <div id="detainment-banner" hidden role="status"></div>
      <section id="map-banner" hidden aria-label="Tactical map controls">
        <strong>TACTICAL MAP · PAUSED</strong><span>M to return to play</span>
        <div class="map-kills">ENEMIES KILLED <strong id="map-kills">0/0</strong></div>
        <div class="map-floor-controls"><label for="map-floor">Viewing floor</label><select id="map-floor"></select><button id="floor-toggle" class="quiet" title="Cycle the displayed floor">F · Next floor</button></div>
        <button id="scan" title="Spend $250 to track every guard for 10 mission seconds">Intel pulse <span>$250</span></button>
        <p id="scan-status" role="status" aria-live="polite">Reveal guards on every floor for 10 mission seconds.</p>
        <button id="cut-power">Cut building power</button><p id="power-status" role="status">Building electricity on.</p>
      </section>
      <div class="mission-card"><div class="eyebrow">OPERATION / 01</div><h1>The quiet house</h1><p id="objective-card">Retrieve the archive and extract.</p><div class="mission-line"><span class="status-dot"></span><span id="phase">PLANNING</span><span id="clock">00:00</span></div><div id="render-stats" hidden aria-label="Rendering performance"></div></div>
      <div class="map-stamp">N ↑<br><span>COURTYARD RESIDENCE<br>1 UNIT = 1 METRE</span></div>
      <div class="hud" id="hud">
        <div class="hud-top"><div id="compass" aria-hidden="true"></div><div id="compass-heading" aria-hidden="true">N 000°</div><div id="alert-pill" data-level="0" role="status" aria-label="Guard alert state">UNDETECTED</div><div id="objective">Retrieve the archive and extract.</div></div>
        <div class="hud-radio"><p id="guard-radio" hidden role="status" aria-live="polite"></p></div>
        <div id="interaction-prompt" hidden role="status"></div>
        <div class="hud-left">
          <p id="message" role="status" aria-live="polite">Choose your kit and plan your approach.</p>
          <div class="hud-panel health-panel"><span class="eyebrow">HEALTH</span><div class="health-value"><strong id="health">100</strong><span>/ 100</span></div><div id="health-meter" role="meter" aria-label="Player health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div id="health-fill"></div></div><span id="health-status">HEALTHY</span><div class="stance-line"><span id="gait">WALK</span></div><div class="exposure-row"><span class="eyebrow">EXPOSURE</span><div class="meter"><div id="exposure"></div></div></div></div>
        </div>
        <div class="hud-right"><div class="hud-panel weapon-hud"><span class="name" id="equipped-name">ASSAULT RIFLE</span><strong id="ammo">30 / ∞</strong><div class="vision-line"><strong id="vision-status">DAY · NORMAL</strong></div><div><span class="eyebrow">FUNDS</span> <strong id="funds">$1,000</strong></div></div></div>
        <div class="hud-hints" id="hints" aria-label="Control hints"></div>
      </div>
      <div id="screens"></div>
    </section>
  </main>
  <div id="panel-sources" hidden>
    <div id="graphics-panel">
      <div class="setting"><label for="graphics-preset">Quality preset</label><select id="graphics-preset">${Object.keys(graphicsPresets).map(name => `<option>${name}</option>`).join('')}</select></div>
      <div class="setting"><label for="graphics-stats">Show performance</label><input id="graphics-stats" type="checkbox" role="switch"></div>
      <div class="setting"><label for="graphics-exposure">First-person exposure</label><output id="graphics-exposure-value" for="graphics-exposure" aria-live="off"></output><input id="graphics-exposure" type="range" min="${exposureRange.min}" max="${exposureRange.max}" step="0.05"></div>
      <p id="graphics-notice" class="muted" role="status" hidden>Reload the page to apply the anti-aliasing change.</p>
    </div>
    <div id="game-panel">
      <label class="preset-label" for="preset">Starting preset</label><select id="preset">${Object.keys(presets).map(name => `<option>${name}</option>`).join('')}<option disabled>Custom</option></select>
      <div id="settings"></div>
      <div class="rules-note"><span>↳</span><p>Entry point, guard count, budget, and door durability apply on a new deployment. Other changes apply live. Rain reduces sight to 85%; fog to 60%.</p></div>
      <div class="share-row"><button id="export" class="quiet">Export rules ↓</button><button id="import" class="quiet">Import rules ↑</button><input type="file" id="rules-file" accept=".json,application/json" hidden></div>
      <p id="rules-message" class="muted" role="status" aria-live="polite">Saved automatically on this browser.</p>
    </div>
  </div>`;

const $ = selector => document.querySelector(selector);
let rules = { ...defaults };
try {
  const saved = localStorage.getItem('stealth-rules-v1');
  if (saved) rules = restoreSavedRules(JSON.parse(saved));
} catch { /* Storage is optional; malformed saved rules fall back to defaults. */ }
let loadout = defaultLoadout();
try { const saved = localStorage.getItem('stealth-loadout-v1'); if (saved) loadout = validateLoadout(JSON.parse(saved)); } catch { /* Invalid saved kits use defaults. */ }
let playerSettings = loadSettings(), bindings = loadBindings(), lookup = actionLookup(bindings);
const timelineHolder = { current: createTimeline() };
const screenActions = {};
const screens = createScreens($('#screens'), new Proxy({}, { get: (_, name) => (...args) => screenActions[name]?.(...args) }));
let plannedMap = 'courtyard';
try { const saved = localStorage.getItem('stealth-map-v1'); if (Object.hasOwn(maps, saved)) plannedMap = saved; } catch { /* Optional storage. */ }
let map = resolveMap(plannedMap);
function updateMapLabels() {
  $('.mission-card h1').textContent = map.name;
  $('.map-stamp').firstChild.textContent = map.id === 'martelli-01' ? 'LAKE / S ↑' : 'N ↑';
  $('.map-stamp span').textContent = `${map.stamp ?? 'COURTYARD RESIDENCE'} · 1 UNIT = 1 METRE`;
  const floors = map.levels ?? [{ name: 'Ground floor', elevation: 0 }];
  $('#map-floor').replaceChildren(...floors.map((floor, index) => new Option(floor.name, String(index))));
  $('#map-floor').disabled = floors.length < 2;
  $('#floor-toggle').hidden = floors.length < 2;
}
updateMapLabels();
// Each deployment draws a fresh seed unless one is pinned in the rules.
const missionRules = () => ({ ...rules, missionSeed: rules.guardVariation ? rules.missionSeed || 1 + Math.floor(Math.random() * 999999) : 0 });
const showSeed = () => { $('.mission-card .eyebrow').textContent = state.missionSeed ? `OPERATION / 01 · SEED ${state.missionSeed}` : 'OPERATION / 01'; };
let state = createMission(map, missionRules(), loadout);
showSeed();
const graphics = loadGraphics();
const exposureControl = $('#graphics-exposure');
const exposureValue = $('#graphics-exposure-value');
exposureControl.value = graphics.exposure;
exposureValue.textContent = graphics.exposure.toFixed(2) + '×';
exposureControl.addEventListener('input', () => {
  graphics.exposure = exposureControl.valueAsNumber;
  exposureValue.textContent = graphics.exposure.toFixed(2) + '×';
  saveGraphics(graphics);
});
const initialAntialias = graphicsPresets[graphics.preset].antialias;
const scenePreset = () => ({ ...graphicsPresets[graphics.preset], antialias: initialAntialias });
const renderStats = $('#render-stats');
const captureStatus = document.createElement('div');
captureStatus.id = 'capture-light-status';
captureStatus.setAttribute('role', 'status');
captureStatus.textContent = 'Capturing light…';
captureStatus.hidden = true;
renderStats.before(captureStatus);
let statsSince = null, statsFrames = 0;
const resetStats = () => {
  statsSince = null;
  statsFrames = 0;
  renderStats.textContent = '';
};
$('#graphics-preset').value = graphics.preset;
$('#graphics-stats').checked = graphics.showStats;
renderStats.hidden = !graphics.showStats;
$('#graphics-preset').addEventListener('change', event => {
  graphics.preset = event.target.value;
  const preset = graphicsPresets[graphics.preset];
  scene?.setGraphics(preset);
  $('#graphics-notice').hidden = preset.antialias === initialAntialias;
  resetStats();
  saveGraphics(graphics);
});
$('#graphics-stats').addEventListener('change', event => {
  graphics.showStats = event.target.checked;
  renderStats.hidden = !graphics.showStats;
  resetStats();
  saveGraphics(graphics);
});
let scene, webglFailed = false;
try { scene = createScene($('#world'), map, scenePreset()); }
catch (error) {
  webglFailed = true;
  console.error(error);
}
const settings = $('#settings');
for (const group of [...new Set(Object.values(schema).map(field => field.group))]) {
  const section = document.createElement('section');
  section.className = 'settings-group';
  section.innerHTML = `<h3>${group}</h3>`;
  for (const [key, field] of Object.entries(schema).filter(([, field]) => field.group === group)) {
    const row = document.createElement('div'); row.className = 'setting';
    const boolean = typeof field.value === 'boolean';
    row.innerHTML = `<label for="rule-${key}">${field.label}${field.setup ? '<span class="setup-mark" title="Applies on new deployment"> ↻</span>' : ''}</label>${boolean ? `<input id="rule-${key}" type="checkbox" role="switch">` : field.options ? `<select id="rule-${key}">${field.options.map(option => `<option>${option}</option>`).join('')}</select>` : `<output for="rule-${key}" id="value-${key}"></output><input id="rule-${key}" type="range" min="${field.min}" max="${field.max}" step="${field.step}">`}`;
    const control = row.querySelector('input, select');
    control.addEventListener('input', () => {
      rules[key] = boolean ? control.checked : field.options ? control.value : Number(control.value);
      $('#preset').value = 'Custom';
      syncRules(); saveRules();
      $('#rules-message').textContent = field.setup ? 'Change queued. Use New deployment to apply.' : 'Rule updated. Your sandbox, your call.';
    });
    section.append(row);
  }
  settings.append(section);
}
function syncRules() {
  for (const [key, field] of Object.entries(schema)) {
    const control = $(`#rule-${key}`);
    if (typeof field.value === 'boolean') control.checked = rules[key];
    else control.value = rules[key];
    const output = $(`#value-${key}`);
    if (output) output.textContent = field.unit === '$' ? `$${rules[key].toLocaleString()}` : `${rules[key]}${field.unit ? ` ${field.unit}` : ''}`;
  }
  const preset = Object.entries(presets).find(([, p]) => Object.keys(schema).every(key => p[key] === rules[key]));
  $('#preset').value = preset?.[0] ?? 'Custom';
}
function saveRules() {
  try { localStorage.setItem('stealth-rules-v1', JSON.stringify(rules)); }
  catch { $('#rules-message').textContent = 'Browser storage unavailable. Export rules to keep them.'; }
}
syncRules();
saveRules();
$('#preset').addEventListener('change', event => {
  rules = { ...presets[event.target.value] }; syncRules(); saveRules();
  $('#rules-message').textContent = 'Preset loaded. Deploy again to apply its guard count and budget.';
});
function message(text) { $('#message').textContent = text; }
const held = new Set();
const audio = createGunAudio();
const feelState = createMotion();   // movement feel: acceleration, bob and footsteps (src/player-motion.js)
function applySettings() {
  document.documentElement.style.setProperty('--hud-user', String(playerSettings.hudScale));
  document.body.classList.toggle('hud-minimal', playerSettings.minimalHud);
  $('#crosshair').dataset.style = playerSettings.crosshair;
  $('#hints').hidden = !playerSettings.showHints;
  scene?.setLook({ sensitivity: playerSettings.sensitivity, invertY: playerSettings.invertY });
  audio.setMaster(playerSettings.masterVolume);
}
function fitHud() {
  const box = $('.viewport').getBoundingClientRect();
  document.documentElement.style.setProperty('--hud-auto', Math.max(0.8, Math.min(2, Math.min(box.width / 1280, box.height / 720))).toFixed(3));
}
new ResizeObserver(fitHud).observe($('.viewport')); fitHud();
const hint = (label, ...codes) => `<span>${codes.map(code => `<kbd>${keyLabel(code)}</kbd>`).join('')}${label}</span>`;
function renderHints() {
  const b = bindings;
  $('#hints').innerHTML = [hint('Move', b.forward, b.left, b.back, b.right), hint('Inventory', 'Tab'), hint('Interact', b.interact), hint('Run', b.run), hint('Creep', b.creep), hint('Crouch', b.crouch), hint('Jump', b.jump),
    hint('Fire', 'LMB'), hint('Aim', b.aim), hint('Reload', b.reload), hint('Holster', b.holster), hint('Cover', b.cover), hint('Peek', b.peek), hint('Map', b.map), hint('View', b.view), hint('Pause', b.pause)].join('');
}
renderHints(); applySettings();
let view = 'first', mapOpen = false, mapWasActive = false, firing = false, captureFailed = false, hitUntil = 0, menuVisible = false, aimed = false, scopeZoom = 4;
const canvas = $('#world');
function releaseMouse() {
  firing = false;
  held.delete(bindings.peek); setPlayerPeek(state,map,false);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function captureMouse() {
  if (view !== 'first' || mapOpen || menuVisible || state.status !== 'active') return;
  canvas.focus(); audio.unlock();
  try {
    const request = canvas.requestPointerLock();
    request?.catch(captureFallback);
  } catch { captureFallback(); }
}
function captureFallback() {
  captureFailed = true;
  $('#capture-mouse').textContent = 'RMB drag / IJKL to look · Click to retry mouse capture';
  message('Mouse capture unavailable. Hold right mouse to look, or use IJKL. Left mouse fires; E interacts; Tab opens inventory.');
}
$('#capture-mouse').addEventListener('click', () => { if (state.status === 'paused' && !mapOpen) pause(); captureMouse(); });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('auxclick', event => { if (event.button === 3) event.preventDefault(); });
bindCombatMouse(canvas, window, {
  primaryDown: () => {
    if (state.status !== 'active' || mapOpen || menuVisible) return;
    audio.unlock(); canvas.focus();
    if (view === 'first' && document.pointerLockElement !== canvas && !captureFailed) captureMouse();
    firing = true; shoot();
  },
  primaryUp: () => { firing = false; },
  secondaryDown: () => { if (document.pointerLockElement === canvas) toggleAim(); },
  meleeDown: () => {
    if (state.status !== 'active' || mapOpen || menuVisible || !scene) return;
    const aim = scene.aim(state), result = weaponStrike(state, map, rules, aim.origin, aim.direction);
    if (result?.kind === 'guard') { hitUntil = performance.now() + 150; message(result.killed ? 'Guard down from weapon strike.' : 'Weapon strike hit.'); }
  },
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) { firing = false; held.clear(); setPlayerPeek(state,map,false); if (state.status === 'active' && view === 'first' && !mapOpen && !menuVisible) pause(); }
});
function toggleView() {
  aimed = false;
  view = view === 'first' ? 'overhead' : 'first'; scene?.setView(view);
  if (view === 'overhead') releaseMouse();
  $('#view-toggle').textContent = `V · ${view === 'first' ? 'First person' : 'Overhead'}`;
  canvas.focus();
  message(view === 'first' ? 'First person. Click to capture the mouse. IJKL also looks around.' : 'Overhead. Aim with your cursor and hold left mouse to fire.');
}
function toggleMap() {
  if (menuVisible) return;
  if (!['active', 'paused'].includes(state.status)) return;
  mapOpen = !mapOpen;
  if (mapOpen) {
    mapWasActive = state.status === 'active'; state.status = 'paused'; held.clear(); releaseMouse();
  } else if (mapWasActive) state.status = 'active';
  scene?.setMap(mapOpen);
  $('#map-banner').hidden = !mapOpen;
  $('.viewport').classList.toggle('map-open', mapOpen);
  $('#map-toggle').setAttribute('aria-pressed', String(mapOpen));
  canvas.focus();
  message(mapOpen ? 'Map open. Simulation paused. Intel rules control guard and route information.' : 'Map closed. Click to capture mouse for first person.');
}
$('#view-toggle').addEventListener('click', toggleView);
$('#map-toggle').addEventListener('click', toggleMap);
function toggleFloor() {
  if (!map.levels || !scene || menuVisible) return;
  if (view === 'first' && !mapOpen) toggleMap();
  const name = scene.cycleFloor(); $('#map-floor').value = String(scene.getFloor());
  message(`Viewing ${name}. F switches floors; M returns to play.`);
}
$('#floor-toggle').addEventListener('click', toggleFloor);
$('#map-floor').addEventListener('change', event => {
  if (!mapOpen || !scene) return;
  scene.setFloor(Number(event.target.value));
  message(`Viewing ${event.target.selectedOptions[0].textContent}. F switches floors; M returns to play.`);
});
function saveLoadout(next) { loadout = validateLoadout(next); try { localStorage.setItem('stealth-loadout-v1', JSON.stringify(loadout)); } catch { /* Optional persistence. */ } }
let menuWasActive = false, menuPaused = false;
const kitMenu = createKitMenu({
  getState: () => state, getRules: () => rules, getLoadout: () => loadout, saveLoadout, deploy,
  getMaps: () => maps, getPlannedMap: () => plannedMap,
  changeMap: id => {
    if (!Object.hasOwn(maps, id)) return;
    plannedMap = id;
    try { localStorage.setItem('stealth-map-v1', id); } catch { /* Optional storage. */ }
  },
  changeRule: (key, value) => { rules[key] = value; syncRules(); saveRules(); },
  onOpen: mode => {
    if (mapOpen) toggleMap();
    menuVisible = true; menuWasActive = state.status === 'active'; menuPaused = mode === 'planning' || rules.inventoryPause;
    if (menuWasActive && menuPaused) state.status = 'paused';
    aimed = false; held.clear(); releaseMouse();
  },
  onClose: () => { menuVisible = false; if (menuWasActive && menuPaused && state.status === 'paused') state.status = 'active'; if (screens.current() === 'briefing') showBriefing(); else if (!screens.current()) canvas.focus(); },
  equip: id => { equip(state, id); aimed = false; }, detonate,
  restock: () => restockEquipment(state),
});
function openKit() { kitMenu.open(['planning', 'complete', 'captured'].includes(state.status) ? 'planning' : 'inventory'); }
$('#inventory-toggle').addEventListener('click', openKit);
function toggleAim() {
  if (view !== 'first' || mapOpen || menuVisible || state.status !== 'active' || !weapons[state.inventory.equipped]) return;
  aimed = !aimed;
}
// Wheel: zooms the sniper scope while aiming; otherwise, in first person, cycles
// the slots (down = next). A short cooldown keeps one trackpad swipe to one step.
let wheelReadyAt = 0;
canvas.addEventListener('wheel', event => {
  if (aimed && state.inventory.equipped === 'sniper') { event.preventDefault(); scopeZoom = Math.max(2, Math.min(8, scopeZoom - Math.sign(event.deltaY))); return; }
  if (view !== 'first' || mapOpen || menuVisible || state.status !== 'active' || !event.deltaY) return;
  event.preventDefault();
  const now = performance.now();
  if (now < wheelReadyAt) return;
  wheelReadyAt = now + 150;
  if (cycleEquipped(state, Math.sign(event.deltaY))) { aimed = false; firing = false; }
}, { passive: false });
function equipSlot(slot) {
  const id = slotOrder[slot - 1];
  if (!id) return;
  if (equip(state, id)) { aimed = false; firing = false; }
  else message(`${weapons[id]?.name ?? items[id].name} not carried${items[id] ? ' or used up' : ''}. Add it in loadout planning.`);
}
function detonate() {
  if (state.status !== 'active') return message('Resume the mission before detonating charges.');
  const count = detonateCharges(state, map, rules);
  message(count ? `${count} placed charge(s) detonated.` : 'No placed charges to detonate.');
}
function shoot(now = performance.now()) {
  if (mapOpen || menuVisible || !scene) return;
  if (state.inventory.equipped === 'unarmed') return message('Hands empty. H draws your last weapon; Tab opens inventory.');
  // A switch must finish before the new item fires or throws (rule "Weapon switch takes time").
  if (!weaponReady(state, rules)) return;
  const aim = scene.aim(state);
  if (items[state.inventory.equipped]) { const result = useEquipment(state, map, rules, aim.origin, aim.direction); if (result) message(result); return; }
  const shot = fireWeapon(state, map, rules, aim.origin, aim.direction);
  if (shot) {
    for (const pellet of shot.pellets) scene.shotEffect(pellet, state);
    scene.fired(state.inventory.equipped, { aimed: aimed && view === 'first', crouched: !!state.crouched, climb: rules.muzzleClimb !== false, suppressed: !!shot.suppressed });
    audio.play(rules.gunVolume * (shot.suppressed ? 0.25 : 1));
    if (shot.kind === 'guard') hitUntil = now + 150;
    if (shot.headshot) message('Headshot. Guard down.');
    else if (shot.killed) message('Guard down. Gunfire can alert nearby guards.');
    else if (shot.doorDestroyed) message('Door shot apart. The doorway is clear.');
    else if (shot.doorHit !== null) message(rules.destructibleDoors ? `Door damaged. ${Math.ceil(state.doorHealth[shot.doorHit])} durability remaining.` : 'Door damage is disabled in Sandbox rules.');
    else if (shot.removed.length) message(`${shot.material === 'timber' ? 'Framing' : 'Drywall'} broken. Keep clearing the opening to make a passage.`);
    if (map.id === 'partitions-01') {
      const walls = new Set(shot.pellets.flatMap(p => p.impacts.filter(i => i.kind === 'wall' && i.material !== 'masonry').map(i => i.wall)));
      const last = shot.pellets[0].impacts.at(-1);
      message(`${weapons[state.inventory.equipped].name} · ${ammoTypes[state.inventory.weapons[state.inventory.equipped].ammoType].name} · ${walls.size} interior wall(s) hit · final impact: ${last?.material ?? last?.kind ?? 'none'}.${shot.killed ? ' Guard down.' : ''} Tab changes ammo; New deployment restores walls.`);
    }
  } else if (state.status === 'active' && state.ammo === 0 && !state.reloadUntil) message('Magazine empty. Press R to reload.');
}
let deploying = false;
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
async function deploy() {
  if (!scene || deploying) return;
  deploying = true; kitMenu.close();
  const progress = screens.loading(['Building the structure', 'Placing guards and gear', 'Capturing light']);
  try {
    await nextFrame(); await nextFrame();
    const nextMap = resolveMap(plannedMap);
    if (map !== nextMap) {
      releaseMouse(); scene.dispose(); map = nextMap; scene = createScene(canvas, map, scenePreset()); scene.setView(view);
      scene.setLook({ sensitivity: playerSettings.sensitivity, invertY: playerSettings.invertY });
      updateMapLabels();
    }
    progress.stage(1); await nextFrame();
    held.clear(); state = createMission(map, missionRules(), loadout); showSeed(); resetStats();
    timelineHolder.current = createTimeline();
    mapOpen = false; firing = false; aimed = false; scene.reset(state.spawnYaw); scene.setMap(false);
    $('#map-banner').hidden = true; $('#map-toggle').setAttribute('aria-pressed', 'false');
    $('.viewport').classList.remove('map-open');
    progress.stage(2);
    for (const start = performance.now(); scene.capturingLight() && performance.now() - start < 4000;) await nextFrame();
    progress.finish(); await new Promise(resolve => setTimeout(resolve, 250));
    state.status = 'active'; screens.hide();
    message(map.description ?? 'Mission live. Click to aim. V changes view; M opens map. Interior partition is breakable.');
    $('#world').focus();
  } finally { deploying = false; }
}
function showBriefing() { screens.briefing({ map: resolveMap(plannedMap), rules, loadout, weapons }); }
function showPause() { screens.pause({ map, elapsed: formatClock(state.elapsed) }); }
function resume() {
  if (state.status !== 'paused' || mapOpen || menuVisible) return;
  screens.hide(); state.status = 'active'; message('Mission resumed.'); captureMouse();
}
let settingsWasActive = false;
const settingsMenu = createSettingsMenu({
  getSettings: () => playerSettings, setSettings: next => { playerSettings = next; saveSettings(playerSettings); applySettings(); },
  getBindings: () => bindings, setBindings: next => { bindings = next; lookup = actionLookup(bindings); saveBindings(bindings); renderHints(); },
  graphicsPanel: $('#graphics-panel'), gamePanel: $('#game-panel'),
  onOpen: () => {
    if (mapOpen) toggleMap();
    menuVisible = true; settingsWasActive = state.status === 'active';
    if (settingsWasActive) state.status = 'paused';
    aimed = false; held.clear(); releaseMouse();
  },
  onClose: () => { menuVisible = false; if (settingsWasActive && state.status === 'paused') state.status = 'active'; if (!screens.current()) canvas.focus(); },
});
Object.assign(screenActions, {
  start: showBriefing, settings: () => settingsMenu.open(), menu: () => screens.menu(), planning: () => kitMenu.open('planning'), deploy, resume,
  loadout: () => kitMenu.open('inventory'),
  abort: () => { releaseMouse(); state.status = 'planning'; screens.menu('Mission aborted.'); },
});
$('#open-settings').addEventListener('click', () => settingsMenu.open());
$('#scan').addEventListener('click', () => {
  if (!mapOpen || state.status !== 'paused' || state.scanUntil > state.elapsed) return;
  if (state.budget < 250) return message('Not enough support funds. Change budget and deploy again, or enable free live tracking.');
  state.budget -= 250; state.scanUntil = state.elapsed + 10;
  message('Intel pulse active: all guards tracked for 10 mission seconds.');
  $('#world').focus();
});
$('#cut-power').addEventListener('click',()=>{
  if(!mapOpen||state.status!=='paused')return;
  if(cutPower(state))message('Building power cut. Electric lights are off until the next deployment; daylight remains. N toggles night vision; T toggles thermals.');
  canvas.focus();
});
$('#export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, rules }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'sandbox-rules.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#rules-message').textContent = 'Rules exported. Share them or keep them as your own preset.';
});
$('#import').addEventListener('click', () => $('#rules-file').click());
$('#rules-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error('Rules file is too large.');
    const data = JSON.parse(await file.text());
    if (data.version !== 1) throw new Error('Unsupported rules version.');
    rules = restoreSavedRules(data.rules); syncRules(); saveRules();
    $('#rules-message').textContent = 'Rules imported. Deploy again to apply mission setup.';
  } catch (error) { $('#rules-message').textContent = `Could not import: ${error.message}`; }
  event.target.value = '';
});
function pause() {
  if (mapOpen || menuVisible) return;
  if (state.status === 'active') { state.status = 'paused'; held.clear(); releaseMouse(); showPause(); }
  else if (state.status === 'paused') resume();
}
window.addEventListener('keydown', event => {
  if (menuVisible) return;
  const action = lookup.get(event.code);
  if (mapOpen && (action === 'map' || action === 'floor')) {
    event.preventDefault();
    if (!event.repeat) { if (action === 'map') toggleMap(); else toggleFloor(); }
    return;
  }
  if (event.code === 'Tab' && !event.shiftKey) {
    event.preventDefault();
    if (!event.repeat) openKit();
    return;
  }
  if (action === 'pause' && !event.repeat && !event.target.closest?.('input, select')) { pause(); return; }
  if (event.target.closest?.('input, select, button, a')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight'].includes(event.code) || event.ctrlKey) event.preventDefault();
  held.add(event.code);
  if (event.repeat) return;
  if (action === 'view') toggleView();
  if (action === 'map') toggleMap();
  if (action === 'floor') toggleFloor();
  if (action === 'holster') { toggleHolster(state); aimed = false; firing = false; }
  if (['nightvision', 'thermal'].includes(action) && state.status === 'active' && !mapOpen) {
    const id = action;
    message(equip(state, id) ? `${state.inventory.vision === 'off' ? 'Normal vision' : items[id].name} active.` : `${items[id].name} not carried. Add it in loadout planning.`);
  }
  if (action === 'cover' && state.status === 'active' && !mapOpen) {
    const direction = scene?.aim(state).direction;
    if (direction) state.facing = [direction[0], direction[2]];
    message(togglePlayerCover(state, map));
  }
  if (action === 'peek' && state.status === 'active' && !mapOpen) setPlayerPeek(state, map, true);
  if (action === 'crouch' && state.status === 'active' && !mapOpen) message(toggleCrouch(state, map));
  if (action === 'reload' && weaponReady(state, rules) && reload(state)) message('Reloading…');
  if (action === 'aim') toggleAim();
  if (action === 'detonate') detonate();
  if (action?.startsWith('weapon')) equipSlot(Number(action.slice(6)));
  if (action === 'jump' && !mapOpen) jump(state, map);
  if (action === 'interact') { const result = interact(state, map); if (result) message(result); }
});
window.addEventListener('keyup', event => { held.delete(event.code); if (lookup.get(event.code) === 'peek') setPlayerPeek(state, map, false); });
window.addEventListener('blur', () => { held.clear(); firing = false; if (state.status === 'active') pause(); });
document.addEventListener('visibilitychange', () => {
  resetStats();
  if (document.hidden && state.status === 'active') pause();
});
const compassTicks = [];
for (let degrees = 0; degrees < 360; degrees += 15) {
  const element = document.createElement('span');
  element.className = degrees % 90 === 0 ? 'tick cardinal' : 'tick';
  element.textContent = degrees % 45 === 0 ? compassPoint(degrees) : '·';
  $('#compass').append(element); compassTicks.push({ degrees, element });
}
screens.menu(webglFailed ? '3D rendering is unavailable. This prototype needs a browser with WebGL2 and hardware acceleration enabled.' : '');
let previous = performance.now(), oldStatus = state.status;
function frame(now) {
  const frameTime = now - previous;
  const dt = Math.min(frameTime / 1000, 0.05); previous = now;
  const down = (action, ...extra) => held.has(bindings[action]) || extra.some(code => held.has(code));
  const localInput = {
    x: Number(down('right', 'ArrowRight')) - Number(down('left', 'ArrowLeft')),
    z: Number(down('back', 'ArrowDown')) - Number(down('forward', 'ArrowUp')),
    creep: down('creep', 'ControlRight'), running: down('run', 'ShiftRight'),
    peek: down('peek') && !menuVisible && !mapOpen,
  };
  if (!menuVisible) scene?.look((Number(held.has('KeyL')) - Number(held.has('KeyJ'))) * dt * 1.5, (Number(held.has('KeyI')) - Number(held.has('KeyK'))) * dt * 1.2);
  const movement = scene?.movement(localInput.x, localInput.z) ?? [localInput.x, localInput.z];
  const gait = movementGait(state, localInput);
  // Acceleration and deceleration: shape the held direction into a direction plus a fraction of full speed.
  const frozen = state.status !== 'active' || !!state.playerCover;
  const shaped = shapeInput(feelState, { x: movement[0], z: movement[1] }, dt, { smoothing: playerSettings.moveSmoothing, frozen });
  const input = { ...localInput, x: shaped.x, z: shaped.z, pace: shaped.pace };
  const before = [...state.player];
  stepMission(state, map, rules, dt, input);
  const topSpeed = rules.playerSpeed * (gait === 'creep' || gait === 'crouch' ? rules.creepMultiplier : gait === 'run' ? rules.runMultiplier : 1);
  const feel = observeMotion(feelState, state, map, before, gait, topSpeed, dt, { localX: localInput.x, bobScale: playerSettings.viewBob });
  if (state.status === 'active') for (const step of feel.events) { state.events.push(step); }
  if (firing && weapons[state.inventory.equipped]?.automatic) shoot(now);
  for (const effect of state.events.splice(0)) {
    if (effect.type === 'footstep') { if (playerSettings.footstepSounds) audio.step(effect.surface, effect.gait, effect.landing); continue; }
    scene?.eventEffect(effect, state);
  }
  const facing = scene?.aim(state).direction; if (facing) state.facing = [facing[0], facing[2]];
  if (state.status === 'active') scene?.face(movement[0], movement[1]);
  const exposed=!state.playerCover||state.playerCover.peeking;
  scene?.draw(state, rules, dt, { moving: shaped.pace > 0.05 && state.status === 'active', feel: state.status === 'active' ? feel.view : null, running: gait === 'run', firing: firing && state.status === 'active' && exposed, aimed:aimed&&exposed, scopeZoom, menuVisible, exposure: graphics.exposure });
  // The scope overlay waits until the scope has come up to the eye (src/weapon-handling.js).
  const scoped = exposed && !menuVisible && !!scene?.scoped();
  captureStatus.hidden = !scene?.capturingLight();
  if (scene && graphics.showStats) {
    if (statsSince === null) statsSince = now;
    else statsFrames++;
    const elapsed = now - statsSince;
    if (elapsed >= 500) {
      const { calls, triangles, width, height } = scene.renderStats();
      renderStats.textContent = `${(elapsed / statsFrames).toFixed(1)} ms/frame · ${calls} draws · ${triangles.toLocaleString()} tris · ${width}×${height}`;
      statsSince = now;
      statsFrames = 0;
    }
  }
  if (scene) $('#map-floor').value = String(scene.getFloor());
  $('#map-kills').textContent = `${state.kills}/${state.guards.length}`;
  if (state.surrenders) $('#map-kills').textContent += ` · ${state.surrenders} surrendered`;
  $('#scope-overlay').hidden = !scoped; $('#scope-zoom').textContent = `${scopeZoom}×`;
  $('#damage-overlay').style.opacity = state.hurtUntil > state.elapsed ? '0.45' : '0';
  $('#flash-overlay').style.opacity = Math.max(0, (state.flashUntil - state.elapsed) / 1.5) * 0.9;
  $('#health').textContent = Math.ceil(state.health);
  $('#health-meter').setAttribute('aria-valuenow', String(Math.ceil(state.health)));
  $('#health-fill').style.width = `${state.health}%`;
  $('.health-panel').classList.toggle('is-hurt', state.hurtUntil > state.elapsed);
  $('.health-panel').classList.toggle('is-low', state.health > 25 && state.health <= 50);
  $('.health-panel').classList.toggle('is-critical', state.health <= 25);
  $('#health-status').textContent = state.health <= 0 ? 'DOWNED' : state.health <= 25 ? 'CRITICAL · USE A MED KIT' : state.health <= 50 ? 'LOW HEALTH · FIND COVER' : state.health < 100 ? 'INJURED' : 'HEALTHY';
  const equipped = state.inventory.equipped;
  $('#equipped-name').textContent = (weapons[equipped]?.name ?? items[equipped]?.name ?? 'EMPTY HANDS').toUpperCase();
  document.body.classList.toggle('on-screen', !!screens.current() && screens.current() !== 'pause');
  const hudAlert = alertState(state);
  $('#alert-pill').textContent = hudAlert.label; $('#alert-pill').dataset.level = String(hudAlert.level);
  const heading = headingDegrees(state.facing, map.planUpHeading);
  $('#compass-heading').textContent = `${compassPoint(heading)} ${String(heading).padStart(3, '0')}°`;
  if (!playerSettings.minimalHud) for (const tick of compassTicks) {
    const diff = ((tick.degrees - heading + 540) % 360) - 180;
    tick.element.hidden = Math.abs(diff) > 70; if (!tick.element.hidden) tick.element.style.left = `${50 + diff / 140 * 100}%`;
  }
  const target = state.status === 'active' && !mapOpen && !menuVisible ? nearbyInteraction(state, map) : null;
  const promptText = interactionPrompt(target && (target.kind === 'door'
    ? { kind: 'door', open: state.doors[target.index], locked: state.lockedDoors?.[target.index], broken: state.doorHealth[target.index] <= 0 }
    : { kind: 'window', broken: state.windowHealth[target.index] <= 0, climbable: map.windows[target.index].climbable }));
  $('#interaction-prompt').hidden = !promptText;
  if ($('#interaction-prompt').textContent !== promptText) $('#interaction-prompt').textContent = promptText;
  const arrowOpacity = damageArrowOpacity(state);
  if (arrowOpacity > 0) $('#damage-arrow').style.setProperty('--bearing', `${damageBearing(state.player, state.facing, state.lastHit.from)}deg`);
  $('#damage-arrow').style.opacity = String(arrowOpacity);
  if (state.status === 'active') observeMission(timelineHolder.current, state);
  $('#ammo').textContent = equipped === 'unarmed' ? 'H · DRAW WEAPON' : items[equipped] ? `${items[equipped].action} · ${state.inventory.items[equipped]} left` : state.reloadUntil > state.elapsed ? 'RELOADING' : !weaponReady(state, rules) ? 'DRAWING' : rules.unlimitedAmmo ? '∞ / ∞' : `${String(state.ammo).padStart(2, '0')} / ∞`;
  const detaining = state.detainingGuardId !== null && state.detainingGuardId !== undefined;
  $('#detainment-banner').hidden = !detaining || mapOpen || menuVisible;
  const detentionText = detaining ? `GUARD ${state.detainingGuardId + 1} IS DETAINING YOU · Backup is approaching. You can still move and use inventory.` : '';
  if ($('#detainment-banner').textContent !== detentionText) $('#detainment-banner').textContent = detentionText;
  const radioText = state.guardReportUntil > state.elapsed ? state.lastGuardReport : '';
  $('#guard-radio').hidden = !radioText;
  if ($('#guard-radio').textContent !== radioText) $('#guard-radio').textContent = radioText;
  const floorName = map.levels?.reduce((nearest, floor) => Math.abs(floor.elevation - state.playerY) < Math.abs(nearest.elevation - state.playerY) ? floor : nearest).name;
  $('#gait').textContent = `${gait.toUpperCase()}${gait === 'creep' && state.crouched ? ' · CROUCHED' : ''}${floorName ? ` · ${floorName.toUpperCase()}` : ''}`;
  const cover=state.playerCover;
  $('#cover-status').hidden=!cover||mapOpen||menuVisible;
  const coverText=cover?.peeking?'PEEKING · Release X to duck back':cover?.blocked?'NO CLEAR PEEK · Move closer to an edge · Q / WASD leaves cover':`IN ${cover?.concealment?'CONCEALMENT':'COVER'} · Hold X to pop out · Q / WASD leaves cover`;
  if($('#cover-status').textContent!==coverText) $('#cover-status').textContent=coverText;
  // Aiming down the sights uses the gun's own sights, so the crosshair steps aside.
  $('#crosshair').hidden = view !== 'first' || mapOpen || menuVisible || scoped || (aimed && exposed && !!weapons[equipped] && equipped !== 'minigun') || state.status !== 'active';
  $('#hit-marker').hidden = now > hitUntil;
  $('#capture-mouse').hidden = !!screens.current() || view !== 'first' || mapOpen || menuVisible || scoped || !['active', 'paused'].includes(state.status) || document.pointerLockElement === canvas;
  const exposure = Math.max(0, ...state.guards.map(g => g.suspicion));
  $('#exposure').style.width = `${exposure * 100}%`;
  $('#exposure').style.background = exposure > 0.6 ? '#f18c76' : '#b8d4a0';
  $('#funds').textContent = `$${state.budget.toLocaleString()}`;
  $('#vision-status').textContent=`${(state.timeOfDay??'day').toUpperCase()} · ${state.inventory.vision==='nightvision'?'NIGHT VISION':state.inventory.vision==='thermal'?'THERMAL':'NORMAL'}`;
  $('#cut-power').disabled=!mapOpen||state.powerOn===false;
  $('#cut-power').textContent=state.powerOn===false?'Building power cut':'Cut building power';
  $('#power-status').textContent=state.powerOn===false?'Electricity off. Daylight and battery-powered optics remain.':'Building electricity on. Cutting it lasts until the next deployment.';
  const pulseRemaining = Math.max(0, Math.ceil(state.scanUntil - state.elapsed));
  $('#scan').disabled = !mapOpen || state.status !== 'paused' || state.budget < 250 || pulseRemaining > 0;
  const scanStatus = pulseRemaining ? `Tracking guards · ${pulseRemaining}s remaining. Timer pauses with the map.` : state.budget < 250 ? 'Not enough support funds ($250 required).' : 'Reveal guards on every floor for 10 mission seconds.';
  if ($('#scan-status').textContent !== scanStatus) $('#scan-status').textContent = scanStatus;
  $('#clock').textContent = formatClock(state.elapsed);
  $('#phase').textContent = state.status.toUpperCase();
  const objectiveText = state.collected ? 'Archive secured. Return to extraction.' : `${map.objective?.label ?? 'Archive'}: retrieve it, then extract.`;
  $('#objective').textContent = objectiveText; $('#objective-card').textContent = objectiveText;
  if (state.status !== oldStatus) {
    if (state.status === 'captured' || state.status === 'complete') {
      const success = state.status === 'complete';
      kitMenu.close();
      releaseMouse(); held.clear();
      screens.debrief({ state, timeline: timelineHolder.current, map });
      message(success ? 'Mission complete.' : 'Health depleted. Replan your kit and try again.');
    }
    oldStatus = state.status;
  }
  const nearDoor = map.doors.some(d => distance(state.player, d.position) < 1.8);
  $('#world').setAttribute('data-interaction', nearDoor ? 'door' : '');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
