// Interior of the abbey church (v3, 25 Oct 2026): nave arcades as real architecture per bay style, painted ceilings,
// the crossing lantern, presbytery bays and vault, furnishings with real form, paving, and a light rig for the walk-in view.
// Numerous detail goes through Kit: one merged mesh per material per part, no pencil edges (the intro sketch stays clean).
// Sources: research/architecture.md (measured positions), site/assets/spots + photos (Commons) for form and colour.
import {THREE, M, scene, part, current, add} from './scene.js';
import {TILE} from './textures.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const ZI = 4.98;   // inner face of the arcade walls (pier centres 5.74 less 0.76)
const WT = 1.52;          // arcade wall thickness (out to the clerestory wall face, 6.5)
const S60 = Math.sin(Math.PI / 3);
const V2 = (x, y) => new THREE.Vector2(x, y);

// ======================================================================= textures
let seed = 23;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function cvs(w, h, fill) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (fill) { g.fillStyle = fill; g.fillRect(0, 0, w, h); }
  return [c, g];
}
function ctex(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// Limewash over plastered Roman brick: warm cream, faintly mottled.
function limeTex() {
  const [c, g] = cvs(256, 256, '#e8e2d4');
  for (let i = 0; i < 700; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = 4 + rnd() * 26;
    g.fillStyle = rnd() < 0.5 ? 'rgba(196,182,156,.06)' : 'rgba(250,244,230,.08)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return c;
}
// Stone flags with the odd dark ledger slab (one tile = 2.4 m).
function pavingTex() {
  const [c, g] = cvs(512, 512, '#948b7c');
  const rows = [0, 120, 250, 380, 512];
  for (let r = 0; r < 4; r++) {
    let x = -rnd() * 80;
    while (x < 512) {
      const w = 110 + rnd() * 120, dark = rnd() < 0.025;
      const v = (rnd() - 0.5) * 16, base = dark ? [92, 88, 82] : [196 + v, 188 + v, 172 + v];
      g.fillStyle = `rgb(${base.map(Math.round).join(',')})`;
      g.fillRect(x + 2, rows[r] + 2, w - 4, rows[r + 1] - rows[r] - 4);
      if (dark) { g.strokeStyle = 'rgba(200,190,170,.35)'; g.lineWidth = 2; g.strokeRect(x + 12, rows[r] + 12, w - 24, rows[r + 1] - rows[r] - 24); }
      x += w;
    }
  }
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(80,70,55,${rnd() * 0.07})`; g.fillRect(rnd() * 512, rnd() * 512, 2, 2); }
  return c;
}
// Nave ceiling (flat painted timber, 20.22 m). One tile = 3.2 m (u, along x) by the full width 9.96 m (v): 2 x 6 panels.
function naveCeilTex() {
  const W = 256, H = 768, [c, g] = cvs(W, H, '#5b2519');
  const pw = W / 2, ph = H / 6;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 6; j++) {
    const x = i * pw, y = j * ph, cx = x + pw / 2, cy = y + ph / 2;
    g.fillStyle = (i + j) % 2 ? '#6a2c1d' : '#612818'; g.fillRect(x, y, pw, ph);
    g.strokeStyle = '#c9a35c'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, y + 14); g.lineTo(x + pw - 14, cy); g.lineTo(cx, y + ph - 14); g.lineTo(x + 14, cy); g.closePath(); g.stroke();
    g.fillStyle = '#7d3524'; g.fill();
    g.fillStyle = '#d8bc7c';
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.arc(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, 11, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#7b2a1c'; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#26110b'; g.lineWidth = 12;
  for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * pw, 0); g.lineTo(i * pw, H); g.stroke(); }
  for (let j = 0; j <= 6; j++) { g.beginPath(); g.moveTo(0, j * ph); g.lineTo(W, j * ph); g.stroke(); }
  g.fillStyle = '#c9a35c';
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= 6; j++) { g.beginPath(); g.arc(i * pw, j * ph, 8, 0, Math.PI * 2); g.fill(); }
  return c;
}
// Presbytery-side quire ceiling (15th c.): red and green panels with IHS roundels and shields, 2 x 6 per tile.
function quireCeilTex() {
  const W = 256, H = 768, [c, g] = cvs(W, H, '#1d120d');
  const pw = W / 2, ph = H / 6;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 6; j++) {
    const x = i * pw, y = j * ph, cx = x + pw / 2, cy = y + ph / 2, red = (i + j) % 2 === 0;
    g.fillStyle = red ? '#8c2b26' : '#2c5546'; g.fillRect(x + 6, y + 6, pw - 12, ph - 12);
    g.strokeStyle = '#d9c38a'; g.lineWidth = 5; g.setLineDash([6, 5]);
    g.beginPath(); g.arc(cx, cy, 44, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = red ? '#2d4f6b' : '#9b3127'; g.beginPath(); g.arc(cx, cy, 38, 0, Math.PI * 2); g.fill();
    if ((i + j) % 4 < 2) { g.fillStyle = '#efe2bd'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ihc', cx, cy + 2); }
    else {
      g.fillStyle = '#eee3c4'; g.beginPath(); g.moveTo(cx - 20, cy - 22); g.lineTo(cx + 20, cy - 22); g.lineTo(cx + 20, cy + 4); g.quadraticCurveTo(cx, cy + 30, cx - 20, cy + 4); g.closePath(); g.fill();
      g.fillStyle = '#a3302a'; g.fillRect(cx - 4, cy - 22, 8, 40); g.fillRect(cx - 20, cy - 12, 40, 8);
    }
  }
  g.fillStyle = '#d4b45a';
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= 6; j++) { g.beginPath(); g.arc(i * pw, j * ph, 9, 0, Math.PI * 2); g.fill(); }
  return c;
}
// Tower lantern ceiling (31.1 m): cream border, green and gold frame, 4 x 4 red panels with gold roundels.
function lanternTex() {
  const [c, g] = cvs(512, 512, '#e9dcc0');
  g.fillStyle = '#2f5a45'; g.fillRect(56, 56, 400, 400);
  g.strokeStyle = '#c9a24e'; g.lineWidth = 6; g.strokeRect(62, 62, 388, 388);
  const s = 94;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = 68 + i * s, y = 68 + j * s;
    g.fillStyle = '#a3382a'; g.fillRect(x + 4, y + 4, s - 8, s - 8);
    g.strokeStyle = '#d7b35c'; g.lineWidth = 3; g.strokeRect(x + 10, y + 10, s - 20, s - 20);
    g.fillStyle = '#d7b35c';
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(x + s / 2 + Math.cos(a) * 12, y + s / 2 + Math.sin(a) * 12, 10, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#2f5a45'; g.beginPath(); g.arc(x + s / 2, y + s / 2, 6, 0, Math.PI * 2); g.fill();
  }
  for (let k = 0; k < 40; k++) { g.fillStyle = k % 2 ? '#a3382a' : '#2f5a45'; g.fillRect(k * 12.8, 20, 12.8, 14); g.fillRect(k * 12.8, 478, 12.8, 14); g.fillRect(20, k * 12.8, 14, 12.8); g.fillRect(478, k * 12.8, 14, 12.8); }
  return c;
}
// Presbytery vault (painted timber lierne vault): one bay per tile, ribs to a central boss, roundels in the cells.
function vaultTex() {
  const N = 512, [c, g] = cvs(N, N, '#b8ac86'), m = N / 2;
  const cells = [[0, 0], [N, 0], [N, N], [0, N]];
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = cells[k], [bx, by] = cells[(k + 1) % 4];
    g.fillStyle = k % 2 ? '#a9b394' : '#c8ad6c';
    g.beginPath(); g.moveTo(m, m); g.lineTo(ax, ay); g.lineTo(bx, by); g.closePath(); g.fill();
  }
  const rib = (x0, y0, x1, y1, w = 10) => {
    g.strokeStyle = '#f0e2c2'; g.lineWidth = w + 6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = '#6b2c1c'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  for (const [x, y] of cells) rib(x, y, m, m);
  for (const [x, y] of cells) { rib(x, y, m, y === 0 ? 120 : N - 120, 7); rib(x, y, x === 0 ? 120 : N - 120, m, 7); }
  rib(m, 120, m, N - 120, 8); rib(120, m, N - 120, m, 8);
  rib(m, 120, 120, m, 6); rib(120, m, m, N - 120, 6); rib(m, N - 120, N - 120, m, 6); rib(N - 120, m, m, 120, 6);
  for (const [x, y] of [[m, 50], [m, N - 50], [50, m], [N - 50, m], [150, 150], [N - 150, 150], [150, N - 150], [N - 150, N - 150]]) {
    g.fillStyle = '#e9d6a0'; g.beginPath(); g.arc(x, y, 30, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a3324'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#8a3324'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#d2a843';
  for (const [x, y] of [[m, m], [m, 120], [m, N - 120], [120, m], [N - 120, m]]) { g.beginPath(); g.arc(x, y, x === m && y === m ? 22 : 13, 0, Math.PI * 2); g.fill(); }
  return c;
}
// 13th-century wall painting on the west face of a Norman pier: Crucifixion above, Virgin and Child below (faded).
function muralTex() {
  const W = 256, H = 640, [c, g] = cvs(W, H, '#e3d3b8');
  g.fillStyle = '#a9553c'; g.fillRect(8, 8, W - 16, 10); g.fillRect(8, 330, W - 16, 10); g.fillRect(8, H - 18, W - 16, 10);
  g.fillRect(8, 8, 10, H - 16); g.fillRect(W - 18, 8, 10, H - 16);
  g.fillStyle = '#ead9bd'; g.fillRect(18, 18, W - 36, 312);
  g.fillStyle = '#7a3a26'; g.fillRect(122, 40, 12, 280); g.fillRect(64, 92, 128, 11);
  g.fillStyle = '#e9c9a6'; g.beginPath(); g.ellipse(128, 160, 13, 52, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(74, 95, 108, 7); g.beginPath(); g.arc(128, 96, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c47a3c'; g.beginPath(); g.arc(128, 94, 17, Math.PI, 0); g.fill();
  g.fillStyle = '#b8a07a'; g.fillRect(118, 195, 20, 30);
  for (const [x, col] of [[64, '#6f7f86'], [192, '#a5402c']]) {
    g.fillStyle = col; g.beginPath(); g.moveTo(x - 24, 318); g.lineTo(x - 14, 200); g.lineTo(x + 14, 200); g.lineTo(x + 24, 318); g.closePath(); g.fill();
    g.fillStyle = '#e6c6a2'; g.beginPath(); g.arc(x, 186, 13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c99a45'; g.lineWidth = 3; g.beginPath(); g.arc(x, 184, 18, Math.PI, 0); g.stroke();
  }
  g.fillStyle = '#ead9bd'; g.fillRect(18, 340, W - 36, H - 358);
  g.strokeStyle = '#a9553c'; g.lineWidth = 8; g.beginPath(); g.moveTo(52, H - 30); g.lineTo(52, 430); g.quadraticCurveTo(128, 352, 204, 430); g.lineTo(204, H - 30); g.stroke();
  g.fillStyle = '#a5402c'; g.beginPath(); g.moveTo(92, H - 40); g.lineTo(108, 470); g.lineTo(148, 470); g.lineTo(164, H - 40); g.closePath(); g.fill();
  g.fillStyle = '#5f7680'; g.beginPath(); g.moveTo(100, H - 40); g.lineTo(116, 500); g.lineTo(150, 520); g.lineTo(156, H - 40); g.closePath(); g.fill();
  g.fillStyle = '#e6c6a2'; g.beginPath(); g.arc(128, 452, 15, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(146, 505, 9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c99a45'; g.lineWidth = 3; g.beginPath(); g.arc(128, 450, 21, Math.PI, 0); g.stroke();
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(232,220,198,${0.25 + rnd() * 0.4})`; g.beginPath(); g.arc(rnd() * W, rnd() * H, 3 + rnd() * 14, 0, Math.PI * 2); g.fill(); }
  return c;
}
// Victorian encaustic tiles in the sanctuary: 1.2 m tile, 8 x 8 with a lozenge pattern.
function tilesTex() {
  const [c, g] = cvs(256, 256, '#efe6d2'), s = 32;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const d = Math.abs(i - 3.5) + Math.abs(j - 3.5);
    g.fillStyle = d < 1.5 ? '#2a2623' : d < 3 ? '#9a4a2e' : (i + j) % 2 ? '#2a2623' : '#d9c9a4';
    g.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
    if ((i + j) % 2 === 0) { g.fillStyle = 'rgba(214,190,130,.7)'; g.beginPath(); g.arc(i * s + 16, j * s + 16, 6, 0, Math.PI * 2); g.fill(); }
  }
  return c;
}

// ======================================================================= materials (registered in M so the section cut applies)
const std = o => new THREE.MeshStandardMaterial({roughness: 0.9, metalness: 0, ...o});
const own = m => { m.userData.ownUV = true; return m; };
Object.assign(M, {
  lime: std({map: ctex(limeTex()), roughness: 0.95, emissive: 0x201e19}),   // a little self-light: limewash reads pale even in roof shadow
  paving: std({map: ctex(pavingTex()), roughness: 0.7}),
  ceilNave: own(std({map: ctex(naveCeilTex()), roughness: 0.8})),
  ceilQuire: own(std({map: ctex(quireCeilTex()), roughness: 0.8})),
  lantern: own(std({map: ctex(lanternTex()), roughness: 0.8})),
  vault: own(std({map: ctex(vaultTex()), roughness: 0.85, side: THREE.DoubleSide})),
  mural: own(std({map: ctex(muralTex())})),
  tiles: own(std({map: ctex(tilesTex()), roughness: 0.45})),
  paint: std({vertexColors: true, roughness: 0.8}),
  glow: new THREE.MeshBasicMaterial({color: 0xf2f6f8, toneMapped: false}),
  stained: new THREE.MeshBasicMaterial({vertexColors: true}),
  oak: std({color: 0x7a6149, roughness: 0.8}),
  boards: std({color: 0x5e412c, roughness: 0.85, side: THREE.DoubleSide}),
  chair: std({color: 0xa8804f, roughness: 0.65}),
  purbeck: std({color: 0x77766c, roughness: 0.4}),
  shadow: std({color: 0x2e2824, roughness: 1}),
  gilt: std({color: 0xc49a45, roughness: 0.35, metalness: 0.6}),
  pipe: std({color: 0xcfcbc0, roughness: 0.3, metalness: 0.75}),
});
for (const k of ['lime', 'paving', 'ceilNave', 'ceilQuire', 'lantern', 'vault', 'mural', 'tiles', 'paint', 'glow', 'stained', 'oak', 'boards', 'chair', 'purbeck', 'shadow', 'gilt', 'pipe']) M[k].clippingPlanes = [];
// With the section cut on, the cut-away half must not keep shadowing the interior (three.js clips shadows only when asked).
for (const m of Object.values(M)) m.clipShadows = true;
const RED = 0x9c3a2c, CREAM = 0xe9dfcb, SKIN = 0xd8b490, DARK = 0x2a2420;

// ======================================================================= kit: merge many pieces, one mesh per material
const KEEP = ['position', 'normal', 'uv', 'color'];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();
function boxUVKeep(g) {   // world box projection like textures.boxUV, but keeps smooth normals
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    _a.fromBufferAttribute(p, i); _b.fromBufferAttribute(p, i + 1); _c.fromBufferAttribute(p, i + 2);
    _n.subVectors(_c, _b).cross(_t.subVectors(_a, _b));
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    [_a, _b, _c].forEach((v, k) => {
      let u, w;
      if (ay >= ax && ay >= az) { u = v.x; w = v.z; } else if (ax >= az) { u = v.z; w = v.y; } else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u / TILE; uv[(i + k) * 2 + 1] = w / TILE;
    });
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
export const stats = {meshes: 0};
export class Kit {
  constructor() { this.bins = new Map(); }
  put(geo, mat = M.stone, color) {
    const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (mat.map && !mat.userData.ownUV) boxUVKeep(g);
    else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (mat.vertexColors) {
      if (color !== undefined || !g.attributes.color) {
        const c = new THREE.Color(color ?? 0xffffff), a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      }
    }
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k) || (k === 'color' && !mat.vertexColors)) g.deleteAttribute(k);
    g.morphAttributes = {}; g.clearGroups();
    if (!this.bins.has(mat)) this.bins.set(mat, []);
    this.bins.get(mat).push(g);
  }
  done({shadow = false} = {}) {
    for (const [mat, list] of this.bins) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      current().add(mesh); stats.meshes++;
    }
    this.bins.clear();
  }
}
// A frame maps local (u along, y up, d toward the viewer) to world. Reflections get their winding restored.
export function frame(o, u, d) {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...u), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d)).setPosition(...o);
  return {m, flip: m.determinant() < 0};
}
const WORLD = frame([0, 0, 0], [1, 0, 0], [0, 0, 1]);
function tf(geo, F) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(F.m);
  if (F.flip) for (const k of Object.keys(g.attributes)) {
    const at = g.attributes[k], s = at.itemSize, arr = at.array;
    for (let i = 0; i < at.count; i += 3) for (let j = 0; j < s; j++) { const t = arr[(i + 1) * s + j]; arr[(i + 1) * s + j] = arr[(i + 2) * s + j]; arr[(i + 2) * s + j] = t; }
  }
  return g;
}

// ======================================================================= arch geometry
const isRound = h => h === 'nor' || h === 'round';
export const rise = (span, head) => isRound(head) ? span / 2 : span * S60;
// Intrados points from the left springing over the crown to the right springing (equilateral pointed or semicircular).
function archPts(cx, ys, span, head, n = 10) {
  const r = span / 2, pts = [];
  if (isRound(head)) for (let i = 0; i <= 2 * n; i++) { const a = Math.PI * (1 - i / (2 * n)); pts.push(V2(cx + r * Math.cos(a), ys + r * Math.sin(a))); }
  else {
    for (let i = 0; i <= n; i++) { const a = Math.PI - (Math.PI / 3) * (i / n); pts.push(V2(cx + r + span * Math.cos(a), ys + span * Math.sin(a))); }
    for (let i = 1; i <= n; i++) { const a = (Math.PI / 3) * (1 - i / n); pts.push(V2(cx - r + span * Math.cos(a), ys + span * Math.sin(a))); }
  }
  return pts;
}
export const springing = o => Math.max(o.y0, o.y0 + o.h - rise(o.w, o.head));
// Outline of an opening {cx, y0, w, h, head} as a Shape (also used as a hole by model.js).
export function openingShape(o) {
  const ys = springing(o), s = new THREE.Shape();
  s.moveTo(o.cx - o.w / 2, o.y0);
  archPts(o.cx, ys, o.w, o.head).forEach((p, i) => { if (i || ys > o.y0 + 1e-4) s.lineTo(p.x, p.y); });
  if (ys > o.y0 + 1e-4) s.lineTo(o.cx + o.w / 2, o.y0);
  s.closePath();
  return s;
}
const ringShape = (cx, ys, sIn, sOut, head) => new THREE.Shape(archPts(cx, ys, sOut, head).concat(archPts(cx, ys, sIn, head).reverse()));
// Plate between a rectangle top and an arch head: the spandrels of a niche or window head.
function spandrel(u0, u1, ys, yTop, cx, span, head) {
  return new THREE.Shape([V2(u0, ys), V2(u0, yTop), V2(u1, yTop), V2(u1, ys)].concat(archPts(cx, ys, span, head).reverse()));
}
// Plate tracery for a two-light opening: the head above the two sub-arches, pierced by a quatrefoil.
function plateTracery(o) {
  const ys = springing(o), sw = o.w / 2 - 0.06, cl = o.cx - o.w / 4 - 0.03, cr = o.cx + o.w / 4 + 0.03;
  const pts = archPts(o.cx, ys, o.w, o.head);
  const right = archPts(cr, ys, sw, o.head).reverse().slice(1), left = archPts(cl, ys, sw, o.head).reverse();
  const s = new THREE.Shape(pts.concat(right, left.slice(0, -1)));
  const apex = ys + rise(o.w, o.head), subApex = ys + rise(sw, o.head), rl = Math.min(0.2, (apex - subApex) * 0.22);
  s.holes.push(quatrefoil(o.cx, (apex + subApex) / 2 - 0.02, rl));
  return s;
}
function quatrefoil(cx, cy, rl) {
  const s = rl * 0.72, t = (Math.SQRT2 * s + Math.sqrt(4 * rl * rl - 2 * s * s)) / 2, al = Math.atan2(t / Math.SQRT2, t / Math.SQRT2 - s);
  const p = new THREE.Path();
  for (let k = 0; k < 4; k++) { const f = k * Math.PI / 2 + Math.PI / 4; p.absarc(cx + s * Math.cos(f), cy + s * Math.sin(f), rl, f - al, f + al, false); }
  return p;
}
const rect = (u0, u1, y0, y1) => new THREE.Shape([V2(u0, y0), V2(u1, y0), V2(u1, y1), V2(u0, y1)]);
const BOX = (u0, u1, y0, y1, d0, d1) => new THREE.BoxGeometry(Math.abs(u1 - u0), Math.abs(y1 - y0), Math.abs(d1 - d0)).translate((u0 + u1) / 2, (y0 + y1) / 2, (d0 + d1) / 2);
const ext = (sh, d0, d1, seg = 10) => new THREE.ExtrudeGeometry(sh, {depth: d1 - d0, bevelEnabled: false, curveSegments: seg}).translate(0, 0, d0);

// Drawing in a frame.
class Draw {
  constructor(kit, F = WORLD) { this.k = kit; this.F = F; }
  g(geo, mat = M.stone, col) { this.k.put(tf(geo, this.F), mat, col); return this; }
  box(u0, u1, y0, y1, d0, d1, mat, col) { return this.g(BOX(u0, u1, y0, y1, d0, d1), mat, col); }
  cyl(u, d, r, y0, y1, mat, seg = 8, rTop = r) { return this.g(new THREE.CylinderGeometry(rTop, r, y1 - y0, seg).translate(u, (y0 + y1) / 2, d), mat); }
  cone(u, d, r, y0, h, mat, seg = 4, col) { return this.g(new THREE.ConeGeometry(r, h, seg).rotateY(Math.PI / 4).translate(u, y0 + h / 2, d), mat, col); }
  ring(cx, ys, sIn, sOut, head, d0, d1, mat, col) { return this.g(ext(ringShape(cx, ys, sIn, sOut, head), d0, d1), mat, col); }
  shape(sh, d0, d1, mat, col) { return this.g(ext(sh, d0, d1), mat, col); }
  flat(sh, d, mat, col) { return this.g(new THREE.ShapeGeometry(sh, 10).translate(0, 0, d), mat, col); }
  // Roll moulding along an arch: two tubes for a pointed arch so the crown stays sharp.
  tube(cx, ys, span, head, d, r, mat = M.stone) {
    const P = archPts(cx, ys, span, head, 12).map(p => new THREE.Vector3(p.x, p.y, d));
    const parts = isRound(head) ? [P] : [P.slice(0, 13), P.slice(12)];
    for (const q of parts) this.g(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(q), isRound(head) ? 24 : 12, r, 6), mat);
    return this;
  }
  roll(u0, u1, y, d, r, mat = M.stone) { return this.g(new THREE.CylinderGeometry(r, r, u1 - u0, 6).rotateZ(Math.PI / 2).translate((u0 + u1) / 2, y, d), mat); }
  ball(u, y, d, r, mat = M.stone, col) { return this.g(new THREE.IcosahedronGeometry(r, 0).translate(u, y, d), mat, col); }
}

// ======================================================================= nave bays
// Openings of one bay, per style. model.js cuts these as holes; the detail below is built round them.
export function bayOpenings(a, b, st) {
  const c = (a + b) / 2, w = b - a, L = [];
  if (st === 'nor') {
    L.push({role: 'arc', cx: c, y0: 0, w: w - 3.0, h: 9.0, head: 'nor'});
    L.push({role: 'tri', cx: c, y0: 10.3, w: w - 3.6, h: 3.0, head: 'nor'});
    L.push({role: 'cler', cx: c, y0: 15.2, w: 1.6, h: 3.6, head: 'nor'});
  } else {
    L.push({role: 'arc', cx: c, y0: 0, w: w - 2.2, h: 9.0, head: 'ee'});
    for (const s of [-1, 1]) L.push({role: 'tri', cx: c + s * (w / 4 - 0.2), y0: 10.3, w: w / 2 - 1.6, h: 2.8, head: 'ee'});
    for (const s of [-1, 1]) L.push({role: 'cler', cx: c + s * 1.05, y0: 15.2, w: 1.0, h: 3.8, head: 'ee'});
  }
  return L;
}
// side -1 = north arcade, +1 = south. Builds into the CURRENT part. Piers: each bay builds its west pier; the last bay also its east pier.
export function naveBays(xs, styles, side, o = {}) {
  const k = new Kit(), D = new Draw(k, frame([0, 0, side * ZI], [1, 0, 0], [0, 0, -side]));
  for (let i = 0; i < styles.length; i++) {
    const a = xs[i], b = xs[i + 1], ops = bayOpenings(a, b, styles[i]), last = i === styles.length - 1;
    if (styles[i] === 'nor') normanBay(D, a, b, ops, last, o);
    else gothicBay(D, a, b, ops, styles[i] === 'dec', last);
    aisleFace(D, a, b, ops[0], 0);
    for (const c of ops.filter(q => q.role === 'cler')) D.flat(openingShape(c), -1.2, M.glow);
  }
  k.done();
}
function aisleFace(D, a, b, arc, y0, top = 10.0) {
  const s = rect(a, b, y0, top); s.holes.push(openingShape(arc));
  D.shape(s, -WT - 0.03, -WT - 0.005, M.lime);
  const ys = springing(arc);
  D.ring(arc.cx, ys, arc.w - 0.03, arc.w + 0.001, arc.head, -WT - 0.03, -WT + 0.47, M.lime);
  for (const g of [-1, 1]) { const e = arc.cx + g * arc.w / 2; D.box(e, e - g * 0.03, y0, ys, -WT - 0.03, -WT + 0.47, M.lime); }
}
function normanBay(D, a, b, [arc, tri, cler], last, o) {
  const c = (a + b) / 2, ys = springing(arc), e1 = c - arc.w / 2, e2 = c + arc.w / 2;
  for (const p of last ? [a, b] : [a]) if (p < 89) normanPier(D, p);
  // arcade: two square orders on the nave face, plain impost blocks
  for (const [e, g] of [[e1, -1], [e2, 1]]) {
    D.box(e, e + g * 0.45, 0.45, ys - 0.3, 0, 0.2, M.lime);
    D.box(e + g * 0.45, e + g * 0.75, 0.45, ys - 0.3, 0, 0.1, M.lime);
    D.box(e - g * 0.04, e + g * 0.85, ys - 0.3, ys, -WT - 0.06, 0.28, M.stone);
  }
  D.ring(c, ys, arc.w, arc.w + 0.9, 'nor', 0, 0.2, M.lime);
  D.ring(c, ys, arc.w + 0.9, arc.w + 1.5, 'nor', 0, 0.1, M.lime);
  // triforium: one round arch, a 15th-century three-light window inserted (not in the pulpitum bay 11)
  const ty = springing(tri);
  D.ring(c, ty, tri.w, tri.w + 0.7, 'nor', 0, 0.15, M.lime);
  for (const g of [-1, 1]) { const e = c + g * tri.w / 2; D.box(e, e + g * 0.35, tri.y0, ty, 0, 0.15, M.lime); }
  if (Math.abs(a - 70.14) > 0.2) {
    for (const g of [-1, 1]) D.box(c + g * tri.w / 6 - 0.06, c + g * tri.w / 6 + 0.06, tri.y0, ty + tri.w * 0.45, -0.95, -0.75, M.stone);
    D.box(c - tri.w / 2, c + tri.w / 2, tri.y0 + 1.25, tri.y0 + 1.35, -0.95, -0.75, M.stone);
  }
  D.box(a, b, 10.05, 10.3, 0, 0.12, M.lime);
  // clerestory: one round-headed window in a splayed recess
  const cy = springing(cler);
  D.ring(c, cy, cler.w, cler.w + 0.8, 'nor', 0, 0.12, M.lime);
  for (const g of [-1, 1]) { const e = c + g * cler.w / 2; D.box(e, e + g * 0.4, cler.y0, cy, 0, 0.12, M.lime); }
  D.box(c - cler.w / 2 - 0.4, c + cler.w / 2 + 0.4, cler.y0 - 0.2, cler.y0, 0, 0.2, M.lime);
}
function normanPier(D, p) {
  D.box(p - 0.55, p + 0.55, 0.45, 19.95, 0, 0.3, M.lime);          // broad flat pilaster up to the ceiling
  D.box(p - 0.7, p + 0.7, 19.6, 19.95, 0, 0.42, M.stone);           // its cap under the wall plate
  D.box(p - 1.75, p + 1.75, 0, 0.45, -WT - 0.14, 0.42, M.stone);    // plinth round the whole pier
}
function gothicBay(D, a, b, ops, dec, last) {
  const [arc] = ops, c = (a + b) / 2, ys = springing(arc), e1 = c - arc.w / 2, e2 = c + arc.w / 2;
  for (const p of last ? [a, b] : [a]) if (p < 89) gothicPier(D, p, ys, dec);
  // clustered jamb shafts (soffit, nave face, aisle face), each with a moulded capital and base
  for (const [e, g] of [[e1, -1], [e2, 1]]) {
    for (const [uo, dd, r] of [[0.08, -WT / 2, 0.2], [0.36, 0.08, 0.15], [0.36, -WT - 0.08, 0.15]]) {
      const u = e + g * uo;
      D.cyl(u, dd, r, 0.45, ys - 0.42, M.stone, 10);
      D.cyl(u, dd, r, ys - 0.42, ys - 0.12, M.stone, 10, r * 1.55);
      D.cyl(u, dd, r * 1.75, ys - 0.12, ys, M.stone, 8);
      D.cyl(u, dd, r * 1.5, 0.3, 0.45, M.stone, 10);
    }
  }
  // arch: stepped orders and roll mouldings, a big soffit roll
  D.ring(c, ys, arc.w, arc.w + 0.55, 'ee', 0, 0.1, M.stone);
  D.ring(c, ys, arc.w + 0.55, arc.w + 1.15, 'ee', 0, 0.05, M.stone);
  D.tube(c, ys, arc.w + 0.1, 'ee', 0.1, 0.1).tube(c, ys, arc.w + 0.55, 'ee', 0.13, 0.09).tube(c, ys, arc.w + 1.0, 'ee', 0.08, 0.08);
  D.tube(c, ys, arc.w + 0.16, 'ee', -WT / 2, 0.2);
  D.ring(c, ys, arc.w, arc.w + 0.55, 'ee', -WT - 0.1, -WT, M.stone);
  if (dec) {   // Decorated: hood mould with head-stops and ballflower
    D.tube(c, ys, arc.w + 1.45, 'ee', 0.12, 0.1);
    for (const g of [-1, 1]) D.ball(c + g * (arc.w + 1.45) / 2, ys - 0.12, 0.16, 0.2);
    archPts(c, ys, arc.w + 1.45, 'ee', 6).slice(1, -1).forEach(p => D.ball(p.x, p.y, 0.22, 0.075));
  }
  // string courses
  D.box(a, b, 9.95, 10.3, 0, 0.06, M.stone).roll(a, b, 10.2, 0.1, 0.1);
  D.box(a, b, 14.85, 15.2, 0, 0.06, M.stone).roll(a, b, 15.08, 0.09, 0.09);
  // triforium: two openings, each two sub-arches under a pierced quatrefoil, shafted jambs and a roll
  for (const o of ops.filter(q => q.role === 'tri')) {
    const ty = springing(o);
    D.shape(plateTracery(o), -0.62, -0.42, M.stone);
    D.box(o.cx - 0.06, o.cx + 0.06, o.y0, ty, -0.62, -0.42, M.stone);
    D.cyl(o.cx, -0.52, 0.07, o.y0, ty, M.stone, 6);
    D.ring(o.cx, ty, o.w, o.w + 0.34, 'ee', 0, 0.08, M.stone);
    D.tube(o.cx, ty, o.w + 0.17, 'ee', 0.08, 0.065);
    for (const g of [-1, 1]) { const u = o.cx + g * (o.w / 2 + 0.17); D.cyl(u, 0.08, 0.065, o.y0, ty, M.stone, 6).cyl(u, 0.08, 0.1, ty - 0.12, ty, M.stone, 6); }
    if (dec) archPts(o.cx, ty, o.w + 0.42, 'ee', 4).slice(1, -1).forEach(p => D.ball(p.x, p.y, 0.1, 0.06));
  }
  // clerestory: two lancets with shafts and a roll
  for (const o of ops.filter(q => q.role === 'cler')) {
    const cy = springing(o);
    D.ring(o.cx, cy, o.w, o.w + 0.4, 'ee', 0, 0.08, M.stone).tube(o.cx, cy, o.w + 0.2, 'ee', 0.09, 0.07);
    for (const g of [-1, 1]) { const u = o.cx + g * (o.w / 2 + 0.2); D.cyl(u, 0.09, 0.07, o.y0, cy, M.stone, 6).cyl(u, 0.09, 0.11, cy - 0.14, cy, M.stone, 6); }
    D.box(o.cx - o.w / 2 - 0.3, o.cx + o.w / 2 + 0.3, o.y0 - 0.12, o.y0, 0, 0.14, M.stone);
  }
}
function gothicPier(D, p, ys, dec) {
  D.box(p - 1.2, p + 1.2, 0, 0.3, -WT - 0.25, 0.38, M.stone);
  for (const du of [-0.34, 0.34]) {
    D.cyl(p + du, 0.12, 0.13, 0.45, ys - 0.42, M.stone, 10).cyl(p + du, 0.12, 0.13, ys - 0.42, ys - 0.12, M.stone, 10, 0.2).cyl(p + du, 0.12, 0.23, ys - 0.12, ys, M.stone, 8);
  }
  D.cyl(p, 0.16, 0.15, 0.45, 19.6, M.stone, 10);                           // wall shaft rising to the ceiling
  D.cyl(p, 0.16, 0.15, 19.6, 19.95, M.stone, 10, 0.26);
  for (const y of [ys - 0.12, 10.15, 15.05]) D.cyl(p, 0.16, 0.2, y - 0.06, y + 0.06, M.stone, 10);
  D.cyl(p, -WT - 0.12, 0.15, 0.45, ys, M.stone, 10);                        // aisle-side respond
  if (dec) D.cyl(p, -WT - 0.12, 0.25, ys - 0.15, ys, M.stone, 8);
}
// Flat painted timber ceiling (y) between the arcade walls, with transverse beams and wall plates.
export function naveCeiling(x0, x1, mat, y = 20.22) {
  const k = new Kit(), D = new Draw(k);
  const g = new THREE.PlaneGeometry(x1 - x0, 2 * ZI).rotateX(Math.PI / 2).translate((x0 + x1) / 2, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3.2, (p.getZ(i) + ZI) / (2 * ZI));
  k.put(g, mat);
  for (let x = Math.ceil(x0 / 1.6) * 1.6; x < x1; x += 1.6) D.box(x - 0.08, x + 0.08, y - 0.2, y, -ZI, ZI, M.paint, 0x2a140d);
  for (const s of [-1, 1]) {
    D.box(x0, x1, y - 0.42, y, s * (ZI - 0.32), s * ZI, M.paint, 0x3a1c12);
    D.box(x0, x1, y - 0.52, y - 0.42, s * (ZI - 0.2), s * ZI, M.paint, 0xb48a45);
  }
  k.done();
}
// Inside face of an aisle outer wall: limewash, glowing windows with stone surrounds, responds, a sloping boarded ceiling.
// face = z of the inner face, side = -1 north / +1 south, wins = [{cx, y0, w, h, head, lights}], bays = respond positions.
export function aisleLining(x0, x1, face, side, wins, bays = [], o = {}) {
  const k = new Kit(), D = new Draw(k, frame([0, 0, face], [1, 0, 0], [0, 0, -side]));
  const y0 = o.floor ?? 0.12, top = o.top ?? 10.0, depth = Math.abs(face) - (6.5);
  D.box(x0, x1, y0, top, 0, 0.02, M.lime);
  for (const w of wins) {
    const ys = springing(w);
    D.flat(openingShape(w), 0.025, w.stained ? M.stained : M.glow, w.stained);
    D.ring(w.cx, ys, w.w, w.w + 0.5, w.head, 0, 0.12, M.stone);
    for (const g of [-1, 1]) D.box(w.cx + g * w.w / 2, w.cx + g * (w.w / 2 + 0.25), w.y0, ys, 0, 0.12, M.stone);
    D.box(w.cx - w.w / 2 - 0.35, w.cx + w.w / 2 + 0.35, w.y0 - 0.25, w.y0, 0, 0.22, M.stone);
    for (let l = 1; l < (w.lights || 1); l++) D.box(w.cx - w.w / 2 + (w.w * l) / w.lights - 0.06, w.cx - w.w / 2 + (w.w * l) / w.lights + 0.06, w.y0, ys + 0.2, 0.02, 0.1, M.stone);
  }
  for (const x of bays) D.box(x - 0.3, x + 0.3, y0, top - 0.3, 0, 0.25, M.lime);
  // lean-to boarded ceiling from the wall head up to the arcade wall, with rafters
  const q = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
    x0, top - 0.25, 0, x1, top - 0.25, 0, x1, top + 0.2, depth, x0, top - 0.25, 0, x1, top + 0.2, depth, x0, top + 0.2, depth], 3));
  D.g(q, M.boards);
  for (let x = x0 + 0.4; x < x1; x += 0.9) {
    const r = new THREE.BoxGeometry(0.1, 0.16, Math.hypot(depth, 0.45)).rotateX(-Math.atan2(0.45, depth)).translate(x, top - 0.08, depth / 2);
    D.g(r, M.paint, 0x3b2618);
  }
  k.done();
}

// ======================================================================= crossing: hollow tower base with the lantern
// Replaces the solid tower block (0 to 31.9 m) with four walls of the same outline: Roman brick outside, limewash inside.
export function crossingShell(T) {
  const t = 2.1, top = 31.9, cx = (T.x0 + T.x1) / 2, zi = T.z - t, xi0 = T.x0 + t, xi1 = T.x1 - t;
  const k = new Kit();
  const walls = [   // frame (outer face, d into the crossing), u range, centre of the face along u
    {F: frame([T.x0, 0, 0], [0, 0, 1], [1, 0, 0]), u0: -T.z, u1: T.z, c: 0, half: zi},
    {F: frame([T.x1, 0, 0], [0, 0, 1], [-1, 0, 0]), u0: -T.z, u1: T.z, c: 0, half: zi},
    {F: frame([0, 0, -T.z], [1, 0, 0], [0, 0, 1]), u0: xi0, u1: xi1, c: cx, half: (xi1 - xi0) / 2},
    {F: frame([0, 0, T.z], [1, 0, 0], [0, 0, -1]), u0: xi0, u1: xi1, c: cx, half: (xi1 - xi0) / 2},
  ];
  const arch = c => ({cx: c, y0: 0, w: 7.2, h: 16.8, head: 'nor'});
  const lan = c => [-2.65, 2.65].map(o => ({cx: c + o, y0: 26.1, w: 2.2, h: 3.4, head: 'nor'}));
  const gal = (c, half) => [-1, 0, 1].map(j => ({cx: c + j * half * 0.62, y0: 19.4, w: 1.9, h: 3.2, head: 'nor'}));
  walls.forEach((W, i) => {
    const D = new Draw(k, W.F);
    // the outer skin is brick only above the roofs (20.3 m); below it faces the nave, transepts and presbytery: limewash
    const low = rect(W.u0, W.u1, 0, 20.3), outer = rect(W.u0, W.u1, 20.3, top), inner = rect(W.u0, W.u1, 0, top);
    low.holes.push(openingShape(arch(W.c)));
    for (const o of lan(W.c)) outer.holes.push(openingShape(o));
    for (const o of [arch(W.c), ...lan(W.c), ...gal(W.c, W.half)]) inner.holes.push(openingShape(o));
    add(tf(ext(outer, 0, 0.5), W.F), M.brick, {threshold: 35});
    add(tf(ext(low, 0, 0.5), W.F), M.lime, {threshold: 35, shadow: false});
    add(tf(ext(inner, 0.5, t), W.F), M.lime, {edges: false, shadow: false});
    // red and cream painted voussoirs, three square orders, on both faces (the outer faces of the N and S arches are hidden)
    const faces = i < 2 ? [[0, -1], [t, 1]] : [[t, 1]];
    for (const [d, s] of faces) {
      [[7.2, 8.2, 0.26], [8.2, 9.2, 0.13]].forEach(([r0, r1, p]) => {
        voussoirs(D, W.c, 13.2, r0 / 2, r1 / 2, Math.min(d, d + s * p), Math.max(d, d + s * p), r0 < 8 ? 21 : 25);
        for (const g of [-1, 1]) D.box(W.c + g * r0 / 2, W.c + g * r1 / 2, 0.12, 13.2, Math.min(d, d + s * p), Math.max(d, d + s * p), M.lime);
      });
      for (const g of [-1, 1]) D.box(W.c + g * 3.55, W.c + g * 4.75, 12.9, 13.2, Math.min(d, d + s * 0.36), Math.max(d, d + s * 0.36), M.stone);
    }
    // gallery: two sub-arches on a shaft in each recess
    for (const o of gal(W.c, W.half)) {
      const ys = springing(o), sw = o.w / 2 - 0.05;
      D.cyl(o.cx, 1.0, 0.1, o.y0, ys, M.stone, 8).cyl(o.cx, 1.0, 0.18, ys - 0.15, ys, M.stone, 8);
      for (const g of [-1, 1]) D.ring(o.cx + g * (sw / 2 + 0.05), ys, sw - 0.16, sw, 'nor', 0.9, 1.1, M.lime);
    }
    for (const o of lan(W.c)) D.flat(openingShape(o), 1.2, M.glow);
    D.box(W.u0, W.u1, 18.9, 19.15, t, t + 0.15, M.lime);     // gallery sill band
  });
  const D = new Draw(k);
  // lantern ceiling with its painted panels, the slab above, the crossing floor and the presbytery steps
  const g = new THREE.PlaneGeometry(xi1 - xi0, 2 * zi).rotateX(Math.PI / 2).translate(cx, 31.1, 0);
  k.put(g, M.lantern);
  D.box(xi0, xi1, 31.12, top, -zi, zi, M.lime);
  D.box(T.x0, T.x1, 0, 0.12, -T.z, T.z, M.paving);
  for (let s = 0; s < 3; s++) D.box(99.6 + s * 0.45, T.x1, 0.12, 0.28 + s * 0.16, -3.6, 3.6, M.paving);
  // the transepts are still solid: close their arches with a limewashed face
  for (const s of [-1, 1]) D.box(cx - 3.6, cx + 3.6, 0, 16.8, s * T.z - 0.02, s * T.z + 0.02, M.lime);
  k.done();
}
function voussoirs(D, cx, ys, r0, r1, d0, d1, n) {
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (1 - i / n), a1 = Math.PI * (1 - (i + 1) / n), sh = new THREE.Shape();
    sh.moveTo(cx + r0 * Math.cos(a0), ys + r0 * Math.sin(a0));
    sh.absarc(cx, ys, r1, a0, a1, true);
    sh.lineTo(cx + r0 * Math.cos(a1), ys + r0 * Math.sin(a1));
    sh.absarc(cx, ys, r0, a1, a0, false);
    D.shape(sh, d0, d1, M.paint, i % 2 ? CREAM : 0xa24a33);
  }
}

// ======================================================================= presbytery bays and painted vault
export function presbyteryBays(pb, side) {
  const k = new Kit(), D = new Draw(k, frame([0, 0, side * ZI], [1, 0, 0], [0, 0, -side])), F0 = 0.6;
  for (let i = 0; i < pb.length - 1; i++) {
    const a = pb[i], b = pb[i + 1], c = (a + b) / 2, arc = {cx: c, y0: 0, w: b - a - 2.4, h: 9.5, head: 'ee'};
    const ys = springing(arc), cler = {cx: c, y0: 16.2, w: 2.6, h: 5.4, head: 'ee'}, cy = springing(cler);
    for (const p of i === pb.length - 2 ? [a, b] : [a]) {
      D.box(p - 1.3, p + 1.3, F0, F0 + 0.3, -WT - 0.25, 0.38, M.stone);
      for (const du of [-0.36, 0.36]) D.cyl(p + du, 0.12, 0.13, F0 + 0.3, ys - 0.42, M.purbeck, 10).cyl(p + du, 0.12, 0.13, ys - 0.42, ys - 0.12, M.stone, 10, 0.21).cyl(p + du, 0.12, 0.23, ys - 0.12, ys, M.stone, 8);
      D.cyl(p, 0.17, 0.15, F0 + 0.3, 18.6, M.purbeck, 10).cyl(p, 0.17, 0.15, 18.6, 18.9, M.stone, 10, 0.27);
      for (const y of [ys, 10.9, 15.9]) D.cyl(p, 0.17, 0.2, y - 0.06, y + 0.06, M.stone, 10);
    }
    for (const [e, g] of [[c - arc.w / 2, -1], [c + arc.w / 2, 1]]) for (const [uo, dd, r] of [[0.08, -WT / 2, 0.2], [0.36, 0.08, 0.14], [0.36, -WT - 0.08, 0.14]]) {
      const u = e + g * uo;
      D.cyl(u, dd, r, F0 + 0.3, ys - 0.42, M.purbeck, 10).cyl(u, dd, r, ys - 0.42, ys - 0.12, M.stone, 10, r * 1.55).cyl(u, dd, r * 1.75, ys - 0.12, ys, M.stone, 8).cyl(u, dd, r * 1.5, F0 + 0.15, F0 + 0.3, M.stone, 10);
    }
    D.ring(c, ys, arc.w, arc.w + 0.6, 'ee', 0, 0.1, M.stone).ring(c, ys, arc.w + 0.6, arc.w + 1.2, 'ee', 0, 0.05, M.stone);
    D.tube(c, ys, arc.w + 0.1, 'ee', 0.1, 0.1).tube(c, ys, arc.w + 0.6, 'ee', 0.13, 0.09).tube(c, ys, arc.w + 1.05, 'ee', 0.08, 0.08).tube(c, ys, arc.w + 0.16, 'ee', -WT / 2, 0.2);
    D.tube(c, ys, arc.w + 1.5, 'ee', 0.12, 0.09);
    // triforium: a blind trefoiled arcade band
    D.box(a, b, 11.0, 13.6, 0, 0.05, M.stone).roll(a, b, 10.95, 0.1, 0.1).roll(a, b, 13.65, 0.1, 0.1);
    const n = Math.round((b - a) / 0.62), sw = (b - a) / n;
    for (let j = 0; j < n; j++) {
      const u = a + sw * (j + 0.5);
      D.ring(u, 12.85, sw - 0.14, sw - 0.02, 'ee', 0.05, 0.13, M.stone).cyl(u - sw / 2 + 0.04, 0.1, 0.045, 11.1, 12.85, M.stone, 6);
      D.box(u - sw / 2 + 0.07, u + sw / 2 - 0.07, 11.1, 12.85, 0.02, 0.05, M.paint, 0xb3a588);
    }
    // clerestory: three lights with shafted rere-arch, glazed
    D.ring(c, cy, cler.w, cler.w + 0.5, 'ee', 0, 0.1, M.stone).tube(c, cy, cler.w + 0.25, 'ee', 0.1, 0.08);
    for (const g of [-1, 1]) { const u = c + g * (cler.w / 2 + 0.25); D.cyl(u, 0.1, 0.08, cler.y0, cy, M.purbeck, 6).cyl(u, 0.1, 0.12, cy - 0.15, cy, M.stone, 6); }
    for (const g of [-1, 1]) D.box(c + g * cler.w / 6 - 0.05, c + g * cler.w / 6 + 0.05, cler.y0, cy + 0.6, -1.05, -0.95, M.stone);
    D.box(c - cler.w / 2 - 0.3, c + cler.w / 2 + 0.3, cler.y0 - 0.12, cler.y0, 0, 0.14, M.stone).roll(a, b, 15.95, 0.09, 0.09);
    D.flat(openingShape(cler), -1.1, M.glow);
    aisleFace(D, a, b, arc, F0, 10.3);
  }
  k.done();
}
// Painted timber vault, one shallow eight-cell bay at a time (springing 18.8 at the piers, crown 22.2).
export function presbyteryVault(pb) {
  const k = new Kit();
  for (let i = 0; i < pb.length - 1; i++) {
    const a = pb[i], b = pb[i + 1], c = (a + b) / 2, Z = ZI;
    const ring = [[a, 18.8, -Z], [c, 21.7, -Z], [b, 18.8, -Z], [b, 21.9, 0], [b, 18.8, Z], [c, 21.7, Z], [a, 18.8, Z], [a, 21.9, 0]];
    const pos = [], uv = [];
    const P = ([x, y, z]) => { pos.push(x, y, z); uv.push((x - a) / (b - a), (z + Z) / (2 * Z)); };
    for (let j = 0; j < 8; j++) { P([c, 22.2, 0]); P(ring[(j + 1) % 8]); P(ring[j]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    k.put(g, M.vault);
  }
  // east wall of the saints' chapel, inside: limewash, wall arcade, and the east window glazed
  const x = pb[pb.length - 1] - 0.62, E = new Draw(k, frame([x, 0, 0], [0, 0, 1], [-1, 0, 0]));
  E.box(-ZI, ZI, 0.6, 22.3, -0.02, 0, M.lime);
  const win = {cx: 0, y0: 13.5, w: 4.2, h: 8.3, head: 'ee'}, wy = springing(win);
  E.flat(openingShape(win), 0.01, M.glow).ring(0, wy, 4.2, 4.8, 'ee', 0, 0.15, M.stone).tube(0, wy, 4.5, 'ee', 0.15, 0.09);
  for (const g of [-1, 1]) E.box(g * 2.1, g * 2.4, 13.5, wy, 0, 0.15, M.stone);
  for (let l = 1; l < 4; l++) E.box(-2.1 + l * 1.05 - 0.06, -2.1 + l * 1.05 + 0.06, 13.5, wy + 1.6, 0.01, 0.1, M.stone);
  for (let j = 0; j < 8; j++) { const u = -ZI + (j + 0.5) * (2 * ZI / 8); E.ring(u, 3.4, 0.98, 1.16, 'ee', 0, 0.1, M.stone).cyl(u - 0.6, 0.06, 0.06, 0.9, 3.4, M.purbeck, 6); }
  E.box(-ZI, ZI, 0.6, 0.9, 0, 0.2, M.stone).roll(-ZI, ZI, 5.1, 0.08, 0.08);
  k.done();
}

// ======================================================================= furnishings
// Figure: robe (lathe), mantle over the front, head; optional halo or mitre.
function figure(D, u, y, d, h, [robe, mantle, extra] = [CREAM, CREAM]) {
  const r = h * 0.15;
  const prof = [[0, 0], [r * 1.15, 0], [r * 1.05, h * 0.35], [r * 0.82, h * 0.64], [r * 0.95, h * 0.73], [r * 0.5, h * 0.8], [0.001, h * 0.81]].map(([a, b]) => V2(a, b));
  D.g(new THREE.LatheGeometry(prof, 8).translate(u, y, d), M.paint, robe);
  const mp = [[r * 1.22, h * 0.12], [r * 1.12, h * 0.4], [r * 0.95, h * 0.72], [r * 0.55, h * 0.8]].map(([a, b]) => V2(a, b));
  D.g(new THREE.LatheGeometry(mp, 8, -Math.PI * 0.45, Math.PI * 0.9).translate(u, y, d), M.paint, mantle ?? robe);
  D.g(new THREE.SphereGeometry(h * 0.075, 8, 6).translate(u, y + h * 0.885, d), M.paint, extra === 'stone' ? robe : SKIN);
  if (extra === 'mitre') D.cone(u, d, h * 0.07, y + h * 0.93, h * 0.14, M.paint, 4, 0xe9e2d0);
}
// A row of canopied niches in a frame (face plane d = 0, body behind): back, posts with pinnacles, arched head, gable.
function niches(D, u0, u1, n, y0, h, o = {}) {
  const w = (u1 - u0) / n, post = o.post ?? 0.09, dep = o.depth ?? 0.3, iw = w - 2 * post, mat = o.mat ?? M.stone, pin = o.pin ?? w * 0.75;
  const ys = y0 + h - iw * S60 - 0.12, gable = o.gable ?? w * 0.5, cs = [];
  for (let i = 0; i < n; i++) {
    const c = u0 + w * (i + 0.5); cs.push(c);
    D.box(c - w / 2, c + w / 2, y0, y0 + h, -dep - 0.04, -dep, M.paint, o.back ?? 0x9d8e74);
    D.box(c - iw / 2, c + iw / 2, y0, y0 + 0.07, -dep, 0.04, mat);
    D.shape(spandrel(c - w / 2, c + w / 2, ys, y0 + h, c, iw, 'ee'), -0.03, 0.06, mat);
    D.tube(c, ys, iw + 0.05, 'ee', 0.08, 0.035, mat);
    D.shape(new THREE.Shape([V2(c - w / 2 + 0.02, y0 + h), V2(c + w / 2 - 0.02, y0 + h), V2(c, y0 + h + gable)]), 0.0, 0.05, mat);
    D.cone(c, 0.03, 0.05, y0 + h + gable - 0.02, 0.18, mat);
  }
  for (let i = 0; i <= n; i++) {
    const u = u0 + w * i;
    D.box(u - post, u + post, y0, y0 + h, -dep, 0.1, mat);
    D.box(u - post * 0.8, u + post * 0.8, y0 + h, y0 + h + pin * 0.45, -0.05, 0.1, mat).cone(u, 0.03, post * 1.2, y0 + h + pin * 0.45, pin * 0.55, mat);
  }
  return cs;
}
function figuresIn(D, cs, y0, h, d, cols, kind) { cs.forEach((c, i) => figure(D, c, y0 + 0.07, d, h, cols[i % cols.length], kind)); }

// The interior furnishings and the dated interior parts. Called once, after the architecture.
export function buildInterior(B) {
  const STONE = [[0xddd3bf, 0xe6ddc9, 'stone']];
  // ---- 13th-century wall paintings on the west faces of the Norman north piers (limewashed over 1560, uncovered 1862)
  const murals = () => {
    const k = new Kit();
    for (const p of [44.28, 50.83, 57.38, 63.82, 37.90]) {
      const g = new THREE.PlaneGeometry(1.25, 5.2).rotateY(-Math.PI / 2).translate(p - 1.5 - 0.012, 5.3, -ZI - 0.76);
      k.put(g, M.mural);
    }
    k.done();
  };
  part('nave-wall-paintings', 1220, 1560, {label: 'Wall paintings'}); murals();
  part('nave-wall-paintings-uncovered', 1862, 9999, {label: 'Wall paintings'}); murals();

  // ---- nave (rood) screen, c.1350: two doors, seven canopied niches (figures 2015)
  part('rood-screen', 1350, 9999, {label: 'Nave screen'});
  const RS = frame([67.8, 0, 0], [0, 0, 1], [-1, 0, 0]);
  let k = new Kit(), D = new Draw(k, RS);
  D.box(-4.3, 4.3, 0.12, 7.4, -1.4, -0.42, M.stone);
  D.box(-4.4, 4.4, 0.12, 0.42, -0.4, 0.08, M.stone);
  const doors = [-2.75, 2.75], dw = 1.15, dys = 0.12 + 2.5 - dw * S60;
  D.box(-4.3, -3.325, 0.42, 3.05, -0.32, 0, M.stone).box(-2.175, 2.175, 0.42, 3.05, -0.32, 0, M.stone).box(3.325, 4.3, 0.42, 3.05, -0.32, 0, M.stone);
  for (const u of doors) {
    D.shape(spandrel(u - dw / 2, u + dw / 2, dys, 3.05, u, dw, 'ee'), -0.32, 0, M.stone).tube(u, dys, dw + 0.08, 'ee', 0.03, 0.05);
    D.flat(openingShape({cx: u, y0: 0.12, w: dw, h: 2.5, head: 'ee'}), -0.3, M.oak);
  }
  for (let j = 0; j < 14; j++) { const u = -2.1 + j * 0.3 + 0.15; D.ring(u, 2.55, 0.2, 0.24, 'ee', 0, 0.04, M.stone).box(u - 0.15, u - 0.13, 0.42, 2.55, 0, 0.04, M.stone); }
  D.box(-4.35, 4.35, 3.05, 3.2, -0.34, 0.16, M.stone);
  const rcs = niches(D, -3.85, 3.85, 7, 3.2, 2.65, {back: RED, depth: 0.36, gable: 0.7, pin: 1.0});
  D.box(-4.3, -3.85, 3.2, 6.6, -0.32, 0.04, M.stone).box(3.85, 4.3, 3.2, 6.6, -0.32, 0.04, M.stone);
  for (const c of rcs) {   // projecting canopy over each niche: a little arcade front and three pinnacles
    D.box(c - 0.5, c + 0.5, 6.05, 6.75, -0.2, 0.22, M.stone);
    for (const u of [-0.33, 0, 0.33]) { D.ring(c + u, 6.32, 0.22, 0.29, 'ee', 0.22, 0.27, M.stone); D.box(c + u - 0.11, c + u + 0.11, 6.05, 6.32, 0.22, 0.24, M.paint, 0x8a7a62); }
    for (const u of [-0.42, 0, 0.42]) D.box(c + u - 0.04, c + u + 0.04, 6.75, 7.0, 0.1, 0.2, M.stone).cone(c + u, 0.15, 0.06, 7.0, 0.35, M.stone);
  }
  D.box(-4.35, 4.35, 6.75, 7.05, -0.34, 0.18, M.stone);
  for (let j = 0; j <= 28; j++) D.cone(-4.2 + j * 0.3, 0.05, 0.06, 7.05, 0.42, M.stone);
  k.done();
  part('rood-screen-figures', 2015, 9999, {label: 'Nave screen figures'});
  k = new Kit(); D = new Draw(k, RS);
  figuresIn(D, rcs, 3.2, 2.0, -0.18, [[0x6c4f86, 0x3f7a55, 'mitre'], [0x5e7357, 0x6d7d62], [0xb0607a, 0x5b8c5a], [0x2f5d9a, 0xd9b445], [0xb14535, 0x7f8f5a], [0xe8e4da, 0x8fae7c], [0x2f4f7a, 0x4f8a6e]]);
  k.done();

  // ---- pulpitum (stone screen under the organ), x 70.1-76.7
  part('pulpitum', 1350, 9999, {label: 'Pulpitum'});
  k = new Kit(); D = new Draw(k, frame([70.1, 0, 0], [0, 0, 1], [-1, 0, 0]));
  new Draw(k).box(70.1, 76.7, 0.12, 9.3, -4.3, 4.3, M.stone);
  for (let j = 0; j < 14; j++) { const u = -4.0 + j * 0.62 + 0.31; D.ring(u, 8.6, 0.42, 0.52, 'ee', 0, 0.06, M.stone).cyl(u - 0.3, 0.05, 0.05, 7.5, 8.6, M.stone, 6); }
  D.box(-4.4, 4.4, 9.3, 9.6, -6.7, 0.2, M.stone).roll(-4.4, 4.4, 7.45, 0.08, 0.08);
  k.done();
  part('organ', 1860, 9999, {label: 'Organ'});
  k = new Kit(); D = new Draw(k, frame([70.9, 0, 0], [0, 0, 1], [-1, 0, 0]));
  D.box(-3.7, 3.7, 9.6, 12.4, -4.6, 0, M.oak).box(-3.9, 3.9, 12.4, 12.7, -4.8, 0.25, M.oak);
  const towers = [[-3.5, -2.7, 14.6], [-2.5, -1.1, 13.6], [-0.9, 0.9, 15.4], [1.1, 2.5, 13.6], [2.7, 3.5, 14.6]];
  for (const [u0, u1, top] of towers) {
    const n = Math.max(3, Math.round((u1 - u0) / 0.2)), mid = (u0 + u1) / 2;
    for (let j = 0; j < n; j++) {
      const u = u0 + (u1 - u0) * (j + 0.5) / n, hh = top - 1.2 - Math.abs(u - mid) * 1.1, r = 0.06 + (hh - 12) * 0.012;
      D.cyl(u, 0.25, r, 11.0, hh, M.pipe, 10).cyl(u, 0.25, 0.02, 10.4, 11.0, M.pipe, 6, r);
    }
    D.box(u0 - 0.1, u1 + 0.1, 10.2, 10.4, -0.1, 0.45, M.oak).box(u0 - 0.12, u1 + 0.12, top - 0.6, top - 0.3, -0.3, 0.45, M.oak);
    D.box(u0 - 0.12, u0, 10.4, top - 0.6, -0.3, 0.45, M.oak).box(u1, u1 + 0.12, 10.4, top - 0.6, -0.3, 0.45, M.oak);
  }
  k.done();

  // ---- choir stalls with tall canopies (1904), x 76.7-89
  part('choir-stalls', 1904, 9999, {label: 'Choir stalls'});
  k = new Kit();
  for (const s of [-1, 1]) {
    D = new Draw(k, frame([0, 0, s * 3.0], [1, 0, 0], [0, 0, -s]));
    const x0 = 76.9, x1 = 88.8;
    D.box(x0, x1, 0.12, 1.0, -0.32, 0, M.oak).box(x0, x1, 0.95, 1.05, -0.4, 0.05, M.oak);
    D.box(x0, x1, 0.42, 0.5, -0.8, -0.42, M.oak).box(x0, x1, 0.12, 0.35, -1.65, -0.8, M.oak);
    D.box(x0, x1, 0.35, 1.3, -1.12, -0.95, M.oak).box(x0, x1, 0.77, 0.85, -1.55, -1.15, M.oak);
    D.box(x0, x1, 0.35, 3.3, -1.7, -1.6, M.oak).box(x0, x1, 3.2, 3.42, -1.72, -0.95, M.oak);
    for (let u = x0; u <= x1 + 0.01; u += (x1 - x0) / 18) {
      D.box(u - 0.04, u + 0.04, 0.35, 1.55, -1.6, -1.12, M.oak);
      D.box(u - 0.05, u + 0.05, 1.55, 3.2, -1.05, -0.95, M.oak);
      D.box(u - 0.05, u + 0.05, 3.42, 4.1, -1.25, -1.05, M.oak).cone(u, -1.15, 0.09, 4.1, 1.3, M.oak);
    }
    for (let u = x0 + (x1 - x0) / 36; u < x1; u += (x1 - x0) / 18) {
      D.ring(u, 2.75, 0.5, 0.58, 'ee', -1.05, -0.97, M.oak);
      D.shape(new THREE.Shape([V2(u - 0.3, 3.42), V2(u + 0.3, 3.42), V2(u, 4.0)]), -1.0, -0.96, M.oak).cone(u, -0.98, 0.05, 3.95, 0.5, M.oak);
    }
    D.box(x0 - 0.06, x0 + 0.06, 0.12, 1.4, -1.65, 0.05, M.oak).box(x1 - 0.06, x1 + 0.06, 0.12, 1.4, -1.65, 0.05, M.oak);
  }
  k.done();

  // ---- the nave today: chairs and the nave altar platform
  part('nave-chairs', 1900, 9999, {label: 'Nave seating'});
  k = new Kit(); D = new Draw(k);
  for (let s = 0; s < 3; s++) D.box(63.5 + s * 0.45, 67.8, 0.12, 0.28 + s * 0.16, -4.6, 4.6, M.paving);
  D.box(65.0, 66.0, 0.6, 1.55, -1.3, 1.3, M.oak).box(64.95, 66.05, 1.55, 1.6, -1.4, 1.4, M.paint, 0xf1ece0);
  D.box(64.94, 64.96, 0.8, 1.5, -1.2, 1.2, M.paint, 0x7d2a24);
  k.done();
  chairs();

  // ---- high altar
  part('high-altar', 1300, 9999, {label: 'High altar'});
  k = new Kit(); D = new Draw(k);
  D.box(117.6, 120.3, 0.6, 0.78, -2.6, 2.6, M.paving).box(118.4, 120.3, 0.78, 0.94, -2.2, 2.2, M.paving);
  D.box(119.0, 120.0, 0.94, 1.95, -1.5, 1.5, M.stone).box(118.92, 120.08, 1.95, 2.0, -1.6, 1.6, M.paint, 0xf1ece0);
  D.box(118.97, 118.99, 1.0, 1.9, -1.45, 1.45, M.paint, 0x8a2a24).box(118.96, 118.98, 1.82, 1.9, -1.45, 1.45, M.gilt);
  for (const z of [-1.1, 1.1]) D.cyl(119.7, z, 0.06, 2.0, 2.55, M.gilt, 8).cyl(119.7, z, 0.025, 2.55, 2.85, M.paint, 6);
  D.box(119.68, 119.74, 2.0, 2.9, -0.04, 0.04, M.gilt).box(119.68, 119.74, 2.55, 2.61, -0.25, 0.25, M.gilt);
  k.done();
  part('sanctuary-tiles', 1880, 9999, {label: 'Sanctuary floor'});
  k = new Kit();
  { const g = new THREE.PlaneGeometry(12.2, 9.8).rotateX(-Math.PI / 2).translate(111.4, 0.605, 0), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.2, p.getZ(i) / 1.2); k.put(g, M.tiles); }
  k.done();

  // ---- Wallingford screen (c.1480): tiers of canopied niches, central crucifix; figures lost 1539, new figures 1884-90
  part('wallingford-screen', 1484, 9999, {label: 'Wallingford screen'});
  const WS = frame([120.3, 0, 0], [0, 0, 1], [-1, 0, 0]);
  k = new Kit(); D = new Draw(k, WS);
  D.box(-ZI, ZI, 0.6, 11.4, -1.2, -0.36, M.stone).box(-ZI - 0.05, ZI + 0.05, 0.6, 1.0, -0.4, 0.06, M.stone);
  const wdw = 1.0, wdy = 0.6 + 2.4 - wdw * S60;
  for (const u of [-3.65, 3.65]) {
    D.shape(spandrel(u - wdw / 2, u + wdw / 2, wdy, 3.7, u, wdw, 'ee'), -0.32, 0, M.stone).flat(openingShape({cx: u, y0: 0.6, w: wdw, h: 2.4, head: 'ee'}), -0.3, M.oak);
    for (const g of [-1, 1]) D.box(u + g * wdw / 2, u + g * (wdw / 2 + 0.35), 1.0, 3.7, -0.32, 0, M.stone);
  }
  D.box(-ZI, -4.5, 1.0, 3.7, -0.32, 0, M.stone).box(4.5, ZI, 1.0, 3.7, -0.32, 0, M.stone);
  const reredos = niches(D, -3.0, 3.0, 9, 1.4, 2.0, {depth: 0.16, gable: 0.25, pin: 0.4, back: 0xa69676});
  const tiers = [[3.95, 2.5], [6.95, 2.3]], wfig = [];
  for (const [y0, h] of tiers) for (const [u0, u1] of [[-4.95, -1.3], [1.3, 4.95]]) wfig.push([niches(D, u0, u1, 4, y0, h, {gable: 0.35, pin: 0.6}), y0, h]);
  for (const y of [3.7, 6.62, 9.48]) D.box(-ZI - 0.05, ZI + 0.05, y, y + 0.25, -0.34, 0.16, M.stone);
  wfig.push([niches(D, -4.95, 4.95, 13, 9.75, 1.15, {gable: 0.2, pin: 0.35}), 9.75, 1.15]);
  // central crucifix in a tall niche
  D.box(-1.3, 1.3, 3.95, 9.45, -0.75, -0.7, M.paint, 0x8f806a).box(-1.3, -1.18, 3.95, 9.45, -0.7, 0.1, M.stone).box(1.18, 1.3, 3.95, 9.45, -0.7, 0.1, M.stone);
  D.shape(spandrel(-1.3, 1.3, 8.6, 9.45, 0, 2.36, 'ee'), -0.05, 0.06, M.stone);
  D.box(-0.06, 0.06, 4.5, 8.6, -0.62, -0.5, M.gilt).box(-0.9, 0.9, 7.35, 7.47, -0.62, -0.5, M.gilt);
  D.box(-ZI - 0.05, ZI + 0.05, 10.9, 11.15, -0.34, 0.18, M.stone);
  for (let j = 0; j <= 26; j++) D.cone(-ZI + j * (2 * ZI / 26), 0.05, 0.07, 11.15, 0.5, M.stone);
  k.done();
  const wFigures = cols => {
    k = new Kit(); D = new Draw(k, WS);
    for (const [cs, y0, h] of wfig) figuresIn(D, cs, y0, h * 0.72, -0.15, cols);
    figuresIn(D, reredos, 1.4, 1.35, -0.08, cols);
    figure(D, 0, 5.55, -0.5, 2.25, [0xe6d7bd, 0xe6d7bd]);   // Christ on the cross
    D.box(-0.6, 0.6, 6.95, 7.05, -0.5, -0.4, M.paint, 0xe6d7bd);
    for (const u of [-0.85, 0.85]) figure(D, u, 4.0, -0.4, 1.7, [0xe2d7c0, 0xe2d7c0, 'stone']);
    k.done();
  };
  part('wallingford-figures-medieval', 1484, 1539, {label: 'Screen figures'}); wFigures([[0xc9b48f, 0x9b3a2c], [0xc9b48f, 0x3e5f8a], [0xd9c7a0, 0xd9c7a0]]);
  part('wallingford-figures', 1886, 9999, {label: 'Screen figures'}); wFigures(STONE);

  // ---- shrine of St Alban: Purbeck marble pedestal (1302-08), smashed 1539, rebuilt from fragments 1872
  const shrine = medieval => {
    const k2 = new Kit(), W0 = new Draw(k2);
    W0.box(124.45, 127.35, 0.6, 0.95, -0.62, 0.62, M.purbeck).box(124.6, 127.2, 0.95, 2.75, -0.38, 0.38, M.shadow);
    for (const s of [-1, 1]) niches(new Draw(k2, frame([124.6, 0, s * 0.485], [1, 0, 0], [0, 0, s])), 0, 2.6, 5, 0.95, 1.5, {mat: M.purbeck, depth: 0.09, back: 0x3b3935, gable: 0.18, pin: 0.3, post: 0.05});
    for (const [x, dx] of [[124.6, -1], [127.2, 1]]) niches(new Draw(k2, frame([x, 0, 0], [0, 0, 1], [dx, 0, 0])), -0.485, 0.485, 1, 0.95, 1.5, {mat: M.purbeck, depth: 0.09, back: 0x3b3935, gable: 0.18, pin: 0.3, post: 0.05});
    W0.box(124.5, 127.3, 2.75, 3.1, -0.58, 0.58, M.purbeck).box(124.48, 127.32, 2.95, 3.02, -0.6, 0.6, M.paint, 0xb7ad97);
    const tri = new THREE.Shape([V2(-0.62, 3.1), V2(0.62, 3.1), V2(0, medieval ? 4.0 : 4.35)]);
    const P = new Draw(k2, frame([124.5, 0, 0], [0, 0, 1], [1, 0, 0]));
    if (medieval) { P.shape(new THREE.Shape([V2(-0.45, 3.1), V2(0.45, 3.1), V2(0.45, 3.6), V2(0, 4.05), V2(-0.45, 3.6)]), 0.3, 2.5, M.gilt); }
    else {
      P.shape(tri, 0, 2.8, M.paint, 0x9c2621);
      for (const u of [0.0, 1.4, 2.8]) P.box(-0.6, 0.6, 3.1, 3.18, u - 0.03, u + 0.03, M.gilt);
      W0.box(124.5, 127.3, 4.28, 4.38, -0.04, 0.04, M.gilt);
      for (let j = 0; j < 6; j++) for (const s of [-1, 1]) W0.ball(124.8 + j * 0.44, 3.55, s * 0.36, 0.07, M.gilt);
    }
    k2.done();
  };
  part('shrine-of-st-alban', 1308, 1539, {label: 'Shrine of St Alban'}); shrine(true);
  part('shrine-of-st-alban-rebuilt', 1872, 9999, {label: 'Shrine of St Alban'}); shrine(false);

  // ---- Watching Loft (c.1400-20): two-storey oak gallery, north side of the saints' chapel
  part('watching-loft', 1400, 9999, {label: 'Watching Loft'});
  k = new Kit(); D = new Draw(k, frame([124.2, 0, -4.8], [1, 0, 0], [0, 0, 1]));
  const L = 4.2;
  D.box(0, L, 0.6, 2.75, -1.8, -0.1, M.oak).box(0, L, 0.6, 0.8, -0.12, 0.04, M.oak);
  for (let j = 0; j < 6; j++) {
    const u0 = j * L / 6;
    D.box(u0 + 0.06, u0 + L / 6 - 0.06, 0.85, 2.65, -0.1, -0.04, M.paint, 0x6a5440);
    for (let q = 1; q < 4; q++) D.box(u0 + q * L / 24 - 0.02, u0 + q * L / 24 + 0.02, 1.0, 2.5, -0.04, 0.0, M.oak);
    D.box(u0 - 0.04, u0 + 0.04, 0.6, 2.75, -0.1, 0.06, M.oak);
  }
  D.box(-0.05, L + 0.05, 2.75, 3.2, -0.12, 0.2, M.paint, 0x5d4632);
  D.box(0, L, 3.2, 3.6, -0.15, 0.08, M.oak).box(0, L, 3.2, 4.75, -1.85, -1.7, M.shadow).box(0, L, 4.6, 4.75, -1.8, 0, M.oak);
  const ln = 10, lw = L / ln;
  for (let j = 0; j <= ln; j++) D.box(j * lw - 0.04, j * lw + 0.04, 3.6, 4.75, -0.1, 0.06, M.oak);
  for (let j = 0; j < ln; j++) {
    const c = (j + 0.5) * lw, iw = lw - 0.08;
    D.shape(spandrel(c - lw / 2, c + lw / 2, 4.2, 4.6, c, iw, 'ee'), -0.06, 0.03, M.oak);
    D.box(c - 0.02, c + 0.02, 3.6, 4.35, -0.05, 0.02, M.oak);
    for (const g of [-1, 1]) D.ring(c + g * iw / 4, 4.1, iw / 2 - 0.06, iw / 2 - 0.01, 'ee', -0.05, 0.02, M.oak);
  }
  D.box(-0.06, L + 0.06, 4.75, 4.95, -1.85, 0.14, M.oak);
  for (let j = 0; j < 21; j++) D.box(j * L / 21 + 0.03, j * L / 21 + 0.14, 4.95, 5.15, -0.05, 0.12, M.oak);
  k.done();

  // ---- chantry chapels: stone cages, panelled below, open tracery above, a band of niches and cresting
  const chantry = (F, len, dep, o) => {
    const k2 = new Kit(), C = new Draw(k2, F), y0 = 0.6, lo = y0 + o.low, hi = y0 + o.high;
    C.box(0, len, y0, hi + 1.2, -dep, -dep + 0.15, M.stone).box(0, len, hi, hi + 0.2, -dep, 0, M.stone);
    C.box(0, len, y0, y0 + 0.3, -0.15, 0.06, M.stone).box(0, len, y0 + 0.3, lo, -0.15, 0, M.stone);
    const pn = Math.round(len / 0.32), pw = len / pn;
    for (let j = 0; j < pn; j++) { const c = (j + 0.5) * pw; C.box(c - pw / 2, c - pw / 2 + 0.05, y0 + 0.35, lo - 0.05, 0, 0.05, M.stone).ring(c, lo - 0.45, pw - 0.1, pw - 0.04, 'ee', 0, 0.05, M.stone); }
    if (o.door) C.box(0.3, 1.1, y0, lo - 0.1, 0.0, 0.03, M.oak);
    if (o.shields) for (let j = 0; j < pn; j += 2) C.box((j + 0.5) * pw - 0.1, (j + 0.5) * pw + 0.1, y0 + 0.6, y0 + 0.85, 0.05, 0.08, M.paint, j % 4 ? 0x2d4f7a : 0x9c3a2c);
    C.box(-0.05, len + 0.05, lo, lo + 0.12, -0.15, 0.1, M.stone);
    C.box(0, len, lo + 0.12, hi, -0.7, -0.65, M.shadow);
    const ln2 = o.lights, lw2 = len / ln2, hy = hi - 0.55;
    for (let j = 0; j <= ln2; j++) C.box(j * lw2 - 0.04, j * lw2 + 0.04, lo + 0.12, hi, -0.1, 0.05, M.stone);
    for (let j = 0; j < ln2; j++) {
      const c = (j + 0.5) * lw2;
      C.shape(spandrel(c - lw2 / 2, c + lw2 / 2, hy, hi, c, lw2 - 0.08, 'ee'), -0.08, 0.03, M.stone);
      if (o.transom) C.box(c - lw2 / 2, c + lw2 / 2, (lo + hy) / 2, (lo + hy) / 2 + 0.07, -0.08, 0.03, M.stone);
      if (lw2 > 0.8) { C.box(c - 0.03, c + 0.03, lo + 0.12, hy + 0.2, -0.06, 0.02, M.stone); for (const g of [-1, 1]) C.ring(c + g * lw2 / 4, hy, lw2 / 2 - 0.1, lw2 / 2 - 0.04, 'ee', -0.06, 0.02, M.stone); }
    }
    C.box(-0.08, len + 0.08, hi, hi + 0.2, -0.2, 0.16, M.stone);
    const cs = niches(C, 0.05, len - 0.05, o.niches, hi + 0.2, 0.85, {depth: 0.12, gable: 0.12, pin: 0.3, post: 0.05});
    C.box(-0.05, len + 0.05, hi + 1.05, hi + 1.2, -0.2, 0.12, M.stone);
    for (let j = 0; j <= o.niches * 2; j++) C.box(j * len / (o.niches * 2) - 0.05, j * len / (o.niches * 2) + 0.05, hi + 1.2, hi + 1.38, -0.1, 0.08, M.stone);
    for (const u of [0, len]) C.box(u - 0.14, u + 0.14, y0, hi + 1.3, -dep, 0.2, M.stone).cone(u, 0.05, 0.13, hi + 1.3, 0.6, M.stone);
    figuresIn(C, cs, hi + 0.2, 0.62, -0.06, STONE);
    k2.done();
  };
  part('ramryge-chantry', 1520, 9999, {label: 'Ramryge chantry'});
  chantry(frame([113.3, 0, -5.2], [1, 0, 0], [0, 0, 1]), 4.5, 1.9, {low: 1.75, high: 4.0, lights: 12, niches: 7, door: true, transom: true});
  part('wheathampstead-chantry', 1480, 9999, {label: 'Wallingford (Wheathampstead) chantry'});
  chantry(frame([117.6, 0, 5.2], [-1, 0, 0], [0, 0, -1]), 4.3, 2.2, {low: 1.6, high: 3.7, lights: 9, niches: 6, door: true});
  part('duke-humphrey-chantry', 1447, 9999, {label: 'Duke Humphrey chantry'});
  chantry(frame([128.7, 0, 5.0], [-1, 0, 0], [0, 0, -1]), 3.8, 1.7, {low: 1.1, high: 3.8, lights: 3, niches: 9, shields: true});

  // ---- shrine of St Amphibalus (c.1350): clunch pedestal, rebuilt 1872 and 1991 (in the retrochoir, which is still solid)
  const amph = () => {
    const k2 = new Kit(), A = new Draw(k2), x0 = 130.9, x1 = 132.1, z0 = -9.1, z1 = -7.9;
    A.box(x0 - 0.1, x1 + 0.1, 0.6, 0.9, z0 - 0.1, z1 + 0.1, M.stone).box(x0 + 0.05, x1 - 0.05, 0.9, 2.5, z0 + 0.05, z1 - 0.05, M.shadow);
    for (const [F, a0, a1] of [[frame([x0, 0, z1], [1, 0, 0], [0, 0, 1]), 0, 1.2], [frame([x0, 0, z0], [1, 0, 0], [0, 0, -1]), 0, 1.2], [frame([x0, 0, -8.5], [0, 0, 1], [-1, 0, 0]), -0.6, 0.6], [frame([x1, 0, -8.5], [0, 0, 1], [1, 0, 0]), -0.6, 0.6]])
      niches(new Draw(k2, F), a0, a1, 2, 0.9, 1.4, {depth: 0.08, gable: 0.15, pin: 0.25, post: 0.06, back: 0x9a8b70});
    A.box(x0 - 0.08, x1 + 0.08, 2.5, 2.8, z0 - 0.08, z1 + 0.08, M.stone);
    new Draw(k2, frame([x0 - 0.05, 0, -8.5], [0, 0, 1], [1, 0, 0])).shape(new THREE.Shape([V2(-0.66, 2.8), V2(0.66, 2.8), V2(0, 3.75)]), 0, 1.3, M.paint, 0x25438a);
    A.box(x0 - 0.06, x1 + 0.06, 3.7, 3.78, -8.54, -8.46, M.gilt);
    k2.done();
  };
  part('shrine-of-st-amphibalus', 1350, 1539, {label: 'Shrine of St Amphibalus'}); amph();
  part('shrine-of-st-amphibalus-rebuilt', 1872, 9999, {label: 'Shrine of St Amphibalus'}); amph();
}

// Nave chairs: one instanced mesh (about 1,600 chairs in the nave and aisles, facing east).
function chairs() {
  const parts = [BOX(-0.22, 0.22, 0.42, 0.47, -0.22, 0.22), BOX(-0.24, -0.2, 0.47, 0.9, -0.22, 0.22), BOX(-0.21, -0.17, 0, 0.42, -0.22, -0.18),
    BOX(-0.21, -0.17, 0, 0.42, 0.18, 0.22), BOX(0.17, 0.21, 0, 0.42, -0.22, -0.18), BOX(0.17, 0.21, 0, 0.42, 0.18, 0.22), BOX(0.12, 0.2, 0.75, 0.8, -0.22, 0.22)];
  const geo = mergeGeometries(parts.map(p => p.toNonIndexed()));
  const at = [];
  for (let x = 12.6; x < 62.6; x += 0.92) {
    for (let j = 0; j < 7; j++) for (const s of [-1, 1]) at.push([x, s * (1.25 + j * 0.52)]);
    for (let j = 0; j < 7; j++) for (const s of [-1, 1]) {
      const z = s * (7.1 + j * 0.5), near = [11.88, 18.2, 24.81, 31.35, 37.9, 44.28, 50.83, 57.38].some(p => Math.abs(x - p) < 1.0);
      if (!near || Math.abs(z) > 7.6) at.push([x, z]);
    }
  }
  const mesh = new THREE.InstancedMesh(geo, M.chair, at.length), m = new THREE.Matrix4();
  at.forEach(([x, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, 0.12, z)));
  mesh.receiveShadow = true;
  current().add(mesh); stats.meshes++;
}

// ======================================================================= light for walk-in interior views
// Warm fill: a soft hemisphere plus a row of point lights down the axis. Off by default; main.js turns it on for inside views.
let rig = null;
export function setInteriorLight(on) {
  if (!rig && !on) return;
  if (!rig) {
    rig = new THREE.Group(); rig.name = 'interior-light';
    rig.add(new THREE.HemisphereLight(0xffe9cc, 0x5a4636, 0.35));
    for (const x of [12, 26, 40, 54, 68, 82, 96, 110, 124]) {
      const l = new THREE.PointLight(0xffd29a, 55, 0, 2); l.position.set(x, 11, 0); rig.add(l);
    }
    scene.add(rig);
  }
  rig.visible = on;
}
// Inside mode for eye-level views: the light rig, a wider lens, and OrbitControls allowed to look UP (its default clamp
// of 0.495 pi otherwise lifts the camera to the target's height). setInside(false, ...) restores all three.
const saved = {};
export function setInside(on, camera, controls, fov = INSIDE_VIEW.fov) {
  setInteriorLight(on);
  if (on) {
    if (!saved.on) Object.assign(saved, {on: true, fov: camera.fov, maxPolar: controls.maxPolarAngle, minDist: controls.minDistance});
    camera.fov = fov; controls.maxPolarAngle = Math.PI * 0.97; controls.minDistance = 0.5;
  } else if (saved.on) {
    camera.fov = saved.fov; controls.maxPolarAngle = saved.maxPolar; controls.minDistance = saved.minDist; saved.on = false;
  }
  camera.updateProjectionMatrix();
}
// Walk-in camera: standing in the nave near the west end, looking east towards the altar (no section cut).
export const INSIDE_VIEW = {cam: [18, 1.7, 0], look: [100, 6, 0], fov: 50};
