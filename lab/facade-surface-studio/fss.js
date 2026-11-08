/* Facade Surface Studio · 曲面幕牆工作室. Lab tool, anzonwong.com, Nov 2026. three.js 0.170.0 (MIT) only.
   Definition: Surface -> Divide -> Pattern -> Driver -> Rationalise -> Analyse -> Export. A change marks its step dirty and
   re-runs that step and every step after it (like a Grasshopper definition). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as G from './geom.js';
import * as IO from './io.js';

const ZH = document.documentElement.getAttribute('data-lang') === 'zh';
const T = (en, zh) => (ZH ? zh : en);
const $ = (id) => document.getElementById(id);
const COARSE = matchMedia('(pointer: coarse)').matches;
const PHONE = COARSE || innerWidth < 700;
const CAP = PHONE ? 3000 : 7000;
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const NODES = ['surface', 'divide', 'pattern', 'driver', 'rational', 'analyse', 'export'];
const PAT_NAME = { quad: T('Quad', '方格'), diamond: T('Diamond', '菱形'), triangle: T('Triangle', '三角'), hex: T('Hex', '六角'), perforated: T('Perforated', '穿孔'), fins: T('Fins', '鰭片'), pyramids: T('Pyramids', '金字塔') };
const FP_NAME = { rounded: T('Rounded', '圓角'), rect: T('Rectangle', '長方'), L: T('L-shape', 'L 形'), circle: T('Circle', '圓形') };
const HEAT_NAME = { plan: T('Planarity', '平整度'), K: T('Gaussian K', '高斯曲率'), H: T('Mean H', '平均曲率'), sun: T('Sun', '日照') };
const BASE_COL = { quad: '#a9aeb2', diamond: '#b49c74', triangle: '#c2bdb2', hex: '#b0935f', perforated: '#9fa4a8', fins: '#d9d2c3', pyramids: '#ad9f86' };
const CITY = { hk: 22.3, ldn: 51.5 };

/* ------------------------------------------------------------------ presets */
function lattice(nu, nv, fd, fy) { const d = [], y = []; for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { d.push(fd(i, j, nu, nv)); y.push(fy ? fy(i, j, nu, nv) : 0); } return { d, y }; }
const BASE = {
  r: 10, deg: 3, twist: 0, taper: 0, oMin: 4, oMax: 62, finDepth: 0.6, finMin: 0, finMax: 70, pyrMin: 0.05, pyrMax: 0.9,
  w: { att: 80, curve: 0, curv: 15, sun: 25, view: 0, height: 20 }, R: 16, Rc: 6,
  atts: [{ u: 0.06, v: 0.2, off: 1.5 }], curve: { pts: [[0.28, 0.12], [0.33, 0.55], [0.4, 0.9]] },
  city: 'hk', month: 6, hour: 15, view: { x: 0, z: 70, mode: 'dist', R: 80 }, hInvert: false, invert: false, stretch: true,
  N: 6, basis: 'opening', tol: 25, snap: false, heat: 'plan', ptol: 5, tower: true, showLat: true, sel: -1
};
const PRESETS = {
  wave: () => Object.assign({}, BASE, { fp: 'rounded', W: 64, D: 40, r: 10, H: 19.5, storeys: 4, nu: 8, nv: 4, nU: 144, nV: 16, pat: 'diamond',
    ...lattice(8, 4, (i, j, nu) => [0, 3.4, 0.6, 4.6][j] * Math.sin(G.TAU * 2 * i / nu + [0, 0, 1.6, 3.0][j]), (i, j, nu) => j === 3 ? 2.2 * Math.sin(G.TAU * 2 * i / nu + 3.0) : 0),
    w: { att: 100, curve: 0, curv: 10, sun: 15, view: 0, height: 15 }, R: 19, oMin: 2, oMax: 72, atts: [{ u: 0.035, v: 0.38, off: 1.5 }],
    month: 11, hour: 10.5, cam: [0.8, 0.3, 1.1] }),
  twist: () => Object.assign({}, BASE, { fp: 'rounded', W: 44, D: 44, r: 6, H: 26, storeys: 6, nu: 8, nv: 4, nU: 96, nV: 20, pat: 'quad', twist: 22, taper: 14,
    ...lattice(8, 4, () => 0), oMin: 6, oMax: 58, w: { att: 0, curve: 0, curv: 0, sun: 70, view: 0, height: 35 }, atts: [], hour: 10, month: 12,
    cam: [1.0, 0.36, 1.25] }),
  fold: () => Object.assign({}, BASE, { fp: 'rect', W: 66, D: 30, H: 15, storeys: 3, nu: 12, nv: 3, deg: 1, nU: 120, nV: 10, pat: 'triangle', tower: false,
    ...lattice(12, 3, (i, j) => [0, i % 2 ? 1.8 : -0.9, (i % 2 ? 1.2 : -1.2) + 5][j], (i, j) => j === 2 ? (i % 2 ? 1.6 : -1.0) : 0),
    oMin: 0, oMax: 55, w: { att: 0, curve: 0, curv: 0, sun: 0, view: 80, height: 35 }, atts: [], view: { x: 8, z: 46, mode: 'angle', R: 80 },
    month: 11, hour: 10, cam: [0.8, 0.32, 1.2] }),
  fins: () => Object.assign({}, BASE, { fp: 'circle', W: 54, D: 54, H: 22, storeys: 5, nu: 10, nv: 4, nU: 150, nV: 5, pat: 'fins',
    ...lattice(10, 4, (i, j, nu) => [0, 1.6, 2.4, 0.8][j] * Math.sin(G.TAU * 3 * i / nu + j)),
    finDepth: 0.7, finMin: -10, finMax: 70, w: { att: 0, curve: 0, curv: 0, sun: 100, view: 0, height: 0 }, atts: [], hour: 15.5, month: 6, N: 6,
    cam: [0.95, 0.34, 1.2] }),
  flat: () => Object.assign({}, BASE, { fp: 'rect', W: 54, D: 24, H: 18, storeys: 4, nu: 8, nv: 4, nU: 60, nV: 15, pat: 'perforated',
    ...lattice(8, 4, () => 0), oMin: 6, oMax: 45, w: { att: 80, curve: 0, curv: 0, sun: 0, view: 0, height: 25 }, atts: [{ u: 0.0, v: 0.25, off: 1.5 }], N: 6,
    month: 11, hour: 10, cam: [0.5, 0.22, 1.3] })
};

/* ------------------------------------------------------------------ state */
let S = null, presetName = 'wave';
let surf = null, fp = null, panels = [], types = [], model = null, drv = null, sun = null;
let dirty = 7, raf = 0, active = 'surface', view = 'material', kmInit = null;
const timing = {};
const ui = { drag: null, interacted: false, needs: true };

/* ------------------------------------------------------------------ three.js scene */
const stage = $('fs-stage'), cv = $('fs-canvas');
if (!stage || !cv) throw new Error('no stage');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.fog = new THREE.Fog(0xdfe4e8, 320, 1000);
const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 3000);
const controls = new OrbitControls(camera, cv);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 8; controls.maxDistance = 600;
controls.autoRotate = true; controls.autoRotateSpeed = 0.45;
controls.addEventListener('change', () => { ui.needs = true; });

{ // sky dome: vertical gradient
  const g = new THREE.SphereGeometry(1400, 32, 16), c = [], top = new THREE.Color('#8fb0cc'), mid = new THREE.Color('#e3e8ec'), bot = new THREE.Color('#d9d5ce');
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 1400, col = y > 0 ? mid.clone().lerp(top, Math.pow(y, 0.6)) : mid.clone().lerp(bot, Math.min(1, -y * 4)); c.push(col.r, col.g, col.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
}
const hemi = new THREE.HemisphereLight(0xf2f5f8, 0xb9b2a5, 0.85); scene.add(hemi);
const sunL = new THREE.DirectionalLight(0xfff1dc, 2.3); sunL.castShadow = true;
sunL.shadow.mapSize.set(PHONE ? 1024 : 2048, PHONE ? 1024 : 2048); sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.06;
scene.add(sunL, sunL.target);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1200, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb9b5ac, roughness: 0.95 }));
ground.receiveShadow = true; ground.position.y = -0.02; scene.add(ground);
const grid = new THREE.GridHelper(600, 60, 0x8f948f, 0xb4b6b2); grid.material.transparent = true; grid.material.opacity = 0.16; grid.position.y = 0.01; scene.add(grid);
{ // north arrow on the ground
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#2a2f35'; x.beginPath(); x.moveTo(64, 8); x.lineTo(92, 92); x.lineTo(64, 76); x.lineTo(36, 92); x.closePath(); x.fill();
  x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.fillText('N', 64, 124);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.name = 'north'; scene.add(m);
}
const MAT = {
  panel: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.62, roughness: 0.34, side: THREE.DoubleSide, envMapIntensity: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1d2830, metalness: 0.1, roughness: 0.18, envMapIntensity: 0.6 }),
  slab: new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.9, side: THREE.DoubleSide }),
  apron: new THREE.MeshStandardMaterial({ color: 0xe4e0d8, roughness: 0.9 }),
  roof: new THREE.MeshStandardMaterial({ color: 0xc9c5bc, roughness: 0.85, side: THREE.DoubleSide }),
  tower: null,
  ctrl: new THREE.MeshBasicMaterial({ color: 0xc8ff2e, depthTest: false, transparent: true, opacity: 0.95 }),
  ctrlSel: new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
  latt: new THREE.LineBasicMaterial({ color: 0x86ad00, depthTest: false, transparent: true, opacity: 0.55 }),
  att: new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 0.8, roughness: 0.4 }),
  halo: null,
  curve: new THREE.MeshStandardMaterial({ color: 0x1fa2ff, emissive: 0x0077dd, emissiveIntensity: 0.7 }),
  curveLine: new THREE.LineBasicMaterial({ color: 0x1fa2ff }),
  viewer: new THREE.MeshStandardMaterial({ color: 0x8a4fff, emissive: 0x5a20d0, emissiveIntensity: 0.6 })
};
{ // tower facade texture: floor bands and mullions
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#5f7686'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#b9c3c9'; x.fillRect(0, 0, 128, 12); x.fillStyle = '#4a5f6d'; for (let k = 0; k < 4; k++) x.fillRect(k * 32, 0, 3, 128);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  MAT.tower = new THREE.MeshStandardMaterial({ color: 0xf1f2f3, transparent: true, opacity: 0.62, metalness: 0.0, roughness: 0.55, depthWrite: true });
  MAT.towerEdge = new THREE.LineBasicMaterial({ color: 0x9aa3aa, transparent: true, opacity: 0.8 });
  MAT.context = new THREE.MeshStandardMaterial({ color: 0xf3f2ef, roughness: 0.92 });
  MAT.contextEdge = new THREE.LineBasicMaterial({ color: 0xb4b8b9 }); void t;
}
{ // soft orange halo around attractors
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,140,40,0.55)'); gr.addColorStop(0.35, 'rgba(255,120,30,0.18)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  MAT.halo = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, transparent: true });
}
const world = new THREE.Group(); scene.add(world);
const markers = new THREE.Group(); scene.add(markers);
let meshContext = null, meshApron = null, meshPanels = null, meshGlass = null, meshSlabs = null, meshRoof = null, meshTower = null, latLines = null;
let ctrlMeshes = [], attMeshes = [], curveMeshes = [], curveLine = null, viewerMesh = null;
let pv0 = null, pvn = null;   // per panel: first vertex, vertex count in the panel mesh

/* ------------------------------------------------------------------ stages */
let fpKey = '';
function stageSurface() {
  const key = [S.fp, S.W, S.D, S.r].join('|'); if (key !== fpKey || !fp) { fp = new G.Footprint(S.fp, S.W, S.D, S.r); fpKey = key; }
  surf = new G.Surface({ fp, H: S.H, nu: S.nu, nv: S.nv, deg: S.deg, d: Float64Array.from(S.d), y: Float64Array.from(S.y), twist: S.twist, taper: S.taper / 100, cx: 0, cz: 0 });
  buildSkin(); buildCtrl();
}
function effectiveDivision() {
  let nU = S.nU, nV = S.nV;
  if (S.pat === 'diamond' && nU % 2) nU++;
  const n = G.panelCount(S.pat, nU, nV); let capped = false;
  if (n > CAP) { const k = Math.sqrt(CAP / n); nU = Math.max(8, Math.floor(nU * k / 2) * 2); nV = Math.max(2, Math.floor(nV * k)); capped = true; }
  return { nU, nV, capped };
}
let div = null;
function stageDivide() { div = effectiveDivision(); panels = G.divide(S.pat, div.nU, div.nV); }
function stagePattern() { G.mapPanels(surf, panels, S.pat, !ui.drag || S.w.curv > 0 || (view === 'heat' && (S.heat === 'K' || S.heat === 'H'))); }
function stageDriver() {
  sun = G.sunVector(CITY[S.city], S.month, S.hour);
  drv = G.drivers(surf, panels, { w: S.w, R: S.R, Rc: S.Rc, atts: S.atts, curve: { on: S.w.curve > 0, pts: S.curve.pts }, sun, view: S.view, hInvert: S.hInvert, invert: S.invert, stretch: S.stretch });
  for (const p of panels) p.val0 = G.valueFromT(p.t, S.pat, S);
  placeSun(); buildMarkers();
}
function stageRational(quick) {
  const X = panels.map(p => G.features(p, S.pat, p.val0, S.basis));
  const k = Math.min(S.N, panels.length);
  const res = G.kmeans(X, k, 30, quick && kmInit && kmInit.length === k && kmInit[0].length === X[0].length ? kmInit : null);
  if (!quick) kmInit = res.C;
  // order types from most solid / smallest to most open / largest
  const tmp = []; for (let c = 0; c < k; c++) tmp.push({ c, sum: 0, n: 0 });
  panels.forEach((p, i) => { const q = tmp[res.lab[i]]; p.op0 = G.openingOf(p, p.val0, S.pat); q.sum += p.op0; q.n++; });
  const used = tmp.filter(q => q.n).sort((a, b) => a.sum / a.n - b.sum / b.n);
  const remap = new Map(); used.forEach((q, i) => remap.set(q.c, i));
  types = used.map((q, i) => ({ name: 'T' + (i + 1), colour: G.TYPE_COLOURS[i % 12], count: q.n, op: q.sum / q.n, C: res.C[q.c], dev: 0, rep: -1, repD: Infinity }));
  panels.forEach((p, i) => {
    const ti = remap.get(res.lab[i]), ty = types[ti]; p.type = ti;
    p.val = S.snap ? G.valFromOp(p, ty.op, S.pat) : p.val0;
    let dd = 0; const x = X[i]; for (let q = 0; q < x.length; q++) dd += (x[q] - ty.C[q]) ** 2;
    if (dd < ty.repD) { ty.repD = dd; ty.rep = i; }
  });
}
function typeShapes() {
  // per panel: opc = how much snapping changes its opening (mm; degrees for fins); shp = how far its shape is from the type's
  // mean shape (mm). dev = what the chosen grouping promises to hold: opening -> opc, shape -> shp, both -> the larger.
  const n0 = G.shapeVec(panels[0], S.pat).length;
  const key = (p) => p.type * 10 + (p.edges ? p.edges.length : 1), acc = new Map(), cnt = new Map();
  for (const p of panels) { const g = G.shapeVec(p, S.pat), k = key(p); if (!acc.has(k)) { acc.set(k, new Float64Array(n0)); cnt.set(k, 0); } cnt.set(k, cnt.get(k) + 1); const a = acc.get(k); for (let q = 0; q < n0; q++) a[q] += g[q]; }
  for (const [k, a] of acc) { const c = cnt.get(k); for (let q = 0; q < n0; q++) a[q] /= c; }
  types.forEach((t) => { t.dev = 0; t.shp = 0; t.opc = 0; });
  for (const p of panels) {
    const ty = types[p.type], g = G.shapeVec(p, S.pat), m = acc.get(key(p)); let dg = 0;
    for (let q = 0; q < n0; q++) dg = Math.max(dg, Math.abs(g[q] - m[q]));
    const opc = Math.abs(p.op0 - ty.op);
    p.shp = dg; p.opc = opc;
    p.dev = S.basis === 'opening' ? opc : S.basis === 'shape' ? dg : Math.max(dg, S.pat === 'fins' ? opc * 20 : opc);
    ty.dev = Math.max(ty.dev, p.dev); ty.shp = Math.max(ty.shp, dg); ty.opc = Math.max(ty.opc, opc);
  }
}
let prevLab = null;
function stageRationalAll(quick) {
  if (quick && prevLab && prevLab.length === panels.length && types.length) {
    // while dragging: keep each panel's type, only re-evaluate its value (full clustering runs on release)
    panels.forEach((p, i) => { p.type = prevLab[i]; p.op0 = G.openingOf(p, p.val0, S.pat); p.val = S.snap ? G.valFromOp(p, types[p.type].op, S.pat) : p.val0; });
    buildPanels(); return;
  }
  stageRational(quick);
  typeShapes();
  prevLab = Int32Array.from(panels, p => p.type);
  buildPanels();
}

/* ------------------------------------------------------------------ geometry builders */
function buildSkin() {
  for (const m of [meshGlass, meshSlabs, meshRoof, meshTower]) if (m) { world.remove(m); m.geometry.dispose(); }
  const lo = !!ui.drag, GU = lo ? 120 : Math.min(PHONE ? 220 : 360, Math.max(140, S.nU * 2)), GV = lo ? 14 : Math.max(20, Math.min(48, S.nV * 2));
  const P = new Float32Array((GU + 1) * (GV + 1) * 3), UV = new Float32Array((GU + 1) * (GV + 1) * 2), o = {};
  for (let j = 0; j <= GV; j++) for (let i = 0; i <= GU; i++) { const k = j * (GU + 1) + i; surf.eval(i / GU, j / GV, o); P.set([o.x, o.y, o.z], k * 3); UV.set([i / GU, j / GV], k * 2); }
  // offset the glass inwards along the grid normal so panels read in front of it
  const off = S.pat === 'fins' ? -0.02 : -0.32, Q = new Float32Array(P.length);
  const at = (i, j) => { i = (i + GU) % GU; j = Math.max(0, Math.min(GV, j)); const k = (j * (GU + 1) + i) * 3; return [P[k], P[k + 1], P[k + 2]]; };
  for (let j = 0; j <= GV; j++) for (let i = 0; i <= GU; i++) {
    const su = G.sub(at(i + 1, j), at(i - 1, j)), sv = G.sub(at(i, j + 1), at(i, j - 1));
    let n = G.norm3(G.cross(su, sv)); const f = fp.at(i / GU, {}); if (n[0] * f.nx + n[2] * f.nz < 0) n = G.mul(n, -1);
    const k = (j * (GU + 1) + i) * 3; Q[k] = P[k] + n[0] * off; Q[k + 1] = P[k + 1] + n[1] * off; Q[k + 2] = P[k + 2] + n[2] * off;
  }
  const idx = [];
  for (let j = 0; j < GV; j++) for (let i = 0; i < GU; i++) { const a = j * (GU + 1) + i, b = a + 1, c = a + GU + 1, d = c + 1; idx.push(a, d, b, a, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Q, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setIndex(idx); g.computeVertexNormals();
  meshGlass = new THREE.Mesh(g, MAT.glass); meshGlass.name = 'skin'; meshGlass.castShadow = true; meshGlass.receiveShadow = true; world.add(meshGlass);
  // floor slab edges seen through the openings
  const sl = [], o2 = {};
  for (let s = 1; s < (lo ? 1 : S.storeys); s++) {
    const v = s / S.storeys, h = 0.16 / S.H;
    for (let i = 0; i < GU; i++) {
      const q = [[i / GU, v - h], [(i + 1) / GU, v - h], [(i + 1) / GU, v + h], [i / GU, v + h]].map(([u, w]) => { surf.eval(u, w, o2); const f = fp.at(u, {}); return [o2.x - f.nx * 0.24, o2.y, o2.z - f.nz * 0.24]; });
      sl.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
    }
  }
  if (sl.length) { const gs = new THREE.BufferGeometry(); gs.setAttribute('position', new THREE.Float32BufferAttribute(sl, 3)); gs.computeVertexNormals(); meshSlabs = new THREE.Mesh(gs, MAT.slab); meshSlabs.name = 'slabs'; world.add(meshSlabs); } else meshSlabs = null;
  // roof: the top ring, triangulated in plan
  const ring = [], ys = []; for (let i = 0; i < GU; i++) { const k = (GV * (GU + 1) + i) * 3; ring.push(new THREE.Vector2(Q[k], Q[k + 2])); ys.push(Q[k + 1]); }
  let tris = []; try { tris = THREE.ShapeUtils.triangulateShape(ring, []); } catch (e) { tris = []; }
  const rp = []; for (const t of tris) for (const k of t) rp.push(ring[k].x, ys[k] - 0.05, ring[k].y);
  const gr = new THREE.BufferGeometry(); gr.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); gr.computeVertexNormals();
  meshRoof = new THREE.Mesh(gr, MAT.roof); meshRoof.name = 'roof'; meshRoof.receiveShadow = true; meshRoof.castShadow = true; world.add(meshRoof);
  // context tower
  if (S.tower) {
    const top = Math.max(...ys), th = 48, tw = S.fp === 'circle' ? 0 : S.W * 0.46, td = S.D * 0.42;
    const gt = S.fp === 'circle' ? new THREE.CylinderGeometry(S.W * 0.24, S.W * 0.24, th, 48, 1) : new THREE.BoxGeometry(tw, th, td);
    meshTower = new THREE.Mesh(gt, MAT.tower); meshTower.name = 'tower'; meshTower.position.set(S.fp === 'L' ? -S.W * 0.22 : 0, top + th / 2, S.fp === 'L' ? -S.D * 0.05 : -S.D * 0.08);
    meshTower.rotation.y = -S.twist * Math.PI / 180; meshTower.castShadow = true; meshTower.receiveShadow = true; world.add(meshTower);
    const fl = []; for (let z = 3.6; z < th; z += 3.6) { const yy = -th / 2 + z; if (S.fp === 'circle') { const r = S.W * 0.24 + 0.02; for (let k = 0; k < 48; k++) { const a0 = k / 48 * G.TAU, a1 = (k + 1) / 48 * G.TAU; fl.push(r * Math.cos(a0), yy, r * Math.sin(a0), r * Math.cos(a1), yy, r * Math.sin(a1)); } } else { const x = tw / 2 + 0.02, zz = td / 2 + 0.02; fl.push(-x, yy, zz, x, yy, zz, x, yy, zz, x, yy, -zz, x, yy, -zz, -x, yy, -zz, -x, yy, -zz, -x, yy, zz); } }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(fl, 3));
    meshTower.add(new THREE.LineSegments(ge, MAT.towerEdge), new THREE.LineSegments(new THREE.EdgesGeometry(gt), MAT.towerEdge));
  } else meshTower = null;
  // pavement apron: the footprint grown by 7 m
  const apr = []; for (let i = 0; i < 240; i++) { const f = fp.at(i / 240, {}); apr.push(new THREE.Vector2(f.x + f.nx * 7, f.z + f.nz * 7)); }
  let at2 = []; try { at2 = THREE.ShapeUtils.triangulateShape(apr, []); } catch (e) { at2 = []; }
  const ap = []; for (const t of at2) for (const k of t) ap.push(apr[k].x, 0.12, apr[k].y);
  if (meshApron) { world.remove(meshApron); meshApron.geometry.dispose(); }
  const ga = new THREE.BufferGeometry(); ga.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3)); ga.computeVertexNormals();
  meshApron = new THREE.Mesh(ga, MAT.apron); meshApron.receiveShadow = true; world.add(meshApron);
  if (meshContext) { world.remove(meshContext); meshContext.traverse(o => o.geometry && o.geometry.dispose()); }
  meshContext = new THREE.Group(); meshContext.name = 'context';
  const hw = S.W / 2 + 7 + 18, hd = S.D / 2 + 7 + 18, blocks = [
    [-hw - 16, -hd * 0.1, 26, 30, 16], [-hw - 14, hd * 0.9, 22, 22, 10], [-S.W * 0.3, -hd - 22, 34, 24, 22], [S.W * 0.28, -hd - 20, 28, 22, 12],
    [hw + 16, -hd * 0.5, 24, 28, 26], [hw + 18, hd * 0.7, 28, 18, 9], [-hw - 50, -hd - 44, 30, 30, 34], [hw + 52, -hd - 48, 34, 28, 20]];
  for (const [x, z, w, d, h] of blocks) {
    const g = new THREE.BoxGeometry(w, h, d); const m = new THREE.Mesh(g, MAT.context); m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), MAT.contextEdge)); meshContext.add(m);
  }
  meshContext.visible = S.tower; world.add(meshContext);
  const north = scene.getObjectByName('north'); north.position.set(S.W / 2 + 14, 0.03, -S.D / 2 - 10);
}
function buildCtrl() {
  for (const m of ctrlMeshes) markers.remove(m); ctrlMeshes = [];
  if (latLines) { markers.remove(latLines); latLines.geometry.dispose(); latLines = null; }
  if (!S.showLat) return;
  const sg = new THREE.SphereGeometry(0.5, 16, 10), o = {}, pos = [];
  for (let j = 0; j < S.nv; j++) for (let i = 0; i < S.nu; i++) {
    surf.ctrl(i, j, o); pos.push([o.x, o.y, o.z]);
    const m = new THREE.Mesh(sg, j * S.nu + i === S.sel ? MAT.ctrlSel : MAT.ctrl); m.position.set(o.x, o.y, o.z); m.renderOrder = 10;
    m.userData = { kind: 'ctrl', k: j * S.nu + i }; markers.add(m); ctrlMeshes.push(m);
  }
  const L = [];
  for (let j = 0; j < S.nv; j++) for (let i = 0; i < S.nu; i++) {
    const a = pos[j * S.nu + i], b = pos[j * S.nu + (i + 1) % S.nu]; L.push(...a, ...b);
    if (j + 1 < S.nv) L.push(...a, ...pos[(j + 1) * S.nu + i]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
  latLines = new THREE.LineSegments(g, MAT.latt); latLines.renderOrder = 9; markers.add(latLines);
}
function buildMarkers() {
  for (const m of attMeshes.concat(curveMeshes)) markers.remove(m); attMeshes = []; curveMeshes = [];
  if (curveLine) { markers.remove(curveLine); curveLine = null; }
  if (viewerMesh) { markers.remove(viewerMesh); viewerMesh = null; }
  const sg = new THREE.SphereGeometry(1.15, 24, 16);
  drv.attPts.forEach((p, k) => {
    const m = new THREE.Mesh(sg, MAT.att); m.position.set(...p); m.userData = { kind: 'att', k }; m.castShadow = true;
    if (S.w.att > 0) { const h = new THREE.Sprite(MAT.halo); h.scale.setScalar(Math.min(S.R * 0.9, 14)); h.raycast = () => {}; m.add(h); }
    markers.add(m); attMeshes.push(m);
  });
  if (S.w.curve > 0) {
    S.curve.pts.forEach((q, k) => { const f = surf.frame(q[0], q[1]), p = G.add([f.P.x, f.P.y, f.P.z], G.mul(f.n, 0.6)); const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10), MAT.curve); m.position.set(...p); m.userData = { kind: 'curve', k }; markers.add(m); curveMeshes.push(m); });
    const g = new THREE.BufferGeometry().setFromPoints(drv.curvePts.map(p => new THREE.Vector3(...p))); curveLine = new THREE.Line(g, MAT.curveLine); markers.add(curveLine);
  }
  if (S.w.view > 0) {
    viewerMesh = new THREE.Group(); viewerMesh.userData = { kind: 'viewer' };
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.4, 16), MAT.viewer); body.position.y = 0.7;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), MAT.viewer); head.position.y = 1.65;
    for (const c of [body, head]) { c.userData = { kind: 'viewer' }; c.castShadow = true; viewerMesh.add(c); }
    viewerMesh.scale.setScalar(1.6); viewerMesh.position.set(S.view.x, 0, S.view.z); markers.add(viewerMesh);
  }
}
function placeSun() {
  const R = Math.max(S.W, S.D) * 0.9 + 30, v = sun.alt > 2 ? sun.v : G.norm3([sun.v[0], 0.05, sun.v[2]]);
  sunL.position.set(v[0] * 260, v[1] * 260 + 5, v[2] * 260); sunL.target.position.set(0, S.H * 0.4, 0);
  const sc = sunL.shadow.camera; sc.left = sc.bottom = -R; sc.right = sc.top = R; sc.near = 10; sc.far = 600; sc.updateProjectionMatrix();
  sunL.intensity = sun.alt > 2 ? 2.3 : 0.4; hemi.intensity = sun.alt > 2 ? 0.7 : 1.0;
}
function rot(v, k, a) { // Rodrigues: v about unit axis k by a
  const c = Math.cos(a), s = Math.sin(a), kv = G.dot(k, v), kx = G.cross(k, v);
  return [v[0] * c + kx[0] * s + k[0] * kv * (1 - c), v[1] * c + kx[1] * s + k[1] * kv * (1 - c), v[2] * c + kx[2] * s + k[2] * kv * (1 - c)];
}
function buildPanels() {
  if (meshPanels) { world.remove(meshPanels); meshPanels.geometry.dispose(); }
  const pos = [], pat = S.pat; pv0 = new Int32Array(panels.length); pvn = new Int32Array(panels.length);
  const tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  panels.forEach((p, i) => {
    pv0[i] = pos.length / 3;
    if (pat === 'fins') {
      const a = Math.PI / 180 * p.val, d = S.finDepth;
      const da = rot(p.bn[0], p.bt[0], a), db = rot(p.bn[1], p.bt[1], a);
      const A = p.base[0], B = p.base[1], A2 = G.add(A, G.mul(da, d)), B2 = G.add(B, G.mul(db, d));
      p.finQuad = [A, B, B2, A2]; tri(A, B, B2); tri(A, B2, A2);
      // thin back face so the fin reads with some thickness
      const t = G.mul(G.norm3(G.cross(G.sub(B, A), da)), 0.035);
      tri(G.add(A, t), G.add(B2, t), G.add(B, t)); tri(G.add(A, t), G.add(A2, t), G.add(B2, t));
    } else if (pat === 'pyramids') {
      const ap = G.add(p.cen, G.mul(p.fn, p.val));
      for (let k = 0; k < p.P.length; k++) tri(p.P[k], p.P[(k + 1) % p.P.length], ap);
    } else if (pat === 'perforated') {
      const n = p.fn, c = p.cen; let e1 = G.sub(p.P[1], p.P[0]); e1 = G.norm3(G.sub(e1, G.mul(n, G.dot(e1, n)))); const e2 = G.cross(n, e1);
      const r = Math.min(Math.sqrt(p.val * p.area / Math.PI), p.inr * 0.92), M = 20;
      const P2 = p.P.map(q => { const d = G.sub(q, c); return [G.dot(d, e1), G.dot(d, e2)]; });
      let prevO = null, prevI = null, firstO = null, firstI = null;
      for (let k = 0; k <= M; k++) {
        const ang = (k % M) / M * G.TAU + Math.PI / 4, dx = Math.cos(ang), dy = Math.sin(ang);
        let O = null;
        for (let e = 0; e < P2.length && !O; e++) {
          const a = P2[e], b = P2[(e + 1) % P2.length], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-12) continue;
          const t = (a[0] * ey - a[1] * ex) / den, s = (a[0] * dy - a[1] * dx) / den;
          if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) O = lerp(p.P[e], p.P[(e + 1) % p.P.length], Math.min(1, Math.max(0, s)));
        }
        if (!O) O = c;
        const I = r > 0.005 ? G.add(c, G.add(G.mul(e1, dx * r), G.mul(e2, dy * r))) : c;
        if (k === 0) { firstO = O; firstI = I; } else { tri(prevO, O, I); tri(prevO, I, prevI); }
        prevO = O; prevI = I;
        if (k === M) { /* closed: last point equals first angle */ }
      }
      // fill the corners the 20 rays skip
      for (let k = 0; k < p.P.length; k++) {
        const q = p.P[k], ang = Math.atan2(G.dot(G.sub(q, c), e2), G.dot(G.sub(q, c), e1)), a0 = ang - Math.PI / 4;
        const s0 = Math.floor(((a0 + 8 * Math.PI) % G.TAU) / G.TAU * M), s1 = s0 + 1;
        const ray = (s) => { const an = (s % M) / M * G.TAU + Math.PI / 4; return [Math.cos(an), Math.sin(an)]; };
        const hit = (dxy) => { for (let e = 0; e < P2.length; e++) { const a = P2[e], b = P2[(e + 1) % P2.length], ex = b[0] - a[0], ey = b[1] - a[1], den = dxy[0] * ey - dxy[1] * ex; if (Math.abs(den) < 1e-12) continue; const t = (a[0] * ey - a[1] * ex) / den, s = (a[0] * dxy[1] - a[1] * dxy[0]) / den; if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) return lerp(p.P[e], p.P[(e + 1) % p.P.length], Math.min(1, Math.max(0, s))); } return c; };
        const A = hit(ray(s0)), B = hit(ray(s1)); tri(A, q, B);
      }
      void firstO; void firstI;
    } else {
      const k = Math.sqrt(Math.max(0, p.val)), c = p.cen;
      if (k < 0.06) { for (let e = 0; e < p.P.length; e++) tri(c, p.P[e], p.P[(e + 1) % p.P.length]); }
      else {
        const I = p.P.map(q => G.add(c, G.mul(G.sub(q, c), k)));
        for (let e = 0; e < p.P.length; e++) { const e2 = (e + 1) % p.P.length; tri(p.P[e], p.P[e2], I[e2]); tri(p.P[e], I[e2], I[e]); }
      }
    }
    pvn[i] = pos.length / 3 - pv0[i];
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3)); g.computeVertexNormals();
  meshPanels = new THREE.Mesh(g, MAT.panel); meshPanels.name = 'panels'; meshPanels.castShadow = true; meshPanels.receiveShadow = true; world.add(meshPanels);
}

/* ------------------------------------------------------------------ analyse: colours */
let heatRange = null;
function heatValue(p) {
  if (S.heat === 'plan') return (p.plan || 0) * 1000;
  if (S.heat === 'K') return Math.abs(p.K || 0);
  if (S.heat === 'H') return Math.abs(p.H || 0);
  return p.dv ? p.dv.sun : 0;
}
function stageAnalyse() {
  const col = meshPanels.geometry.attributes.color, c = new THREE.Color();
  let lo = 0, hi = 1;
  if (view === 'heat') {
    const vals = panels.map(heatValue).sort((a, b) => a - b);
    if (S.heat === 'plan') hi = Math.max(S.ptol * 3, 0.1); else if (S.heat === 'sun') hi = 1; else hi = vals[Math.floor(vals.length * 0.95)] || 1e-6;
    heatRange = [lo, hi];
  }
  const base = new THREE.Color(BASE_COL[S.pat]);
  panels.forEach((p, i) => {
    if (view === 'types') c.set(types[p.type].colour);
    else if (view === 'driver') c.setRGB(...G.heat(p.t), THREE.SRGBColorSpace);
    else if (view === 'heat') c.setRGB(...G.heat((heatValue(p) - lo) / (hi - lo || 1)), THREE.SRGBColorSpace);
    else c.copy(base);
    const A = col.array; for (let v = pv0[i] * 3, e = (pv0[i] + pvn[i]) * 3; v < e; v += 3) { A[v] = c.r; A[v + 1] = c.g; A[v + 2] = c.b; }
  });
  col.needsUpdate = true;
  MAT.panel.metalness = view === 'material' ? 0.55 : 0.1; MAT.panel.roughness = view === 'material' ? 0.38 : 0.6; MAT.panel.envMapIntensity = view === 'material' ? 0.9 : 0.35;
  legend();
}

/* ------------------------------------------------------------------ run */
function touch(node) { dirty = Math.min(dirty, NODES.indexOf(node)); schedule(); }
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; run(); }); }
function timed(name, fn) { const t0 = performance.now(); fn(); timing[name] = performance.now() - t0; }
function run() {
  const from = dirty; if (from > 6) return; dirty = 7;
  const quick = !!ui.drag && !ui.drag.coarse;
  for (const n of NODES) if (NODES.indexOf(n) >= from) timing[n] = 0;
  if (from <= 0) timed('surface', stageSurface);
  if (from <= 1) timed('divide', stageDivide);
  if (from <= 2) timed('pattern', stagePattern);
  if (from <= 3) timed('driver', stageDriver);
  if (from <= 4) timed('rational', () => stageRationalAll(quick));
  if (from <= 5) timed('analyse', stageAnalyse);
  timing.export = 0;
  model = { panels, types, pat: S.pat, st: S };
  flash(from); refreshUI(); drawPad(); ui.needs = true;
}
let flashT = 0;
function flash(from) {
  const bs = document.querySelectorAll('#fs-strip button');
  bs.forEach((b, i) => b.classList.toggle('run', i >= from));
  clearTimeout(flashT); flashT = setTimeout(() => bs.forEach(b => b.classList.remove('run')), 260);
}

/* ------------------------------------------------------------------ UI text */
function valHead() { return S.pat === 'fins' ? T('Fin angle', '鰭片角度') : S.pat === 'pyramids' ? T('Apex', '頂點高度') : S.pat === 'perforated' ? T('Hole', '孔徑') : T('Cut-out', '開口尺寸'); }
function valStr(t) { return opLabel(t.op); }
function opLabel(op) { return S.pat === 'fins' ? f1(op) + '°' : S.pat === 'perforated' ? 'Ø ' + Math.round(op) + ' mm' : Math.round(op) + ' mm'; }
function stats() {
  const n = panels.length, within = panels.filter(p => p.dev <= S.tol).length, planar = panels.filter(p => (p.plan || 0) * 1000 <= S.ptol).length;
  const maxPlan = Math.max(0, ...panels.map(p => (p.plan || 0) * 1000)), area = panels.reduce((s, p) => s + (p.area || 0), 0);
  const avgW = panels.length ? panels.reduce((s, p) => s + (p.edges[0] || 0), 0) / n : 0;
  return { n, types: types.length, within, pctWithin: n ? 100 * within / n : 0, planar, pctPlanar: n ? 100 * planar / n : 0, maxPlan, area, avgW, maxDev: Math.max(0, ...types.map(t => t.dev)), maxShp: Math.max(0, ...types.map(t => t.shp)), maxOpc: Math.max(0, ...types.map(t => t.opc)) };
}
function refreshUI() {
  const st = stats();
  const sub = {
    surface: `${FP_NAME[S.fp]} · ${S.nu}×${S.nv}`, divide: `${div.nU} × ${div.nV}`, pattern: PAT_NAME[S.pat],
    driver: T(`${Object.keys(S.w).filter(k => S.w[k] > 0 && (k !== 'att' || S.atts.length)).length} drivers`, `${Object.keys(S.w).filter(k => S.w[k] > 0 && (k !== 'att' || S.atts.length)).length} 個因素`),
    rational: T(`${types.length} types`, `${types.length} 款`), analyse: HEAT_NAME[S.heat], export: T('7 formats', '7 種格式')
  };
  document.querySelectorAll('#fs-strip button').forEach(b => {
    const k = b.dataset.node; b.querySelector('i').textContent = sub[k];
    b.querySelector('em').textContent = k === 'export' ? T('ready', '就緒') : (timing[k] || 0) < 0.5 ? '·' : Math.round(timing[k]) + ' ms';
    if (k === active) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  $('fs-sum').textContent = T(
    `${fmt(st.n)} panels · ${st.types} types · ${Math.round(st.pctWithin)}% within ${S.tol} mm of their type (${{ opening: 'opening', shape: 'shape', both: 'shape + opening' }[S.basis]}) · planarity max ${f1(st.maxPlan)} mm, ${Math.round(st.pctPlanar)}% under ${S.ptol} mm · ${fmt(st.area)} m² skin`,
    `${fmt(st.n)} 塊板 · ${st.types} 款 · ${Math.round(st.pctWithin)}% 與所屬種類相差 ${S.tol} 毫米以內（${{ opening: '開口', shape: '形狀', both: '形狀及開口' }[S.basis]}）· 平整度最大偏差 ${f1(st.maxPlan)} 毫米，${Math.round(st.pctPlanar)}% 少於 ${S.ptol} 毫米 · 外牆面積 ${fmt(st.area)} 平方米`);
  if (S.pat === 'fins') $('fs-sum').textContent = T(
    `${fmt(st.n)} fins · ${st.types} angle types · ${Math.round(st.pctWithin)}% within ${S.tol}${S.basis === 'opening' ? '°' : ' mm'} of their type · depth ${S.finDepth} m`,
    `${fmt(st.n)} 片鰭片 · ${st.types} 款角度 · ${Math.round(st.pctWithin)}% 與所屬種類相差 ${S.tol}${S.basis === 'opening' ? '°' : ' 毫米'}以內 · 深度 ${S.finDepth} 米`);
  $('fs-th-val').textContent = valHead();
  $('fs-typetab').querySelector('tbody').innerHTML = types.map(t => `<tr><td><span class="pp-dot" style="background:${t.colour}"></span>${t.name}</td><td>${valStr(t)}</td><td>${fmt(t.count)}</td><td>${f1(t.dev)}${S.pat === 'fins' && S.basis === 'opening' ? '°' : ' mm'}</td></tr>`).join('');
  $('fs-rat').innerHTML = `<span>${T(`Rationalise → ${S.N} types`, `歸納 → ${S.N} 款`)}</span>`;
  $('fs-divinfo').textContent = T(`Panel cells about ${f1(fp.perimeter / div.nU)} × ${f1(S.H / div.nV)} m · ${fmt(panels.length)} panels`, `每格約 ${f1(fp.perimeter / div.nU)} × ${f1(S.H / div.nV)} 米 · ${fmt(panels.length)} 塊板`)
    + (div.capped ? T(`\nCapped at about ${fmt(CAP)} panels on this device (asked ${S.nU} × ${S.nV}).`, `\n此裝置上限約 ${fmt(CAP)} 塊板（原設定 ${S.nU} × ${S.nV}）。`) : '')
    + (S.pat === 'diamond' && S.nU % 2 ? T('\nDiamonds need an even U: using ' + div.nU + '.', '\n菱形需要雙數 U：改用 ' + div.nU + '。') : '');
  $('fs-patinfo').textContent = S.pat === 'fins' ? T('Fins rotate about their own vertical edge; the driver sets the angle.', '鰭片繞自身豎邊旋轉，驅動值決定角度。')
    : S.pat === 'pyramids' ? T('Each quad rises to a point; the driver sets the height.', '每塊方格板升起成尖頂，驅動值決定高度。')
    : T('Opening = share of each panel left open (a cut-out of the same shape, or one round hole).', '開口 = 每塊板的通透比例（同形狀的開口，或一個圓孔）。');
  const comp = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(sun.az / 45) % 8], compZ = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'][Math.round(sun.az / 45) % 8];
  $('fs-suninfo').textContent = sun.alt > 0 ? T(`Sun ${f1(sun.alt)}° up, from the ${comp} (${Math.round(sun.az)}°), 21st of the month`, `太陽仰角 ${f1(sun.alt)}°，來自${compZ}（${Math.round(sun.az)}°），該月 21 日`) : T('The sun is below the horizon at this time.', '此時太陽在地平線以下。');
  const opU = S.pat === 'fins' ? '°' : T(' mm', ' 毫米'), tolU = S.pat === 'fins' && S.basis === 'opening' ? '°' : T(' mm', ' 毫米');
  const bEn = { opening: 'opening', shape: 'shape', both: 'shape and opening' }[S.basis], bZh = { opening: '開口', shape: '形狀', both: '形狀及開口' }[S.basis];
  $('fs-ratinfo').textContent = T(
    `Grouped by ${bEn}. ${Math.round(st.pctWithin)}% of panels within ${S.tol}${tolU} of their type.\nSnapping changes an opening by up to ${f1(st.maxOpc)}${opU}${S.snap ? ' (snapped).' : ' (not snapped yet: tick the box or tap Rationalise).'}\nPanel outlines still vary by up to ${f1(st.maxShp)} mm within a type: on a free-form skin each panel is cut to its own outline.\nConcept-stage rationalisation, not fabrication data.`,
    `按${bZh}歸納。${Math.round(st.pctWithin)}% 板材與所屬種類相差 ${S.tol}${tolU}以內。\n收歸令開口最多改變 ${f1(st.maxOpc)}${opU}${S.snap ? '（已收歸）。' : '（尚未收歸：剔選方格或按「歸納」）。'}\n同一種類內板材外形仍最多相差 ${f1(st.maxShp)} 毫米：自由曲面上每塊板按自身外形切割。\n概念階段的歸納，並非製造數據。`);
  $('fs-anainfo').textContent = S.pat === 'fins' ? T('Fins are single straight blades: planarity is not measured.', '鰭片為單片直板：不計平整度。') : T(
    `Planarity: max ${f1(st.maxPlan)} mm; ${Math.round(st.pctPlanar)}% of panels under ${S.ptol} mm, at an average panel width of ${f1(st.avgW)} m. Triangles are always flat.`,
    `平整度：最大 ${f1(st.maxPlan)} 毫米；${Math.round(st.pctPlanar)}% 板材少於 ${S.ptol} 毫米（平均板寬 ${f1(st.avgW)} 米）。三角板必然平整。`);
  document.querySelectorAll('#fs-view button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  $('fs-hint').textContent = COARSE
    ? T('One finger orbits, two fingers zoom. Bend the skin on the lattice pad under Surface; drag the orange sphere to move the attractor.', '單指旋轉，雙指縮放。在「曲面」的控制板上拉彎外牆；拖動橙色球可移動吸引點。')
    : T('Drag a glowing control point to bend the skin. Drag the orange sphere along the facade to move the attractor. Drag to orbit, right-drag to pan, scroll to zoom.', '拖動發光控制點可拉彎外牆；沿外牆拖動橙色球可移動吸引點。拖動旋轉視角，右鍵拖動平移，滾輪縮放。');
}
function legend() {
  const el = $('fs-legend');
  if (view === 'material') { el.hidden = true; return; }
  el.hidden = false;
  if (view === 'types') { el.innerHTML = `${T('Colour = panel type', '顏色 = 板材種類')} · ${types.map(t => `<span class="pp-dot" style="background:${t.colour}"></span>${t.name} ${fmt(t.count)}`).join(' ')}`; return; }
  const name = view === 'driver' ? T('Driver value (0 solid to 1 open)', '驅動值（0 實至 1 通）') : HEAT_NAME[S.heat] + (S.heat === 'plan' ? T(' (mm)', '（毫米）') : S.heat === 'sun' ? '' : S.heat === 'K' ? ' |K| (1/m²)' : ' |H| (1/m)');
  const [lo, hi] = view === 'driver' ? [0, 1] : heatRange || [0, 1];
  const fmtv = (v) => (S.heat === 'K' || S.heat === 'H') && view === 'heat' ? v.toExponential(1) : f1(v);
  el.innerHTML = `${name}<div class="bar" style="background:${G.HEAT_CSS}"></div><div class="ends"><span>${fmtv(lo)}</span><span>${fmtv(hi)}${view === 'heat' && S.heat === 'plan' ? '+' : ''}</span></div>`;
}

/* ------------------------------------------------------------------ inputs */
function setActive(node) {
  active = node;
  document.querySelectorAll('#fs-panel fieldset').forEach(f => { f.hidden = f.dataset.node !== node; });
  if (node === 'rational' && view !== 'types') setView('types');
  else if (node === 'analyse') setView('heat');
  else refreshUI();
  if (node === 'surface') drawPad();
}
function setView(v) { view = v; touch('analyse'); }
const NUM = [
  ['fs-W', 'W', 'surface'], ['fs-D', 'D', 'surface'], ['fs-H', 'H', 'surface'], ['fs-st', 'storeys', 'surface'], ['fs-nU', 'nU', 'divide'], ['fs-nV', 'nV', 'divide'],
  ['fs-omin', 'oMin', 'driver'], ['fs-omax', 'oMax', 'driver'], ['fs-fdep', 'finDepth', 'driver'], ['fs-fmin', 'finMin', 'driver'], ['fs-fmax', 'finMax', 'driver'],
  ['fs-pmin', 'pyrMin', 'driver'], ['fs-pmax', 'pyrMax', 'driver'], ['fs-R', 'R', 'driver'], ['fs-Rc', 'Rc', 'driver'], ['fs-tol', 'tol', 'rational'], ['fs-ptol', 'ptol', 'analyse'],
  ['fs-N', 'N', 'rational'], ['fs-twist', 'twist', 'surface'], ['fs-taper', 'taper', 'surface'], ['fs-hour', 'hour', 'driver']
];
const WKEYS = ['att', 'curve', 'curv', 'sun', 'view', 'height'];
function syncInputs() {
  for (const [id, k] of NUM) $(id).value = S[k];
  for (const k of WKEYS) { $('fs-w-' + k).value = S.w[k]; $('fs-w-' + k + '-o').textContent = S.w[k]; }
  $('fs-fp').value = S.fp; $('fs-deg').value = String(S.deg); $('fs-nu').value = S.nu; $('fs-nv').value = S.nv; $('fs-Rv').value = S.view.R;
  $('fs-month').value = String(S.month); $('fs-basis').value = S.basis; $('fs-snap').checked = S.snap; $('fs-hinv').checked = S.hInvert; $('fs-inv').checked = S.invert; $('fs-stretch').checked = S.stretch;
  $('fs-tower').checked = S.tower; $('fs-showlat').checked = S.showLat;
  $('fs-N-o').textContent = S.N; $('fs-twist-o').textContent = S.twist; $('fs-taper-o').textContent = S.taper; $('fs-hour-o').textContent = hourStr(S.hour);
  document.querySelectorAll('#fs-pat button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pat === S.pat)));
  document.querySelectorAll('#fs-city button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.city === S.city)));
  document.querySelectorAll('#fs-vmode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vmode === S.view.mode)));
  document.querySelectorAll('#fs-heat button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.heat === S.heat)));
  document.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === presetName)));
  const fam = S.pat === 'fins' ? 'fins' : S.pat === 'pyramids' ? 'pyramids' : 'open';
  document.querySelectorAll('#fs-panel [data-for]').forEach(el => { el.hidden = el.dataset.for !== fam; });
  syncSel();
}
const hourStr = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
function syncSel() {
  const ok = S.sel >= 0 && S.sel < S.d.length;
  $('fs-push').disabled = $('fs-lift').disabled = !ok;
  $('fs-push').value = ok ? S.d[S.sel] : 0; $('fs-lift').value = ok ? S.y[S.sel] : 0;
  $('fs-push-o').textContent = ok ? f1(S.d[S.sel]) : '·'; $('fs-lift-o').textContent = ok ? f1(S.y[S.sel]) : '·';
}
function resampleLattice(nu, nv) {
  const old = surf, d = [], y = [];
  const tmp = new G.Surface({ fp, H: S.H, nu, nv, deg: S.deg, d: new Float64Array(nu * nv), y: new Float64Array(nu * nv), twist: 0, taper: 0, cx: 0, cz: 0 });
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const [dd, yy] = old.field(i / nu, tmp.g[j]); d.push(dd); y.push(yy); }
  S.nu = nu; S.nv = nv; S.d = d; S.y = y; S.sel = -1;
}
function load(name) {
  presetName = name; S = PRESETS[name](); S.atts = S.atts.map(a => Object.assign({}, a)); S.curve = { pts: S.curve.pts.map(p => p.slice()) }; S.view = Object.assign({}, S.view); S.w = Object.assign({}, S.w);
  kmInit = null; view = 'material'; syncInputs(); dirty = 0; run(); home(); setActive('surface');
}
function home() {
  const c = S.cam || [1, 0.5, 1.1], R = Math.max(S.W, S.D) * Math.max(1, 1.4 / (camera.aspect || 1.4));  // pull back on narrow screens
  controls.target.set(0, S.H * 0.62, 0);
  camera.position.set(c[0] * R * 1.15, S.H * 0.45 + c[1] * R * 1.35, c[2] * R * 1.25);
  controls.update(); ui.needs = true;
}

function bind() {
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => load(b.dataset.preset)));
  document.querySelectorAll('#fs-strip button').forEach(b => b.addEventListener('click', () => setActive(b.dataset.node)));
  document.querySelectorAll('#fs-view button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('fs-rat').addEventListener('click', () => { S.snap = true; $('fs-snap').checked = true; setActive('rational'); view = 'types'; touch('rational'); });
  $('fs-home').addEventListener('click', home);
  for (const [id, k, node] of NUM) $(id).addEventListener('input', () => {
    const v = parseFloat($(id).value); if (!isFinite(v)) return;
    const el = $(id), lo = parseFloat(el.min), hi = parseFloat(el.max); S[k] = Math.max(lo, Math.min(hi, v));
    if (k === 'N') $('fs-N-o').textContent = S.N; if (k === 'twist') $('fs-twist-o').textContent = S.twist; if (k === 'taper') $('fs-taper-o').textContent = S.taper; if (k === 'hour') $('fs-hour-o').textContent = hourStr(S.hour);
    if (k === 'storeys' || k === 'H') touch('surface');
    touch(node);
  });
  for (const k of WKEYS) $('fs-w-' + k).addEventListener('input', () => { S.w[k] = +$('fs-w-' + k).value; $('fs-w-' + k + '-o').textContent = S.w[k]; touch('driver'); });
  $('fs-fp').addEventListener('change', () => { S.fp = $('fs-fp').value; touch('surface'); });
  $('fs-deg').addEventListener('change', () => { S.deg = +$('fs-deg').value; touch('surface'); });
  for (const id of ['fs-nu', 'fs-nv']) $(id).addEventListener('change', () => {
    const nu = Math.max(4, Math.min(16, Math.round(+$('fs-nu').value || S.nu))), nv = Math.max(2, Math.min(6, Math.round(+$('fs-nv').value || S.nv)));
    resampleLattice(nu, nv); syncSel(); touch('surface');
  });
  $('fs-Rv').addEventListener('input', () => { S.view.R = Math.max(5, +$('fs-Rv').value || 80); touch('driver'); });
  $('fs-month').addEventListener('change', () => { S.month = +$('fs-month').value; touch('driver'); });
  $('fs-basis').addEventListener('change', () => { S.basis = $('fs-basis').value; kmInit = null; touch('rational'); });
  $('fs-snap').addEventListener('change', () => { S.snap = $('fs-snap').checked; touch('rational'); });
  $('fs-hinv').addEventListener('change', () => { S.hInvert = $('fs-hinv').checked; touch('driver'); });
  $('fs-inv').addEventListener('change', () => { S.invert = $('fs-inv').checked; touch('driver'); });
  $('fs-stretch').addEventListener('change', () => { S.stretch = $('fs-stretch').checked; touch('driver'); });
  $('fs-tower').addEventListener('change', () => { S.tower = $('fs-tower').checked; touch('surface'); });
  $('fs-showlat').addEventListener('change', () => { S.showLat = $('fs-showlat').checked; buildCtrl(); ui.needs = true; });
  document.querySelectorAll('#fs-pat button').forEach(b => b.addEventListener('click', () => { S.pat = b.dataset.pat; kmInit = null; syncInputs(); touch('divide'); }));
  document.querySelectorAll('#fs-city button').forEach(b => b.addEventListener('click', () => { S.city = b.dataset.city; syncInputs(); touch('driver'); }));
  document.querySelectorAll('#fs-vmode button').forEach(b => b.addEventListener('click', () => { S.view.mode = b.dataset.vmode; syncInputs(); touch('driver'); }));
  document.querySelectorAll('#fs-heat button').forEach(b => b.addEventListener('click', () => { S.heat = b.dataset.heat; syncInputs(); view = 'heat'; touch('analyse'); }));
  $('fs-push').addEventListener('input', () => { if (S.sel < 0) return; S.d[S.sel] = +$('fs-push').value; $('fs-push-o').textContent = f1(S.d[S.sel]); touchLive('surface'); });
  $('fs-lift').addEventListener('input', () => { if (S.sel < 0) return; S.y[S.sel] = +$('fs-lift').value; $('fs-lift-o').textContent = f1(S.y[S.sel]); touchLive('surface'); });
  for (const id of ['fs-push', 'fs-lift']) $(id).addEventListener('change', () => { kmInit = null; touch('surface'); });
  $('fs-flatten').addEventListener('click', () => { S.d = S.d.map(() => 0); S.y = S.y.map(() => 0); syncSel(); touch('surface'); });
  $('fs-randwave').addEventListener('click', () => {
    const k = 1 + Math.floor(Math.random() * 3), ph = Math.random() * G.TAU;
    S.d = S.d.map((_, q) => { const i = q % S.nu, j = Math.floor(q / S.nu); return j === 0 ? 0 : (1 + Math.random() * 2.6) * Math.sin(G.TAU * k * i / S.nu + ph + j * (0.6 + Math.random())); });
    syncSel(); kmInit = null; touch('surface');
  });
  $('fs-addpt').addEventListener('click', () => { if (S.atts.length >= 3) return; S.atts.push({ u: (0.15 + 0.3 * S.atts.length) % 1, v: 0.3, off: 1.5 }); if (!S.w.att) { S.w.att = 60; syncInputs(); } touch('driver'); });
  $('fs-delpt').addEventListener('click', () => { S.atts.pop(); touch('driver'); });
  document.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => doExport(b.dataset.x)));
  const m = $('fs-month'); for (let k = 1; k <= 12; k++) { const o = document.createElement('option'); o.value = k; o.textContent = ZH ? k + ' 月' : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][k - 1]; m.appendChild(o); }
}
// on touch devices heavy steps wait for the finger to lift; on desktop they run every frame
function touchLive(node) { if (COARSE) { pendingNode = node; } else touch(node); }
let pendingNode = null;
document.addEventListener('pointerup', () => { if (pendingNode) { const n = pendingNode; pendingNode = null; kmInit = null; touch(n); } });

/* ------------------------------------------------------------------ 3D picking and dragging */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setNdc(e) { const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function pickables() {
  const l = attMeshes.concat(curveMeshes); if (viewerMesh) l.push(...viewerMesh.children);
  if (!COARSE && S.showLat) l.push(...ctrlMeshes);
  return l;
}
cv.addEventListener('pointerdown', (e) => {
  if (!ui.interacted) { ui.interacted = true; controls.autoRotate = false; }
  if (e.button !== 0) return;
  setNdc(e);
  const hit = ray.intersectObjects(pickables(), false)[0]; if (!hit) return;
  const d = hit.object.userData; e.preventDefault(); controls.enabled = false; cv.setPointerCapture(e.pointerId); cv.classList.add('drag');
  ui.drag = { kind: d.kind, k: d.k, coarse: e.pointerType === 'touch' };
  if (d.kind === 'ctrl') {
    S.sel = d.k; syncSel(); buildCtrl();
    const i = d.k % S.nu, j = Math.floor(d.k / S.nu), f = fp.at(i / S.nu, {}), a = S.twist * surf.g[j] * Math.PI / 180;
    const nh = new THREE.Vector3(f.nx * Math.cos(a) - f.nz * Math.sin(a), 0, f.nx * Math.sin(a) + f.nz * Math.cos(a)).normalize();
    const th = new THREE.Vector3(-nh.z, 0, nh.x), cd = new THREE.Vector3(); camera.getWorldDirection(cd);
    const vertical = Math.abs(cd.dot(th)) > 0.3;
    const p0 = hit.object.position.clone();
    ui.drag.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(vertical ? th : new THREE.Vector3(0, 1, 0), p0);
    ui.drag.nh = nh; ui.drag.vertical = vertical; ui.drag.p0 = p0; ui.drag.d0 = S.d[d.k]; ui.drag.y0 = S.y[d.k];
  }
});
cv.addEventListener('pointermove', (e) => {
  setNdc(e);
  if (!ui.drag) { if (e.pointerType === 'mouse') cv.classList.toggle('pick', !!ray.intersectObjects(pickables(), false)[0]); return; }
  const D = ui.drag;
  if (D.kind === 'ctrl') {
    const X = new THREE.Vector3(); if (!ray.ray.intersectPlane(D.plane, X)) return;
    const dl = X.sub(D.p0); S.d[D.k] = G.clamp(D.d0 + dl.dot(D.nh), -12, 15); if (D.vertical) S.y[D.k] = G.clamp(D.y0 + dl.y, -8, 8);
    syncSel(); touchLive('surface');
  } else if (D.kind === 'att' || D.kind === 'curve') {
    const h = ray.intersectObject(meshGlass, false)[0]; if (!h || !h.uv) return;
    const u = h.uv.x - Math.floor(h.uv.x), v = G.clamp(h.uv.y, 0.02, 0.98);
    if (D.kind === 'att') { S.atts[D.k].u = u; S.atts[D.k].v = v; } else S.curve.pts[D.k] = [u, v];
    if (D.coarse) { moveMarkerOnly(D, u, v); pendingNode = 'driver'; } else touch('driver');
  } else if (D.kind === 'viewer') {
    const X = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), X)) return;
    S.view.x = X.x; S.view.z = X.z; if (viewerMesh) viewerMesh.position.set(X.x, 0, X.z); ui.needs = true;
    if (D.coarse) pendingNode = 'driver'; else touch('driver');
  }
});
function moveMarkerOnly(D, u, v) { const f = surf.frame(u, v), p = G.add([f.P.x, f.P.y, f.P.z], G.mul(f.n, D.kind === 'att' ? S.atts[D.k].off : 0.6)); const m = (D.kind === 'att' ? attMeshes : curveMeshes)[D.k]; if (m) m.position.set(...p); ui.needs = true; }
function endDrag(e) {
  if (!ui.drag) return;
  const was = ui.drag; ui.drag = null; controls.enabled = true; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) { /* not captured */ }
  kmInit = null; touch(was.kind === 'ctrl' ? 'surface' : 'driver'); drawPad();
}
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

/* ------------------------------------------------------------------ lattice pad (2D, works on phones) */
const pad = $('fs-pad'), px = pad.getContext('2d'); let padDrag = null;
function padGeom() { const r = pad.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2); if (pad.width !== Math.round(r.width * dpr)) { pad.width = Math.round(r.width * dpr); pad.height = Math.round(r.height * dpr); } return { w: r.width, h: r.height, dpr, m: 14 }; }
const padXY = (g, u, v) => [g.m + u * (g.w - 2 * g.m), g.h - g.m - v * (g.h - 2 * g.m)];
function drawPad() {
  if (!surf || pad.offsetParent === null) return;
  const g = padGeom(); px.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); px.clearRect(0, 0, g.w, g.h);
  px.fillStyle = '#f4f2ee'; px.fillRect(g.m, g.m, g.w - 2 * g.m, g.h - 2 * g.m);
  const sw = Math.max(1.5, (g.w - 2 * g.m) / (div ? div.nU : 50)), sh = Math.max(1.5, (g.h - 2 * g.m) / (div ? div.nV + 1 : 10));
  for (const p of panels) { const [x, y] = padXY(g, p.c[0], p.c[1]); const c = G.heat(p.t); px.fillStyle = `rgb(${c.map(q => Math.round(q * 255)).join(',')})`; px.fillRect(x - sw / 2 + 0.3, y - sh / 2 + 0.3, sw - 0.6, sh - 0.6); }
  px.strokeStyle = 'rgba(6,7,10,.35)'; px.lineWidth = 1;
  for (let s = 1; s < S.storeys; s++) { const [, y] = padXY(g, 0, s / S.storeys); px.beginPath(); px.moveTo(g.m, y); px.lineTo(g.w - g.m, y); px.stroke(); }
  for (let j = 0; j < S.nv; j++) for (let i = 0; i < S.nu; i++) {
    const k = j * S.nu + i, [x, y] = padXY(g, i / S.nu, surf.g[j]), d = S.d[k];
    px.beginPath(); px.arc(x, y, 6.5, 0, G.TAU); px.fillStyle = d > 0.05 ? '#c8ff2e' : d < -0.05 ? '#7fb8ff' : '#ffffff'; px.fill();
    px.lineWidth = k === S.sel ? 3 : 1.2; px.strokeStyle = '#06070a'; px.stroke();
    if (Math.abs(d) > 0.05) { px.fillStyle = '#06070a'; px.font = '10px ui-monospace,monospace'; px.fillText((d > 0 ? '+' : '') + f1(d), x + 8, y - 6); }
  }
  if (S.w.curve > 0) { px.strokeStyle = '#1fa2ff'; px.lineWidth = 2; px.beginPath(); G.catmull(S.curve.pts, 16).forEach((q, n) => { const [x, y] = padXY(g, q[0], q[1]); n ? px.lineTo(x, y) : px.moveTo(x, y); }); px.stroke(); for (const q of S.curve.pts) { const [x, y] = padXY(g, q[0], q[1]); px.beginPath(); px.arc(x, y, 6, 0, G.TAU); px.fillStyle = '#1fa2ff'; px.fill(); } }
  for (const a of S.atts) { const [x, y] = padXY(g, a.u, a.v); px.beginPath(); px.arc(x, y, 8, 0, G.TAU); px.fillStyle = '#ff7a1a'; px.fill(); px.strokeStyle = '#06070a'; px.lineWidth = 1.2; px.stroke(); }
  px.fillStyle = '#555c64'; px.font = '10px ui-monospace,monospace'; px.fillText(T('front', '正面'), g.m + 2, g.h - 3); px.fillText(T('around →', '環向 →'), g.w / 2 - 20, g.h - 3);
}
pad.addEventListener('pointerdown', (e) => {
  if (!surf) return; const g = padGeom(), r = pad.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 18;
  S.atts.forEach((a, k) => { const [ax, ay] = padXY(g, a.u, a.v), d = Math.hypot(ax - x, ay - y); if (d < bd) { bd = d; best = { kind: 'att', k }; } });
  if (S.w.curve > 0) S.curve.pts.forEach((q, k) => { const [ax, ay] = padXY(g, q[0], q[1]), d = Math.hypot(ax - x, ay - y); if (d < bd) { bd = d; best = { kind: 'curve', k }; } });
  if (!best) for (let k = 0; k < S.d.length; k++) { const [ax, ay] = padXY(g, (k % S.nu) / S.nu, surf.g[Math.floor(k / S.nu)]), d = Math.hypot(ax - x, ay - y); if (d < bd) { bd = d; best = { kind: 'ctrl', k }; } }
  if (!best) return;
  e.preventDefault(); pad.setPointerCapture(e.pointerId); padDrag = Object.assign(best, { y0: y, d0: S.d[best.k] });
  if (best.kind === 'ctrl') { S.sel = best.k; syncSel(); buildCtrl(); drawPad(); ui.needs = true; }
});
pad.addEventListener('pointermove', (e) => {
  if (!padDrag) return; const g = padGeom(), r = pad.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const u = G.clamp((x - g.m) / (g.w - 2 * g.m), 0, 0.9999), v = G.clamp((g.h - g.m - y) / (g.h - 2 * g.m), 0.02, 0.98);
  if (padDrag.kind === 'att') { S.atts[padDrag.k].u = u; S.atts[padDrag.k].v = v; touchLive('driver'); }
  else if (padDrag.kind === 'curve') { S.curve.pts[padDrag.k] = [u, v]; touchLive('driver'); }
  else { S.d[padDrag.k] = G.clamp(padDrag.d0 + (padDrag.y0 - y) * 0.06, -12, 15); syncSel(); touchLive('surface'); }
  drawPad();
});
const padEnd = () => { if (!padDrag) return; padDrag = null; if (pendingNode) { const n = pendingNode; pendingNode = null; kmInit = null; touch(n); } else { kmInit = null; touch('surface'); } };
pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);

/* ------------------------------------------------------------------ export */
function save(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  window.FSS.lastExport = { name, size: blob.size };
}
async function makeExport(kind) {
  const g = () => IO.exportGroup([meshPanels, meshGlass, meshRoof].map(m => m && Object.assign(m, {})));
  if (kind === 'obj') return [IO.toOBJ(g()), 'text/plain'];
  if (kind === 'stl') return [IO.toSTL(g()), 'model/stl'];
  if (kind === 'glb') return [await IO.toGLB(g()), 'model/gltf-binary'];
  if (kind === 'dxf') return [IO.toDXF(model), 'application/dxf'];
  if (kind === 'svg') return [IO.toSVG(model), 'image/svg+xml'];
  if (kind === 'csv') return ['﻿' + IO.toCSV(model), 'text/csv'];
  if (kind === 'png') { renderer.render(scene, camera); return [await new Promise(r => cv.toBlob(r, 'image/png')), 'image/png']; }
}
async function doExport(kind) {
  const [data, type] = await makeExport(kind);
  save(data, `facade-surface-studio_${presetName}_${S.pat}.${kind}`, type);
}

/* ------------------------------------------------------------------ loop */
function resize() { const r = stage.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); ui.needs = true; drawPad(); }
new ResizeObserver(resize).observe(stage);
let frames = 0;
renderer.setAnimationLoop(() => {
  const moved = controls.update();
  if (moved || ui.needs || controls.autoRotate) { renderer.render(scene, camera); ui.needs = false; frames++; }
});

bind(); resize(); load('wave');
$('fs-busy').hidden = true;
window.FSS = {
  get S() { return S; }, get model() { return model; }, stats, timing, load, setView, setActive, touch, run: () => { dirty = 0; run(); },
  makeExport, doExport, frames: () => frames,
  dragFrame(kind = 'ctrl') { ui.drag = { kind, coarse: false }; dirty = kind === 'ctrl' ? 0 : 3; const t0 = performance.now(); run(); const t = performance.now() - t0; ui.drag = null; return t; }, camera, controls, scene, renderer, home, ready: true, CAP, PHONE
};
