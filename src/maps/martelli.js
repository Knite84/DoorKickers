import { ceilingsFor, rectangle } from './ceilings.js';
import { piece, sectional, isDrawnOnly, furnitureBoxes } from '../furniture.js';
import { defaultRoomLights } from '../lighting.js';
// Traced from the two local floorplans. Plan-up faces the lake (south in the
// north-up aerial photograph). Door annotations imply roughly 2 cm per pixel.
// Foundation is engine datum 0; the main floor and front approach are at 3.2 m.
const scale = 0.02, main = 3.2;
const point = (x, z) => [(x - 600) * scale, (z - 500) * scale];
const walls = [], doors = [], windows = [], rooms = [], floors = [], props = [], decor = [], surfaces = [];
function segment(axis, fixed, lo, hi, openings = [], elevation = main, exterior = false, tall = 2.8) {
  const horizontal = axis === 'x', thickness = exterior ? 0.28 : 0.16;
  function panel(a, b, base = 0, height = tall) {
    if (b <= a) return;
    walls.push({ center: horizontal ? point((a + b) / 2, fixed) : point(fixed, (a + b) / 2),
      size: horizontal ? [(b - a) * scale, thickness] : [thickness, (b - a) * scale],
      elevation: elevation + base, level: Math.round(elevation / main), axis, height, exterior, destructible: !exterior });
  }
  let cursor = lo;
  for (const opening of [...openings].sort((a, b) => a.at - b.at)) {
    const half = (opening.width ?? 48) / 2, a = opening.at - half, b = opening.at + half;
    panel(cursor, a);
    const position = horizontal ? point(opening.at, fixed) : point(fixed, opening.at);
    if (opening.window) {
      panel(a, b, 0, 0.8); panel(a, b, 2.3, 0.5);
      windows.push({ position, size: horizontal ? [half * 2 * scale, 0.08] : [0.08, half * 2 * scale], elevation, sill: 0.8, height: 1.5 });
    } else if (!opening.passage) {
      // Standard 2.03 m doors (2.13 m garage doors) under a wall header, not ceiling-high slabs.
      const leaf = opening.garage ? 2.13 : 2.03;
      if (tall - leaf > 0.05) panel(a, b, leaf, tall - leaf);
      doors.push({ position, size: horizontal ? [half * 2 * scale, 0.16] : [0.16, half * 2 * scale], elevation, height: leaf, locked: false, ...(opening.garage ? { garage: true } : {}) });
    }
    cursor = b;
  }
  panel(cursor, hi);
}
const h = (z, a, b, gaps = [], y = main, exterior = false) => segment('x', z, a, b, gaps, y, exterior);
const v = (x, a, b, gaps = [], y = main, exterior = false) => segment('z', x, a, b, gaps, y, exterior);
const win = (at, width = 80) => ({ at, width, window: true });
// Garage doors are overhead doors: drawn without a lever.
const door = (at, width = 48, extra = {}) => ({ at, width, ...extra });
const gap = (at, width) => ({ at, width, passage: true });
// Waist-high guard rail: blocks movement, not sight or shots above it.
const rail = (axis, fixed, lo, hi) => segment(axis, fixed, lo, hi, [], main, false, 1.0);
function room(name, x1, z1, x2, z2, elevation = main) {
  rooms.push({ name, center: point((x1 + x2) / 2, (z1 + z2) / 2), size: [(x2 - x1) * scale, (z2 - z1) * scale], elevation });
}
// Floor finish for a plan-pixel rectangle (see src/surface-plan.js). Later ones win.
function surface(kind, x1, z1, x2, z2, elevation = main, extra = {}) {
  const [a, b] = point(x1, z1), [c, d] = point(x2, z2);
  surfaces.push({ kind, rect: [a, b, c, d], elevation, ...extra });
}
function floor(x1, z1, x2, z2, elevation = main, extra = {}) {
  floors.push({ center: point((x1 + x2) / 2, (z1 + z2) / 2), size: [(x2 - x1) * scale, (z2 - z1) * scale], elevation, ...extra });
}
const bed = (x, z, width, depth, elevation = main) => props.push({ kind: 'bed', height: 0.6, position: point(x, z), size: [width * scale, depth * scale], elevation });
function prop(kind, x, z, width, depth, elevation = main) {
  props.push({ kind, position: point(x, z), size: [width * scale, depth * scale], elevation });
}
// Kit furniture (src/furniture.js) at plan pixel (x, z). `size` is the piece's own
// width x depth in metres (default: the variant's); `facing` is where its front
// points on the plan. Drawn-only pieces go to decor and never collide.
function furnish(kind, variant, x, z, facing = 'down', size, options, elevation = main) {
  if (kind === 'vanity') options = { ...options, light: true };
  const entry = piece(kind, variant, point(x, z), { size, facing, elevation, options });
  (isDrawnOnly(entry) ? decor : props).push(entry);
}

// Orthogonal outline retains the garage wing, recessed entry and bedroom bays.
const outline = [[248,140],[452,140],[452,198],[720,198],[720,90],[760,90],[760,76],[920,76],[920,90],[965,90],[965,140],[1133,140],[1133,452],[1188,452],[1188,646],[1005,646],[1005,780],[945,780],[945,792],[806,792],[806,780],[740,780],[740,590],[620,590],[620,646],[514,646],[514,930],[208,930],[208,900],[14,900],[14,476],[248,476]];
const contains = (x, z, polygon = outline) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = polygon[i], [c, d] = polygon[j];
    if ((b > z) !== (d > z) && x < (c - a) * (z - b) / (d - b) + a) inside = !inside;
  }
  return inside;
};

// Side yards (step 4.3). Both sides fall from the front grade (Main, 3.2 m) to
// the lake grade (0 m) beside the house. A level strip at Main grade runs along
// each side wall, held by a brick-capped retaining wall; the lawn slopes beyond
// it, and a retaining wall continues each side wall's line toward the lake.
// Grades are linear in plan z: 0 at LAKE_EDGE, Main at each side's top.
const LAKE_EDGE = 40, STRIP = 100;
const westGrade = z => main * Math.max(0, Math.min(1, (z - LAKE_EDGE) / (476 - LAKE_EDGE)));
const eastGrade = z => main * Math.max(0, Math.min(1, (z - LAKE_EDGE) / (646 - LAKE_EDGE)));
const slopes = [], retainingWalls = [];
// A ramp rising toward +z across a plan rectangle, with foot support like a stair.
function slope(x1, z1, x2, z2, grade) {
  const [a, b] = point(x1, z1), [c, d] = point(x2, z2);
  slopes.push({ center: [(a + c) / 2, (b + d) / 2], size: [c - a, d - b], from: [(a + c) / 2, b], to: [(a + c) / 2, d], bottom: grade(z1), top: grade(z2) });
}
slope(-200, LAKE_EDGE, 248 - STRIP, 476, westGrade); slope(248 - STRIP, LAKE_EDGE, 248, 140, westGrade);
slope(1133 + STRIP, LAKE_EDGE, 1188 + STRIP, 452, eastGrade); slope(1188 + STRIP, LAKE_EDGE, 1400, 646, eastGrade);
slope(1133, LAKE_EDGE, 1133 + STRIP, 140, eastGrade);
const inSlope = (x, z) => slopes.some(({ center, size }) => {
  const [px, pz] = point(x, z);
  return Math.abs(px - center[0]) < size[0] / 2 && Math.abs(pz - center[1]) < size[1] / 2;
});
// Retaining wall from (x1, z1) to (x2, z2): `high(z)` is the grade it holds up,
// `low(z)` the grade in front of it. Drawn only (src/site.js); the strip slabs
// and the earth under the slopes are the collision.
function retaining(x1, z1, x2, z2, high, low) {
  retainingWalls.push({ from: point(x1, z1), to: point(x2, z2), top: [high(z1), high(z2)], bottom: [low(z1), low(z2)] });
}
const flat = height => () => height;
retaining(248, LAKE_EDGE, 248, 140, westGrade, flat(0)); retaining(1133, LAKE_EDGE, 1133, 140, eastGrade, flat(0));
retaining(248 - STRIP, 140, 248 - STRIP, 476, flat(main), westGrade); retaining(248 - STRIP, 140, 248, 140, flat(main), westGrade);
retaining(1133 + STRIP, 140, 1133 + STRIP, 452, flat(main), eastGrade); retaining(1133, 140, 1133 + STRIP, 140, flat(main), eastGrade);
retaining(1188 + STRIP, 452, 1188 + STRIP, 646, flat(main), eastGrade); retaining(1133 + STRIP, 452, 1188 + STRIP, 452, flat(main), eastGrade);

// Merge each scan strip into rectangles, excluding the complete return stairwell.
const xs = [...new Set([-200, 1400, 510, 620, 248 - STRIP, 1133 + STRIP, 1188 + STRIP, ...outline.map(p => p[0])])].sort((a,b) => a-b);
const zs = [...new Set([140, 198, 510, 640, 1200, ...outline.map(p => p[1])])].sort((a,b) => a-b);
for (let j = 0; j < zs.length - 1; j++) {
  for (const outdoor of [false, true]) {
    let start = null;
    for (let i = 0; i < xs.length; i++) {
      const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2;
      // Front grade: outside the house, south of the lake wall, clear of the
      // deck notch (452-720, 140-198) and the side-yard slopes.
      const yard = z >= 140 && !contains(x, z) && !(x > 452 && x < 720 && z < 198) && !inSlope(x, z);
      const include = i < xs.length - 1 && (outdoor ? yard : contains(x, z) && !(x > 510 && x < 620 && z > 510 && z < 640));
      if (include && start === null) start = xs[i];
      if (!include && start !== null) {
        floor(start, zs[j], xs[i], zs[j + 1], main, outdoor ? { solid: true, depth: main, material: 'earth' } : {});
        start = null;
      }
    }
  }
}
// Rear deck, porch paving and driveway sit on permanent structural slabs.
floor(452, 10, 720, 198, main, { solid: true, depth: 0.25, material: 'deck' });
// Screened deck (step 4.3): posts under the deck and up to its roof are solid
// cover; the picket rail is a guard rail (src/stair-dress.js draws it); the
// screens are drawn only. A U-shaped stair with a mid landing drops from the
// deck's lake edge at the east corner to the patio under the deck.
const deckRoofTop = main + 3.0;
// Posts under the deck clear the lower flight; above it, one post frames the stair head.
for (const [x, z] of [[461, 19], [586, 19], [711, 19], [461, 75]]) floor(x - 7, z - 7, x + 7, z + 7, main - 0.25, { solid: true, depth: main - 0.25, material: 'post', level: 0 });
for (const [x, z] of [[461, 19], [586, 19], [663, 19], [711, 90], [461, 75]]) floor(x - 6, z - 6, x + 6, z + 6, deckRoofTop, { solid: true, depth: 3.0, material: 'post', level: 1 });
rail('x', 10, 452, 670); rail('z', 452, 10, 140); rail('z', 720, 10, 90);
floor(620, -140, 720, -90, main / 2, { solid: true, depth: main / 2, material: 'deck' });
const screens = [
  { from: point(452, 10), to: point(670, 10) }, { from: point(452, 10), to: point(452, 140) }, { from: point(720, 10), to: point(720, 90) },
].map(screen => ({ ...screen, bottom: main + 1.0, top: deckRoofTop }));
// Trees from the aerial: a large one on the west slope, one in the front lawn
// and a small one beside the front walk. Trunks are solid cover and concealment.
const trees = [[-11, 264, 0.42, 7.5], [912, 1045, 0.36, 6.5], [603, 905, 0.2, 3.6]].map(([x, z, trunk, height]) => {
  const base = inSlope(x, z) ? westGrade(z) : main;
  return { position: point(x, z), base, trunk: trunk, trunkHeight: Math.min(2.6, height * 0.4), height, canopy: height * 0.32 };
});
floor(14, 930, 514, 1195, main + 0.01, { solid: true, depth: 0.1, material: 'concrete' });
floor(635, 590, 710, 1120, main + 0.01, { solid: true, depth: 0.1, material: 'concrete' });
const foundationOutline = [[248,140],[452,140],[452,198],[720,198],[720,90],[965,90],[965,140],[1133,140],[1133,452],[1188,452],[1188,646],[1005,646],[1005,780],[945,780],[945,792],[806,792],[806,780],[740,780],[740,590],[620,590],[620,646],[510,646],[510,590],[425,590],[425,518],[248,518]];
const lowerX = [...new Set(foundationOutline.map(p=>p[0]))].sort((a,b)=>a-b);
const lowerRows = [...new Set(foundationOutline.map(p=>p[1]))].sort((a,b)=>a-b);
for (let j=0; j<lowerRows.length-1; j++) {
  let start = null;
  for (let i=0; i<lowerX.length; i++) {
    const include = i<lowerX.length-1 && contains((lowerX[i]+lowerX[i+1])/2,(lowerRows[j]+lowerRows[j+1])/2,foundationOutline);
    if (include && start === null) start = lowerX[i];
    if (!include && start !== null) {
      floor(start,lowerRows[j],lowerX[i],lowerRows[j+1],0,{solid:true,depth:0.15,material:'concrete'});
      start = null;
    }
  }
}

// Main exterior. Openings are actual gaps in the collision geometry.
h(140,248,452,[win(350,120)],main,true); v(248,140,476,[win(195,65),win(270,65)],main,true);
v(452,140,198,[door(168,48)],main,true); h(198,452,720,[win(520,70),win(610,65)],main,true);
v(720,90,198,[door(122,44)],main,true); h(90,720,760,[],main,true); v(760,76,90,[],main,true);
h(76,760,920,[win(840,125)],main,true); v(920,76,90,[],main,true); h(90,920,965,[],main,true);
v(965,90,140,[],main,true); h(140,965,1133,[win(1015,78)],main,true);
v(1133,140,452,[],main,true); h(452,1133,1188,[],main,true); v(1188,452,646,[],main,true);
h(646,1005,1188,[win(1060,70),win(1150,55)],main,true); v(1005,646,780,[],main,true);
h(780,945,1005,[],main,true); v(945,780,792,[],main,true); h(792,806,945,[win(875,100)],main,true);
v(806,780,792,[],main,true); h(780,740,806,[],main,true); v(740,590,780,[],main,true);
h(590,620,740,[door(677,58)],main,true); v(620,590,646,[],main,true); h(646,514,620,[win(565,65)],main,true);
v(514,646,930,[],main,true); h(930,208,514,[door(365,245,{garage:true})],main,true); v(208,900,930,[],main,true);
h(900,14,208,[door(110,150,{garage:true})],main,true); v(14,476,900,[],main,true); h(476,14,248,[door(149,48)],main,true);
// Interior. Kitchen and dining are one open space; only short returns flank
// the cased opening to the great room (the plan's other lines are soffits).
v(452,198,510,[gap(352,260)]);
// Garage/kitchen boundary and the mudroom: one door, at the head of the garage steps.
v(248,476,530); h(530,248,312); v(312,518,530); h(518,312,420); v(420,518,590); h(590,420,510,[door(480,44)]);
// Fireplace wall is solid past the powder room; the hall opening sits south of it,
// and the entry is walled off from the Bedroom 2 closet.
v(720,198,590,[gap(482,46)]);
// Primary suite: bedroom door from the hall, bath door, cased opening bath -> closet, toilet room.
h(320,720,965,[door(804,48)]); v(965,140,320,[door(292,44)]);
h(320,965,1133,[gap(985,40),door(1068,40)]);
// Powder room opens onto the bedroom hall, never the great room.
v(775,320,455,[door(393,40)]); h(455,720,775);
// Laundry opens to the hall and through to the primary closet; the closet has no hall door.
v(832,320,455); h(455,832,1045,[door(895,44)]); v(920,320,455,[door(350,40)]);
// Toilet room over Bedroom 3's closet, which opens into Bedroom 3.
v(1045,320,455); h(370,1045,1133); h(455,1045,1133,[door(1070,40)]);
// Bedroom hall: Bedroom 2's closet fills the west end; a stub leads to Bedroom 2.
h(510,720,860); v(860,510,590); h(510,915,1005);
h(590,740,915,[door(775,40),door(886,44)]);
// Bedroom 3: hall door plus the pocket door into the shared bath's vanity.
v(1005,455,646,[door(483,46),door(568,40)]);
// Jack-and-Jill bath: vanity -> toilet/tub -> vanity, the last open to Bedroom 2.
v(915,510,720); h(590,915,1005,[door(942,40)]); h(718,915,1005,[door(942,40)]);
// Stairwell: a wall on the mudroom side, open guard rails everywhere else.
v(510,510,590); v(565,510,590,[],0); rail('z',565,510,590); rail('z',620,510,590); rail('x',510,510,565);
floor(510,590,620,640,1.6,{ solid: true, depth: 0.15, material: 'deck' });

// Align the lower plan's north/south margins to the shared stair and facade.
// Its outer front walls must stay inside the main outline, clear of solid yard.
h(140,248,452,[win(350,120)],0,true); v(452,140,198,[door(168,48)],0,true);
h(198,452,720,[win(510,75),win(595,75)],0,true); v(720,90,198,[],0,true);
h(90,720,965,[win(830,80)],0,true); v(965,90,140,[],0,true); h(140,965,1133,[win(1045,80)],0,true);
v(1133,140,452,[],0,true); h(452,1133,1188,[],0,true); v(1188,452,646,[],0,true);
h(646,1005,1188,[],0,true); v(1005,646,780,[],0,true); h(780,945,1005,[],0,true);
h(792,806,945,[],0,true); v(945,780,792,[],0,true); v(806,780,792,[],0,true); h(780,740,806,[],0,true);
v(740,590,780,[],0,true); h(590,620,740,[],0,true); v(620,590,646,[],0,true);
h(646,510,620,[],0,true); v(510,646,930,[],0,true); h(930,208,510,[],0,true);
v(208,900,930,[],0,true); h(900,14,208,[],0,true); v(14,550,900,[],0,true); h(550,14,248,[],0,true);
v(248,140,550,[],0,true); h(518,248,425,[],0,true); v(425,518,590,[],0,true); h(590,425,510,[],0,true);
// Lower room lines. The foundation drawing is about 4% smaller than the main
// one, so its pixels are rescaled onto the shared facade (x 262 -> 248,
// 1115 -> 1133; z 270 -> 198, 650 -> 590) before use.
const lowerZ=z=>198+(z-270)*392/380;
const fx=x=>Math.round(248+(x-262)*885/853), fz=z=>Math.round(lowerZ(z));
// Family room east wall: solid behind the closet and bath, 4 ft opening to the
// lower hall, then the side of the nook beneath the entry.
v(720,198,590,[gap(470,70)],0);
// Bedroom 5 over its closet (door from the bedroom) and bath (door from the hall).
h(fz(350),720,fx(932),[door(fx(755),40),door(fx(903),46)],0);
v(fx(800),fz(350),fz(488),[],0); v(fx(880),fz(350),fz(488),[door(fz(442),40)],0); h(fz(488),720,fx(880),[],0);
// Hall/Bedroom 4 line. The plan draws no Bedroom 4 entry; it is assumed to be on
// the hall beside Bedroom 5's door. Further south the same line carries the
// mechanical-room door (drawn at an angle on the plan).
v(fx(932),90,fz(570),[door(fz(390),44),door(480,44)],0);
// Bedroom 4 over its closet and bath, both entered from the bedroom.
h(fz(422),fx(932),1133,[door(fx(1000),40),door(fx(1090),40)],0);
v(fx(1027),fz(422),fz(565),[],0); h(fz(513),fx(932),fx(1027),[],0); h(fz(565),fx(1027),1133,[],0);
// The bath's east wall continues past the facade jog, sealing it from storage.
v(1133,452,fz(565),[],0);
// Double doors from the lower hall into unfinished storage.
h(fz(570),720,fx(932),[door(fx(803),80)],0);
// The gym behind those doors is finished; the unfinished utility room east of it
// is reached only through the mechanical door. The split leaves a 1.2 m passage
// from the mechanical vestibule into the utility room.
v(fx(932),fz(570),565,[],0); h(565,fx(932),1005,[],0); v(1005,565,646,[],0);
// Wet bar beneath the kitchen behind the brick wall's 6 ft arch, and the arched
// alcove beside the stairs.
// The bar's north side is a brick half wall carrying the bar top (a furniture piece below).
v(fx(440),fz(440),518,[gap(fz(504),92)],0);
h(518,425,510,[gap(478,46)],0);
// Brick arch headers over both openings (drawn only).
furnish('arch','wide',fx(440),fz(504),'left',[1.84,0.2],undefined,0);
furnish('arch','narrow',478,518,'down',[0.92,0.2],undefined,0);
// Side of the lower flight; its north end opens directly into the family room.
v(510,510,590,[],0);

room('GREAT ROOM',452,198,720,510); room('DINING',248,140,452,310);
room('KITCHEN',248,310,452,518); room('ENTRY',620,510,720,590); room('MUDROOM',420,518,510,590);
room('PRIMARY BEDROOM',720,90,965,320); room('PRIMARY BATH',965,140,1133,320);
room('POWDER',720,320,775,455); room('LAUNDRY',832,320,920,455); room('PRIMARY CLOSET',920,320,1045,455);
room('CLOSET',1045,370,1133,455); room('CLOSET',720,510,860,590);
room('BEDROOM 2',740,590,915,780); room('BEDROOM 3',1005,455,1188,646);
room('SHARED BATH',915,510,1005,780); room('BEDROOM HALL',775,455,1005,510);
room('GARAGE',14,550,510,900); room('REAR DECK',452,10,720,198);
room('FAMILY ROOM',248,198,720,510,0); room('BAR',248,fz(440),fx(440),518,0);
room('BEDROOM 5',720,90,fx(932),fz(350),0); room('BEDROOM 4',fx(932),140,1133,fz(422),0);
room('CLOSET',720,fz(350),fx(800),fz(488),0); room('BATH',fx(800),fz(350),fx(880),fz(488),0);
room('CLOSET',fx(932),fz(422),fx(1027),fz(513),0); room('LOWER BATH',fx(1027),fz(422),1133,fz(565),0);
room('GYM',720,fz(570),1005,780,0); room('UTILITY',1005,502,1188,646,0);
room('UNEXCAVATED / BELOW GARAGE',14,590,510,900,0);
// Bedroom wing furniture, placed from the photos. Positions are plan pixels;
// door landings, window landings and guard posts are kept clear.
// Primary bedroom: king bed on the bath-door wall, dresser and chest opposite.
furnish('bed','king',906,182,'left');
furnish('nightstand','wide',946.75,114.5,'left'); furnish('nightstand','wide',949.75,250.5,'left');
furnish('bench','upholstered',839,182,'left');
furnish('dresser','low',739.5,215,'right',[1.5,0.5],{tv:0.8}); furnish('dresser','tallChest',739.5,280.5,'right');
furnish('ceilingFan','standard',842,205);
// Primary bath: tub under the window, shower beside it behind glass, a vanity
// on each side wall with the linen cabinet past the far one; toilet room on the left.
furnish('soakingTub','deck',1014,174.5,'down');
furnish('shower','glass',1096,177,'down',undefined,{side:'none'});
furnish('vanity','wide',982.75,236.5,'right',[1.3,0.55]);
furnish('vanity','wide',1112.25,247.5,'left');
furnish('linenCabinet','linen',1112.25,301,'left');
furnish('toilet','standard',1108.5,345,'left');
// Primary closet: double rods on the east and south walls, cubby towers by the laundry door.
furnish('closetRun','double',1032.25,387.5,'left',[2.46,0.35]);
furnish('closetRun','double',974,442.25,'up',[1.92,0.35]);
furnish('cubbyTower','white',932.75,388,'right'); furnish('cubbyTower','white',932.75,418,'right');
// Bedroom 2: bed on the yellow west wall with the desk north of it (short of
// the closet door), low bookcase between the closet and hall doors.
furnish('bed','queenShelf',799.5,732,'right');
furnish('desk','hutch',762,665,'right',[1.0,0.6]); furnish('chair','desk',793.75,665,'left');
furnish('bookcase','low',822.5,601.5,'down');
furnish('ceilingFan','standard',828,685);
furnish('closetRun','double',790,522.75,'down',[2.56,0.35]); furnish('closetRun','single',732.75,558.5,'right',[1.02,0.35]);
// Jack-and-Jill: Bedroom 3's vanity (north), toilet and tub, Bedroom 2's vanity (south).
furnish('vanity','alcove',960,526.5,'down',[1.6,0.5]);
furnish('toilet','standard',983.5,612.5,'left');
furnish('tubShower','alcove',979.25,677,'left',[1.5,0.75]);
furnish('vanity','single',984.25,747.5,'left',[1.0,0.55]);
// Bedroom 3: bunk lengthwise on the blue east wall, desk beyond it toward the
// window, cube bookcase on the west wall past the vanity door.
furnish('bed','bunk',1143.5,509.5,'left',[2.0,1.5]);
furnish('desk','plain',1168.5,579.75,'left',[0.75,0.5]); furnish('chair','desk',1140.75,579.5,'right');
furnish('bookcase','cube',1016.5,614,'right',[1.0,0.3]);
furnish('closetRun','single',1089,382.75,'down',[1.6,0.35]);
furnish('toyChest','wood',1071.5,386.5,'down');
furnish('dresser','low',1117.75,422,'left',[1.15,0.45]);
// Family room: L sectional floating mid-room facing the TV wall, its return
// along the windows; squared-off corner fireplace; floor sofa and child's chair in the nook.
props.push(...sectional('L',point(560,335),{size:[3.4,3.0],facing:'right',variant:'leather',mirror:true,seatDepth:1.0,elevation:0}));
furnish('fireplace','corner',686,230,'down',undefined,undefined,0);
furnish('mediaConsole','tv',704.75,317,'left',undefined,undefined,0);
furnish('sofa','floor',678.5,558,'up',[1.5,1.0],undefined,0);
furnish('armchair','child',614,570,'right',undefined,undefined,0);
// Wet bar: brick half wall with the raised top facing the room, four stools,
// beverage fridge at the end; back counter with sink and uppers on the far wall.
furnish('barCounter','brick',342,373,'up',[3.48,0.4],undefined,0);
for (const x of [305,340,375,410]) furnish('barStool','bar',x,349,'down',undefined,undefined,0);
furnish('fridge','under',271,348,'up',undefined,undefined,0);
furnish('cabinets','wetBar',342,496,'up',[3.48,0.6],undefined,0);
// Laundry: dryer, washer and utility sink with uppers and a hanging rod along
// the wall opposite the closet door.
furnish('laundryMachine','dryer',856,343.5,'right'); furnish('laundryMachine','washer',856,378.5,'right');
furnish('cabinets','laundry',851,422.5,'right');
// Powder room: small vanity with an oval mirror, toilet at the far end.
furnish('vanity','small',748,336.5,'down'); furnish('toilet','standard',748,433.5,'up');
// Lower hall bath (Bedroom 5's): tub along the back wall, toilet and vanity on the side wall.
furnish('tubShower','alcove',847.5,305,'down',undefined,undefined,0);
furnish('toilet','standard',827.5,342,'right',undefined,undefined,0);
furnish('vanity','single',823.75,396,'right',undefined,undefined,0);
// Bedroom 4's bath: vanity then toilet along the side wall, tub across the far end.
furnish('vanity','single',1059.75,381.5,'right',undefined,undefined,0);
furnish('toilet','standard',1063.5,425,'right',undefined,undefined,0);
furnish('tubShower','alcove',1083.5,478,'up',undefined,undefined,0);
// Bedroom 5, used as an office: daybed along the east wall beside the door,
// executive desk floating near the window with its chair facing east.
furnish('bed','daybed',940,180,'left',undefined,undefined,0);
furnish('desk','executive',840,185,'left',undefined,undefined,0); furnish('chair','office',800,185,'right',undefined,undefined,0);
furnish('ceilingFan','standard',846,185,'down',undefined,{ceiling:2.4},0);
furnish('closetRun','single',732.75,374.5,'right',[1.78,0.35],undefined,0);
furnish('linenCabinet','closet',790.75,404.75,'left',undefined,undefined,0);
// Bedroom 4: platform bed on the east wall with the dresser in the corner beside
// it (clear of the window), bookcase between the bath and closet doors; double
// rods in the walk-in closet. The photos' glass desk is left out: with it the
// room had no guard-width path to the window side.
furnish('bed','platform',1076,266,'left',[1.6,2.0],undefined,0);
furnish('dresser','white',1116,190,'left',[1.4,0.4],undefined,0);
furnish('bookcase','tall',1065,344,'up',[0.8,0.28],undefined,0);
furnish('closetRun','double',984.75,401.5,'right',[1.46,0.35],undefined,0);
furnish('closetRun','double',1016.5,429.25,'up',[0.86,0.35],undefined,0);
// Kitchen: range and hood centred on the outside wall run, pantry in the corner,
// counter with uppers and the fridge along the mudroom side, island with three
// stools facing it from the great-room side. The island sits 0.2 m toward the
// dining table so a player can squeeze between it and the fridge (owner).
furnish('cabinets','range',270,405,'right',[3.0,0.6]);
furnish('linenCabinet','pantry',277.5,499,'up');
furnish('cabinets','kitchen',337.5,499,'up',[1.5,0.6]);
furnish('fridge','full',397.5,494,'up');
furnish('island','seating',372.5,375,'right');
for (const z of [335,375,415]) furnish('barStool','counter',413,z,'left');
// Dining: chairs tuck 0.3 m under the table to keep the great-room passage clear.
furnish('diningTable','six',370,240,'down');
for (const x of [345,395]) { furnish('chair','dining',x,217.5,'down'); furnish('chair','dining',x,262.5,'up'); }
furnish('chair','dining',322.5,240,'right'); furnish('chair','dining',417.5,240,'left');
// Great room: light grey L sectional facing the stone fireplace and built-in TV,
// its return backed against the lake windows and running, with the end table,
// right up to the media console (owner: no walkway on the window side); blue
// armchair, rug. The back run starts east of most of the west window so that
// window stays climbable; the return covers the east window.
props.push(...sectional('L',point(605,290),{size:[3.4,2.56],facing:'right',variant:'fabric',mirror:true,elevation:main}));
furnish('armchair','blue',660,436,'up',[1.0,0.9]);
furnish('endTable','lamp',681.5,217.5,'down');
furnish('rug','cool',615,300,'right');
furnish('mediaConsole','tv',704.75,280,'left');
furnish('fireplace','wall',701,377.5,'left');
// Entry: shoe bench against the stair guard, rug inside the front door.
furnish('bench','shoe',634,550,'right');
furnish('rug','entry',677,565,'down');
// Screened deck: outdoor sofa, two armchairs and coffee table as one group
// facing the house (the photos have the sofa against the house, but there it
// blocks both great-room windows), plant stand in the corner, ceiling fan.
furnish('sofa','outdoor',585,65,'down');
furnish('coffeeTable','outdoor',585,112,'down');
furnish('armchair','outdoor',520,112,'right'); furnish('armchair','outdoor',650,112,'left');
furnish('plantStand','plain',470,25,'down');
furnish('ceilingFan','standard',585,104,'down');
// Gym (owner's decision): a wall TV and a yoga mat only.
furnish('wallTV','small',773,771.5,'up',undefined,undefined,0);
furnish('yogaMat','mat',870,660,'down',undefined,undefined,0);
// Utility room: furnace and water heater in the back corner (the photos show
// them by the door, but there they choked the only way in), shelving and tote
// stacks along the back wall. The archive objective is kept here.
furnish('furnace','upflow',1155,479,'down',undefined,undefined,0);
furnish('waterHeater','tank',1157,512,'down',undefined,undefined,0);
furnish('storageShelf','totes',1042.5,627.75,'up',undefined,undefined,0);
furnish('totes','stack',1090,629,'up',undefined,undefined,0); furnish('totes','stack',1120,629,'up',undefined,undefined,0);
prop('planter',740,900,70,30); prop('planter',580,795,35,75);
// Floor finishes from the photos. Main floor: amber bamboo in the living areas,
// beige carpet in bedrooms and closets, tile in the wet rooms; the screened deck
// is composite boards and counts as outdoors for siding.
surface('concrete',14,476,514,930);
surface('bamboo',248,140,452,530); surface('bamboo',452,198,720,510); surface('bamboo',420,518,510,590);
surface('carpet',510,510,620,646); surface('bamboo',620,510,720,590);
surface('bamboo',720,455,1005,510); surface('bamboo',860,510,915,590); surface('bamboo',720,320,775,455);
surface('carpet',720,90,965,320); surface('carpet',760,76,920,90);
surface('woodTile',965,140,1133,320); surface('woodTile',1045,320,1133,370);
surface('greyTile',832,320,920,455); surface('carpet',920,320,1045,455); surface('carpet',1045,370,1133,455);
surface('carpet',720,510,860,590); surface('carpet',740,590,915,780); surface('carpet',806,780,945,792);
surface('carpet',915,510,1005,590); surface('stoneTile',915,590,1005,718); surface('carpet',915,718,1005,780);
surface('carpet',1005,455,1188,646);
surface('deckBoards',452,10,720,198,main,{outdoor:true});
// Foundation: carpet with pale plank tile at the bar and alcove, stone tile in
// the baths, vinyl plank in the gym, bare concrete in the utility room.
surface('carpet',248,198,720,518,0); surface('plankTile',248,373,433,518,0); surface('plankTile',425,518,510,590,0);
surface('carpet',510,510,720,646,0);
surface('carpet',720,90,972,281,0); surface('carpet',720,281,806,423,0); surface('stoneTile',806,281,889,423,0);
surface('carpet',889,281,972,423,0); surface('carpet',720,423,972,507,0);
surface('carpet',972,140,1133,355,0); surface('carpet',972,355,1042,442,0); surface('stoneTile',1042,355,1133,502,0);
surface('vinyl',720,507,1005,780,0); surface('vinyl',806,780,945,792,0);
surface('concrete',972,442,1188,646,0); surface('concrete',972,507,1005,565,0);
const stairWindow=windows.find(w=>w.elevation===main&&Math.abs(w.position[0]-point(565,646)[0])<.01&&Math.abs(w.position[1]-point(565,646)[1])<.01);
stairWindow.climbable=false;stairWindow.climbReason='The stairwell window has no level landing. Use the nearby front door.';
// The primary bath window sits over the tub deck, which leaves no floor to land on.
const bathWindow=windows.find(w=>w.elevation===main&&Math.abs(w.position[0]-point(1015,140)[0])<.01&&Math.abs(w.position[1]-point(1015,140)[1])<.01);
bathWindow.climbable=false;bathWindow.climbReason='The tub deck fills the floor under the bath window. Use another opening.';
// The great-room sectional is backed against the east lake window.
const sofaWindow=windows.find(w=>w.elevation===main&&Math.abs(w.position[0]-point(610,198)[0])<.01&&Math.abs(w.position[1]-point(610,198)[1])<.01);
sofaWindow.climbable=false;sofaWindow.climbReason='The sectional is pushed against this window. Use the other great-room window or the deck door.';

export const martelli = {
  version: 2, id: 'martelli-01', name: 'Martelli House', stamp: 'MARTELLI HOUSE · MAIN + FOUNDATION · LAKE ↑',
  description: 'Enter from the front walk on Main, explore the great room and bedroom wing, then take the return staircase down to Foundation. Retrieve the archive from the utility room behind the mechanical door and return to the front walk. Layout traced from the supplied plans; scale and furnishings are approximate. Plan-up faces the lake, south in the north-up aerial.',
  bounds: { minX: -16, maxX: 16, minZ: -14, maxZ: 14 },
  // Plan up is the lake side, which faces south: the HUD compass reads S there.
  planUpHeading: 180,
  // Interior doors are 0.8 m; a 0.2 m walking grid always finds a way through.
  navCell: 0.2,
  levels: [{ name: 'Foundation', elevation: 0 }, { name: 'Main', elevation: main }],
  spawn: point(677,1010),
  entries: {
    courtyard: { position: point(677,1010), elevation: main, yaw: 0, label: 'Front walk · enter Main' },
    'west gallery': { position: point(145,1010), elevation: main, yaw: 0, label: 'Driveway · outside garage' },
  },
  extraction: { position: point(677,1010), elevation: main, radius: 1.2 },
  objective: { position: point(1150,590), elevation: 0, radius: 1.2, label: 'Utility room archive' },
  walls, doors, windows, rooms, floors, props, decor, surfaces,
  // Wall paint by room (src/surface-plan.js); accent walls and the cream vanity
  // alcoves of the navy shared bath are zones.
  paint: { default: 0xe4ddcf, 'PRIMARY BEDROOM': 0x3d4b4e, 'PRIMARY BATH': 0xc2a37c, 'BEDROOM 2': 0xa7a8a3, 'BEDROOM 3': 0xa7a8a3,
    'SHARED BATH': 0x2b3c5e, 'BEDROOM 5': 0x2b3b54, UTILITY: 0xb89466, GARAGE: 0xd9d6cc },
  paintZones: [
    { color: 0xe2c94f, rect: [...point(740,590), ...point(770,780)], elevation: main },
    { color: 0x2e8ed0, rect: [...point(1158,455), ...point(1188,646)], elevation: main },
    { color: 0xe4ddcf, rect: [...point(915,510), ...point(1005,590)], elevation: main },
    { color: 0xe4ddcf, rect: [...point(915,718), ...point(1005,780)], elevation: main },
  ],
  ceilings: ceilingsFor([
    {outline:foundationOutline.map(([x,z])=>point(x,z)),height:2.4,holes:[rectangle(...point(510,510),...point(620,646))]},
    {outline:outline.map(([x,z])=>point(x,z)),elevation:main},
  ]),
  // Drawn-only hip roof (src/roof.js). Wings are wall-line rectangles in plan
  // pixels; overlapping wings intersect like real hips. The soffit (eave minus
  // fascia) sits on the 6.0 m wall tops, just under the Main ceiling slab's top.
  // Wing layout follows the aerial photo's main ridges; pitch and overhang are estimates.
  roof: {
    eave: main + 3.0, pitch: 5 / 12, overhang: 0.45, fascia: 0.2,
    wings: [
      [248, 140, 965, 590],  // kitchen, great room and primary bedroom
      [452, -20, 720, 320],  // screened deck, hipped toward the lake
      [720, 76, 965, 200],   // primary bedroom bump-out and bay toward the lake
      [965, 140, 1133, 646], // primary bath and Bedroom 3, ridge running front to back
      [1005, 452, 1188, 646], // Bedroom 3 corner
      [740, 560, 1005, 792], // Bedroom 2 and shared bath
      [14, 476, 514, 930],   // garage
      [514, 560, 740, 646],  // entry, eave over the front door
    ].map(([x1, z1, x2, z2]) => [...point(x1, z1), ...point(x2, z2)]),
  },
  stairs: [
    { center: point(537.5,550), size: [1.1,1.6], from: point(537.5,510), to: point(537.5,590), bottom: 0, top: 1.6 },
    { center: point(592.5,550), size: [1.1,1.6], from: point(592.5,590), to: point(592.5,510), bottom: 1.6, top: main },
    // Deck stairs: down from the deck to the landing, then back toward the house.
    { center: point(695,-40), size: [1.0,2.0], from: point(695,-90), to: point(695,10), bottom: main / 2, top: main, material: 'deck' },
    { center: point(645,-40), size: [1.0,2.0], from: point(645,10), to: point(645,-90), bottom: 0, top: main / 2, material: 'deck' },
  ],
  slopes, retainingWalls, screens, trees,
  scenery: [{ center: [0,-12.5], size: [32,3], elevation: 0.03, color: 0x4c8798 }],
  patrols: [
    [point(480,470),point(600,470)], [point(795,485),point(965,485)],
    [point(1045,620),point(1140,620)], [point(350,310),point(650,310)],
    [point(760,115),point(900,115)], [point(985,180),point(1090,180)],
    [point(780,700),point(950,700)], [point(1030,575),point(1140,550)],
  ],
  guardElevations: [main, main, main, 0, 0, 0, 0, 0],
  // Places guards gravitate to. Weight is how often a post is someone's home;
  // dwell stretches how long they stand there. The archive, stairs and entry
  // are usually covered, never always.
  posts: [
    ['entry', 670, 545, main, 2.5, 1.3], ['stair head', 592, 488, main, 2], ['great room', 470, 460, main, 1.5],
    ['deck windows', 495, 235, main, 1], ['kitchen', 312, 450, main, 1], ['dining', 290, 190, main, 0.6],
    ['bedroom hall', 890, 483, main, 2], ['primary bedroom', 770, 280, main, 1], ['primary bath', 1050, 230, main, 0.4],
    ['bedroom 3', 1100, 620, main, 0.8], ['bedroom 2', 880, 700, main, 0.8], ['garage', 300, 720, main, 1],
    ['mudroom', 480, 555, main, 0.8], ['rear deck', 478, 145, main, 1, 1.5],
    ['family room', 440, 300, 0, 1.5], ['stair foot', 537, 470, 0, 2], ['bar', 340, 440, 0, 1, 1.5],
    ['lower hall', 830, 465, 0, 2], ['archive', 1150, 590, 0, 3, 1.6], ['storage east', 1100, 550, 0, 1.5],
    ['bedroom 5', 760, 200, 0, 0.7], ['bedroom 4', 980, 180, 0, 0.7],
  ].map(([name, x, z, elevation, weight, dwell = 1]) => ({ name, position: point(x, z), elevation, weight, dwell })),
};

const fixtureStyles = {
  flush: { size: [0.42, 0.08, 0.42], color: 0xffe0ad, strength: 0.85 },
  recessed: { size: [0.19, 0.045, 0.19], color: 0xffeac8, strength: 0.9 },
  strip: { size: [0.85, 0.07, 0.2], color: 0xf2f3ff, strength: 0.95 },
  porch: { size: [0.2, 0.28, 0.15], color: 0xffcb85, strength: 0.65 },
  lamp: { color: 0xffc378, strength: 0.55 },
  vanity: { color: 0xffe6c8, strength: 0.72 },
};

const roomFixtures = defaultRoomLights(martelli).map(fixture => {
  const { name } = fixture.room;
  const kind = /KITCHEN|GREAT ROOM|FAMILY ROOM|BAR|HALL/.test(name) ? 'recessed'
    : /GARAGE|UTILITY|LAUNDRY|GYM/.test(name) ? 'strip' : 'flush';
  return { ...fixture, kind };
});
const furnitureFixtures = props
  .filter(prop => ['nightstand', 'endTable', 'vanity'].includes(prop.kind))
  .flatMap(prop => furnitureBoxes(prop).filter(part => part.fixture).map(part => ({
    kind: part.fixture, position: part.center, size: part.size, elevation: prop.elevation ?? 0,
    mountedOnFurniture: true,
  })));

martelli.fixtures = [
  ...roomFixtures,
  ...furnitureFixtures,
  { kind: 'porch', position: [point(705, 597)[0], main + 2.1, point(705, 597)[1]], elevation: main },
  { kind: 'porch', position: [point(488, 191)[0], main + 2.1, point(488, 191)[1]], elevation: main },
  { kind: 'porch', position: [point(461, 194)[0], 2.1, point(461, 194)[1]], elevation: 0 },
].map((fixture, index) => ({ ...fixtureStyles[fixture.kind], ...fixture, id: `martelli-light-${index + 1}`, circuit: 'building' }));
