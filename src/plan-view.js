// A top-down floor plan of a map for the briefing screen, drawn on a 2D canvas.
// planBounds / planFit are pure and tested; drawPlan only needs a canvas-like context.

export function planBounds(map, level = null) {
  const levelOf = e => Math.round((e ?? 0) / 3.2);
  const walls = map.walls.filter(w => level === null || levelOf(w.elevation) === level);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const w of walls.length ? walls : map.walls) {
    minX = Math.min(minX, w.center[0] - w.size[0] / 2); maxX = Math.max(maxX, w.center[0] + w.size[0] / 2);
    minZ = Math.min(minZ, w.center[1] - w.size[1] / 2); maxZ = Math.max(maxZ, w.center[1] + w.size[1] / 2);
  }
  if (!Number.isFinite(minX)) return map.bounds ? { ...map.bounds } : { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  return { minX, maxX, minZ, maxZ };
}

// Scale and offset that centre `bounds` inside a width x height canvas with a margin.
export function planFit(bounds, width, height, margin = 16) {
  const w = bounds.maxX - bounds.minX || 1, h = bounds.maxZ - bounds.minZ || 1;
  const scale = Math.min((width - 2 * margin) / w, (height - 2 * margin) / h);
  return { scale, x: x => margin + (width - 2 * margin - w * scale) / 2 + (x - bounds.minX) * scale, z: z => margin + (height - 2 * margin - h * scale) / 2 + (z - bounds.minZ) * scale };
}

const levelOf = e => Math.round((e ?? 0) / 3.2);

// Draw one floor. `colors` lets the caller match the page theme.
export function drawPlan(ctx, map, level, width, height, colors = {}) {
  const c = { wall: '#b8c7a8', rail: '#6f8266', door: '#e5c98a', window: '#7fc2d0', stair: '#8a9a7c', mark: '#f3bb7c', label: '#9fb391', ...colors };
  const fit = planFit(planBounds(map, level), width, height);
  ctx.clearRect(0, 0, width, height);
  const rect = (item, thickness = 0) => {
    const [cx, cz] = item.position ?? item.center, [sx, sz] = item.size;
    ctx.fillRect(fit.x(cx - sx / 2) - thickness, fit.z(cz - sz / 2) - thickness, Math.max(1.5, sx * fit.scale) + 2 * thickness, Math.max(1.5, sz * fit.scale) + 2 * thickness);
  };
  for (const stair of map.stairs ?? []) { ctx.fillStyle = c.stair; rect({ center: stair.center, size: stair.size }); }
  for (const wall of map.walls) {
    if (levelOf(wall.elevation) !== level) continue;
    const into = wall.elevation - level * 3.2;
    if (into > 0.01) continue;                                            // skip the strips above windows
    ctx.fillStyle = wall.height === 1 ? c.rail : c.wall; rect(wall);
  }
  ctx.fillStyle = c.window; for (const w of map.windows ?? []) if (levelOf(w.elevation) === level) rect(w, 0.5);
  ctx.fillStyle = c.door; for (const d of map.doors ?? []) if (levelOf(d.elevation) === level) rect(d, 0.5);
  ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = c.label;
  for (const room of map.rooms ?? []) if (levelOf(room.elevation) === level) ctx.fillText(room.name.replace(/ \(.*/, ''), fit.x(room.center[0]), fit.z(room.center[1]));
  for (const entry of Object.values(map.entries ?? {})) {
    if (!entry.position || levelOf(entry.elevation) !== level) continue;
    ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(fit.x(entry.position[0]), fit.z(entry.position[1]), 5, 0, Math.PI * 2); ctx.fill();
  }
  if (map.objective && levelOf(map.objective.elevation) === level) {
    ctx.strokeStyle = c.mark; ctx.lineWidth = 2; ctx.beginPath();
    ctx.arc(fit.x(map.objective.position[0]), fit.z(map.objective.position[1]), 7, 0, Math.PI * 2); ctx.stroke();
  }
  return fit;
}
