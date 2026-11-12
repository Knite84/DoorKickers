# Martelli House reference

How the Martelli map is authored, the owner's layout decisions, and the photo inventory the furniture was placed from. Current status and next steps live in [HANDOFF.md](HANDOFF.md) and [POLISH_PLAN.md](POLISH_PLAN.md). The photos and floorplans themselves are local only (`references/`, git-ignored); see the privacy rules in the handoff.

## How the map is built

File: `src/maps/martelli.js`. Everything is authored in **main-floorplan pixels** and converted by `point(x, z)` at 0.02 m per pixel, origin at pixel (600, 500). Plan-up is the lake side.

- `h(z, x1, x2, openings, elevation, exterior)` and `v(x, z1, z2, …)` draw axis-aligned walls. Openings are `door(at, width)`, `win(at, width)` or `gap(at, width)`. `door(at, width, { garage: true })` marks an overhead garage door, drawn without a lever (the two garage doors use it). Doors are 2.03 m tall (garage doors 2.13 m) under a breakable wall header; `doorHeight(door)` in `src/world.js` reads `door.height`, and other maps keep 2.8 m ceiling-high doors.
- `rail(axis, fixed, lo, hi)` draws a 1 m guard rail (blocks movement, not sight).
- Main floor is elevation 3.2; Foundation is 0.
- The foundation drawing is about 4% smaller than the main one. Use `fx(x)` and `fz(z)` to convert **foundation-plan pixels** into map pixels.
- `room(name, x1, z1, x2, z2, elevation)` adds a map label only.
- `furnish(kind, variant, x, z, facing, size, options, elevation)` places a kit piece in plan pixels (elevation defaults to Main). `prop(kind, x, z, width, depth, elevation)` places a legacy prop (the two yard planters use it); `bed(...)` is unused.
- `posts` near the bottom lists where guards stand. `navCell: 0.2` gives guards a fine walking grid; interior doors are only 0.8 m wide.
- Walls must be axis-aligned. Angled features (dining bay, corner fireplace, the angled mechanical-room door) are squared off.

A useful trick from this session: crop and upscale regions of the plan images into the scratchpad to read door swings and labels, then express coordinates in plan pixels.

## Props and collision

- A prop is `{ kind, position, size: [width, depth], elevation, height? }`. Kit pieces add `variant`, `facing` and `options`; other maps still use the legacy kinds `table`, `crate`, `planter` and `bed`.
- **Collision is one box per prop.** Its height is `propHeight(prop)` in `src/world.js`: `prop.height`, else the kit variant's height, else 1.1 m. That one function feeds movement, shots, cover, guard pathfinding, window climbing and ragdolls, so a new kind only needs a sensible `height`.
- **Drawing:** kit pieces go through `furnitureBoxes` (`src/furniture.js`) and `furnitureMeshes` (`src/furniture-mesh.js`); legacy kinds are drawn in the `map.props` loop in `src/scene.js`.
- Other maps use `table`, `crate` and `planter`; do not change how those look or collide.

Things to respect when placing furniture:

- Guard posts and the eight legacy `patrols` points must stay clear of props. `test/guard-variation.test.js` and `test/martelli.test.js` check this.
- Test walking routes in `test/martelli.test.js` pass through specific points; a prop on a route fails the test. Move the route in the test if the furniture is right.
- Doors need a clear landing on both sides, and the 13 climbable windows need clear ground inside (`test/ceilings-windows.test.js` requires exactly 13).

## The furniture kit

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
- Drawn-only kinds (`rug`, `yogaMat`, `wallTV`, `mirror`, `ceilingFan`) go in a new `map.decor` list, never `map.props`; a test fails if one lands in props. The scene draws `map.decor` per floor and hides ceiling fans in the overhead view. Martelli's `furnish()` helper routes drawn-only kinds to `decor` automatically.
- Kit drawing choices to know about: the tub/shower alcove collides as the tub only (0.55 m); the walk-in shower is a 2 m box, so its glass blocks sight; upper cabinets, mirrors and lamps are drawn above the collision box and do not block.
- Preview: `npm run dev`, then open `/scripts/furniture-preview.html`. It has a facing switch, a focus list for each piece, collision frames, and a yellow line marking the wall behind each piece.

## The owner's decisions

- **Gym:** no machines. Leave it empty except a TV on the wall and a yoga mat in the middle of the floor.
- **Garage:** ignore all contents. Build only its walls and stairs from the new photos.
- **Lower storage:** ignore it and wall it off.
- **Bedroom 4's hall door** is already in the right place. Leave it.
- **Bedroom 5** is modelled as it is used: an office with a daybed.
- **Master bath:** the shower is next to the tub, behind the glass door, beside the far vanity. The toilet closet is the other door off the bath; on walking in, the toilet is to the left.
- **Kitchen, dining, front porch, patio, great-room TV and fireplace wall:** take them from the newly added photos.

## Placement history and trade-offs

- Rooms done, in order: upstairs bedroom wing; family room and wet bar; baths and laundry; Bedrooms 4 and 5; gym and utility room; kitchen, dining and great room; entry and deck.
- Map changes made along the way (beyond furniture):
  - The wet bar's full-height north wall became the kit's brick half wall with the bar top.
  - New walls split the old open lower "UTILITY / STORAGE" area into a **gym** (double doors) and a **utility room** (mechanical door). The owner confirmed this layout. The **archive objective moved into the utility room** (plan 1150, 590); the retrieval test route goes through the mechanical door.
  - Kit additions: corner and stone wall fireplaces, mirrored L sectionals, dresser `options.tv`, shower `options.side`.
  - All old placeholder props (tables, crates, beds) are gone.
  - Guard data moved off furniture: patrols (480,470)–(600,470), (985,180)–(1090,180), (1045,620)–(1140,620), (1030,575)–(1140,550); posts 'great room' (470,460), 'kitchen' (312,450), 'family room' (440,300), 'rear deck' (478,145), 'archive' (1150,590).
- Trade-offs made while placing, for the owner to overrule:
  - The primary-bath window sits over the tub deck, so it is now **not climbable** (like the stairwell window). On 2026-11-12 the great-room east window followed (the sectional backs onto it), leaving **13** climbable windows; `test/ceilings-windows.test.js` checks the count.
  - Left out for space or door/window clearance: the inventory's second primary-bedroom dresser (the photos show one dresser with a TV, plus the tall chest), Bedroom 2's nightstand and dresser, and Bedroom 3's nightstand. Bedroom 2's desk is 1.0 m and sits just south of the closet door's landing; Bedroom 3's bunk is 2.0 m and its desk 0.75 m and a little north of the corner, so the corner window stays climbable.
  - The Bedroom 3 patrol starts at plan x 1045 instead of 1030, clear of the cube bookcase. Walking routes in `test/martelli.test.js` moved slightly off the new furniture (primary bedroom x 775, bath x 295, Bedroom 3 x 1045, its closet z 420).
- The preview page's **Show** menu now has "Martelli · Main" and "Martelli · Foundation": the real walls cut at 1.6 m with every placed piece (red windows are not climbable). In the console, `preview.view(x, z, height)` frames a map point in metres.

## Known gaps

- Great-room window wall is two small windows; the plan shows near-continuous glass. Changing the window count needs the 13-window test updated.
- Garage floor should be about four steps below the main floor, with a rear side door and two separate overhead doors. Build walls and stairs only, from the new garage photos; no contents.
- The under-stair storage cubby is closed (owner's decision); the corner fireplace and bathroom fixtures are placed but squared off.
- Rear deck has no stairs, screens or railing; there is no walk-out patio beneath it. Deck stairs would add an outdoor route between floors. New patio photos exist.
- Side yards are a sheer drop instead of slopes with retaining walls.
- No pitched roof; ceilings are flat.
- `docs/martelli-main.png` and `docs/martelli-foundation.png` predate the wall corrections.
- Not placed: the main-hall flush linen cabinet (location not confirmed) and the family-room ladder shelf (no photo shows where).

## Furniture inventory from the photos

This is the inventory the furniture was placed from. Where the owner later decided differently (for example the great-room sectional now backs onto the lake windows), `src/maps/martelli.js` and the decisions above win. Sizes are eyeball estimates in metres, width x depth x height. Positions are relative.

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
