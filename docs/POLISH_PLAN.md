# Polish plan: closing the gap to the reference game

Drafted 2026-11-12. This is the working plan for bringing Door Kickers up to the visual quality, menu depth and physical feel of the reference game ("Golden Hour", a Three.js hotel shooter the owner admires) while keeping Door Kickers a single-player game about planning and assaulting a compound.

Read [HANDOFF.md](HANDOFF.md) first for the state of the repo and the working agreement, then this file. Before changing any shader, material or rendered geometry, read **Rendering conventions** below.

## Decisions this plan rests on

- **The hold on lighting and trim is lifted** (owner, 2026-11-12). Lighting is Phase 2 and trim is Phase 4.
- **No asset pipeline is needed.** The reference game ships no model, texture, font or sound files. Everything is generated in code when the page loads. Door Kickers stays a browser-only game with procedural content; `three` remains the only runtime dependency (its bundled `examples/jsm` add-ons count as part of it).
- **Play style stays different.** The reference is a bot deathmatch. Nothing here adds respawns, score races or killstreaks.
- **The simulation is not rewritten.** Destruction, penetration, ragdolls and guard AI are already ahead of the reference. Presentation is layered on top; pure simulation modules keep running in Node tests without a renderer.

## How to work against this plan

- Take **one numbered step per session**, in order unless a step says it is independent. Each step has a "Done when" line.
- **Step states.**
  - ☐ means not started.
  - ◐ means built but awaiting the owner's check.
  - ☑ means done: the owner has approved it.
  - When you finish building a step, mark it ◐ and list its open checks in the table. Never mark ☑ yourself.
  - A ◐ step does not block the next step. Checks that need the owner's machine, such as frame timing, are collected in the handoff.
- Steps marked **Propose first** are open-ended. Show the owner a short proposal, with a preview page or screenshot where possible, and wait for a go-ahead before building.
- Keep `npm test` green (263 passing on 2026-11-12). Add tests for anything that is pure data or geometry. Change layout tests only on purpose, and say why in the step's notes.
- **Verify every visual step in the browser** on the Martelli map. Follow **Verification** below.
- When a step lands, record it in two places:
  - **This plan:** update its row in the status table and add a short **Built** note under the step: what changed, what was seen, what is open, and before and after screenshot links.
  - **The handoff:** add one line under "Where things stand", replacing any outdated line.
- **Performance budget:** 60 frames per second at 1080p on the owner's machine at the default quality preset. Report draw calls and triangles from the preview pages. Frame time can only come from the owner's foreground measurement.
- **Model choice.** The status table suggests a model tier for each step. This is a judgement from how the work has gone so far, not a measurement.
  - **Sonnet** suits steps with a written brief, a data or geometry core, and clear tests.
  - **Opus** suits steps that change shaders or the render pipeline, touch the simulation or guard AI, or start with a proposal.
  - **Opus brief, then Sonnet** means Opus writes the detailed brief and reviews the result, and Sonnet implements it.

## Rendering conventions

These are traps that have already cost time. Follow them on every rendering change.

1. **Patch order.** `lighting.decorate(material)` in `src/scene-lighting.js` *replaces* `onBeforeCompile`; it does not chain.
   - Always decorate first.
   - Any further patch must wrap the previous `onBeforeCompile` and append to `customProgramCacheKey`. Copy `patch()` in `src/surface-materials.js` or `roundEdges()` in `src/furniture-mesh.js`.
   - Two materials with different shader code but the same cache key share one compiled program and render wrongly.
   - Exterior geometry that sits over the house footprint (the roof) must pass `{ outdoor: true }` as the third argument, or the baked field lights it as indoor and it renders dark.
2. **Vertex colours.** Furniture materials (`createFurnitureMaterials`) set `vertexColors: true`. Any geometry drawn with them needs a `color` attribute. Without one, WebGL reads black: every panelled door rendered black from step 3.3 until 2026-11-12 for this reason.
3. **Breakable structure is instanced.**
   - Wall, floor and ceiling pieces are drawn as one `InstancedMesh` per material (`wallBatches` in `src/scene.js`).
   - `draw()` hides a piece by scaling it to zero when `hp <= 0`, and in the overhead and tactical views when it is a ceiling or on another floor.
   - Anything attached to a piece, such as trim or bullet holes, must reuse that exact visibility rule. Store per-instance data in `instanceColor` or an `InstancedBufferAttribute`.
4. **World-space fields assume 3.2 m storeys.** The light field, contact shading and guard-sight darkness pick a floor with `floor((y + 0.03) / 3.2)`. Generalise this before adding a map with other storey heights.
5. **Special views.** Check each one after any rendering change.
   - The tactical map sets `lightTactical` and skips the lighting block.
   - Night vision and thermal are computed inside the `decorate` patch.
   - Post-processing (bloom, SMAA, GTAO) runs only in normal first person with no goggles (`filmic` in `draw()`).
6. **Vertex patches skip some passes.** Shadow maps and the GTAO normal pass use the unpatched geometry, so a shape changed in a vertex shader casts its original shape.
7. **Keep logic out of the renderer.**
   - Pure data and geometry go in Three-free modules tested in Node, such as `lighting.js`, `contact-shading.js`, `furniture.js`, `clearance.js` and `surface-plan.js`.
   - Three.js glue goes in `scene*.js` and `*-mesh.js`.
8. **Visuals never change collision.**
   - `map.props` and `propHeight` feed movement, shots, cover, guard paths and window climbing.
   - Drawn-only things go in `map.decor` or in scene-only meshes.
9. **Dispose what you create.** `createScene().dispose()` disposes everything reachable from the scene. Textures created outside it, such as data textures held in uniforms, need their own `dispose`, as `lighting.dispose()` does.

## Verification

- **Where to look:**
  - Use `scripts/interior-preview.html` for interiors. It runs the real renderer from fixed viewpoints, with quality, time of day and contact-shading controls.
  - Use `scripts/furniture-preview.html` for single pieces and the cut-away house.
  - In the game, deploy on Martelli and check the overhead view (**V**) and the tactical map (**M**).
- **Every visual step:**
  - Check first person, overhead, tactical, night vision and thermal, at Low and High.
  - Read the console for errors after each reload.
  - Look specifically for black, missing or flickering surfaces. A whole object turning black means a missing attribute or a broken shader, not lighting.
- **Before and after:** compare with an on/off switch on a preview page or a URL flag. Don't compare with `git stash` or a checkout: the owner may have committed, and the comparison then silently shows the same code twice.
- **Frame time:** the automation browser runs at about one frame per second. Report frame time as unmeasured unless the owner measured it in a foreground tab.

## Status

☐ not started · ◐ built, awaiting the owner's check · ☑ done (owner approved). Built steps don't block the next one. The model column is only filled for unfinished work.

| Step | Summary | State | Open checks | Suggested model |
|---|---|---|---|---|
| 0.1 | Fix the two reported pinch points | ☑ |  |  |
| 0.2 | Walkability audit and test | ◐ | Fridge squeeze and great-room couch fixed (owner, 2026-11-12); remaining audit rows deferred by the owner | Sonnet |
| 1.1 | Frame-time readout and quality presets | ☑ | Foreground 1080p frame timing |  |
| 1.2 | Tone mapping, exposure and colour | ◐ | Interior window highlights and shadow detail |  |
| 1.3 | Sky and reflections | ◐ | Interior reflections on glass, tile and metal; timing |  |
| 1.4 | Post-processing stack | ◐ | Per-effect timing; High at 60 fps at 1080p |  |
| 1.5 | Shadow quality | ◐ | Interior shimmer while walking; distance-dependent softness not built |  |
| 2.1 | Lighting design proposal | ☑ |  |  |
| 2.2 | Light fittings and lamps | ◐ | Fixture styles and porch positions against the photos |  |
| 2.3 | Baked indoor light volume | ◐ | Interior lights-off comparison; timing |  |
| 2.4 | Sun patches, time of day, weather | ◐ | Owner look at dusk and night interiors |  |
| 3.1 | Full material sets for existing surfaces | ☑ |  |  |
| 3.2 | Furniture materials | ◐ | Frame time within budget |  |
| 3.3 | Doors, ceilings, glass, exterior | ◐ | Interior walkthrough (door colour fixed 2026-11-12) |  |
| 3.4 | Baked contact shading and softened edges | ◐ | Owner review of shading strength; timing |  |
| 4.1 | Baseboards, casings and door frames | ◐ | Owner look at trim contrast and the casing-versus-window-frame decision; passage openings still show raw timber ends; timing |  |
| 4.2 | Stairs, railings and fireplaces | ◐ | Owner look at railing, carpet colour, fireplace and arch shapes against photos; special views and timing not checked |  |
| 4.3 | Roof, deck and site | ◐ | Owner look at the roof against the aerial, the level strips (keep or drop), the solid deck stairs, and the sun direction; Low/High, night vision, thermal and frame time not checked; fence, shrubs and driveway edge not built | Sonnet |
| 4.4 | Known map gaps | ☐ |  | Sonnet, with owner answers |
| 5.1 | Skinned guard bodies | ☐ |  | Opus |
| 5.2 | First-person weapon and hands | ◐ | Owner look at the four firearm models; separate view layer (no wall clipping), melee and thrown-item hands, and minigun not done | Sonnet |
| 5.3 | Weapon handling feel | ☐ |  | Opus |
| 6.1 | Impact effects and decals | ☐ |  | Opus |
| 6.2 | Loose physics: casings, debris, doors, chairs | ☐ |  | Opus |
| 6.3 | Movement feel | ☐ |  | Sonnet (mantling: Opus) |
| 6.4 | Sound | ☐ |  | Opus brief, then Sonnet |
| 7.1 | Interface foundation | ◐ | Not proposed first, by the owner's instruction to build 7.2 to 7.4. Only tokens and a window-relative scale exist (`src/ui.css`); the older `style.css` still carries the map banner and kit menu | Opus to propose |
| 7.2 | In-mission HUD | ◐ | Owner look at the HUD at several window sizes; damage arrow and window-climb prompt not seen in play; minimal mode and HUD scale not seen | Sonnet |
| 7.3 | Settings screen | ◐ | Mouse sensitivity, invert and master volume not tried in play; rebound keys not played with | Sonnet |
| 7.4 | Loading, briefing, planning and debrief screens | ◐ | Debrief seen only with test data, not at the end of a real mission; kit menu not restyled; the planning screen is still the existing dialog | Sonnet |
| 8 | Compound-assault game loop (design questions) | ☐ | Owner decisions | Opus, with the owner |

## What the reference game does

Findings from reading its published code on 2026-11-12 (minified, so details are inferred from names and strings; the game was not played). The "Door Kickers today" column describes the game before Phase 1. The status table above is current.

| Area | Reference | Door Kickers today |
|---|---|---|
| Engine | Three.js, WebGL | Three.js 0.187, WebGL2 |
| Assets | None; all generated at load in named stages (build geometry, build furniture, paint materials, capture light, assemble weapons) | None; all generated |
| Materials | Painted in code as full sets: colour, surface bumps, roughness, with reflections | Painted colour textures on walls and floors only; furniture, doors, ceilings flat |
| Lighting | Indoor light volume baked at load from sun patches and fittings; contact shading baked into geometry; spot, point and area lights | One sun, one sky light, a room light field in `src/lighting.js` |
| Post-processing | Ambient occlusion, bloom, film tone mapping, motion blur, depth of field | None |
| Quality control | Low/Medium/High/Ultra preset | None |
| Characters | Skinned, boned meshes built in code; first-person arms | Capsule segments drawn from simulation joints |
| Weapons | Modelled in code with attachments, camo finishes, recoil, aim-down-sights, inspect | No first-person weapon model |
| Effects | Per-material impact particles, decals, debris, casings, ricochets | Tracers, simple flashes and spheres |
| Sound | Fully synthesized, with reverb, positional sound, occlusion, music | Synthesized gunfire only |
| Interface | Custom HUD scaled to the window, minimap, settings for graphics, audio, controls, interface | Native dialogs and a side panel |
| Opponents | Bots; no networking | Guards with perception, radio, wounds, tactics |

Its game code is several times the size of ours. Expect this plan to take many sessions; each step is sized to land something visible on its own.

---

## Phase 0: Walkability

Fix this first. Better lighting will not matter if the house cannot be walked.

Background: the player collides with furniture using a 0.28 m radius allowance (`movePlayer` in `src/simulation.js`), so any gap of 0.56 m or less is impassable. Guards path on a 0.2 m grid (`navCell` in `src/maps/martelli.js`).

### 0.1 Fix the two reported pinch points

**Family room sectional (lower level).** The sectional's back run occupies plan x 465–515, z 250–420 (`sectional('L', point(540,335), …)` at `src/maps/martelli.js:249`). The brick pier at the north end of the wet-bar arch is at plan x 433 (z 373–393) with its face at about x 437. The gap is about 0.56 m, exactly the blocked width. The bar counter ends at x 429 beside it.
- Recommended fix: move the sectional about 0.4 m east (centre x 540 → 560). That gives roughly 0.96 m at the pier and still leaves about 1.2 m between the return and the media console.
- The owner described the blocking piece as the part extending toward the stairs. Confirm in the browser which gap they mean before moving anything; if it is a different gap, measure it the same way.

**Dining set (main floor).** The six chairs sit entirely outside the table edge (`src/maps/martelli.js:300-302`), so the set occupies 3.0 m × 2.0 m. The east chair ends at plan x 445, 0.14 m from the kitchen/great-room line at x 452.
- Fix: tuck each chair about 0.3 m under the table edge. The set becomes about 2.4 m × 1.4 m. Overlapping collision boxes between a chair and the table are fine.
- Chairs stay fixed for now. Pushable chairs are an optional part of step 6.2.

Done when: the owner can walk both routes in the browser, `npm test` passes (move test routes or guard posts only if the furniture is right), and the furniture preview page still looks correct.

### 0.2 Walkability audit and test

- Add a pure function (suggested: `src/clearance.js`) that, for a map, lists every gap between a prop and a wall or another prop that is wider than "flush" (about 0.1 m) and narrower than a minimum walkway.
- Minimum walkway: **0.9 m** on main routes (door to door through a room), **0.7 m** elsewhere. Flush-to-wall furniture is exempt.
- Add a reachability test: every room centre on Martelli is reachable from every entry by an agent 0.35 m in radius, reusing the walking grid in `src/navigation.js`.
- Run the audit on Martelli, list the pinch points for the owner, and fix the ones they agree are wrong. The owner knows the real house; ask rather than guess where a tight spot is true to life.
- Add an overlay to `scripts/furniture-preview.html` that draws pinch points in red.

Done when: the audit reports no unapproved pinch points on Martelli and the reachability test is in the suite.

#### Martelli audit for review

In the furniture preview, select either Martelli floor, then **Show clearance gaps** and **Overhead view**. Bright red marks widths under 0.70 m. Muted red marks 0.70 m to under 0.90 m and needs review only where the gap is part of a main route. The overlay shows all 86 measured spans, including furniture groupings and fixture gaps. The table lists candidates where someone might expect to walk through. [Main without overlay](martelli-clearance-before.jpg) · [Main with overlay](martelli-clearance-after.jpg) · [Foundation with overlay](martelli-clearance-foundation.jpg)

| Floor | Gap | Width | Review |
|---|---|---:|---|
| Main | South end of the kitchen island to the mudroom-side cabinet run and fridge | 0.68 m, then 0.48 m | **Owner, 2026-11-12: players should squeeze past the fridge.** The island and stools moved 0.2 m toward the dining table: now 0.88 m to the cabinets and 0.68 m to the fridge (player-passable, not guard-width). The island is 0.70 m from the dining chairs. A walking test covers the squeeze. |
| Main | Fridge to nearest island stool | 0.75 m | Now 0.95 m after the island move. |
| Main | Great-room armchair to wall | 0.62 m | Confirm whether the aisle behind the chair should be walkable. |
| Main | Great-room end table to media console | 0.58 m | **Owner, 2026-11-12: no window-side route; the couch is against the windows.** The sectional's return now backs onto the lake wall, 2.56 m deep, and the end table closes the run to the console. The east lake window is no longer climbable (13 climbable windows); the west one still is. The great-room centre now falls in the seating, so the reachability test lists it as displaced. The "deck windows" guard post moved to plan (495, 235). |
| Main | Laundry machines to wall | 0.80 m | Adequate for a local aisle. Review if treated as part of the closet through-route. |
| Foundation | Armchair to wall in the stair nook | 0.63 m | Confirm whether the chair should leave a path along the wall. |
| Foundation | Bedroom 5 bed to wall | 0.66 m | Confirm whether the wall-side gap is intentionally tight. |
| Foundation | Bedroom 4 bed to bookcase | 0.62 m | Confirm whether this gap should serve as a walkway. |

The 0.35 m-radius audit reuses the walking grid at 0.10 m spacing. From both entries it reaches walkable space in 15 of 17 Main rooms. The powder room and the entry-side closet have no reachable cell within their bounds. The return staircase also breaks connectivity for this radius, so the test checks Foundation separately from the stair foot. From there it reaches 9 of 10 playable rooms. The lower bath is the exception. Some room centres fall inside furniture or a partition, including the dining table and shared bath. The test records those separately from inaccessible rooms. The existing player test still walks both stair flights and returns through them with the standard 0.28 m collision padding.

---

## Phase 1: Rendering foundation

Small in code, the largest single visual jump, and everything later is judged through it. All of it lives in or beside `src/scene.js`.

### 1.1 Frame-time readout and quality presets

- Add a toggleable readout of frame time, draw calls and triangle count (`renderer.info`).
- Add a **Low / Medium / High** quality setting, saved in its own `localStorage` key, controlling resolution scale, shadow resolution, anti-aliasing and each post-processing effect as it arrives.
- Record baseline numbers on Martelli with eight guards. GPU cost has never been measured (see the sluggishness notes in the handoff).

Done when: the readout works in all camera views and switching preset changes resolution scale live.

**Verification.** Open **Settings → Graphics** (before step 7.3: Sandbox rules → Graphics) to choose a preset or enable the readout. Medium is the default. Resolution and shadow size change live. Crossing between Low and either higher preset changes WebGL anti-aliasing on page reload. The readout averages frame intervals over roughly half a second and reports the latest frame's draw calls, triangles and buffer dimensions.

Chrome on Martelli, with eight guards deployed and the sidebar closed:

| Preset and view | Render buffer | Draw calls | Triangles |
|---|---:|---:|---:|
| Medium, first person at spawn | 1475 × 1040 | 2745 | 272,638 |
| Medium, overhead | 1475 × 1040 | 1564 | 206,274 |
| Low, first person at spawn | 1128 × 795 | 2735 | 272,518 |

Guard movement makes the first-person counters vary slightly. The tactical map also displayed stats and confirmed eight guards. Chrome throttled the automation tab to roughly one frame per second, so the numbers above are render counters only. A foreground 1080p frame-time baseline is still needed to judge the 60 fps budget. [Medium screenshot](martelli-graphics-before.jpg) · [Low screenshot](martelli-graphics-after.jpg)

### 1.2 Tone mapping, exposure and colour

- Turn on film-style tone mapping (ACES or AgX) with an exposure control.
- Current light strengths (sky 2.5, sun 3.2 in `src/scene.js`) were tuned without tone mapping. Retune them, and the painted texture colours if needed, so interiors are not washed out or crushed.
- Check night vision and thermal: `src/scene-lighting.js` patches materials through `onBeforeCompile` and must keep working. Check the tactical and overhead views, which should stay flat and readable.

Done when: before/after screenshots show a clear improvement with no blown-out windows, and night vision, thermal and the tactical map look as intended.

**Built.** Normal first person uses AgX tone mapping and a saved exposure slider, now under Settings → Graphics. Clear daylight uses a softer sun and slightly brighter ambient light. Chrome confirmed the slider and camera and vision transitions. [Before](martelli-tone-before.jpg) · [After](martelli-tone-after.jpg). The screenshots show the exterior spawn. Interior window highlights and shadow detail still need a walkthrough.

### 1.3 Sky and reflections

- Replace the flat background with a generated sky (Three's `Sky` add-on or a small gradient shader) matched to the sun direction and the weather rule.
- Generate an environment map from it (`PMREMGenerator`) and set it as the scene environment so every standard material picks up soft ambient light and reflections.
- Lower the sky light accordingly so the two do not double up.

Done when: glass, tile and metal show believable reflections and outdoor ambient light matches the sky.

**Built.** Normal first person has a procedural sky with weather and night palettes and a reflection map generated when the palette changes. The sky adds one draw per normal first-person frame. Chrome showed the clear and rain palettes and switched through both goggles and the overhead and tactical views. [Flat sky](martelli-tone-after.jpg) · [Procedural sky](martelli-sky.jpg). Interior material reflections and foreground timing remain to be checked.

### 1.4 Post-processing stack

- Add `EffectComposer` with, in order: scene render, ambient occlusion (`GTAOPass`), bloom (`UnrealBloomPass`, subtle, for lamps and muzzle flash), output/tone mapping, anti-aliasing (multisampled target or SMAA).
- Bypass or simplify the stack in the tactical/overhead views and in thermal view.
- Wire each effect into the quality presets. Report frame-time cost per effect.
- Motion blur and depth of field are not planned; they suit a fast shooter more than a tactical game. Revisit only if the owner asks.

Done when: corners and furniture bases show soft contact shadows, bright sources glow slightly, edges are clean, and High holds 60 fps at 1080p.

**Built.** Medium adds bloom and SMAA in normal first person. High also adds half-resolution contact shadows. Low, overhead, tactical, night vision, and thermal use direct rendering. Chrome verified preset switching and those view transitions. [Before](martelli-sky.jpg) · [High](martelli-post.jpg). The exterior comparison shows the render paths. Interior contact shadows, per-effect timing, and the 1080p 60 fps target still need a foreground check.

### 1.5 Shadow quality

- Switch to soft shadows, fit the sun's shadow area to the house, and tune bias to remove acne and detached shadows.
- Shadow resolution follows the quality preset.

Done when: sun shadows through windows are sharp-edged at contact, soft further away, with no shimmering while walking.

**Built.** Each map uses its structure to set a fixed light-space frustum. The quality presets tune filtering and bias to the shadow texel size. The geometry test covers all maps. Chrome showed the Martelli exterior and switched through the camera and vision modes. [Before](martelli-post.jpg) · [After](martelli-shadows.jpg). The filter uses a fixed radius per preset. Distance-dependent penumbra and an interior shimmer check remain open.

---

## Phase 2: Lighting (hold lifted)

### 2.1 Lighting design proposal — Propose first

Read `src/lighting.js`, `src/scene-lighting.js` and `scripts/lighting-preview.html` in full, then propose how real light fittings and a baked light volume fit with what exists. The proposal must answer:

- How the existing room light field, power cuts and night-vision amplification carry over.
- **How baked light stays correct when walls, floors and doors are destroyed or opened.** The reference never has to solve this; we do. Likely answer: rebake only the affected region, spread over a few frames.
- How many real-time lights are affordable (expected: a handful nearest the camera, shadows from the sun plus at most one or two fittings).
- Whether guard sight (`darknessSightFactor`) reads from the same light data so that what looks dark is dark to guards.

Done when: the owner approves a written proposal and a preview page showing one room lit the new way.

#### Proposed implementation

- Replace the per-floor 2D field with a coarse 3D grid of light samples. Keep separate daylight and electric contributions so a power cut can remove electric light immediately. Give each authored fixture a stable ID, color, intensity and circuit. Keep one generated fixture per room as a fallback for maps without authored fixtures. Visible fixture meshes use the same circuit and damage state as the field.
- Sample the grid in the existing material patch. Keep direct sunlight on the sun and its shadow map. Feed the combined visible light into the existing night-vision amplification and keep thermal based on body heat. The tactical map keeps its own lighting.
- Build the field from the live wall, floor, door and window state. During sampling, record which geometry each source-to-probe ray crosses, including its first blocker. When a door changes or a piece breaks, enqueue the affected chunks, including chunks on adjacent floors for a slab change. Re-evaluate against the latest geometry and spread updates over multiple frames. Publish each finished chunk to the CPU and GPU together. A power cut changes the electric weight immediately. Destroying a fixture changes the source list and invalidates the chunks it previously lit.
- Keep the sun as the only shadow caster in the first implementation. Use the baked field for most fixtures and budget up to two nearby real-time accent lights on High after profiling. Use emissive shades and bloom for fixture glow.
- Have `darknessSightFactor` read the same CPU grid at player eye height and apply the same daylight and circuit weights. Keep its existing response curve initially. Compare guard detection at a few fixed light levels before retiring the daytime shortcut, since that shortcut currently gives a factor of 1 with power on.

The [room preview](../scripts/lighting-volume-preview.html) shows a warm lamp and daylight through an open doorway. It uses a small vertex bake to demonstrate the intended look and the independent light contributions. The production probe grid and geometry-driven rebake are implementation steps.

### 2.2 Light fittings and lamps

- Add fittings to the furniture kit and maps: ceiling fixtures, recessed lights, the lamps already drawn on nightstands and end tables, bathroom vanity lights, exterior porch lights.
- Each fitting has a position, colour, strength and a circuit, so the existing power-cut rule can switch them.
- Lit fittings glow (emissive material, picked up by bloom).

Done when: every Martelli room has fittings placed from the reference photos and they respond to a power cut.

**Built.** Ceiling fittings, table lamps, vanity lights and porch lights share the building circuit. Chrome verified the tactical power cut and camera and vision transitions. [Power on](martelli-fixtures-on.jpg) · [Power cut](martelli-fixtures-off.jpg). Ceiling styles and porch placements are room-based approximations and still need a photo comparison.

### 2.3 Baked indoor light volume

- Build what 2.1 approved: at load, compute a coarse 3D grid of light for the house from windows and fittings, with walls as occluders, and sample it in the material patch that already exists for walls and floors, extended to furniture and characters.
- Add a "Capturing light" stage to loading and log the bake time.
- Rebake on destruction, door and power changes as designed in 2.1.

Done when: rooms have visible light falloff from windows and lamps, interiors with the lights off are properly dark, and blowing a hole in an exterior wall lets daylight in.

**Built.** Martelli checks doors and surviving structure when baking light. After the first capture, geometry and fixture changes rebake the columns that could receive affected light. The bounds are conservative and cover both floors. Updates publish together for rendering and guard sight, and power cuts apply immediately. The mission card shows “Capturing light…” during the initial live bake. An interior comparison and foreground timing remain open. [Browser smoke test](martelli-live-light.jpg)

### 2.4 Sun patches, time of day and weather

- Time-of-day setting (day, dusk, night) driving sun angle, sky, exposure and which fittings are on.
- Tie the existing fog and rain weather rules into sky colour and ambient light.

Done when: the same mission reads clearly differently at day, dusk and night, and guards' sight follows.

**Built.** Day, Dusk and Night are available in mission planning. Dusk lowers and warms the sun, changes the sky and exposure, and turns on porch lights when the building has power. Fog and rain dim the light and have their own sky colors. Guard sight uses the time-of-day light weights when its darkness check applies. Chrome verified dusk and the camera and vision transitions. [Martelli at dusk](martelli-dusk.jpg)

---

## Phase 3: Materials everywhere

### 3.1 Full material sets for existing surfaces

- Extend `src/surface-textures.js` so each finish produces colour, a surface-bump (normal) map and a roughness map from the same generated height pattern and fixed seed.
- Extend the world-space shader patch in `src/surface-materials.js` to apply them on walls and floors.
- Update the Finishes view on the preview page to show them under a moving light.

Done when: tile grout, plank joints, carpet pile and siding laps catch light as relief, not as flat print.

**Built.** Plank joints and grout use the same layout as the color texture. Carpet pile, paint and siding use relief derived from their generated patterns. The furniture preview’s Finishes view has a moving light and a relief toggle. Chrome verified the swatches, in-game exterior, and camera and vision transitions. [Color only](martelli-finishes-before.jpg) · [With relief](martelli-finishes-after.jpg)

### 3.2 Furniture materials

- Give `src/furniture.js` boxes a material name instead of a flat colour (wood grains, fabric, leather, painted cabinet, stone counter, stainless, white ceramic, glass, mirror).
- Add those finishes to the texture generator and apply them in `src/furniture-mesh.js`. Keep draw calls low by batching per material.

Done when: every furniture piece on the preview page is textured and the Martelli frame time is within budget.

**Built.** Wood, woven fabric, leather, stone, painted cabinets, brushed metal, ceramic, glass, and mirrors use different materials. Opaque parts share batches by material, shape and floor. Martelli’s 996 furniture parts produce 112 render objects before culling. Chrome verified the furniture preview and game camera and vision transitions. Foreground frame time is still unverified. [Kitchen cabinet preview](martelli-furniture-materials.jpg)

### 3.3 Doors, ceilings, glass and exterior

- White two-panel doors with bronze levers, ceiling texture, window glass with reflection and slight tint, mirrors, grass and ground outside.

Done when: no flat untextured surface remains in a walk-through of Martelli.

**Built.** Martelli has white two-panel doors with bronze levers, textured ceilings, procedural grass, and lightly tinted window glass. Glass and furniture mirrors use the sky reflection map. Chrome verified the exterior and camera and vision transitions. An interior walkthrough remains open. [Before](martelli-dusk.jpg) · [After](martelli-architectural-finishes.jpg) **Correction (2026-11-12):** every panelled door actually rendered black, because the door geometry had no vertex colours (see Rendering conventions, item 2). The earlier screenshot check missed it. `src/door-visual.js` now adds the attribute. **Later the same day:** the two garage doors lost their levers (`garage: true` on the door), and Martelli doors were lowered to 2.03 m (garage doors 2.13 m) under a breakable wall header. Door panels and the handle height scale with the door. A test in `test/martelli.test.js` checks each door's height and header.

### 3.4 Baked contact shading and softened edges

- Bake soft contact shading into static geometry as vertex colours at load, as the reference does, to back up screen-space ambient occlusion on Low.
- Replace razor-sharp box edges on furniture with slightly bevelled or rounded boxes where it is cheap.

Done when: furniture no longer reads as stacked boxes at arm's length.

**Built (2026-11-12).**
- **Contact shading** (`src/contact-shading.js`, tested in `test/contact-shading.test.js`). The structure is thousands of shared instanced boxes, so vertex colours cannot carry per-place shading. Each floor instead gets a 10 cm plan field with two distances: to anything standing on the floor (walls and furniture 0.3 m or taller), and to full-height walls. The lighting patch in `src/scene-lighting.js` turns these into darkening where floors meet walls and furniture, and indoors where walls meet the ceiling (2.4 m Foundation, 2.8 m Main). It dims ambient and electric light only, never direct sun, and the tactical map skips it. Strength is 0.75 on Low and Medium and 0.45 on High, where GTAO also applies. Martelli bakes in about 30 ms. Breaking pieces rebakes the field at most every 0.25 s.
- **Softened edges** (`src/furniture-mesh.js`). Upholstery has rounded edges: fabric 4.5 cm and leather 4 cm. Hard finishes have narrow bevels: ceramic 2.5 cm, plastic 1.2 cm, wood 8 mm, painted cabinets and stone 6 mm, metal 4 mm. A vertex patch rebuilds every corner at its true radius after scaling, so corners no longer stretch with a part's size. Parts thinner than 5 cm, glass and mirrors keep plain boxes. Shadows use the unpatched shape, which has 2 % unit rounding.
- **New preview page `scripts/interior-preview.html`.** It runs the game's renderer from fixed interior viewpoints, with quality, time of day, contact shading and a frame-time readout. Use it for the open interior walkthroughs and foreground timing.
- In Chrome, the great room on Medium uses 582 draws and 318k triangles. High uses 805 draws and 474k triangles in the family room. Night vision and thermal render correctly. Frame time was throttled in the automation tab and is still unmeasured. [Contact off](martelli-contact-before.jpg) · [Contact on](martelli-contact-after.jpg) · [Rounded edges](martelli-rounded-edges.jpg)

---

## Phase 4: Trim and architecture (hold lifted)

Trim is drawn-only unless noted. It must never change collision, sight lines or the walking grid, and a test should assert that. Read **Rendering conventions** items 1–3 and 8 first. Maps without `surfaces` (every map except Martelli) get no trim, so they stay unchanged.

### 4.1 Baseboards, casings and door frames

Goal: tall white baseboards along interior wall faces, wide white casings around doors and windows, and door frames, all from the existing wall and opening data. Trim on a piece disappears when that piece is destroyed.

**Data you have:**
- `map.walls` holds axis-aligned wall segments `{ center, size, elevation, height, axis, exterior }`. They are already split at openings: see `segment()` in `src/maps/martelli.js`. Rails are walls with `height: 1`.
- `map.doors` holds `{ position, size, elevation }`, and `map.windows` holds `{ position, size, elevation, sill, height }`. Use `doorCenter`/`doorSize` and `windowCenter`/`windowSize` from `src/world.js` for 3D boxes.
- The breakable pieces come from `buildWallPieces(map)` (`src/destruction.js`). Each piece has `center` and `size` (3D), `wall` (the index into `map.walls`), `level` and `hp`.
  - The bottom row of a wall's pieces is where its baseboard attaches.
  - The pieces beside and above an opening carry its casing.
- `exteriorFaces(map, piece)` in `src/surface-plan.js` says which face of an exterior piece is outside. Exterior walls get trim on the inside face only.

**Build:**
1. **A new pure module `src/trim.js`.**
   - `trimFor(map, pieces)` returns boxes `{ kind: 'baseboard' | 'casing' | 'doorFrame', center: [x, y, z], size: [x, y, z], piece }`, where `piece` is the index of the wall piece the box hangs on.
   - Suggested sizes: baseboard 0.11 m tall and 0.012 m proud of the wall face; casing 0.07 m wide and 0.015 m proud; door-frame jamb lining the opening's reveal.
   - Skip rails, stairs, ceilings, floors and the bar half wall.
2. **Rendering.**
   - Use one `InstancedMesh` per trim kind in `src/scene.js` with a white painted material: decorate first, and give the geometry a `color` attribute or use a material without `vertexColors`.
   - In `draw()`, hide each instance with the same rule the wall batches use (convention 3), keyed on `trim.piece`.
3. **Existing window frames.** `windowFrames` in `src/scene.js` already draws grey frames. Decide with the owner whether casings replace them inside. The photos show wide white casings.

**Tests (`test/trim.test.js`):**
- Every trim box references an existing piece and sits within 0.05 m of that piece's face.
- No trim box intrudes into a door's clear opening.
- Trim is not added to `map.props`, `map.walls` or the mission state. Assert that `createMission(martelli)` has the same piece count and the same `segmentClear` results for a few fixed rays as before.
- Every Martelli room with a surface finish gets at least one baseboard.
- Courtyard, partitions and lodge produce no trim.

**Done when:**
- Every Martelli room has trim.
- Destroying a wall piece removes its trim, checked on the interior preview page by setting pieces' `hp` to 0 as the 3.4 check did.
- Draw calls rise by no more than 4.
- There are before and after interior screenshots.

**Built (2026-11-12).**
- `src/trim.js` (pure, tested in `test/trim.test.js`) returns 874 boxes for Martelli: 669 baseboards, 147 casings and 58 door-frame linings. Maps without `map.surfaces` get none.
- Baseboards sit on the bottom row of drywall skins and, on exterior walls, on the inside face of the masonry pieces. Rails (height 1) and walls above a floor level, such as the strip over a window, are skipped. Runs are clipped where a wall ends inside a door leaf.
- Door casings were floor-to-ceiling jambs when this step landed, because doors were full wall height. Since Martelli doors were lowered to 2.03 m under a header (later on 2026-11-12), each door gets jambs that rise to meet a head casing across the top. Martelli now has 923 trim boxes: 669 baseboards, 196 casings and 58 door-frame linings. Windows get jambs, a head and a sill apron. Each door also gets a thin lining over the wall ends beside the opening. Exterior walls are trimmed on the inside face only.
- `src/scene.js` draws one `InstancedMesh` per kind (3 extra draws) and hides each box with the wall-piece rule, so trim goes with its piece and follows the overhead and tactical floor rules. Trim does not cast shadows. `scene.setTrim(on)` and a **Trim** checkbox on `scripts/interior-preview.html` give the on/off comparison.
- Seen on the interior preview in Chrome (Medium): the primary bedroom window casing, a baseboard under the lake window, and baseboards disappearing when their pieces are set to `hp = 0`. No console errors. `npm test`: 246 passing.
- **Not seen or open:** Low and High, night vision, thermal and the overhead and tactical views were not re-checked for trim. Frame time is unmeasured. No before and after screenshot files were saved. Contact shading dims the base of walls, so baseboards read as soft grey rather than bright white at the floor line.
- **Existing window frames kept.** The grey frames in `windowFrames` stay inside the reveal, behind the new casings. Say if the casings should replace them.
- **Known gap:** wall openings that are plain passages (`gap()`, such as the hall and kitchen openings) are not in `map.doors`, so they get no casing and show raw timber ends. Giving them casings needs a small data change to record passages; propose it before doing so.

### 4.2 Stairs, railings and fireplaces

**Built (2026-11-12).**
- **Railing** (`src/stair-dress.js`, tested in `test/stair-dress.test.js`): wood handrail and newels with black iron balusters over the three `rail()` walls. The scene stops drawing the rails' drywall slabs (`hiddenRails` in `src/scene.js`) so the railing shows through. The rail walls stay in `map.walls`, so collision and sight are untouched. Each box hides with the nearest rail piece.
- **Carpet:** a flat beige slab on each of the 16 lower-flight treads (plain colour, not the carpet texture).
- **Fireplaces** (`src/furniture.js`): both variants gained a hearth cap, dark surround, logs, lintel and corbelled mantel, all inside the old footprint. Collision height is unchanged at 2.35 m.
- **Arches:** a new drawn-only kit kind `arch` (stepped brick header) over the wet-bar gap and the alcove gap, placed through `map.decor`.
- **Preview:** four new views on `scripts/interior-preview.html` (stair head, lower flight, corner fireplace, wet-bar arch). Seen in Chrome at Medium, no console errors. The stone-wall fireplace and the alcove arch were not looked at. `npm test`: 246 passing.
- **Open:** Low and High, night vision, thermal, overhead and tactical views, and frame time were not checked. Upper flight is not carpeted (the photos only show the lower one).

**Data:**
- The stair guard rails are `rail()` walls. In `src/maps/martelli.js` they are on z 565 and z 620, from 510 to 590, and on x 510 from 510 to 565.
- Stair treads are pieces with `stair: true`.
- The wet-bar arch is the 92-pixel gap in `v(fx(440), …)`.
- The arched alcove is the 46-pixel gap in `h(518, 425, 510, …)` on Foundation.
- The stone and corner fireplaces are the kit kind `fireplace` in `src/furniture.js`.

**Build:**
- Entry stair guard as drawn-only meshes over the existing rails: newels, handrail and iron balusters. The rails keep their collision.
- Carpeted treads on the lower flight.
- More detail on both fireplace variants in the kit: a hearth, mantel and firebox. Keep their collision boxes as they are.
- A brick arch header over the wet-bar gap, and an arch over the alcove, both drawn-only.

**Tests:**
- Rails still stop movement and leave sight open: the existing test in `test/martelli.test.js` must pass untouched.
- New kit options get cases in `test/furniture.test.js`.

**Done when:** the stair head and both fireplaces read as finished in the interior preview, with screenshots, and no collision test changed.

### 4.3 Roof, deck and site

- **Roof.**
  - A pitched roof drawn above the Main ceilings. It is drawn-only and hidden in the overhead and tactical views, like pieces with `ceiling: true`.
  - A vaulted great-room ceiling or a primary-bedroom tray ceiling would change ceiling collision, which shots and sight use. **Propose first** for those.
- **Deck.**
  - Screens, a picket rail, posts, and exterior stairs with a landing, plus a covered patio below.
  - **Deck stairs add an outdoor route between floors. Confirm with the owner first, then update guard routes, `test/martelli.test.js` and the reachability expectations in `test/clearance.test.js`.**
- **Site.** Sloped side yards with retaining walls, a driveway, and simple trees and shrubs. **Propose first** for the terrain: it changes foot support and window drops.

**Roof built (2026-11-12).**
- `src/roof.js` (pure, tested in `test/roof.test.js`) turns `map.roof` into triangles: each wing, a wall-line rectangle, becomes a hip roof at one eave height and pitch, with fascia and a flat soffit. Overlapping wings intersect like real hips. `src/roof-mesh.js` draws it as two meshes (shingles with a shingle texture painted in code, and white trim): 4 extra draw calls with shadows.
- Martelli has six wings in `src/maps/martelli.js`: the main block, the primary bump-out and bay, the Bedroom 3 corner, Bedroom 2 and the shared bath, the garage, and the entry with its eave over the front door. The eave is 6.4 m, the soffit sits on the 6.0 m wall tops, the pitch is 5 in 12 and the overhang 0.45 m. All of these are guesses for the owner.
- The roof is not in `map.walls`, `map.props` or the mission state. It hides in the overhead and tactical views. It is double-sided, so a destroyed ceiling shows its underside rather than sky.
- `lighting.decorate(material, heat, { outdoor: true })` is new: the roof sits inside the house footprint, where the baked light field says "indoor", and would otherwise render dark. The soffit is level with the Main ceiling's underside, so the trim material uses a polygon offset to let the ceiling win; without it the great-room ceiling showed streaks.
- `scripts/interior-preview.html` has a **Roof** checkbox and five exterior views (front walk, driveway, lake side, and two raised corners; a view's `y` lifts the eye).
- Seen in Chrome at Medium: both raised corners, the front walk, the lake corner at dusk, the overhead view (roof hidden) and the great room (ceiling clean). No console errors. Not checked: Low and High, night vision, thermal and frame time. The deck has no roof yet; it needs the deck's posts.
- **Terrain and deck:** see [TERRAIN_PROPOSAL.md](TERRAIN_PROPOSAL.md) for the proposal and the owner's answers.

**Roof reworked, site and deck built (2026-11-12, after the owner's answers).**
- **Roof:** the owner pointed at the aerial photo. The wings now follow its main ridges: the main block stops at the primary bedroom (x 965), the primary bath and Bedroom 3 get their own front-to-back ridge, and the deck has a hipped roof running toward the lake. Eight wings in all. Shape is still approximate.
- **Compass:** the owner noticed north and south were reversed. Plan up on Martelli is the lake, which faces south, but the HUD compass read N there. `headingDegrees(facing, planUp)` in `src/hud-model.js` now takes `map.planUpHeading` (180 on Martelli). The sun still comes from plan down, the real north, which the owner may want fixed too.
- **Slopes** (`map.slopes`): both side yards fall from the front grade (3.2 m) to the lake grade (0 m) at plan z 40, beside a level strip at Main grade along each side wall (`STRIP` in `src/maps/martelli.js`, 2 m). A slope is a ramp like a stair: `stairHeight` in `src/world.js` reads `map.slopes` too, so foot support, guard height and the walking grid needed no other change. `src/destruction.js` puts solid earth steps (`slope: true`, `stair: true`) just under the surface for shots and sight. The scene hides them and `src/site.js` draws a smooth lawn.
- **Retaining walls** (`map.retainingWalls`): stucco with a brick cap, drawn only, along each strip edge and continuing each side wall's line toward the lake, as in the photos. The earth slabs behind them collide.
- **Deck:** posts under and above the deck (solid floor slabs with `material: 'post'` and an explicit `level`), three picket rails (`rail()` walls, drawn by the stair railing code), screens (drawn only, see-through), and a U-shaped stair: a flight down from the deck's lake edge at the east corner to a landing at 1.6 m, then back to the patio. The deck stairs use the stair mechanism with `material: 'deck'`.
- **Trees** (`map.trees`): three, from the aerial (west slope, front lawn, beside the front walk). Each trunk is a solid, indestructible wall piece (`tree: true`) that stops movement, shots and sight; det cord leaves trunks and slope earth alone. Canopies are drawn only and hidden in the overhead views.
- **Routes changed on purpose:** the slopes and the deck stairs are outdoor routes between floors, approved by the owner. `test/clearance.test.js` now expects Foundation rooms reachable from both entries, and `test/stair-dress.test.js` counts six rails. `test/site.test.js` covers slopes, strips, deck stairs, trunks and det cord.
- **Seen in Chrome at Medium:** raised lake corner, lake side, both slopes from the lake lawn, and the roof from above. No console errors. **Not checked:** Low and High, night vision, thermal, frame time, and walking the slopes in the game itself.
- **Open:**
  - The level strips leave a 2 to 2.4 m retaining face at each house corner, which the photos don't show. Setting `STRIP` to 0 puts the slope against the wall as photographed, but then the kitchen's two west windows can no longer be climbed in from outside.
  - The deck stairs are solid blocks down to the ground, not open treads.
  - The floor framing between storeys shows as a brown band on the outside walls, now easier to see from the side yards.

**Done when:**
- The exterior from the front walk and from the lake side shows a roof, a finished deck and shaped yards, with screenshots.
- Any route changes were approved by the owner and are covered by tests.

### 4.4 Known map gaps

Work through "Known gaps" in [MARTELLI_REFERENCE.md](MARTELLI_REFERENCE.md#known-gaps), one item at a time, asking the owner about anything the photos leave open. Each item changes collision or window counts, so update the affected tests on purpose and record why.
- **Great-room window wall.** It needs more windows to match the near-continuous glass. The sectional now backs onto this wall, so ask the owner which new windows should be climbable. The 13-window count, the light field and the 0.2 audit all change.
- **Garage.** The floor should be about four steps below Main, with a rear side door and two overhead doors. Build walls and stairs only.
- **Under-stair cubby.** It stays closed unless the owner says otherwise.

Done when (phase): exterior and interior screenshots from the same angles as the reference photos are recognisably the same house.

---

## Phase 5: Characters and weapons

### 5.1 Skinned guard bodies — Propose first

Start from: `src/npc-body.js` (simulated joints, shared with hit capsules), `src/npc-visual.js` (current capsule drawing), `scripts/npc-preview.html`, `test/npc-body.test.js`. Hit capsules are simulation data and must not move; only the drawing changes.

- Replace the capsule segments in `src/npc-visual.js` with one skinned mesh per guard, generated in code (torso, limbs, head, hands, boots, vest, helmet), bound to bones that follow the joints `src/npc-body.js` already simulates. Poses, wounds and ragdolls then carry over for free.
- Variation by seed: build, clothing colours, gear. Cloth and skin materials from Phase 3.
- Propose with a turntable on `scripts/npc-preview.html` before replacing the in-game guards.

Done when: guards read as people at 3 m, hit capsules still line up with the visible body, and eight guards stay within budget.

### 5.2 First-person weapon and hands

Start from: the placeholder weapon boxes built with `weaponBox()` in `src/scene.js`, held items in the same file, and the item catalogue in `src/kit.js` and `src/weapons.js`. Keep the models as data in a new Three-free module where possible, as `src/furniture.js` does for furniture.

- Model each firearm in `src/kit.js` in code from primitives, lathes and extrusions, plus arms and gloves, drawn in a separate view layer so it never clips into walls.
- Melee and thrown items after firearms.

Done when: every carried item has a visible first-person model.

**Built (2026-11-12, firearms only).**
- `src/weapon-models.js` (pure, tested in `test/weapon-models.test.js`) holds the rifle, pistol, shotgun and sniper as box and cylinder parts, each with a suppressor part and gloved hands with sleeves. `src/scene.js` builds one group per weapon and shows the equipped one. The suppressor toggles with the loadout, and the muzzle flash follows the muzzle.
- `scripts/interior-preview.html` has a Weapon picker and a Suppressor checkbox (the weapon is hidden by default there).
- Seen in Chrome at Medium: rifle, shotgun, sniper with suppressor and pistol, no console errors. `npm test`: 246 passing.
- **Not done:** the separate view layer, so long barrels can still clip into walls (it needs a second render pass that works with the post-processing stack, Opus-sized); hands on melee and thrown items, which keep their old box models; the minigun, unchanged. The old weapon bobbing and recoil are unchanged, so Step 5.3 is untouched. Models are dark and small at the bottom right; tune their position and colours against the owner's taste.

### 5.3 Weapon handling feel

Start from: the weapon group's recoil and bob in `draw()` in `src/scene.js`, and the reload and cadence timings in `src/weapons.js`. Do not change `src/weapons.js` behaviour; `test/gunplay.test.js` and the other weapon tests must pass untouched.

- Aim-down-sights with a real sight picture, visual recoil and recovery, sway, reload and equip animations driven by the existing timings, shell ejection, improved muzzle flash with a brief light.
- These are presentation only. Hit rays, cadence, magazines and penetration in `src/weapons.js` do not change.

Done when: firing, reloading and switching feel weighty, and all weapon tests pass untouched.

---

## Phase 6: Effects, physics and sound

### 6.1 Impact effects and decals

Start from: `shotEffect` and `eventEffect` in `src/scene.js` (the current tracers and flashes), the hit results produced in `src/combat.js`, and piece materials in `src/destruction.js`. Decals must follow the piece visibility rule (Rendering conventions, item 3).

- Per-material impact response keyed off what the ray hit (drywall, wood, masonry, glass, metal, fabric, flesh): dust, chips, sparks, splinters.
- Bullet-hole and scorch decals with a capped pool, removed with the piece they sit on.
- Better explosions, fire and smoke; glass shards.

### 6.2 Loose physics: casings, debris, doors and chairs

- Short-lived rigid bits (casings, wall chunks) using the same contact queries as the ragdolls, capped and put to sleep quickly.
- Doors that swing with momentum and can be pushed or kicked, if the owner wants it: this touches `src/doors.js` and guard pathing, so **Propose first**.
- Optional: light furniture (chairs, stools) that can be shoved or knocked over. Also **Propose first**; it affects cover, sight and the walking grid.

### 6.3 Movement feel

Start from: `movePlayer` in `src/simulation.js` (do not change collision), the camera and weapon bob in `draw()` in `src/scene.js`, and floor finishes from `surfaceAt` in `src/surface-plan.js` for footstep surfaces.

- Acceleration and deceleration, subtle head bob and landing dip, lean, footstep timing tied to speed and surface.
- Mantling over low cover is a gameplay change: **Propose first**.

### 6.4 Sound

Start from: `createGunAudio()` in `src/audio.js` (synthesized gunfire), the noise events guards react to in `src/guard-ai.js`, and `segmentClear` in `src/combat.js` for muffling. Audio must stay optional: autoplay limits must never block play (see `lessons_learned.md`, section 8).

- Grow `src/audio.js` into a synthesized sound set: distinct weapon reports, suppressed variants, reloads, casings on each floor type, footsteps per surface for player and guards, doors, glass, impacts, explosions, guard radio chatter.
- A mix bus with a compressor, positional sound, room reverb sized from the current room, and muffling through walls using the existing obstruction checks.
- Sound matters to play here: what the player hears should match what guards are deemed to have heard.

Done when (phase): a firefight in the great room leaves marks, debris and brass, and can be followed by ear.

---

## Phase 7: Interface and menus

### 7.1 Interface foundation — Propose first

Start from: `src/style.css`, the HUD markup built in `src/main.js`, and the dialogs in `src/menus.js`. There is no UI framework; keep it that way.

- A small design system in `src/style.css`: one type scale, colour tokens, spacing, button and panel styles, all sized relative to the window so the layout holds from 1280×720 to 4K. Icons as inline SVG.
- Propose with a static mock of the HUD and one menu before converting anything.

### 7.2 In-mission HUD

**Built (2026-11-12, with 7.3 and 7.4).** The HUD markup is rebuilt in `src/main.js` and styled in the new `src/ui.css`. Pure rules live in `src/hud-model.js` (tested in `test/hud-model.test.js`).
- Compass strip and heading readout, objective line, guard alert state (undetected, suspicious, searching, hunted), compact health with status and stance, weapon and ammo, vision and funds, door and window prompts from `nearbyInteraction`, a damage arrow, and the existing radio line.
- The damage arrow needs a hit source. `damagePlayer` in `src/combat.js` takes an optional source and guard shots pass theirs; blasts and fire pass none, so they show no arrow. Nothing else about damage changed.
- Controls hints are generated from the current key bindings.
- Clusters scale with the window (`--hud-auto`) and the HUD scale setting. Minimal mode keeps health, ammo and the alert state.
- Seen in Chrome at 1280×760: the HUD in play, the pause screen. Not seen: the damage arrow, minimal mode, HUD scale at other sizes, narrow windows.

- Rebuild the HUD on the new system: health and stance, weapon and ammunition, equipment, objective and compass, guard-alert state, interaction prompts, hit and damage-direction feedback, radio intercepts.
- A minimal mode and a HUD scale setting.

### 7.3 Settings screen

**Built (2026-11-12).** The side panel is gone; **Settings** in the top bar and on the main and pause screens opens a tabbed dialog (`src/settings-menu.js`).
- **Graphics:** the existing preset, performance and exposure controls. **Game:** the existing rules, preset, import and export. **Audio:** master volume. **Controls:** sensitivity, invert, and a key table. **Interface:** HUD scale, minimal HUD, crosshair style, control hints.
- `src/settings.js` holds the schema, validation, saving and key bindings, with conflict detection that refuses a taken key and names its owner (`test/settings.test.js`). Tab and Esc are fixed.
- The key handler in `main.js` now reads the bindings. Movement still also answers to the arrow keys.
- **Not built:** music and radio volume sliders (those sounds do not exist yet; see 6.4), separate effects volume (gunfire volume stays a Game rule), and per-weapon bindings beyond slots 1 to 5.
- Seen in Chrome: all five tabs, rebinding with a refused conflict and an accepted key saved to storage (reset afterwards).

- Tabbed settings: Graphics (preset plus individual toggles from Phase 1), Audio (master, effects, music, radio), Controls (sensitivity, invert, key bindings with conflict detection), Interface (HUD scale, crosshair, hints), Game (the existing sandbox rules, with import and export kept).

### 7.4 Loading, briefing, planning and debrief screens

**Built (2026-11-12).** `src/screens.js` provides the main menu, briefing, pause, debrief and loading screens, wired in `main.js`.
- **Flow:** menu, briefing (floor plan drawn by `src/plan-view.js`, objective, entry, guards, conditions, kit, floor tabs), optional Loadout & planning (the existing kit dialog, unchanged), then Deploy with a staged loading screen (structure, guards and gear, light capture).
- **Pause:** P, window blur or releasing the mouse opens the pause screen: Resume, Inventory & kit, Settings, Abort mission.
- **Debrief:** time, shots, guards down, worst alert, and a timeline built by `src/debrief.js` from state changes (`test/ui-models.test.js`).
- Seen in Chrome: menu, briefing on the courtyard and Martelli plans, the loading stages, pause, and the debrief with test data. The loading screen is nearly instant outside the throttled automation browser, so it may flash by.
- Not done: restyling the kit dialog itself, and a real end-of-mission debrief was not reached in the browser.

- A staged loading screen that names what is being built, as the reference does.
- Main menu, mission briefing with the floor plan, the loadout and planning screen restyled (`src/menus.js`), pause menu, and an after-action debrief with timeline and statistics.

Done when (phase): a new player can go from the main menu through briefing, loadout, mission and debrief without touching the side panel.

---

## Phase 8: Compound-assault game loop (design questions)

Not polish, but the plan's destination. These need the owner's decisions before any work, and can be discussed at any time in parallel with the phases above:

- Is the player one operator or a team that is given orders?
- Does planning mean drawing routes and timings on the floor plan before deployment, or choosing entry point and kit as now?
- Objectives beyond retrieval: hostage rescue, arrest, clear, defuse?
- Scoring and failure: time, noise, casualties, rules of engagement?
- More compounds, or one deep one (Martelli)?

## Risks to watch

- **Destruction versus baked lighting and trim.** Every baked or decorative layer must react to pieces being removed. Design for it in 2.1 and 4.1 rather than patching later.
- **Draw calls.** Structure is drawn in a few instanced batches today. Textured furniture, trim and fittings can multiply that; batch by material and measure each step.
- **Special views.** Night vision, thermal, the scope, and the tactical and overhead cameras each need checking after every rendering change.
- **Test routes.** Walking-route and window-count tests encode the current layout. Change them on purpose, never to make a failure go away.
- **Bundle size.** The build already warns about chunk size. Post-processing add-ons grow it; consider splitting preview pages and loading heavy modules after the menu appears.
