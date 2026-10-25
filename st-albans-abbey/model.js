// The cathedral, built from research/architecture.md (VCH 1908 ground plan, Carter c.1813 sections, Grimthorpe's figures).
// Every element sits in a dated part so the timeline can build it, replace it or take it down.
import {THREE, M, part, add, box, roof, leanTo, pyramid, cyl, windowAt, windowsAlong, buttress, parapet} from './scene.js';
import {buildWestFront, buildTowerDetail} from './facade.js';
import {bayOpenings, openingShape, naveBays, naveCeiling, aisleLining, crossingShell, presbyteryBays, presbyteryVault, buildInterior} from './interior.js';

// Nave bay boundaries (west respond, 12 pier centres, crossing pier); bay 1 is at the west end.
const NAVE_X = [5.55, 11.88, 18.20, 24.81, 31.35, 37.90, 44.28, 50.83, 57.38, 63.82, 70.14, 76.69, 82.96, 90.0];
const STYLE_N = ['ee', 'ee', 'ee', 'ee', 'nor', 'nor', 'nor', 'nor', 'nor', 'nor', 'nor', 'nor', 'nor'];
const STYLE_S = ['ee', 'ee', 'ee', 'ee', 'ee', 'dec', 'dec', 'dec', 'dec', 'dec', 'nor', 'nor', 'nor'];
const PIER = 5.74, CLER = 6.5, WALL_TOP = 20.8, RIDGE = 29.26;
const AISLE_N = -13.04, AISLE_S = 12.65, AISLE_TOP = 10;
const TW = {x0: 89.03, x1: 103.37, z: 6.86};

export const ANCHORS = {
  gateway: [-53.3, 0, -0.4],
  'abbey-gateway': [-53.3, 19, -0.4],
  'shrine-of-st-alban': [125.9, 3.2, 0], 'watching-loft': [126.3, 5.5, -5.7], 'shrine-of-st-amphibalus': [131.5, 3.5, -8.5],
  'nave-wall-paintings': [44.3, 6, -5.2], 'nave-screen': [68.5, 7.5, 0], 'norman-nave-arcade': [67, 9.5, -5.2],
  'decorated-south-arcade': [44, 9.5, 5.2], 'early-english-west-bays': [18, 9.5, -5.2], 'wallingford-screen': [120.9, 12, 0],
  'presbytery-ceiling': [112, 21.5, 0], 'quire-ceiling': [83, 20, 0], 'tower-crossing': [96.2, 24, 0],
  'duke-humphrey-tomb': [126.8, 4.5, 5.85], 'ramryge-chantry': [115.5, 5.5, -6.1], 'wheathampstead-chantry': [115.5, 5.5, 6.3],
  'north-transept': [95.8, 13, -25], 'south-transept-slype': [95.7, 9, 25], 'lady-chapel': [152.7, 10, 0],
  'norman-tower': [96.2, 46.5, 0], 'west-front': [0, 33, 0], 'south-transept-front': [95.7, 25, 28.5],
  'cloister-remains': [68, 6.5, 13.5], 'chapter-house': [100, 11.5, 41], 'welcome-centre': [111, 6, 22],
  'lady-chapel-exterior': [158, 17, 0],
};

// A wall pierced by openings, extruded from a Shape in the x-y plane, between z0 and z1.
function piercedWall(x0, x1, yTop, z0, z1, holes, mat, yBot = 0) {
  const s = new THREE.Shape();
  s.moveTo(x0, yBot); s.lineTo(x1, yBot); s.lineTo(x1, yTop); s.lineTo(x0, yTop); s.closePath();
  for (const h of holes) s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, {depth: z1 - z0, bevelEnabled: false, curveSegments: 8}).translate(0, 0, z0);
  return add(g, mat, {threshold: 35});
}
// Arcade walls: flint outside, limewashed plaster inside, so the arches read clearly in section.
function arcadeWall(x0, x1, yTop, z0, z1, holes, mat) {
  const skin = 0.45;
  if (z0 < 0) { piercedWall(x0, x1, yTop, z0, z0 + skin, holes, mat); piercedWall(x0, x1, yTop, z0 + skin, z1, holes, M.lime); }
  else { piercedWall(x0, x1, yTop, z0, z1 - skin, holes, M.lime); piercedWall(x0, x1, yTop, z1 - skin, z1, holes, mat); }
}
function arch(cx, y0, w, h, head) {
  const r = w / 2, p = new THREE.Path();
  if (head === 'nor') { p.moveTo(cx - r, y0); p.lineTo(cx + r, y0); p.lineTo(cx + r, y0 + h - r); p.absarc(cx, y0 + h - r, r, 0, Math.PI, false); }
  else {
    const ys = y0 + h - w * Math.sin(Math.PI / 3);
    p.moveTo(cx - r, y0); p.lineTo(cx + r, y0); p.lineTo(cx + r, ys);
    p.absarc(cx - r, ys, w, 0, Math.PI / 3, false);
    p.absarc(cx + r, ys, w, Math.PI * 2 / 3, Math.PI, false);
  }
  p.closePath();
  return p;
}
// Openings for one side of the nave: arcade, triforium and clerestory, per bay style (shared with the detail in interior.js).
function naveHoles(xs, styles) {
  return styles.flatMap((st, i) => bayOpenings(xs[i], xs[i + 1], st)).map(openingShape);
}
// Aisle windows as built outside (windowAt calls below), for the limewashed inner face of the aisle walls.
const aisleWins = (i0, i1, kind) => {
  const spec = {nor: [3.6, 1.6, 4.0, 'nor', 1], ee: [3.4, 2.4, 5.0, 'ee', 2], dec: [3.2, 2.8, 5.4, 'ee', 3]}[kind];
  const out = [];
  for (let i = i0; i < i1; i++) out.push({cx: (NAVE_X[i] + NAVE_X[i + 1]) / 2, y0: spec[0], w: spec[1], h: spec[2], head: spec[3], lights: spec[4]});
  return out;
};
const AISLE_IN_N = AISLE_N + 1.5, AISLE_IN_S = AISLE_S - 1.3;

export function buildCathedral() {
  // ---------------- Norman church, 1077 ----------------
  part('nave-norman', 1077, 9999, {label: 'Norman nave'});
  arcadeWall(31.35, 90, WALL_TOP, -CLER, -PIER + 0.76, naveHoles(NAVE_X.slice(4), STYLE_N.slice(4)), M.flint);
  arcadeWall(70.14, 90, WALL_TOP, PIER - 0.76, CLER, naveHoles(NAVE_X.slice(10), STYLE_S.slice(10)), M.flint);
  // north aisle outer wall and Norman windows, brick pilasters between bays
  box(31.35, 90, 0, AISLE_TOP, AISLE_N, AISLE_N + 1.5, M.flint);
  for (let i = 4; i < 13; i++) {
    const c = (NAVE_X[i] + NAVE_X[i + 1]) / 2;
    windowAt('z', AISLE_N, -1, c, 3.6, 1.6, 4.0, 'round', 1, {mat: M.brick});
    windowAt('z', -CLER, -1, c, 15.2, 1.6, 3.6, 'round', 1, {mat: M.brick});
    box(NAVE_X[i] - 0.5, NAVE_X[i] + 0.5, 10.6, WALL_TOP, -CLER - 0.45, -CLER, M.brick);
  }
  leanTo(31.35, 90, -CLER, AISLE_N, 13.4, AISLE_TOP, M.tile);
  box(70.14, 90, 0, AISLE_TOP, AISLE_S - 1.3, AISLE_S, M.flint);
  for (let i = 10; i < 13; i++) {
    const c = (NAVE_X[i] + NAVE_X[i + 1]) / 2;
    windowAt('z', AISLE_S, 1, c, 3.6, 1.6, 4.0, 'round', 1, {mat: M.brick});
    windowAt('z', CLER, 1, c, 15.2, 1.6, 3.6, 'round', 1, {mat: M.brick});
  }
  leanTo(70.14, 90, CLER, AISLE_S, 13.4, AISLE_TOP, M.tile);
  box(31.35, 90, 0, 0.12, AISLE_N, AISLE_S, M.paving, {edges: false, shadow: false});
  naveBays(NAVE_X.slice(4), STYLE_N.slice(4), -1);
  naveBays(NAVE_X.slice(10), STYLE_S.slice(10), 1);
  aisleLining(31.35, 90, AISLE_IN_N, -1, aisleWins(4, 13, 'nor'), NAVE_X.slice(5, 13));
  aisleLining(70.14, 90, AISLE_IN_S, 1, aisleWins(10, 13, 'nor'), NAVE_X.slice(11, 13));
  naveCeiling(31.35, 70.14, M.ceilNave); // flat painted timber ceiling
  naveCeiling(70.14, 89.03, M.ceilQuire); // painted quire ceiling (IHS panels)

  // Norman west front, taken down when the nave was extended west (c.1195)
  part('norman-west', 1077, 1195, {label: 'Norman west front'});
  box(30.0, 31.35, 0, WALL_TOP, AISLE_N, AISLE_S, M.flint);
  roof(30.0, 31.35, -CLER, CLER, WALL_TOP, RIDGE - 1, true, M.lead, 0);
  windowAt('x', 30.0, -1, 0, 3, 3, 6, 'round', 1, {mat: M.brick});
  windowAt('x', 30.0, -1, 0, 12, 2.4, 5, 'round', 1, {mat: M.brick});
  for (const z of [-CLER - 1.5, CLER + 1.5]) box(28.6, 31.35, 0, 26, z - 1.5, z + 1.5, M.brick);

  // Norman south nave bays 6-10, until the collapse of 10 October 1323
  part('nave-south-norman', 1077, 1323, {label: 'Norman south bays'});
  arcadeWall(37.90, 70.14, WALL_TOP, PIER - 0.76, CLER, naveHoles(NAVE_X.slice(5, 11), ['nor', 'nor', 'nor', 'nor', 'nor']), M.flint);
  box(37.90, 70.14, 0, AISLE_TOP, AISLE_S - 1.3, AISLE_S, M.flint);
  leanTo(37.90, 70.14, CLER, AISLE_S, 13.4, AISLE_TOP, M.tile);
  for (let i = 5; i < 10; i++) windowAt('z', AISLE_S, 1, (NAVE_X[i] + NAVE_X[i + 1]) / 2, 3.6, 1.6, 4.0, 'round', 1, {mat: M.brick});
  naveBays(NAVE_X.slice(5, 11), ['nor', 'nor', 'nor', 'nor', 'nor'], 1);
  aisleLining(37.90, 70.14, AISLE_IN_S, 1, aisleWins(5, 10, 'nor'), NAVE_X.slice(6, 10));
  // Norman south bay 5 until the Early English extension took it over
  part('nave-south-b5-norman', 1077, 1195);
  arcadeWall(31.35, 37.90, WALL_TOP, PIER - 0.76, CLER, naveHoles(NAVE_X.slice(4, 6), ['nor']), M.flint);
  box(31.35, 37.90, 0, AISLE_TOP, AISLE_S - 1.3, AISLE_S, M.flint);
  leanTo(31.35, 37.90, CLER, AISLE_S, 13.4, AISLE_TOP, M.tile);
  naveBays(NAVE_X.slice(4, 6), ['nor'], 1);
  aisleLining(31.35, 37.90, AISLE_IN_S, 1, aisleWins(4, 5, 'nor'));

  // Steep Norman roof, the low 15th-century roof, and Grimthorpe's steep roof again (1878)
  part('nave-roof-norman', 1077, 1450);
  roof(31.35, 90, -CLER, CLER, WALL_TOP, RIDGE, true, M.lead);
  part('nave-roof-ee', 1235, 1450);
  roof(5.55, 31.35, -CLER, CLER, WALL_TOP, RIDGE, true, M.lead);
  part('nave-roof-low', 1450, 1878, {label: 'Low 15th-century roof'});
  roof(5.55, 90, -CLER, CLER, WALL_TOP, WALL_TOP + 2.2, true, M.lead);
  parapet(5.55, 90, -CLER - 0.2, -CLER + 0.4, WALL_TOP, 0.9);
  parapet(5.55, 90, CLER - 0.4, CLER + 0.2, WALL_TOP, 0.9);
  part('nave-roof', 1878, 9999, {label: 'Grimthorpe roof'});
  roof(5.55, 90, -CLER, CLER, WALL_TOP, RIDGE, true, M.lead);
  parapet(5.55, 90, -CLER - 0.2, -CLER + 0.4, WALL_TOP, 0.7);
  parapet(5.55, 90, CLER - 0.4, CLER + 0.2, WALL_TOP, 0.7);

  // ---------------- crossing tower: Roman brick, five stages ----------------
  part('tower', 1077, 9999, {label: 'Norman tower'});
  const T = TW, cx = (T.x0 + T.x1) / 2, hx = (T.x1 - T.x0) / 2;
  crossingShell(T); // hollow crossing + lantern (interior.js), same outline as the old solid block 0-31.9 m
  box(T.x0 + 0.15, T.x1 - 0.15, 31.9, 35.0, -T.z + 0.15, T.z - 0.15, M.brick);
  box(T.x0 + 0.3, T.x1 - 0.3, 35.0, 42.7, -T.z + 0.3, T.z - 0.3, M.brick);
  box(T.x0 + 0.3, T.x1 - 0.3, 42.7, 43.4, -T.z + 0.3, T.z - 0.3, M.brick);
  // battlements, pilasters, angle turrets and all openings: buildTowerDetail (facade.js)
  box(cx - 0.05, cx + 0.05, 43.4, 50, -0.05, 0.05, M.timber, {edges: false}); // flagpole
  buildTowerDetail(T); // brick lacing, shafted belfry openings, battlements (facade.js)

  // ---------------- transepts ----------------
  part('transepts', 1077, 9999, {label: 'Transepts'});
  for (const [s, x0, x1, end] of [[-1, 88.85, 102.77, -28.47], [1, 89.5, 101.9, 27.91]]) {
    const za = s * T.z, zb = end;
    box(x0, x1, 0, 20.5, Math.min(za, zb), Math.max(za, zb), M.flint);
    roof(x0, x1, Math.min(za, zb), Math.max(za, zb), 20.5, RIDGE, false, M.lead);
    parapet(x0 - 0.2, x0 + 0.4, Math.min(za, zb), Math.max(za, zb), 20.5);
    // west wall: round-headed windows in two rows; east wall: blocked apse arches
    const zz = [za + s * 5.5, za + s * 11, za + s * 16.5];
    for (const z of zz.slice(0, 2)) windowAt('x', x0, -1, z, 4, 1.6, 4.0, 'round', 1, {mat: M.brick});
    for (const z of zz) windowAt('x', x0, -1, z, 12.5, 1.6, 4.2, 'round', 1, {mat: M.brick});
    for (const z of zz.slice(0, 2)) windowAt('x', x1, 1, z, 12.5, 1.6, 4.2, 'round', 1, {mat: M.brick});
    for (let k = 1; k < 3; k++) buttress('x', x0, -1, za + s * k * ((Math.abs(zb - za)) / 3), 18, 1.0, 1.2, M.brick);
  }
  // Norman transept fronts until Grimthorpe (1885)
  part('transept-fronts-norman', 1077, 1885);
  for (const [s, x0, x1, end] of [[-1, 88.85, 102.77, -28.47], [1, 89.5, 101.9, 27.91]]) {
    const c = (x0 + x1) / 2;
    windowAt('z', end, s, c - 2.6, 4, 1.8, 4.6, 'round', 1, {mat: M.brick});
    windowAt('z', end, s, c + 2.6, 4, 1.8, 4.6, 'round', 1, {mat: M.brick});
    windowAt('z', end, s, c, 12.5, 2.4, 5.5, 'round', 1, {mat: M.brick});
    for (const x of [x0, x1]) box(x - 0.9, x + 0.9, 0, 22, end - (s < 0 ? 0.9 : -0.9) * 0, end + s * 1.2, M.brick);
  }
  // Grimthorpe's north front: rose window (64 lights, glass by Alan Younger, 1989) and corner turrets
  part('north-transept-rose', 1885, 9999, {label: 'Rose window'});
  {
    const c = 95.8, zf = -28.47;
    const ring = new THREE.Shape().absarc(0, 0, 5.1, 0, Math.PI * 2);
    ring.holes.push(new THREE.Path().absarc(0, 0, 4.42, 0, Math.PI * 2, true));
    add(new THREE.ExtrudeGeometry(ring, {depth: 0.5, bevelEnabled: false, curveSegments: 48}).rotateY(Math.PI).translate(c, 15, zf + 0.05), M.stone);
    add(new THREE.CircleGeometry(4.42, 48).rotateY(Math.PI).translate(c, 15, zf - 0.2), M.glass, {edges: false});
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, g = new THREE.BoxGeometry(0.16, 4.3, 0.16).translate(0, 2.25, 0).rotateZ(a).translate(c, 15, zf - 0.3);
      add(g, M.stone, {edges: false, shadow: false});
    }
    for (const r of [1.4, 2.9]) {
      const t = new THREE.TorusGeometry(r, 0.09, 4, 40).translate(c, 15, zf - 0.3);
      add(t, M.stone, {edges: false, shadow: false});
    }
    windowAt('z', zf, -1, c, 0.4, 2.2, 4.0, 'pointed', 1);
    for (const x of [88.85, 102.77]) { box(x - 1.9, x + 1.9, 0, 27, zf - 1.9, zf + 1.9, M.stone); pyramid(x, zf, 3.8, 27, 7, M.stone); }
  }
  part('south-transept-front', 1885, 9999, {label: 'South transept front'});
  {
    const c = 95.7, zf = 27.91;
    [[-4.4, 17], [-2.2, 19.5], [0, 23], [2.2, 19.5], [4.4, 17]].forEach(([u, top]) => windowAt('z', zf, 1, c + u, 7, 1.5, top - 7, 'pointed', 1));
    windowAt('z', zf, 1, c, 0.3, 2.4, 4.4, 'round', 1);
    for (const x of [89.5, 101.9]) { box(x - 1.9, x + 1.9, 0, 26, zf - 1.9, zf + 1.9, M.stone); pyramid(x, zf, 3.8, 26, 6.5, M.stone); }
  }

  // ---------------- Norman east end with apses, demolished after the earthquake of 1250 ----------------
  part('norman-east', 1077, 1257, {label: 'Norman apses'});
  box(T.x1, 116, 0, 20.5, -CLER, CLER, M.flint);
  box(T.x1 - 0.03, T.x1, 0.12, 20.2, -CLER, CLER, M.lime, {edges: false, shadow: false}); // its face seen through the crossing
  roof(T.x1, 116, -CLER, CLER, 20.5, RIDGE - 1, true, M.lead, 0.3);
  add(new THREE.CylinderGeometry(CLER, CLER, 20.5, 16, 1, false, 0, Math.PI).translate(116, 10.25, 0), M.flint);
  add(new THREE.ConeGeometry(CLER + 0.3, 6.5, 16, 1, false, 0, Math.PI).translate(116, 23.75, 0), M.lead);
  for (const s of [-1, 1]) {
    box(T.x1, 110, 0, 10.5, s * CLER, s * 12.5, M.flint);
    leanTo(T.x1, 110, s * CLER, s * 12.5, 13, 10.5, M.tile);
    add(new THREE.CylinderGeometry(3, 3, 10.5, 12, 1, false, 0, Math.PI).translate(110, 5.25, s * 9.4), M.flint);
    for (let k = 0; k < 3; k++) windowAt('z', s * 12.5, s, T.x1 + 1.8 + k * 2.4, 3.6, 1.4, 3.6, 'round', 1, {mat: M.brick});
  }

  // ---------------- Gothic east end: presbytery 1257-90, saints' chapel, retrochoir, Lady Chapel ----------------
  part('presbytery', 1263, 9999, {label: 'Presbytery'});
  const PX0 = T.x1, PX1 = 129.7;
  const pBays = [PX0, 107.6, 112.8, 118.4, 123.6, PX1];
  for (const s of [-1, 1]) {
    arcadeWall(PX0, PX1, 23.5, s < 0 ? -CLER : PIER - 0.76, s < 0 ? -PIER + 0.76 : CLER,
      pBays.slice(1).map((b, i) => [arch((pBays[i] + b) / 2, 0, b - pBays[i] - 2.4, 9.5, 'ee'), arch((pBays[i] + b) / 2, 16.2, 2.6, 5.4, 'ee')]).flat(), M.flint);
    for (let i = 0; i < 5; i++) {
      const c = (pBays[i] + pBays[i + 1]) / 2;
      windowAt('z', s * CLER, s, c, 16.2, 2.6, 5.4, 'pointed', 3);
      windowAt('z', s * 12.5, s, c, 3.2, 2.6, 5.4, 'pointed', 2);
      buttress('z', s * 12.5, s, pBays[i + 1], 9.5, 1.3, 1.1);
    }
    box(PX0, PX1, 0, 10.5, s * 11.3, s * 12.5, M.flint);
    leanTo(PX0, PX1, s * CLER, s * 12.5, 13, 10.5, M.lead);
    parapet(PX0, PX1, s * CLER - 0.2, s * CLER + 0.2, 23.5, 0.8);
  }
  roof(PX0, PX1, -CLER, CLER, 23.5, RIDGE, true, M.lead);
  box(PX1 - 0.6, PX1 + 0.6, 0, 23.5, -CLER, CLER, M.flint);
  windowAt('x', PX1 + 0.6, 1, 0, 13.5, 4.2, 8.5, 'pointed', 4);
  for (const u of [-3.6, 3.6]) windowAt('x', PX1 + 0.6, 1, u, 14, 1.2, 6, 'pointed', 1);
  for (const s of [-1, 1]) { cyl(PX1 + 0.4, s * (CLER + 0.4), 1.2, 0, 28, M.stone, 8); pyramid(PX1 + 0.4, s * (CLER + 0.4), 1.8, 28, 3.5, M.stone, 8); }
  box(PX0, PX1, 0, 0.6, -12.5, 12.5, M.paving, {edges: false, shadow: false});
  for (const s of [-1, 1]) {
    presbyteryBays(pBays, s);
    aisleLining(PX0, PX1, s * 11.3, s, pBays.slice(0, 5).map((b, i) => ({cx: (b + pBays[i + 1]) / 2, y0: 3.2, w: 2.6, h: 5.4, head: 'ee', lights: 2})), pBays.slice(1, 5), {floor: 0.6, top: 10.3});
  }
  presbyteryVault(pBays); // painted timber vault

  part('retrochoir', 1290, 9999, {label: 'Retrochoir'});
  box(130.6, 144.0, 0, 11, -CLER, CLER, M.flint);
  roof(130.6, 144.0, -CLER, CLER, 11, 13.5, true, M.lead);
  for (const s of [-1, 1]) {
    box(130.6, 139.6, 0, 9, s * CLER, s * 12.5, M.flint);
    leanTo(130.6, 139.6, s * CLER, s * 12.5, 10.6, 9, M.lead);
    windowsAlong('z', s * 12.5, s, 130.6, 139.6, 2, 2.8, 2.2, 4.6, 'pointed', 2);
  }
  cyl(141.2, -13.6, 1.5, 0, 15, M.stone, 8); pyramid(141.2, -13.6, 2.2, 15, 3, M.stone, 8);

  part('lady-chapel', 1310, 9999, {label: 'Lady Chapel'});
  const LX0 = 144.0, LX1 = 161.5, LZ = 4.6;
  box(LX0, LX1, 0, 15.5, -LZ, LZ, M.flint);
  roof(LX0, LX1, -LZ, LZ, 15.5, 17.4, true, M.lead, 0);
  parapet(LX0, LX1, -LZ - 0.15, -LZ + 0.35, 15.5, 1.0); parapet(LX0, LX1, LZ - 0.35, LZ + 0.15, 15.5, 1.0);
  for (const x of [LX0 + 2.7, LX0 + 8.1, LX0 + 13.5]) windowAt('z', -LZ, -1, x, 4.8, 3.2, 8.2, 'pointed', 4);
  for (const x of [LX0 + 2.7, LX0 + 8.1]) windowAt('z', LZ, 1, x, 4.8, 3.2, 8.2, 'pointed', 4);
  windowAt('x', LX1, 1, 0, 4.4, 4.6, 9.4, 'pointed', 5);
  for (const s of [-1, 1]) for (const x of [149.8, 155.1]) buttress('z', s * LZ, s, x, 15.5, 2.4, 1.1, M.stone, 3.2);
  for (const s of [-1, 1]) buttress('x', LX1, 1, s * (LZ - 0.5), 15.5, 2.3, 1.1, M.stone, 3.2);
  box(154.8, 162.0, 0, 6, LZ, 9.3, M.flint); roof(154.8, 162.0, LZ, 9.3, 6, 7.6, true, M.lead, 0);

  // ---------------- west end: Early English bays (c.1195-1235) and the fronts ----------------
  part('nave-ee-west', 1195, 9999, {label: 'Early English bays'});
  arcadeWall(5.55, 31.35, WALL_TOP, -CLER, -PIER + 0.76, naveHoles(NAVE_X.slice(0, 5), STYLE_N.slice(0, 4)), M.flint);
  arcadeWall(5.55, 37.90, WALL_TOP, PIER - 0.76, CLER, naveHoles(NAVE_X.slice(0, 6), STYLE_S.slice(0, 5)), M.flint);
  box(5.55, 31.35, 0, AISLE_TOP, AISLE_N, AISLE_N + 1.5, M.flint);
  box(5.55, 37.90, 0, AISLE_TOP, AISLE_S - 1.3, AISLE_S, M.flint);
  leanTo(5.55, 31.35, -CLER, AISLE_N, 13.4, AISLE_TOP, M.tile);
  leanTo(5.55, 37.90, CLER, AISLE_S, 13.4, AISLE_TOP, M.lead);
  for (let i = 0; i < 5; i++) {
    const c = (NAVE_X[i] + NAVE_X[i + 1]) / 2;
    if (i < 4) {
      windowAt('z', AISLE_N, -1, c, 3.4, 2.4, 5.0, 'pointed', 2);
      for (const u of [-1.05, 1.05]) windowAt('z', -CLER, -1, c + u, 15.2, 1.0, 3.8, 'pointed', 1);
      buttress('z', AISLE_N, -1, NAVE_X[i + 1], 9.5, 3.5, 1.4);
    }
    windowAt('z', AISLE_S, 1, c, 3.4, 2.4, 5.0, 'pointed', 2);
    for (const u of [-1.05, 1.05]) windowAt('z', CLER, 1, c + u, 15.2, 1.0, 3.8, 'pointed', 1);
    buttress('z', AISLE_S, 1, NAVE_X[i + 1], 9.5, 2.6, 1.4);
  }
  box(5.55, 31.35, 0, 0.12, AISLE_N, AISLE_S, M.paving, {edges: false, shadow: false});
  naveBays(NAVE_X.slice(0, 5), STYLE_N.slice(0, 4), -1);
  naveBays(NAVE_X.slice(0, 6), STYLE_S.slice(0, 5), 1);
  aisleLining(5.55, 31.35, AISLE_IN_N, -1, aisleWins(0, 4, 'ee'), NAVE_X.slice(1, 4));
  aisleLining(5.55, 37.90, AISLE_IN_S, 1, aisleWins(0, 5, 'ee'), NAVE_X.slice(1, 5));
  naveCeiling(5.55, 31.35, M.ceilNave);

  // Decorated south bays 6-10, rebuilt by Henry Wy after 1323
  part('nave-south-decorated', 1330, 9999, {label: 'Decorated bays'});
  arcadeWall(37.90, 70.14, WALL_TOP, PIER - 0.76, CLER, naveHoles(NAVE_X.slice(5, 11), STYLE_S.slice(5, 10)), M.stone);
  box(37.90, 70.14, 0, AISLE_TOP, AISLE_S - 1.3, AISLE_S, M.flint);
  leanTo(37.90, 70.14, CLER, AISLE_S, 13.4, AISLE_TOP, M.tile);
  for (let i = 5; i < 10; i++) {
    const c = (NAVE_X[i] + NAVE_X[i + 1]) / 2;
    windowAt('z', AISLE_S, 1, c, 3.2, 2.8, 5.4, 'pointed', 3);
    for (const u of [-1.05, 1.05]) windowAt('z', CLER, 1, c + u, 15.2, 1.0, 3.8, 'pointed', 1);
    buttress('z', AISLE_S, 1, NAVE_X[i + 1], 9.5, 3.0, 1.4);
  }
  naveBays(NAVE_X.slice(5, 11), STYLE_S.slice(5, 10), 1);
  aisleLining(37.90, 70.14, AISLE_IN_S, 1, aisleWins(5, 10, 'dec'), NAVE_X.slice(6, 10));

  // Medieval west front (de Cella's porches, Wheathampstead's great window), until Grimthorpe
  part('west-front-medieval', 1235, 1880, {label: 'Medieval west front'});
  box(4.6, 5.55, 0, WALL_TOP + 1, AISLE_N, AISLE_S, M.flint);
  windowAt('x', 4.6, -1, 0, 9, 7.0, 10.5, 'pointed', 7);
  for (const z of [-9.7, 0, 9.6]) { box(1.2, 4.6, 0, z ? 7 : 9, z - (z ? 2.6 : 3), z + (z ? 2.6 : 3), M.stone); windowAt('x', 1.2, -1, z, 0, z ? 2.8 : 3.6, z ? 5 : 6.5, 'pointed', 1); }

  // Grimthorpe's west front (1880-83): detailed in facade.js
  buildWestFront();

  // ---------------- the monastery, 1077 to the Dissolution (1539): schematic ranges round the cloister ----------------
  part('cloister', 1077, 1539, {label: 'Cloister'});
  const G = {x0: 50.4, x1: 83.3, z0: 18.6, z1: 49.4}, W = 3.8;
  for (const [x0, x1, z0, z1] of [[G.x0 - W, G.x1 + W, G.z0 - W, G.z0], [G.x0 - W, G.x1 + W, G.z1, G.z1 + W], [G.x0 - W, G.x0, G.z0, G.z1], [G.x1, G.x1 + W, G.z0, G.z1]]) {
    box(x0, x1, 0, 4.6, z0, z1, M.stone);
  }
  for (const [x0, x1, z0, z1, along] of [[G.x0 - W, G.x1 + W, G.z0 - W, G.z0, true], [G.x0 - W, G.x1 + W, G.z1, G.z1 + W, true], [G.x0 - W, G.x0, G.z0, G.z1, false], [G.x1, G.x1 + W, G.z0, G.z1, false]]) {
    roof(x0, x1, z0, z1, 4.6, 6.4, along, M.tile, 0.2);
  }
  part('monastic-buildings', 1077, 1539, {label: 'Monastic buildings'});
  box(G.x1 + W, G.x1 + W + 11, 0, 11, G.z0 - W, G.z1 + 30, M.flint); // east range: chapter house, dormitory
  roof(G.x1 + W, G.x1 + W + 11, G.z0 - W, G.z1 + 30, 11, 17, false, M.tile);
  box(G.x0 - W, G.x1 + W, 0, 12, G.z1 + W, G.z1 + W + 11, M.flint); // south range: refectory
  roof(G.x0 - W, G.x1 + W, G.z1 + W, G.z1 + W + 11, 12, 18, true, M.tile);
  box(G.x0 - W - 10, G.x0 - W, 0, 10, G.z0 - W, G.z1 + W + 11, M.flint); // west range: cellarer, guest hall
  roof(G.x0 - W - 10, G.x0 - W, G.z0 - W, G.z1 + W + 11, 10, 15, false, M.tile);
  for (let k = 0; k < 6; k++) windowAt('z', G.z1 + W + 11, 1, G.x0 + k * 6, 4, 1.8, 5, 'pointed', 2);
  box(G.x1 + W + 11, G.x1 + W + 30, 0, 9, 40, 52, M.flint); roof(G.x1 + W + 11, G.x1 + W + 30, 40, 52, 9, 14, true, M.tile); // infirmary

  // ---------------- precinct: the Great Gateway (1365) ----------------
  part('abbey-gateway', 1365, 9999, {label: 'Abbey Gateway'});
  {
    const g = new THREE.Group(); g.position.set(-53.3, 0, -0.4); g.rotation.y = THREE.MathUtils.degToRad(-6);
    const save = {parent: g};
    add(new THREE.BoxGeometry(12.2, 12, 31.4).translate(0, 6, 0), M.flint, save);
    add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-6.6, 0), new THREE.Vector2(6.6, 0), new THREE.Vector2(0, 5)]), {depth: 31.8, bevelEnabled: false}).translate(0, 12, -15.9), M.tile, save);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(2.4, 2.4, 15, 8, 1, false, 0, Math.PI).rotateY(s > 0 ? Math.PI / 2 : -Math.PI / 2).translate(s * 6.1, 7.5, -3.2), M.stone, save);
      add(new THREE.CylinderGeometry(2.4, 2.4, 15, 8, 1, false, 0, Math.PI).rotateY(s > 0 ? Math.PI / 2 : -Math.PI / 2).translate(s * 6.1, 7.5, 3.2), M.stone, save);
    }
    const arc = new THREE.Shape(); arc.moveTo(-2.25, 0); arc.lineTo(2.25, 0); arc.lineTo(2.25, 3.4); arc.absarc(0, 3.4, 2.25, 0, Math.PI); arc.closePath();
    for (const s of [-1, 1]) add(new THREE.ShapeGeometry(arc).rotateY(Math.PI / 2).translate(s * 6.15, 0.05, 0), M.glass, {edges: false, parent: g});
    for (const s of [-1, 1]) for (const z of [-11, -6, 6, 11]) for (const y of [4.5, 8.5]) {
      add(new THREE.PlaneGeometry(1.2, 2).rotateY(s > 0 ? Math.PI / 2 : -Math.PI / 2).translate(s * 6.13, y, z), M.glass, {edges: false, shadow: false, parent: g});
    }
    // add the group to the current part
    part('abbey-gateway').group.add(g);
  }

  // ---------------- 20th and 21st century ----------------
  part('chapter-house-1982', 1982, 9999, {label: 'Chapter House'});
  box(86.5, 115.1, 0, 10, 33.8, 43.9, M.redbrick);
  roof(86.5, 115.1, 33.8, 43.9, 10, 14, true, M.tile);
  add(new THREE.CylinderGeometry(4.9, 4.9, 10, 16, 1, false, 0, Math.PI).translate(115.1, 5, 38.8), M.redbrick);
  box(93.7, 97.3, 0, 6, 43.9, 49.7, M.redbrick);
  windowsAlong('z', 43.9, 1, 86.5, 115.1, 7, 3, 1.6, 4.5, 'round', 1, {mat: M.redbrick});
  part('welcome-centre-2019', 2019, 9999, {label: 'Welcome Centre'});
  box(103, 120, 0, 4, 13, 30, M.stone); box(102.6, 120.4, 4, 4.4, 12.6, 30.4, M.lead, {threshold: 40});
  box(88, 104, 0, 4, 29, 34, M.stone);
  for (let k = 0; k < 5; k++) windowAt('x', 120, 1, 15 + k * 3.2, 0.6, 2.4, 2.8, 'flat', 1);

  // ---------------- interior furnishings, each in its own dated part (interior.js) ----------------
  buildInterior();
}
