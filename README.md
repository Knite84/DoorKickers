# Untitled stealth sandbox

A Three.js learning project: retrieve an archive from a small residence and escape, with first-person gunplay, an overhead view, and layered interior-wall destruction. The larger vision is a configurable planning and execution sandbox. The public name is undecided; **Door Kickers is already an existing tactical game**.

![Loadout and planning](docs/loadout-planning.png)

## Run it

Install Node.js 22.12+ (Node 24 works), then open a terminal in this folder:

```sh
npm install
npm run dev -- --port 5179 --strictPort
```

Open http://127.0.0.1:5179. Use a desktop keyboard and a WebGL2-capable browser. This prototype has no touch controls.

```sh
npm test
npm run build
```

The production build is in `dist/`. No backend, accounts, paid services, API keys, or AI connection are needed. The game makes no external network requests once served.

## Play

- First person is the default. Click the aim button to capture the mouse; Escape releases it and pauses. Click the aim button again to resume. If capture is unavailable, hold right mouse and drag to look, or use IJKL.
- WASD / arrows: move relative to the first-person facing direction; overhead movement uses world axes.
- Shift: toggle running on/off. Hold Ctrl or C to creep; creeping takes priority over running and lowers suspicion gain. C avoids browser Ctrl shortcuts.
- V: switch first person / overhead. M: open/close a top-down tactical map; the map pauses simulation and returns to your previous play view.
- Left mouse: use the equipped weapon/item. Hold for automatic rifle fire; other weapons fire once per click. First person aims at the crosshair; overhead aims toward the cursor at eye height.
- Tab: open/close inventory (or loadout planning before deployment). E: open/close a nearby door or collect the archive. Shift+Tab remains available for backward keyboard focus navigation in menus.
- 1–4: equip assault rifle, pistol, shotgun, sniper rifle respectively, if carried.
- R: reload. Each weapon has a separate magazine, firing cadence, damage, and reload time. Reserve ammunition is unlimited; magazine consumption is configurable.
- Z, or right click while mouse is captured: toggle aim. The sniper has a scope; scroll while scoped adjusts 2×–8× zoom. Without mouse capture, right-drag still looks around; Z aims.
- Left-click fires while aiming or scoped, including the first click before mouse capture succeeds. Head hits instantly eliminate a guard with every weapon, suppressor, velocity, and projectile choice. Body hits retain configured damage and wall obstruction still applies.
- Right and left mouse buttons are handled independently: keep right held while clicking left to fire a pistol or another single-shot weapon. Releasing right does not cancel held left-button rifle fire.
- B: detonate placed charges while the mission is running.
- Return to the green ring to extract.
- Space: pause/resume. Changing browser focus automatically pauses.
- Scroll over the overhead scene: zoom.
- Intel pulse: spend $250 to reveal every guard for ten mission seconds.
- Sandbox rules: change the simulation live. Entry point, guard count, budget, and door durability require **New deployment**.
- Rules persist in browser storage, with validated JSON import/export for sharing.

Wall breaching is part of the regular retrieval mission, with guards on patrol. Deploy normally and enter through the courtyard door, then breach the pale partition dividing the West Gallery from the Archive. Alternatively, select **Sandbox rules → Entry point → west gallery → New deployment** to start beside that partition in the same mission; this changes only your starting position, not guards, ammo, or difficulty. Shoot a patch to strip its front drywall, expose timber, break the framing, and clear the rear drywall. Sweep the opening wider and lower to make a walkable breach. A hole at eye height allows sight and shots but leaves lower collision intact. After bullets, tools, or blasts break wall pieces, any pieces or clusters disconnected from the floor and solid structure take full damage and disappear. Side or top connections can still support a piece; corner-only contact does not. New deployment rebuilds all walls and resets guard health. The former Breach lab preset and launch buttons have been removed; its unchanged saved settings migrate back to Recommended on reload.

Every visible setting is connected to this prototype. In overhead/map views, normal guard visibility requires proximity and line of sight; live tracking reveals positions through walls, and patrol-route intel is independent. First-person guards use normal 3D wall occlusion; use the map for tracking intel. Floor-plan intel currently controls the reference grid and room labels; overhead geometry remains visible. Fog reduces guard sight to 60%, rain to 85%. Damage immunity prevents health loss without removing suspicion. Walking through walls still respects map boundaries. Gunfire alerts nearby living guards for five mission seconds, turning them toward the shot source. Once suspicion fills, guards with sight of the player fire back. Damage and self-damage from equipment are configurable.

## Loadout and equipment (0.3)

### Maps and penetration

In **Loadout & planning → Map**, choose **The quiet house** or **The long house**. The long house adds three successive drywall-and-timber partitions, an inspection corridor around their south ends, and the regular archive retrieval objective with guards. Map selection persists separately from rules and applies when you deploy.

For a direct comparison, choose **The long house → Entry point → West Gallery · face three partitions**. You start facing east through all three walls. Select your firearm and projectile, deploy, and shoot. The message reports how many interior walls were hit; press M for the top-down map or walk around the south ends to inspect the exit-side damage. Tab changes ammunition in the field. Use **Sandbox rules → New deployment** between comparisons to restore intact walls. You can set patrol speed to zero for repeatable guard positions; guards and other settings remain configurable.

Penetration now depends on both firearm and ammunition: **solid core > standard > hollow-point**, and **sniper > assault rifle > pistol > individual shotgun pellet**. Subsonic reduces penetration to 85%. Each crossed drywall skin costs 1 penetration unit, timber or a wooden door costs 3, and a guard costs 2. Body damage drops 20% per crossed layer; head hits retain the existing lethal-headshot rule. Masonry and props stop rounds. These are abstract game balance values. Hollow-point has low penetration, rather than a guarantee against hitting someone beyond a thin layer. Friendly NPCs are not implemented yet.

For example, firing through stud-free bays in fresh walls at default settings, a standard pistol round stops in the first partition; a standard rifle round reaches the second; solid-core rifle rounds can cross all three. Hitting studs uses the penetration budget faster. Existing holes offer no resistance, so repeated shots can travel farther than the first one.

Choose **Loadout & planning** before deployment to configure entry, weather, carried weapons, starting weapon, suppressors, velocity, projectile type, and equipment quantities. Your planned kit is saved in browser storage separately from the sandbox rules. Gear is already owned and does not consume support funds. Guards remain part of the same mission.

During play, **Tab** opens and closes the carried inventory. Equip an item or weapon, adjust its suppressor and ammunition, then close inventory and left-click to use it. **E** interacts with the world. Inventory pauses by default; a sandbox rule can keep the mission running. It never replenishes consumables or magazines. Planning a new deployment rebuilds the stage and restores the quantities you selected before it.

- **Assault rifle, pistol, shotgun, sniper rifle:** distinct magazine sizes and firing behavior; the shotgun fires multiple spread pellets. The sniper has adjustable scope zoom.
- **Suppressor:** selectable on every weapon; reduces game alert distance and sound volume. Subsonic additionally reduces alert distance and damage. These are simplified hitscan modifiers, not a physical ballistics model.
- **Projectile types:** standard has medium penetration; hollow-point increases body damage with the lowest penetration and wall/door damage; solid core trades body damage for the greatest penetration through drywall, timber, wooden doors, and multiple guards. Firearm and velocity also affect penetration. Masonry and props stop rounds. Live ammo changes preserve the remaining magazine count.
- **Med kit:** restores 50 health, capped at 100; kept if you are already healthy.
- **Breaching axe / crowbar:** reusable close-range tools. Both can open doors and strike walls; the axe is stronger and louder.
- **Det cord:** an abstract placed breaching charge. Aim at a nearby interior wall or door to place it; B detonates placed charges. Clears nearby partition pieces and produces a local blast.
- **Claymore:** a directional, guard-triggered proximity trap with a short arming delay.
- **Grenade:** a thrown, fused blast with 220 base damage throughout the inner 1.5 game metres, falling to zero at 4 metres. At default blast strength, unshielded full-health guards within 2.5 metres die from one grenade. Blast strength still scales damage. It can also destroy nearby doors and partitions, and can hurt the player when self-damage is enabled. Solid masonry and surviving doors can provide cover.
- **Flashbang:** a thrown stun effect for guards with line of sight. Nearby players looking at the burst also get a brief visual flash.
- **Molotov cocktail:** creates a temporary fire patch that damages nearby guards and, when enabled, the player.

Explosives and fire can hurt the player; configure self damage or immunity in Sandbox rules. Equipment effects are deliberately coarse game systems. There is no crafting, real-world deployment modelling, structural collapse, or supply economy yet.

Wooden doors have 120 durability by default. Bullet hits accumulate damage, darken and crack the door, then break it into temporary splinters. Destroyed doors stop blocking movement, vision, and bullets, and cannot be closed again. New deployment restores them. **Breakable doors** toggles damage; **Door durability** sets their health on the next deployment. Bullets that break a door still stop unless their ammo can penetrate. Axes damage doors, crowbars pry them open, and placed charges can destroy them. Door destruction currently removes the whole leaf rather than making local bullet holes.

## Learn by changing it

1. `src/scene.js`: scene, orthographic camera, lights, geometry, materials, shadows, and render loop output. Change a material color or the camera position first.
2. `src/maps/courtyard.js`: walls, doors, rooms, props, objective, extraction, and patrol paths in metres. Try moving a wall or adding a prop.
3. `src/simulation.js`: movement, collisions, vision, suspicion, mission state, and interaction. Pure JavaScript with no rendering dependencies.
4. `src/rules.js`: one schema for defaults, settings UI, presets, and imported-value validation.
5. `src/main.js`: interface, keyboard input, persistence, and connecting the simulation to rendering.
6. `src/destruction.js`: layered wall geometry and 3D ray/box intersection. The same piece state drives the visuals, bullets, collision, and sight.
7. `src/weapons.js`: firing, hit resolution, damage, noise alerts, ammunition, and reloads. `src/audio.js` synthesises the original gunfire sound.
8. `src/kit.js`: weapon/item catalog, loadout validation, carried inventory, and magazine preservation. `src/menus.js` builds the planning and inventory dialog.
9. `src/equipment.js`: tool use, charges, thrown items, traps, flash, and fire. `src/combat.js` shares damage, alerts, and obstruction checks.
10. `src/doors.js`: shared door damage and destruction state, used by gunfire, tools, and blasts.
11. `src/combat-input.js`: independent mouse-button press/release handling so firing works while the aim button is held.

Art is procedural geometry created in this project. The rendering factories are the replacement boundary for future GLB assets; collision and mission data stay independent. No external models, fonts, textures, or sound files are included. No new dependencies were needed for the first-person/destruction milestone.

See `docs/DESIGN.md` for the vision, map-import path, and next milestones. Dependency licensing is recorded in `THIRD_PARTY_NOTICES.md`; original project code is not assigned an open-source license yet. A public GitHub repository can be created now; choose a license for your own game code before inviting reuse.

## Current limits

This is an early prototype, not the complete design. Guards patrol, react to noise, take damage, accumulate suspicion, and shoot, but do not chase or navigate dynamically. Retrieval allows lethal force; dedicated elimination objectives are not implemented. Interior partitions use coarse rectangular drywall tiles, segmented timber studs, and plates; they are a gameplay approximation. Exterior masonry is indestructible. Doors have whole-object damage, cracks, and break effects; they do not have localized holes or physical hinge simulation. No building collapse, armor, seasons, persistent injuries, teams, map editor, AI generation, saved campaigns, or gear economy yet. First-person movement is grounded, with no jumping or crouched-height collision. Assets and animations remain intentionally simple.
#   D o o r K i c k e r s  
 