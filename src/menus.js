import { weapons, items, ammoTypes, ammoFor, validateLoadout, pistolModels, weaponKey, weaponSpec } from './kit.js';

export function createKitMenu(callbacks) {
  const dialog = document.createElement('dialog'); dialog.id = 'kit-menu'; dialog.setAttribute('aria-labelledby', 'kit-title');
  document.body.append(dialog);
  let mode = 'planning';
  const isPlanning = () => mode === 'planning';
  const kit = () => isPlanning() ? callbacks.getLoadout() : callbacks.getState().inventory;
  function render() {
    const planning = isPlanning(), current = kit(), state = callbacks.getState();
    const maps = callbacks.getMaps(), selectedMap = maps[callbacks.getPlannedMap()];
    dialog.innerHTML = `
      <div class="kit-top"><div><div class="eyebrow">${planning ? 'PREPARE / OPERATION' : 'FIELD INVENTORY / TAB TO RETURN'}</div><h2 id="kit-title">${planning ? 'Loadout & planning' : 'Your carried kit'}</h2><p>${planning ? `${selectedMap.name} · ${selectedMap.description ?? 'Retrieve the archive and extract. Breach or use doors; guards remain on patrol.'}` : `Health ${Math.ceil(state.health)}/100 · ${callbacks.getRules().inventoryPause ? 'Simulation paused' : 'Simulation continues'} · Support $${state.budget.toLocaleString()}`}</p></div><button id="kit-close" class="secondary">${planning ? 'Back' : 'Return to mission · Tab'}</button></div>
      ${planning ? `<div class="plan-strip"><label>Map<select id="plan-map">${Object.entries(maps).map(([id, map]) => `<option value="${id}" ${id === callbacks.getPlannedMap() ? 'selected' : ''}>${map.name}</option>`).join('')}</select></label><label>Entry point<select id="plan-entry">${Object.entries(selectedMap.entries).map(([id, entry]) => `<option value="${id}">${entry.label ?? (id === 'courtyard' ? 'Courtyard approach' : 'West Gallery infiltration')}</option>`).join('')}</select></label><label>Weather<select id="plan-weather"><option value="clear">Clear</option><option value="rain">Rain</option><option value="fog">Fog</option></select></label><div><span class="eyebrow">MISSION CONDITIONS</span><p>${callbacks.getRules().guardCount} guards · $${callbacks.getRules().budget.toLocaleString()} support</p><small>Gear is owned. Support funds are separate.</small></div></div>` : ''}
      <div class="kit-body"><section class="kit-weapons"><div class="section-title"><h3>Weapons</h3><span>${planning ? 'Choose carried weapons and a starting weapon' : 'Equip a weapon or adjust its configuration'}</span></div>
      ${Object.entries(weapons).filter(([id]) => planning || current.weapons[id].carried).map(([id, weapon], index) => {
        const config = current.weapons[id];
        // The pistol card shows the chosen model; the model is picked while planning only.
        weapon = weaponSpec(weaponKey(current, id));
        const modelPicker = id === 'pistol' ? `<label class="pistol-model">Model<select data-config="model" data-id="pistol" aria-label="Pistol model" ${planning ? '' : 'disabled title="Choose the pistol model in loadout planning"'}>${Object.entries(pistolModels).map(([value, model]) => `<option value="${value}" ${value === config.model ? 'selected' : ''}>${model.name} \u00b7 ${model.magazine} rds</option>`).join('')}</select></label>` : '';
        return `<article class="weapon-card ${(!planning && current.equipped === id || planning && current.primary === id) ? 'selected' : ''}" data-weapon="${id}"><div class="weapon-card-top"><div><span class="eyebrow">${weapon.canRun === false ? 'AUTOMATIC · NO SPRINT' : weapon.automatic ? 'AUTOMATIC' : 'SINGLE SHOT'} / ${weapon.magazine} ROUND MAG</span><h4>${weapon.name}</h4></div>${planning ? `<label class="carry-control"><input type="checkbox" data-carry="${id}" ${config.carried ? 'checked' : ''}> Carry</label>` : `<span class="mag-count">${current.equipped === id ? state.ammo : current.magazines[id]} / ${weapon.magazine}</span>`}</div><div class="weapon-silhouette ${id}" aria-hidden="true"><span></span><i></i><b></b></div><div class="weapon-options">${modelPicker}<label>Velocity<select data-config="velocity" data-id="${id}" aria-label="${weapon.name} velocity"><option value="supersonic" ${config.velocity === 'supersonic' ? 'selected' : ''}>Supersonic</option><option value="subsonic" ${config.velocity === 'subsonic' ? 'selected' : ''}>Subsonic</option></select></label><label>Projectile<select data-config="ammoType" data-id="${id}" aria-label="${weapon.name} ammo type">${Object.entries(ammoFor(id)).map(([value, ammo]) => `<option value="${value}" ${value === config.ammoType ? 'selected' : ''}>${ammo.name}</option>`).join('')}</select></label></div><div class="weapon-card-bottom"><label><input type="checkbox" data-config="suppressor" data-id="${id}" aria-label="${weapon.name} suppressor" ${config.suppressor ? 'checked' : ''}> Suppressor</label><button class="secondary" data-equip="${id}" ${planning && !config.carried ? 'disabled' : ''}>${planning ? current.primary === id ? 'Starting weapon' : 'Start with this' : current.equipped === id ? 'Equipped' : `Equip ${weapon.name}`}</button></div>${id === 'sniper' ? '<p class="weapon-detail">Z toggles scope. Scroll adjusts 2×–8× zoom.</p>' : ''}</article>`;
      }).join('')}</section><section class="kit-equipment"><div class="section-title"><h3>Equipment</h3><span>${planning ? 'Set quantities before deploying' : 'Select an item, close inventory, then left click to use'}</span></div>${Object.entries(items).map(([id, item]) => `<article class="item-card ${!planning && current.equipped === id ? 'selected' : ''}"><div class="item-heading"><h4>${item.name}</h4>${planning ? `<input type="number" min="0" max="${item.max}" step="1" value="${current.items[id]}" data-quantity="${id}" aria-label="${item.name} quantity">` : `<span class="item-count">×${current.items[id]}</span>`}</div><p>${item.description}</p>${!planning ? `<button class="secondary" data-equip="${id}" ${current.items[id] <= 0 ? 'disabled' : ''}>${current.equipped === id ? 'Equipped' : `Equip ${item.name}`}</button>` : ''}</article>`).join('')}</section></div>
      <div class="kit-bottom"><div><p id="kit-status" role="status">${planning ? 'Your map and kit are saved locally. New deployment restores walls and guards.' : 'Debug restock refills equipment and restores support cash to $10,000. Ammo changes preserve magazine count.'}</p><small>Penetration: solid core &gt; standard &gt; hollow-point; sniper &gt; rifle / M134 &gt; pistol &gt; shotgun pellet. Subsonic reduces penetration. Each layer or NPC reduces body and wall damage. Drywall is easiest to penetrate; framing and bodies have equal, greater resistance. Masonry stops rounds. Hollow-point can still pass through thin layers.</small></div>${planning ? '<button id="kit-deploy" class="primary">Deploy with this kit ↗</button>' : '<div class="kit-actions"><button id="kit-restock" class="secondary" title="Debug: refill equipment and support cash to $10,000">Restock equipment & cash</button><button id="kit-detonate" class="secondary">Detonate placed charges · B</button></div>'}</div>`;
    dialog.querySelector('#kit-close').addEventListener('click', close);
    // Vision is worn independently of the weapon, with one active device.
    for(const button of dialog.querySelectorAll('[data-equip]')){
      const id=button.dataset.equip;
      if(!planning&&items[id]?.wearable){
        button.textContent=current.vision===id?`Remove ${items[id].name}`:`Wear ${items[id].name}`;
        button.closest('.item-card').classList.toggle('selected',current.vision===id);
      }
    }
    if(planning){
      const visionLabel=document.createElement('label');visionLabel.className='vision-planning';visionLabel.textContent='Starting worn vision device';
      const select=document.createElement('select');select.id='plan-vision';
      select.replaceChildren(new Option('Off — normal vision','off'),...['nightvision','thermal'].filter(id=>current.items[id]>0).map(id=>new Option(items[id].name,id)));
      select.value=current.vision??'off';visionLabel.append(select);dialog.querySelector('.kit-equipment').prepend(visionLabel);
      select.addEventListener('change',()=>{current.vision=select.value;callbacks.saveLoadout(current);status('Starting vision updated. Only one device can be worn at a time.');});
    }
    if (!planning) {
      const holster = document.createElement('button'); holster.className = 'secondary holster-button';
      holster.textContent = current.equipped === 'unarmed' ? 'Empty hands · equipped' : 'Holster · empty hands';
      holster.addEventListener('click', () => { callbacks.equip('unarmed'); render(); });
      dialog.querySelector('.kit-equipment').prepend(holster);
    }
    dialog.querySelector('#kit-deploy')?.addEventListener('click', () => {
      try { callbacks.saveLoadout(validateLoadout(current)); close(); callbacks.deploy(); }
      catch (error) { status(error.message); }
    });
    dialog.querySelector('#kit-detonate')?.addEventListener('click', () => { close(); callbacks.detonate(); });
    dialog.querySelector('#kit-restock')?.addEventListener('click', () => {
      const added = callbacks.restock();
      render();
      status(added ? 'Debug restock complete. Equipment full; support cash $10,000.' : 'Equipment and support cash are already full.');
      dialog.querySelector('#kit-restock').focus();
    });
    if (planning) {
      const timeLabel=document.createElement('label');timeLabel.textContent='Time of day';
      const timeSelect=document.createElement('select');timeSelect.id='plan-time';timeSelect.append(new Option('Day','day'),new Option('Dusk','dusk'),new Option('Night','night'));timeSelect.value=callbacks.getRules().timeOfDay??'day';
      timeLabel.append(timeSelect);dialog.querySelector('.plan-strip').insertBefore(timeLabel,dialog.querySelector('.plan-strip > div'));
      timeSelect.addEventListener('change',()=>callbacks.changeRule('timeOfDay',timeSelect.value));
      const enemyLabel = document.createElement('label'); enemyLabel.textContent = 'Enemies (0–8)';
      const enemyCount = document.createElement('input'); enemyCount.id = 'plan-enemies'; enemyCount.type = 'number'; enemyCount.min = '0'; enemyCount.max = '8'; enemyCount.step = '1'; enemyCount.value = callbacks.getRules().guardCount;
      enemyLabel.append(enemyCount); dialog.querySelector('.plan-strip').insertBefore(enemyLabel, dialog.querySelector('.plan-strip > div'));
      enemyCount.addEventListener('change', () => {
        const value = Number(enemyCount.value);
        if (!enemyCount.value.trim() || !Number.isInteger(value) || value < 0 || value > 8) { enemyCount.value = callbacks.getRules().guardCount; status('Choose a whole enemy count from 0 to 8.'); return; }
        callbacks.changeRule('guardCount', value);
        dialog.querySelector('.plan-strip > div p').textContent = `${value} guards · $${callbacks.getRules().budget.toLocaleString()} support`;
        status(`Next deployment: ${value} enemies.`);
      });
      const armorLabel = document.createElement('label'); armorLabel.textContent = 'Armored enemies (0–8)';
      const armorCount = document.createElement('input'); armorCount.id = 'plan-armor'; armorCount.type = 'number'; armorCount.min = '0'; armorCount.max = '8'; armorCount.step = '1'; armorCount.value = callbacks.getRules().armoredGuards;
      armorLabel.append(armorCount); const armorHelp = document.createElement('small'); armorHelp.textContent = 'Armor reduces torso bullet damage to 35% for 10 hits; head and limbs are unprotected. Capped at enemy count.'; armorLabel.append(armorHelp); dialog.querySelector('.plan-strip').insertBefore(armorLabel, dialog.querySelector('.plan-strip > div'));
      armorCount.addEventListener('change', () => {
        const value = Number(armorCount.value);
        if (!armorCount.value.trim() || !Number.isInteger(value) || value < 0 || value > 8) { armorCount.value = callbacks.getRules().armoredGuards; status('Choose a whole armored enemy count from 0 to 8.'); return; }
        callbacks.changeRule('armoredGuards', value); status(`Next deployment: up to ${value} enemies wear armor. Armor reduces bullet damage to the torso.`);
      });
      dialog.querySelector('#plan-map').addEventListener('change', e => { callbacks.changeMap(e.target.value); render(); });
      dialog.querySelector('#plan-entry').value = callbacks.getRules().entryPoint;
      dialog.querySelector('#plan-weather').value = callbacks.getRules().weather;
      dialog.querySelector('#plan-entry').addEventListener('change', e => callbacks.changeRule('entryPoint', e.target.value));
      dialog.querySelector('#plan-weather').addEventListener('change', e => callbacks.changeRule('weather', e.target.value));
    }
    dialog.querySelectorAll('[data-config]').forEach(control => control.addEventListener('change', () => {
      current.weapons[control.dataset.id][control.dataset.config] = control.type === 'checkbox' ? control.checked : control.value;
      if (planning) callbacks.saveLoadout(current);
      if (control.dataset.config === 'model') { render(); status(`${pistolModels[control.value].name} selected.`); return; }
      status('Weapon configuration updated.');
    }));
    dialog.querySelectorAll('[data-carry]').forEach(control => control.addEventListener('change', () => {
      const id = control.dataset.carry;
      if (!control.checked && Object.values(current.weapons).filter(w => w.carried).length === 1) { control.checked = true; status('Carry at least one weapon.'); return; }
      current.weapons[id].carried = control.checked;
      if (!current.weapons[current.primary].carried) current.primary = Object.keys(weapons).find(key => current.weapons[key].carried);
      callbacks.saveLoadout(current); render();
    }));
    dialog.querySelectorAll('[data-quantity]').forEach(control => control.addEventListener('change', () => {
      const item = items[control.dataset.quantity], value = Number(control.value);
      if (!Number.isInteger(value) || value < 0 || value > item.max) { control.value = current.items[control.dataset.quantity]; status(`Choose 0–${item.max}.`); return; }
      current.items[control.dataset.quantity] = value;
      if(current.vision===control.dataset.quantity&&value===0)current.vision='off';
      callbacks.saveLoadout(current);
      if(item.wearable)render();
    }));
    dialog.querySelectorAll('[data-equip]').forEach(button => button.addEventListener('click', () => {
      if (planning) { current.primary = button.dataset.equip; callbacks.saveLoadout(current); }
      else callbacks.equip(button.dataset.equip);
      render();
    }));
  }
  function status(text) { dialog.querySelector('#kit-status').textContent = text; }
  function close() { if (!dialog.open) return; dialog.close(); callbacks.onClose(mode); }
  function open(nextMode) { if (dialog.open) return; mode = nextMode; callbacks.onOpen(mode); render(); dialog.showModal(); dialog.querySelector('#kit-close').focus(); }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    if (event.code === 'Tab' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) close(); }
  });
  return { open, close, isOpen: () => dialog.open, isPlanning };
}
