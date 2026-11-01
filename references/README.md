# Martelli map references

The local images in this folder are the source for `src/maps/martelli.js`:

- `floorplan-martelli-main.jpg`: main living floor, bedroom wing, front entry, garage and rear deck.
- `floorplan-martelli-foundation.jpg`: family room, lower bedrooms/baths, utility/storage and return stairs.
- `front from above.jpg`: front approach, recessed entry, driveway and planting.
- `birdseye_north_at_top.jpg`: site orientation and lakeside setting.

The map preserves the floorplans' orientation: lake at the top, front approach at the bottom. The north-up aerial places the front approach to the north, so **plan-up is south**, as indicated by the map stamp. The plan images have different margins and slight registration differences; the foundation is aligned to the shared stairwell and room corners.

Scale is estimated at 0.02 metres per main-plan pixel from the annotated door widths, with a 3.2-metre floor separation. Foundation uses engine elevation 0; Main and the front yard use elevation 3.2. This keeps the established ground/stair physics intact while allowing you to descend from the outside entrance. Front terrain is solid; the rear yard is lower for the walkout foundation.

Walls, windows, doors and major spaces are traced approximations. The dining bay is squared off; small closets and bathroom fixtures are simplified. Furniture, landscaping and water are procedural placeholders. The dashed area below the garage is marked unexcavated and has no interior connection. Roofs, photo textures, exact grade slopes, retaining walls and docks are not modelled. The source photographs remain local reference files and are not shipped as game textures.

Play via **Loadout & planning → Map → Martelli House → Front walk · enter Main → Deploy**. Open **M** and select **Main** or **Foundation**; **F** cycles them. The retrieval objective is in lower storage, with extraction back on the front walk.

`test/martelli.test.js` checks exterior support, floor separation, structural support, the complete downstairs retrieval/return route, and access to the main bedrooms, service rooms, shared bath and garage.
