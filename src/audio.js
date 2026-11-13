// A small original synthesised effect, no downloaded sound assets.
// Placeholder footstep tones by floor type: pitch, brightness and loudness.
const stepTones = {
  floor: { rate: 1.1, cutoff: 1500, gain: 0.8 },
  carpet: { rate: 0.7, cutoff: 500, gain: 0.5 },
  bamboo: { rate: 1.2, cutoff: 1800, gain: 0.8 }, woodTile: { rate: 1.3, cutoff: 2200, gain: 0.8 }, plankTile: { rate: 1.2, cutoff: 1800, gain: 0.8 },
  greyTile: { rate: 1.6, cutoff: 3000, gain: 0.9 }, stoneTile: { rate: 1.6, cutoff: 3000, gain: 0.9 }, vinyl: { rate: 1.3, cutoff: 2000, gain: 0.7 },
  concrete: { rate: 1.4, cutoff: 2600, gain: 0.9 }, deckBoards: { rate: 1.0, cutoff: 1400, gain: 0.9 },
  outdoor: { rate: 0.9, cutoff: 900, gain: 0.6 }, stairs: { rate: 1.1, cutoff: 1700, gain: 1 },
};
const stepLoudness = { walk: 0.5, run: 0.9, crouch: 0.25, creep: 0.12 };
export function createGunAudio() {
  let context, buffer, master = 1;
  return {
    setMaster(value) { master = Math.max(0, Math.min(1, value)); },
    unlock() {
      try {
        context ??= new AudioContext();
        if (!buffer) {
          buffer = context.createBuffer(1, context.sampleRate * 0.12, context.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * 0.018));
        }
        context.resume().catch(() => {});
      } catch { /* Audio is optional. */ }
    },
    // Placeholder footstep (step 6.3): a short filtered noise tick, a different tone per floor.
    // Step 6.4 replaces it with real per-surface sounds.
    step(surface, gait, landing = false) {
      if (!context || !buffer || context.state !== 'running') return;
      const tone = stepTones[surface] ?? stepTones.floor, loud = (stepLoudness[gait] ?? 0.5) * (landing ? 1.8 : 1);
      const source = context.createBufferSource(), gain = context.createGain(), filter = context.createBiquadFilter();
      source.buffer = buffer; source.playbackRate.value = tone.rate * (0.92 + Math.random() * 0.16);
      gain.gain.value = loud * tone.gain * master * 0.3;
      filter.type = 'lowpass'; filter.frequency.value = tone.cutoff;
      source.connect(filter).connect(gain).connect(context.destination); source.start();
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    },
    play(volume) {
      if (!context || !buffer || context.state !== 'running' || !volume) return;
      const source = context.createBufferSource(), gain = context.createGain(), filter = context.createBiquadFilter();
      source.buffer = buffer; gain.gain.value = volume * master * 0.35;
      filter.type = 'lowpass'; filter.frequency.value = 2400;
      source.connect(filter).connect(gain).connect(context.destination); source.start();
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    },
  };
}
