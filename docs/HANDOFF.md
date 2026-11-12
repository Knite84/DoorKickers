# Handoff

Updated 2026-11-12. This is the current state of the project for a fresh session. Keep it short: replace outdated lines instead of adding history on top.

**Read in this order:**
1. This file.
2. [POLISH_PLAN.md](POLISH_PLAN.md): the working plan, its status table, and the **rendering conventions** to follow before touching any shader or material.
3. [MARTELLI_REFERENCE.md](MARTELLI_REFERENCE.md), only when changing the Martelli map or its furniture.
4. As needed: [DESIGN.md](DESIGN.md) for game direction, [lessons_learned.md](../lessons_learned.md) for past bugs and their causes, and [tech_stack.md](../tech_stack.md) for tooling.

## Where things stand

- **Polish steps 0.1 to 3.4 are built.** The [status table](POLISH_PLAN.md#status) gives each step's state and the checks still open. Steps marked ◐ are waiting on the owner. Don't treat them as finished, and don't redo them.
- **Step 4.1 (baseboards, casings, door frames) is built, awaiting owner check** (`src/trim.js`). Step 4.2 (stairs, railings, fireplaces, arches) is also built, awaiting owner check. Step 4.3 (roof, side-yard slopes, deck and trees) is **built, awaiting owner check**: `src/roof.js`, `src/site.js` and their `*-mesh.js` glue. See the 4.3 notes for what is open. Next in order is 4.4. The Martelli HUD compass now reads S toward the lake (`map.planUpHeading`). Passage openings still lack casings; see the 4.1 note. Steps 7.1 to 7.4 are built together and await the owner's check: HUD (`src/hud-model.js`, `src/ui.css`), settings dialog (`src/settings.js`, `src/settings-menu.js`), screens (`src/screens.js`, `src/debrief.js`, `src/plan-view.js`). 7.1 was not proposed first. Step 5.2 (firearm models and hands) is also waiting on the owner. Pending owner checks don't block the next step.
- **Door changes (2026-11-12, committed in b45fa24 and earlier):**
  - **Black doors fixed:** every panelled door rendered black from step 3.3 until the fix. The furniture materials read vertex colours and the door geometry had none; `src/door-visual.js` now adds them.
  - **Garage doors:** the two garage doors carry `garage: true` and are drawn without a lever.
  - **Door height:** Martelli doors are 2.03 m tall (garage doors 2.13 m) under a breakable wall header, instead of ceiling-high slabs. `doorHeight(door)` in `src/world.js` reads `door.height`; other maps keep 2.8 m doors. As a result, light no longer passes over doors between rooms, and a jump inside a doorway can hit the header.
- **Controls (2026-11-12):** keys 6, 7 and 8 equip the grenade, flashbang and det cord. The mouse wheel cycles slots 1 to 8 in first person. See the 7.3 note.
- **Bedroom 3 fix (2026-11-12):** light samples that landed inside walls baked black patches in eleven rooms, and accent paint wrapped round corners. Both are fixed; see `lessons_learned.md`.
- **New step 6.5, destructible furniture,** is in the plan at the owner's request. The owner has answered its design questions (recorded in the step), so it is ready to build.
- `npm test`: 264 passing on 2026-11-12, about 6 seconds.
- Everything above is committed (latest `29e9602`) and pushed by the owner.

## Good next work for a Sonnet session

Pick one and follow its brief in the plan.
1. **6.5 Destructible furniture:** build it from the owner's answers in the step.
   - Start with the tuning table in `src/furniture.js` and the `world.js` helper. Then switch every reader in the step's list over to them.
   - The owner expects to tune the numbers afterwards, so keep them in one place.
2. **4.3 leftovers:**
   - an iron fence along the map edge, shrubs, and a driveway edge, all drawn only;
   - open-tread deck stairs, drawn over the existing solid stair blocks, which stay as collision.
   - No owner decision is needed for these; the level strips and the sun direction wait on the owner.
3. **4.4 Known map gaps:** each item needs owner answers first, so ask before building.
4. **4.1 passage casings:** propose the small data change that records passages (`gap()` openings), then add casings.

## Waiting on the owner

These need the owner's machine or knowledge, so a session can't finish them. Remind the owner when relevant; don't block on them.

1. **Frame timing.** Measure 1080p at Low, Medium and High in a foreground tab using `scripts/interior-preview.html`. This is the 60 fps budget check for steps 1.1, 1.4, 3.2 and 3.4.
2. **Interior walkthrough.** Check window highlights (1.2), reflections (1.3), shadow shimmer (1.5), contact shading strength (3.4), and fixture styles and positions against the photos (2.2).
3. **Site check.** On the interior preview page's exterior views:
   - Look at the roof against the aerial.
   - Decide whether the level strips along the side walls stay (see the 4.3 notes).
   - Say whether the sun should come from the lake side, which is south.
4. **Walkability decisions.** The remaining rows of the [0.2 audit](POLISH_PLAN.md#martelli-audit-for-review) are deferred by the owner. Don't change them until asked.

## Working agreement with the owner

- For open-ended work, report findings and a short proposal first and wait for a go-ahead. Clearly scoped fixes can be done directly. Steps marked **Propose first** in the plan always need the proposal.
- The owner knows the real house and can answer anything the plans or photos leave unclear. Ask rather than guess on layout.
- The owner is new to game development and wants the game to stay a simple browser game with no asset pipeline.
- Keep `npm test` green. Change a layout test (walking routes, window count, displaced rooms, guard posts) only on purpose, never just to make a failure go away. Say in the docs why it changed.
- **Never tick a step ☑ yourself.** Mark it ◐ (built, awaiting owner check) and list what is open. The owner decides when a step is done.
- **The owner sometimes commits between turns.** Check `git status` and `git log -3` before any stash, reset or checkout. Don't use `git stash` to produce a "before" render: on 2026-11-12 a stash silently did nothing because the work was already committed, and the comparison was wrong. Use an on/off switch in a preview page instead.
- Commit before any history-rewriting git command. A previous rewrite reset the working tree and lost uncommitted work.
- Report verification honestly. "Verified" means seen on screen in this session. Name what was not seen, especially frame time, which the automation browser can't measure.

## Privacy

- `references/` (floorplans, photos, its README) is git-ignored and was removed from history. Never re-add it, and never copy photo content, file names with locations, or EXIF data into tracked files.
- Tracked files may describe rooms and furniture generically. The map name and the screenshots under `docs/` are already public.

## Running and checking

- `npm run dev` starts the game; `npm test` runs the suite; `npm run build` must still succeed (its chunk-size warning is known).
- `.claude/launch.json` defines a `dev` server on port 5173 for the in-app browser preview.
- **Game:**
  - To play Martelli: Start a mission → Loadout & planning → Map → Martelli House → Deploy with this kit. The briefing screen also has a direct **Deploy**.
  - **M** opens the map and **F** switches floors.
  - "Live guard tracking" and "Reveal patrol routes" in Settings → Game show the guards and their rounds.
- **Preview pages** (`scripts/*.html`, open under `/scripts/...` on the dev server):
  - `interior-preview.html` runs the real game renderer from fixed interior viewpoints. It has controls for quality, time of day and contact shading, and a frame-time readout. In the console:
    - `preview.state` is the mission state.
    - `preview.place()` reapplies the current view.
    - `preview.scene.reset(heading)` and `preview.scene.look(dx, dy)` aim the camera.
  - `furniture-preview.html` shows every kit piece:
    - **Show → Martelli · Main / Foundation** gives a cut-away house.
    - **Show clearance gaps** draws the walkability audit.
    - **Show → Finishes** shows every surface texture.
    - `preview.view(x, z, height)` frames a point in metres.
  - Other pages cover poses, cover, lighting, the light volume and windows.
- **Limits of the automation browser:**
  - It throttles the page to about one frame per second, so frame times read there are meaningless and keyboard walking is impractical.
  - Use the preview pages to reach interior views.
  - Check `read_console_messages` for errors after every reload.

## System notes

**Guard systems.** All of these apply only when the rule "Guard variety & realism" is on, which gives guards a `traits` sheet. With it off, or in tests that pass no `missionSeed`, guards behave exactly as before.

| File | What it does |
|---|---|
| `src/guard-traits.js` | Seeded random, the five traits (perception, discipline, communication, handling, nerve), and their multipliers |
| `src/guard-posts.js` | Weighted posts, per-mission assignment, and the walk-pause-look routine |
| `src/guard-wounds.js` | Flinch, leg falls, gut-shot clock, surrender, and shot dispersion |
| `src/guard-weapon.js` | 12-round magazine, reloads, stoppages, falling back to cover |
| `src/guard-radio.js` | Delayed, sometimes inaccurate radio calls and listener delay |

The mission seed is shown on the mission card and can be pinned with the "Mission seed" rule. "Guard marksmanship" scales guard accuracy. Not yet done: sounds for reloads and jams, securing a surrendered guard, a dropped-weapon model, and stopping a guard in cover from leaning out while reloading.

**Simulation performance (profiled 2026-11-11).**
- Movement and sight query a 1 m plan grid over the wall pieces (`src/spatial.js`) instead of scanning all pieces.
- Downed bodies sleep after lying still for a second.
- As a result, guards patrolling cost about 0.35 ms per frame, down from 6 ms.
- GPU cost is the open question. Measure it with the interior preview page or the browser's Performance tab, not by guessing.
