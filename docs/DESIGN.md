# Design direction

## Promise

Preparation should change execution. Players define fun: meticulous infiltration, plentiful information, extravagant support, scarce cash with a large owned arsenal, or freely enabled fantastical technology. The recommended experience is a named preset, not a moral judgment about custom settings. Do not penalize players for customization.

## Rules as product architecture

- Keep world facts, player knowledge, resources, and assistance separate. Guard armor exists independently of whether the player knows about it.
- Keep starting money, recurring funding, and owned inventory separate. A wealthy sponsor and a broke collector are different scenarios.
- Separate intel channels: architecture, guard counts, identities, equipment, armor, alert posture, routes, routines, and live positions.
- Later allow each channel a precision, freshness, and completeness level. Full knowledge is a supported choice.
- Distinguish setup rules from live adjustments visibly. Avoid silent mission regeneration.
- Expose rule dependencies explicitly. Presets are starting points; allow overrides, export, and import.
- Add options when their underlying systems work. Never put a decorative slider in front of an unimplemented feature.
- Preserve a readable recommended preset and quick reset, so customization does not require learning every system.

The current schema demonstrates this with independently adjustable entry points, guard count, budget, weather, movement, patrols, sight, suspicion, map labels, route intel, live tracking, immunity, collision bypass, weapon damage, wall damage, destruction, gunshot alerts, ammo assistance, and gunfire volume.

## First mission

The Quiet House: one residence, a courtyard, an archive, extraction, doors, and patrols. First person is the primary view; an overhead view remains playable, and a pull-up tactical map pauses simulation. Retrieval supports either stealth or lethal force. Future objective types can include target elimination, multiple targets, sabotage, rescue, and optional no-kill constraints. Fictional mission text should describe outcomes and game interactions.

## Destruction milestone (0.2)

Destructible partitions contain two independent tiled drywall skins, segmented timber studs, and top/bottom plates. Rendering, hitscan, sight, and player collision derive from the same remaining pieces. Removing a high patch creates a firing/viewing aperture; clearing a wide opening down toward the floor creates a route. After destructive damage, a cached face-contact graph traces surviving pieces to floor or solid masonry anchors. Disconnected islands take full damage and disappear immediately, even when their pieces still touch each other. Valid top and side attachments preserve pieces; point/corner contact is insufficient. This is deterministic support checking rather than falling-rubble physics or structural engineering. Exterior masonry resists bullets and tools but is segmented for explosive breaching. Props remain solid. Decorative chips have short lifetimes and no gameplay collision. Changing art later must preserve these gameplay bounds.

Gunfire includes a procedural viewmodel, recoil, tracers, debris, generated audio, ammunition, reloads, guard damage, and short directional alerts. Breaching is an ordinary option within the retrieval mission and does not require a dedicated mode. An optional West Gallery entry point changes the start position while preserving all other rules and guards. The former Breach lab preset and launch flow were removed. Hold Shift to run; Ctrl holds creep and C toggles crouch; both override running and reduce detection. Future work should improve irregular damage edges, cover awareness, and coordinated guard cover use. Guard navigation through doors, breaches, and stairs is implemented.

## Loadout milestone (0.3)

Planning precedes deployment, with entry, weather, carried kit, starting weapon, attachment/ammunition choices, and item quantities. Owned gear remains independent of support money. Tab toggles inventory; E interacts with the world. Inventory pauses by default, with a configurable live-inventory option. Equipping a different gun preserves its magazine; changing ammo or suppressors does not replenish ammunition. Item quantities can be chosen in planning but cannot be increased through field inventory.

Five firearms have independent body damage, capacity, cadence, and reload behavior. Headshots instantly eliminate a guard regardless of weapon, suppressor, velocity, projectile choice, or damage reduction from penetration. Walls still obstruct shots according to ammo penetration rules. Shotguns use spread pellets; sniper aiming has 2×–8× scope zoom. Left-click firing works during aimed and scoped views, and right-drag aiming continues while the left button is held when mouse capture is unavailable. Velocity and projectile selectors are separate. Subsonic, hollow-point, and solid-core choices have deliberately abstract gameplay effects. Penetration uses a finite budget through soft partitions and guards, with damage loss after each obstruction. Suppressors lower alert distance rather than guaranteeing silence.

Med kits, reusable axe/crowbar tools, remote breaching charges, directional proximity traps, grenades, flashbangs, and temporary fire patches work in the regular mission. Grenades have a full-damage inner area and distance falloff so close blasts are lethal at recommended settings, with cover and blast modifiers respected. Doors accumulate damage from bullets, axes, and blasts, visibly crack, then break and clear their collision and sight obstruction. Broken doors cannot be closed; new deployments restore their configurable durability. Solid-core ammunition can penetrate wooden doors. Guards now damage player health after acquiring visual suspicion; zero health ends the stage. Incoming damage, equipment self-damage, blast strength, door damage/durability, and immunity are sandbox rules. Injury persistence beyond a deployment, death penalties, recovery, retries, and campaign persistence should each have configurable consequences.

## Map architecture and future floor-plan import

Versioned data describes geometry, room semantics, interactables, routes, and mission anchors. Gameplay uses metres on the X/Z plane with Y up. Art is presentation; collision shapes are explicit. A later editor should support wall drawing, door placement, room labels, prop palettes, spawn/extraction placement, undo/redo, and map validation.

Floor-plan import path:

1. Load an image/PDF in a local editing surface.
2. Set scale from a known dimension.
3. Propose walls, doorways, and rooms, with uncertain geometry marked for review.
4. Let the user correct geometry before producing a 3D cutaway.
5. Validate reachable entries, objectives, routes, and extraction.
6. Ask conversational questions about the fictional scenario, then propose mission and patrol data.
7. Preview and edit the proposal before committing it to the map.

AI should produce constrained, validated data, not arbitrary executable game code. Keep source floor plans local by default. Any future cloud-assisted analysis needs an explicit choice of what to upload and where. A real home's address is unnecessary for geometry generation.

## Assets and licensing

Use self-authored procedural geometry first. Guards now have shared articulated simulation joints and anatomical hit capsules with procedural segment meshes. Leg injuries affect gait/speed, arm injuries affect pose/firing, chest and stomach hits can incapacitate surviving guards, and deaths release gravity-driven ragdolls. Abdominal survivors actively curl onto a side. World contacts use remaining structural geometry, including breached upper floors. Injury recovery, self/body collision, production joint limits, and cross-deployment persistence remain future work. Replace with modular GLB props and rigged characters later. Keep scale, origin, forward direction, collision bounds, attachment points, and animation names documented when that pipeline is introduced. Maintain provenance per acquired asset.

Prefer MIT/ISC/BSD/Apache-2.0 software dependencies and CC0 art, with required notices preserved. Avoid noncommercial-only, editorial-only, and unclear asset licenses. A permissive dependency does not set the license for our original game. No purchased asset packs or subscription services are required.

## Milestones

The selectable Long House map adds three successive layered partitions and a south inspection corridor in a normal retrieval mission. Penetration uses firearm-specific budgets multiplied by ammunition and velocity: solid core penetrates most, standard sits between, and hollow-point penetrates least. Each crossed layer or NPC consumes budget and reduces body and wall damage. NPCs currently cost the same as one drywall skin. The M134 adds rapid automatic fire and blocks running only while equipped. Future friendly NPCs should use the same shot path and obstruction rules so overpenetration remains consequential.

1. **Playable spatial loop — implemented:** movement, collision, doors, patrols, sight, retrieval, extraction, adjustable rules, sharing, procedural art. The 0.2 iteration adds first person, view switching, a pull-up map, basic gunplay, layered partition destruction, and run/creep controls.
2. **Planning and richer behavior — in progress:** 0.3 implements loadout planning, carried inventory, weapon/item selection, scoped aiming, health, guard gunfire, and equipment effects. Investigation, shared sightings, pursuit, non-restrictive detention, backup calls, and visual evidence discovery are implemented. Richer intel channels and more interaction feedback remain.
3. **Mission sandbox:** objective types, expanded fictional combat, selectable constraints, more support tools, optional injury persistence, world presets and time of day.
4. **Build your space:** in-game map editor, JSON save/load, reachability checks, undo/redo, then assisted floor-plan tracing.
5. **Campaign and polish:** schedules, seasons, recoveries, multi-mission persistence, selected destruction, replaceable production assets, animation and audio.

Each milestone should remain playable. Learning should involve small explained changes inside these larger steps, not an opaque generated engine.
