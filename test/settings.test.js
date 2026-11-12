import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, defaultBindings, validateSettings, validateBindings, rebind, keyLabel, actionLookup, loadSettings, saveSettings, loadBindings, saveBindings, bindingLabels } from '../src/settings.js';

const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };

test('defaults are valid and every action has a label and one distinct key', () => {
  assert.deepEqual(validateSettings(defaultSettings), defaultSettings);
  assert.deepEqual(Object.keys(defaultBindings), Object.keys(bindingLabels));
  assert.equal(new Set(Object.values(defaultBindings)).size, Object.keys(defaultBindings).length);
  assert.deepEqual(validateBindings(defaultBindings), defaultBindings);
});

test('settings are clamped, and wrong types fall back to defaults', () => {
  const result = validateSettings({ masterVolume: 9, sensitivity: -1, invertY: 'yes', hudScale: 1.2, crosshair: 'laser', minimalHud: true, showHints: 3 });
  assert.equal(result.masterVolume, 1);
  assert.equal(result.sensitivity, 0.25);
  assert.equal(result.invertY, false);
  assert.equal(result.hudScale, 1.2);
  assert.equal(result.crosshair, 'plus');
  assert.equal(result.minimalHud, true);
  assert.equal(result.showHints, true);
  assert.deepEqual(validateSettings(null), defaultSettings);
});

test('rebinding refuses a key another action uses and names it', () => {
  const bad = rebind(defaultBindings, 'reload', 'KeyW');
  assert.equal(bad.ok, false);
  assert.equal(bad.conflict, 'forward');
  assert.match(bad.message, /W is already used by Move forward/);
  assert.equal(bad.bindings, defaultBindings);
  const good = rebind(defaultBindings, 'reload', 'KeyG');
  assert.equal(good.ok, true);
  assert.equal(good.bindings.reload, 'KeyG');
  assert.equal(defaultBindings.reload, 'KeyR');
  assert.equal(rebind(defaultBindings, 'reload', 'KeyR').ok, true, 'rebinding an action to its own key is fine');
  assert.equal(rebind(defaultBindings, 'reload', 'Escape').ok, false);
  assert.equal(rebind(defaultBindings, 'reload', 'Tab').ok, false);
  assert.equal(rebind(defaultBindings, 'nonsense', 'KeyG').ok, false);
});

test('saved bindings with duplicates or reserved keys never leave two actions on one key', () => {
  const messy = { ...defaultBindings, reload: 'KeyW', jump: 'Escape', crouch: 'KeyG' };
  const result = validateBindings(messy);
  assert.equal(new Set(Object.values(result)).size, Object.keys(result).length);
  assert.equal(Object.keys(result).length, Object.keys(defaultBindings).length);
  assert.equal(result.crouch, 'KeyG');
  assert.equal(result.forward, 'KeyW');
  assert.ok(!Object.values(result).includes('Escape'));
  assert.deepEqual(validateBindings('garbage'), defaultBindings);
});

test('labels, lookup and storage round trips', () => {
  assert.deepEqual(['KeyW', 'Digit3', 'ShiftLeft', 'Space', 'ArrowUp'].map(keyLabel), ['W', '3', 'Left Shift', 'Space', 'Up']);
  assert.equal(actionLookup(defaultBindings).get('KeyE'), 'interact');
  const storage = memory();
  assert.deepEqual(loadSettings(storage), defaultSettings);
  assert.ok(saveSettings({ ...defaultSettings, hudScale: 1.3 }, storage));
  assert.equal(loadSettings(storage).hudScale, 1.3);
  assert.ok(saveBindings({ ...defaultBindings, reload: 'KeyG' }, storage));
  assert.equal(loadBindings(storage).reload, 'KeyG');
  assert.equal(saveSettings(defaultSettings, null), false);
  const broken = { getItem: () => '{not json', setItem: () => { throw new Error('full'); } };
  assert.deepEqual(loadSettings(broken), defaultSettings);
  assert.equal(saveSettings(defaultSettings, broken), false);
});
