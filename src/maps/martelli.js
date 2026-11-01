// Traced from the two local floorplans. Plan-up faces the lake (south in the
// north-up aerial photograph). Door annotations imply roughly 2 cm per pixel.
// Foundation is engine datum 0; the main floor and front approach are at 3.2 m.
const scale = 0.02, main = 3.2;
const point = (x, z) => [(x - 600) * scale, (z - 500) * scale];
const walls = [], doors = [], windows = [], rooms = [], floors = [], props = [];
function segment(axis, fixed, lo, hi, openings = [], elevation = main, exterior = false) {
  const horizontal = axis === 'x', thickness = exterior ? 0.28 : 0.16;
  function panel(a, b, base = 0, height = 2.8) {
    if (b <= a) return;
    walls.push({ center: horizontal ? point((a + b) / 2, fixed) : point(fixed, (a + b) / 2),
      size: horizontal ? [(b - a) * scale, thickness] : [thickness, (b - a) * scale],
      elevation: elevation + base, level: Math.round(elevation / main), height, exterior, destructible: !exterior });
  }
  let cursor = lo;
  for (const opening of [...openings].sort((a, b) => a.at - b.at)) {
    const half = (opening.width ?? 48) / 2, a = opening.at - half, b = opening.at + half;
    panel(cursor, a);
    const position = horizontal ? point(opening.at, fixed) : point(fixed, opening.at);
    if (opening.window) {
      panel(a, b, 0, 0.8); panel(a, b, 2.3, 0.5);
      windows.push({ position, size: horizontal ? [half * 2 * scale, 0.08] : [0.08, half * 2 * scale], elevation, sill: 0.8, height: 1.5 });
    } else if (!opening.passage) doors.push({ position, size: horizontal ? [half * 2 * scale, 0.16] : [0.16, half * 2 * scale], elevation, locked: false });
    cursor = b;
  }
  panel(cursor, hi);
}
const h = (z, a, b, gaps = [], y = main, exterior = false) => segment('x', z, a, b, gaps, y, exterior);
const v = (x, a, b, gaps = [], y = main, exterior = false) => segment('z', x, a, b, gaps, y, exterior);
const win = (at, width = 80) => ({ at, width, window: true });
const door = (at, width = 48) => ({ at, width });
const gap = (at, width) => ({ at, width, passage: true });
function room(name, x1, z1, x2, z2, elevation = main) {
  rooms.push({ name, center: point((x1 + x2) / 2, (z1 + z2) / 2), size: [(x2 - x1) * scale, (z2 - z1) * scale], elevation });
}
function floor(x1, z1, x2, z2, elevation = main, extra = {}) {
  floors.push({ center: point((x1 + x2) / 2, (z1 + z2) / 2), size: [(x2 - x1) * scale, (z2 - z1) * scale], elevation, ...extra });
}
function prop(kind, x, z, width, depth, elevation = main) {
  props.push({ kind, position: point(x, z), size: [width * scale, depth * scale], elevation });
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
// Merge each scan strip into rectangles, excluding the complete return stairwell.
const xs = [...new Set([-200, 1400, 510, 620, ...outline.map(p => p[0])])].sort((a,b) => a-b);
const zs = [...new Set([198, 510, 640, 1200, ...outline.map(p => p[1])])].sort((a,b) => a-b);
for (let j = 0; j < zs.length - 1; j++) {
  for (const outdoor of [false, true]) {
    let start = null;
    for (let i = 0; i < xs.length; i++) {
      const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2;
      const include = i < xs.length - 1 && (outdoor ? z >= 198 && !contains(x, z) : contains(x, z) && !(x > 510 && x < 620 && z > 510 && z < 640));
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
floor(14, 930, 514, 1195, main + 0.01, { solid: true, depth: 0.1, material: 'concrete' });
floor(635, 590, 710, 1120, main + 0.01, { solid: true, depth: 0.1, material: 'concrete' });
const foundationOutline = [[248,212],[452,212],[452,265],[720,265],[720,160],[935,160],[935,212],[1133,212],[1133,535],[1188,535],[1188,705],[1005,705],[1005,840],[945,840],[945,852],[806,852],[806,840],[740,840],[740,655],[620,655],[620,640],[510,640],[510,590],[425,590],[425,550],[248,550]];
const lowerX = [...new Set(foundationOutline.map(p=>p[0]))].sort((a,b)=>a-b);
const lowerZ = [...new Set(foundationOutline.map(p=>p[1]))].sort((a,b)=>a-b);
for (let j=0; j<lowerZ.length-1; j++) {
  let start = null;
  for (let i=0; i<lowerX.length; i++) {
    const include = i<lowerX.length-1 && contains((lowerX[i]+lowerX[i+1])/2,(lowerZ[j]+lowerZ[j+1])/2,foundationOutline);
    if (include && start === null) start = lowerX[i];
    if (!include && start !== null) {
      floor(start,lowerZ[j],lowerX[i],lowerZ[j+1],0,{solid:true,depth:0.15,material:'concrete'});
      start = null;
    }
  }
}

// Main exterior. Openings are actual gaps in the collision geometry.
h(140,248,452,[win(350,120)],main,true); v(248,140,476,[win(195,65),win(270,65)],main,true);
v(452,140,198,[door(168,48)],main,true); h(198,452,720,[win(520,70),win(610,65)],main,true);
v(720,90,198,[],main,true); h(90,720,760,[],main,true); v(760,76,90,[],main,true);
h(76,760,920,[win(840,125)],main,true); v(920,76,90,[],main,true); h(90,920,965,[],main,true);
v(965,90,140,[],main,true); h(140,965,1133,[win(1015,78)],main,true);
v(1133,140,452,[],main,true); h(452,1133,1188,[],main,true); v(1188,452,646,[],main,true);
h(646,1005,1188,[win(1060,70),win(1150,55)],main,true); v(1005,646,780,[],main,true);
h(780,945,1005,[],main,true); v(945,780,792,[],main,true); h(792,806,945,[win(875,100)],main,true);
v(806,780,792,[],main,true); h(780,740,806,[],main,true); v(740,590,780,[],main,true);
h(590,620,740,[door(677,58)],main,true); v(620,590,646,[],main,true); h(646,514,620,[win(565,65)],main,true);
v(514,646,930,[],main,true); h(930,208,514,[door(365,245)],main,true); v(208,900,930,[],main,true);
h(900,14,208,[door(110,150)],main,true); v(14,476,900,[],main,true); h(476,14,248,[door(149,48)],main,true);
// Interior: kitchen/dining are open to the great room; the bedroom hall wraps it.
v(452,198,510,[gap(350,300)]); h(222,248,452,[gap(352,155)]);
v(248,476,530); h(530,248,312); v(312,518,530); h(518,312,452); v(452,518,590,[door(565,48)]); h(590,452,510,[door(480,44)]);
v(720,198,455,[gap(432,48)]); h(320,720,965,[door(804,48)]);
v(965,140,320,[door(292,44)]); h(320,965,1133,[door(1060,46)]);
v(775,320,455,[door(377,48)]); h(455,720,775);
v(832,320,455); h(455,832,1045,[door(878,48),door(983,48)]);
v(920,320,455); v(1045,320,370);
h(370,1045,1133); v(1045,370,452,[door(406,44)]);
h(510,720,1005,[gap(870,150)]); v(1005,452,646,[door(483,48)]);
h(590,740,915,[door(886,48)]); v(915,540,780,[door(618,48)]);
h(540,915,1005);
// Stair divider and sides end before the shared half landing.
v(510,510,590); v(565,510,590,[],0); v(565,510,590); v(620,510,590);
floor(510,590,620,640,1.6,{ solid: true, depth: 0.15, material: 'deck' });

// Foundation plan is registered to the shared stairwell and great-room corners.
// The dashed garage/bedroom areas in the source are unfinished foundation space.
h(212,248,452,[win(325,100)],0,true); v(452,212,265,[door(239,48)],0,true);
h(265,452,720,[win(510,75),win(595,75)],0,true); v(720,160,265,[],0,true);
h(160,720,935,[win(830,80)],0,true); v(935,160,212,[],0,true); h(212,935,1133,[win(1035,80)],0,true);
v(1133,212,535,[],0,true); h(535,1133,1188,[],0,true); v(1188,535,705,[],0,true);
h(705,1005,1188,[],0,true); v(1005,705,840,[],0,true); h(840,945,1005,[],0,true);
h(852,806,945,[],0,true); v(945,840,852,[],0,true); v(806,840,852,[],0,true); h(840,740,806,[],0,true);
v(740,655,840,[],0,true); h(655,620,740,[],0,true); v(620,640,655,[],0,true);
h(640,510,620,[],0,true); v(510,640,930,[],0,true); h(930,208,510,[],0,true);
v(208,900,930,[],0,true); h(900,14,208,[],0,true); v(14,550,900,[],0,true); h(550,14,248,[],0,true);
v(248,212,550,[],0,true); h(550,248,425,[],0,true); v(425,550,590,[],0,true); h(590,425,510,[],0,true);
h(350,720,935,[door(905,48)],0); v(720,265,495,[door(372,48)],0);
v(800,350,495,[],0); h(495,720,860,[],0); v(880,350,495,[door(458,48)],0); h(495,860,880,[],0);
v(935,212,520,[gap(480,60)],0); h(422,935,1133,[door(1005,48),door(1100,48)],0);
v(1040,422,565,[],0); h(520,935,1040,[],0); h(565,1040,1133,[],0);
h(570,720,850,[door(795,90)],0); v(720,570,655,[],0);
// Side of the lower flight; its north end opens directly into the family room.
v(510,510,590,[],0);

room('GREAT ROOM',452,198,720,510); room('DINING',248,140,452,310);
room('KITCHEN',248,310,452,518); room('ENTRY',620,510,720,590);
room('PRIMARY BEDROOM',720,90,965,320); room('PRIMARY BATH',965,140,1133,320);
room('POWDER',720,320,775,455); room('LAUNDRY / CLOSETS',832,320,1045,455);
room('BEDROOM 2',740,590,915,780); room('BEDROOM 3',1005,452,1188,646);
room('SHARED BATH',915,540,1005,780); room('BEDROOM HALL',775,455,1005,510);
room('GARAGE',14,550,510,900); room('REAR DECK',452,10,720,198);
room('FAMILY ROOM',248,265,720,510,0); room('BEDROOM 5',720,160,935,350,0);
room('BEDROOM 4',935,212,1133,422,0); room('BATH / CLOSET',720,350,880,495,0);
room('LOWER BATH',1040,422,1133,565,0); room('UTILITY / STORAGE',740,570,1005,840,0);
room('UNEXCAVATED / BELOW GARAGE',14,590,510,900,0);
prop('table',355,180,110,48); prop('table',350,365,75,38); prop('crate',265,420,20,95);
prop('table',665,335,22,90); prop('table',850,200,95,85);
prop('table',810,690,80,90); prop('table',1100,550,90,85);
prop('table',350,445,130,35,0); prop('table',810,245,85,80,0); prop('table',1030,300,85,80,0);
prop('crate',1110,660,55,40,0); prop('crate',1040,665,45,40,0);
prop('planter',740,900,70,30); prop('planter',580,795,35,75);

export const martelli = {
  version: 2, id: 'martelli-01', name: 'Martelli House', stamp: 'MARTELLI HOUSE · MAIN + FOUNDATION · LAKE ↑',
  description: 'Enter from the front walk on Main, explore the great room and bedroom wing, then take the return staircase down to Foundation. Retrieve the archive in lower storage and return to the front walk. Layout traced from the supplied plans; scale and furnishings are approximate. Plan-up faces the lake, south in the north-up aerial.',
  bounds: { minX: -16, maxX: 16, minZ: -14, maxZ: 14 },
  levels: [{ name: 'Foundation', elevation: 0 }, { name: 'Main', elevation: main }],
  spawn: point(677,1010),
  entries: {
    courtyard: { position: point(677,1010), elevation: main, yaw: 0, label: 'Front walk · enter Main' },
    'west gallery': { position: point(145,1010), elevation: main, yaw: 0, label: 'Driveway · outside garage' },
  },
  extraction: { position: point(677,1010), elevation: main, radius: 1.2 },
  objective: { position: point(930,755), elevation: 0, radius: 1.2, label: 'Storage archive' },
  walls, doors, windows, rooms, floors, props,
  stairs: [
    { center: point(537.5,550), size: [1.1,1.6], from: point(537.5,510), to: point(537.5,590), bottom: 0, top: 1.6 },
    { center: point(592.5,550), size: [1.1,1.6], from: point(592.5,590), to: point(592.5,510), bottom: 1.6, top: main },
  ],
  scenery: [{ center: [0,-12.5], size: [32,3], elevation: 0.03, color: 0x4c8798 }],
  patrols: [
    [point(510,290),point(620,290)], [point(795,485),point(965,485)],
    [point(1030,620),point(1140,620)], [point(350,310),point(650,310)],
    [point(780,187),point(885,187)], [point(985,240),point(1080,240)],
    [point(780,700),point(950,700)], [point(1080,600),point(1140,600)],
  ],
  guardElevations: [main, main, main, 0, 0, 0, 0, 0],
};
