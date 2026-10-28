// HK Site Analysis (anzonwong.com Lab). Plain ES module, no bundler.
// v3 (26 Oct 2026): twelve diagrams (+ sunlight hours, walking catchment, sky view factor map: analyses.js / diagrams3.js),
// colour presets and a round frame (board.js), a 3D view with exploded layer plates (view3d.js, three.js, loaded on demand),
// DXF and SVG of the 2D layers in HK1980 Grid (cad.js, loaded on demand).
// v2: a diagram series board (board.js): nine small diagrams of the same site at the same frame, drawn in the browser
// from HKSAR Government open data (LandsD, TD, AFCD, LCSD, PlanD) plus OpenStreetMap for MTR exits:
// figure-ground, heights, topography, 21 Dec sun and shadows, PlanD wind, access, road-noise proxy, green, views.
// Data: LandsD Building + Road Centreline live from the CSDI Portal (CORS open, as in HK Site Model);
// terrain = the HK Site Model's 1 km tiles of the LandsD 5 m DTM (../hk-site-model/dtm/);
// address search = Address Lookup Service (ALS, www.als.gov.hk, CORS open).
// Sun: NOAA equations, ported from the course site-analysis tool (make_site_sheets.py sun_position);
// shadow vector = opposite the sun's bearing (the 6 Oct 2026 north_deg sign fix carried over: no rotation here,
// the plan is drawn grid-north up and true bearings are turned to grid bearings by the measured convergence).

const L = window.L, proj4 = window.proj4;
proj4.defs('EPSG:2326', '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243649,-1.158827,-1.094246 +units=m +no_defs');
const toEN = (lat, lon) => proj4('EPSG:4326', 'EPSG:2326', [lon, lat]);
const toLL = (E, N) => { const p = proj4('EPSG:2326', 'EPSG:4326', [E, N]); return [p[1], p[0]]; };

const CSDI = 'https://portal.csdi.gov.hk/server/rest/services/common/';
const BLD_URL = CSDI + 'landsd_rcd_1637211194312_35158/FeatureServer/0/query';
const RD_URL = CSDI + 'landsd_rcd_1637310758814_80061/FeatureServer/0/query';
const DTM_URL = new URL('../hk-site-model/dtm/', import.meta.url).href;
const ALS_URL = 'https://www.als.gov.hk/lookup';
const PED_URL = CSDI + 'landsd_rcd_1637222018065_52265/FeatureServer/0/query';      // LandsD 3D Pedestrian Network
const BUS_URL = CSDI + 'td_rcd_1638874475129_49745/FeatureServer/0/query';          // TD bus stops
const HAB_URL = CSDI + 'afcd_rcd_1639382960762_55768/FeatureServer/';               // AFCD terrestrial habitat map
const PARK_URL = CSDI + 'lcsd_rcd_1629267205215_19292/FeatureServer/0/query';       // LCSD parks
const WIND_URL = CSDI + 'pland_rcd_1634281652589_43389/FeatureServer/0/query';      // PlanD site wind availability data
const HAB = [[19, 'wood'], [20, 'shrub'], [14, 'wood'], [17, 'shrub'], [16, 'grass'], [4, 'grass'], [5, 'urban'], [0, 'agri']];
const PED_KIND = (t) => ([30, 31, 32, 33].includes(t) ? 'cross' : [2, 4].includes(t) ? 'link' : [8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21].includes(t) ? 'vert' : 'path');
const CELL = 5, TILE = 201;
const BOUNDS = { E: [801000, 862500], N: [801000, 847000] };
const FRAMES = [200, 250, 300, 400, 500, 600, 800, 1000, 1200];   // square frame side (m), the same for every diagram
const HOURS = [9, 12, 15], YEAR = 2026, MONTH = 12, DAY = 21, TZ = 8;
const SUN_BUF = 500, TERRAIN_BUF = 1500;                       // how far (m) to look for buildings / hills that can shade the frame
const HILL_NEAR = 60, HILL_TOL = 2;                            // hill shadow: terrain at least 60 m away, 2 m above the ray (the DTM carries
                                                               // tree canopy and flyovers; nearer bumps are not hills)
const FONT = "Arial, 'Helvetica Neue', Helvetica, 'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', sans-serif";
const INK = '#1d1a16', INK2 = '#4a443b', MUTED = '#6f6a60', RULE = '#c9c1b3', PAPER = '#ffffff', ACCENT = '#9c4a2f', SITE_RED = '#d0021b';
const SHADE = { 9: '#2f6f9f', 12: '#7a5aa6', 15: '#c47a1c' };
const SHADE_OP = 0.34;
const HCLASS = [
  { max: 10, c: '#f2eee6', en: 'under 10 m', zh: '10 米以下' },
  { max: 30, c: '#e2d8c6', en: '10 to 30 m', zh: '10 至 30 米' },
  { max: 60, c: '#cbb99c', en: '30 to 60 m', zh: '30 至 60 米' },
  { max: 100, c: '#a99176', en: '60 to 100 m', zh: '60 至 100 米' },
  { max: 150, c: '#7f6a55', en: '100 to 150 m', zh: '100 至 150 米' },
  { max: Infinity, c: '#4f3e31', en: '150 m and over', zh: '150 米或以上' },
];
const ROAD = {
  'Highway': { w: 12, c: '#eeb48a', en: 'Highway', zh: '快速公路', rank: 1 },
  'Main Road': { w: 9, c: '#f4d2ac', en: 'Main road', zh: '主要道路', rank: 2 },
  'Secondary Road': { w: 6, c: '#f8e8d2', en: 'Secondary road', zh: '次要道路', rank: 3 },
  'Restricted Road': { w: 4, c: '#ffffff', en: 'Restricted road', zh: '限制道路', rank: 4 },
  'Track': { w: 2.5, c: '#ffffff', en: 'Track', zh: '小徑', rank: 5, dash: true },
  'Tunnel': { w: 0, c: '#8a8378', en: 'Tunnel (not drawn)', zh: '隧道（不繪出）', rank: 9 },
};
const ATTRIB_EN = 'Data: Lands Department, The Government of the Hong Kong SAR: Building and Road Centreline (CSDI Portal, live), 5 m Digital Terrain Model (DATA.GOV.HK). Intellectual property rights in the data belong to the Government of the HKSAR. Address search: Address Lookup Service (ALS), HKSAR Government. Sun positions: NOAA solar equations.';
const ATTRIB_ZH = '資料：香港特別行政區政府地政總署：建築物及道路中線（空間數據共享平台，即時載入）、5 米數碼地形模型（資料一線通）。資料的知識產權屬香港特別行政區政府所有。地址搜尋：香港特別行政區政府地址查詢服務（ALS）。太陽位置：NOAA 太陽位置方程式。';
const DISC_EN = 'Hobby project, not official, for reference only. Not a substitute for a survey or professional advice.';
const DISC_ZH = '個人興趣項目，並非官方資料，只供參考，不能取代測量或專業意見。';

// ---------- language ----------
const isZh = () => document.documentElement.getAttribute('data-lang') === 'zh';
const T = (m) => (Array.isArray(m) ? (isZh() ? m[1] : m[0]) : m);
const $ = (id) => document.getElementById(id);
let lastStatus = null, lastStatusKind = '';
function status(msg, kind = '') {
  lastStatus = msg; lastStatusKind = kind;
  const el = $('hsa-status'); el.textContent = T(msg); el.dataset.kind = kind;
}
document.addEventListener('awlang', () => {
  if (lastStatus) status(lastStatus, lastStatusKind);
  setLabels(); renderStats(); styleLabels();
  if (state.result) { drawSheet(); }
});

// ---------- state ----------
const state = {
  mode: 'circle', E: 835380, N: 819560, r: 50, poly: null, draft: [], scale: 'auto', name: '', address: null,
  result: null, busy: false, stale: false, files: null,
  style: 'paper', shape: 'square',                 // v3 board look: colour preset and frame shape (board.STYLES)
};
const r1 = (x) => Math.round(x * 10) / 10;
function circleRing(E, N, r, n = 72) { const a = []; for (let i = 0; i < n; i++) { const t = (i / n) * 2 * Math.PI; a.push([E + r * Math.sin(t), N + r * Math.cos(t)]); } return a; }
function siteRing() { return state.mode === 'draw' ? state.poly : circleRing(state.E, state.N, state.r); }
function ringBox(R) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of R) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; }
function area(R) { let s = 0; for (let i = 0, n = R.length; i < n; i++) { const p = R[i], q = R[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; }
function centroid(R) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = R.length; i < n; i++) { const p = R[i], q = R[(i + 1) % n], c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
  if (Math.abs(a) < 1e-9) return R[0].slice();
  return [cx / (3 * a), cy / (3 * a)];
}
function inPoly(x, y, R) {
  let c = false;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
    const [xi, yi] = R[i], [xj, yj] = R[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function ringDist(px, py, R) { let d = Infinity; for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; d = Math.min(d, segDist(px, py, a[0], a[1], b[0], b[1])); } return d; }
function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function polyDist(R1, R2) {          // 0 if they overlap
  if (inPoly(R1[0][0], R1[0][1], R2) || inPoly(R2[0][0], R2[0][1], R1)) return 0;
  let d = Infinity;
  for (const p of R1) d = Math.min(d, ringDist(p[0], p[1], R2));
  for (const p of R2) d = Math.min(d, ringDist(p[0], p[1], R1));
  return d;
}
const COMPASS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], COMPASS_ZH = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
const compass = (b) => { const k = Math.round((((b % 360) + 360) % 360) / 45) % 8; return isZh() ? COMPASS_ZH[k] : COMPASS_EN[k]; };
const bearing = (dx, dy) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;

// ---------- scale and frame ----------
function siteSpan(R) { const b = ringBox(R); return Math.max(b[2] - b[0], b[3] - b[1]); }
function autoScale(R) { const need = Math.max(260, siteSpan(R) * 3.2); return FRAMES.find((F) => F >= need) || FRAMES[FRAMES.length - 1]; }
function fitsScale(R, F) { return F >= siteSpan(R) + 40; }
function frameOf(R, F) {                          // square frame of side F metres round the site
  const b = ringBox(R), cE = (b[0] + b[2]) / 2, cN = (b[1] + b[3]) / 2;
  return { cE, cN, s: F, E0: cE - F / 2, E1: cE + F / 2, N0: cN - F / 2, N1: cN + F / 2, k: 100 / F };
}
function currentScale(R) {                        // the frame side in metres (kept under its v1 name)
  if (state.scale === 'auto') return autoScale(R);
  const F = +state.scale; return fitsScale(R, F) ? F : autoScale(R);
}

// ---------- map ----------
const map = L.map('hsa-map', { minZoom: 10, maxZoom: 19, maxBounds: [[22.08, 113.75], [22.62, 114.5]], zoomSnap: 0.5, doubleClickZoom: false })
  .setView(toLL(state.E, state.N), 17);
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
const frameLayer = L.polygon([[0, 0]], { color: '#1d1a16', weight: 1, dashArray: '5 5', fill: false, interactive: false }).addTo(map);
const siteLayer = L.polygon([[0, 0]], { color: SITE_RED, weight: 2.5, fillColor: SITE_RED, fillOpacity: 0.10, className: 'hsa-site' }).addTo(map);
const draftLayer = L.polyline([], { color: SITE_RED, weight: 2, dashArray: '6 4' }).addTo(map);
const pin = L.marker(toLL(state.E, state.N), {
  draggable: true, keyboard: true, title: 'Drag to move the site',
  icon: L.divIcon({ className: 'hsa-pin', iconSize: [20, 20], iconAnchor: [10, 10] }),
}).addTo(map);
function rectLL(E0, N0, E1, N1, k = 8) {
  const out = [];
  for (let i = 0; i < k; i++) out.push(toLL(E0 + ((E1 - E0) * i) / k, N0));
  for (let i = 0; i < k; i++) out.push(toLL(E1, N0 + ((N1 - N0) * i) / k));
  for (let i = 0; i < k; i++) out.push(toLL(E1 - ((E1 - E0) * i) / k, N1));
  for (let i = 0; i < k; i++) out.push(toLL(E0, N1 - ((N1 - N0) * i) / k));
  return out;
}
function drawSite() {
  const R = siteRing();
  draftLayer.setLatLngs(state.mode === 'draw' && !state.poly ? state.draft.map(([E, N]) => toLL(E, N)) : []);
  if (!R || R.length < 3) { siteLayer.setLatLngs([[0, 0]]); frameLayer.setLatLngs([[0, 0]]); updateReadout(); return; }
  siteLayer.setLatLngs(R.map(([E, N]) => toLL(E, N)));
  const f = frameOf(R, currentScale(R));
  frameLayer.setLatLngs(rectLL(f.E0, f.N0, f.E1, f.N1));
  const c = centroid(R); pin.setLatLng(toLL(c[0], c[1]));
  updateReadout();
}
function updateReadout() {
  const R = siteRing();
  if (!R || R.length < 3) { $('hsa-coords').textContent = T(['Click the map to add corners, then press Finish.', '在地圖上點選以加入角點，然後按「完成」。']); return; }
  const c = centroid(R), ll = toLL(c[0], c[1]), s = currentScale(R);
  const a = Math.abs(area(R));
  $('hsa-coords').textContent = `E ${c[0].toFixed(0)}  N ${c[1].toFixed(0)}  ·  ${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}  ·  ${fmtArea(a)}  ·  ${T([`frame ${s} m`, `範圍 ${s} 米`])}`;
}
const fmtArea = (a) => (a >= 10000 ? T([`${(a / 10000).toFixed(2)} ha`, `${(a / 10000).toFixed(2)} 公頃`]) : T([`${Math.round(a).toLocaleString('en-GB')} m²`, `${Math.round(a).toLocaleString('en-GB')} 平方米`]));
function markStale() {
  if (state.result && !state.stale) { state.stale = true; status(['The site has changed. Press Analyse site again.', '地盤已更改，請再按「分析地盤」。']); }
  if (view3) { view3.dispose(); view3 = null; if ($('hsa-3d')) $('hsa-3d').hidden = true; }   // QA r2: the old site stayed in 3D after a move
  syncButtons();
}
function syncButtons() {
  const R = siteRing(), ok = R && R.length >= 3;
  $('hsa-run').disabled = state.busy || !ok;
  for (const id of ['hsa-pdf', 'hsa-pdf2', 'hsa-png', 'hsa-zip', 'hsa-explode', 'hsa-dxf', 'hsa-svg']) if ($(id)) $(id).disabled = !state.result || state.stale || state.busy;
  document.querySelectorAll('[data-v3]').forEach((b) => { b.disabled = !state.result || state.stale || state.busy; b.title = b.disabled ? T(['Press Analyse site first', '請先按「分析地盤」']) : ''; });
  document.querySelectorAll('[data-r]').forEach((b) => b.setAttribute('aria-pressed', String(state.mode === 'circle' && +b.dataset.r === state.r)));
  $('hsa-draw').setAttribute('aria-pressed', String(state.mode === 'draw'));
  $('hsa-finish').hidden = !(state.mode === 'draw' && !state.poly);
  $('hsa-finish').disabled = state.draft.length < 3;
  $('hsa-clear').hidden = state.mode !== 'draw';
}
function setCentre(E, N, { pan = false } = {}) {
  E = Math.min(BOUNDS.E[1], Math.max(BOUNDS.E[0], E)); N = Math.min(BOUNDS.N[1], Math.max(BOUNDS.N[0], N));
  state.E = E; state.N = N;                      // the circle centre always follows, so a later radius button stays here
  if (state.mode === 'draw' && state.poly) {
    const c = centroid(state.poly); state.poly = state.poly.map(([x, y]) => [x + E - c[0], y + N - c[1]]);
  } else { state.mode = 'circle'; state.poly = null; state.draft = []; }
  drawSite(); syncButtons(); markStale();
  if (pan) map.setView(toLL(E, N), Math.max(map.getZoom(), 17));
}
function setRadius(r) { state.mode = 'circle'; state.poly = null; state.draft = []; state.r = r; drawSite(); syncButtons(); markStale(); fitFrame(); }
function setPolygon(pts) { state.mode = 'draw'; state.poly = pts; state.draft = []; drawSite(); syncButtons(); markStale(); fitFrame(); }
function fitFrame() { const b = frameLayer.getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [20, 20], maxZoom: 18 }); }

pin.on('drag', (ev) => {
  const [E, N] = toEN(ev.latlng.lat, ev.latlng.lng);
  state.E = E; state.N = N;
  if (state.mode === 'draw' && state.poly) { const c = centroid(state.poly); state.poly = state.poly.map(([x, y]) => [x + E - c[0], y + N - c[1]]); }
  const R = siteRing(); if (R && R.length >= 3) { siteLayer.setLatLngs(R.map(([e, n]) => toLL(e, n))); const f = frameOf(R, currentScale(R)); frameLayer.setLatLngs(rectLL(f.E0, f.N0, f.E1, f.N1)); }
  updateReadout(); markStale();
});
pin.on('dragend', drawSite);
map.on('click', (ev) => {
  const [E, N] = toEN(ev.latlng.lat, ev.latlng.lng);
  if (state.mode === 'draw' && !state.poly) {
    if (state.draft.length >= 3) {               // click near the first corner closes the shape
      const p0 = map.latLngToContainerPoint(toLL(...state.draft[0]));
      if (p0.distanceTo(ev.containerPoint) < 12) { finishDraw(); return; }
    }
    state.draft.push([E, N]); drawSite(); syncButtons(); return;
  }
  setCentre(E, N);
});
function finishDraw() {
  if (state.draft.length < 3) return;
  let P = state.draft.slice();
  if (area(P) < 0) P.reverse();
  const a = Math.abs(area(P)), span = siteSpan(P);
  if (a < 20) { status(['That shape is too small. Add corners further apart.', '範圍太小，請把角點放得更遠。'], 'err'); return; }
  if (span > 1200) { status(['That shape is over 1.2 km across. Draw a smaller site.', '範圍超過 1.2 公里，請繪畫較小的地盤。'], 'err'); return; }
  state.poly = P; state.draft = []; drawSite(); syncButtons(); markStale(); fitFrame();
  status(['Boundary drawn. Press Analyse site.', '已繪畫地盤界線。請按「分析地盤」。']);
}
document.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => setRadius(+b.dataset.r)));
$('hsa-draw').addEventListener('click', () => {
  state.mode = 'draw'; state.poly = null; state.draft = []; drawSite(); syncButtons(); markStale();
  status(['Click the map to add the corners of your site. Click the first corner again, or press Finish, to close it.', '在地圖上逐一點選地盤角點。再點第一個角點或按「完成」即可閉合。']);
});
$('hsa-finish').addEventListener('click', finishDraw);
$('hsa-clear').addEventListener('click', () => { state.poly = null; state.draft = []; drawSite(); syncButtons(); markStale(); });
$('hsa-scale').addEventListener('change', (e) => { state.scale = e.target.value; drawSite(); markStale(); fitFrame(); });
$('hsa-name').addEventListener('input', (e) => { state.name = e.target.value.trim(); if (state.result && !state.stale) drawSheet(); });

// ---------- search (ALS) ----------
const titleCase = (s) => (s ? s.toLowerCase().replace(/(^|[\s\-(/'])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : s);
function alsLabel(a) {
  const e = a.EngPremisesAddress, c = a.ChiPremisesAddress;
  let en = '', zh = '';
  if (e) {
    const st = e.EngStreet || {}, num = [st.BuildingNoFrom, st.BuildingNoTo].filter(Boolean).join('-');
    en = [e.BuildingName, e.EngEstate && e.EngEstate.EstateName, [num, st.StreetName].filter(Boolean).join(' '), st.LocationName || (e.EngVillage && e.EngVillage.VillageName), e.EngDistrict && e.EngDistrict.DcDistrict]
      .filter(Boolean).map(titleCase).join(', ');
  }
  if (c) {
    const st = c.ChiStreet || {}, num = [st.BuildingNoFrom, st.BuildingNoTo].filter(Boolean).join('-');
    zh = [c.ChiDistrict && c.ChiDistrict.DcDistrict, st.LocationName || (c.ChiVillage && c.ChiVillage.VillageName), (st.StreetName || '') + (num ? num + '號' : ''), c.ChiEstate && c.ChiEstate.EstateName, c.BuildingName]
      .filter(Boolean).join(' ');
  }
  const name = e ? titleCase(e.BuildingName || (e.EngEstate && e.EngEstate.EstateName) || '') : '';
  const nameZh = c ? c.BuildingName || (c.ChiEstate && c.ChiEstate.EstateName) || '' : '';
  return { en: en || zh, zh: zh || en, name, nameZh };
}
async function search(q) {
  const nums = (q.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (nums.length === 2 && /^[\s\d.,\-NEne]+$/.test(q)) {             // coordinates: lat, lon or HK1980 E, N
    let [a, b] = nums, E, N;
    if (a > 100000 && b > 100000) { E = a; N = b; } else if (Math.abs(a) < 90 && Math.abs(b) < 180) { [E, N] = toEN(a, b); } else return;
    state.address = null; setCentre(E, N, { pan: true }); return;
  }
  const list = $('hsa-results'); list.innerHTML = ''; list.hidden = true;
  status(['Searching addresses...', '正在搜尋地址...']);
  try {
    const r = await fetch(`${ALS_URL}?q=${encodeURIComponent(q)}&n=8`, { headers: { Accept: 'application/json', 'Accept-Language': isZh() ? 'zh-Hant' : 'en' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), hits = (j.SuggestedAddress || []).map((s) => {
      const a = s.Address.PremisesAddress, g = (a.GeospatialInformation || [])[0] || a.GeospatialInformation || {};
      return { ...alsLabel(a), E: +g.Easting, N: +g.Northing };
    }).filter((h) => h.E && h.N);
    if (!hits.length) { status(['No address found. Try a building name, a street and number, or click the map.', '找不到地址。請輸入大廈名稱、街道及門牌，或直接在地圖上點選。'], 'err'); return; }
    hits.forEach((h, i) => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = isZh() ? h.zh : h.en; b.dataset.i = i;
      b.addEventListener('click', () => pick(h));
      li.appendChild(b); list.appendChild(li);
    });
    list.hidden = false;
    status([`${hits.length} addresses found. Pick one.`, `找到 ${hits.length} 個地址，請選擇。`]);
  } catch (e) {
    console.warn(e);
    status(['The address search did not answer. Click the map instead, or try again.', '地址搜尋未有回應。請直接在地圖上點選，或稍後再試。'], 'err');
  }
}
function pick(h) {
  $('hsa-results').hidden = true;
  state.address = h;
  const nm = isZh() ? h.nameZh || h.name : h.name || h.nameZh;
  if (!$('hsa-name').value) { $('hsa-name').value = nm || ''; state.name = nm || ''; }
  setCentre(h.E, h.N, { pan: true });
  status(['Address placed. Set the site size or draw the boundary, then press Analyse site.', '已放置地址。請設定地盤大小或繪畫界線，然後按「分析地盤」。']);
}
$('hsa-search').addEventListener('submit', (ev) => { ev.preventDefault(); const q = $('hsa-q').value.trim(); if (q) search(q); });

// ---------- DTM tiles (same format as HK Site Model) ----------
let dtmIndex = null;
const tileCache = new Map();
async function loadIndex() {
  if (!dtmIndex) { const r = await fetch(DTM_URL + 'index.json'); if (!r.ok) throw new Error('DTM index ' + r.status); dtmIndex = new Set((await r.json()).tiles); }
  return dtmIndex;
}
async function loadTile(key) {
  if (tileCache.has(key)) return tileCache.get(key);
  const p = (async () => {
    if (!dtmIndex.has(key)) return null;
    const r = await fetch(DTM_URL + key + '.bin');
    if (!r.ok) throw new Error('DTM tile ' + key + ' ' + r.status);
    const buf = await new Response(r.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    const flag = new Uint8Array(buf, 0, 1)[0], a = new Int16Array(buf.slice(1));
    const out = new Float32Array(TILE * TILE);
    for (let j = 0; j < TILE; j++) {
      let acc = 0;
      for (let i = 0; i < TILE; i++) { const k = j * TILE + i; acc = flag || i === 0 ? a[k] : acc + a[k]; out[k] = acc === -32768 ? 0 : acc / 10; }
    }
    return out;
  })();
  tileCache.set(key, p);
  return p;
}
async function loadDEM(xa, ya, xb, yb) {
  xa = Math.floor(xa / CELL) * CELL; ya = Math.floor(ya / CELL) * CELL; xb = Math.ceil(xb / CELL) * CELL; yb = Math.ceil(yb / CELL) * CELL;
  await loadIndex();
  const nx = Math.round((xb - xa) / CELL) + 1, ny = Math.round((yb - ya) / CELL) + 1;
  const z = new Float32Array(nx * ny), keys = [];
  for (let ek = Math.floor(xa / 1000); ek * 1000 <= xb; ek++) for (let nk = Math.floor(ya / 1000); nk * 1000 <= yb; nk++) keys.push([ek, nk]);
  const tiles = await Promise.all(keys.map(([ek, nk]) => loadTile(`${ek}_${nk}`)));
  keys.forEach(([ek, nk], t) => {
    const tl = tiles[t]; if (!tl) return;
    const tx = ek * 1000, ty = nk * 1000;
    const i0 = Math.max(0, Math.round((tx - xa) / CELL)), i1 = Math.min(nx - 1, Math.round((tx + 1000 - xa) / CELL));
    const j0 = Math.max(0, Math.round((ty - ya) / CELL)), j1 = Math.min(ny - 1, Math.round((ty + 1000 - ya) / CELL));
    for (let j = j0; j <= j1; j++) { const tj = Math.round((ya + j * CELL - ty) / CELL); for (let i = i0; i <= i1; i++) z[j * nx + i] = tl[tj * TILE + Math.round((xa + i * CELL - tx) / CELL)]; }
  });
  let zmax = -Infinity; for (const v of z) if (v > zmax) zmax = v;
  const h = (E, N) => {
    let fx = (E - xa) / CELL, fy = (N - ya) / CELL;
    fx = Math.min(nx - 1.0001, Math.max(0, fx)); fy = Math.min(ny - 1.0001, Math.max(0, fy));
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * nx + i;
    return (z[k] * (1 - u) + z[k + 1] * u) * (1 - v) + (z[k + nx] * (1 - u) + z[k + nx + 1] * u) * v;
  };
  return { xa, ya, xb, yb, nx, ny, z, h, zmax, tiles: keys.length };
}

// ---------- CSDI queries (as HK Site Model) ----------
async function fetchJSON(url, tries = 2) {
  for (let t = 1; ; t++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'service error');
      return j;
    } catch (e) { if (t >= tries) throw e; } finally { clearTimeout(timer); }
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

// ---------- sun (NOAA, as make_site_sheets.py) ----------
function dayOfYear(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1; }
function sunPos(lat, lon, hour, month = MONTH, day = DAY) {
  const doy = dayOfYear(YEAR, month, day), g = ((2 * Math.PI) / 365) * (doy - 1 + (hour - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hour * 60 + eqt + 4 * lon - 60 * TZ, ha = ((tst / 4 - 180) * Math.PI) / 180, la = (lat * Math.PI) / 180;
  const cz = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha);
  const alt = 90 - (Math.acos(Math.max(-1, Math.min(1, cz))) * 180) / Math.PI;
  const az = ((Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(decl) * Math.cos(la)) * 180) / Math.PI + 180) % 360;
  return { alt, az };
}
// grid bearing of true north at a point (HK1980 Grid is a transverse Mercator: a few hundredths of a degree)
function trueNorthGrid(E, N) {
  const [lat, lon] = toLL(E, N), a = toEN(lat - 0.002, lon), b = toEN(lat + 0.002, lon);
  return bearing(b[0] - a[0], b[1] - a[1]) > 180 ? bearing(b[0] - a[0], b[1] - a[1]) - 360 : bearing(b[0] - a[0], b[1] - a[1]);
}

// ---------- analysis ----------
let v3d = null, view3 = null;                     // v3 3D module and the mounted view (see the end of the file)
function styleLabels() {                           // option text from board.STYLES, in the page language
  const sel = $('hsa-style'); if (!sel || !board.STYLES) return;
  for (const st of board.STYLES) { const o = sel.querySelector(`option[value="${st.id}"]`); if (o) o.textContent = T([st.en, st.zh]); }
  const sh = $('hsa-shape'); if (sh) { sh.options[0].textContent = T(['Square', '方形']); sh.options[1].textContent = T(['Round', '圓形']); }
  const sc = $('hsa-scale'); if (sc) for (const o of sc.options) o.textContent = o.value === 'auto' ? T(['Auto', '自動']) : T([`${o.value} m`, `${o.value} 米`]);
  document.querySelectorAll('[data-r]').forEach((b) => { b.textContent = T([`r ${b.dataset.r} m`, `半徑 ${b.dataset.r} 米`]); });
}
async function analyse() {
  if (state.busy) return;
  const R = siteRing(); if (!R || R.length < 3) return;
  state.busy = true; state.files = null; syncButtons();
  if (view3) { view3.dispose(); view3 = null; } if ($('hsa-3d')) $('hsa-3d').hidden = true;   // v3: an old 3D view would show the previous site
  document.querySelectorAll('[data-v3]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  const t0 = performance.now();
  try {
    const s = currentScale(R), f = frameOf(R, s);
    if (state.scale !== 'auto' && s !== +state.scale) status([`The site does not fit a ${state.scale} m frame; using ${s} m.`, `地盤放不進 ${state.scale} 米範圍，改用 ${s} 米。`]);
    const sb = s >= 800 ? 300 : SUN_BUF;
    status(['Loading buildings, roads, terrain, paths, transport, green and wind...', '正在載入建築物、道路、地形、行人路、交通、綠化及風資料...']);
    const bldP = queryAll(BLD_URL, f.E0 - sb, f.N0 - sb, f.E1 + sb, f.N1 + sb,
      'OBJECTID,BuildingBlockType,BuildingID,Status,BuildingNameEN,BuildingNameTC,BaseHeight,TopHeight,Storeys,DateStamp',
      (k) => status([`Loading buildings... ${k}`, `正在載入建築物... ${k}`]));
    const rdP = queryAll(RD_URL, f.E0, f.N0, f.E1, f.N1, 'OBJECTID,STREETTYPE,ENGLISHSTREETNAME,CHINESESTREETNAME,LASTUPDATEDATE').catch((e) => ({ error: e }));
    const demP = loadDEM(f.E0 - TERRAIN_BUF, f.N0 - TERRAIN_BUF, f.E1 + TERRAIN_BUF, f.N1 + TERRAIN_BUF);
    const extraP = fetchExtra(R, f);
    const an3P = soft(Promise.resolve().then(() => AN.fetchExtra3(R, f, ctx3)));      // v3: walking network etc., in parallel
    const [feats, roads, dem, extra, an3] = await Promise.all([bldP, rdP, demP, extraP, an3P]);
    const tFetch = performance.now() - t0;
    status(['Working out shadows and levels...', '正在計算陰影及地勢...']);
    await new Promise((r) => setTimeout(r, 0));
    state.result = compute({ R, f, feats, roads, dem, extra });
    state.result.h = dem.h; state.result.dem = dem;
    const tBase = performance.now() - t0;
    status(['Working out sunlight hours, walking times and sky view...', '正在計算日照時數、步行範圍及天空可視度...']);
    await new Promise((r) => setTimeout(r, 0));
    try { Object.assign(state.result, await AN.computeExtra3(state.result, an3, ctx3)); }
    catch (e) { console.error(e); for (const k of ['sunh', 'walk', 'svf']) if (!state.result[k]) state.result[k] = { error: String(e.message || e) }; }
    state.result.timing = { fetch: tFetch, base: tBase, total: performance.now() - t0 };
    state.stale = false;
    drawSheet();
    const m = state.result;
    const miss = Object.entries(m.extra).filter(([, v]) => v && v.error).map(([k]) => k).concat(['sunh', 'walk', 'svf'].filter((k) => !m[k] || m[k].error));
    status([`Board ready: ${m.inFrame} blocks, ${s} m frame, in ${(m.timing.total / 1000).toFixed(1)} s.` + (miss.length ? ` Not loaded: ${miss.join(', ')}.` : ''),
      `分析圖組完成：${m.inFrame} 座建築體，${s} 米範圍，用時 ${(m.timing.total / 1000).toFixed(1)} 秒。` + (miss.length ? `未能載入：${miss.join('、')}。` : '')], 'ok');
  } catch (e) {
    console.error(e);
    status([`Could not load the data (${e.message}). The government service may be busy: please try again in a minute.`, `未能載入資料（${e.message}）。政府數據服務可能繁忙，請稍後再試。`], 'err');
  } finally { state.busy = false; syncButtons(); renderStats(); }
}

function cleanRing(ring) {
  const pts = [];
  for (const [E, N] of ring) { const p = pts[pts.length - 1]; if (!p || Math.hypot(p[0] - E, p[1] - N) > 0.01) pts.push([E, N]); }
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.01) pts.pop();
  return pts.length >= 3 ? pts : null;
}

// Is the sun ray from (px, py, pz) blocked by block b? Ray goes along (ux, uy) horizontally, rising tanA per metre.
// It is inside b's prism for t where the ray height lies between b.zb and b.zt; test that stretch against the footprint.
function rayHits(px, py, pz, ux, uy, tanA, b) {
  const tHi = (b.zt - pz) / tanA; if (tHi <= 0) return false;
  const tLo = Math.max(0, (b.zb - pz) / tanA); if (tLo > tHi) return false;
  const ax = px + ux * tLo, ay = py + uy * tLo, bx = px + ux * tHi, by = py + uy * tHi;
  if (Math.max(ax, bx) < b.bb[0] || Math.min(ax, bx) > b.bb[2] || Math.max(ay, by) < b.bb[1] || Math.min(ay, by) > b.bb[3]) return false;
  if (inPoly(ax, ay, b.ring)) return true;
  const rg = b.ring;
  for (let i = 0, n = rg.length; i < n; i++) { const q = rg[i], w = rg[(i + 1) % n]; if (segsCross(ax, ay, bx, by, q[0], q[1], w[0], w[1])) return true; }
  return false;
}

function compute({ R, f, feats, roads, dem, extra = {} }) {
  const h = dem.h, siteC = centroid(R), siteBox = ringBox(R), siteArea = Math.abs(area(R));
  const tn = trueNorthGrid(siteC[0], siteC[1]);
  const [lat, lon] = toLL(siteC[0], siteC[1]);

  // site ground: sample points on a grid inside the boundary
  const step = Math.max(0.5, Math.sqrt(siteArea / 2500));
  const pts = [];
  for (let y = siteBox[1] + step / 2; y < siteBox[3]; y += step) for (let x = siteBox[0] + step / 2; x < siteBox[2]; x += step) if (inPoly(x, y, R)) pts.push([x, y, h(x, y)]);
  if (!pts.length) pts.push([siteC[0], siteC[1], h(siteC[0], siteC[1])]);
  let zmin = Infinity, zmax = -Infinity, zsum = 0;
  for (const p of pts) { zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]); zsum += p[2]; }
  const zs = zsum / pts.length;
  // best-fit plane z = a + b dx + c dy -> fall and its direction
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const [x, y, z] of pts) { const dx = x - siteC[0], dy = y - siteC[1], dz = z - zs; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz; }
  const det = sxx * syy - sxy * sxy, gb = det ? (sxz * syy - syz * sxy) / det : 0, gc = det ? (syz * sxx - sxz * sxy) / det : 0;
  const grad = Math.hypot(gb, gc), fallDir = bearing(-gb, -gc);       // downhill bearing (grid)
  // spot levels: boundary points at N, E, S, W extremes and the centroid
  const spots = [];
  const ext = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([ux, uy]) => R.reduce((best, p) => (p[0] * ux + p[1] * uy > best[0] * ux + best[1] * uy ? p : best), R[0]));
  for (const p of ext) if (!spots.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3)) spots.push([p[0], p[1], h(p[0], p[1])]);
  spots.push([siteC[0], siteC[1], h(siteC[0], siteC[1]), true]);

  // buildings
  const blocks = []; let latest = 0, estN = 0;
  for (const ft of feats) {
    const p = ft.properties || {}, g = ft.geometry; if (!g) continue;
    if (p.Status && p.Status !== 'Active') continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    polys.forEach((poly, pi) => {
      const ring = cleanRing(poly[0]); if (!ring) return;
      const c = centroid(ring), bb = ringBox(ring);
      let gmin = Infinity; for (const q of ring.concat([c])) gmin = Math.min(gmin, h(q[0], q[1]));
      let zb = Number.isFinite(p.BaseHeight) ? p.BaseHeight : null, zt = Number.isFinite(p.TopHeight) ? p.TopHeight : null, est = false;
      if (zb === null) { zb = gmin; est = true; }
      if (zt === null || zt <= zb) { const st = p.Storeys > 0 ? p.Storeys : 0; zt = zb + (st ? 3 * st : p.BuildingBlockType === 'Tower' ? 6 : p.BuildingBlockType === 'Podium' ? 5 : 4); est = true; }
      const holes = poly.slice(1).map(cleanRing).filter(Boolean);
      const inFrame = bb[2] > f.E0 && bb[0] < f.E1 && bb[3] > f.N0 && bb[1] < f.N1;
      const onSite = inPoly(c[0], c[1], R);
      blocks.push({ ring, holes, c, bb, zb, zt, H: zt - gmin, gmin, est, onSite, inFrame, id: String(p.BuildingID || p.OBJECTID), pi, en: p.BuildingNameEN, tc: p.BuildingNameTC, type: p.BuildingBlockType });
      if (est && inFrame) estN++;
      if (inFrame && p.DateStamp > latest) latest = p.DateStamp;
    });
  }
  const frameBlocks = blocks.filter((b) => b.inFrame);

  // tallest: one entry per building (highest block), whole frame
  const byB = new Map();
  let tallestOnSite = null;                       // v3 QA: the site is taken as cleared, so blocks on it never count as 'tallest nearby'
  for (const b of frameBlocks) { if (!(b.c[0] > f.E0 && b.c[0] < f.E1 && b.c[1] > f.N0 && b.c[1] < f.N1)) continue; if (b.onSite) { if (!tallestOnSite || b.zt > tallestOnSite.zt) tallestOnSite = b; continue; } const o = byB.get(b.id); if (!o || b.zt > o.zt) byB.set(b.id, b); }
  const tallest = [...byB.values()].sort((a, b) => b.zt - a.zt).slice(0, 5).map((b, i) => {
    const d = polyDist(b.ring, R), br = bearing(b.c[0] - siteC[0], b.c[1] - siteC[1]);
    return { n: i + 1, b, top: b.zt, H: b.H, d, br, en: b.en, tc: b.tc, est: b.est };
  });

  // sun, shadows and shade on the site
  const sun = HOURS.map((hr) => {
    const sp = sunPos(lat, lon, hr), azG = sp.az + tn, sb = (azG + 180) % 360, rad = (sb * Math.PI) / 180;
    return { hr, alt: sp.alt, az: sp.az, azG, sb, dx: Math.sin(rad), dy: Math.cos(rad), tanA: Math.tan((sp.alt * Math.PI) / 180), ratio: 1 / Math.tan((sp.alt * Math.PI) / 180) };
  });
  const casters = blocks.filter((b) => !b.onSite);
  const terrMax = dem.zmax;
  for (const s of sun) {
    // site shade: exact 3D ray test from each sample point toward the sun, against every block prism and the DTM
    // (sun ray from the point goes opposite the shadow vector)
    const ux = -s.dx, uy = -s.dy;
    let shaded = 0, byTerrain = 0; const who = new Map();
    for (const [px, py, pz] of pts) {
      let hit = null;
      for (const b of casters) if ((!hit || b.zt > hit.zt) && rayHits(px, py, pz, ux, uy, s.tanA, b)) hit = b;
      let terr = false;
      {                                            // hill shadow tested for every point, so its share is reported on its own
        for (let t = HILL_NEAR; t <= TERRAIN_BUF; t += t < 300 ? 5 : 10) {
          const zr = pz + t * s.tanA; if (zr > terrMax) break;
          if (h(px + ux * t, py + uy * t) > zr + HILL_TOL) { terr = true; break; }
        }
      }
      if (hit || terr) shaded++;
      if (terr) byTerrain++;
      if (hit) who.set(hit.id, (who.get(hit.id) || 0) + 1);
    }
    s.pct = (100 * shaded) / pts.length; s.terrPct = (100 * byTerrain) / pts.length;
    const top = [...who.entries()].sort((a, b) => b[1] - a[1])[0];
    s.mainCaster = top ? { ...casters.find((b) => b.id === top[0]), share: (100 * top[1]) / pts.length } : null;
    // drawn shadows: each prism projected onto a level plane at the site's mean ground (zs)
    s.paths = [];
    for (const b of casters) {
      const Hc = b.zt - zs; if (Hc <= 0.2) continue;
      const Hb = Math.max(0, b.zb - zs), vt = Hc * s.ratio, vb = Hb * s.ratio;
      const ex = [Math.min(b.bb[0], b.bb[0] + s.dx * vt), Math.min(b.bb[1], b.bb[1] + s.dy * vt), Math.max(b.bb[2], b.bb[2] + s.dx * vt), Math.max(b.bb[3], b.bb[3] + s.dy * vt)];
      if (ex[2] < f.E0 || ex[0] > f.E1 || ex[3] < f.N0 || ex[1] > f.N1) continue;
      s.paths.push({ ring: b.ring, vb: [s.dx * vb, s.dy * vb], vt: [s.dx * vt, s.dy * vt] });
    }
  }

  // roofs: is the centre of each roof in another block's shadow at each hour? (bit per hour)
  for (const b of frameBlocks) {
    b.roof = 0;
    for (const [hi, s] of sun.entries()) {
      const ux = -s.dx, uy = -s.dy, pz = b.zt + 0.2;
      if (!inPoly(b.c[0], b.c[1], b.ring)) continue;           // odd shapes: centroid outside, leave unshaded
      for (const o of blocks) if (o !== b && o.zt > pz && rayHits(b.c[0], b.c[1], pz, ux, uy, s.tanA, o)) { b.roof |= 1 << hi; break; }
    }
  }

  // terrain cast shadow (any of the three hours) and hillshade on the frame grid, 5 m cells
  const gx0 = Math.floor(f.E0 / CELL) * CELL, gy0 = Math.floor(f.N0 / CELL) * CELL;
  const gnx = Math.ceil((f.E1 - gx0) / CELL) + 1, gny = Math.ceil((f.N1 - gy0) / CELL) + 1;
  const gz = new Float32Array(gnx * gny);
  for (let j = 0; j < gny; j++) for (let i = 0; i < gnx; i++) gz[j * gnx + i] = h(gx0 + i * CELL, gy0 + j * CELL);
  const sm = new Float32Array(gz.length);                              // 3x3 smoothing for contours
  for (let j = 0; j < gny; j++) for (let i = 0; i < gnx; i++) {
    let a = 0, n = 0;
    for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) { const ii = i + u, jj = j + v; if (ii >= 0 && jj >= 0 && ii < gnx && jj < gny) { a += gz[jj * gnx + ii]; n++; } }
    sm[j * gnx + i] = a / n;
  }
  let fmin = Infinity, fmax = -Infinity; for (const v of sm) { fmin = Math.min(fmin, v); fmax = Math.max(fmax, v); }
  const relief = fmax - fmin;
  const interval = [1, 2, 5, 10, 20, 25, 50].find((iv) => relief / iv <= 28) || 50;
  const terrShade = new Uint8Array(gnx * gny), hill = new Float32Array(gnx * gny);
  let terrCells = 0;
  for (let j = 0; j < gny; j++) for (let i = 0; i < gnx; i++) {
    const x = gx0 + i * CELL, y = gy0 + j * CELL, z = gz[j * gnx + i];
    let m = 0;
    for (const s of sun) {
      const ux = -s.dx, uy = -s.dy;
      for (let t = HILL_NEAR; t <= TERRAIN_BUF; t += t < 300 ? 5 : 10) { const zr = z + t * s.tanA; if (zr > terrMax) break; if (h(x + ux * t, y + uy * t) > zr + HILL_TOL) { m |= 1 << HOURS.indexOf(s.hr); break; } }
    }
    terrShade[j * gnx + i] = m; if (m) terrCells++;
    const zl = gz[j * gnx + Math.max(0, i - 1)], zr2 = gz[j * gnx + Math.min(gnx - 1, i + 1)], zd = gz[Math.max(0, j - 1) * gnx + i], zu = gz[Math.min(gny - 1, j + 1) * gnx + i];
    const dzdx = (zr2 - zl) / (2 * CELL), dzdy = (zu - zd) / (2 * CELL);
    const lx = -Math.sin(Math.PI / 4) * Math.cos(Math.PI / 4), ly = Math.cos(Math.PI / 4) * Math.cos(Math.PI / 4), lz = Math.sin(Math.PI / 4); // light from NW, 45 deg up
    const nz = 1 / Math.hypot(dzdx, dzdy, 1), shade = (-dzdx * lx - dzdy * ly + lz) * nz;
    hill[j * gnx + i] = Math.max(0, Math.min(1, (lz - shade) / lz));      // 0 on flat ground and on slopes facing the light
  }
  const contours = marching(sm, gnx, gny, gx0, gy0, interval, fmin, fmax);

  // roads: clip to the frame, keep runs; adjacency to the site
  const roadRuns = []; let roadErr = null, roadLatest = 0; const near = new Map();
  if (roads && roads.error) roadErr = roads.error.message || String(roads.error);
  else for (const ft of roads || []) {
    const p = ft.properties || {}, g = ft.geometry; if (!g) continue;
    const cls = ROAD[p.STREETTYPE] ? p.STREETTYPE : 'Restricted Road';
    if (p.LASTUPDATEDATE > roadLatest) roadLatest = p.LASTUPDATEDATE;
    const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const part of parts) {
      if (part.length < 2) continue;
      roadRuns.push({ cls, en: p.ENGLISHSTREETNAME, tc: p.CHINESESTREETNAME, pts: part });
      if (cls === 'Tunnel') continue;
      let d = Infinity;
      for (let k = 0; k < part.length - 1; k++) {
        const a = part[k], b = part[k + 1];
        if (inPoly(a[0], a[1], R)) { d = 0; break; }
        for (let i = 0; i < R.length; i++) { const q = R[i], w = R[(i + 1) % R.length]; if (segsCross(a[0], a[1], b[0], b[1], q[0], q[1], w[0], w[1])) { d = 0; break; } d = Math.min(d, segDist(q[0], q[1], a[0], a[1], b[0], b[1])); }
        d = Math.min(d, ringDist(a[0], a[1], R), ringDist(b[0], b[1], R));
      }
      const edge = Math.max(0, d - ROAD[cls].w / 2);
      if (edge <= 30) {
        const key = (p.ENGLISHSTREETNAME || p.CHINESESTREETNAME || '') + '|' + cls;
        const o = near.get(key);
        if (!o || edge < o.edge) near.set(key, { cls, en: p.ENGLISHSTREETNAME, tc: p.CHINESESTREETNAME, edge, cl: d });
      }
    }
  }
  const adjacent = [...near.values()].sort((a, b) => a.edge - b.edge || ROAD[a.cls].rank - ROAD[b.cls].rank).slice(0, 6);

  return {
    R, f, siteC, siteArea, lat, lon, tn, zs, zmin, zmax, grad, fallDir, spots, pts: pts.length, blocks, frameBlocks, inFrame: frameBlocks.length,
    est: estN, latest, tallest, tallestOnSite: tallestOnSite ? { top: tallestOnSite.zt, en: tallestOnSite.en, tc: tallestOnSite.tc } : null, sun, grid: { gx0, gy0, gnx, gny, terrShade, hill, terrCells, gz }, contours, interval, fmin, fmax,
    roadRuns, roadErr, roadLatest, adjacent, fetched: feats.length, demTiles: dem.tiles, onSite: blocks.filter((b) => b.onSite).length,
    extra: finishExtra(extra, siteC, R), views: views(blocks, h, siteC, zs, f),
  };
}

// ---------- extra layers (v2): each one may fail on its own; the board says so instead of guessing ----------
const soft = (p) => p.catch((e) => { console.warn(e); return { error: String(e.message || e) }; });
function geoRings(g) { const polys = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; return polys.map((pl) => cleanRing(pl[0])).filter(Boolean); }
function geoLines(g) { return !g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []; }
async function fetchWind(E, N) {
  const q = new URLSearchParams({ where: '1=1', geometry: `${E},${N}`, geometryType: 'esriGeometryPoint', inSR: '2326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'false', f: 'json' });
  const j = await fetchJSON(WIND_URL + '?' + q), a = ((j.features || [])[0] || {}).attributes;
  if (!a) throw new Error('outside the PlanD wind grid');
  const get = async (u) => {
    const r = await fetch(String(u).replace(/^http:/, 'https:')); if (!r.ok) throw new Error('wind table ' + r.status);
    const line = (await r.text()).split(/\r?\n/).find((l) => /\bSum\b/.test(l)); if (!line) throw new Error('wind table format');
    const v = line.split(/\t/).map((x) => x.trim()).filter(Boolean), i = v.indexOf('Sum'), out = v.slice(i + 1, i + 17).map(Number);
    if (out.length !== 16 || out.some((x) => !Number.isFinite(x))) throw new Error('wind table values'); return out;
  };
  const [annual, summer, winter] = await Promise.all([get(a.annual_200), get(a.summer_200), get(a.winter_200)]);
  return { annual, summer, winter, level: 200, cell: (String(a.annual_200).match(/\/([a-z]_\d+)_lev/) || [])[1] || null, src: a.annual_200 };
}
// MTR stations and exits: a dated OpenStreetMap snapshot shipped with the tool (mtr_exits.json, make_mtr_exits.py),
// because the public Overpass servers are often at capacity.
let mtrData = null;
async function fetchMTR(E0, N0) {
  if (!mtrData) { const r = await fetch(new URL('./mtr_exits.json', import.meta.url)); if (!r.ok) throw new Error('MTR exits ' + r.status); mtrData = await r.json(); }
  const st = mtrData.stations.map(([E, N, en, zh, kind]) => ({ E, N, en, zh, kind: kind || 'mtr' }));
  const exits = mtrData.exits.filter(([E, N]) => Math.hypot(E - E0, N - N0) <= 2000).map(([E, N, ref, i]) => ({ E, N, ref: ref || null, station: st[i] }));
  const lr = st.filter((q) => q.kind === 'lr' && Math.hypot(q.E - E0, q.N - N0) <= 2000);   // Light Rail stops: no exits, the stop itself
  return { exits, lr, stations: st.filter((q) => q.kind === 'mtr' && Math.hypot(q.E - E0, q.N - N0) <= 2500), osm: mtrData.osm_base };
}
function fetchExtra(R, f) {
  const c = centroid(R);
  const box = [f.E0, f.N0, f.E1, f.N1];
  return Promise.all([
    soft(queryAll(PED_URL, ...box, 'OBJECTID,FeatureType,Location,WeatherProof')),
    soft(queryAll(BUS_URL, box[0] - 100, box[1] - 100, box[2] + 100, box[3] + 100, 'OBJECTID')),
    soft(Promise.all(HAB.map(([id, cls]) => queryAll(HAB_URL + id + '/query', ...box, 'OBJECTID').then((fs) => fs.map((ft) => ({ cls, g: ft.geometry })))))),
    soft(queryAll(PARK_URL, box[0] - 800, box[1] - 800, box[2] + 800, box[3] + 800, 'OBJECTID,NameEN,NameTC')),
    soft(fetchWind(c[0], c[1])),
    soft(fetchMTR(c[0], c[1])),
  ]).then(([ped, bus, green, parks, wind, mtr]) => ({ ped, bus, green, parks, wind, mtr }));
}
function finishExtra(x, siteC, R) {
  const out = {};
  out.ped = x.ped && x.ped.error ? x.ped : (x.ped || []).flatMap((ft) => { const p = ft.properties || {}; return geoLines(ft.geometry).filter((l) => l.length > 1).map((pts) => ({ pts: pts.map((q) => [q[0], q[1]]), k: PED_KIND(p.FeatureType), cov: p.WeatherProof === 1, indoor: p.Location === 2 || p.Location === 3 })); });
  out.bus = x.bus && x.bus.error ? x.bus : (x.bus || []).map((ft) => ft.geometry && ft.geometry.coordinates).filter(Boolean).map((q) => [q[0], q[1]]);
  out.green = x.green && x.green.error ? x.green : (x.green || []).flat().flatMap(({ cls, g }) => geoRings(g).map((ring) => ({ cls, ring })));
  out.parks = x.parks && x.parks.error ? x.parks : (x.parks || []).filter((ft) => ft.geometry).map((ft) => ({ E: ft.geometry.coordinates[0], N: ft.geometry.coordinates[1], en: titleCase(ft.properties.NameEN || ''), zh: ft.properties.NameTC || ft.properties.NameEN || '' }));
  out.wind = x.wind || { error: 'no data' };
  if (x.mtr && !x.mtr.error) {
    const exits = x.mtr.exits.map((e) => ({ ...e, d: inPoly(e.E, e.N, R) ? 0 : ringDist(e.E, e.N, R) })).sort((a, b) => a.d - b.d);
    const lr = (x.mtr.lr || []).map((q) => ({ ...q, d: inPoly(q.E, q.N, R) ? 0 : ringDist(q.E, q.N, R) })).sort((a, b) => a.d - b.d);
    out.mtr = { exits, lr, stations: x.mtr.stations, osm: x.mtr.osm };
  } else out.mtr = x.mtr || { error: 'no data' };
  return out;
}

// ---------- views (v2): isovists at street level and 30 m up, and the sky view factor at street level ----------
// A ray is stopped by the first block whose prism spans the eye height, or by terrain above it (the 5 m DTM).
// Blocks on the site are left out (the site is taken as cleared); trees and roof features are not modelled.
function rayEntry(x0, y0, ux, uy, b, maxD) {
  const ex = x0 + ux * maxD, ey = y0 + uy * maxD;
  if (Math.max(x0, ex) < b.bb[0] || Math.min(x0, ex) > b.bb[2] || Math.max(y0, ey) < b.bb[1] || Math.min(y0, ey) > b.bb[3]) return null;
  if (inPoly(x0, y0, b.ring)) return 0;
  let t = Infinity; const rg = b.ring;
  for (let i = 0, n = rg.length; i < n; i++) {
    const [ax, ay] = rg[i], [bx, by] = rg[(i + 1) % n], sx = bx - ax, sy = by - ay, den = ux * sy - uy * sx;
    if (Math.abs(den) < 1e-12) continue;
    const tt = ((ax - x0) * sy - (ay - y0) * sx) / den, uu = ((ax - x0) * uy - (ay - y0) * ux) / den;
    if (tt >= 0 && uu >= 0 && uu <= 1 && tt < t) t = tt;
  }
  return t <= maxD ? t : null;
}
function views(blocks, h, siteC, zs, f) {
  const F = f.E1 - f.E0, maxD = Math.max(1000, F), openD = Math.round(Math.max(200, F * 0.75) / 50) * 50, nr = 360, [x0, y0] = siteC;
  const cand = blocks.filter((b) => !b.onSite);
  const run = (zo, svf) => {
    const d = new Float32Array(nr); let s2 = 0;
    for (let i = 0; i < nr; i++) {
      const a = (i * 2 * Math.PI) / nr, ux = Math.sin(a), uy = Math.cos(a);
      let tmin = maxD, beta = 0;
      for (const b of cand) {
        if (b.zt <= zo) continue;
        const t = rayEntry(x0, y0, ux, uy, b, maxD); if (t === null) continue;
        beta = Math.max(beta, Math.atan2(b.zt - zo, Math.max(t, 1)));
        if (b.zb <= zo + 0.5 && t < tmin) tmin = t;
      }
      for (let t = 10; t <= TERRAIN_BUF; t += t < 300 ? 5 : 10) {
        const z = h(x0 + ux * t, y0 + uy * t);
        if (z > zo + HILL_TOL && t < tmin) tmin = t;
        if (svf) beta = Math.max(beta, Math.atan2(z - zo - HILL_TOL, t));
        else if (t > tmin) break;
      }
      d[i] = tmin; s2 += Math.sin(beta) ** 2;
    }
    const sorted = Array.from(d).sort((a, b) => a - b);
    return { d, zo, med: sorted[nr >> 1], svf: 1 - s2 / nr };
  };
  const street = run(h(x0, y0) + 1.5, true), up = run(zs + 30, false);
  // open sectors from 30 m up: runs of directions clear beyond openD, widest first
  const open = [], ok = (i) => up.d[((i % nr) + nr) % nr] >= openD;
  let start = 0; while (start < nr && ok(start)) start++;
  if (start < nr) {
    let i0 = -1;
    for (let k = 1; k <= nr; k++) {
      const i = start + k;
      if (ok(i) && i0 < 0) i0 = i;
      if ((!ok(i) || k === nr) && i0 >= 0) { const w = i - i0; if (w >= 8) open.push({ mid: (i0 + w / 2) % nr, w }); i0 = -1; }
    }
  } else open.push({ mid: 0, w: 360 });
  open.sort((a, b) => b.w - a.w);
  return { x0, y0, street, up, open, openD };
}


// marching squares on the smoothed grid; returns [{v, idx, segs:[[x0,y0,x1,y1],...]}] in E,N
function marching(z, nx, ny, x0, y0, iv, zmin, zmax) {
  const out = [], TAB = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[0, 3]], []];
  for (let v = Math.ceil(zmin / iv) * iv; v <= zmax; v += iv) {
    const segs = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = z[j * nx + i], b = z[j * nx + i + 1], c = z[(j + 1) * nx + i + 1], d = z[(j + 1) * nx + i];
      const code = (a > v ? 1 : 0) | (b > v ? 2 : 0) | (c > v ? 4 : 0) | (d > v ? 8 : 0);
      if (!code || code === 15) continue;
      const X = x0 + i * CELL, Y = y0 + j * CELL;
      const ep = (e) => {
        if (e === 0) { const t = (v - a) / (b - a); return [X + t * CELL, Y]; }
        if (e === 1) { const t = (v - b) / (c - b); return [X + CELL, Y + t * CELL]; }
        if (e === 2) { const t = (v - d) / (c - d); return [X + t * CELL, Y + CELL]; }
        const t = (v - a) / (d - a); return [X, Y + t * CELL];
      };
      for (const [e1, e2] of TAB[code]) { const p = ep(e1), q = ep(e2); segs.push([p[0], p[1], q[0], q[1]]); }
    }
    if (segs.length) out.push({ v, idx: Math.abs(v / (iv * 5) - Math.round(v / (iv * 5))) < 1e-6, segs });
  }
  return out;
}

// ---------- the board (v2, board.js) ----------
import { createBoard } from './board.js';
import * as AN from './analyses.js';
import { DIAGRAMS3 } from './diagrams3.js';
// what analyses.js may use from here (it owns its own fetching and maths)
const ctx3 = { queryAll, fetchJSON, PED_URL, RD_URL, BUS_URL, sunPos, toLL, toEN, inPoly, ringDist, segDist, centroid, ringBox, area, bearing, compass, T, isZh, CELL, HILL_TOL, TERRAIN_BUF, YEAR, TZ };
const roman = (s) => (s ? s.replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g, (m) => m.toUpperCase()) : s);
const nm = (en, tc) => (isZh() ? tc || roman(titleCase(en)) : roman(titleCase(en)) || tc) || '';
const CREDITS_EN = 'Data: Lands Department (Building, Road Centreline, 3D Pedestrian Network, 5 m Digital Terrain Model), Transport Department (bus stops), Agriculture, Fisheries and Conservation Department (Territory-wide Terrestrial Habitat Map), Leisure and Cultural Services Department (parks), Planning Department (Site Wind Availability Data), The Government of the Hong Kong SAR, via CSDI Portal and DATA.GOV.HK under the DATA.GOV.HK Terms and Conditions. Intellectual property rights in the data belong to the Government of the HKSAR. MTR stations, exits and Light Rail stops: © OpenStreetMap contributors (ODbL), snapshot 25 Oct 2026. Address search: ALS. Sun: NOAA solar equations. Derived drawing, provided as is. Hobby project, not official, for reference only; not a substitute for a survey or professional advice.';
const CREDITS_ZH = '資料：香港特別行政區政府地政總署（建築物、道路中線、三維行人道路網、5 米數碼地形模型）、運輸署（巴士站）、漁農自然護理署（全港性陸地生境地圖）、康樂及文化事務署（公園）、規劃署（地盤總體風環境資料），經空間數據共享平台及資料一線通，按資料一線通條款及細則使用。資料的知識產權屬香港特別行政區政府所有。港鐵站、出口及輕鐵站：© OpenStreetMap 貢獻者（ODbL），2026 年 10 月 25 日資料。地址搜尋：地址查詢服務（ALS）。太陽位置：NOAA 太陽位置方程式。衍生圖則，按現狀提供。個人興趣項目，並非官方資料，只供參考，不能取代測量或專業意見。';
const board = createBoard({
  T, isZh, compass, sunPos, fmtArea, nm, CELL, ROAD, inPoly, segDist,
  dtmTiles: () => dtmIndex, credits: () => T([CREDITS_EN, CREDITS_ZH]), diagrams3: DIAGRAMS3,
});
function boardOpts() {
  const a = state.address, nmS = state.name || (a ? (isZh() ? a.nameZh || a.name : a.name || a.nameZh) : '');
  return { name: nmS, address: a, drawn: new Date().toISOString().slice(0, 10), style: state.style, shape: state.shape };
}
let svgCache = null;
function drawSheet() {
  const res = state.result; if (!res) return;
  svgCache = board.boardSVG(res, boardOpts());
  $('hsa-sheet').innerHTML = svgCache;
  $('hsa-out').classList.add('has-sheet');
  renderStats();
}

// ---------- stats ----------
function renderStats() {
  const el = $('hsa-stats'), m = state.result;
  if (!m) { el.hidden = true; return; }
  const rows = [];
  const add = (en, zh, v) => rows.push(`<div><dt>${T([en, zh])}</dt><dd>${v}</dd></div>`);
  add('Site', '地盤', `${fmtArea(m.siteArea)} <small>${m.zmax - m.zmin < 0.05 ? T([`+${m.zmin.toFixed(1)} mPD, level`, `主水平基準以上 ${m.zmin.toFixed(1)} 米，平坦`]) : T([`+${m.zmin.toFixed(1)} to +${m.zmax.toFixed(1)} mPD`, `主水平基準以上 ${m.zmin.toFixed(1)} 至 ${m.zmax.toFixed(1)} 米`])}</small>`);
  add('Frame', '範圍', `${T([`${m.f.s} m`, `${m.f.s} 米`])} <small>${T([state.shape === 'circle' ? 'round, every diagram but 08' : 'square, every diagram but 08', state.shape === 'circle' ? '圓形，第 08 圖以外每幅相同' : '正方形，第 08 圖以外每幅相同'])}</small>`);
  m.sun.forEach((s) => add(`Shade at ${String(s.hr).padStart(2, '0')}:00`, `${String(s.hr).padStart(2, '0')}:00 陰影`, `${s.pct.toFixed(0)}% <small>${T(['21 Dec', '12 月 21 日'])}</small>`));
  if (m.tallest[0]) add('Tallest nearby', '附近最高', `${m.tallest[0].top.toFixed(1)} mPD <small>${esc(nm(m.tallest[0].en, m.tallest[0].tc) || T(['unnamed block', '未命名建築物']))}</small>`);
  const x = m.extra || {};
  if (x.mtr && !x.mtr.error && x.mtr.exits[0]) add('Nearest MTR exit', '最近港鐵出口', `${T([`${Math.round(x.mtr.exits[0].d / 10) * 10} m`, `${Math.round(x.mtr.exits[0].d / 10) * 10} 米`])} <small>${T(['straight line', '直線距離'])}</small>`);
  if (x.mtr && !x.mtr.error && x.mtr.lr && x.mtr.lr[0] && x.mtr.lr[0].d <= 1000) add('Nearest Light Rail stop', '最近輕鐵站', `${T([`${Math.round(x.mtr.lr[0].d / 10) * 10} m`, `${Math.round(x.mtr.lr[0].d / 10) * 10} 米`])} <small>${esc(T([x.mtr.lr[0].en || x.mtr.lr[0].zh, x.mtr.lr[0].zh || x.mtr.lr[0].en]))}</small>`);
  add('Blocks drawn', '建築體', `${m.inFrame} <small>${T(['heights estimated', '估算高度'])} ${m.est}</small>`);
  el.innerHTML = rows.join(''); el.hidden = false;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- export ----------
function fileTag() {
  const m = state.result, base = (state.name || (state.address && state.address.name) || 'site').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'site';
  return `hk-site-analysis_${base}_E${m.siteC[0].toFixed(0)}_N${m.siteC[1].toFixed(0)}`;
}
function save(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const toBlob = (cv, type = 'image/png', q) => new Promise((r) => cv.toBlob(r, type, q));
async function pngBlob() { return toBlob(await board.boardCanvas(state.result, boardOpts(), 200)); }
async function pdfBlob(size = 'a3') {
  const sc = size === 'a2' ? Math.SQRT2 : 1, cv = await board.boardCanvas(state.result, boardOpts(), 200, sc), { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: size, compress: true });
  doc.setProperties({ title: T(['HK Site Analysis', '香港地盤分析']) + (boardOpts().name ? ': ' + boardOpts().name : ''), subject: 'Site analysis diagram series', creator: 'anzonwong.com/lab/hk-site-analysis', author: 'AW Design (hobby tool)' });
  doc.addImage(cv.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, board.BW * sc, board.BH * sc, undefined, 'FAST');
  // v3: page 2 = the exploded axonometric sheet, when this browser can draw 3D (else the PDF stays one page)
  try {
    const m = await load3D();
    if (m.supported() && board.explodedSheetCanvas) {
      const ex = await exploded(sc);
      const cv2 = await board.explodedSheetCanvas(state.result, boardOpts(), ex, 200, sc);
      doc.addPage(size, 'landscape');
      doc.addImage(cv2.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, board.BW * sc, board.BH * sc, undefined, 'FAST');
    }
  } catch (e) { console.warn('exploded page left out:', e.message); }
  return doc.output('blob');
}
async function singleBlob(key) { return toBlob(await board.singleCanvas(state.result, key, boardOpts())); }
async function zipBlob() {
  const z = new window.JSZip();
  for (const [i, k] of board.KEYS.entries()) z.file(`${String(i + 1).padStart(2, '0')}_${k}.png`, await singleBlob(k));
  return z.generateAsync({ type: 'blob' });
}
async function exportAs(kind) {
  if (!state.result || state.busy) return;
  state.busy = true; syncButtons();
  const ext = { pdf: 'A3.pdf', pdf2: 'A2.pdf', png: 'board.png', zip: 'diagrams-1080.zip', explode: 'exploded-A3.png', dxf: 'HK1980.dxf', svg: 'HK1980.svg' }[kind];
  try {
    status([`Writing ${ext}...`, `正在製作 ${ext}...`]);
    await new Promise((r) => setTimeout(r, 30));
    const blob = kind === 'pdf' ? await pdfBlob('a3') : kind === 'pdf2' ? await pdfBlob('a2') : kind === 'zip' ? await zipBlob()
      : kind === 'explode' ? await explodedBlob() : kind === 'dxf' || kind === 'svg' ? await cadBlob(kind) : await pngBlob();
    state.files = { ...(state.files || {}), [kind]: blob.size };
    save(blob, `${fileTag()}_${ext}`);
    status([`Downloaded ${fileTag()}_${ext} (${(blob.size / 1e6).toFixed(1)} MB).`, `已下載 ${fileTag()}_${ext}（${(blob.size / 1e6).toFixed(1)} MB）。`], 'ok');
  } catch (e) {
    console.error(e); status([`Could not write the file (${e.message}).`, `未能製作檔案（${e.message}）。`], 'err');
  } finally { state.busy = false; syncButtons(); }
}

$('hsa-run').addEventListener('click', analyse);
$('hsa-pdf').addEventListener('click', () => exportAs('pdf'));
$('hsa-png').addEventListener('click', () => exportAs('png'));
if ($('hsa-pdf2')) $('hsa-pdf2').addEventListener('click', () => exportAs('pdf2'));
if ($('hsa-zip')) $('hsa-zip').addEventListener('click', () => exportAs('zip'));
for (const k of ['explode', 'dxf', 'svg']) if ($('hsa-' + k)) $('hsa-' + k).addEventListener('click', () => exportAs(k));
$('hsa-zoom').addEventListener('click', () => {
  const on = $('hsa-out').classList.toggle('zoomed'); $('hsa-zoom').setAttribute('aria-pressed', String(on));
});
status(['Search for an address or click the map to place the site. Then press Analyse site.', '搜尋地址或在地圖上點選以放置地盤，然後按「分析地盤」。']);
drawSite(); syncButtons(); fitFrame(); styleLabels();
// test hook (read-only use by the QA script)
// ---------- v3: style controls, 3D view, CAD exports ----------
if ($('hsa-style')) $('hsa-style').addEventListener('change', (e) => { state.style = e.target.value; if (state.result) { drawSheet(); refresh3D(); } });
if ($('hsa-shape')) $('hsa-shape').addEventListener('change', (e) => { state.shape = e.target.value; if (state.result) { drawSheet(); refresh3D(); } });
async function load3D() { if (!v3d) v3d = await import('./view3d.js'); return v3d; }
function opts3D(mode) {
  const o = boardOpts();
  return { mode, keys: board.KEYS, titles: board.titles ? board.titles() : {}, theme: board.theme ? board.theme(o) : null, shape: o.shape,
    plate: (key, px) => board.plateCanvas(state.result, key, o, px), lang: isZh() ? 'zh' : 'en', T };
}
async function show3D(mode) {
  if (!state.result || state.stale) return;
  const box = $('hsa-3d'); if (!box) return;
  try {
    const m = await load3D();
    if (!m.supported()) { status(['This browser cannot show 3D (no WebGL). The board and the downloads still work.', '此瀏覽器未能顯示 3D（沒有 WebGL）。圖板及下載仍可使用。'], 'err'); return; }
    box.hidden = false;
    if (view3 && view3.res === state.result) view3.setMode(mode, opts3D(mode));
    else { if (view3) view3.dispose(); view3 = await m.mount(box, state.result, opts3D(mode)); view3.res = state.result; }
    document.querySelectorAll('[data-v3]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v3 === mode)));
  } catch (e) { console.error(e); status([`Could not open the 3D view (${e.message}).`, `未能開啟 3D 視圖（${e.message}）。`], 'err'); }
}
function refresh3D() { if (view3 && view3.res === state.result) view3.update(opts3D(view3.mode || 'explode')); }
document.querySelectorAll('[data-v3]').forEach((b) => b.addEventListener('click', () => show3D(b.dataset.v3)));
// sheet 2 layout (board.js, A3 mm): title band to y 46, label column from x 290, credits from about y 258.
// The 3D image is rendered for that free box and placed on a full-sheet transparent canvas; anchors move with it.
async function exploded(scale = 1) {
  const m = await load3D(); if (!m.supported()) throw new Error('no WebGL');
  const W = Math.round(3307 * scale), H = Math.round(2339 * scale), k = W / 420;
  const box = { x: Math.round(12 * k), y: Math.round(50 * k), w: Math.round((286 - 12) * k), h: Math.round((256 - 50) * k) };
  const ex = await m.renderExploded(state.result, { ...opts3D('explode'), width: box.w, height: box.h });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.getContext('2d').drawImage(ex.canvas, box.x, box.y);
  return { ...ex, canvas: cv, anchors: ex.anchors.map((a) => ({ ...a, x: a.x + box.x, y: a.y + box.y })), north: ex.north ? { ...ex.north, x: ex.north.x + box.x, y: ex.north.y + box.y } : ex.north };
}
async function explodedBlob() {
  const m = await load3D(); if (!m.supported()) throw new Error('no WebGL');
  const ex = await exploded(1);
  if (!board.explodedSheetCanvas) return toBlob(ex.canvas);
  return toBlob(await board.explodedSheetCanvas(state.result, boardOpts(), ex, 200));
}
async function cadBlob(kind) {
  const cad = await import('./cad.js');
  const txt = kind === 'dxf' ? cad.toDXF(state.result, boardOpts()) : cad.toSVG(state.result, boardOpts());
  return new Blob([txt], { type: kind === 'dxf' ? 'application/dxf' : 'image/svg+xml' });
}
// test hook (read-only use by the QA script)
window.hsa = { state, setCentre, setRadius, setPolygon, analyse, sunPos, pdfBlob, pngBlob, singleBlob, zipBlob, board, boardOpts, search, pick, get svg() { return svgCache; },
  AN, ctx3, load3D, show3D, get view3() { return view3; }, explodedBlob, cadBlob, drawSheet };
