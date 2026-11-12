# Handoff: Martelli furnished and finished; polish plan next

Updated 2026-11-11 after furnishing the whole house, for a fresh session; on 2026-11-12 the lighting and trim hold was lifted and `docs/POLISH_PLAN.md` was added. Read this first, then `docs/POLISH_PLAN.md`, `references/README.md` (local only, git-ignored) and `docs/DESIGN.md`.

## State of the repo

- **Polish step 3.2 gives the furniture its own finishes.** Wood, woven fabric, leather, stone, painted cabinets, brushed metal, ceramic, glass, and mirrors use different materials. Opaque parts share batches by material, shape and floor. Martelli’s 996 furniture parts produce 112 render objects before culling. Chrome verified the furniture preview and game camera and vision transitions. Foreground frame time is still unverified. [Kitchen cabinet preview](martelli-furniture-materials.jpg)

- **Polish step 3.1 adds relief and roughness to existing finishes.** Plank joints and grout use the same layout as the color texture. Carpet pile, paint and siding use relief derived from their generated patterns. The furniture preview’s Finishes view has a moving light and a relief toggle. Chrome verified the swatches, in-game exterior, and camera and vision transitions. [Color only](martelli-finishes-before.jpg) · [With relief](martelli-finishes-after.jpg)

- **Polish step 2.4 adds dusk.** Day, Dusk and Night are available in mission planning. Dusk lowers and warms the sun, changes the sky and exposure, and turns on porch lights when the building has power. Fog and rain dim the light and have their own sky colors. Guard sight uses the time-of-day light weights when its darkness check applies. Chrome verified dusk and the camera and vision transitions. [Martelli at dusk](martelli-dusk.jpg)

- **Polish step 2.3 updates the live light field.** Martelli checks doors and surviving structure when baking light. After the first capture, geometry and fixture changes rebake the columns that could receive affected light. The bounds are conservative and cover both floors. Updates publish together for rendering and guard sight, and power cuts apply immediately. The mission card shows “Capturing light…” during the initial live bake. An interior comparison and foreground timing remain open. [Browser smoke test](martelli-live-light.jpg)

- **Polish step 2.1 approved.** The [lighting proposal](POLISH_PLAN.md#proposed-implementation) covers the shared light grid, power, geometry updates and guard sight.
- **Polish step 2.2 adds 40 Martelli fixtures.** Ceiling fittings, table lamps, vanity lights and porch lights share the building circuit. Chrome verified the tactical power cut and camera and vision transitions. [Power on](martelli-fixtures-on.jpg) · [Power cut](martelli-fixtures-off.jpg). Ceiling styles and porch placements are room-based approximations and still need a photo comparison.

- **Polish step 1.5 has a fitted sun shadow camera.** Each map uses its structure to set a fixed light-space frustum. The quality presets tune filtering and bias to the shadow texel size. The geometry test covers all maps. Chrome showed the Martelli exterior and switched through the camera and vision modes. [Before](martelli-post.jpg) · [After](martelli-shadows.jpg). The filter uses a fixed radius per preset. Distance-dependent penumbra and an interior shimmer check remain open.

- **Polish step 1.4 is implemented and awaiting performance verification.** Medium adds bloom and SMAA in normal first person. High also adds half-resolution contact shadows. Low, overhead, tactical, night vision, and thermal use direct rendering. Chrome verified preset switching and those view transitions. [Before](martelli-sky.jpg) · [High](martelli-post.jpg). The exterior comparison shows the render paths. Interior contact shadows, per-effect timing, and the 1080p 60 fps target still need a foreground check.

- **Polish step 1.3 implemented.** Normal first person has a procedural sky with weather and night palettes and a reflection map generated when the palette changes. The sky adds one draw per normal first-person frame. Chrome showed the clear and rain palettes and switched through both goggles and the overhead and tactical views. [Flat sky](martelli-tone-after.jpg) · [Procedural sky](martelli-sky.jpg). Interior material reflections and foreground timing remain to be checked.

- **Polish step 1.2 is ready for an interior playtest.** Normal first person uses AgX tone mapping and a saved exposure slider under Sandbox rules → Graphics. Clear daylight uses a softer sun and slightly brighter ambient light. Chrome confirmed the slider and camera and vision transitions. [Before](martelli-tone-before.jpg) · [After](martelli-tone-after.jpg). The screenshots show the exterior spawn. Interior window highlights and shadow detail still need a walkthrough.

- **Polish step 0.1 approved.** The lower family-room sectional moved 0.4 m east to clear the wet-bar pier, and all six dining chairs tucked in 0.3 m to open the passage toward the great room. A regression test walks both gaps in both directions. See [before](martelli-walkability-before.jpg) and [after](martelli-walkability-after.jpg) for the sectional.
- **Polish step 0.2 is ready for layout review.** The furniture preview has a clearance overlay, and the tests record current 0.35 m-radius reachability. The [audit in the polish plan](POLISH_PLAN.md#martelli-audit-for-review) lists the routes that need review and the staircase and room-access findings.
- **Polish step 1.1 implemented.** Sandbox rules now has Graphics presets and an optional performance readout. Chrome verified live resolution changes, saved settings and stats in all three cameras. The [rendering baseline](POLISH_PLAN.md#11-frame-time-readout-and-quality-presets) records eight-guard draw counts. Foreground frame timing at 1080p is pending.
- **The furniture kit is built and every room is furnished.** Check `git status` for anything uncommitted. Kit: `src/furniture.js`, `src/furniture-mesh.js`, `test/furniture.test.js`, `scripts/furniture-preview.html`. Placements: `src/maps/martelli.js`, using `furnish(kind, variant, x, z, facing, size, options, elevation)` in plan pixels, grouped by room with comments.
- **Materials step done (floors and walls).** `src/surface-plan.js` (pure data rules, tested in `test/surfaces.test.js`), `src/surface-textures.js` (textures drawn on canvases from fixed seeds: bamboo, carpet, grey wood-look tile, grey tile, beige stone tile, pale plank tile, vinyl plank, concrete, deck boards, paint, lap siding), `src/surface-materials.js` (world-space shader patch on the batched wall and floor pieces). Martelli declares `surfaces` (floor finish rectangles per room), `paint` (wall colour per room name) and `paintZones` (the yellow and blue accent walls, cream vanity alcoves). Exterior walls get siding on the outside face only. Maps without `surfaces` are unchanged. The preview page's **Show → Finishes** shows every texture at real scale.
- **Owner's direction (2026-11-12): the hold on lighting and trim is lifted.** The next work is `docs/POLISH_PLAN.md`, taken one numbered step per session, starting with Phase 0 (walkability: the family-room sectional and the dining chairs block routes). Not textured yet: furniture (still flat colours), ceilings and doors. Every exterior wall, including the garage and the walk-out foundation, gets the same grey siding; brick and retaining walls are not modelled.
- Rooms done, in order: upstairs bedroom wing; family room and wet bar; baths and laundry; Bedrooms 4 and 5; gym and utility room; kitchen, dining and great room; entry and deck.
- Map changes made along the way (beyond furniture):
  - The wet bar's full-height north wall became the kit's brick half wall with the bar top.
  - New walls split the old open lower "UTILITY / STORAGE" area into a **gym** (double doors) and a **utility room** (mechanical door). The owner confirmed this layout. The **archive objective moved into the utility room** (plan 1150, 590); the retrieval test route goes through the mechanical door.
  - Kit additions: corner and stone wall fireplaces, mirrored L sectionals, dresser `options.tv`, shower `options.side`.
  - All old placeholder props (tables, crates, beds) are gone.
  - Guard data moved off furniture: patrols (480,470)–(600,470), (985,180)–(1090,180), (1045,620)–(1140,620), (1030,575)–(1140,550); posts 'great room' (470,460), 'kitchen' (312,450), 'family room' (440,300), 'rear deck' (478,145), 'archive' (1150,590).
- Not placed: the main-hall flush linen cabinet (location not confirmed) and the family-room ladder shelf (no photo shows where).
- Trade-offs made while placing, for the owner to overrule:
  - The primary-bath window sits over the tub deck, so it is now **not climbable** (like the stairwell window). Climbable windows: **14**; `test/ceilings-windows.test.js` updated.
  - Left out for space or door/window clearance: the inventory's second primary-bedroom dresser (the photos show one dresser with a TV, plus the tall chest), Bedroom 2's nightstand and dresser, and Bedroom 3's nightstand. Bedroom 2's desk is 1.0 m and sits just south of the closet door's landing; Bedroom 3's bunk is 2.0 m and its desk 0.75 m and a little north of the corner, so the corner window stays climbable.
  - The Bedroom 3 patrol starts at plan x 1045 instead of 1030, clear of the cube bookcase. Walking routes in `test/martelli.test.js` moved slightly off the new furniture (primary bedroom x 775, bath x 295, Bedroom 3 x 1045, its closet z 420).
- The preview page's **Show** menu now has "Martelli · Main" and "Martelli · Foundation": the real walls cut at 1.6 m with every placed piece (red windows are not climbable). In the console, `preview.view(x, z, height)` frames a map point in metres.

## Done: the furniture kit (kept for reference)

1. **New module `src/furniture.js`.** Each component is a function that returns a list of coloured boxes plus a collision height, with size variants and a facing so a piece can sit against a wall.
2. **Map entries stay plain:** what, where, how big, which way. A model can replace the drawing later without touching the map. Existing `table`, `crate` and `planter` props on other maps must look and collide exactly as before.
3. **Collision stays one box per piece.** An L- or U-shaped sectional is two or three pieces. Rugs, wall TVs, mirrors, ceiling fans and the yoga mat are drawn only and must not block movement, shots or guard paths.
4. **Preview page `scripts/furniture-preview.html`**, in the style of the other `scripts/*.html` pages, showing every component side by side. Show it to the owner before filling the house.
5. **Place room by room, in this order:** bedroom wing (best photo coverage), family room and wet bar, baths and laundry, utility and gym, then kitchen, dining and great room.

**Owner's answers on placement order (2026-11-11):**
- "Bedroom wing" means the **upstairs**: master suite (bedroom, bath, closet), bedrooms 2 and 3, and their shared bath. Bedrooms 4 and 5 go with the lower level.
- Powder room and lower-level bath go with "baths and laundry"; entry bench, entry rug and the main-hall linen cabinet go with the kitchen/great-room step; deck furniture comes last.
- The under-stair cubby stays closed.
- Furniture blocking sight and shots by its one collision box (a sofa is crouch cover; tall pieces block fully) is fine for now; the owner may tune it later.

### Using the kit

- A kit map entry is `{ kind, variant, position, size, facing, elevation, options }`. `size` is the **world-axis footprint**, like every prop, so collision code is unchanged. `facing` is where the front points on the floorplan: `down` (default, +z), `up` (-z, lake side), `left`, `right`; the back goes against the wall.
- Author entries with `piece(kind, variant, position, { size: [width, depth], facing, elevation, options })`, which takes the piece's own width x depth (default: the variant's size) and turns it into the world footprint. `sectional('L' | 'U', position, { size, facing, variant })` returns 2 or 3 ordinary sofa pieces.
- Collision height comes from the variant through `propHeight` in `src/world.js` (an explicit `prop.height` still wins). `table`, `crate` and `planter` are not kit kinds and are unchanged. The legacy `bed` entries are now drawn by the kit's queen bed but keep their 0.6 m collision.
- Drawn-only kinds (`rug`, `yogaMat`, `wallTV`, `mirror`, `ceilingFan`) go in a new `map.decor` list, never `map.props`; a test fails if one lands in props. The scene draws `map.decor` per floor and hides ceiling fans in the overhead view. Martelli has no `decor` list yet; add it to the export when placing.
- Kit drawing choices to know about: the tub/shower alcove collides as the tub only (0.55 m); the walk-in shower is a 2 m box, so its glass blocks sight; upper cabinets, mirrors and lamps are drawn above the collision box and do not block.
- Preview: `npm run dev`, then open `/scripts/furniture-preview.html`. It has a facing switch, a focus list for each piece, collision frames, and a yellow line marking the wall behind each piece.

After the kit, the agreed order continues: **materials** (wood floor, carpet, tile, siding, brick as textures generated in code; photos are colour and pattern references only and are never shipped), then **lighting** (softer ambient, warm lamps, sky), then **trim** (baseboards, door frames, window casings, pitched roof). Imported models (glTF) are deferred; static props stay procedural.

### Photos not yet looked at

The owner added photos after the inventory below was made. View these before placing the rooms they cover: **kitchen, dining, garage, front porch, the patio under the deck, and a second great-room photo showing the TV and fireplace wall.** List `references/` to find them; they are named by room.

### The owner's decisions

- **Gym:** no machines. Leave it empty except a TV on the wall and a yoga mat in the middle of the floor.
- **Garage:** ignore all contents. Build only its walls and stairs from the new photos.
- **Lower storage:** ignore it and wall it off.
- **Bedroom 4's hall door** is already in the right place. Leave it.
- **Bedroom 5** is modelled as it is used: an office with a daybed.
- **Master bath:** the shower is next to the tub, behind the glass door, beside the far vanity. The toilet closet is the other door off the bath; on walking in, the toilet is to the left.
- **Kitchen, dining, front porch, patio, great-room TV and fireplace wall:** take them from the newly added photos.

## Working agreement with the owner

- For open-ended work, report findings and a short proposal first and wait for a go-ahead. Clearly scoped fixes can be done directly. The furniture kit plan in this document already has that go-ahead.
- The owner knows the real house and can answer anything the plans or photos leave unclear. Ask rather than guess on layout.
- The owner is new to game development and wants the game to stay a simple browser game with no asset pipeline.
- Keep `npm test` green. It was 197 passing on 2026-11-11 and takes about 2 seconds.
- Commit before any history-rewriting git command. A previous rewrite reset the working tree and lost uncommitted work.

## Privacy

- `references/` (floorplans, photos, its README) is git-ignored and was removed from history. Never re-add it, and never copy photo content, file names with locations, or EXIF data into tracked files.
- Tracked files may describe rooms and furniture generically. The map name and the screenshots under `docs/` are already public.

## How the Martelli map is built

File: `src/maps/martelli.js`. Everything is authored in **main-floorplan pixels** and converted by `point(x, z)` at 0.02 m per pixel, origin at pixel (600, 500). Plan-up is the lake side.

- `h(z, x1, x2, openings, elevation, exterior)` and `v(x, z1, z2, …)` draw axis-aligned walls. Openings are `door(at, width)`, `win(at, width)` or `gap(at, width)`.
- `rail(axis, fixed, lo, hi)` draws a 1 m guard rail (blocks movement, not sight).
- Main floor is elevation 3.2; Foundation is 0.
- The foundation drawing is about 4% smaller than the main one. Use `fx(x)` and `fz(z)` to convert **foundation-plan pixels** into map pixels.
- `room(name, x1, z1, x2, z2, elevation)` adds a map label only.
- `prop(kind, x, z, width, depth, elevation)` adds furniture; `bed(...)` adds a low bed.
- `posts` near the bottom lists where guards stand. `navCell: 0.2` gives guards a fine walking grid; interior doors are only 0.8 m wide.
- Walls must be axis-aligned. Angled features (dining bay, corner fireplace, the angled mechanical-room door) are squared off.

A useful trick from this session: crop and upscale regions of the plan images into the scratchpad to read door swings and labels, then express coordinates in plan pixels.

## How props work today, and what the kit needs

- A prop is `{ kind, position, size: [width, depth], elevation, height? }`. Kinds: `table`, `crate`, `planter`, `bed`.
- **Collision is one box per prop.** Its height is `propHeight(prop)` in `src/world.js`: `prop.height`, else 1.1 m. That one function feeds movement, shots, cover, guard pathfinding, window climbing and ragdolls, so a new kind only needs a sensible `height`.
- **Drawing** is in `src/scene.js` in the `for (const prop of map.props)` loop: a few coloured boxes per kind. The `bed` branch is the model to copy.
- Other maps use `table`, `crate` and `planter`; do not change how those look or collide.

Recommended shape for the kit: a new module (for example `src/furniture.js`) that maps each kind to a list of boxes and a collision height, with the scene loop calling it. Add an optional facing so pieces can sit against a wall. Keep the map entry a plain description (what, where, how big, which way) so a model can replace the drawing later without touching the map.

Things to respect when placing furniture:

- Guard posts and the eight legacy `patrols` points must stay clear of props. `test/guard-variation.test.js` and `test/martelli.test.js` check this.
- Test walking routes in `test/martelli.test.js` pass through specific points; a prop on a route fails the test. Move the route in the test if the furniture is right.
- Doors need a clear landing on both sides, and the 15 climbable windows need clear ground inside (`test/ceilings-windows.test.js` requires exactly 15).
- Beds currently float mid-room with headboards on the lake side; reposition them from the photos.

## Furniture inventory from the photos

Sizes are eyeball estimates in metres, width x depth x height. Positions are relative; check each against the photos and floorplans when placing.

**Great room (main):** U-shaped light grey sectional 3.4 x 2.8 x 0.9 with chaise, facing away from the window wall. Blue armchair 1.3 x 1.0 x 0.9 with its back to the kitchen. End table with lamp 0.5 x 0.5 x 0.6 by the window. Area rug 3 x 4. TV and fireplace wall: see the new photo.

**Kitchen and dining:** seen only in the background so far; confirm from the new photos. Island about 2.6 x 1.1 x 0.95 with 3 bar stools on the great-room side. White base and upper cabinets on the back wall, range and hood centred, fridge and tall pantry cabinet at the left end. Dining table about 2.0 x 1.0 x 0.75 with 6 chairs in the window bay.

**Entry and stair head:** bench with shoe shelf 1.2 x 0.4 x 0.5 against the stair guard; entry rug.

**Screened deck:** outdoor sofa 1.9 x 0.8 x 0.8 against the house wall, 2 armchairs 0.8 x 0.8 x 0.8, coffee table 1.0 x 0.6 x 0.45, plant stand, ceiling fan.

**Master bedroom:** king bed 2.0 x 2.2 x 1.3 with upholstered headboard, centred on the wall beside the bath door. 2 nightstands 0.7 x 0.45 x 0.65 with lamps. Bench at the bed foot 1.3 x 0.4 x 0.5. Low dresser 1.6 x 0.5 x 0.85 with TV on the wall opposite the bed. Tall chest 0.9 x 0.5 x 1.3 beside it near the hall door. Second dresser with TV near the window wall.

**Master bath:** 2 single vanities 1.5 x 0.55 x 0.9. Tall linen cabinet 0.6 x 0.55 x 2.1. Drop-in tub in a tiled deck 1.8 x 1.1 x 0.55 in an arched alcove under a window. Walk-in tiled shower 1.2 x 1.2 with glass door. Toilet in its own closet. Layout as in the owner's decisions above.

**Master closet:** rod-and-shelf runs on 3 walls; 2 white cubby towers 0.6 x 0.35 x 2.1.

**Laundry:** washer and dryer on pedestals, each 0.7 x 0.8 x 1.3. Base cabinet with utility sink 0.9 x 0.6 x 0.9, upper cabinets, hanging rod.

**Main floor bath (powder):** toilet; small vanity 0.75 x 0.5 x 0.9; oval mirror.

**Main hall:** flush built-in linen cabinet about 0.9 wide, full height.

**Bedroom 2:** queen bed with shelf headboard 1.6 x 2.1 x 1.1 on the yellow accent wall. Nightstand. Desk with hutch 1.5 x 0.6 x 1.5 and chair. Low bookcase 0.9 x 0.3 x 0.8. Dresser by the door. Vanity alcove 1.2 x 0.55 x 0.9 with mirror. Walk-in closet with rods.

**Bedroom 3:** bunk bed, twin over full, 2.1 x 1.5 x 1.7 with end ladder, on the blue accent wall. Nightstand 0.45 x 0.4 x 0.65. Small desk 0.9 x 0.5 x 0.75 and chair in the corner by the window. Cube bookcase 1.5 x 0.4 x 1.1 on the wall by the vanity opening. Vanity alcove 1.8 x 0.55 x 0.9, single sink. Closet: rods on 2 walls, dresser 1.4 x 0.45 x 0.8, toy chest 0.9 x 0.5 x 0.45.

**Shared bath (bedrooms 2 and 3):** tub/shower alcove 1.5 x 0.8; toilet in a side nook; no sink (the sinks are in each bedroom's vanity alcove).

**Family room (lower):** L-shaped leather sectional 3.6 x 3.0 x 0.95 floating mid-room, facing the TV wall. Media console 2.2 x 0.45 x 0.7 with a TV about 2.1 wide. Corner fireplace (see architecture below). Floor sofa 1.7 x 1.0 x 0.7 and a child's armchair in the nook by the stairs. Ladder shelf 0.6 x 0.35 x 1.7. Wet bar: back counter about 3.5 x 0.6 x 0.9 with sink and upper cabinets; raised bar top about 3.2 x 0.4 x 1.1 on a painted-brick half wall with 4 stools; beverage fridge 0.6 x 0.6 x 0.85.

**Bedroom 4:** queen platform bed 1.6 x 2.1 x 0.5, no headboard, on the long blank wall. Nightstand with lamp. Glass desk 1.2 x 0.6 x 0.75 and chair by the window. Dresser 1.5 x 0.5 x 0.85 opposite the bed. Bookcase 0.8 x 0.3 x 1.8 between the bath and closet doors. Closet: empty double-rod walk-in. En-suite bath: vanity 0.9 x 0.55 x 0.9, toilet, tub/shower 1.5 x 0.8.

**Bedroom 5 (office):** twin daybed 2.0 x 1.0 x 0.8 along the wall beside the door. Executive desk 1.8 x 0.8 x 0.75 and office chair floating near the window. Closet: rods, tall cabinet 0.55 x 0.45 x 1.4.

**Lower level bathroom:** vanity 0.9 wide; toilet; tub/shower.

**Gym:** wall TV and a yoga mat only (owner's decision). Entered through double doors.

**Utility room:** furnace 0.6 x 0.8 x 1.5, water heater 0.5 diameter x 1.5, plastic shelving 0.9 x 0.45 x 1.8, stacked totes.

### Component list for the kit

| Component | Variants and typical size | Count |
|---|---|---|
| Bed | king 2.0 x 2.2, queen 1.6 x 2.1, twin daybed 2.0 x 1.0, bunk 2.1 x 1.5 x 1.7 | 1, 2, 1, 1 |
| Nightstand (optional lamp) | 0.5–0.7 x 0.45 x 0.65 | 5 |
| Dresser | low 1.5 x 0.5 x 0.85, tall chest 0.9 x 0.5 x 1.3 | 5, 1 |
| Desk and desk chair | 0.9–1.8 x 0.5–0.8 x 0.75; chair 0.6 x 0.6 x 1.2 | 4 each |
| Bookcase | tall, low, cube, ladder; 0.6–1.5 x 0.3–0.4 x 0.8–1.8 | 4 |
| Sectional sofa | L or U, about 3.5 x 3.0 x 0.9 | 2 |
| Small sofa / armchair | 0.8–1.9 x 0.8–1.0 | 6 |
| Bench | 1.2 x 0.4 x 0.5 | 2 |
| Coffee / end table | 0.5–1.0 | 2 |
| Media console with TV | 2.2 x 0.45 x 0.7 | 1 |
| Wall TV (drawn only) | about 1.2–2.1 wide | several |
| Bar stool | 0.45 x 0.45 x 1.0 | 7 |
| Kitchen island | 2.6 x 1.1 x 0.95 | 1 |
| Cabinet run | base 0.6 deep x 0.9 high; uppers 0.35 deep | 3 runs |
| Dining table and chairs | 2.0 x 1.0, 6 chairs | 1 |
| Fridge | full 0.9 x 0.8 x 1.8, under-counter 0.6 x 0.6 x 0.85 | 1, 2 |
| Bathroom vanity with mirror | 0.75–1.8 wide x 0.55 x 0.9 | 7 |
| Toilet | 0.5 x 0.7 x 0.75 | 5 |
| Tub/shower alcove | 1.5 x 0.8 x 2.0 | 3 |
| Soaking tub in deck | 1.8 x 1.1 x 0.55 | 1 |
| Walk-in shower | 1.2 x 1.2 | 1 |
| Tall linen cabinet | 0.6–0.9 x 0.55 x 2.1 | 2 |
| Closet rod-and-shelf run | 0.35 deep, at 1.0 and 1.7 high | 5 closets |
| Cubby tower, toy chest, tall cabinet | assorted | 2, 1, 1 |
| Washer, dryer | 0.7 x 0.8 x 1.3 | 1 each |
| Furnace, water heater | see utility room | 1 each |
| Storage shelf with totes | 0.9 x 0.45 x 1.8 | 1 |
| Rug, yoga mat (drawn only) | rug 3 x 4 | 2 rugs, 1 mat |
| Ceiling fan (drawn only) | 1.3 diameter | 4 |

### Surfaces (for the materials step)

- **Great room, kitchen, entry, main hall, powder room:** striped amber bamboo floor with dark streaks, cream-greige walls, tall white baseboards, wide white casings. The great room ceiling is vaulted.
- **Kitchen:** white cabinets, dark mosaic and white subway backsplash, granite counters.
- **Master bedroom:** beige carpet, dark charcoal-teal walls, tray ceiling. **Master bath:** grey wood-look tile, tan walls. **Laundry:** grey tile.
- **Bedroom 2:** beige carpet, grey walls, one yellow accent wall. **Bedroom 3:** the same with a bright blue accent wall. **Shared bath:** beige stone-look tile, navy walls.
- **Family room:** beige carpet, with pale wood-look plank tile at the bar, the walk-out door and the arched alcove; cream walls, painted taupe brick.
- **Bedroom 4:** beige carpet, off-white walls. **Bedroom 5:** beige carpet, navy walls. **Lower baths:** beige stone-look tile.
- **Gym:** warm wood-look vinyl plank, cream walls. **Utility:** bare concrete, open studs and joists.
- **Deck:** brown composite boards, grey siding, dark screen frames.
- Doors throughout are white two-panel with dark bronze levers.

### Architecture the photos show that the plans do not

- **Stair guard at the entry:** wood newels and handrail with black iron balusters, about 0.95 high. The lower flight runs between walls, carpeted, with a window above the landing.
- **Family room fireplace:** diagonal in the corner between the window wall and the TV wall; painted brick to the ceiling with a raised hearth. Walls must be axis-aligned, so square it off.
- **Wet bar:** entered through a wide painted-brick arch; a brick half wall carries the raised bar top facing the room.
- **Arched alcove beside the lower stairs**, about 1.2 x 1.2, tiled.
- **Under-stair nook:** sloped soffit and a half-height cubby door into a crawl space. Whether the cubby should be playable was not asked; treat it as closed.
- **Kitchen** opens to the great room through a wide cased opening; **dining** is a bay of tall windows.
- **Window walls:** paired large windows on the lake side of the great room and family room; the master has a large window plus a glazed door to the deck.
- **Bedrooms 2 and 3** each have a vanity alcove leading into the shared tub and toilet room.
- **Deck:** screened and roofed with a metal picket rail, doors from the great room and the master, and a screen door to exterior stairs with a mid landing. It stands on posts over a covered concrete patio with a lower walk-out door.
- **Outside:** brick-capped retaining walls step down both sides; iron fence.

## Known gaps in the Martelli map

- Great-room window wall is two small windows; the plan shows near-continuous glass. Changing window count needs the 15-window test updated.
- Garage floor should be about four steps below the main floor, with a rear side door and two separate overhead doors. Build walls and stairs only, from the new garage photos; no contents.
- Family-room corner fireplace, under-stair storage cubby, and bathroom fixtures are missing.
- Rear deck has no stairs, screens or railing; there is no walk-out patio beneath it. Deck stairs would add an outdoor route between floors. New patio photos exist.
- Side yards are a sheer drop instead of slopes with retaining walls.
- No pitched roof; ceilings are flat.
- `docs/martelli-main.png` and `docs/martelli-foundation.png` predate the wall corrections.

## Guard systems added this session

All of it applies only when the rule "Guard variety & realism" is on, which gives guards a `traits` sheet. With it off, or in tests that pass no `missionSeed`, guards behave exactly as before.

| File | What it does |
|---|---|
| `src/guard-traits.js` | Seeded random, the five traits (perception, discipline, communication, handling, nerve), and their multipliers |
| `src/guard-posts.js` | Weighted posts, per-mission assignment, and the walk-pause-look routine |
| `src/guard-wounds.js` | Flinch, leg falls, gut-shot clock, surrender, and shot dispersion |
| `src/guard-weapon.js` | 12-round magazine, reloads, stoppages, falling back to cover |
| `src/guard-radio.js` | Delayed, sometimes inaccurate radio calls and listener delay |

The mission seed is shown on the mission card and can be pinned with the "Mission seed" rule. "Guard marksmanship" scales guard accuracy.

Not yet done for guards: sound for reloads and jams, securing a surrendered guard, a dropped-weapon model, and a guard in cover no longer leaning out while reloading.

## Sluggishness: investigated and fixed (2026-11-11)

Profiled with Node's CPU profiler (Martelli, eight guards) and frame timing in the browser.

| Situation | Simulation cost per frame, before | After |
|---|---|---|
| Guards patrolling | 6.0 ms | 0.35 ms |
| Firefight, eight guards down | 12.8 ms (never recovered) | 1.75 ms while bodies fall, 0.1 ms once settled |

What was actually slow, and what changed:

- **Every mover scanned all ~7,500 wall pieces twice a frame** (`movePlayer` → `obstacles`). `src/spatial.js` now keeps a 1 m plan grid over the pieces; `piecesInArea` and `piecesAlong` return only nearby ones. Used by movement, `segmentClear`, `supportHeight`, ragdolls and the sight-cone drawing.
- **Downed guards simulated ragdoll physics forever** (about 1.4 ms per body per frame). A body now sleeps after lying still for a second and wakes when hit again or when walls, doors or glass change.
- The damage signature used by the walking grid and player cover is counted once per step (`damageCount`), and guard path searches reuse their buffers.

The suspects listed earlier (path searches, sight sweeps, sight cones) were minor by comparison. `test/spatial.test.js` checks the lookup against a full scan; a test in `test/npc-body.test.js` covers sleeping bodies.

Still unmeasured: GPU cost of rendering (lights, shadows). If it still feels slow, record a trace with the browser's Performance tab while it happens. Furniture props are still checked one by one in sight tests; that is fine for dozens, and they can join the grid if the kit grows into hundreds.

## Running and checking

- `npm run dev` starts the game; `npm test` runs the suite.
- `.claude/launch.json` defines a `dev` server for the in-app browser preview.
- To see the map: Loadout & planning → Map → Martelli House → Deploy, then **M** for the map and **F** to switch floors. "Live guard tracking" and "Reveal patrol routes" in the rules show guards and their rounds.
- `scripts/*.html` are small standalone preview pages for poses, cover, lighting, windows and the furniture kit.
