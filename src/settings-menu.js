// The tabbed settings dialog: Graphics, Audio, Controls, Interface and Game.
// Graphics and Game reuse controls main.js already builds (quality, exposure,
// mission rules); the others are generated from settings.js.
import { settingsSchema, bindingLabels, defaultBindings, keyLabel, rebind } from './settings.js';

const tabs = [['graphics', 'Graphics'], ['audio', 'Audio'], ['controls', 'Controls'], ['interface', 'Interface'], ['game', 'Game']];

export function createSettingsMenu({ getSettings, setSettings, getBindings, setBindings, graphicsPanel, gamePanel, onOpen, onClose }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'settings-menu'; dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = `<div class="settings-head"><h2 id="settings-title">Settings</h2><button class="secondary" id="settings-close">Close</button></div>
    <div class="settings-tabs" role="tablist" aria-label="Settings sections">${tabs.map(([id, label]) => `<button role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="false" tabindex="-1" data-tab="${id}">${label}</button>`).join('')}</div>
    <div class="settings-panels">${tabs.map(([id]) => `<div role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" hidden></div>`).join('')}</div>`;
  document.body.append(dialog);
  const panel = id => dialog.querySelector(`#panel-${id}`);

  // One row per schema field, written back through setSettings.
  function row(key) {
    const field = settingsSchema[key], value = getSettings()[key], element = document.createElement('div');
    element.className = 'setting';
    const id = `setting-${key}`, boolean = typeof field.value === 'boolean';
    element.innerHTML = `<label for="${id}">${field.label}</label>${boolean ? `<input id="${id}" type="checkbox" role="switch">` : field.options
      ? `<select id="${id}">${field.options.map(option => `<option>${option}</option>`).join('')}</select>`
      : `<output for="${id}"></output><input id="${id}" type="range" min="${field.min}" max="${field.max}" step="${field.step}">`}`;
    const control = element.querySelector('input, select'), output = element.querySelector('output');
    const show = v => { if (output) output.textContent = field.max === 1 && field.min === 0 && !field.unit ? `${Math.round(v * 100)}%` : `${Number(v).toFixed(2)}${field.unit ?? ''}`; };
    if (boolean) control.checked = value; else control.value = value;
    show(value);
    control.addEventListener('input', () => {
      const next = boolean ? control.checked : field.options ? control.value : Number(control.value);
      show(next); setSettings({ ...getSettings(), [key]: next });
    });
    return element;
  }
  const group = name => Object.keys(settingsSchema).filter(key => settingsSchema[key].group === name).map(row);

  panel('graphics').append(graphicsPanel);
  panel('audio').append(...group('Audio'));
  panel('audio').insertAdjacentHTML('beforeend', '<p class="settings-note">Gunfire volume is in the Game tab. Music and radio chatter have no sound yet, so they have no sliders.</p>');
  panel('interface').append(...group('Interface'));
  panel('game').append(gamePanel);

  // Controls: look settings and the key binding table.
  const bindMessage = document.createElement('p'); bindMessage.className = 'bind-message'; bindMessage.setAttribute('role', 'status');
  const grid = document.createElement('div'); grid.className = 'bind-grid';
  let listening = null;
  function drawBindings() {
    const bindings = getBindings();
    grid.replaceChildren(...Object.keys(bindingLabels).map(action => {
      const item = document.createElement('div'); item.className = 'bind-row';
      item.innerHTML = `<span>${bindingLabels[action]}</span><button data-bind="${action}" aria-label="Key for ${bindingLabels[action]}: ${keyLabel(bindings[action])}">${keyLabel(bindings[action])}</button>`;
      item.querySelector('button').addEventListener('click', event => listen(action, event.currentTarget));
      return item;
    }));
  }
  function stopListening() { listening = null; grid.querySelectorAll('.is-listening').forEach(b => b.classList.remove('is-listening')); }
  function listen(action, button) {
    stopListening(); listening = action; button.classList.add('is-listening'); button.textContent = 'Press a key…';
    bindMessage.textContent = `Press the new key for “${bindingLabels[action]}”. Esc cancels.`;
  }
  dialog.addEventListener('keydown', event => {
    if (!listening) return;
    event.preventDefault(); event.stopPropagation();
    if (event.code === 'Escape') { stopListening(); drawBindings(); bindMessage.textContent = ''; return; }
    const action = listening, result = rebind(getBindings(), action, event.code);
    stopListening();
    if (result.ok) { setBindings(result.bindings); bindMessage.textContent = `${bindingLabels[action]} is now ${keyLabel(event.code)}.`; drawBindings(); }
    else {
      bindMessage.textContent = result.message; drawBindings();
      const clash = grid.querySelector(`[data-bind="${result.conflict ?? action}"]`); clash?.classList.add('is-conflict');
      setTimeout(() => clash?.classList.remove('is-conflict'), 1500);
    }
  }, true);
  const reset = document.createElement('button'); reset.className = 'secondary'; reset.textContent = 'Reset keys to default';
  reset.addEventListener('click', () => { setBindings({ ...defaultBindings }); drawBindings(); bindMessage.textContent = 'Keys reset.'; });
  const actions = document.createElement('div'); actions.className = 'settings-actions'; actions.append(reset);
  panel('controls').append(...group('Controls'), Object.assign(document.createElement('h3'), { textContent: 'Key bindings' }), grid, bindMessage, actions);
  panel('controls').insertAdjacentHTML('beforeend', '<p class="settings-note">Tab (inventory) and Esc (release the mouse) are fixed. WASD movement also answers to the arrow keys; I J K L look around when the mouse is unavailable.</p>');
  drawBindings();

  function select(id) {
    for (const [tab] of tabs) {
      const button = dialog.querySelector(`#tab-${tab}`), active = tab === id;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; panel(tab).hidden = !active;
    }
  }
  const tabList = dialog.querySelector('[role=tablist]');
  tabList.addEventListener('click', event => { const button = event.target.closest('[data-tab]'); if (button) select(button.dataset.tab); });
  tabList.addEventListener('keydown', event => {
    const index = tabs.findIndex(([id]) => dialog.querySelector(`#tab-${id}`).getAttribute('aria-selected') === 'true');
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); const id = tabs[(next + tabs.length) % tabs.length][0]; select(id); dialog.querySelector(`#tab-${id}`).focus();
  });

  select('graphics');
  const close = () => { if (!dialog.open) return; stopListening(); dialog.close(); onClose?.(); };
  dialog.querySelector('#settings-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!listening) close(); });
  return {
    open(tab = 'graphics') { if (dialog.open) return; onOpen?.(); select(tab); drawBindings(); dialog.showModal(); dialog.querySelector(`#tab-${tab}`).focus(); },
    close, isOpen: () => dialog.open,
  };
}
