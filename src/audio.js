// The sound engine (POLISH_PLAN step 6.4): everything is synthesised from noise and
// oscillators when the page loads; there are no sound files.
//
// What to play, how loud and how muffled comes from src/sound-plan.js. This file only
// builds the Web Audio graph:
//   voice → muffle (lowpass) → direction (panner) → bus (weapons, effects, steps) → master → limiter → speakers
//               └→ reverb send → the current room's reverb → master
// Audio stays optional: if the browser blocks it, every call quietly does nothing.
import { gunSounds, suppressed as suppressedMix, subsonic as subsonicMix, stepSounds, stepLoudness, reverbs, loudness, effectSounds, ringing, fireSound, ambience } from './sound-plan.js';

export const audioLimits = { voices: 40 };

export function createGunAudio() {
  let context = null, master, deafFilter, buses, noise, roomName = 'medium', masterLevel = 1, weaponLevel = 0.3, active = 0;
  let effectsLevel = 1, ambienceLevel = 1, beds = null, ambienceClock = 0, ears = [0, 1.6, 0];
  const fireLoops = new Map();
  const reverbInputs = {};
  function build() {
    context = new AudioContext();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 8; limiter.attack.value = 0.002; limiter.release.value = 0.18;
    master = context.createGain(); master.gain.value = masterLevel;
    // After a flashbang the whole mix is dulled for a few seconds (deafen()).
    deafFilter = context.createBiquadFilter(); deafFilter.type = 'lowpass'; deafFilter.frequency.value = 20000;
    master.connect(deafFilter).connect(limiter).connect(context.destination);
    buses = Object.fromEntries(['weapons', 'effects', 'steps', 'ambience'].map(name => { const bus = context.createGain(); bus.connect(master); return [name, bus]; }));
    buses.effects.gain.value = buses.steps.gain.value = effectsLevel; buses.ambience.gain.value = ambienceLevel;
    buses.weapons.gain.value = weaponLevel / 0.3;
    // Two seconds of white noise, shared by every voice (each starts at a random point).
    noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // One reverb per room size: decaying stereo noise as the impulse response.
    for (const [name, { time, wet }] of Object.entries(reverbs)) {
      const length = Math.ceil(context.sampleRate * time), impulse = context.createBuffer(2, length, context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const samples = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.2);
      }
      const convolver = context.createConvolver(), level = context.createGain(), input = context.createGain();
      convolver.buffer = impulse; level.gain.value = wet * 2.5;
      input.connect(convolver).connect(level).connect(master);
      reverbInputs[name] = input;
    }
  }
  const ready = () => context && context.state === 'running';

  // One sound: returns its input node, or null when it is not worth playing.
  // `position` null means it is the player's own (centred, no panner).
  function voice({ position = null, gain = 1, dull = 0, bus = 'effects', wet = 1, length = 1 }) {
    if (!ready() || gain < 0.002) return null;
    if (active >= audioLimits.voices && gain < 0.5) return null;
    active++;
    const t = context.currentTime, input = context.createGain(), muffle = context.createBiquadFilter();
    input.gain.value = gain;
    muffle.type = 'lowpass'; muffle.frequency.value = 400 + 17600 * Math.pow(1 - Math.min(1, dull), 2.2); muffle.Q.value = 0.5;
    input.connect(muffle);
    const nodes = [input, muffle];
    let out = muffle;
    if (position) {
      const panner = context.createPanner();
      panner.panningModel = 'HRTF'; panner.distanceModel = 'linear'; panner.rolloffFactor = 0;   // loudness comes from sound-plan
      if (panner.positionX) { panner.positionX.value = position[0]; panner.positionY.value = position[1]; panner.positionZ.value = position[2]; }
      else panner.setPosition(...position);
      muffle.connect(panner); out = panner; nodes.push(panner);
    }
    out.connect(buses[bus]);
    const send = context.createGain(); send.gain.value = reverbs[roomName].wet * wet * (1 + dull);
    out.connect(send).connect(reverbInputs[roomName]); nodes.push(send);
    setTimeout(() => { for (const node of nodes) node.disconnect(); active--; }, (length + 0.3) * 1000);
    return { input, t };
  }
  // Layers. Each schedules itself on `into` at time `t` and stops on its own.
  function burst(into, t, { gain, type, frequency, q = 0.7, decay, rate = 1, delay = 0 }) {
    if (!(gain > 0)) return;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
    source.buffer = noise; source.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
    const start = t + delay;
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(gain, start + 0.002); envelope.gain.setTargetAtTime(0, start + 0.002, decay);
    source.connect(filter).connect(envelope).connect(into);
    source.start(start, Math.random() * 1.5); source.stop(start + decay * 7 + 0.01);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }
  function tone(into, t, { gain, from, to = from, decay, type = 'sine', delay = 0 }) {
    if (!(gain > 0)) return;
    const oscillator = context.createOscillator(), envelope = context.createGain(), start = t + delay;
    oscillator.type = type; oscillator.frequency.setValueAtTime(from, start); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + decay * 2);
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(gain, start + 0.003); envelope.gain.setTargetAtTime(0, start + 0.003, decay);
    oscillator.connect(envelope).connect(into);
    oscillator.start(start); oscillator.stop(start + decay * 7 + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  // A recipe from sound-plan's effectSounds: every layer, repeated `count` times with scatter.
  function playRecipe(recipe, options) {
    let length = 0;
    for (const layer of recipe.layers) length = Math.max(length, (layer.delay ?? 0) + (layer.spread ?? 0) + layer.decay * 7);
    const v = voice({ ...options, length });
    if (!v) return;
    for (const layer of recipe.layers) {
      for (let i = 0; i < (layer.count ?? 1); i++) {
        const delay = (layer.delay ?? 0) + (layer.count > 1 ? Math.random() * (layer.spread ?? 0) : 0);
        if (layer.tone) {
          const scatter = layer.count > 1 ? 0.8 + Math.random() * 0.45 : 1;
          tone(v.input, v.t, { gain: layer.gain, from: layer.from * scatter, to: (layer.to ?? layer.from) * scatter, decay: layer.decay, type: layer.tone, delay });
        } else burst(v.input, v.t, { gain: layer.gain, type: layer.noise, frequency: layer.freq, q: layer.q ?? 0.7, decay: layer.decay, rate: layer.rate ?? 1, delay });
      }
    }
  }
  return {
    // A named effect from sound-plan's effectSounds. `heard` as for shot(); omit for the player's own.
    effect(name, { position = null, heard = null, gain = 1, bus = 'effects', dull = 0 } = {}) {
      const recipe = effectSounds[name];
      if (!recipe) return;
      playRecipe(recipe, { position, gain: gain * (heard ? loudness(heard.level) : 1), dull: Math.min(1, dull + (heard ? heard.dull + Math.min(0.4, heard.distance / 60) : 0)), bus, wet: heard ? 1.4 : 0.8 });
    },
    // Settings: Effects (effects and footsteps) and Ambience volume, 0..1.
    setVolumes({ effects = effectsLevel, ambience: ambienceVolume = ambienceLevel } = {}) {
      effectsLevel = Math.max(0, Math.min(1, effects)); ambienceLevel = Math.max(0, Math.min(1, ambienceVolume));
      if (buses) { buses.effects.gain.value = buses.steps.gain.value = effectsLevel; buses.ambience.gain.value = ambienceLevel; }
    },
    // Ambience for this frame, from sound-plan's ambienceMix(): looping beds faded to their
    // gains, and now and then a call (a bird, a cricket) somewhere around the listener.
    setAmbience(mix, dt) {
      if (!ready()) return;
      const t = context.currentTime;
      if (!beds) {
        const bed = (type, frequency, rate) => {
          const source = context.createBufferSource(), filter = context.createBiquadFilter(), dullFilter = context.createBiquadFilter(), gain = context.createGain();
          source.buffer = noise; source.loop = true; source.playbackRate.value = rate;
          filter.type = type; filter.frequency.value = frequency;
          dullFilter.type = 'lowpass'; dullFilter.frequency.value = 18000;
          gain.gain.value = 0;
          source.connect(filter).connect(dullFilter).connect(gain).connect(buses.ambience);
          source.start(t, Math.random() * 1.5);
          return { gain, dullFilter };
        };
        beds = { roomTone: bed('lowpass', ambience.roomTone.lowpass, 0.3), wind: bed('lowpass', ambience.wind.lowpass, 0.4), rain: bed('highpass', ambience.rain.highpass, 1) };
      }
      ambienceClock += dt;
      // Wind breathes slowly; everything else just follows its target.
      const sway = 1 + ambience.wind.sway * Math.sin(ambienceClock * 0.31) + ambience.wind.sway * 0.6 * Math.sin(ambienceClock * 0.83);
      beds.roomTone.gain.gain.setTargetAtTime(mix.roomTone, t, 0.6);
      beds.wind.gain.gain.setTargetAtTime(mix.wind * sway, t, 0.6);
      beds.rain.gain.gain.setTargetAtTime(mix.rain, t, 0.6);
      beds.rain.dullFilter.frequency.setTargetAtTime(400 + 17600 * (1 - mix.rainDull) ** 2, t, 0.4);
      if (mix.call && Math.random() < mix.call.perSecond * dt) {
        const angle = Math.random() * Math.PI * 2, distance = 6 + Math.random() * 12;
        const position = [ears[0] + Math.cos(angle) * distance, ears[1] + 2 + Math.random() * 3, ears[2] + Math.sin(angle) * distance];
        this.effect(mix.call.sound, { position, gain: mix.call.gain * (0.5 + Math.random() * 0.5), bus: 'ambience', dull: mix.call.gain < 1 ? 0.6 : 0 });
      }
    },
    // Ears ringing after a flashbang: a high tone and the rest of the mix dulled, easing back.
    deafen(strength = 1) {
      if (!ready()) return;
      const t = context.currentTime, seconds = ringing.seconds * strength;
      deafFilter.frequency.cancelScheduledValues(t);
      deafFilter.frequency.setValueAtTime(ringing.dullTo, t);
      deafFilter.frequency.setTargetAtTime(20000, t + seconds * 0.4, seconds * 0.3);
      const oscillator = context.createOscillator(), envelope = context.createGain();
      oscillator.frequency.value = ringing.tone;
      envelope.gain.setValueAtTime(ringing.gain * masterLevel * strength, t); envelope.gain.setTargetAtTime(0, t + 0.3, seconds / 3);
      // The ringing bypasses the dulling: it is inside the head.
      oscillator.connect(envelope).connect(deafFilter.context.destination);
      oscillator.start(t); oscillator.stop(t + seconds * 1.5);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    },
    // Burning fires this frame: [{ key, position, heard }]. A looping roar per fire plus random pops.
    setFires(fires, dt) {
      if (!ready()) return;
      const seen = new Set();
      for (const fire of fires) {
        seen.add(fire.key);
        let loop = fireLoops.get(fire.key);
        if (!loop) {
          const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain(), panner = context.createPanner();
          source.buffer = noise; source.loop = true; source.playbackRate.value = 0.5;
          filter.type = 'lowpass'; filter.frequency.value = fireSound.roar.freq;
          panner.panningModel = 'HRTF'; panner.distanceModel = 'linear'; panner.rolloffFactor = 0;
          gain.gain.value = 0;
          source.connect(filter).connect(gain).connect(panner).connect(buses.effects);
          source.start();
          loop = { source, filter, gain, panner }; fireLoops.set(fire.key, loop);
        }
        const p = fire.position;
        if (loop.panner.positionX) { loop.panner.positionX.value = p[0]; loop.panner.positionY.value = p[1]; loop.panner.positionZ.value = p[2]; } else loop.panner.setPosition(...p);
        const level = fire.heard ? loudness(fire.heard.level) : 1;
        loop.gain.gain.setTargetAtTime(fireSound.roar.gain * level, context.currentTime, 0.15);
        loop.filter.frequency.value = fireSound.roar.freq * (1 - (fire.heard?.dull ?? 0) * 0.6);
        if (Math.random() < fireSound.pops * dt) this.effect('firePop', { position: p, heard: fire.heard, gain: 0.5 + Math.random() * 0.8 });
      }
      for (const [key, loop] of fireLoops) {
        if (seen.has(key)) continue;
        loop.gain.gain.setTargetAtTime(0, context.currentTime, 0.2);
        setTimeout(() => { loop.source.stop(); for (const node of Object.values(loop)) node.disconnect(); }, 1200);
        fireLoops.delete(key);
      }
    },
    setMaster(value) { masterLevel = Math.max(0, Math.min(1, value)); if (master) master.gain.value = masterLevel; },
    // The "Gunfire volume" rule (0..1, default 0.3) scales the weapons bus.
    setWeaponVolume(value) { weaponLevel = Math.max(0, value); if (buses) buses.weapons.gain.value = weaponLevel / 0.3; },
    unlock() {
      try { if (!context) build(); context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
    },
    // Where the player's ears are, and which way they face.
    setListener(position, forward) {
      ears = [...position];
      if (!ready()) return;
      const listener = context.listener;
      if (listener.positionX) {
        listener.positionX.value = position[0]; listener.positionY.value = position[1]; listener.positionZ.value = position[2];
        listener.forwardX.value = forward[0]; listener.forwardY.value = forward[1]; listener.forwardZ.value = forward[2];
        listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
      } else { listener.setPosition(...position); listener.setOrientation(...forward, 0, 1, 0); }
    },
    setRoom(name) { if (reverbs[name]) roomName = name; },
    // A gunshot. `heard` is { level, dull, distance } from sound-plan's hearing(); omit it for the player's own.
    shot(id, { position = null, heard = null, suppressed = false, subsonic = false } = {}) {
      const recipe = gunSounds[id] ?? gunSounds.rifle;
      const far = heard ? Math.min(0.5, heard.distance / 60) : 0;
      const gain = heard ? loudness(heard.level) : 1, dull = Math.min(1, (heard?.dull ?? 0) + far + (suppressed ? 0.25 : 0));
      const v = voice({ position, gain, dull, bus: 'weapons', wet: heard ? 1.6 : 1, length: (recipe.tail?.decay ?? 0.3) * 7 });
      if (!v) return;
      const mix = { crack: 1, body: 1, thump: 1, tail: 1, click: 1 };
      if (suppressed) Object.assign(mix, suppressedMix);
      if (subsonic) mix.crack *= subsonicMix.crack;
      const { crack, body, thump, tail, click } = recipe;
      burst(v.input, v.t, { gain: crack.gain * mix.crack, type: 'highpass', frequency: crack.highpass, decay: crack.decay });
      burst(v.input, v.t, { gain: body.gain * mix.body, type: 'lowpass', frequency: body.lowpass * (suppressed ? suppressedMix.lowpass : 1), decay: body.decay });
      tone(v.input, v.t, { gain: thump.gain * mix.thump, from: thump.from, to: thump.to, decay: thump.decay });
      if (tail) burst(v.input, v.t, { gain: tail.gain * mix.tail, type: 'lowpass', frequency: tail.lowpass, decay: tail.decay / 3, rate: 0.7 });
      if (click && !heard) burst(v.input, v.t, { gain: click.gain * mix.click, type: 'bandpass', frequency: 3500, q: 3, decay: 0.006, delay: click.delay });
    },
    // A footstep on `surface` at pace `gait`. `heard` as for shot(); omit for the player's own.
    step(surface, gait, landing = false, { position = null, heard = null } = {}) {
      const recipe = stepSounds[surface] ?? stepSounds.floor;
      const gain = (stepLoudness[gait] ?? 0.5) * (landing ? 1.7 : 1) * (heard ? loudness(heard.level, 12) : 1) * 0.5;
      const v = voice({ position, gain, dull: heard?.dull ?? 0, bus: 'steps', wet: 0.6, length: 0.4 });
      if (!v) return;
      burst(v.input, v.t, { gain: recipe.tap.gain, type: 'bandpass', frequency: recipe.tap.bandpass, q: recipe.tap.q, decay: recipe.tap.decay });
      tone(v.input, v.t, { gain: recipe.knock.gain * (landing ? 1.5 : 1), from: recipe.knock.from * 1.4, to: recipe.knock.from, decay: recipe.knock.decay });
      if (recipe.scuff) burst(v.input, v.t, { gain: recipe.scuff * 0.5, type: 'highpass', frequency: 3000, decay: 0.03, delay: 0.015 });
    },
  };
}
