# Lessons learned

This is the project's troubleshooting record. Keep it current when a bug reveals a reusable lesson. Record the symptom, cause, fix, and regression evidence; do not reduce it to a list of features.

## 1. Recovery, local servers, and preserving work

### Power loss ends processes, even when the files survived

Repeated power interruptions left the game files intact but stopped the development server and interrupted browser verification. Recover from evidence:

1. Check `git status --short`, recent chat/work notes, and the actual files on disk.
2. Identify which implementation and checks completed. An interrupted response does not mean the code was lost, and a completed edit does not mean browser verification finished.
3. Check whether port 5179 already has a listener. Start the server only when needed.
4. Confirm that both the HTML page and `/src/main.js` respond. A Vite “ready” message alone does not prove the user's browser can reach it.
5. Resume only the unfinished checks and report the exact checkpoint.

```powershell
npm run dev -- --port 5179 --strictPort
npm test
npm run build
```

In the Codex Windows environment, a server started inside the sandbox reported ready but was unreachable from the browser outside it. Running the authorized server outside that sandbox resolved it. A blocked loopback probe also required the appropriate execution permission. Do not treat a sandbox socket error as proof of an application bug or silently open the server to the network.

### Git initialization is not a saved checkpoint

A repository inspection during prototype development showed only `README.md` tracked, with the game source, tests, and documentation still untracked. Verify the actual tracked files with `git ls-files`. Keep source, tests, documentation, `package.json`, and `package-lock.json` under version control; exclude `node_modules/` and `dist/`. Commit useful checkpoints and verify the intended remote backup rather than assuming `git init` protected everything.

### Use one browser origin consistently

The server binds to `127.0.0.1:5179`. Both `http://127.0.0.1:5179/` and `http://localhost:5179/` have been used during testing, but they are different storage origins. Switching between them can make saved rules, map choice, or kit appear to have reset. Use the same host and port when checking persistence.

## 2. Mouse, keyboard, and menus

| Symptom or risk | Cause and lasting fix | Evidence |
| --- | --- | --- |
| Pistol would not fire while right-click was held to aim | `pointerdown` reports the first button in a mouse chord, not each additional button. Use `mousedown`/`mouseup` and track the primary and secondary buttons independently. Releasing right must not cancel held left fire. | `src/combat-input.js`, `test/combat-input.test.js` |
| Firing appears broken in aimed/scoped views | Input can be swallowed by overlays or mouse-capture state. Keep cosmetic HUD/scope overlays from intercepting pointer input; test actual magazine consumption while aimed. | `src/main.js`, `src/style.css`, input and headshot tests |
| Mouse capture fails in a browser/tool environment | Pointer lock needs an appropriate user gesture and is not always available. Keep right-drag and IJKL look controls, and Z aiming, usable as fallbacks. Handle the rejected capture request without losing the initial shot. | `src/main.js`, browser checks |
| Running remains active unexpectedly | Sprint is held Shift, not a toggle. Derive it from the held-key set, and clear held input on blur, visibility changes, map/menu transitions, and release/pause paths. | `src/main.js` |
| A heavy weapon still runs through another code path | Enforce movement restrictions in simulation, not just the HUD. `movementGait` gives creep/crouch precedence and prevents M134 sprinting while equipped. | `src/simulation.js`, `test/minigun-overpenetration.test.js` |
| Crouching looks lower but still collides like standing | Camera height, collision height, aim origin, and visibility target height must agree. Refuse standing when there is insufficient clearance. | `src/world.js`, `test/lodge.test.js` |
| Inventory consumes normal browser focus navigation | Tab toggles the game menu; Shift+Tab remains available for backward focus navigation. Do not run gameplay shortcuts while a menu/input owns focus. | `src/main.js`, `src/menus.js` |

Keep C as toggle crouch and Ctrl as held creep. Both use the slow movement setting, but creeping has the stronger detection reduction. Do not accidentally restore the old “C also creeps” binding when editing controls text.

## 3. The geometry must agree across systems

### One set of remaining pieces drives the world

Wall and floor pieces drive rendering, shots, line of sight, blast cover, movement obstruction, and foot support. Do not create a visual hole while leaving its invisible collision behind, or remove collision while leaving a solid-looking wall. Door open/destroyed state and window health likewise need to be shared by every relevant system.

Map positions are `[x, z]`; elevations and 3D rays are Y-up. Door, window, player-eye, and floor-support helpers belong in `src/world.js`. Fixed values such as “everyone is at y=1.65” become bugs as soon as crouching or another story exists.

Cover destinations need more precise arrival than ordinary patrol waypoints. A 0.25-metre stopping tolerance left wounded guards exposed just outside a wall corner even though the selected grid cell was hidden. Cover routes now finish within 0.055 metres through the same collision movement; hiding, leaning, sight and shot capsules share the posed body. Regression checks in `test/guard-cover.test.js` verify the real retreat/hide/peek cycle, exposed hit zones, blocked routes, changed cover and actual misses from injury dispersion. Foliage concealment is separate from the solid prop base used for bullet collision.

Player cover must move the camera, firearm origin, enemy sight target and incoming-shot capsule together. `playerEye` is the shared exposed position; the root stays anchored behind cover while the head/torso lean out. Release the held peek synchronously on keyup and before map, inventory, pause, blur or pointer-lock transitions, because a paused simulation will not process a later movement tick. `test/player-cover.test.js` checks blocked headroom, tall-wall edges, pop-up exposure, real protection and flanking damage, hidden-fire suppression, movement exit and changed cover.

Do not infer a wall's long axis from its largest dimension when tracing tiny facade remnants: a jamb stub can be shorter than the wall is thick. Martelli now supplies an explicit axis, so the piece builder uses the authored length and does not extrude a stub across a doorway/window. Its lower floor also needs the same exterior registration as the upper floor; a mismatched outline placed playable cellar space inside solid yard blocks.

A clear window endpoint is not sufficient for a valid climb. The player must align without crossing a jamb, clear the sill/header at vault height, sweep the whole route against remaining geometry, and have clearance for the original posture at the destination. Interaction selection should consider visible nearby windows and doors together instead of always selecting a door first. Ceiling collision is shared with shots/sight, with explicit stair-shaft cutouts and ceiling-only render cutaways. `test/ceilings-windows.test.js` covers all usable Martelli windows in both directions, repeated physics-supported crossings, short wall geometry, blocked vault paths, ceilings and the lower storage footprint.

### A shooting aperture is not automatically a walking route

An eye-height opening can admit sight and shots while its lower pieces still block movement. Keep that behavior. A crouched body can use a lower opening than a standing body; test both, rather than making every damaged wall wholly non-colliding.

### Floating clusters need a connectivity check

Checking only whether a piece touches another surviving piece leaves entire disconnected islands floating. The support graph must trace a connected path to grounded or solid anchors. Valid top/side/face connections count; a corner touching at one point does not. Unsupported pieces take full damage and disappear.

The graph is cached per piece array and uses spatial cells for candidate contacts. An all-pairs graph construction became a poor fit for the much larger lodge. Do not reorder or replace pieces inside the same cached array without revisiting this cache contract.

See `src/destruction.js` and `test/wall-support.test.js`.

## 4. Floors, stairs, windows, and navigation

- Floor panels and trusses are separately damageable. Removing a panel does not erase a surviving truss below it. Foot support must use the remaining pieces, and loss of support must allow a fall.
- Movement inside the stair opening follows a ramp, while visible steps still block rays. Do not make the player catch on neighboring landing-panel/truss edges while ascending or descending.
- The guard route planner once allowed a diagonal step from a partially climbed stair onto a landing that was too high to step onto physically. The guard fell beside the stairs and repeatedly climbed again. Navigation must respect the actual landing step-up limit: a rise over 0.12 m requires a stair destination, with the ramp's separate height allowance.
- Guard pathfinding must react to new breaches and destroyed support. Its cache signature tracks pieces crossing into the destroyed state and window health. Partial damage that leaves collision intact should not require a whole new graph.
- Guards can open authorized doors on approach. Planning a route through a door is not permission to walk through its still-closed collider.
- Upper-floor routes need actual support. Do not give a guard a shortcut across an upper-story void merely because that X/Z position is navigable downstairs.
- Window openings must be absent from exterior wall geometry. A transparent pane placed over an unbroken solid wall is not a usable window.
- Intact glass admits vision and blocks character movement. Shots, axe/crowbar strikes, and thrown grenades/flashbangs/Molotovs shatter it. Throwable collision sweeps must break only reachable panes in distance order, preserve velocity/fuses through glass, and still stop at solid cover. Broken glass does not erase the sill: E performs a checked climb through the opening. An upper-story exit may lead to a fall.

The complete lodge retrieval/return route, guard stair pursuit, new breaches, floor falls, and window climbing are covered by `test/lodge.test.js` and `test/guard-ai.test.js`.

## 5. Damage, penetration, and cover

### Penetration is a budget, not an ammo-name exception

Compute it from the firearm, projectile, and velocity. Solid core penetrates most, standard sits between, and hollow-point has the least; hollow-point is not a guarantee that nothing behind the target can be hit. Order all hits by distance and keep processing the same ray while budget remains.

Each crossed obstruction reduces remaining damage and wall power. Drywall costs 1 penetration unit; 2×4 framing and NPCs each cost 4. Particleboard and trusses cost more. Existing holes cost nothing, so later shots can travel farther than the first shot at a fresh wall.

Do not apply damage attenuation twice to doors: body damage already falls after a crossed layer, so the door's original wall-power multiplier is retained separately. Wall-piece damage still uses the attenuated wall power.

Headshots deliberately remain lethal across every firearm/ammo/suppressor/velocity combination when the shot actually reaches the head. Body hits retain their configured/attenuated damage. Deduplicate body/head intersections on the same guard so a single ray does not damage that guard twice.

See `test/headshots.test.js`, `test/penetration-map.test.js`, and `test/minigun-overpenetration.test.js`.

### Resolve blast cover before destroying the cover

The original explosion removed nearby walls first and then checked character damage. A wall therefore disappeared before it could shield someone from the same blast. Snapshot character exposure against the geometry present at detonation, then damage the structure and apply the recorded exposure.

Use the real 3D grenade position and character elevation. A ground-plane-only test can damage people through an intact upper floor or destroy pieces on an unrelated story. Distance to structural boxes also needs all three axes.

Walls and closed doors absorb that blast, including cover destroyed by it. Existing breaches and open doorways expose the character; a later grenade can pass through the newly made opening. Decorative concealment and window glass do not absorb blast damage. Zero damage must not trigger the player's hurt overlay.

Grenade lethality also needs distance-based checks, not just a test at the exact center. The current grenade has 220 base damage, a full-damage inner radius of 1.5 m, and falloff to zero at 4 m. Tests include full-health unshielded guards through 2.5 m and wounded survivors farther away. Keep those behavioral distances when adjusting balance.

Exterior masonry is marked for blast-only damage. Check this in the shared damage function so bullets and melee tools cannot bypass it. Floor sheets and trusses have much more durability than drywall and wall studs.

See `test/blast-cover.test.js` and `test/blasts-doors.test.js`.

## 6. Guard knowledge and silent attacks

- Radio reports contain observed positions and elevations, not a live reference to the player. Losing sight leads to the last known location, a search, and eventual patrol resumption.
- Preserve the distinction between visual identification, a noise location, an environmental discovery, and an injury call. A broken window does not tell guards where the player went.
- Injured survivors immediately call backup, even if the gunshot-noise option is off. Dead and stunned guards cannot transmit. Avoid repeated per-pellet calls flooding the radio.
- Detect damaged surfaces at a visible face. Testing the center of an intact damaged collider incorrectly lets that same collider block observation of its own damage. Other cover must still block the observation.
- Unarmed detention is an AI mode, not a mission-ending state. Do not reuse the zero-health `captured` outcome or block movement/inventory. One guard stops nearby; backup gathers slowly. A visible drawn weapon changes the response immediately.
- Distinguish carried gear from held gear. Empty hands, a med kit, and a door picking gun are unarmed; firearms, melee weapons, and explosive items are threats. Holstering must preserve magazines.
- A rear knife attack kills immediately without a noise alert or a surviving-guard injury call. That is not invisibility: another guard can still discover the body visually. Front attacks can leave a survivor who calls backup.

See `src/combat.js`, `src/guard-ai.js`, `test/guard-ai.test.js`, and `test/knife.test.js`.

## 7. Persistence, configuration, and UX

Keep these concepts separate: authored map, mission state, planned kit, carried inventory, owned gear, support budget, and sandbox rules. Opening field inventory must preserve consumables and magazines. Its explicit Restock equipment & cash debug button may refill items to their catalogue maxima and restore support cash to the sandbox maximum ($10,000); it must preserve firearm magazines and the saved loadout. Changing live ammo must not refill a gun.

Validate an equipment action before consuming its quantity: a med kit at full health and a blocked placement should not silently spend supplies. Reusable tools and knives must remain in inventory after use.

New catalogue entries need explicit migrations for older saved kits. The M134, door picking gun, and knife were added without throwing away a player's existing choices. Continue validating required old fields, enums, quantities, and numeric ranges rather than silently accepting malformed kits.

A dedicated Breach lab preset originally removed guards and changed the regular mission into a separate test mode, which did not match the intended game. Breaching belongs in ordinary missions. Retiring that preset required migrating its unchanged saved settings back to Recommended while preserving other customized settings.

Map and enemy count belong in deployment planning. The current maps supply eight patrol paths, so the count is 0–8; validate whole numbers and apply the count on a new deployment. Do not imply an unlimited population slider works when the map supplies only eight routes.

The original health number was too easy to miss. Keep the large labeled health panel and redundant number/bar/warning states. Conversely, the growing bottom HUD made its full-width green gradient cover too much of the weapon model. Use separate compact readable surfaces instead of a large screen-wide wash.

## 8. Rendering and performance

- Meridian Lodge contains roughly 10,000 structural pieces. Use material-grouped `InstancedMesh` batches rather than one draw call per tile or stud.
- Keep piece-to-instance indexing stable. Update matrices when destruction or the viewed floor changes, not by rebuilding all geometry each frame.
- Switching maps must dispose renderer resources, textures/geometries/materials, event listeners, and the resize observer. Otherwise repeated deployments can accumulate memory and duplicate input handlers.
- Tactical views hide other stories consistently across walls, floors, doors, panes, props, actors, routes, and room labels. First person uses real occlusion instead of a floor cutaway.
- The Vite build currently emits a chunk-size warning. A successful build with this warning is not a runtime failure. Download/bundle size and GPU draw-call cost are different problems; instancing fixes the latter.
- Keep generated audio optional. Autoplay restrictions or missing audio support must not prevent gameplay.

## 9. Definition of a useful checkpoint

### Articulated guards and hit detection

Keep anatomical ray capsules, wound poses, and ragdoll joints in simulation code shared by targeting and rendering. A downed survivor must not retain an invisible standing hitbox, continue fighting/radioing, or count as a kill until health actually reaches zero. Headshots release muscle forces immediately; abdomen side-curl forces apply only while alive. Injuries reset with the deployment. Fixed substeps avoid frame-rate-dependent joint stretching; collision must use the currently surviving floor pieces so resting bodies fall after breaches. Cull nearby colliders once per body/frame before solving contacts against the large lodge map.

Physics assertions alone cannot catch incorrect geometry dimensions. The development preview caught a cylinder height parameter mistaken for radial segments, making rendered limbs ten times their simulated lengths. Verify rendered proportions and actual collapse poses in the browser as well as simulation behavior. `test/npc-body.test.js` covers wound effects, posed finishing shots, upper-floor support loss, world collision, pause, and 30/60/120 FPS agreement. `scripts/npc-preview.html` compares the same production meshes and solver interactively.

Run `npm test` and `npm run build` after relevant gameplay changes. Add behavioral regressions for interactions that failed, not tests that merely repeat an implementation expression. Examples worth preserving are a two-button pistol click, an NPC before a door in the same shot, a grenade behind a wall it destroys, a stair landing, and detention followed by drawing a weapon.

Pure Node tests do not prove that WebGL rendered, pointer lock worked, a menu can be operated, or a HUD is readable. Finish important UI/rendering changes in a real browser and save a useful screenshot under `docs/`. State which checks passed, which remain, and whether the server is actually reachable.

Maintain this file and `tech_stack.md` alongside implementation changes. Update stale “not implemented” statements when a feature lands, while keeping future plans distinct from working behavior. Preserve dependency notices and record asset provenance before adding outside models, textures, fonts, or sounds.
