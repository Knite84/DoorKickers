# Technical stack

This describes the implemented local prototype, not a proposed future stack. See [README.md](README.md) for play controls, [lessons_learned.md](lessons_learned.md) for troubleshooting history, and [docs/DESIGN.md](docs/DESIGN.md) for design direction.

## Application and runtime

| Layer | Current implementation |
| --- | --- |
| Application | Single-page, client-side stealth sandbox; package name `stealth-sandbox` |
| Language | JavaScript ES modules; HTML and CSS; no TypeScript compilation |
| Interface | Native DOM, buttons, inputs, and `<dialog>` menus; no UI framework |
| 3D renderer | Three.js `0.187.0`, declared as `^0.187.0` |
| Graphics | Browser WebGL2, perspective first-person camera, orthographic overhead/tactical cameras, procedural meshes, instanced structure, shadows and fog |
| Audio | Browser Web Audio API; synthesized gunfire, no downloaded sound assets |
| Local persistence | Browser `localStorage`, with validated JSON rules import/export |
| Development/build | Vite `7.3.7`, declared as `^7.3.7`, using its installed build dependencies |
| Package manager | npm with `package-lock.json` |
| Automated tests | Node's built-in `node:test` and `node:assert/strict` |
| Verified development host | Windows/PowerShell, Node `v24.21.0`, npm `11.19.0` |
| Documented Node baseline | Node 22.12+; the current host uses Node 24 |

The browser needs a desktop keyboard/mouse and WebGL2 with hardware acceleration. Pointer lock has right-drag/IJKL fallbacks. There are no touch controls.

There is no backend, database, account system, cloud game service, required paid API, or runtime AI connection. Installed game code and assets are served locally; the game itself does not make external network requests. Installing/updating npm dependencies is a separate development operation.

## Commands

Run these from the repository root:

```powershell
npm install
npm run dev -- --port 5179 --strictPort
```

Open `http://127.0.0.1:5179/`. Use the same origin each time if you want the same browser storage. The `dev` script binds to `127.0.0.1`; `--strictPort` avoids silently moving to another port.

| Command | Purpose |
| --- | --- |
| `npm test` | Run all `test/*.test.js` using `node --test` |
| `npm run build` | Produce the static production site in `dist/` |
| `npm run preview -- --port 5179 --strictPort` | Serve a previously built production bundle locally; stop the dev server first if it uses the same port |
| `npm run licenses` | Refresh the installed dependency-license snapshot using `scripts/licenses.mjs` |

The build currently produces a JavaScript chunk above Vite's size-warning threshold. The warning does not fail the build. No separate lint or browser-test npm script is currently configured; browser verification has been performed through browser automation/manual inspection.

## Source layout

| File or directory | Responsibility |
| --- | --- |
| `index.html` | HTML entry point and app mount |
| `src/main.js` | Input, HUD, persistence, deployment, menus, animation loop, wiring simulation to rendering |
| `src/style.css` | HUD, menus, responsive layouts, visual overlays |
| `src/scene.js` | Three.js scene/cameras, instanced structure, procedural actors/items/scenery, effects, floor cutaways, resource disposal |
| `src/simulation.js` | Mission lifecycle, player movement/collision, crouch, vision helpers, interaction, collection/extraction |
| `src/world.js` | Elevation, eye/body dimensions, door/window bounds, stair height, remaining floor support |
| `src/npc-body.js` | Shared anatomical capsules and articulated poses, persistent deployment injuries, fixed 120 Hz Verlet ragdolls with distance/bend constraints and world contacts |
| `src/npc-visual.js` | Procedural capsule-segment guards rendered directly from simulation joints |
| `src/destruction.js` | Layered wall/floor pieces, exterior segments, ray/AABB intersection, damage, structural connectivity |
| `src/weapons.js` | Firearms, pellet rays, hit ordering, penetration, head/body hits, ammunition and reloads |
| `src/combat.js` | Shared damage, obstruction checks, noise alerts, radio reports, window shattering |
| `src/guard-ai.js` | Perception, evidence discovery, radio consumption, pursuit/search, detention/gathering, incoming fire |
| `src/navigation.js` | Shared walking-grid cache and A* routes around obstacles, through doors and between stories |
| `src/kit.js` | Weapon/item/ammo catalogues, validation/migrations, inventory, equipping/holstering, armed classification |
| `src/equipment.js` | Knife and other melee/tools, picking gun, planted charges, thrown items, traps, blasts, flash and fire |
| `src/doors.js` | Shared door durability, damage, destruction and unlock-on-break behavior |
| `src/combat-input.js` | Independent primary/secondary mouse-button handling |
| `src/menus.js` | Loadout planning, map/enemy-count selection, carried inventory |
| `src/rules.js` | Settings schema, defaults, presets, validation and retired-preset migration |
| `src/audio.js` | Optional synthesized gunfire audio |
| `src/maps/` | Authored map data and map selection registry |
| `test/` | Pure gameplay/geometry/input regression tests |
| `docs/` | Design notes, verification screenshots and dependency-license snapshot |
| `public/` | Static files copied into production output, including the Three.js license |
| `scripts/licenses.mjs` | Installed-package license inventory generation |

## Maps and coordinate model

Three authored maps are registered in `src/maps/index.js`:

- **The quiet house:** original residence and courtyard retrieval mission.
- **The long house:** three successive interior partitions with a side inspection corridor for penetration comparisons.
- **Meridian Lodge:** two stories, twelve rooms plus hallways, a west stairwell, windows, locked entries and an upstairs archive.

Map/gameplay positions use `[x, z]` in metres. Three-dimensional positions use `[x, y, z]`, with Y up. Player height is stored separately in `playerY`; map doors, props, rooms, objectives and guards can have an `elevation`. Lodge stories are at 0 and 3.2 m.

Geometry, mission anchors and patrol paths are authored JavaScript data. There is no in-game map editor, imported-model floor-plan parser, or save/load of an active mission. Current maps supply eight patrol paths; planning supports 0–8 enemies. The scene is procedural, with rendering factories serving as the future boundary for GLB assets.

## Simulation and rendering architecture

`requestAnimationFrame` in `src/main.js` advances simulation with a capped delta, then renders and updates HUD state. Pausing, the tactical map, focus loss, and the default inventory behavior stop simulation. Mission simulation can run in Node tests without creating a DOM, WebGL renderer, or audio context.

The player moves along X/Z with axis-wise collision sliding and a radius allowance. Height comes from stairs, gravity and remaining floor support. Crouching changes both eye and collision height; there is no general jumping or free vertical movement. Projectile and visibility tests use three-dimensional axis-aligned bounds.

Thousands of structural pieces are drawn through a few material-grouped `THREE.InstancedMesh` batches. Piece state and instance indices remain aligned. Tactical/overhead views select a story; first person renders all geometry with normal depth occlusion. Destruction effects and tracers are temporary visual effects, not independent collision state.

Map switching disposes scene resources, input listeners and resize observers. A support graph cached by piece array removes disconnected structural clusters. Spatial cells reduce contact-candidate comparisons.

## Combat and materials

Player firearm bullets are hitscan rays; tracers are presentation. Shotguns issue multiple spread rays. Each firearm has a separate magazine, cadence, damage and reload duration. The M134 is automatic, uses a 300-round belt in this prototype, and blocks running while equipped.

Penetration combines the firearm budget, ammunition multiplier and velocity modifier. Hits are sorted along the ray; each crossed obstruction consumes budget and reduces damage. Solid core penetrates most, standard is intermediate, and hollow-point least. Headshots remain lethal when reached; body hits use the remaining damage.

| Material/target | Current penetration cost | Typical structural health |
| --- | --- | --- |
| Glass | 0.1; shatters on impact | One intact/broken pane state |
| Drywall skin | 1 | 1 per tile |
| NPC | 4 | 100 starting guard health |
| Timber wall stud | 4 | 4; wall plates use 6 |
| Wooden door | 3 | 120 by default; configurable per deployment |
| Particleboard floor sheet | 6 | 24 |
| Floor truss | 12 | 80 |
| Exterior masonry | Stops bullets; damage is blast-only | 10 per segment |

These are game-balance values, not a physical ballistics/structural model. Props stop player firearm rays. NPC incoming fire currently uses direct line-of-sight damage and tracers rather than a full NPC weapon/inventory/penetration simulation.

Explosive projectiles have simple velocity/gravity, a fuse, a radius and damage falloff. Character cover is evaluated before blast destruction. Walls/closed doors/floors block exposure; existing openings and breaches admit it. Glass and decorative concealment do not provide blast cover. Fire, flash, claymores and placed charges share the mission state and obstruction helpers.

The grenade currently uses 220 base damage, a 1.5 m full-damage inner radius, and falloff to a 4 m outer radius, scaled by the blast-damage rule.

The knife is a reusable close-range item. Rear attacks instantly kill without a noise or injury-radio alert; front attacks deal 55 damage and can leave a guard able to call backup. Body discovery is independent of attack sound.

Firearms resolve the nearest capsule per guard: head, chest, stomach, each arm, and each leg. Capsules follow active injury/gait poses or simulated ragdoll joints; each guard still consumes penetration/damage only once per ray. Leg wounds multiply movement speed by 0.48 (0.25 with both legs injured). Arm wounds change the pose and firing interval to 1.8 seconds (normally 0.8); both arms injured disable firing. Surviving chest/stomach hits incapacitate without a kill, with abdominal muscle forces producing a side curl. Death removes active pose forces, including on later head hits against grounded survivors. Generic lethal tool, blast, and fire damage also starts a ragdoll.

Body physics runs at 120 Hz, accumulating frame time (up to 0.25 seconds per call), with eight constraint/contact iterations per substep and a per-body broad phase against remaining structure, doors, windows, and props. Ground contact applies friction; no new dependencies or third-party assets were added. Physics pauses with the mission; bodies retain physical support until a floor is destroyed. There is no self/body/player collision, directional anatomical joint limiting, recovery, bleeding, or cross-deployment injury persistence. `scripts/npc-preview.html` is a development-only comparison fixture served by Vite; it is not a selectable mission mode or production build entry.

## Guard knowledge and movement

Guards use explicit patrol, investigation, pursuit, search, detention, gathering, stunned and incapacitated modes. Sight incorporates facing, obstruction, weather, posture and suspicion. Reports copy the observed location/elevation and expire; they do not continually read an unseen player's coordinates.

The navigation grid uses 0.65 m cells and height-aware edges. A* can route around walls, through authorized doors, across usable breaches, and along lodge stairs. Grid caches are rebuilt when destroyed structure or window state changes passability. Routes remain a coarse prototype, without formations, crowd avoidance or a complete arrest procedure.

Current response tuning lives in `src/guard-ai.js`: pursuit at 1.6 times patrol speed, investigation at 0.85, detention backup at 0.45, a 1.7 m detention distance, and a 2.6 m gathering distance. Last-known targets normally expire after 14 mission seconds without fresh information. Incoming damage, patrol speed, sight range and suspicion gain remain sandbox settings.

Held gear determines threat status. Holstering leaves owned/carried gear intact. Detention does not change the mission to a failed/captured state and does not disable input or inventory. A surviving injured guard calls immediately; visible bodies or damage to walls, floors, windows and doors also cause radio reports and investigation.

## Persistence and validation

| Storage key | Contents |
| --- | --- |
| `stealth-rules-v1` | Validated sandbox rules |
| `stealth-loadout-v1` | Planned weapon configurations and equipment quantities |
| `stealth-map-v1` | Selected authored map |

Rules export/import uses a versioned JSON envelope and schema validation. New catalogue entries have explicit migrations for older saved kits. Map/enemy-count/entry setup is applied on deployment; live settings are applied without secretly rebuilding the mission. Opening field inventory preserves supplies; its explicit Restock equipment & cash debug action refills all item quantities to catalogue maxima and restores support cash to the sandbox maximum ($10,000). Restock works in active or paused missions, preserves magazines/health/world state, and never rewrites the planned loadout.

The browser origin owns this storage. There is no synchronization, cloud backup, database, account authentication, multiplayer transport, or persistent campaign/injury state.

## Tests and verification

At this documentation checkpoint, 108 Node tests cover simulation, input chords, kit validation/migration, separate magazines, scoped/head hits, multi-layer penetration, blast cover, doors, wall support, lodge reachability, crouch, floor breaches, windows, picking, M134 movement restrictions, guard communication/navigation/detention, knife behavior, articulated injuries/ragdolls, glass-breaking tools/throwables, framing/body resistance, and repeatable equipment restocking.

Melee targeting includes intact window bounds so axe/crowbar hits shatter the nearest pane and other tools cannot act through it. Each throwable movement step sweeps window intersections in distance order, verifies solid cover to each impact, and shatters reachable panes before resolving ordinary solid collision. Grenades, flashbangs, and Molotovs retain their velocity and fuse through glass; only solid impact/landing triggers early Molotov ignition. `test/window-equipment.test.js` includes actual lodge windows on both stories, multiple panes per step, range/cooldown, and glass behind solid cover.

For UI changes, verify in a real browser as well: planning controls, deployment count, pointer capture/fallback, model visibility, posture, floor views, radio/detention feedback and readable HUD placement. Node tests do not render Three.js or validate actual browser input delivery. Screenshots in `docs/` record selected checks.

The tactical map owns the Intel Pulse purchase button and an explicit floor selector populated from the current map's stories. Single-story maps show a disabled Ground floor selector; multi-story maps also offer a next-floor button and F shortcut. The renderer exposes floor get/set access for the selector and retains automatic player-floor selection in first person. Pulses can be purchased while the map pauses simulation, cost $250, last ten simulation seconds, and cannot be repurchased during an active pulse. Closing the map hides its controls and restores the prior running/paused state.

## Assets and licensing

`package.json` currently marks the original project `private: true` and `UNLICENSED`. Three.js and Vite are recorded as MIT dependencies in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Three.js notice ships through `public/THREE-LICENSE.txt`; installed dependency identifiers are recorded in `docs/dependency-licenses.json`.

No third-party art, models, textures, fonts or audio are currently included. Geometry and audio are generated by the project's code. Preserve notices and record provenance as external assets or dependencies are introduced.
