// HK Site Model (anzonwong.com Lab), V1 massing. Plain ES module, no bundler.
// Data fetched live in the browser: LandsD Building + Road Centreline (CSDI Portal, CORS open).
// Terrain: LandsD 5 m DTM, pre-cut into 1 km tiles in ./dtm/ (see lab_hk_site_model/cut_dtm.py).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const L = window.L, proj4 = window.proj4, JSZip = window.JSZip;
proj4.defs('EPSG:2326', '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243649,-1.158827,-1.094246 +units=m +no_defs');
const toEN = (lat, lon) => proj4('EPSG:4326', 'EPSG:2326', [lon, lat]);
const toLL = (E, N) => { const p = proj4('EPSG:2326', 'EPSG:4326', [E, N]); return [p[1], p[0]]; };

const CSDI = 'https://portal.csdi.gov.hk/server/rest/services/common/';
const BLD_URL = CSDI + 'landsd_rcd_1637211194312_35158/FeatureServer/0/query';
const RD_URL = CSDI + 'landsd_rcd_1637310758814_80061/FeatureServer/0/query';
const DTM_URL = new URL('dtm/', import.meta.url).href;
const CELL = 5, TILE = 201, MARGIN = 150;              // DTM spacing (m), samples per 1 km tile edge, sampling margin (m)
const BOUNDS = { E: [801000, 862500], N: [801000, 847000] };
const ROAD_W = { 'Highway': 12, 'Main Road': 9, 'Secondary Road': 6, 'Restricted Road': 4, 'Track': 2.5 };
const LAYERS = {
  TERRAIN: { aci: 8, rgb: 0xd9d3c6 }, BLDG_TOWER: { aci: 7, rgb: 0xf6f3ec }, BLDG_PODIUM: { aci: 9, rgb: 0xe0d9cb },
  BLDG_OTHER: { aci: 31, rgb: 0xc6b9a4 }, ROADS: { aci: 1, rgb: 0x77726a }, SITE_BOUNDARY: { aci: 6 }, NOTES: { aci: 2 },
};
const ATTRIB = 'Source: Lands Department, The Government of the Hong Kong SAR, via CSDI Portal (portal.csdi.gov.hk) and DATA.GOV.HK. Intellectual property rights in the data belong to the Government of the HKSAR. Derived model, provided as is; not for statutory or survey use.';

// ---------- language ----------
const isZh = () => document.documentElement.getAttribute('data-lang') === 'zh';
const T = (m) => (Array.isArray(m) ? (isZh() ? m[1] : m[0]) : m);
const $ = (id) => document.getElementById(id);
let lastStatus = null, lastStatusKind = '';
function status(msg, kind = '') {
  lastStatus = msg; lastStatusKind = kind;
  const el = $('hsm-status'); el.textContent = T(msg); el.dataset.kind = kind;
}
document.addEventListener('awlang', () => { if (lastStatus) status(lastStatus, lastStatusKind); renderStats(); updateReadout(); setLabels(); });

// ---------- state ----------
const state = { size: 500, E: 834600, N: 815600, model: null, busy: false, stale: false, files: null };
function snapOrigin(E, N, s) { return [Math.round((E - s / 2) / CELL) * CELL, Math.round((N - s / 2) / CELL) * CELL]; }
function clampC(E, N) {
  return [Math.min(BOUNDS.E[1], Math.max(BOUNDS.E[0], E)), Math.min(BOUNDS.N[1], Math.max(BOUNDS.N[0], N))];
}

// ---------- map ----------
const map = L.map('hsm-map', { minZoom: 10, maxZoom: 19, maxBounds: [[22.08, 113.75], [22.62, 114.5]], zoomSnap: 0.5 })
  .setView(toLL(state.E, state.N), 15);
map.attributionControl.setPrefix('<a href="https://leafletjs.com" rel="noopener">Leaflet</a>');
L.tileLayer('https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png', {
  maxZoom: 19, maxNativeZoom: 19, minZoom: 10,
  attribution: '<a href="https://api.portal.hkmapservice.gov.hk/disclaimer" rel="noopener">&copy; Map information from Lands Department</a>',
}).addTo(map);
let labels = null;
function setLabels() {
  const l = isZh() ? 'tc' : 'en';
  if (labels && labels.options.lang === l) return;
  if (labels) map.removeLayer(labels);
  labels = L.tileLayer(`https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/${l}/WGS84/{z}/{x}/{y}.png`, { maxZoom: 19, maxNativeZoom: 19, minZoom: 10, lang: l }).addTo(map);
}
setLabels();

const sq = L.polygon([[0, 0]], { color: '#9c4a2f', weight: 2, fillColor: '#9c4a2f', fillOpacity: 0.12, className: 'hsm-sq' }).addTo(map);
const pin = L.marker(toLL(state.E, state.N), {
  draggable: true, keyboard: true, title: 'Drag to move',
  icon: L.divIcon({ className: 'hsm-pin', iconSize: [22, 22], iconAnchor: [11, 11] }),
}).addTo(map);

function corners() {
  const [E0, N0] = snapOrigin(state.E, state.N, state.size), s = state.size;
  return { E0, N0, E1: E0 + s, N1: N0 + s, s };
}
function drawSquare() {
  const { E0, N0, E1, N1 } = corners();
  const ring = [];
  const k = 8;                                             // densify edges so the HK1980 square stays exact on the map
  for (let i = 0; i < k; i++) ring.push(toLL(E0 + (E1 - E0) * i / k, N0));
  for (let i = 0; i < k; i++) ring.push(toLL(E1, N0 + (N1 - N0) * i / k));
  for (let i = 0; i < k; i++) ring.push(toLL(E1 - (E1 - E0) * i / k, N1));
  for (let i = 0; i < k; i++) ring.push(toLL(E0, N1 - (N1 - N0) * i / k));
  sq.setLatLngs(ring);
}
function updateReadout() {
  const { E0, N0, s } = corners();
  const c = toLL(E0 + s / 2, N0 + s / 2);
  $('hsm-coords').textContent = `E ${(E0 + s / 2).toFixed(0)}  N ${(N0 + s / 2).toFixed(0)}  ·  ${c[0].toFixed(5)}, ${c[1].toFixed(5)}`;
}
function setCentre(E, N, { pan = false, fromPin = false } = {}) {
  [E, N] = clampC(E, N);
  state.E = E; state.N = N;
  drawSquare(); updateReadout();
  if (!fromPin) pin.setLatLng(toLL(E, N));
  if (pan) map.panTo(toLL(E, N));
  markStale();
}
function setSize(s) {
  state.size = s;
  document.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.size === s)));
  drawSquare(); updateReadout(); markStale();
  map.fitBounds(sq.getBounds(), { padding: [40, 40], maxZoom: 17 });
}
function markStale() {
  if (state.model && !state.stale) { state.stale = true; status(['The square has moved. Press Build model again.', '範圍已移動，請再按「建立模型」。']); }
  $('hsm-dl').disabled = !state.model || state.stale || state.busy;
}

pin.on('drag', (ev) => { const [E, N] = toEN(ev.latlng.lat, ev.latlng.lng); setCentre(E, N, { fromPin: true }); });
pin.on('dragend', () => pin.setLatLng(toLL(state.E, state.N)));
let drag = null, moved = false;
sq.on('mousedown', (ev) => {
  L.DomEvent.stop(ev);
  const p = toEN(ev.latlng.lat, ev.latlng.lng);
  drag = { p, E: state.E, N: state.N }; moved = false; map.dragging.disable();
});
map.on('mousemove', (ev) => {
  if (!drag) return;
  const p = toEN(ev.latlng.lat, ev.latlng.lng);
  moved = true; setCentre(drag.E + p[0] - drag.p[0], drag.N + p[1] - drag.p[1]);
});
map.on('mouseup', () => { if (drag) { drag = null; map.dragging.enable(); } });
map.on('click', (ev) => {
  if (moved) { moved = false; return; }
  const [E, N] = toEN(ev.latlng.lat, ev.latlng.lng); setCentre(E, N);
});
document.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => setSize(+b.dataset.size)));
$('hsm-goto').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const nums = ($('hsm-q').value.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (nums.length < 2) return;
  let [a, b] = nums, E, N;
  if (a > 100000 && b > 100000) { E = a; N = b; }                       // HK1980 Grid E, N
  else if (Math.abs(a) < 90 && Math.abs(b) < 180) { [E, N] = toEN(a > 90 ? b : a, a > 90 ? a : b); } // lat, lon
  else return;
  setCentre(E, N, { pan: true });
});
drawSquare(); updateReadout();

// ---------- DTM tiles ----------
let dtmIndex = null;
const tileCache = new Map();
async function loadIndex() {
  if (!dtmIndex) { const r = await fetch(DTM_URL + 'index.json'); if (!r.ok) throw new Error('DTM index ' + r.status); dtmIndex = new Set((await r.json()).tiles); }
  return dtmIndex;
}
async function loadTile(key) {
  if (tileCache.has(key)) return tileCache.get(key);
  const p = (async () => {
    if (!dtmIndex.has(key)) return null;                   // all sea: not stored
    const r = await fetch(DTM_URL + key + '.bin');
    if (!r.ok) throw new Error('DTM tile ' + key + ' ' + r.status);
    const buf = await new Response(r.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    const flag = new Uint8Array(buf, 0, 1)[0], a = new Int16Array(buf.slice(1));
    const out = new Float32Array(TILE * TILE);
    for (let j = 0; j < TILE; j++) {
      let acc = 0;
      for (let i = 0; i < TILE; i++) {
        const k = j * TILE + i;
        acc = flag || i === 0 ? a[k] : acc + a[k];
        out[k] = acc === -32768 ? 0 : acc / 10;
      }
    }
    return out;
  })();
  tileCache.set(key, p);
  return p;
}
// Grid of DTM samples covering [xa, xb] x [ya, yb] (multiples of 5 m). Missing tiles = sea = 0 m.
async function loadDEM(xa, ya, xb, yb) {
  await loadIndex();
  const nx = Math.round((xb - xa) / CELL) + 1, ny = Math.round((yb - ya) / CELL) + 1;
  const z = new Float32Array(nx * ny);
  const keys = [];
  for (let ek = Math.floor(xa / 1000); ek * 1000 <= xb; ek++) for (let nk = Math.floor(ya / 1000); nk * 1000 <= yb; nk++) keys.push([ek, nk]);
  const tiles = await Promise.all(keys.map(([ek, nk]) => loadTile(`${ek}_${nk}`)));
  keys.forEach(([ek, nk], t) => {
    const tl = tiles[t]; if (!tl) return;
    const tx = ek * 1000, ty = nk * 1000;
    const i0 = Math.max(0, Math.round((tx - xa) / CELL)), i1 = Math.min(nx - 1, Math.round((tx + 1000 - xa) / CELL));
    const j0 = Math.max(0, Math.round((ty - ya) / CELL)), j1 = Math.min(ny - 1, Math.round((ty + 1000 - ya) / CELL));
    for (let j = j0; j <= j1; j++) {
      const tj = Math.round((ya + j * CELL - ty) / CELL);
      for (let i = i0; i <= i1; i++) z[j * nx + i] = tl[tj * TILE + Math.round((xa + i * CELL - tx) / CELL)];
    }
  });
  const h = (E, N) => {
    let fx = (E - xa) / CELL, fy = (N - ya) / CELL;
    fx = Math.min(nx - 1.0001, Math.max(0, fx)); fy = Math.min(ny - 1.0001, Math.max(0, fy));
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * nx + i;
    return (z[k] * (1 - u) + z[k + 1] * u) * (1 - v) + (z[k + nx] * (1 - u) + z[k + nx + 1] * u) * v;
  };
  return { xa, ya, nx, ny, z, h, tiles: keys.length };
}

// ---------- CSDI queries ----------
async function fetchJSON(url, tries = 2) {
  for (let t = 1; ; t++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'service error');
      return j;
    } catch (e) { if (t >= tries) throw e; }
    finally { clearTimeout(timer); }
  }
}
async function queryAll(base, E0, N0, E1, N1, fields, onPage) {
  const out = [], n = 2000;
  for (let off = 0; ; off += n) {
    const q = new URLSearchParams({
      where: '1=1', geometry: `${E0},${N0},${E1},${N1}`, geometryType: 'esriGeometryEnvelope', inSR: '2326',
      spatialRel: 'esriSpatialRelIntersects', outFields: fields, outSR: '2326', returnGeometry: 'true',
      orderByFields: 'OBJECTID', resultOffset: String(off), resultRecordCount: String(n), f: 'geojson',
    });
    const j = await fetchJSON(base + '?' + q);
    const fs = j.features || [];
    out.push(...fs); if (onPage) onPage(out.length);
    const more = (j.properties && j.properties.exceededTransferLimit) || j.exceededTransferLimit;
    if (!fs.length || (fs.length < n && !more)) break;
  }
  return out;
}

// ---------- geometry helpers ----------
function cleanRing(ring, E0, N0) {
  const pts = [];
  for (const [E, N] of ring) {
    const x = E - E0, y = N - N0, p = pts[pts.length - 1];
    if (!p || Math.hypot(p.x - x, p.y - y) > 0.01) pts.push(new THREE.Vector2(x, y));
  }
  if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 0.01) pts.pop();
  return pts.length >= 3 ? pts : null;
}
function centroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], c = p.x * q.y - q.x * p.y;
    a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-9) return pts[0];
  return new THREE.Vector2(cx / (3 * a), cy / (3 * a));
}
// Extruded prism in local Z-up metres (x east, y north from the SW corner), outward-facing CCW faces.
function prism(outer, holes, zb, zt) {
  if (THREE.ShapeUtils.isClockWise(outer)) outer = outer.slice().reverse();
  holes = holes.map((h) => (THREE.ShapeUtils.isClockWise(h) ? h : h.slice().reverse()));
  const all = outer.concat(...holes), n = all.length;
  const v = new Array(n * 6);
  all.forEach((p, i) => { v[i * 3] = p.x; v[i * 3 + 1] = p.y; v[i * 3 + 2] = zb; v[(n + i) * 3] = p.x; v[(n + i) * 3 + 1] = p.y; v[(n + i) * 3 + 2] = zt; });
  const f3 = [], f4 = [];
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) { f3.push(a + n, b + n, c + n, a, c, b); }
  let off = 0;
  for (const ring of [outer, ...holes]) {
    const m = ring.length;
    for (let k = 0; k < m; k++) { const p = off + k, q = off + (k + 1) % m; f4.push(p, q, q + n, p + n); }
    off += m;
  }
  return { v, f3, f4 };
}
// Liang-Barsky clip of segment to [0,s]^2
function clipSeg(x0, y0, x1, y1, s) {
  let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0], [dx, s - x0], [-dy, y0], [dy, s - y0]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

// ---------- build ----------
async function build() {
  if (state.busy) return;
  state.busy = true; state.files = null; $('hsm-build').disabled = true; $('hsm-dl').disabled = true;
  const t0 = performance.now(), tm = {};
  const { E0, N0, E1, N1, s } = corners();
  try {
    status(['Loading terrain, buildings and roads...', '正在載入地形、建築物及道路...']);
    let nb = 0;
    const roadsP = queryAll(RD_URL, E0, N0, E1, N1, 'OBJECTID,STREETTYPE,ENGLISHSTREETNAME,CHINESESTREETNAME,LASTUPDATEDATE').catch((e) => ({ error: e }));
    const bldP = queryAll(BLD_URL, E0, N0, E1, N1, 'OBJECTID,BuildingBlockType,BuildingID,BuildingCSUID,Status,BuildingNameEN,BuildingNameTC,BaseHeight,TopHeight,Storeys,DateStamp',
      (k) => { nb = k; status([`Loading buildings... ${k}`, `正在載入建築物... ${k}`]); });
    const demP = loadDEM(E0 - MARGIN, N0 - MARGIN, E1 + MARGIN, N1 + MARGIN).then((d) => { tm.terrain = performance.now() - t0; return d; });
    const [dem, feats, roads] = await Promise.all([demP, bldP.then((f) => { tm.buildings = performance.now() - t0; return f; }), roadsP]);
    tm.fetch = performance.now() - t0;
    status(['Building the model...', '正在建立模型...']);
    await new Promise((r) => setTimeout(r, 0));
    state.model = makeModel({ E0, N0, s, dem, feats, roads });
    state.model.timing = { fetch: tm.fetch, terrain: tm.terrain, buildings: tm.buildings, total: performance.now() - t0 };
    state.stale = false;
    showModel(state.model);
    const m = state.model.stats;
    status([`Model ready: ${m.blocks} blocks in ${(state.model.timing.total / 1000).toFixed(1)} s. Download the zip when ready.`,
      `模型完成：${m.blocks} 座建築體，用時 ${(state.model.timing.total / 1000).toFixed(1)} 秒。可下載壓縮檔。`], 'ok');
  } catch (e) {
    console.error(e);
    status([`Could not load the data (${e.message}). The government service may be busy: please try again in a minute.`,
      `未能載入資料（${e.message}）。政府數據服務可能繁忙，請稍後再試。`], 'err');
  } finally {
    state.busy = false; $('hsm-build').disabled = false; $('hsm-dl').disabled = !state.model || state.stale;
    renderStats();
  }
}

function makeModel({ E0, N0, s, dem, feats, roads }) {
  const h = (x, y) => dem.h(x + E0, y + N0);
  const objs = [], lines = [], est = [];
  // terrain: the DTM samples inside the square, one quad per 5 m cell
  const n = s / CELL + 1, tv = new Array(n * n * 3), tf = [];
  let tmin = Infinity, tmax = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, z = h(i * CELL, j * CELL);
    tv[k * 3] = i * CELL; tv[k * 3 + 1] = j * CELL; tv[k * 3 + 2] = z; tmin = Math.min(tmin, z); tmax = Math.max(tmax, z);
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const k = j * n + i; tf.push(k, k + 1, k + n + 1, k + n); }
  objs.push({ layer: 'TERRAIN', name: 'TERRAIN', v: tv, f3: [], f4: tf, smooth: true });

  // buildings: whole blocks whose footprint centroid lies inside the square
  const counts = { BLDG_TOWER: 0, BLDG_PODIUM: 0, BLDG_OTHER: 0 };
  let tallest = null, latest = 0;
  for (const f of feats) {
    const p = f.properties || {}, g = f.geometry; if (!g) continue;
    if (p.Status && p.Status !== 'Active') continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const layer = p.BuildingBlockType === 'Tower' ? 'BLDG_TOWER' : p.BuildingBlockType === 'Podium' ? 'BLDG_PODIUM' : 'BLDG_OTHER';
    polys.forEach((poly, pi) => {
      const outer = cleanRing(poly[0], E0, N0); if (!outer) return;
      const c = centroid(outer);
      if (c.x < 0 || c.y < 0 || c.x >= s || c.y >= s) return;
      const holes = poly.slice(1).map((r) => cleanRing(r, E0, N0)).filter(Boolean);
      let gmin = Infinity, gmax = -Infinity;
      for (const q of outer.concat([c])) { const z = h(q.x, q.y); gmin = Math.min(gmin, z); gmax = Math.max(gmax, z); }
      let zb = Number.isFinite(p.BaseHeight) ? p.BaseHeight : null, zt = Number.isFinite(p.TopHeight) ? p.TopHeight : null, flag = '';
      if (zb === null) { zb = gmin; flag = 'base'; }
      if (zt === null || zt <= zb) {
        const st = p.Storeys > 0 ? p.Storeys : 0;
        zt = zb + (st ? 3 * st : layer === 'BLDG_TOWER' ? 6 : layer === 'BLDG_PODIUM' ? 5 : 4);
        flag = flag ? 'base+top' : 'top'; if (st) flag += ' (storeys)';
      }
      if (zb <= gmax + 1 && zb > gmin) zb = gmin;           // ground block on a slope: run the walls down to the terrain
      const geo = prism(outer, holes, zb, zt);
      const id = String(p.BuildingID || p.OBJECTID) + (polys.length > 1 ? '_' + pi : '');
      const name = `${layer}_${id}${flag ? '_EST' : ''}`;
      objs.push({ layer, name, ...geo, top: zt, base: zb, est: !!flag, nameEN: p.BuildingNameEN, nameTC: p.BuildingNameTC });
      counts[layer]++;
      if (flag) est.push({ id, layer, flag, top: +zt.toFixed(1) });
      if (!tallest || zt > tallest.top) tallest = { top: zt, en: p.BuildingNameEN, tc: p.BuildingNameTC, id };
      if (p.DateStamp > latest) latest = p.DateStamp;
    });
  }

  // roads: centrelines clipped to the square, densified to 5 m, draped on the DTM; tunnels left out
  let roadLen = 0, roadLatest = 0, roadErr = null, tunnels = 0;
  const rv = [], rf = [];
  if (roads && roads.error) roadErr = roads.error.message || String(roads.error);
  else for (const f of roads || []) {
    const p = f.properties || {}, g = f.geometry; if (!g) continue;
    if (p.STREETTYPE === 'Tunnel') { tunnels++; continue; }
    if (p.LASTUPDATEDATE > roadLatest) roadLatest = p.LASTUPDATEDATE;
    const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    const w = ROAD_W[p.STREETTYPE] || 4;
    for (const part of parts) {
      let cur = null;
      const flush = () => { if (cur && cur.length >= 2) pushRoad(cur, w); cur = null; };
      for (let k = 0; k < part.length - 1; k++) {
        const c = clipSeg(part[k][0] - E0, part[k][1] - N0, part[k + 1][0] - E0, part[k + 1][1] - N0, s);
        if (!c) { flush(); continue; }
        const [ax, ay, bx, by] = c;
        if (cur && Math.hypot(cur[cur.length - 1][0] - ax, cur[cur.length - 1][1] - ay) > 0.01) flush();
        if (!cur) cur = [[ax, ay]];
        const L2 = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.ceil(L2 / CELL));
        for (let t = 1; t <= m; t++) cur.push([ax + (bx - ax) * t / m, ay + (by - ay) * t / m]);
        roadLen += L2;
      }
      flush();
    }
  }
  function pushRoad(pts, w) {
    const P = pts.map(([x, y]) => [x, y, h(x, y) + 0.3]);
    lines.push(P);
    const base = rv.length / 3;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const ox = -dy * w / 2, oy = dx * w / 2, [x, y] = P[i];
      const xr = Math.min(s, Math.max(0, x - ox)), yr = Math.min(s, Math.max(0, y - oy));
      const xl = Math.min(s, Math.max(0, x + ox)), yl = Math.min(s, Math.max(0, y + oy));
      rv.push(xr, yr, Math.max(P[i][2], h(xr, yr) + 0.3), xl, yl, Math.max(P[i][2], h(xl, yl) + 0.3));
    }
    for (let i = 0; i < P.length - 1; i++) { const r0 = base + 2 * i; rf.push(r0, r0 + 2, r0 + 3, r0 + 1); }
  }
  if (rf.length) objs.push({ layer: 'ROADS', name: 'ROADS', v: rv, f3: [], f4: rf });

  const blocks = counts.BLDG_TOWER + counts.BLDG_PODIUM + counts.BLDG_OTHER;
  return {
    E0, N0, s, objs, lines,
    stats: { blocks, counts, est, tallest, tmin, tmax, roadLen, roadErr, tunnels, roadCount: lines.length, latest, roadLatest, fetched: feats.length, demTiles: dem.tiles },
  };
}

// ---------- 3D preview ----------
let renderer = null, scene, camera, controls, modelGroup = null, edgeGroup = null, plinth = null, sun;
const mats = {};
function material(layer) {
  if (!mats[layer]) {
    mats[layer] = new THREE.MeshStandardMaterial({ color: LAYERS[layer].rgb, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    mats[layer].name = layer;
    if (layer === 'ROADS') { mats[layer].polygonOffset = true; mats[layer].polygonOffsetFactor = -2; mats[layer].polygonOffsetUnits = -2; }
  }
  return mats[layer];
}
function geometryOf(o) {
  const g = new THREE.BufferGeometry(), n = o.v.length / 3, pos = new Float32Array(o.v.length);
  for (let i = 0; i < n; i++) { pos[i * 3] = o.v[i * 3]; pos[i * 3 + 1] = o.v[i * 3 + 2]; pos[i * 3 + 2] = -o.v[i * 3 + 1]; } // Z-up -> Y-up
  const idx = [], va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const tri = (a, b, c) => {                               // drop zero-area triangles (no normal)
    va.fromArray(pos, a * 3); vb.fromArray(pos, b * 3).sub(va); vc.fromArray(pos, c * 3).sub(va);
    if (vb.cross(vc).lengthSq() > 1e-8) idx.push(a, b, c);
  };
  for (let k = 0; k < o.f3.length; k += 3) tri(o.f3[k], o.f3[k + 1], o.f3[k + 2]);
  for (let k = 0; k < o.f4.length; k += 4) { const a = o.f4[k], b = o.f4[k + 1], c = o.f4[k + 2], d = o.f4[k + 3]; tri(a, b, c); tri(a, c, d); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  let out = g;
  if (!o.smooth) { out = g.toNonIndexed(); g.dispose(); }
  out.computeVertexNormals();
  return out;
}
// The export scene: Y-up metres, origin at the SW corner of the square at 0 mPD; one node per block.
function sceneGroup(model) {
  const root = new THREE.Group(); root.name = 'HK_SITE_MODEL';
  const groups = {};
  for (const o of model.objs) {
    if (!groups[o.layer]) { groups[o.layer] = new THREE.Group(); groups[o.layer].name = o.layer; root.add(groups[o.layer]); }
    const mesh = new THREE.Mesh(geometryOf(o), material(o.layer));
    mesh.name = o.name; mesh.castShadow = o.layer.startsWith('BLDG'); mesh.receiveShadow = true;
    if (o.layer.startsWith('BLDG')) mesh.userData = { base_mPD: +o.base.toFixed(2), top_mPD: +o.top.toFixed(2), estimated: o.est };
    groups[o.layer].add(mesh);
  }
  return root;
}
function initView() {
  const box = $('hsm-view');
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch (e) { box.querySelector('.hsm-ph').textContent = T(['3D preview needs WebGL, which this browser has turned off. The download still works.', '此瀏覽器未啟用 WebGL，無法顯示立體預覽，但仍可下載。']); return false; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  box.appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xf5f2ec);
  camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI * 0.49; controls.screenSpacePanning = false;
  controls.addEventListener('change', render);
  scene.add(new THREE.HemisphereLight(0xfffdf8, 0xb9b0a0, 1.6));
  sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  new ResizeObserver(resize).observe(box);
  resize();
  return true;
}
function resize() {
  if (!renderer) return;
  const box = $('hsm-view'), w = box.clientWidth, hgt = box.clientHeight;
  renderer.setSize(w, hgt); camera.aspect = w / Math.max(1, hgt); camera.updateProjectionMatrix(); render();
}
function render() { if (renderer) renderer.render(scene, camera); }
function showModel(model) {
  if (!renderer && !initView()) return;
  $('hsm-view').classList.add('has-model');
  if (modelGroup) { scene.remove(modelGroup); modelGroup.traverse((o) => o.geometry && o.geometry.dispose()); }
  if (edgeGroup) { scene.remove(edgeGroup); edgeGroup.traverse((o) => o.geometry && o.geometry.dispose()); }
  modelGroup = sceneGroup(model); scene.add(modelGroup);
  edgeGroup = new THREE.Group();
  const lm = new THREE.LineBasicMaterial({ color: 0x8a8378, transparent: true, opacity: 0.55 });
  modelGroup.traverse((o) => { if (o.isMesh && o.parent.name.startsWith('BLDG')) edgeGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), lm)); });
  scene.add(edgeGroup);
  if (plinth) { scene.remove(plinth); plinth.geometry.dispose(); }
  plinth = makePlinth(model); scene.add(plinth);
  const s = model.s, zc = (model.stats.tmin + model.stats.tmax) / 2, top = Math.max(model.stats.tmax, model.stats.tallest ? model.stats.tallest.top : 0);
  const tgt = new THREE.Vector3(s / 2, zc, -s / 2);
  sun.position.set(s / 2 - s * 0.6, top + s * 0.9, -s / 2 + s * 0.8); sun.target.position.copy(tgt);
  const sc = sun.shadow.camera, r = s * 0.85; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = s * 4 + top; sc.updateProjectionMatrix();
  controls.target.copy(tgt);
  const zlo = model.stats.tmin - Math.max(6, s * 0.03), rad = 0.5 * Math.hypot(s, s, top - zlo);
  const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  tgt.y = (zlo + top) / 2; controls.target.copy(tgt);
  const dist = (rad / Math.sin(Math.min(vf, hf) / 2)) * 0.9;      // bounding sphere fit, a little tight since the box is not a sphere
  camera.position.copy(tgt).addScaledVector(new THREE.Vector3(0.42, 0.78, 1).normalize(), dist);
  camera.near = 1; camera.far = s * 20; camera.updateProjectionMatrix();
  controls.update(); render();
}
// Preview only (not exported): a skirt from the terrain edge down to a flat base, like a card site model.
function makePlinth(model) {
  const t = model.objs[0], n = model.s / CELL + 1, zb = model.stats.tmin - Math.max(6, model.s * 0.03);
  const edge = [];
  for (let i = 0; i < n; i++) edge.push(i);                          // south, west to east
  for (let j = 1; j < n; j++) edge.push(j * n + n - 1);              // east, south to north
  for (let i = n - 2; i >= 0; i--) edge.push((n - 1) * n + i);       // north, east to west
  for (let j = n - 2; j >= 0; j--) edge.push(j * n);                 // west, north to south
  const pos = [];
  for (let k = 0; k < edge.length - 1; k++) {
    const a = edge[k], b = edge[k + 1];
    const ax = t.v[a * 3], ay = t.v[a * 3 + 1], az = t.v[a * 3 + 2], bx = t.v[b * 3], by = t.v[b * 3 + 1], bz = t.v[b * 3 + 2];
    pos.push(ax, zb, -ay, bx, zb, -by, bx, bz, -by, ax, zb, -ay, bx, bz, -by, ax, az, -ay);
  }
  const s = model.s;
  pos.push(0, zb, 0, 0, zb, -s, s, zb, -s, 0, zb, 0, s, zb, -s, s, zb, 0);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xbdb5a6, roughness: 1, side: THREE.DoubleSide }));
  m.receiveShadow = true; return m;
}

// ---------- stats ----------
const fmt = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : (b / 1e3).toFixed(0) + ' KB');
function renderStats() {
  const el = $('hsm-stats'), m = state.model;
  if (!m) { el.hidden = true; return; }
  const st = m.stats, rows = [];
  const add = (en, zh, v) => rows.push(`<div><dt>${T([en, zh])}</dt><dd>${v}</dd></div>`);
  add('Blocks', '建築體', `${st.blocks} <small>(${T(['tower', '塔樓'])} ${st.counts.BLDG_TOWER} · ${T(['podium', '平台'])} ${st.counts.BLDG_PODIUM} · ${T(['other', '其他'])} ${st.counts.BLDG_OTHER})</small>`);
  if (st.tallest) {
    const nm = (isZh() ? st.tallest.tc || st.tallest.en : st.tallest.en || st.tallest.tc) || T(['unnamed block', '未命名建築體']);
    add('Tallest', '最高', `${st.tallest.top.toFixed(1)} mPD <small>${esc(nm)}</small>`);
  }
  add('Heights estimated', '估算高度', `${st.est.length}`);
  add('Terrain', '地形', `${st.tmin.toFixed(1)} to ${st.tmax.toFixed(1)} mPD`);
  add('Roads', '道路', st.roadErr ? T(['not available', '未能載入']) : `${(st.roadLen / 1000).toFixed(2)} km`);
  if (state.files) add('Zip', '壓縮檔', `${fmt(state.files.zip)} <small>DXF ${fmt(state.files.dxf)} · OBJ ${fmt(state.files.obj)} · GLB ${fmt(state.files.glb)}</small>`);
  el.innerHTML = rows.join(''); el.hidden = false;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- exporters ----------
const f3n = (x) => x.toFixed(3), f2n = (x) => x.toFixed(2);
function toDXF(model) {
  const { E0, N0 } = model, o = [];
  const p = (...kv) => { for (let i = 0; i < kv.length; i += 2) o.push(kv[i], kv[i + 1]); };
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSBASE', 10, '0.0', 20, '0.0', 30, '0.0',
    9, '$EXTMIN', 10, f3n(E0), 20, f3n(N0), 30, f2n(model.stats.tmin), 9, '$EXTMAX', 10, f3n(E0 + model.s), 20, f3n(N0 + model.s), 30, '1000.0', 0, 'ENDSEC');
  const layerNames = Object.keys(LAYERS);
  p(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, '0.0', 0, 'ENDTAB');
  p(0, 'TABLE', 2, 'LAYER', 70, layerNames.length);
  for (const ln of layerNames) p(0, 'LAYER', 2, ln, 70, 0, 62, LAYERS[ln].aci, 6, 'CONTINUOUS');
  p(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  const V = (ob, i) => [f3n(ob.v[i * 3] + E0), f3n(ob.v[i * 3 + 1] + N0), f2n(ob.v[i * 3 + 2])];
  for (const ob of model.objs) {
    if (ob.layer === 'ROADS') continue;                    // roads go out as 3D polylines below
    for (let k = 0; k < ob.f3.length; k += 3) {
      const a = V(ob, ob.f3[k]), b = V(ob, ob.f3[k + 1]), c = V(ob, ob.f3[k + 2]);
      p(0, '3DFACE', 8, ob.layer, 10, a[0], 20, a[1], 30, a[2], 11, b[0], 21, b[1], 31, b[2], 12, c[0], 22, c[1], 32, c[2], 13, c[0], 23, c[1], 33, c[2]);
    }
    for (let k = 0; k < ob.f4.length; k += 4) {
      const a = V(ob, ob.f4[k]), b = V(ob, ob.f4[k + 1]), c = V(ob, ob.f4[k + 2]), d = V(ob, ob.f4[k + 3]);
      p(0, '3DFACE', 8, ob.layer, 10, a[0], 20, a[1], 30, a[2], 11, b[0], 21, b[1], 31, b[2], 12, c[0], 22, c[1], 32, c[2], 13, d[0], 23, d[1], 33, d[2]);
    }
  }
  for (const line of model.lines) {
    p(0, 'POLYLINE', 8, 'ROADS', 66, 1, 10, '0.0', 20, '0.0', 30, '0.0', 70, 8);
    for (const [x, y, z] of line) p(0, 'VERTEX', 8, 'ROADS', 10, f3n(x + E0), 20, f3n(y + N0), 30, f2n(z), 70, 32);
    p(0, 'SEQEND', 8, 'ROADS');
  }
  const s = model.s;
  p(0, 'POLYLINE', 8, 'SITE_BOUNDARY', 66, 1, 10, '0.0', 20, '0.0', 30, '0.0', 70, 1);
  for (const [x, y] of [[0, 0], [s, 0], [s, s], [0, s]]) p(0, 'VERTEX', 8, 'SITE_BOUNDARY', 10, f3n(x + E0), 20, f3n(y + N0), 30, '0.0', 70, 0);
  p(0, 'SEQEND', 8, 'SITE_BOUNDARY');
  const notes = [ATTRIB, `HK1980 Grid (EPSG:2326), metres; Z = mPD. Square ${s} m, SW corner E ${E0} N ${N0}. Massing only.`,
    `Generated ${new Date().toISOString().slice(0, 10)} at anzonwong.com/lab/hk-site-model/`];
  notes.forEach((t, i) => p(0, 'TEXT', 8, 'NOTES', 10, f3n(E0), 20, f3n(N0 - 6 - i * 4), 30, '0.0', 40, '2.5', 1, t.replace(/[^\x20-\x7e]/g, ' ')));
  p(0, 'ENDSEC', 0, 'EOF');
  return o.join('\n') + '\n';
}
function toOBJ(model) {
  const out = ['# HK Site Model (massing only). Y-up, metres. Origin = SW corner of the square at 0 mPD; see origin.txt.',
    '# ' + ATTRIB, 'mtllib site.mtl'];
  let base = 1;
  for (const ob of model.objs) {
    out.push(`o ${ob.name}`, `g ${ob.layer}`, `usemtl ${ob.layer}`);
    const n = ob.v.length / 3;
    for (let i = 0; i < n; i++) out.push(`v ${f3n(ob.v[i * 3])} ${f3n(ob.v[i * 3 + 2])} ${f3n(-ob.v[i * 3 + 1])}`);
    for (let k = 0; k < ob.f3.length; k += 3) out.push(`f ${ob.f3[k] + base} ${ob.f3[k + 1] + base} ${ob.f3[k + 2] + base}`);
    for (let k = 0; k < ob.f4.length; k += 4) out.push(`f ${ob.f4[k] + base} ${ob.f4[k + 1] + base} ${ob.f4[k + 2] + base} ${ob.f4[k + 3] + base}`);
    base += n;
  }
  return out.join('\n') + '\n';
}
function toMTL() {
  return Object.entries(LAYERS).filter(([, v]) => v.rgb !== undefined).map(([k, v]) => {
    const c = new THREE.Color(v.rgb); return `newmtl ${k}\nKd ${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)}\nKa 0 0 0\nKs 0 0 0\nd 1\nillum 1\n`;
  }).join('\n');
}
function originTxt(model) {
  const { E0, N0, s } = model, sw = toLL(E0, N0), c = toLL(E0 + s / 2, N0 + s / 2);
  return [
    'HK Site Model: origin and coordinates', '',
    `Square size: ${s} m x ${s} m, aligned to the HK1980 Grid.`, '',
    'site.dxf : true HK1980 Grid coordinates (EPSG:2326), metres. X = Easting, Y = Northing, Z = mPD.',
    'site.obj, site.glb : local coordinates, metres, Y up. Local (0,0,0) = SW corner of the square at 0 mPD.',
    '  local X = Easting - origin Easting', '  local Y = height in mPD', '  local Z = -(Northing - origin Northing)   (north is -Z)', '',
    `Origin (SW corner)  HK1980 Grid  E ${E0.toFixed(3)}  N ${N0.toFixed(3)}`,
    `Origin (SW corner)  WGS84        lat ${sw[0].toFixed(7)}  lon ${sw[1].toFixed(7)}`,
    `Centre of square    HK1980 Grid  E ${(E0 + s / 2).toFixed(3)}  N ${(N0 + s / 2).toFixed(3)}`,
    `Centre of square    WGS84        lat ${c[0].toFixed(7)}  lon ${c[1].toFixed(7)}`,
    'Height datum: Hong Kong Principal Datum (mPD). 0 mPD is about 1.2 m below mean sea level.',
    'WGS84 values converted with proj4 (7-parameter HK1980 to WGS84 transformation); expect about 1 m.',
    '', 'Revit: use site.dxf with "Auto - Origin to Origin" in a project with shared coordinates set to HK1980,',
    'or acquire coordinates from it. SketchUp / Rhino / Blender: use site.glb or site.obj (local origin).', '',
  ].join('\r\n');
}
function readmeTxt(model) {
  const st = model.stats, d = (t) => (t ? new Date(t).toISOString().slice(0, 10) : 'n/a');
  const L1 = [
    'HK SITE MODEL  (anzonwong.com/lab/hk-site-model/)', '',
    'MASSING ONLY. NOT FOR SURVEY, STATUTORY, LEGAL OR DESIGN-CERTIFICATION USE.', '',
    'DATA SOURCE AND ATTRIBUTION', ATTRIB, '',
    'Datasets used:',
    '  - Building (LandsD), CSDI Portal service landsd_rcd_1637211194312_35158, fetched live ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC.',
    `    Latest block record date in this square: ${d(st.latest)}. LandsD updates the dataset monthly.`,
    '  - Road Centreline (LandsD), CSDI Portal service landsd_rcd_1637310758814_80061' + (st.roadErr ? ' (NOT INCLUDED: the service did not answer).' : `, latest record ${d(st.roadLatest)}.`),
    '  - Digital Terrain Model 5 m grid (LandsD), DATA.GOV.HK, downloaded and tiled 18 Oct 2026.', '',
    'CONTENTS',
    '  site.dxf    AutoCAD R12 DXF, HK1980 Grid, Z in mPD. Layers TERRAIN, BLDG_TOWER, BLDG_PODIUM, BLDG_OTHER (3DFACE),',
    '              ROADS (3D polylines on the centreline), SITE_BOUNDARY, NOTES (attribution text).',
    '  site.obj    Wavefront OBJ + site.mtl, local origin, Y up, one object per block, grouped by layer.',
    '  site.glb    glTF 2.0 binary, local origin, Y up, nodes grouped by layer; block heights in node extras.',
    '  origin.txt  Origin in HK1980 Grid and WGS84, and how the axes map.', '',
    'WHAT IS IN THE MODEL',
    `  Square ${model.s} m, SW corner HK1980 E ${model.E0} N ${model.N0}.`,
    `  ${st.blocks} building blocks (Tower ${st.counts.BLDG_TOWER}, Podium ${st.counts.BLDG_PODIUM}, Other ${st.counts.BLDG_OTHER}).`,
    st.tallest ? `  Tallest block top: ${st.tallest.top.toFixed(1)} mPD${st.tallest.en ? ' (' + st.tallest.en + ')' : ''}.` : '  No blocks.',
    `  Terrain inside the square: ${st.tmin.toFixed(1)} to ${st.tmax.toFixed(1)} mPD.`,
    `  Roads: ${st.roadCount} draped centreline runs, ${(st.roadLen / 1000).toFixed(2)} km; ${st.tunnels} tunnel segments left out.`, '',
    'HOW IT WAS MADE',
    '  - Each block is a prism from BaseHeight to TopHeight (mPD) on its LandsD footprint. Block types: Tower, Podium;',
    '    Open-sided and Temporary structures go on BLDG_OTHER.',
    '  - Whole blocks are kept when the footprint centroid is inside the square, so some blocks overhang the edge.',
    '  - A block whose base sits on sloping ground has its walls run down to the lowest terrain under it.',
    '  - Terrain is the 5 m DTM sampled at its own grid points inside the square (one quad per 5 m cell).',
    '  - Roads are the LandsD centrelines draped 0.3 m above the DTM. In OBJ/GLB they are strips of indicative',
    '    width (Highway 12 m, Main 9 m, Secondary 6 m, Restricted 4 m, Track 2.5 m), not kerb lines.', '',
    `ESTIMATED HEIGHTS (${st.est.length} blocks; their names end in _EST)`,
    '  Where LandsD gives no BaseHeight, the base is the lowest terrain under the block. Where it gives no TopHeight,',
    '  the top is base + 3 m per storey if Storeys is known, otherwise base + 6 m (tower), 5 m (podium) or 4 m (other).',
    ...st.est.slice(0, 400).map((e) => `  ${e.layer}  id ${e.id}  top ${e.top} mPD  estimated: ${e.flag}`),
    st.est.length > 400 ? `  ... and ${st.est.length - 400} more` : '', '',
    'ACCURACY AND LIMITS',
    '  - The DTM is accurate to about +/- 5 m. LandsD notes that it includes some non-ground features (elevated roads,',
    '    flyovers, bridges) and vegetation canopy height, so expect bumps under flyovers and over wooded slopes.',
    '  - Sea and areas without DTM data are at 0 mPD.',
    '  - Block heights are as recorded by LandsD; roof features, parapets, setbacks above the recorded top and',
    '    basements are not modelled. No kerbs, pavements, walls, slopes, trees or water bodies in this version.',
    '  - Massing only. Check against a measured survey and the lot boundaries before relying on any dimension.', '',
    'Made by Anzon Wong (AW Design) as a free hobby tool. Not professional advice.', '',
  ];
  return L1.join('\r\n');
}

async function download() {
  const m = state.model; if (!m || state.busy) return;
  state.busy = true; $('hsm-dl').disabled = true; $('hsm-build').disabled = true;
  const t0 = performance.now();
  try {
    status(['Writing DXF, OBJ and GLB...', '正在製作 DXF、OBJ 及 GLB...']);
    await new Promise((r) => setTimeout(r, 30));
    const dxf = toDXF(m), obj = toOBJ(m), mtl = toMTL();
    const glb = await new GLTFExporter().parseAsync(sceneGroup(m), { binary: true });
    const zip = new JSZip(), tag = `hk-site-model_E${m.E0 + m.s / 2}_N${m.N0 + m.s / 2}_${m.s}m`;
    const dir = zip.folder(tag);
    dir.file('site.dxf', dxf); dir.file('site.obj', obj); dir.file('site.mtl', mtl); dir.file('site.glb', glb);
    dir.file('origin.txt', originTxt(m)); dir.file('README.txt', readmeTxt(m));
    status(['Compressing...', '正在壓縮...']);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    state.files = { zip: blob.size, dxf: dxf.length, obj: obj.length, glb: glb.byteLength, ms: performance.now() - t0 };
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = tag + '.zip';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    status([`Downloaded ${tag}.zip (${fmt(blob.size)}).`, `已下載 ${tag}.zip（${fmt(blob.size)}）。`], 'ok');
  } catch (e) {
    console.error(e); status([`Could not write the files (${e.message}).`, `未能製作檔案（${e.message}）。`], 'err');
  } finally {
    state.busy = false; $('hsm-dl').disabled = false; $('hsm-build').disabled = false; renderStats();
  }
}

$('hsm-build').addEventListener('click', build);
$('hsm-dl').addEventListener('click', download);
status(['Click the map to place the square, or drag it. Then press Build model.', '在地圖上點選以放置範圍，或拖動範圍，然後按「建立模型」。']);
setSize(state.size);
state.stale = false;
// test hook (read-only use by the QA script)
window.hsm = { state, setCentre, setSize, build, download };
