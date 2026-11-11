import { seededRandom, rollTraits, trait, paceFactor, lingerFactor } from './guard-traits.js';

const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Places guards care about. Maps may author weighted posts; older maps fall back
// to the ends of their fixed patrol lines so every map gains variety.
export function mapPosts(map) {
  if (map.posts?.length) return map.posts.map(post => ({ weight: 1, elevation: 0, dwell: 1, ...post }));
  const seen = new Set();
  return map.patrols.flatMap((path, index) => path.map(position => ({ position, elevation: map.guardElevations?.[index] ?? 0, weight: 1, dwell: 1 })))
    .filter(post => { const key = `${post.position}|${post.elevation}`; return !seen.has(key) && seen.add(key); });
}

function pick(random, items, weightOf) {
  const weights = items.map(weightOf), total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (let i = 0; i < items.length; i++) { roll -= weights[i]; if (roll <= 0) return items[i]; }
  return items.at(-1);
}

// Draw a home post and a short round for each guard. Heavier posts are covered
// more often but never always; rounds favour nearby posts on the same floor.
export function assignGuards(map, count, seed) {
  const random = seededRandom(seed), posts = mapPosts(map), free = posts.map((_, i) => i), guards = [];
  const apart = (a, b) => posts[a].elevation !== posts[b].elevation || gap(posts[a].position, posts[b].position) > 3;
  for (let g = 0; g < count; g++) {
    let options = free.filter(i => guards.every(other => apart(i, other.stops[0])));
    if (!options.length) options = free.length ? free : posts.map((_, i) => i);
    const home = pick(random, options, i => posts[i].weight);
    if (free.includes(home)) free.splice(free.indexOf(home), 1);
    const stops = [home], extra = 1 + Math.floor(random() * 3);
    for (let k = 0; k < extra && stops.length < posts.length; k++) {
      const others = posts.map((_, i) => i).filter(i => !stops.includes(i));
      stops.push(pick(random, others, i => {
        const distance = gap(posts[i].position, posts[home].position);
        return posts[i].weight * (posts[i].elevation === posts[home].elevation ? 1 / (1 + (distance / 5) ** 2) : 0.12 / (1 + (distance / 8) ** 2));
      }));
    }
    guards.push({ stops, traits: rollTraits(random), routineSeed: Math.floor(random() * 4294967296), luck: Math.floor(random() * 4294967296) });
  }
  return guards.map(guard => ({
    traits: guard.traits, luck: guard.luck,
    path: guard.stops.map(i => posts[i].position),
    pathElevations: guard.stops.map(i => posts[i].elevation),
    pathDwell: guard.stops.map(i => posts[i].dwell),
    pathNames: guard.stops.map(i => posts[i].name ?? null),
    routine: { seed: guard.routineSeed },
  }));
}

function roll(routine) {
  routine.seed = (Math.imul(routine.seed, 1664525) + 1013904223) >>> 0;
  return routine.seed / 4294967296;
}
function advance(guard, state) {
  const routine = guard.routine, count = guard.path.length;
  let next = (guard.waypoint + 1) % count;
  // Sloppier guards wander off the usual order now and then.
  if (count > 2 && roll(routine) < (1 - trait(guard, 'discipline')) * 0.5) {
    next = Math.floor(roll(routine) * count);
    if (next === guard.waypoint) next = (next + 1) % count;
  }
  guard.waypoint = next; routine.pauseUntil = null; routine.mark = null; routine.progressAt = state.elapsed;
}

// Walk the round: travel to a post, stand and look around for a while, move on.
export function stepRoutine(guard, state, rules, walk) {
  const routine = guard.routine, target = guard.path[guard.waypoint], targetY = guard.pathElevations[guard.waypoint];
  // Returning from an alert must not count the time away as being stuck.
  if (state.elapsed - (routine.lastStepAt ?? -Infinity) > 0.5) { routine.mark = null; routine.progressAt = state.elapsed; routine.pauseUntil = null; }
  routine.lastStepAt = state.elapsed;
  const distance = gap(guard.position, target), arrived = distance < 0.55 && Math.abs((guard.elevation ?? 0) - targetY) < 0.5;
  if (!arrived) {
    routine.pauseUntil = null;
    // Progress is "still moving", not "getting closer": the way to another
    // floor often leads away first. A guard who cannot move gives the post up.
    if (!routine.mark || gap(guard.position, routine.mark) > 0.4) { routine.mark = [...guard.position]; routine.progressAt = state.elapsed; }
    else if (state.elapsed - routine.progressAt > 5) { advance(guard, state); return; }
    walk({ position: target, elevation: targetY }, rules.patrolSpeed * paceFactor(guard));
    return;
  }
  if (routine.pauseUntil == null) {
    routine.pauseFrom = state.elapsed;
    routine.pauseUntil = state.elapsed + (1.5 + roll(routine) * 3) * lingerFactor(guard) * (guard.pathDwell?.[guard.waypoint] ?? 1);
    routine.scanBase = guard.heading;
    routine.scanArc = 0.45 + trait(guard, 'perception') * 0.9;
    routine.scanRate = 0.7 + roll(routine) * 0.7;
  }
  if (state.elapsed < routine.pauseUntil) guard.heading = routine.scanBase + Math.sin((state.elapsed - routine.pauseFrom) * routine.scanRate) * routine.scanArc;
  else advance(guard, state);
}
