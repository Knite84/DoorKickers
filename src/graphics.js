export const graphicsPresets = {
  Low: { resolution: 0.65, shadowSize: 1024, antialias: false },
  Medium: { resolution: 0.85, shadowSize: 1536, antialias: true },
  High: { resolution: 1, shadowSize: 2048, antialias: true },
};

const storageKey = 'stealth-graphics-v1';

export function loadGraphics() {
  const defaults = { preset: 'Medium', showStats: false };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return {
      preset: Object.hasOwn(graphicsPresets, saved?.preset) ? saved.preset : defaults.preset,
      showStats: saved?.showStats === true,
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
