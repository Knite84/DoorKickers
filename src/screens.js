// Full-viewport screens: main menu, briefing, pause, debrief and loading.
// They are plain DOM inside #screens and know nothing about the simulation;
// main.js gives them data and handles the callbacks.
import { drawPlan } from './plan-view.js';
import { summarize } from './debrief.js';

const esc = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const arrow = '<span>↗</span>';

export function createScreens(root, callbacks) {
  let current = null, floor = 0;
  function mount(name, html, { light = false } = {}) {
    root.replaceChildren();
    const screen = document.createElement('div');
    screen.className = `screen${light ? ' is-light' : ''}`; screen.dataset.screen = name;
    screen.innerHTML = html;
    root.append(screen); current = name;
    for (const button of screen.querySelectorAll('[data-action]')) button.addEventListener('click', () => callbacks[button.dataset.action]?.());
    (screen.querySelector('[data-autofocus]') ?? screen.querySelector('button'))?.focus();
    return screen;
  }

  const api = {
    current: () => current,
    hide() { root.replaceChildren(); current = null; },

    menu(note = '') {
      mount('menu', `<div class="screen-card narrow"><div class="title-mark">A STEALTH SANDBOX</div><div class="title-line">UNTITLED</div>
        <p class="muted">Plan your entry. Choose your kit. Find your way.</p>
        ${note ? `<p>${esc(note)}</p>` : ''}
        <div class="screen-actions"><button class="primary" data-action="start" data-autofocus>Start a mission ${arrow}</button><button class="secondary" data-action="settings">Settings</button></div></div>`);
    },

    briefing({ map, rules, loadout, weapons }) {
      const levels = map.levels ?? [{ name: 'Ground floor', elevation: 0 }];
      floor = Math.max(0, levels.findIndex(level => level.elevation >= (map.entries?.[rules.entryPoint]?.elevation ?? 0) - 0.01));
      const entry = map.entries?.[rules.entryPoint], carried = Object.entries(loadout.weapons).filter(([, w]) => w.carried).map(([id]) => weapons[id].name);
      const screen = mount('briefing', `<div class="screen-card"><div class="eyebrow">OPERATION / BRIEFING</div><h2>${esc(map.name)}</h2>
        <p>${esc(map.description ?? 'Retrieve the archive and extract. Doors and destructible partitions are alternative routes through the same guarded building.')}</p>
        <div class="briefing-grid"><div class="plan-box"><div class="plan-floors" role="group" aria-label="Floor">${levels.map((level, i) => `<button data-floor="${i}" aria-pressed="${i === floor}">${esc(level.name)}</button>`).join('')}</div><canvas width="640" height="480" aria-label="Floor plan of ${esc(map.name)}"></canvas></div>
        <div><dl class="fact-list"><dt>OBJECTIVE</dt><dd>${esc(map.objective?.label ?? 'Archive')}, then extract</dd><dt>ENTRY</dt><dd>${esc(entry?.label ?? (rules.entryPoint === 'courtyard' ? 'Courtyard approach' : 'West Gallery infiltration'))}</dd><dt>GUARDS</dt><dd>${rules.guardCount}${rules.armoredGuards ? ` (${rules.armoredGuards} armored)` : ''}</dd><dt>CONDITIONS</dt><dd>${esc(rules.timeOfDay)} · ${esc(rules.weather)}</dd><dt>SUPPORT</dt><dd>$${rules.budget.toLocaleString()}</dd><dt>CARRYING</dt><dd>${esc(carried.join(', ') || 'Nothing')}</dd></dl>
        <p class="muted">Gold circles mark entry points and the objective. Brown and yellow marks are doors; blue marks are windows.</p></div></div>
        <div class="screen-actions row"><button class="secondary" data-action="menu">Back</button><button class="secondary" data-action="planning">Loadout & planning</button><button class="primary" data-action="deploy" data-autofocus>Deploy ${arrow}</button></div></div>`);
      const canvas = screen.querySelector('canvas'), ctx = canvas.getContext('2d');
      const draw = () => { if (ctx) drawPlan(ctx, map, floor, canvas.width, canvas.height); };
      for (const button of screen.querySelectorAll('[data-floor]')) button.addEventListener('click', () => {
        floor = Number(button.dataset.floor); draw();
        for (const other of screen.querySelectorAll('[data-floor]')) other.setAttribute('aria-pressed', String(other === button));
      });
      draw();
    },

    pause({ map, elapsed }) {
      mount('pause', `<div class="screen-card narrow"><div class="eyebrow">PAUSED</div><h2>Mission on hold</h2><p class="muted">${esc(map.name)} · ${elapsed}</p>
        <div class="screen-actions"><button class="primary" data-action="resume" data-autofocus>Resume ${arrow}</button><button class="secondary" data-action="loadout">Inventory & kit</button><button class="secondary" data-action="settings">Settings</button><button class="secondary" data-action="abort">Abort mission</button></div></div>`, { light: true });
    },

    debrief({ state, timeline, map }) {
      const s = summarize(state, timeline), success = s.outcome === 'success';
      mount('debrief', `<div class="screen-card outcome-${s.outcome}"><div class="eyebrow">${success ? 'EXTRACTION COMPLETE' : 'MISSION INTERRUPTED'} · ${esc(map.name)}</div><h2>${success ? 'Your way through.' : 'You were downed.'}</h2>
        <p>${success ? 'Archive retrieved and extraction reached.' : 'Health depleted. Try cover, different gear, a med kit, or different rules.'}</p>
        <div class="stat-grid"><div class="stat"><strong>${s.time}</strong><span>TIME</span></div><div class="stat"><strong>${s.shots}</strong><span>SHOTS FIRED</span></div><div class="stat"><strong>${s.kills}/${s.guards}</strong><span>GUARDS DOWN</span></div><div class="stat"><strong>${esc(s.peakAlert)}</strong><span>WORST ALERT</span></div></div>
        <div class="eyebrow">TIMELINE</div><ol class="timeline">${timeline.events.map(e => `<li data-kind="${e.kind}"><time>${e.clock}</time><span>${esc(e.text)}</span></li>`).join('')}${success ? '' : `<li data-kind="danger"><time>${s.time}</time><span>Downed.</span></li>`}</ol>
        <div class="screen-actions row"><button class="secondary" data-action="menu">Main menu</button><button class="primary" data-action="planning" data-autofocus>Loadout & planning ${arrow}</button></div></div>`);
    },

    // Shows the named stages and returns { stage(index), finish() } to drive them.
    loading(labels) {
      const screen = mount('loading', `<div class="screen-card narrow"><div class="eyebrow">DEPLOYING</div><h2>Preparing the mission</h2><ol class="loading-stages">${labels.map(label => `<li>${esc(label)}</li>`).join('')}</ol><div class="loading-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div></div></div></div>`);
      const items = [...screen.querySelectorAll('.loading-stages li')], bar = screen.querySelector('.loading-bar');
      const set = index => {
        items.forEach((item, i) => { item.classList.toggle('is-done', i < index); item.classList.toggle('is-active', i === index); });
        const percent = Math.round(100 * index / items.length);
        bar.firstElementChild.style.width = `${percent}%`; bar.setAttribute('aria-valuenow', String(percent));
      };
      set(0);
      return { stage: set, finish: () => set(items.length) };
    },
  };
  return api;
}
