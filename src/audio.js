// A small original synthesised effect, no downloaded sound assets.
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
