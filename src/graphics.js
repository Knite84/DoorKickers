export const graphicsPresets = {
  Low: { resolution: 0.65, shadowSize: 1024, antialias: false },
  Medium: { resolution: 0.85, shadowSize: 1536, antialias: true, bloom: true, smaa: true },
  High: { resolution: 1, shadowSize: 2048, antialias: true, occlusion: true, bloom: true, smaa: true },
};

const storageKey = 'stealth-graphics-v1';
export const exposureRange = { min: 0.6, max: 1.8, initial: 1.2 };

export function loadGraphics() {
  const defaults = { preset: 'Medium', showStats: false, exposure: exposureRange.initial };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return {
      preset: Object.hasOwn(graphicsPresets, saved?.preset) ? saved.preset : defaults.preset,
      showStats: saved?.showStats === true,
      exposure: Number.isFinite(saved?.exposure)
        ? Math.max(exposureRange.min, Math.min(exposureRange.max, saved.exposure))
        : defaults.exposure,
    };
  } catch {
    return defaults;
  }
}

export function saveGraphics(graphics) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(graphics));
  } catch { /* Graphics settings still apply for this page. */ }
}
