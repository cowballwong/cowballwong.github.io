// HK Site Analysis v3: the 3D view (three.js, loaded on demand by app.js).
//   supported()                      WebGL available?
//   mount(container, res, opts)      interactive view, 'massing' (3D site) or 'explode' (exploded axonometric of the diagrams)
//                                    -> { mode, setMode(mode, opts), update(opts), exportPNG({width, height}), dispose(), ready }
//   renderExploded(res, opts)        offscreen high-res exploded axonometric for sheet 2
//                                    -> { canvas, anchors: [{key, x, y}], keys, north: {x, y, deg} }
// Everything is drawn from the result object made by app.js (HK1980 Grid metres, heights mPD); nothing is invented.
// Look: orthographic camera, flat architectural shading baked into vertex colours (no lights, no shadow maps), so it is
// fast, calm and identical on a GPU and in software rendering.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const PLATES = ['topo', 'sun', 'sunh', 'wind', 'acc', 'noise', 'green', 'svf'];   // bottom to top
const H_BRK = [10, 30, 60, 100, 150];
const FALLBACK = {
  paper: '#fbfaf7', ink: '#1d1c1a', ink2: '#4a4741', muted: '#7a756b', rule: '#d9d3c7', ground: '#f1eee8',
  bld: '#d9d4ca', road: '#ffffff', site: '#e2483d', dark: false,
  hRamp: ['#e6e4f3', '#c6c2e7', '#a29bd5', '#7d73bf', '#5c51a7', '#3b3283'],
  accent: { fig: '#1d1c1a', hgt: '#4b44a3', topo: '#a8713a', sun: '#e89a1c', sunh: '#d9822b', wind: '#2a9fc0', acc: '#13867f', walk: '#2f7d4f',
    noise: '#c43d7e', green: '#4f9a4a', view: '#3a6fd0', svf: '#5a6fb0' },
};
const TITLES = {
  fig: ['Figure-ground', '圖底關係'], hgt: ['Building heights', '建築物高度'], topo: ['Topography', '地形'],
  sun: ['Winter shadows', '冬至陰影'], sunh: ['Sunlight hours', '日照時數'], wind: ['Prevailing wind', '盛行風'],
  acc: ['Access and movement', '交通及人流'], walk: ['Walking distance', '步行範圍'], noise: ['Road noise (proxy)', '道路噪音（推算）'],
  green: ['Green and open space', '綠化及休憩空間'], view: ['Views and openness', '景觀及開揚度'], svf: ['Sky view factor', '天空可視因子'],
};
const ROAD_W = { 'Highway': 12, 'Main Road': 9, 'Secondary Road': 6, 'Local Road': 5, 'Restricted Road': 4, 'Track': 2.5 };
const VIEW = { bearing: 210, elev: 32 };          // camera from the SSW, 32 deg up: grid north points up and to the right
const LD = new THREE.Vector3(-0.75, 1.0, 0.35).normalize();   // baked light from the WSW, high
const shade = (nx, ny, nz) => Math.min(1.03, 0.6 + 0.52 * Math.max(0, nx * LD.x + ny * LD.y + nz * LD.z));

export function supported() {
  try {
    const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl');
    if (!g) return false;
    const x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
    return true;
  } catch (e) { return false; }
}

// ---------- small helpers ----------
function themeOf(opts) {
  const t = Object.assign({}, FALLBACK, (opts && opts.theme) || {});
  if (!Array.isArray(t.hRamp) || t.hRamp.length < 6) t.hRamp = FALLBACK.hRamp;
  t.accent = Object.assign({}, FALLBACK.accent, t.accent || {});
  return t;
}
const lin = (hex) => new THREE.Color(hex);                      // sRGB style -> linear working colour
const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
const txt = (opts, pair) => (pair ? (opts.lang === 'zh' ? pair[1] || pair[0] : pair[0] || pair[1]) : '');
function titleOf(opts, key) { const t = (opts.titles && opts.titles[key]) || TITLES[key] || [key, key]; return txt(opts, t); }
function numOf(opts, key) {
  const ks = opts.keys && opts.keys.length ? opts.keys : PLATES, i = ks.indexOf(key);
  return String((i >= 0 ? i : PLATES.indexOf(key)) + 1).padStart(2, '0');
}
function plateKeys(opts) {
  const ks = opts.keys && opts.keys.length ? opts.keys : PLATES;
  return (opts.plates || PLATES).filter((k) => k !== 'walk' && ks.includes(k));
}
function sArea(p) { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function circlePoly(r, n) { const o = []; for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; o.push([r * Math.cos(t), r * Math.sin(t)]); } return o; }
// Sutherland-Hodgman: clip a (possibly concave) ring against a convex CCW region
function clipPoly(subj, region) {
  let out = subj;
  for (let i = 0, n = region.length; i < n && out.length; i++) {
    const A = region[i], B = region[(i + 1) % n], inp = out; out = [];
    const side = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
    for (let j = 0, m = inp.length; j < m; j++) {
      const P = inp[j], Q = inp[(j + 1) % m], sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
  }
  return out.length >= 3 && Math.abs(sArea(out)) > 0.5 ? out : null;
}
function dedupe(r) {
  const o = [];
  for (const p of r) { const q = o[o.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) o.push(p); }
  if (o.length > 1 && Math.hypot(o[0][0] - o[o.length - 1][0], o[0][1] - o[o.length - 1][1]) < 0.05) o.pop();
  return o.length >= 3 ? o : null;
}
function densify(ring, step, closed = true) {
  const o = [], n = ring.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = ring[i], b = ring[(i + 1) % n], k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let t = 0; t < k; t++) o.push([a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k]);
  }
  if (!closed) o.push(ring[n - 1]);
  return o;
}

// terrain height (mPD) at E, N: res.h (bilinear DTM) or the 5 m frame grid, never NaN
function terrainFn(res) {
  const fb = Number.isFinite(res.zs) ? res.zs : 0;
  if (typeof res.h === 'function') return (E, N) => { const v = res.h(E, N); return Number.isFinite(v) ? v : fb; };
  const g = res.grid;
  if (g && g.gz) {
    const C = g.cell || 5;
    return (E, N) => {
      let x = (E - g.gx0) / C, y = (N - g.gy0) / C;
      x = Math.max(0, Math.min(g.gnx - 1.001, x)); y = Math.max(0, Math.min(g.gny - 1.001, y));
      const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, z = g.gz, w = g.gnx;
      const a = z[j * w + i], b = z[j * w + i + 1], c = z[(j + 1) * w + i], d = z[(j + 1) * w + i + 1];
      const r = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
      return Number.isFinite(r) ? r : fb;
    };
  }
  return () => fb;
}

// triangle soup with baked shade per vertex and a colour class per vertex
function soup() { return { P: [], K: [], I: [] }; }
function tri(g, A, B, C, n, kA, kB, kC, cls) {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * cx + cy * cy + cz * cz < 1e-10) return;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const T = B; B = C; C = T; const t = kB; kB = kC; kC = t; }
  g.P.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); g.K.push(kA, kB, kC); g.I.push(cls, cls, cls);
}
function soupColours(g, pal) {
  const n = g.K.length, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const p = pal[g.I[i]], k = g.K[i]; c[i * 3] = p.r * k; c[i * 3 + 1] = p.g * k; c[i * 3 + 2] = p.b * k; }
  return c;
}
function soupGeometry(g, pal) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.P, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(soupColours(g, pal), 3));
  geo.computeBoundingSphere();
  return geo;
}
// extruded prism from plan rings (x east, y north) to world (x, y up, -north); walls darken towards the ground
function prism(g, edges, outer, holes, yb, yt, cls, { edge = true, ao = 0.84 } = {}) {
  const w = (p, y) => [p[0], y, -p[1]];
  const v2 = (r) => r.map((p) => new THREE.Vector2(p[0], p[1]));
  let faces;
  try { faces = THREE.ShapeUtils.triangulateShape(v2(outer), holes.map(v2)); } catch (e) { faces = []; }
  const all = outer.concat(...holes), kr = shade(0, 1, 0);
  for (const [a, b, c] of faces) tri(g, w(all[a], yt), w(all[b], yt), w(all[c], yt), [0, 1, 0], kr, kr, kr, cls);
  const so = sArea(outer) > 0 ? 1 : -1;
  [outer, ...holes].forEach((r, ri) => {
    const sg = ri === 0 ? so : -(sArea(r) > 0 ? 1 : -1), m = r.length;
    for (let i = 0; i < m; i++) {
      const p = r[i], q = r[(i + 1) % m], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
      const nx = sg * dy / L, ny = -sg * dx / L, n = [nx, 0, -ny], k = shade(nx, 0, -ny), kb = k * ao;
      tri(g, w(p, yb), w(q, yb), w(q, yt), n, kb, kb, k, cls);
      tri(g, w(p, yb), w(q, yt), w(p, yt), n, kb, k, k, cls);
      if (edge) {
        edges.push(p[0], yt, -p[1], q[0], yt, -q[1]);
        const o = r[(i + m - 1) % m], ax = p[0] - o[0], ay = p[1] - o[1];
        const turn = Math.abs(Math.atan2(ax * dy - ay * dx, ax * dx + ay * dy));
        if (turn > 0.35) edges.push(p[0], yb, -p[1], p[0], yt, -p[1]);
      }
    }
  });
}

// ---------- the scene ----------
// Builds everything for one result + options. Plates are created as blank paper and textured later (loadPlates).
function buildScene(res, opts) {
  const th = themeOf(opts), shape = opts.shape === 'circle' ? 'circle' : 'square';
  const f = res.f, s = f.s || (f.E1 - f.E0), a = s / 2, cE = f.cE, cN = f.cN;
  const own = [], fat = [];
  const keep = (x) => { own.push(x); return x; };
  const scene = new THREE.Scene(); scene.background = new THREE.Color(th.paper);
  const hAt = terrainFn(res), hp = (x, y) => hAt(cE + x, cN + y);
  const region = shape === 'circle' ? circlePoly(a, 160) : [[-a, -a], [a, -a], [a, a], [-a, a]];
  const inside = shape === 'circle' ? (x, y) => x * x + y * y <= a * a + 1e-6 : (x, y) => Math.abs(x) <= a + 1e-6 && Math.abs(y) <= a + 1e-6;
  const root = new THREE.Group(); scene.add(root);

  // terrain heights first (z0 = lowest ground in the frame = y 0)
  const tv = [], tidx = [], loop = [];
  if (shape === 'square') {
    const n = Math.max(2, Math.round(s / 5) + 1), st = s / (n - 1);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = -a + i * st, y = -a + j * st; tv.push([x, y, hp(x, y)]); }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const k = j * n + i; tidx.push(k, k + 1, k + n + 1, k, k + n + 1, k + n); }
    for (let i = 0; i < n; i++) loop.push(i);
    for (let j = 1; j < n; j++) loop.push(j * n + n - 1);
    for (let i = n - 2; i >= 0; i--) loop.push((n - 1) * n + i);
    for (let j = n - 2; j > 0; j--) loop.push(j * n);
  } else {
    const K = Math.max(2, Math.ceil(a / 5)), M = 160;
    tv.push([0, 0, hp(0, 0)]);
    for (let k = 1; k <= K; k++) for (let m = 0; m < M; m++) { const r = a * k / K, t = m / M * Math.PI * 2; tv.push([r * Math.cos(t), r * Math.sin(t), hp(r * Math.cos(t), r * Math.sin(t))]); }
    for (let m = 0; m < M; m++) tidx.push(0, 1 + m, 1 + (m + 1) % M);
    for (let k = 1; k < K; k++) for (let m = 0; m < M; m++) {
      const p = 1 + (k - 1) * M + m, q = 1 + (k - 1) * M + (m + 1) % M, P = p + M, Q = q + M; tidx.push(p, P, Q, p, Q, q);
    }
    for (let m = 0; m < M; m++) loop.push(1 + (K - 1) * M + m);
  }
  let z0 = Infinity, zt = -Infinity; for (const p of tv) { if (p[2] < z0) z0 = p[2]; if (p[2] > zt) zt = p[2]; }
  const Y = (z) => z - z0, pad = Math.max(5, s * 0.03), yb = -pad;
  const C = {
    ground: lin(th.ground), bld: lin(th.bld), road: lin(th.road), site: lin(th.site), ink: lin(th.ink),
    plinth: lin(mixHex(th.ground, th.ink, th.dark ? 0.2 : 0.07)), slab: lin(mixHex(th.paper, th.ink, th.dark ? 0.3 : 0.12)),
    ramp: th.hRamp.map(lin),
  };

  // terrain mesh, hill-shaded per vertex
  {
    const pos = new Float32Array(tv.length * 3);
    tv.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = Y(p[2]); pos[i * 3 + 2] = -p[1]; });
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(tidx);
    // the index winding above is CCW seen from above in plan (x, y); in world (x, up, -y) it faces up after a flip check
    const ia = geo.index.array, A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3();
    for (let t = 0; t < ia.length; t += 3) {
      A.fromArray(pos, ia[t] * 3); B.fromArray(pos, ia[t + 1] * 3).sub(A); Cc.fromArray(pos, ia[t + 2] * 3).sub(A);
      if (B.cross(Cc).y < 0) { const x = ia[t + 1]; ia[t + 1] = ia[t + 2]; ia[t + 2] = x; }
    }
    geo.computeVertexNormals();
    const nr = geo.attributes.normal.array, col = new Float32Array(pos.length);
    for (let i = 0; i < tv.length; i++) {
      const k = shade(nr[i * 3], nr[i * 3 + 1], nr[i * 3 + 2]);
      col[i * 3] = C.ground.r * k; col[i * 3 + 1] = C.ground.g * k; col[i * 3 + 2] = C.ground.b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }));
    root.add(new THREE.Mesh(geo, mat));
    // plinth skirt, like a card site model
    const g = soup(), L = loop.map((i) => tv[i]), edgeTop = [], edgeBot = [];
    for (let i = 0; i < L.length; i++) {
      const p = L[i], q = L[(i + 1) % L.length], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
      const nx = dy / len, ny = -dx / len;                       // outward for a CCW loop
      const sg = (p[0] + q[0]) * nx + (p[1] + q[1]) * ny >= 0 ? 1 : -1, n = [sg * nx, 0, -sg * ny], k = shade(n[0], 0, n[2]);
      tri(g, [p[0], yb, -p[1]], [q[0], yb, -q[1]], [q[0], Y(q[2]), -q[1]], n, k * 0.9, k * 0.9, k, 0);
      tri(g, [p[0], yb, -p[1]], [q[0], Y(q[2]), -q[1]], [p[0], Y(p[2]), -p[1]], n, k * 0.9, k, k, 0);
      edgeTop.push(p[0], Y(p[2]), -p[1], q[0], Y(q[2]), -q[1]); edgeBot.push(p[0], yb, -p[1], q[0], yb, -q[1]);
    }
    root.add(new THREE.Mesh(keep(soupGeometry(g, [C.plinth])), keep(new THREE.MeshBasicMaterial({ vertexColors: true }))));
    const eg = keep(new THREE.BufferGeometry()); eg.setAttribute('position', new THREE.Float32BufferAttribute(edgeTop.concat(edgeBot), 3));
    root.add(new THREE.LineSegments(eg, keep(new THREE.LineBasicMaterial({ color: th.ink, transparent: true, opacity: 0.45 }))));
  }

  // contours (from the 2D analysis, so they match the plates)
  if (Array.isArray(res.contours)) {
    const mn = [], mj = [];
    for (const c of res.contours) for (const [x0, y0, x1, y1] of c.segs || []) {
      const p0 = [x0 - cE, y0 - cN], p1 = [x1 - cE, y1 - cN];
      if (!inside(...p0) || !inside(...p1)) continue;
      (c.idx ? mj : mn).push(p0[0], Y(c.v) + 0.15, -p0[1], p1[0], Y(c.v) + 0.15, -p1[1]);
    }
    for (const [arr, op] of [[mn, 0.16], [mj, 0.34]]) if (arr.length) {
      const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      root.add(new THREE.LineSegments(g, keep(new THREE.LineBasicMaterial({ color: mixHex(th.ink, '#8a5a2b', th.dark ? 0.2 : 0.5), transparent: true, opacity: op }))));
    }
  }

  // roads: flat ribbons draped on the ground
  if (Array.isArray(res.roadRuns)) {
    const g = soup();
    const clipT = (x0, y0, x1, y1) => {
      const dx = x1 - x0, dy = y1 - y0;
      if (shape === 'circle') {
        const A2 = dx * dx + dy * dy, B2 = 2 * (x0 * dx + y0 * dy), C2 = x0 * x0 + y0 * y0 - a * a, D = B2 * B2 - 4 * A2 * C2;
        if (A2 < 1e-9 || D <= 0) return null;
        const t0 = Math.max(0, (-B2 - Math.sqrt(D)) / (2 * A2)), t1 = Math.min(1, (-B2 + Math.sqrt(D)) / (2 * A2));
        return t1 > t0 ? [t0, t1] : null;
      }
      let t0 = 0, t1 = 1;
      for (const [p, q] of [[-dx, x0 + a], [dx, a - x0], [-dy, y0 + a], [dy, a - y0]]) {
        if (p === 0) { if (q < 0) return null; continue; }
        const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
      }
      return t1 > t0 ? [t0, t1] : null;
    };
    const clampIn = (x, y) => {
      if (shape === 'circle') { const r = Math.hypot(x, y); return r > a ? [x * a / r, y * a / r] : [x, y]; }
      return [Math.max(-a, Math.min(a, x)), Math.max(-a, Math.min(a, y))];
    };
    const ribbon = (pts, wd) => {
      const P = densify(pts, 5, false);
      if (P.length < 2) return;
      const side = [];
      for (let i = 0; i < P.length; i++) {
        const p0 = P[Math.max(0, i - 1)], p1 = P[Math.min(P.length - 1, i + 1)];
        let dx = p1[0] - p0[0], dy = p1[1] - p0[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const L = clampIn(P[i][0] - dy * wd / 2, P[i][1] + dx * wd / 2), R = clampIn(P[i][0] + dy * wd / 2, P[i][1] - dx * wd / 2);
        const yy = Y(hp(P[i][0], P[i][1])) + 0.25;
        side.push([[L[0], Math.max(yy, Y(hp(L[0], L[1])) + 0.25), -L[1]], [R[0], Math.max(yy, Y(hp(R[0], R[1])) + 0.25), -R[1]]]);
      }
      for (let i = 0; i < side.length - 1; i++) {
        const [l0, r0] = side[i], [l1, r1] = side[i + 1];
        tri(g, l0, r0, r1, [0, 1, 0], 1, 1, 1, 0); tri(g, l0, r1, l1, [0, 1, 0], 1, 1, 1, 0);
      }
    };
    for (const run of res.roadRuns) {
      if (!run || run.cls === 'Tunnel' || !run.pts) continue;
      const wd = ROAD_W[run.cls] || 4;
      let cur = null;
      const flush = () => { if (cur && cur.length >= 2) ribbon(cur, wd); cur = null; };
      for (let k = 0; k < run.pts.length - 1; k++) {
        const x0 = run.pts[k][0] - cE, y0 = run.pts[k][1] - cN, x1 = run.pts[k + 1][0] - cE, y1 = run.pts[k + 1][1] - cN;
        const t = clipT(x0, y0, x1, y1);
        if (!t) { flush(); continue; }
        const A = [x0 + (x1 - x0) * t[0], y0 + (y1 - y0) * t[0]], B = [x0 + (x1 - x0) * t[1], y0 + (y1 - y0) * t[1]];
        if (cur && Math.hypot(cur[cur.length - 1][0] - A[0], cur[cur.length - 1][1] - A[1]) > 0.05) flush();
        if (!cur) cur = [A];
        cur.push(B);
        if (t[1] < 1) flush();
      }
      flush();
    }
    if (g.P.length) root.add(new THREE.Mesh(keep(soupGeometry(g, [C.road])), keep(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }))));
  }

  // buildings: one merged mesh, two colourings (height ramp for massing, neutral for the exploded base)
  const bg = soup(), gg = soup(), bE = [], gE = [];
  let yTop = Y(zt), nB = 0;
  const blocks = res.frameBlocks || (res.blocks || []).filter((b) => b.inFrame);
  for (const b of blocks) {
    if (!b || !b.ring || !(b.zt > b.zb)) continue;
    let outer = dedupe(b.ring.map(([E, N]) => [E - cE, N - cN])); if (!outer) continue;
    let holes = (b.holes || []).map((h) => dedupe(h.map(([E, N]) => [E - cE, N - cN]))).filter(Boolean);
    const ins = outer.map((p) => inside(p[0], p[1])), allIn = ins.every(Boolean);
    if (!allIn) {
      const bx0 = Math.min(...outer.map((p) => p[0])), bx1 = Math.max(...outer.map((p) => p[0])), by0 = Math.min(...outer.map((p) => p[1])), by1 = Math.max(...outer.map((p) => p[1]));
      if (bx1 < -a || bx0 > a || by1 < -a || by0 > a) continue;
      if (sArea(outer) < 0) outer = outer.slice().reverse();
      outer = clipPoly(outer, region); if (!outer) continue;
      holes = holes.map((h) => clipPoly(sArea(h) < 0 ? h.slice().reverse() : h, region)).filter(Boolean);
    }
    let gmin = Infinity, gmax = -Infinity;
    for (const p of outer) { const z = hp(p[0], p[1]); if (z < gmin) gmin = z; if (z > gmax) gmax = z; }
    let zb = b.zb; const zTop = b.zt;
    if (zb <= gmax + 1) zb = Math.min(zb, gmin) - 0.3;       // a ground block: run the walls down to the lowest ground
    const H = Number.isFinite(b.H) ? b.H : zTop - gmin;
    let cls = 0; while (cls < H_BRK.length && H >= H_BRK[cls]) cls++;
    if (b.onSite) prism(gg, gE, outer, holes, Y(zb), Y(zTop), 0, { ao: 1 });
    else prism(bg, bE, outer, holes, Y(zb), Y(zTop), cls);
    if (Y(zTop) > yTop) yTop = Y(zTop);
    nB++;
  }
  const bGeo = keep(soupGeometry(bg, C.ramp));
  const colMass = bGeo.attributes.color.array.slice(), colNeutral = soupColours(bg, C.ramp.map(() => C.bld));
  const bMesh = new THREE.Mesh(bGeo, keep(new THREE.MeshBasicMaterial({ vertexColors: true })));
  root.add(bMesh);
  const beG = keep(new THREE.BufferGeometry()); beG.setAttribute('position', new THREE.Float32BufferAttribute(bE, 3));
  const bEdgeMat = keep(new THREE.LineBasicMaterial({ color: th.ink, transparent: true, opacity: th.dark ? 0.35 : 0.3 }));
  root.add(new THREE.LineSegments(beG, bEdgeMat));
  if (gg.P.length) {                                           // buildings on the site: shown as cleared (ghosts)
    const m = new THREE.Mesh(keep(soupGeometry(gg, [lin(th.paper)])), keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false })));
    m.renderOrder = 2; root.add(m);
    const eg = keep(new THREE.BufferGeometry()); eg.setAttribute('position', new THREE.Float32BufferAttribute(gE, 3));
    const l = new THREE.LineSegments(eg, keep(new THREE.LineDashedMaterial({ color: th.site, transparent: true, opacity: 0.55, dashSize: 2.5, gapSize: 2 })));
    l.computeLineDistances(); l.renderOrder = 3; root.add(l);
  }

  // site: a low red hoarding along the boundary plus a bold outline on the ground
  const fatLine = (pts, color, w, opacity = 1) => {
    const flat = []; for (const p of pts) flat.push(p[0], p[1], p[2]);
    const g = keep(new LineGeometry()); g.setPositions(flat);
    const m = keep(new LineMaterial({ color: new THREE.Color(color), linewidth: w, transparent: opacity < 1, opacity, worldUnits: false }));
    m.resolution.set(1000, 1000); fat.push({ m, w });
    const l = new Line2(g, m); l.computeLineDistances(); return l;
  };
  const siteRing = (res.R || []).map(([E, N]) => [E - cE, N - cN]);
  const siteGround = [];
  if (siteRing.length >= 3) {
    const D = densify(siteRing, 2), hh = Math.max(2.5, s * 0.008), g = soup();
    for (const p of D) siteGround.push([p[0], Y(hp(p[0], p[1])) + 0.35, -p[1]]);
    for (let i = 0; i < D.length; i++) {
      const p = siteGround[i], q = siteGround[(i + 1) % D.length];
      tri(g, p, q, [q[0], q[1] + hh, q[2]], [0, 0, 1], 1, 1, 1, 0); tri(g, p, [q[0], q[1] + hh, q[2]], [p[0], p[1] + hh, p[2]], [0, 0, 1], 1, 1, 1, 0);
    }
    const cm = new THREE.Mesh(keep(soupGeometry(g, [C.site])), keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })));
    cm.renderOrder = 4; root.add(cm);
    const ol = fatLine(siteGround.concat([siteGround[0]]), th.site, 2.6); ol.renderOrder = 5; root.add(ol);
  }

  // ---------- exploded plates ----------
  const t = Math.max(1.2, s * 0.007);                          // plate thickness
  const outline = shape === 'circle' ? circlePoly(a, 128) : [[-a, -a], [a, -a], [a, a], [-a, a]];
  const keys = plateKeys(opts);
  const plateGroup = new THREE.Group(); plateGroup.visible = false; root.add(plateGroup);
  const slabMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const plates = keys.map((key) => {
    const grp = new THREE.Group();
    const geo = keep(new THREE.PlaneGeometry(s, s)); geo.rotateX(-Math.PI / 2);
    const mat = keep(new THREE.MeshBasicMaterial({ color: th.paper, side: THREE.DoubleSide, alphaTest: shape === 'circle' ? 0.5 : 0, transparent: false }));
    const top = new THREE.Mesh(shape === 'circle' ? keep(new THREE.CircleGeometry(a, 128).rotateX(-Math.PI / 2)) : geo, mat);
    grp.add(top);
    const sg = soup(); prism(sg, [], outline, [], -t, -0.05, 0, { edge: false, ao: 0.92 });
    grp.add(new THREE.Mesh(keep(soupGeometry(sg, [C.slab])), slabMat));
    const ring = outline.map((p) => [p[0], 0.08, -p[1]]);
    grp.add(fatLine(ring.concat([ring[0]]), th.ink, 1.1, 0.75));
    plateGroup.add(grp);
    return { key, grp, top, mat, geo, y: 0, failed: false, tex: null };
  });
  // guides: faint dashed verticals at the plate corners (or four points of the circle) and red ones at the site extremes
  let guideObj = null;
  const guideFoot = (shape === 'circle' ? [45, 135, 225, 315].map((d) => [a * Math.cos(d * Math.PI / 180), a * Math.sin(d * Math.PI / 180)]) : [[-a, -a], [a, -a], [a, a], [-a, a]]);
  const siteFoot = [];
  if (siteRing.length >= 3) {
    const pick = (fn) => siteRing.reduce((m, p) => (fn(p) > fn(m) ? p : m), siteRing[0]);
    for (const fn of [(p) => p[0], (p) => -p[0], (p) => p[1], (p) => -p[1]]) { const p = pick(fn); if (!siteFoot.some((q) => q === p)) siteFoot.push(p); }
  }
  const S = {
    scene, root, th, shape, s, a, z0, yTop, yb, keys, plates, plateGroup, fat, own, outline, nBlocks: nB,
    gapF: 0.22, hidden: new Set(), mode: 'massing', topY: yTop,
    setColours(mode) { bGeo.attributes.color.array.set(mode === 'explode' ? colNeutral : colMass); bGeo.attributes.color.needsUpdate = true; },
    layout() {
      const gap = s * S.gapF; let y = yTop + gap * 1.1, last = null;
      for (const p of plates) {
        const on = S.mode === 'explode' && !p.failed && !S.hidden.has(p.key);
        p.grp.visible = on;
        if (on) { p.y = y; p.grp.position.y = y; last = y; y += gap; }
      }
      plateGroup.visible = S.mode === 'explode';
      S.topY = last == null ? yTop : last;
      if (guideObj) { root.remove(guideObj); guideObj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); guideObj = null; }
      if (S.mode === 'explode' && last != null) {
        guideObj = new THREE.Group();
        const mk = (feet, color, op, dash) => {
          const arr = [];
          for (const p of feet) { const yg = Y(hp(p[0], p[1])); arr.push(p[0], yg, -p[1], p[0], S.topY, -p[1]); }
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
          const l = new THREE.LineSegments(g, color === 'site' ? guideSiteMat : guideMat); l.computeLineDistances(); return l;
        };
        guideObj.add(mk(guideFoot, 'ink'));
        if (siteFoot.length) guideObj.add(mk(siteFoot, 'site'));
        root.add(guideObj);
      }
    },
    // points that must be in view (for fitting the camera)
    fitPoints(mode) {
      const pts = [], ring = shape === 'circle' ? circlePoly(a, 32) : outline;
      const ys = [yb, yTop];
      if (mode === 'explode') ys.push(S.topY);
      for (const y of ys) for (const p of ring) pts.push(new THREE.Vector3(p[0], y, -p[1]));
      return pts;
    },
    plateOutline(p) { const ring = shape === 'circle' ? circlePoly(a, 96) : outline; return ring.map((q) => new THREE.Vector3(q[0], p.y, -q[1])); },
    dispose() {
      if (guideObj) guideObj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const p of plates) if (p.tex) p.tex.dispose();
      for (const x of own) if (x && x.dispose) x.dispose();
    },
  };
  const guideMat = keep(new THREE.LineDashedMaterial({ color: th.ink, transparent: true, opacity: 0.28, dashSize: s * 0.012, gapSize: s * 0.01 }));
  const guideSiteMat = keep(new THREE.LineDashedMaterial({ color: th.site, transparent: true, opacity: 0.55, dashSize: s * 0.012, gapSize: s * 0.01 }));
  return S;
}

// ---------- plate textures ----------
async function rasterFallback(key, px) {
  const svg = document.querySelector(`#hsa-sheet g[data-k="${key}"] svg`);
  if (!svg) return null;
  const cl = svg.cloneNode(true);
  cl.setAttribute('width', String(px)); cl.setAttribute('height', String(px)); cl.removeAttribute('x'); cl.removeAttribute('y');
  const src = new XMLSerializer().serializeToString(cl);
  const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('plate image')); img.src = url; });
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    cv.getContext('2d').drawImage(img, 0, 0, px, px);
    return cv;
  } finally { URL.revokeObjectURL(url); }
}
async function plateCanvas(key, px, opts) {
  if (typeof opts.plate === 'function') {
    try { const c = await opts.plate(key, px); if (c && c.width > 0) return c; } catch (e) { /* board.plateCanvas not there yet: fall back */ }
  }
  try { return await rasterFallback(key, px); } catch (e) { return null; }
}
// paper backing (so the plate is opaque), clipped to the circle when the frame is round
function backed(src, px, th, shape) {
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const g = cv.getContext('2d');
  if (shape === 'circle') { g.beginPath(); g.arc(px / 2, px / 2, px / 2 - 0.5, 0, Math.PI * 2); g.clip(); }
  g.fillStyle = th.paper; g.fillRect(0, 0, px, px);
  g.drawImage(src, 0, 0, px, px);
  return cv;
}
async function loadPlates(S, opts, px, renderer, onEach) {
  await Promise.all(S.plates.map(async (p) => {
    const src = await plateCanvas(p.key, px, opts);
    if (!src) { p.failed = true; return; }
    const tex = new THREE.CanvasTexture(backed(src, px, S.th, S.shape));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    if (p.tex) p.tex.dispose();
    p.tex = tex; p.mat.map = tex; p.mat.color.set('#ffffff'); p.mat.needsUpdate = true;
    if (onEach) onEach(p);
  }));
  S.layout();
}

// ---------- camera ----------
function makeCamera(S) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1);
  return cam;
}
function orient(cam, target, S, bearing = VIEW.bearing, elev = VIEW.elev) {
  const b = bearing * Math.PI / 180, e = elev * Math.PI / 180, D = Math.max(3000, S.s * 8);
  const dir = new THREE.Vector3(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e));
  cam.position.copy(target).addScaledVector(dir, D); cam.up.set(0, 1, 0); cam.lookAt(target);
  cam.near = 1; cam.far = D * 2 + S.topY + 4000; cam.updateMatrixWorld();
}
// centre the content on the camera axis and return the view height that fits it (fx = share of width for the content)
function fitView(cam, target, pts, aspect, fx, margin) {
  cam.updateMatrixWorld();
  const inv = cam.matrixWorldInverse, v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { v.copy(p).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), U = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  target.addScaledVector(R, cx).addScaledVector(U, cy); cam.position.addScaledVector(R, cx).addScaledVector(U, cy); cam.updateMatrixWorld();
  return Math.max((y1 - y0) / (1 - 2 * margin), (x1 - x0) / (fx * (1 - 2 * margin)) / aspect);
}
function frustum(cam, viewH, aspect, cxFrac) {
  const vw = viewH * aspect;
  cam.left = -vw * cxFrac; cam.right = vw * (1 - cxFrac); cam.top = viewH / 2; cam.bottom = -viewH / 2; cam.updateProjectionMatrix();
}
function toPx(v, cam, W, H) { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }; }
function anchorsOf(S, cam, W, H) {
  return S.plates.filter((p) => p.grp.visible).map((p) => {
    let best = null;
    for (const q of S.plateOutline(p)) { const s = toPx(q, cam, W, H); if (!best || s.x > best.x + 0.01) best = s; }
    return { key: p.key, x: best.x, y: best.y };
  });
}
function northDeg(cam, target) {
  const a = target.clone().project(cam), b = target.clone().add(new THREE.Vector3(0, 0, -10)).project(cam);
  return Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;    // screen angle, clockwise from up (NDC y is up)
}
// label column to the right of the plate anchors; min spacing, kept on canvas
function labelLayout(anchors, W, H, gapPx, colX) {
  const L = anchors.map((a) => ({ ...a, ly: a.y })).sort((p, q) => p.ly - q.ly);
  for (let i = 1; i < L.length; i++) if (L[i].ly < L[i - 1].ly + gapPx) L[i].ly = L[i - 1].ly + gapPx;
  const over = L.length ? L[L.length - 1].ly - (H - gapPx * 0.6) : 0;
  if (over > 0) for (const l of L) l.ly -= over;
  for (let i = L.length - 2; i >= 0; i--) if (L[i].ly > L[i + 1].ly - gapPx) L[i].ly = L[i + 1].ly - gapPx;
  const lx = colX != null ? colX : Math.max(...L.map((l) => l.x)) + 26;
  return L.map((l) => ({ ...l, lx }));
}
function drawNorth(g, x, y, r, deg, ink, paper) {
  g.save(); g.translate(x, y);
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = paper; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
  g.lineWidth = Math.max(1, r * 0.06); g.strokeStyle = ink; g.stroke();
  g.rotate(deg * Math.PI / 180);
  g.beginPath(); g.moveTo(0, -r * 0.78); g.lineTo(r * 0.3, r * 0.45); g.lineTo(0, r * 0.22); g.closePath(); g.fillStyle = ink; g.fill();
  g.beginPath(); g.moveTo(0, -r * 0.78); g.lineTo(-r * 0.3, r * 0.45); g.lineTo(0, r * 0.22); g.closePath(); g.stroke();
  g.restore();
  g.fillStyle = ink; g.font = `bold ${Math.round(r * 0.62)}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText('N', x, y - r - r * 0.25);
}
function setLineScale(S, W, H, k) { for (const { m, w } of S.fat) { m.resolution.set(W, H); m.linewidth = w * k; } }
function offRender(S, cam, W, H, k, aa = true, T = {}) {
  let t = performance.now();
  const r = new THREE.WebGLRenderer({ antialias: aa, preserveDrawingBuffer: true, alpha: false });
  r.setPixelRatio(1); r.setSize(W, H, false); r.outputColorSpace = THREE.SRGBColorSpace;
  T.ctor = Math.round(performance.now() - t); t = performance.now();
  for (const p of S.plates) if (p.tex) { p.tex.anisotropy = (S.aniso != null ? S.aniso : Math.min(4, r.capabilities.getMaxAnisotropy())); r.initTexture(p.tex); }
  T.upload = Math.round(performance.now() - t); t = performance.now();
  setLineScale(S, W, H, k);
  r.render(S.scene, cam); r.getContext().finish();
  T.draw = Math.round(performance.now() - t);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  t = performance.now();
  const g2 = out.getContext('2d', { willReadFrequently: false }); g2.drawImage(r.domElement, 0, 0); g2.getImageData(0, 0, 1, 1);
  T.copy = Math.round(performance.now() - t); t = performance.now();
  r.dispose();
  T.free = Math.round(performance.now() - t); t = performance.now();
  r.forceContextLoss();
  T.lose = Math.round(performance.now() - t);
  return out;
}

// ---------- offscreen exploded axonometric for sheet 2 ----------
export async function renderExploded(res, opts = {}) {
  const W = Math.round(opts.width || 3307), H = Math.round(opts.height || 2339);
  const S = buildScene(res, opts);
  try {
    S.mode = 'explode'; S.setColours('explode'); S.gapF = opts.gap || 0.22; if (opts.aniso != null) S.aniso = opts.aniso;
    const t0 = performance.now();
    await loadPlates(S, opts, opts.platePx || 1536, null);
    const t1 = performance.now();
    S.layout();
    const cam = makeCamera(S), target = new THREE.Vector3(0, S.topY / 2, 0);
    orient(cam, target, S, opts.bearing || VIEW.bearing, opts.elev || VIEW.elev);
    const cxFrac = opts.cx || 0.31, fx = opts.fx || 0.5;
    const viewH = fitView(cam, target, S.fitPoints('explode'), W / H, fx, 0.05);
    frustum(cam, viewH, W / H, cxFrac);
    const TT = {}, canvas = offRender(S, cam, W, H, H / 700, opts.aa !== false, TT);
    const t2 = performance.now();
    const anchors = anchorsOf(S, cam, W, H).map((p) => ({ key: p.key, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
    // north arrow beside the base
    const base = toPx(new THREE.Vector3(-S.a, S.yb, S.a), cam, W, H), deg = northDeg(cam, target), r = H * 0.022;
    const north = { x: Math.round(Math.max(r * 2, base.x - r * 2.5)), y: Math.round(Math.min(H - r * 2, base.y)), deg: Math.round(deg * 10) / 10 };
    if (opts.north !== false) drawNorth(canvas.getContext('2d'), north.x, north.y, r, deg, S.th.ink, S.th.paper);
    return { canvas, anchors, keys: anchors.map((p) => p.key), north, timing: { plates: Math.round(t1 - t0), gl: Math.round(t2 - t1), ...TT } };
  } finally { S.dispose(); }
}

// ---------- interactive view ----------
const css = (el, s) => { el.style.cssText = s; return el; };
export async function mount(container, res, opts = {}) {
  let O = { ...opts }, mode = O.mode === 'explode' ? 'explode' : 'massing', disposed = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(renderer.domElement);
  const ov = css(document.createElement('div'), 'position:absolute;inset:0;pointer-events:none;font-family:inherit;');
  const svgNS = 'http://www.w3.org/2000/svg', lead = document.createElementNS(svgNS, 'svg');
  lead.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;overflow:visible');
  const labels = css(document.createElement('div'), 'position:absolute;inset:0;');
  const north = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  north.setAttribute('viewBox', '0 0 44 52'); north.setAttribute('width', '44'); north.setAttribute('height', '52');
  north.setAttribute('style', 'position:absolute;left:10px;top:8px;width:44px;height:52px;overflow:visible');
  const bar = css(document.createElement('div'), 'position:absolute;left:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:3px;align-items:center;pointer-events:auto;max-width:calc(100% - 16px);');
  const legend = css(document.createElement('div'), 'position:absolute;right:10px;bottom:10px;font-size:11px;line-height:1.2;text-align:right;');
  const hint = css(document.createElement('div'), 'position:absolute;right:10px;top:8px;font-size:11px;opacity:0.7;');
  ov.append(lead, labels, north, legend, hint, bar); container.appendChild(ov);

  let S = null, cam = null, controls = null, target = new THREE.Vector3(), view = { viewH: 100, cxFrac: 0.5 }, raf = 0;
  const isPhone = () => container.clientWidth < 560;
  const size = () => ({ W: Math.max(1, container.clientWidth), H: Math.max(1, container.clientHeight) });
  const L2 = (en, zh) => (O.lang === 'zh' ? zh : en);

  function fit() {
    const { W, H } = size(), asp = W / H, ex = mode === 'explode';
    orient(cam, target.set(0, (ex ? S.topY : S.yTop) / 2, 0), S);
    const ph = isPhone(), fx = ex ? (ph ? 0.5 : 0.6) : 1, bot = ph ? 40 / H : 0;   // phones: keep the button row clear
    const vh = fitView(cam, target, S.fitPoints(mode), asp * (1 - bot), fx, ex ? 0.05 : 0.07) / (1 - bot);
    view = { viewH: vh, cxFrac: ex ? fx / 2 + 0.02 : 0.5 };
    cam.zoom = 1; frustum(cam, view.viewH, asp, view.cxFrac);
    if (bot) { const U = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(-vh * bot / 2); cam.position.add(U); target.add(U); }
    controls.target.copy(target); controls.update();
  }
  function render() {
    raf = 0; if (disposed || !S) return;
    const { W, H } = size();
    setLineScale(S, W * renderer.getPixelRatio(), H * renderer.getPixelRatio(), renderer.getPixelRatio());
    renderer.render(S.scene, cam);
    overlay(W, H);
  }
  const req = () => { if (!raf) raf = requestAnimationFrame(render); };
  function overlay(W, H) {
    const th = S.th, ink = th.ink;
    // north arrow
    const nd = northDeg(cam, controls.target);
    north.innerHTML = `<circle cx="22" cy="32" r="13" fill="${th.paper}" fill-opacity="0.85" stroke="${ink}" stroke-width="0.9"/>` +
      `<g transform="rotate(${nd.toFixed(1)} 22 32)"><path d="M22 21.5L26 37.5L22 34.5Z" fill="${ink}"/><path d="M22 21.5L18 37.5L22 34.5Z" fill="none" stroke="${ink}" stroke-width="0.9" stroke-linejoin="round"/></g>` +
      `<text x="22" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="${ink}" font-family="Helvetica, Arial, sans-serif">N</text>`;
    // labels and leaders (explode)
    lead.innerHTML = ''; labels.innerHTML = '';
    if (mode === 'explode') {
      const fs = isPhone() ? 10.5 : 12.5, A = anchorsOf(S, cam, W, H);
      if (A.length) {
        const colX = Math.min(Math.max(...A.map((p) => p.x)) + (isPhone() ? 14 : 30), W - (isPhone() ? 120 : 210)), maxW = W - colX - 8;
        for (const l of labelLayout(A, W, H, fs * (isPhone() ? 1.5 : 1.9), colX)) {
          const ac = th.accent[l.key] || ink;
          const pl = document.createElementNS(svgNS, 'polyline');
          const kx = Math.min(l.x + 10, l.lx - 6);
          pl.setAttribute('points', `${l.x},${l.y} ${kx},${l.y} ${l.lx - 4},${l.ly}`);
          pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', ink); pl.setAttribute('stroke-opacity', '0.55'); pl.setAttribute('stroke-width', '0.8');
          const dot = document.createElementNS(svgNS, 'circle');
          dot.setAttribute('cx', l.x); dot.setAttribute('cy', l.y); dot.setAttribute('r', '2.4'); dot.setAttribute('fill', ac);
          lead.append(pl, dot);
          const d = css(document.createElement('div'), `position:absolute;left:${l.lx}px;top:${l.ly}px;transform:translateY(-50%);max-width:${maxW}px;font-size:${fs}px;line-height:1.15;color:${ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`);
          d.innerHTML = `<b style="color:${ac};margin-right:5px">${numOf(O, l.key)}</b>`;
          d.appendChild(document.createTextNode(titleOf(O, l.key)));
          labels.appendChild(d);
        }
      }
    }
  }
  function btn(label, title, on) {
    const ph = isPhone(), b = css(document.createElement('button'), `font:inherit;font-size:${ph ? 11 : 12}px;line-height:1;min-width:${ph ? 25 : 28}px;height:${ph ? 26 : 28}px;padding:0 ${ph ? 3 : 7}px;border:1px solid ${S.th.rule};background:${S.th.paper};color:${S.th.ink};border-radius:3px;cursor:pointer;`);
    b.type = 'button'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', on); return b;
  }
  function controlsUI() {
    const th = S.th;
    bar.innerHTML = '';
    bar.appendChild(btn('⟲', L2('Reset view', '重設視角'), () => { fit(); req(); }));
    if (mode === 'explode') {
      bar.appendChild(btn('−', L2('Closer plates', '縮小層距'), () => { S.gapF = Math.max(0.08, S.gapF / 1.3); S.layout(); fit(); req(); }));
      bar.appendChild(btn('+', L2('Wider plates', '加大層距'), () => { S.gapF = Math.min(0.7, S.gapF * 1.3); S.layout(); fit(); req(); }));
      for (const p of S.plates) {
        if (p.failed) continue;
        const off = S.hidden.has(p.key);
        const b = btn(numOf(O, p.key), titleOf(O, p.key) + ' ' + L2(off ? '(off)' : '(on)', off ? '（已關）' : '（已開）'), () => {
          if (S.hidden.has(p.key)) S.hidden.delete(p.key); else S.hidden.add(p.key);
          S.layout(); controlsUI(); req();
        });
        b.style.color = off ? th.muted : (th.accent[p.key] || th.ink); b.style.fontWeight = '700'; b.style.opacity = off ? '0.5' : '1';
        b.setAttribute('aria-pressed', String(!off));
        bar.appendChild(b);
      }
    }
    legend.innerHTML = '';
    legend.style.color = th.ink2 || th.ink;
    if (mode === 'massing') {
      const sw = th.hRamp.map((c) => `<span style="display:inline-block;width:${isPhone() ? 14 : 20}px;height:8px;background:${c}"></span>`).join('');
      legend.innerHTML = `<div>${L2('Height above ground, m', '離地高度（米）')}</div><div style="margin-top:3px;line-height:0">${sw}</div>` +
        `<div style="display:flex;justify-content:space-between;gap:2px;margin-top:2px">${['0', ...H_BRK.map(String)].map((x) => `<span>${x}</span>`).join('')}</div>` +
        `<div style="margin-top:4px"><span style="display:inline-block;width:12px;height:3px;background:${th.site};vertical-align:middle;margin-right:4px"></span>${L2('Site (existing buildings shown as cleared)', '地盤（現有建築物假設已清空）')}</div>`;
    }
    hint.style.color = th.ink;
    hint.textContent = isPhone() ? L2('Drag to turn, pinch to zoom', '拖動旋轉，雙指縮放') : L2('Drag to turn, scroll to zoom, right-drag to pan', '拖動旋轉，滾輪縮放，右鍵拖動平移');
  }

  let ready = Promise.resolve();
  function build(keepCam) {
    const t0 = performance.now();
    const old = S, oldCam = cam ? { p: cam.position.clone(), z: cam.zoom, t: controls.target.clone() } : null;
    S = buildScene(res, O); S.mode = mode; S.setColours(mode);
    if (old) { S.gapF = old.gapF; old.hidden.forEach((k) => S.hidden.add(k)); old.dispose(); }
    if (!cam) {
      cam = makeCamera(S);
      controls = new OrbitControls(cam, renderer.domElement);
      controls.enableDamping = false; controls.screenSpacePanning = true; controls.minZoom = 0.35; controls.maxZoom = 14;
      controls.maxPolarAngle = Math.PI * 0.495;
      controls.addEventListener('change', req);
    }
    S.layout();
    if (keepCam && oldCam) {
      const { W, H } = size(); cam.position.copy(oldCam.p); cam.zoom = oldCam.z; controls.target.copy(oldCam.t);
      frustum(cam, view.viewH, W / H, view.cxFrac); controls.update();
    } else fit();
    controlsUI();
    render();
    api.timing = { build: Math.round(performance.now() - t0), blocks: S.nBlocks };
    const SS = S;
    ready = loadPlates(SS, O, isPhone() ? 768 : 1024, renderer, () => { if (S === SS) req(); })
      .then(() => { if (S === SS && !disposed) { SS.layout(); if (mode === 'explode' && !keepCam) fit(); controlsUI(); render(); api.timing.plates = Math.round(performance.now() - t0); } })
      .catch((e) => console.warn('3D plates:', e));
    api.ready = ready;
  }
  const ro = new ResizeObserver(() => {
    if (!S || disposed) return;
    const { W, H } = size(); renderer.setSize(W, H, false);
    frustum(cam, view.viewH, W / H, view.cxFrac); controlsUI(); req();
  });

  const api = {
    mode, ready, timing: null,
    setMode(m, o) {
      if (o) O = { ...O, ...o };
      mode = m === 'explode' ? 'explode' : 'massing'; api.mode = mode;
      S.mode = mode; S.setColours(mode); S.layout(); fit(); controlsUI(); render();
      return api.ready;
    },
    update(o) {
      const prev = O; O = { ...O, ...(o || {}) };
      if (o && o.mode) { mode = o.mode === 'explode' ? 'explode' : 'massing'; api.mode = mode; }
      const reshape = prev.shape !== O.shape;
      build(!reshape);
      return api.ready;
    },
    async exportPNG({ width, height } = {}) {
      await api.ready;
      const { W: cw, H: ch } = size(), W = Math.round(width || 2400), H = Math.round(height || (W * ch / cw));
      const z = cam.zoom; frustum(cam, view.viewH, W / H, view.cxFrac);
      const out = offRender(S, cam, W, H, H / ch);
      const g = out.getContext('2d'), k = H / ch;
      drawNorth(g, 22 * k, 30 * k, 14 * k, northDeg(cam, controls.target), S.th.ink, S.th.paper);
      if (mode === 'explode') {
        const A = anchorsOf(S, cam, W, H), fs = 12.5 * k;
        if (A.length) {
          const colX = Math.min(Math.max(...A.map((p) => p.x)) + 30 * k, W - 220 * k);
          g.textBaseline = 'middle'; g.textAlign = 'left';
          for (const l of labelLayout(A, W, H, fs * 1.9, colX)) {
            const ac = S.th.accent[l.key] || S.th.ink, kx = Math.min(l.x + 10 * k, l.lx - 6 * k);
            g.strokeStyle = S.th.ink; g.globalAlpha = 0.55; g.lineWidth = 0.8 * k;
            g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(kx, l.y); g.lineTo(l.lx - 4 * k, l.ly); g.stroke(); g.globalAlpha = 1;
            g.fillStyle = ac; g.beginPath(); g.arc(l.x, l.y, 2.4 * k, 0, Math.PI * 2); g.fill();
            const n = numOf(O, l.key); g.font = `bold ${fs}px Helvetica, Arial, 'Microsoft JhengHei', sans-serif`; g.fillText(n, l.lx, l.ly);
            const nw = g.measureText(n).width + 5 * k; g.fillStyle = S.th.ink; g.font = `${fs}px Helvetica, Arial, 'Microsoft JhengHei', 'PingFang TC', sans-serif`;
            g.fillText(titleOf(O, l.key), l.lx + nw, l.ly);
          }
        }
      }
      cam.zoom = z; const { W: w2, H: h2 } = size(); frustum(cam, view.viewH, w2 / h2, view.cxFrac); render();
      return new Promise((ok, no) => out.toBlob((b) => (b ? ok(b) : no(new Error('PNG failed'))), 'image/png'));
    },
    dispose() {
      if (disposed) return; disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); if (controls) controls.dispose();
      if (S) S.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove(); ov.remove();
    },
    // test hooks
    get scene() { return S && S.scene; }, get camera() { return cam; },
  };
  const { W, H } = size(); renderer.setSize(W, H, false);
  build(false);
  ro.observe(container);
  return api;
}
