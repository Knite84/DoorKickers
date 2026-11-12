# Proposal: Martelli site terrain and deck (step 4.3)

Drafted 2026-11-12 for the owner's go-ahead.

**Owner's answers (2026-11-12), now built (see the 4.3 notes in the plan):**
1. Both side yards slope between front and back.
2. The level strip: "I think so", to be judged once seen.
3. Deck stairs: yes.
4. Trees are cover and concealment, so trunks block bullets.
5. The roof has many angles; follow the aerial photo.

The owner also noticed that north and south were reversed.

The rest of this file is the original proposal. The roof half of 4.3 is built separately (see the 4.3 note in [POLISH_PLAN.md](POLISH_PLAN.md#43-roof-deck-and-site)).

## What the site is today

- **Two flat grades.** The front and both side yards are one solid earth block at Main height (3.2 m). The lake side is flat ground at Foundation height (0 m).
- **A sheer cliff joins them.** It runs across the whole map at plan z 198, the line of the house's lake-side wall, on both sides of the house. A player who walks off it falls 3.2 m and can only get back up through the house.
- **Window landings depend on that line.**
  - The kitchen's two west windows sit on either side of it. The north one (plan z 195) drops 4 m to lake grade. The south one (z 270) lands on the front grade with a 0.8 m drop.
  - No other Main window faces a side yard.
- **The rear deck is a slab with no stairs.** It sits at Main height off the great room and the primary bedroom.

## What I propose

### 1. Side yards: a level strip at the house, then a slope

On each side of the house:

1. **A level strip, 2 m wide, at Main grade** along the house wall, held up by a brick-capped retaining wall. Windows on that wall keep exactly the landings they have now, so climbing in and out does not change.
2. **A lawn slope beyond the strip,** running from front grade down to lake grade. The slope ends at the lake-side wall line, where today's cliff is.
   - It falls 3.2 m over about 8 m, roughly 22°. That is steep but walkable.
   - Its outer edge is another short retaining wall at the map boundary.
   - The east yard is narrower: about 3 m of slope beside the strip, before the map edge.

**How it works in code:**
- A slope is a ramp, which the game already supports. Stairs are ramps: `stairHeight` in `src/world.js` gives smooth foot support, guards' height and walking grid already use it, and `src/destruction.js` builds solid step blocks underneath for shots and sight.
- I would add `map.slopes`, read by the same code as stairs, but drawn as a grass surface instead of steps and never carpeted.
- The level strip and the retaining walls are ordinary floor slabs and indestructible masonry walls, like the existing yard.
- Movement, shooting and guard code would not change. The only engine change is that `stairHeight` and the step builder also read `map.slopes`.

**This adds an outdoor route between floors.** A slope lets a player walk from the front yard to the lake-side walk-out door without the stairs. Guards could use it too. The plan requires your approval for that. If approved I would update:
- the guard routes and posts that should cover it;
- the walking routes in `test/martelli.test.js` and the reachability expectations in `test/clearance.test.js`, saying why each one changed.

**Alternative: retaining walls only.** Replace the cliff with two terraces about 1.6 m apart on each side, no slope. Falls get shorter and nothing becomes walkable uphill, so no new route and no route tests change. It looks more like a series of drops than a hillside.

### 2. Deck: screens, rail and posts now; stairs only if approved

- **Posts and a metal picket rail.** The posts collide (cover, about 0.15 m square) and the rail collides like the stair guard rails (blocks movement, not sight). Screens are drawn only, so they don't block shots or sight, just as glass doesn't.
- **A roof over the deck,** joined to the main roof. It needs the posts to stand on, which is why the roof step left it out.
- **Stairs with a mid landing** down to the lake grade, plus the covered patio beneath. This is a second outdoor route between floors, so the same approval and test updates apply as for the slope.

### 3. Driveway, plants and fence

- **The driveway** already exists as a concrete slab. I would add a curb edge only, drawn-only.
- **Trees and shrubs** placed in the yards instead of the current row of cones along the map edge.
  - Shrubs are drawn only.
  - Tree trunks would be small solid props, so they give cover. A trunk changes guard paths only where it stands, and I would keep trunks off every walking route.
- **An iron fence** along the map edge, drawn only. The map bounds already stop movement there.

## What I need from you

1. **Which side yards slope, and which only step down?** Per side: walkable slope (recommended on at least one side, so the lake side can be reached from outside), retaining walls only, or as the real house is.
2. **Is the 2 m level strip along the house walls right?** Without it, the kitchen's south window would land on the slope, and from outside you could no longer reach it to climb in.
3. **Do the deck stairs go in?** They add a second outdoor route.
4. **Should tree trunks give cover?** The other option is drawn only.
5. **About the roof that was just built:**
   - Is the house hipped (sloping on all four sides) or gabled (triangular end walls)?
   - Is about a 5-in-12 pitch with dark grey shingles close enough?

## Order of work once approved

1. Slopes, the level strip and retaining walls, with tests for foot support, window landings and the routes you approve.
2. Deck posts, rail, screens and deck roof.
3. Deck stairs and patio, if approved.
4. Plants, fence and driveway edge.

Each lands with before and after views from the exterior preview views (front walk, driveway, lake side, two raised corners) on `scripts/interior-preview.html`.
