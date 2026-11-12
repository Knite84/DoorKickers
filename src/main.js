import './style.css';
import { schema, defaults, presets, restoreSavedRules } from './rules.js';
import { maps, resolveMap } from './maps/index.js';
import { createMission, stepMission, interact, distance, movementGait, toggleCrouch, jump } from './simulation.js';
import { createScene } from './scene.js';
import { fireWeapon, reload } from './weapons.js';
import { createGunAudio } from './audio.js';
import { weapons, items, ammoTypes, defaultLoadout, validateLoadout, equip, toggleHolster, restockEquipment } from './kit.js';
import { useEquipment, detonateCharges, weaponStrike } from './equipment.js';
import { createKitMenu } from './menus.js';
import { bindCombatMouse } from './combat-input.js';
import { togglePlayerCover, setPlayerPeek } from './player-cover.js';
import { cutPower } from './lighting.js';
import { exposureRange, graphicsPresets, loadGraphics, saveGraphics } from './graphics.js';

const app = document.querySelector('#app');
document.body.classList.add('rules-hidden');
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Stealth sandbox home"><span class="brand-mark">⌑</span><span>UNTITLED<span class="brand-sub">A STEALTH SANDBOX</span></span></a>
    <span class="build-tag">FIELD LAB <span> / </span> 003</span>
    <div class="view-tools"><button id="inventory-toggle" class="quiet">Tab · Inventory / kit</button><button id="view-toggle" class="quiet">V · First person</button><button id="map-toggle" class="quiet" aria-pressed="false">M · Map</button></div>
    <button id="toggle-rules" class="quiet" aria-expanded="false">Sandbox rules <span>☷</span></button>
  </header>
  <main>
    <section class="viewport" aria-label="Playable mission">
      <canvas id="world" tabindex="0" aria-label="3D mission. WASD moves, Q toggles nearby cover, hold X to peek and release to hide, Hold Shift to run, Ctrl creeps, C toggles crouch, F switches map floors, Tab opens inventory, E interacts, V changes view, M opens map, left mouse fires including while aiming or scoped, R reloads, H holsters, Z aims, B detonates charges."></canvas>
      <div id="cover-status" hidden role="status"></div>
      <div id="crosshair" aria-hidden="true">+</div><div id="hit-marker" aria-hidden="true">×</div>
      <div id="scope-overlay" hidden aria-label="Sniper scope"><div class="scope-reticle"></div><span id="scope-zoom">4×</span></div><div id="damage-overlay" aria-hidden="true"></div><div id="flash-overlay" aria-hidden="true"></div>
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
      <div class="mission-card"><div class="eyebrow">OPERATION / 01</div><h1>The quiet house</h1><p id="objective">Retrieve the archive and extract.</p><div class="mission-line"><span class="status-dot"></span><span id="phase">PLANNING</span><span id="clock">00:00</span></div><div id="render-stats" hidden aria-label="Rendering performance"></div></div>
      <div class="map-stamp">N ↑<br><span>COURTYARD RESIDENCE<br>1 UNIT = 1 METRE</span></div>
      <div class="center-card" id="briefing"><div class="eyebrow">YOUR PLAN. YOUR RULES.</div><h2>Choose your kit.<br>Find your way.</h2><p>Retrieve the archive and extract. Plan your entry, choose weapons, ammunition and tools, then deploy. Doors and destructible interior partitions are alternative routes in the same guarded mission.</p><p class="muted">Tab opens inventory. E interacts. Left click fires while aimed or scoped. Headshots are lethal with every weapon and ammo configuration.</p><button id="deploy" class="primary">Loadout & planning <span>↗</span></button></div>
      <div class="bottom-hud"><div class="telemetry"><div class="health-panel"><span class="eyebrow">PLAYER HEALTH</span><div class="health-value"><strong id="health">100</strong><span>/ 100</span></div><div id="health-meter" role="meter" aria-label="Player health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div id="health-fill"></div></div><span id="health-status">HEALTHY</span></div><div><span class="eyebrow">EXPOSURE</span><div class="meter"><div id="exposure"></div></div></div><div><span class="eyebrow">SUPPORT FUNDS</span><strong id="funds">$1,000</strong></div><div class="weapon-hud"><span class="eyebrow"><span id="equipped-name">ASSAULT RIFLE</span> / <span id="gait">WALK</span></span><strong id="ammo">30 / ∞</strong></div></div><p id="message" role="status" aria-live="polite">Choose your kit and plan your approach.</p><p id="guard-radio" hidden role="status" aria-live="polite"></p><div class="controls"><span><kbd>WASD</kbd> Move</span><span><kbd>Tab</kbd> Inventory</span><span><kbd>E</kbd> Door / climb</span><span><kbd>Shift</kbd> Hold to run</span><span><kbd>Ctrl</kbd> Creep</span><span><kbd>C</kbd> Crouch</span><span><kbd>Space</kbd> Jump</span><span><kbd>Mouse 4</kbd> Weapon strike</span><span><kbd>P</kbd> Pause</span><span><kbd>LMB</kbd> Use/fire</span><span><kbd>1–5</kbd> Weapons</span><span><kbd>H</kbd> Holster</span><span><kbd>R</kbd> Reload</span><span><kbd>Z</kbd> Aim/scope</span><span><kbd>B</kbd> Detonate</span><span><kbd>V/M</kbd> View/map</span></div></div>
    </section>
    <aside id="rules-panel" aria-label="Sandbox rules">
      <div class="panel-heading"><div class="eyebrow">MAKE IT YOURS</div><h2>Sandbox rules</h2><p>A starting point, never a restriction.</p></div>
      <label class="preset-label" for="preset">Starting preset</label><select id="preset">${Object.keys(presets).map(name => `<option>${name}</option>`).join('')}<option disabled>Custom</option></select>
      <section class="settings-group" aria-labelledby="graphics-heading">
        <h3 id="graphics-heading">Graphics</h3>
        <div class="setting"><label for="graphics-preset">Quality preset</label><select id="graphics-preset">${Object.keys(graphicsPresets).map(name => `<option>${name}</option>`).join('')}</select></div>
        <div class="setting"><label for="graphics-stats">Show performance</label><input id="graphics-stats" type="checkbox" role="switch"></div>
        <div class="setting"><label for="graphics-exposure">First-person exposure</label><output id="graphics-exposure-value" for="graphics-exposure" aria-live="off"></output><input id="graphics-exposure" type="range" min="${exposureRange.min}" max="${exposureRange.max}" step="0.05"></div>
        <p id="graphics-notice" class="muted" role="status" hidden>Reload the page to apply the anti-aliasing change.</p>
      </section>
      <div id="settings"></div>
      <div class="rules-note"><span>↳</span><p>Entry point, guard count, budget, and door durability apply on a new deployment. Other changes apply live. Rain reduces sight to 85%; fog to 60%.</p></div>
      <button id="restart" class="secondary">New deployment <span>↻</span></button>
      <div class="share-row"><button id="export" class="quiet">Export rules ↓</button><button id="import" class="quiet">Import rules ↑</button><input type="file" id="rules-file" accept=".json,application/json" hidden></div>
      <p id="rules-message" class="muted" role="status" aria-live="polite">Saved automatically on this browser.</p>
      <div class="panel-footer">PROTOTYPE 0.3 <span>Built to be changed.</span></div>
    </aside>
  </main>`;

const $ = selector => document.querySelector(selector);
$('.controls').insertAdjacentHTML('beforeend','<span><kbd>Q</kbd> Cover</span><span><kbd>X</kbd> Hold to peek</span>');
$('.controls').insertAdjacentHTML('beforeend','<span><kbd>N</kbd> Night vision</span><span><kbd>T</kbd> Thermals</span>');
$('.telemetry').insertAdjacentHTML('afterbegin','<div class="vision-panel"><span>LIGHT / VISION</span><strong id="vision-status">DAY · NORMAL</strong></div>');
let rules = { ...defaults };
try {
  const saved = localStorage.getItem('stealth-rules-v1');
  if (saved) rules = restoreSavedRules(JSON.parse(saved));
} catch { /* Storage is optional; malformed saved rules fall back to defaults. */ }
let loadout = defaultLoadout();
try { const saved = localStorage.getItem('stealth-loadout-v1'); if (saved) loadout = validateLoadout(JSON.parse(saved)); } catch { /* Invalid saved kits use defaults. */ }
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
let scene;
try { scene = createScene($('#world'), map, scenePreset()); }
catch (error) {
  $('#briefing').innerHTML = '<h2>3D rendering unavailable</h2><p>This prototype needs a browser with WebGL2 and hardware acceleration enabled.</p>';
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
let view = 'first', mapOpen = false, mapWasActive = false, firing = false, captureFailed = false, hitUntil = 0, menuVisible = false, aimed = false, scopeZoom = 4;
const canvas = $('#world');
function releaseMouse() {
  firing = false;
  held.delete('KeyX'); setPlayerPeek(state,map,false);
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
  onClose: () => { menuVisible = false; if (menuWasActive && menuPaused && state.status === 'paused') state.status = 'active'; canvas.focus(); },
  equip: id => { equip(state, id); aimed = false; }, detonate,
  restock: () => restockEquipment(state),
});
function openKit() { kitMenu.open(['planning', 'complete', 'captured'].includes(state.status) ? 'planning' : 'inventory'); }
$('#inventory-toggle').addEventListener('click', openKit);
function toggleAim() {
  if (view !== 'first' || mapOpen || menuVisible || state.status !== 'active' || !weapons[state.inventory.equipped]) return;
  aimed = !aimed;
}
canvas.addEventListener('wheel', event => {
  if (aimed && state.inventory.equipped === 'sniper') { event.preventDefault(); scopeZoom = Math.max(2, Math.min(8, scopeZoom - Math.sign(event.deltaY))); }
}, { passive: false });
function detonate() {
  if (state.status !== 'active') return message('Resume the mission before detonating charges.');
  const count = detonateCharges(state, map, rules);
  message(count ? `${count} placed charge(s) detonated.` : 'No placed charges to detonate.');
}
function shoot(now = performance.now()) {
  if (mapOpen || menuVisible || !scene) return;
  if (state.inventory.equipped === 'unarmed') return message('Hands empty. H draws your last weapon; Tab opens inventory.');
  const aim = scene.aim(state);
  if (items[state.inventory.equipped]) { const result = useEquipment(state, map, rules, aim.origin, aim.direction); if (result) message(result); return; }
  const shot = fireWeapon(state, map, rules, aim.origin, aim.direction);
  if (shot) {
    for (const pellet of shot.pellets) scene.shotEffect(pellet);
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
function deploy() {
  if (!scene) return;
  const nextMap = resolveMap(plannedMap);
  if (map !== nextMap) {
    releaseMouse(); scene.dispose(); map = nextMap; scene = createScene(canvas, map, scenePreset()); scene.setView(view);
    updateMapLabels();
  }
  held.clear(); state = createMission(map, missionRules(), loadout); state.status = 'active'; showSeed(); resetStats();
  mapOpen = false; firing = false; aimed = false; scene.reset(state.spawnYaw); scene.setMap(false);
  $('#map-banner').hidden = true; $('#map-toggle').setAttribute('aria-pressed', 'false');
  $('.viewport').classList.remove('map-open');
  $('#briefing').hidden = true;
  message(map.description ?? 'Mission live. Click to aim. V changes view; M opens map. Interior partition is breakable.');
  $('#world').focus();
}
$('#deploy')?.addEventListener('click', () => kitMenu.open('planning'));
$('#restart').addEventListener('click', () => kitMenu.open('planning'));
$('#toggle-rules').addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('rules-hidden');
  $('#toggle-rules').setAttribute('aria-expanded', String(!collapsed));
});
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
  if (state.status === 'active') { state.status = 'paused'; held.clear(); releaseMouse(); message('Paused. P resumes, or click the aim button.'); }
  else if (state.status === 'paused') { state.status = 'active'; message('Mission resumed.'); }
}
window.addEventListener('keydown', event => {
  if (menuVisible) return;
  if (mapOpen && ['KeyM', 'KeyF'].includes(event.code)) {
    event.preventDefault();
    if (!event.repeat) { if (event.code === 'KeyM') toggleMap(); else toggleFloor(); }
    return;
  }
  if (event.code === 'Tab' && !event.shiftKey) {
    event.preventDefault();
    if (!event.repeat) openKit();
    return;
  }
  if (event.target.closest('input, select, button, a')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight'].includes(event.code) || event.ctrlKey) event.preventDefault();
  held.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyV') toggleView();
  if (event.code === 'KeyM') toggleMap();
  if (event.code === 'KeyF') toggleFloor();
  if (event.code === 'KeyH') { toggleHolster(state); aimed = false; firing = false; }
  if(['KeyN','KeyT'].includes(event.code)&&state.status==='active'&&!mapOpen){
    const id=event.code==='KeyN'?'nightvision':'thermal';
    message(equip(state,id)?`${state.inventory.vision==='off'?'Normal vision':items[id].name} active.`:`${items[id].name} not carried. Add it in loadout planning.`);
  }
  if (event.code === 'KeyQ' && state.status === 'active' && !mapOpen) {
    const direction=scene?.aim(state).direction;
    if(direction) state.facing=[direction[0],direction[2]];
    message(togglePlayerCover(state,map));
  }
  if (event.code === 'KeyX' && state.status === 'active' && !mapOpen) setPlayerPeek(state,map,true);
  if (event.code === 'KeyC' && state.status === 'active' && !mapOpen) message(toggleCrouch(state, map));
  if (event.code === 'KeyR' && reload(state)) message('Reloading…');
  if (event.code === 'KeyZ') toggleAim();
  if (event.code === 'KeyB') detonate();
  if (event.code.startsWith('Digit') && Number(event.code.slice(5)) >= 1 && Number(event.code.slice(5)) <= 5) { equip(state, ['rifle', 'pistol', 'shotgun', 'sniper', 'minigun'][Number(event.code.slice(5)) - 1]); aimed = false; }
  if (event.code === 'KeyP') pause();
  if (event.code === 'Space' && !mapOpen) jump(state, map);
  if (event.code === 'KeyE') { const result = interact(state, map); if (result) message(result); }
});
window.addEventListener('keyup', event => { held.delete(event.code); if(event.code==='KeyX') setPlayerPeek(state,map,false); });
window.addEventListener('blur', () => { held.clear(); firing = false; if (state.status === 'active') pause(); });
document.addEventListener('visibilitychange', () => {
  resetStats();
  if (document.hidden && state.status === 'active') pause();
});
let previous = performance.now(), oldStatus = state.status;
function frame(now) {
  const frameTime = now - previous;
  const dt = Math.min(frameTime / 1000, 0.05); previous = now;
  const localInput = {
    x: Number(held.has('KeyD') || held.has('ArrowRight')) - Number(held.has('KeyA') || held.has('ArrowLeft')),
    z: Number(held.has('KeyS') || held.has('ArrowDown')) - Number(held.has('KeyW') || held.has('ArrowUp')),
    creep: held.has('ControlLeft') || held.has('ControlRight'), running: held.has('ShiftLeft') || held.has('ShiftRight'),
    peek: held.has('KeyX') && !menuVisible && !mapOpen,
  };
  if (!menuVisible) scene?.look((Number(held.has('KeyL')) - Number(held.has('KeyJ'))) * dt * 1.5, (Number(held.has('KeyI')) - Number(held.has('KeyK'))) * dt * 1.2);
  const movement = scene?.movement(localInput.x, localInput.z) ?? [localInput.x, localInput.z];
  const input = { ...localInput, x: movement[0], z: movement[1] };
  const gait = movementGait(state, input);
  stepMission(state, map, rules, dt, input);
  if (firing && weapons[state.inventory.equipped]?.automatic) shoot(now);
  for (const effect of state.events.splice(0)) scene?.eventEffect(effect);
  const facing = scene?.aim(state).direction; if (facing) state.facing = [facing[0], facing[2]];
  if (state.status === 'active') scene?.face(input.x, input.z);
  const exposed=!state.playerCover||state.playerCover.peeking;
  const scoped = exposed && aimed && state.inventory.equipped === 'sniper' && view === 'first' && !mapOpen && !menuVisible;
  scene?.draw(state, rules, dt, { moving: !!(input.x || input.z) && state.status === 'active', running: gait === 'run', firing: firing && state.status === 'active' && exposed, aimed:aimed&&exposed, scopeZoom, menuVisible, exposure: graphics.exposure });
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
  $('#ammo').textContent = equipped === 'unarmed' ? 'H · DRAW WEAPON' : items[equipped] ? `${items[equipped].action} · ${state.inventory.items[equipped]} left` : state.reloadUntil > state.elapsed ? 'RELOADING' : rules.unlimitedAmmo ? '∞ / ∞' : `${String(state.ammo).padStart(2, '0')} / ∞`;
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
  $('#crosshair').hidden = view !== 'first' || mapOpen || menuVisible || scoped || state.status !== 'active';
  $('#hit-marker').hidden = now > hitUntil;
  $('#capture-mouse').hidden = view !== 'first' || mapOpen || menuVisible || scoped || !['active', 'paused'].includes(state.status) || document.pointerLockElement === canvas;
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
  $('#clock').textContent = `${String(Math.floor(state.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`;
  $('#phase').textContent = state.status.toUpperCase();
  $('#objective').textContent = state.collected ? 'Archive secured. Return to extraction.' : 'Retrieve the archive and extract.';
  if (state.status !== oldStatus) {
    if (state.status === 'captured' || state.status === 'complete') {
      const success = state.status === 'complete';
      kitMenu.close();
      releaseMouse(); held.clear();
      $('#briefing').hidden = false;
      $('#briefing').innerHTML = `<div class="eyebrow">${success ? 'EXTRACTION COMPLETE' : 'MISSION INTERRUPTED'}</div><h2>${success ? 'Your way through.' : 'You were downed.'}</h2><p>${success ? `Archive retrieved. ${state.shots} shots fired; ${state.kills} guards eliminated.` : 'Health depleted. Try cover, different gear, a med kit, or different rules.'}</p><button id="retry" class="primary">Loadout & planning <span>↗</span></button>`;
      $('#retry').addEventListener('click', () => kitMenu.open('planning'));
      message(success ? 'Mission complete.' : 'Health depleted. Replan your kit and try again.');
    }
    oldStatus = state.status;
  }
  const nearDoor = map.doors.some(d => distance(state.player, d.position) < 1.8);
  $('#world').setAttribute('data-interaction', nearDoor ? 'door' : '');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
