import { trait, roll } from './guard-traits.js';
import { guardDisabled } from './npc-body.js';

// Guard radio. Fixed-patrol guards share everything instantly and exactly.
// Guards with a temperament take time to get a call out, may describe the
// wrong spot, and listeners take a moment to act on it.

const silenced = (state, guard) => guardDisabled(guard) || guard.stunnedUntil > state.elapsed;
export const radioDelay = guard => 0.4 + (1 - trait(guard, 'communication')) * 2.2;
export const radioError = guard => Math.max(0, 0.6 - trait(guard, 'communication')) * 9;

function transmit(state, sender, report, imperfect) {
  const senderId = sender.id ?? state.guards.indexOf(sender);
  const message = { ...report, position: [...report.position], senderId, time: state.elapsed };
  state.guardReports ??= []; state.guardReports.push(message);
  if (state.guardReports.length > 12) state.guardReports.shift();
  for (const guard of state.guards) {
    if (guard === sender || guardDisabled(guard)) continue;
    const discipline = trait(guard, 'discipline');
    // An inattentive listener lets routine findings wash past.
    if (imperfect && guard.traits && report.kind === 'damage' && roll(guard) < (1 - discipline) * 0.4) continue;
    guard.pendingReport = { ...message, position: [...message.position] };
    guard.pendingReportAt = imperfect && guard.traits ? state.elapsed + 0.2 + (1 - discipline) * 1.5 : 0;
  }
  const descriptions = report.vague
    ? { sighting: 'Contact! Somewhere near me — not sure where!', weapon: 'Gun! Gun! Somewhere close!', injury: "I'm hit! I'm hit!", body: "Someone's down... over here somewhere.", damage: 'Something got broken around here.', detain: 'Got someone. Come here.' }
    : { sighting: report.armed ? 'Armed threat spotted. Pursuing.' : 'Unarmed person spotted. Moving to detain.', detain: 'Detaining an unarmed person. Backup, approach slowly.', injury: 'I am injured. Backup to my position!', body: 'Incapacitated guard found. Backup requested.', damage: `Damage found: ${report.label ?? 'structure'}. Investigate.`, weapon: 'Weapon drawn! Armed threat.' };
  state.lastGuardReport = `GUARD ${senderId + 1}: ${descriptions[report.kind] ?? 'Backup requested.'}`;
  state.guardReportUntil = state.elapsed + 8;
}

export function sendGuardReport(state, sender, report) {
  if (silenced(state, sender)) return;
  sender.lastRadio = state.elapsed;
  if (!sender.traits) { transmit(state, sender, report, false); return; }
  const talk = trait(sender, 'communication');
  // Poor communicators often do not bother reporting routine findings.
  if (report.kind === 'damage' && roll(sender) < (1 - talk) * 0.5) return;
  const error = radioError(sender), angle = roll(sender) * Math.PI * 2, offset = Math.sqrt(roll(sender)) * error;
  (state.radioQueue ??= []).push({
    at: state.elapsed + radioDelay(sender), sender,
    report: { ...report, position: [report.position[0] + Math.cos(angle) * offset, report.position[1] + Math.sin(angle) * offset], vague: error > 2 },
  });
}

// Deliver calls whose transmission has finished. A guard put down or stunned
// mid-call never gets the message out.
export function stepRadio(state) {
  if (!state.radioQueue?.length) return;
  const waiting = [];
  for (const call of state.radioQueue) {
    if (state.elapsed < call.at) { waiting.push(call); continue; }
    if (silenced(state, call.sender)) { state.radioLost = (state.radioLost ?? 0) + 1; continue; }
    transmit(state, call.sender, call.report, true);
  }
  state.radioQueue = waiting;
}
