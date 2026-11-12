// After-action record: a timeline built by watching the mission state, and the
// statistics shown on the debrief screen. No DOM, so it is tested in Node.
import { alertState, formatClock } from './hud-model.js';

export function createTimeline() {
  return { events: [], last: null };
}

const add = (timeline, state, text, kind = 'info') => timeline.events.push({ time: state.elapsed, clock: formatClock(state.elapsed), text, kind });

// Call once per frame. Records what changed since the previous call.
export function observeMission(timeline, state) {
  const alert = alertState(state), last = timeline.last;
  const now = {
    kills: state.kills ?? 0, surrenders: state.surrenders ?? 0, collected: !!state.collected, alert: alert.level,
    power: state.powerOn !== false, tier: state.health <= 25 ? 2 : state.health <= 50 ? 1 : 0, peak: Math.max(last?.peak ?? 0, alert.level),
    doors: state.doors?.filter(Boolean).length ?? 0, broken: state.doorHealth?.filter(h => h <= 0).length ?? 0,
  };
  if (!last) add(timeline, state, 'Deployed.');
  else {
    if (now.kills > last.kills) add(timeline, state, now.kills - last.kills > 1 ? `${now.kills - last.kills} guards eliminated.` : 'Guard eliminated.', 'kill');
    if (now.surrenders > last.surrenders) add(timeline, state, 'A guard surrendered.', 'kill');
    if (now.collected && !last.collected) add(timeline, state, 'Archive secured.', 'objective');
    if (now.alert > last.alert) add(timeline, state, ['', 'A guard grew suspicious.', 'Guards began searching.', 'Guards are hunting you.'][now.alert], now.alert === 3 ? 'danger' : 'warn');
    else if (now.alert === 0 && last.alert > 0 && now.kills === last.kills && now.surrenders === last.surrenders) add(timeline, state, 'Guards lost track of you.', 'info');
    if (!now.power && last.power) add(timeline, state, 'Building power cut.', 'info');
    if (now.tier > last.tier) add(timeline, state, now.tier === 2 ? 'Critical injury.' : 'Wounded.', 'danger');
    if (now.broken > last.broken) add(timeline, state, 'A door was shot apart.', 'info');
  }
  timeline.last = now;
}

export function summarize(state, timeline) {
  const total = state.guards?.length ?? 0;
  return {
    outcome: state.status === 'complete' ? 'success' : state.status === 'captured' ? 'failure' : 'incomplete',
    time: formatClock(state.elapsed ?? 0), seconds: state.elapsed ?? 0,
    shots: state.shots ?? 0, kills: state.kills ?? 0, surrenders: state.surrenders ?? 0, guards: total,
    untouched: total - (state.kills ?? 0) - (state.surrenders ?? 0),
    health: Math.ceil(state.health ?? 0), peakAlert: ['Never detected', 'Suspected', 'Searched for', 'Hunted'][timeline?.last?.peak ?? 0],
    archive: !!state.collected,
  };
}
