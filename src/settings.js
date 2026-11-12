// Player settings that are not mission rules: audio, controls, interface and key
// bindings. Pure data and validation, so it runs in Node tests; main.js and
// settings-menu.js do the drawing. Mission rules stay in rules.js.

export const settingsSchema = {
  masterVolume: { label: 'Master volume', group: 'Audio', min: 0, max: 1, step: 0.05, value: 1 },
  sensitivity: { label: 'Mouse sensitivity', group: 'Controls', min: 0.25, max: 3, step: 0.05, value: 1, unit: '×' },
  invertY: { label: 'Invert vertical look', group: 'Controls', value: false },
  hudScale: { label: 'HUD scale', group: 'Interface', min: 0.75, max: 1.5, step: 0.05, value: 1, unit: '×' },
  minimalHud: { label: 'Minimal HUD', group: 'Interface', value: false },
  crosshair: { label: 'Crosshair', group: 'Interface', options: ['plus', 'dot', 'ring', 'none'], value: 'plus' },
  showHints: { label: 'Show control hints', group: 'Interface', value: true },
};
export const defaultSettings = Object.fromEntries(Object.entries(settingsSchema).map(([key, field]) => [key, field.value]));

// Action -> default key code. Tab (inventory) and Escape (release mouse) are fixed.
export const bindingLabels = {
  forward: 'Move forward', back: 'Move back', left: 'Move left', right: 'Move right',
  run: 'Run (hold)', creep: 'Creep (hold)', crouch: 'Crouch', jump: 'Jump', interact: 'Interact',
  reload: 'Reload', aim: 'Aim / scope', holster: 'Holster', cover: 'Take cover', peek: 'Peek (hold)', detonate: 'Detonate charges',
  nightvision: 'Night vision', thermal: 'Thermals', view: 'Change view', map: 'Tactical map', floor: 'Switch floor', pause: 'Pause',
  weapon1: 'Weapon 1', weapon2: 'Weapon 2', weapon3: 'Weapon 3', weapon4: 'Weapon 4', weapon5: 'Weapon 5',
  weapon6: 'Slot 6 · Grenade', weapon7: 'Slot 7 · Flashbang', weapon8: 'Slot 8 · Det cord',
};
export const defaultBindings = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  run: 'ShiftLeft', creep: 'ControlLeft', crouch: 'KeyC', jump: 'Space', interact: 'KeyE',
  reload: 'KeyR', aim: 'KeyZ', holster: 'KeyH', cover: 'KeyQ', peek: 'KeyX', detonate: 'KeyB',
  nightvision: 'KeyN', thermal: 'KeyT', view: 'KeyV', map: 'KeyM', floor: 'KeyF', pause: 'KeyP',
  weapon1: 'Digit1', weapon2: 'Digit2', weapon3: 'Digit3', weapon4: 'Digit4', weapon5: 'Digit5',
  weapon6: 'Digit6', weapon7: 'Digit7', weapon8: 'Digit8',
};
export const reservedCodes = ['Escape', 'Tab', 'F5', 'F11', 'F12'];

export function validateSettings(input) {
  const result = { ...defaultSettings };
  if (!input || typeof input !== 'object') return result;
  for (const [key, field] of Object.entries(settingsSchema)) {
    const value = input[key];
    if (field.options) { if (field.options.includes(value)) result[key] = value; }
    else if (typeof field.value === 'boolean') { if (typeof value === 'boolean') result[key] = value; }
    else if (Number.isFinite(value)) result[key] = Math.max(field.min, Math.min(field.max, value));
  }
  return result;
}

// Keep each saved key that is valid and not already used; every other action
// gets its default key back, or the first unused default if that one is taken.
export function validateBindings(input) {
  const result = {}, used = new Set(), actions = Object.keys(defaultBindings);
  const saved = input && typeof input === 'object' ? input : {};
  for (const action of actions) {
    const code = saved[action];
    if (typeof code === 'string' && code && !reservedCodes.includes(code) && !used.has(code)) { result[action] = code; used.add(code); }
  }
  for (const action of actions) {
    if (result[action]) continue;
    const code = !used.has(defaultBindings[action]) ? defaultBindings[action] : Object.values(defaultBindings).find(key => !used.has(key));
    result[action] = code; used.add(code);
  }
  return result;
}

// Try to bind `code` to `action`. A key already used by another action is
// refused, naming that action; the caller shows the message.
export function rebind(bindings, action, code) {
  if (!Object.hasOwn(defaultBindings, action)) return { ok: false, message: 'Unknown action.', bindings };
  if (reservedCodes.includes(code)) return { ok: false, message: `${keyLabel(code)} is reserved.`, bindings };
  const other = Object.keys(bindings).find(name => name !== action && bindings[name] === code);
  if (other) return { ok: false, conflict: other, message: `${keyLabel(code)} is already used by ${bindingLabels[other]}.`, bindings };
  return { ok: true, bindings: { ...bindings, [action]: code } };
}

const keyNames = {
  ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt',
  Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: '\'', Comma: ',',
  Period: '.', Slash: '/', Backslash: '\\', Escape: 'Esc', CapsLock: 'Caps Lock',
};
export function keyLabel(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return keyNames[code] ?? code.replace(/^Arrow/, '');
}

// Reverse lookup used by the key handler: code -> action.
export const actionLookup = bindings => new Map(Object.entries(bindings).map(([action, code]) => [code, action]));

const settingsKey = 'stealth-settings-v1', bindingsKey = 'stealth-bindings-v1';
const read = (storage, key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
const write = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const browserStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export const loadSettings = (storage = browserStorage()) => validateSettings(storage && read(storage, settingsKey));
export const saveSettings = (settings, storage = browserStorage()) => !!storage && write(storage, settingsKey, settings);
export const loadBindings = (storage = browserStorage()) => validateBindings(storage && read(storage, bindingsKey));
export const saveBindings = (bindings, storage = browserStorage()) => !!storage && write(storage, bindingsKey, bindings);
