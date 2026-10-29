// UK Site Analysis (anzonwong.com Lab), England. Plain ES module, no bundler. Built 28 Oct 2026 from the HK Site Analysis v3
// engine (board.js, analyses.js, diagrams3.js, view3d.js, cad.js copied and adapted here; the HK files are not touched).
// Fourteen diagrams of the same site at the same frame, drawn in the browser from open government data:
//   buildings and heights from Environment Agency LiDAR (first-return DSM - DTM, roofs told from trees by first minus last
//   return; ukdata.js), terrain from the LiDAR DTM, sun (NOAA) and shadows on 21 Mar / 21 Jun / 21 Dec, sunlight hours and sky
//   view (analyses.js), ERA5 wind (Open-Meteo), transport (NaPTAN tiles), Defra Round 4 road and rail noise, Natural England
//   priority habitats and LiDAR tree canopy, planning constraints and flood zones (planning.data.gov.uk), a BRE 25 degree
//   screening check, views; roads, street names and the walking network from OS Open Roads tiles (make_openroads.py), with
//   OpenStreetMap footpaths and building names added only when the Overpass API answers (optional extra).
// Coordinates: British National Grid (EPSG:27700), metres; heights in metres above Ordnance Datum Newlyn (m AOD).
// Sun: NOAA equations (as the HK tool), clock time GMT, BST on dates in British Summer Time.

import * as UK from './ukdata.js';

const L = window.L, proj4 = window.proj4;
proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs');
const toEN = (lat, lon) => proj4('EPSG:4326', 'EPSG:27700', [lon, lat]);
const toLL = (E, N) => { const p = proj4('EPSG:27700', 'EPSG:4326', [E, N]); return [p[1], p[0]]; };

const NAPTAN_BASE = new URL('./naptan/', import.meta.url);
const ROADS_BASE = new URL('./roads/', import.meta.url);
const BORDER_URL = new URL('./border.json', import.meta.url);   // England's land borders (make_border.py, ONS BUC), QA round 2
const CELL = 5;                                                       // terrain grid for contours, hillshade and horizons (m)
const BOUNDS = { E: [82000, 656000], N: [5000, 658000] };             // the LiDAR composite's extent (England)
const FRAMES = [200, 250, 300, 400, 500, 600, 800];                   // square frame side (m)
const YEAR = 2026, TZ = 0;
const SUN_DATES = [{ id: 'mar', m: 3, d: 21, en: '21 Mar' }, { id: 'jun', m: 6, d: 21, en: '21 Jun' }, { id: 'dec', m: 12, d: 21, en: '21 Dec' }];
const SUN_HR = 12;                                                    // clock time of the drawn shadows
const TERRAIN_BUF = 1500;                                             // terrain loaded this far round the frame (m), at 5 m
const HILL_NEAR = 60, HILL_TOL = 2;                                   // as the HK tool: hills 60 m or more away, 2 m tolerance
const BRE_ANGLE = 25, BRE_WIN = 2.0, BRE_REACH = 60;                  // BRE 25 degree line, assumed window centre 2 m up, facades within 60 m
const ROAD = {
  'Motorway': { w: 14, en: 'Motorway', rank: 1 },
  'A road': { w: 10, en: 'A road', rank: 2 },
  'B road': { w: 8, en: 'B road', rank: 3 },
  'Minor road': { w: 6, en: 'Minor road', rank: 4 },
  'Service road': { w: 3.5, en: 'Service road', rank: 5 },
  'Path': { w: 2, en: 'Path', rank: 6, dash: true },
  'Tunnel': { w: 0, en: 'Tunnel (not drawn)', rank: 9 },
};
const HW = { motorway: 'Motorway', motorway_link: 'Motorway', trunk: 'A road', trunk_link: 'A road', primary: 'A road', primary_link: 'A road',
  secondary: 'B road', secondary_link: 'B road', tertiary: 'Minor road', tertiary_link: 'Minor road', unclassified: 'Minor road', residential: 'Minor road',
  living_street: 'Minor road', service: 'Service road', pedestrian: 'Path', footway: 'Path', path: 'Path', cycleway: 'Path', steps: 'Path', bridleway: 'Path', track: 'Path' };
const SITE_RED = '#d0021b';

// ---------- language ----------
// English only since 29 Oct 2026 (Anzon): no zh page, no language switch. isZh() and T() stay as fixed English stubs
// because the copied HK modules still call them; T([en, ...]) returns the English text.
const isZh = () => false;
const T = (m) => (Array.isArray(m) ? m[0] : m);
const $ = (id) => document.getElementById(id);
let lastStatus = null, lastStatusKind = '';
function status(msg, kind = '') {
  lastStatus = msg; lastStatusKind = kind;
  const el = $('uksa-status'); el.textContent = T(msg); el.dataset.kind = kind;
}

// ---------- state ----------
const state = {
  mode: 'circle', E: 514555, N: 207095, r: 50, poly: null, draft: [], scale: 'auto', name: '', address: null,
  result: null, busy: false, stale: false, files: null, style: 'paper', shape: 'square',
};
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
const inPolyH = (x, y, P) => inPoly(x, y, P.outer) && !(P.holes || []).some((h) => inPoly(x, y, h));
// distance from the site ring R to a polygon with holes (0 if they overlap); a site inside a hole is not 'in' the polygon
function polyDistH(P, R) {
  if (inPolyH(R[0][0], R[0][1], P) || inPoly(P.outer[0][0], P.outer[0][1], R)) return 0;
  let d = Infinity;
  for (const ring of [P.outer, ...(P.holes || [])]) {
    for (const p of R) d = Math.min(d, ringDist(p[0], p[1], ring));
    for (const q of ring) d = Math.min(d, ringDist(q[0], q[1], R));
  }
  return d;
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
function polyDist(R1, R2) {
  if (inPoly(R1[0][0], R1[0][1], R2) || inPoly(R2[0][0], R2[0][1], R1)) return 0;
  let d = Infinity;
  for (const p of R1) d = Math.min(d, ringDist(p[0], p[1], R2));
  for (const p of R2) d = Math.min(d, ringDist(p[0], p[1], R1));
  return d;
}
const COMPASS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], COMPASS_ZH = ['', '', '', '', '', '', '', ''];
const compass = (b) => { const k = Math.round((((b % 360) + 360) % 360) / 45) % 8; return (COMPASS_EN[k]); };
const bearing = (dx, dy) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
// OS grid reference letters of a BNG point, e.g. TL 14555 07095
function gridRef(E, N) {
  const e100 = Math.floor(E / 1e5), n100 = Math.floor(N / 1e5);
  if (e100 < 0 || e100 > 6 || n100 < 0 || n100 > 12) return '';
  let l1 = 19 - n100 - ((19 - n100) % 5) + Math.floor((e100 + 10) / 5), l2 = ((19 - n100) * 5) % 25 + (e100 % 5);
  if (l1 > 7) l1++; if (l2 > 7) l2++;
  const pad = (v) => String(Math.floor(v % 1e5)).padStart(5, '0');
  return String.fromCharCode(l1 + 65) + String.fromCharCode(l2 + 65) + ' ' + pad(E) + ' ' + pad(N);
}

// ---------- scale and frame ----------
function siteSpan(R) { const b = ringBox(R); return Math.max(b[2] - b[0], b[3] - b[1]); }
function autoScale(R) { const need = Math.max(260, siteSpan(R) * 3.2); return FRAMES.find((F) => F >= need) || FRAMES[FRAMES.length - 1]; }
function fitsScale(R, F) { return F >= siteSpan(R) + 40; }
function frameOf(R, F) {
  const b = ringBox(R), cE = Math.round((b[0] + b[2]) / 2), cN = Math.round((b[1] + b[3]) / 2);
  return { cE, cN, s: F, E0: cE - F / 2, E1: cE + F / 2, N0: cN - F / 2, N1: cN + F / 2, k: 100 / F };
}
function currentScale(R) {
  if (state.scale === 'auto') return autoScale(R);
  const F = +state.scale; return fitsScale(R, F) ? F : autoScale(R);
}

// ---------- map ----------
const map = L.map('uksa-map', { minZoom: 6, maxZoom: 19, maxBounds: [[49.7, -7.0], [56.2, 2.2]], zoomSnap: 0.5, doubleClickZoom: false })
  .setView(toLL(state.E, state.N), 17);
map.attributionControl.setPrefix('<a href="https://leafletjs.com" rel="noopener">Leaflet</a>');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, maxNativeZoom: 19, minZoom: 6,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> contributors',
}).addTo(map);
const frameLayer = L.polygon([[0, 0]], { color: '#1d1a16', weight: 1, dashArray: '5 5', fill: false, interactive: false }).addTo(map);
const siteLayer = L.polygon([[0, 0]], { color: SITE_RED, weight: 2.5, fillColor: SITE_RED, fillOpacity: 0.10, className: 'uksa-site' }).addTo(map);
const draftLayer = L.polyline([], { color: SITE_RED, weight: 2, dashArray: '6 4' }).addTo(map);
const pin = L.marker(toLL(state.E, state.N), {
  draggable: true, keyboard: true, title: 'Drag to move the site',
  icon: L.divIcon({ className: 'uksa-pin', iconSize: [20, 20], iconAnchor: [10, 10] }),
}).addTo(map);
function rectLL(E0, N0, E1, N1, k = 8) {
  const out = [];
  for (let i = 0; i < k; i++) out.push(toLL(E0 + ((E1 - E0) * i) / k, N0));
  for (let i = 0; i < k; i++) out.push(toLL(E1, N0 + ((N1 - N0) * i) / k));
  for (let i = 0; i < k; i++) out.push(toLL(E1 - ((E1 - E0) * i) / k, N1));
  for (let i = 0; i < k; i++) out.push(toLL(E0, N1 - ((N1 - N0) * i) / k));
  return out;
}
// ---------- the site on the map: circle, or a drawn boundary (draft while drawing, handles once closed) ----------
// 29 Oct 2026: Draw site boundary | Circle choice; Undo / Cancel / Finish while drawing; once closed, drag a corner,
// click an edge midpoint to add one, right-click a corner to remove it. Every edit is checked like finishDraw.
const COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const HS = COARSE ? 34 : 20;                                           // handle hit size (px); the dot drawn inside is smaller
const CLOSE_PX = COARSE ? 26 : 14;                                     // how near the first corner a click closes the shape
const rubberLayer = L.polyline([], { color: SITE_RED, weight: 1.5, dashArray: '2 5', opacity: 0.8, interactive: false }).addTo(map);
const draftFill = L.polygon([[0, 0]], { stroke: false, fillColor: SITE_RED, fillOpacity: 0.06, interactive: false }).addTo(map);
const draftPts = L.layerGroup().addTo(map);
const handles = L.layerGroup().addTo(map);
let handleDragAt = 0;
const drafting = () => state.mode === 'draw' && !state.poly;
function perimeter(R, closed = true) { let s = 0; for (let i = 0, n = R.length; i < n - (closed ? 0 : 1); i++) { const p = R[i], q = R[(i + 1) % n]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); } return s; }
function segCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function selfCrosses(R) {
  const n = R.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segCross(R[i], R[(i + 1) % n], R[j], R[(j + 1) % n])) return true;
  }
  return false;
}
// the checks every boundary passes (drawn, edited or set by script): null when fine, else the message
function ringProblem(P) {
  if (!P || P.length < 3) return 'A site needs at least three corners.';
  if (Math.abs(area(P)) < 20) return 'That shape is too small (under 20 m²). Add corners further apart.';
  if (siteSpan(P) > 700) return 'That shape is over 700 m across. Draw a smaller site.';
  if (selfCrosses(P)) return 'The edges of that shape cross each other. Move a corner so they do not.';
  return null;
}
const ccw = (P) => (area(P) < 0 ? P.slice().reverse() : P.slice());
function drawSite() {
  const R = siteRing(), dr = drafting();
  $('uksa-map').classList.toggle('is-drawing', dr);
  draftLayer.setLatLngs(dr ? state.draft.map(([E, N]) => toLL(E, N)) : []);
  draftFill.setLatLngs(dr && state.draft.length >= 3 ? state.draft.map(([E, N]) => toLL(E, N)) : [[0, 0]]);
  if (!dr) rubberLayer.setLatLngs([]);
  draftPts.clearLayers();
  if (dr) state.draft.forEach(([E, N], i) => L.circleMarker(toLL(E, N), { radius: i === 0 ? (COARSE ? 9 : 6) : (COARSE ? 5 : 3.5), color: SITE_RED, weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(draftPts));
  renderHandles();
  if (!R || R.length < 3) { siteLayer.setLatLngs([[0, 0]]); frameLayer.setLatLngs([[0, 0]]); updateReadout(); return; }
  siteLayer.setLatLngs(R.map(([E, N]) => toLL(E, N)));
  const f = frameOf(R, currentScale(R));
  frameLayer.setLatLngs(rectLL(f.E0, f.N0, f.E1, f.N1));
  const c = centroid(R); pin.setLatLng(toLL(c[0], c[1]));
  updateReadout();
}
// live redraw while a handle is dragged (no handle rebuild: that would drop the drag)
function liveSite() {
  const R = state.poly; siteLayer.setLatLngs(R.map(([e, n]) => toLL(e, n)));
  if (R.length >= 3 && siteSpan(R) <= 2000) { const f = frameOf(R, currentScale(R)); frameLayer.setLatLngs(rectLL(f.E0, f.N0, f.E1, f.N1)); }
  updateReadout();
}
function renderHandles() {
  handles.clearLayers();
  if (!(state.mode === 'draw' && state.poly)) return;
  const P = state.poly, n = P.length, icon = (cls) => L.divIcon({ className: cls, iconSize: [HS, HS], iconAnchor: [HS / 2, HS / 2] });
  let before = null, active = -1;
  const start = () => { before = state.poly.map((p) => p.slice()); state.poly = state.poly.map((p) => p.slice()); handles.eachLayer((m) => { if (m.options.mid) m.setOpacity(0); }); };
  const move = (ev) => { const [E, N] = toEN(ev.latlng.lat, ev.latlng.lng); state.poly[active] = [E, N]; liveSite(); };
  const end = () => { handleDragAt = Date.now(); commitEdit(before, 'Corner moved.'); };
  P.forEach(([E, N], i) => {
    const m = L.marker(toLL(E, N), { draggable: true, keyboard: false, icon: icon('uksa-vh'), title: 'Drag to move this corner', zIndexOffset: 1000 });
    m.on('dragstart', () => { active = i; start(); });
    m.on('drag', move); m.on('dragend', end);
    m.on('contextmenu', (ev) => {
      L.DomEvent.preventDefault(ev.originalEvent);
      if (state.poly.length <= 3) { status('A site needs at least three corners.', 'err'); return; }
      const b = state.poly.map((p) => p.slice()); state.poly = b.map((p) => p.slice()); state.poly.splice(i, 1); commitEdit(b, 'Corner removed.');
    });
    m.addTo(handles);
  });
  P.forEach((p, i) => {
    const q = P[(i + 1) % n], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const m = L.marker(toLL(...mid), { draggable: true, keyboard: false, icon: icon('uksa-mh'), title: 'Click to add a corner here, or drag it', mid: true });
    m.on('click', () => {
      if (Date.now() - handleDragAt < 200) return;
      const b = state.poly.map((x) => x.slice()); state.poly = b.map((x) => x.slice()); state.poly.splice(i + 1, 0, mid.slice()); commitEdit(b, 'Corner added. Drag it into place.');
    });
    m.on('dragstart', () => { start(); state.poly.splice(i + 1, 0, mid.slice()); active = i + 1; });
    m.on('drag', move); m.on('dragend', end);
    m.addTo(handles);
  });
}
function commitEdit(before, okMsg) {
  const bad = ringProblem(state.poly);
  if (bad) { state.poly = before; state.lastPoly = before; status(bad + ' The last change was undone.', 'err'); }
  else { state.poly = ccw(state.poly); state.lastPoly = state.poly; markStale(); status(okMsg + ' Press Analyse site when it is right.'); }
  drawSite(); syncButtons();
}
const fmtArea = (a) => (a >= 10000 ? T(`${(a / 10000).toFixed(2)} ha`) : T(`${Math.round(a).toLocaleString('en-GB')} m²`));
const fmtAreaBoth = (a) => `${Math.round(a).toLocaleString('en-GB')} m² (${(a / 10000).toFixed(a < 1000 ? 3 : 2)} ha)`;
const fmtLen = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m).toLocaleString('en-GB')} m`);
function updateReadout() {
  const R = siteRing();
  if (drafting()) {
    const D = state.draft;
    $('uksa-area').textContent = D.length >= 3 ? fmtAreaBoth(Math.abs(area(D))) : '-';
    $('uksa-perim').textContent = D.length >= 2 ? fmtLen(perimeter(D, D.length >= 3)) : '-';
  } else if (R && R.length >= 3) {
    $('uksa-area').textContent = fmtAreaBoth(Math.abs(area(R)));
    $('uksa-perim').textContent = fmtLen(perimeter(R));
  } else { $('uksa-area').textContent = '-'; $('uksa-perim').textContent = '-'; }
  if (!R || R.length < 3) {
    const k = state.draft.length;
    $('uksa-coords').textContent = T(k === 0 ? 'Click the map to place the first corner.' : k < 3 ? `${k} corner${k > 1 ? 's' : ''}. Keep clicking the corners of the site.` : `${k} corners. Click the first corner, or press Finish, to close the shape.`);
    return;
  }
  const c = centroid(R), ll = toLL(c[0], c[1]), s = currentScale(R);
  $('uksa-coords').textContent = `${gridRef(c[0], c[1])}  ·  E ${c[0].toFixed(0)} N ${c[1].toFixed(0)}  ·  ${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}  ·  ${fmtArea(Math.abs(area(R)))}  ·  ${T(`frame ${s} m`)}`;
}
function markStale() {
  if (state.result && !state.stale) { state.stale = true; status('The site has changed. Press Analyse site again.'); }
  if (view3) { view3.dispose(); view3 = null; if ($('uksa-3d')) $('uksa-3d').hidden = true; }
  syncButtons();
}
function syncButtons() {
  const R = siteRing(), ok = R && R.length >= 3, dr = drafting(), closed = state.mode === 'draw' && !!state.poly;
  $('uksa-run').disabled = state.busy || !ok;
  for (const id of ['uksa-pdf', 'uksa-pdf2', 'uksa-png', 'uksa-zip', 'uksa-explode', 'uksa-dxf', 'uksa-svg']) if ($(id)) $(id).disabled = !state.result || state.stale || state.busy;
  document.querySelectorAll('[data-v3]').forEach((b) => { b.disabled = !state.result || state.stale || state.busy; b.title = b.disabled ? T('Press Analyse site first') : ''; });
  document.querySelectorAll('[data-r]').forEach((b) => b.setAttribute('aria-pressed', String(state.mode === 'circle' && +b.dataset.r === state.r)));
  document.querySelectorAll('[data-mode]').forEach((b) => { const on = b.dataset.mode === state.mode; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  $('uksa-drawpanel').hidden = state.mode !== 'draw';
  $('uksa-circlepanel').hidden = state.mode !== 'circle';
  $('uksa-drawhint').hidden = !dr; $('uksa-edithint').hidden = !closed;
  $('uksa-finish').hidden = !dr; $('uksa-finish').disabled = state.draft.length < 3;
  $('uksa-undo').hidden = !dr; $('uksa-undo').disabled = state.draft.length === 0;
  $('uksa-cancel').hidden = !dr;
  $('uksa-clear').hidden = !closed;
}
function setCentre(E, N, { pan = false } = {}) {
  E = Math.min(BOUNDS.E[1], Math.max(BOUNDS.E[0], E)); N = Math.min(BOUNDS.N[1], Math.max(BOUNDS.N[0], N));
  state.E = E; state.N = N;
  if (state.mode === 'draw' && state.poly) {
    const c = centroid(state.poly); state.poly = state.poly.map(([x, y]) => [x + E - c[0], y + N - c[1]]); state.lastPoly = state.poly;
  } else if (drafting()) { state.draft = []; state.prev = null; state.mode = 'circle'; }
  else { state.mode = 'circle'; state.poly = null; state.draft = []; }
  drawSite(); syncButtons(); markStale();
  if (pan) map.setView(toLL(E, N), Math.max(map.getZoom(), 17));
}
function setRadius(r) { state.mode = 'circle'; state.poly = null; state.draft = []; state.prev = null; state.r = r; drawSite(); syncButtons(); markStale(); fitFrame(); }
// script entry (tests): same checks as drawing; returns null when set, else the message
function setPolygon(pts) {
  const bad = ringProblem(pts); if (bad) { status(bad, 'err'); return bad; }
  state.mode = 'draw'; state.poly = ccw(pts.map((p) => [+p[0], +p[1]])); state.lastPoly = state.poly; state.draft = []; state.prev = null;
  drawSite(); syncButtons(); markStale(); fitFrame(); return null;
}
function fitFrame() { const b = frameLayer.getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [20, 20], maxZoom: 18 }); }

pin.on('drag', (ev) => {
  const [E, N] = toEN(ev.latlng.lat, ev.latlng.lng);
  state.E = E; state.N = N;
  if (state.mode === 'draw' && state.poly) { const c = centroid(state.poly); state.poly = state.poly.map(([x, y]) => [x + E - c[0], y + N - c[1]]); state.lastPoly = state.poly; handles.clearLayers(); }
  const R = siteRing(); if (R && R.length >= 3) { siteLayer.setLatLngs(R.map(([e, n]) => toLL(e, n))); const f = frameOf(R, currentScale(R)); frameLayer.setLatLngs(rectLL(f.E0, f.N0, f.E1, f.N1)); }
  updateReadout(); markStale();
});
pin.on('dragend', drawSite);
map.on('click', (ev) => {
  if (Date.now() - handleDragAt < 200) return;                        // the click that ends a handle drag
  const [E, N] = toEN(ev.latlng.lat, ev.latlng.lng);
  if (drafting()) {
    if (state.draft.length >= 3) {
      const p0 = map.latLngToContainerPoint(toLL(...state.draft[0]));
      if (p0.distanceTo(ev.containerPoint) < CLOSE_PX) { finishDraw(); return; }
    }
    state.draft.push([E, N]); drawSite(); syncButtons(); return;
  }
  state.address = null;
  setCentre(E, N);
});
map.on('mousemove', (ev) => {
  if (!drafting() || !state.draft.length) return;
  const pts = [toLL(...state.draft[state.draft.length - 1]), ev.latlng];
  if (state.draft.length >= 2) pts.push(toLL(...state.draft[0]));
  rubberLayer.setLatLngs(pts);
});
map.on('mouseout', () => rubberLayer.setLatLngs([]));
function finishDraw() {
  if (state.draft.length < 3) return;
  const P = ccw(state.draft), bad = ringProblem(P);
  if (bad) { status(bad, 'err'); return; }
  state.poly = P; state.lastPoly = P; state.draft = []; state.prev = null; drawSite(); syncButtons(); markStale(); fitFrame();
  status('Boundary closed. Drag the corners to adjust it, then press Analyse site.');
}
function undoCorner() {
  if (!drafting() || !state.draft.length) return;
  state.draft.pop(); drawSite(); syncButtons();
  status(state.draft.length ? 'Last corner removed.' : 'All corners removed. Click the map to start again.');
}
function cancelDraw() {
  if (!drafting()) return;
  const p = state.prev; state.draft = []; state.prev = null;
  if (p && p.poly) { state.mode = 'draw'; state.poly = p.poly; } else { state.mode = 'circle'; state.poly = null; }
  drawSite(); syncButtons();
  status(state.mode === 'circle' ? 'Drawing cancelled. The circle is back.' : 'Drawing cancelled. Your last boundary is back.');
}
function startDraft() {
  state.prev = { poly: state.mode === 'draw' ? state.poly : null };
  state.mode = 'draw'; state.poly = null; state.draft = []; drawSite(); syncButtons();
  status('Click each corner of your site on the map. Click the first corner again, or press Finish, to close it.');
}
function chooseMode(m) {
  if (m === state.mode) return;
  if (m === 'circle') {
    if (state.mode === 'draw' && state.poly) { const c = centroid(state.poly); state.E = c[0]; state.N = c[1]; }
    setRadius(state.r); status('Circle of radius ' + state.r + ' m. Pick another radius, or drag the dot to move it.'); return;
  }
  if (state.lastPoly) {                                                // back to the boundary drawn before
    state.mode = 'draw'; state.poly = state.lastPoly; state.draft = []; state.prev = null; drawSite(); syncButtons(); markStale(); fitFrame();
    status('Your last boundary. Drag a corner to reshape it, or press Redraw to start again.'); return;
  }
  startDraft();
}
document.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => setRadius(+b.dataset.r)));
document.querySelectorAll('[data-mode]').forEach((b) => {
  b.addEventListener('click', () => chooseMode(b.dataset.mode));
  b.addEventListener('keydown', (ev) => {                              // radio group: arrows move the choice
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
    ev.preventDefault(); const m = state.mode === 'draw' ? 'circle' : 'draw'; chooseMode(m); document.querySelector(`[data-mode="${m}"]`).focus();
  });
});
$('uksa-finish').addEventListener('click', finishDraw);
$('uksa-undo').addEventListener('click', undoCorner);
$('uksa-cancel').addEventListener('click', cancelDraw);
$('uksa-clear').addEventListener('click', startDraft);
document.addEventListener('keydown', (ev) => {
  if (!drafting()) return;
  const t = ev.target, tag = t && t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
  if (ev.key === 'Backspace' || ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z')) { if (state.draft.length) { ev.preventDefault(); undoCorner(); } }
  else if (ev.key === 'Escape') { ev.preventDefault(); cancelDraw(); }
  else if (ev.key === 'Enter' && tag !== 'BUTTON' && state.draft.length >= 3) { ev.preventDefault(); finishDraw(); }
});
if (COARSE) {                                                          // touch screens: tap, no right-click
  $('uksa-drawhint').textContent = 'Tap each corner of the site on the map. Tap the first corner, or Finish, to close it.';
  $('uksa-edithint').textContent = 'Drag a corner to reshape the site. Tap a small dot on an edge to add a corner.';
}
$('uksa-scale').addEventListener('change', (e) => { state.scale = e.target.value; drawSite(); markStale(); fitFrame(); });
$('uksa-name').addEventListener('input', (e) => { state.name = e.target.value.trim(); if (state.result && !state.stale) drawSheet(); });

// ---------- search: postcodes.io (ONS Postcode Directory, OS Open Names places) ----------
const PC_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
async function search(q) {
  const nums = (q.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (nums.length === 2 && /^[\s\d.,\-NEne]+$/.test(q)) {               // coordinates: lat, lon or BNG E, N
    let [a, b] = nums, E, N;
    if (Math.abs(a) > 1000 && Math.abs(b) > 1000) { E = a; N = b; } else if (Math.abs(a) < 90 && Math.abs(b) < 180) { [E, N] = toEN(a, b); } else return;
    state.address = null; setCentre(E, N, { pan: true }); return;
  }
  const list = $('uksa-results'); list.innerHTML = ''; list.hidden = true;
  status('Searching...');
  try {
    let hits = [];
    if (PC_RE.test(q.trim())) {
      const j = await UK.fetchT(`https://api.postcodes.io/postcodes/${encodeURIComponent(q.trim())}`, { ms: 15000, tries: 1 }).catch(() => null);
      const r = j && j.result;
      if (r && r.eastings) hits.push({ en: `${r.postcode}, ${[r.admin_ward, r.admin_district].filter(Boolean).join(', ')}`, name: '', E: r.eastings, N: r.northings, kind: 'postcode', district: r.admin_district });
    }
    if (!hits.length) {
      const [pl, pc] = await Promise.all([
        UK.fetchT(`https://api.postcodes.io/places?q=${encodeURIComponent(q)}&limit=8`, { ms: 15000, tries: 1 }).catch(() => null),
        /\d/.test(q) ? UK.fetchT(`https://api.postcodes.io/postcodes?q=${encodeURIComponent(q)}&limit=5`, { ms: 15000, tries: 1 }).catch(() => null) : null,
      ]);
      for (const r of (pc && pc.result) || []) if (r.eastings) hits.push({ en: `${r.postcode}, ${r.admin_district}`, name: '', E: r.eastings, N: r.northings, kind: 'postcode', district: r.admin_district });
      for (const r of (pl && pl.result) || []) {
        if (r.country && r.country !== 'England') continue;
        const where = [r.district_borough || r.county_unitary, r.region].filter(Boolean).join(', ');
        hits.push({ en: `${r.name_1} (${r.local_type}), ${where}`, name: r.name_1, E: r.eastings, N: r.northings, kind: r.local_type, district: r.district_borough || r.county_unitary });
      }
    }
    if (!hits.length) { status('Nothing found in England. Try a postcode or a town or village name, or click the map.', 'err'); return; }
    hits.forEach((h) => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = (h.en);
      b.addEventListener('click', () => pick(h));
      li.appendChild(b); list.appendChild(li);
    });
    list.hidden = false;
    status(`${hits.length} found. Pick one.`);
  } catch (e) {
    console.warn(e);
    status('The search did not answer. Click the map instead, or try again.', 'err');
  }
}
function pick(h) {
  $('uksa-results').hidden = true;
  state.address = h;
  if (!$('uksa-name').value && h.name) { $('uksa-name').value = h.name; state.name = h.name; }
  setCentre(h.E, h.N, { pan: true });
  status('Placed. Set the site size or draw the boundary, then press Analyse site.');
}
$('uksa-search').addEventListener('submit', (ev) => { ev.preventDefault(); const q = $('uksa-q').value.trim(); if (q) search(q); });

// ---------- sun (NOAA, as the HK tool); clock time GMT, or BST between the last Sundays of March and October ----------
function dayOfYear(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1; }
function lastSunday(y, m) { const d = new Date(Date.UTC(y, m, 0)); return d.getUTCDate() - d.getUTCDay(); }
function tzOf(m, d) { const a = [3, lastSunday(YEAR, 3)], b = [10, lastSunday(YEAR, 10)]; const v = m * 100 + d; return v >= a[0] * 100 + a[1] && v < b[0] * 100 + b[1] ? 1 : 0; }
// NOAA Solar Calculator equations (Meeus, Astronomical Algorithms), about 0.01 deg; the HK tool's shorter fractional-year series
// is up to 0.4 deg out near the equinoxes, which matters for 21 March here
function sunPos(lat, lon, hour, month = 12, day = 21) {
  const tz = tzOf(month, day), rad = Math.PI / 180;
  const jd = Date.UTC(YEAR, month - 1, day) / 864e5 + 2440587.5 + (hour - tz) / 24, T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360, M = 357.52911 + T * (35999.05029 - 0.0001537 * T), e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * rad) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * rad) * 0.000289;
  const om = 125.04 - 1934.136 * T, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * rad);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60, eps = eps0 + 0.00256 * Math.cos(om * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lam * rad)), y = Math.tan((eps / 2) * rad) ** 2;
  const eqt = 4 / rad * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad) + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad) - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad));
  const tst = (((hour * 60 + eqt + 4 * lon - 60 * tz) % 1440) + 1440) % 1440, ha = (tst / 4 - 180) * rad, la = lat * rad;
  const cz = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha);
  const alt = 90 - (Math.acos(Math.max(-1, Math.min(1, cz))) * 180) / Math.PI;
  const az = ((Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(decl) * Math.cos(la)) * 180) / Math.PI + 180) % 360;
  return { alt, az, tz };
}
// grid bearing of true north at a point (BNG is a transverse Mercator on 2 deg W: about -1.5 to +3 deg across England)
function trueNorthGrid(E, N) {
  const [lat, lon] = toLL(E, N), a = toEN(lat - 0.002, lon), b = toEN(lat + 0.002, lon);
  const br = bearing(b[0] - a[0], b[1] - a[1]); return br > 180 ? br - 360 : br;
}

// ---------- loading ----------
let v3d = null, view3 = null;
function styleLabels() {
  const sel = $('uksa-style'); if (!sel || !board.STYLES) return;
  for (const st of board.STYLES) { const o = sel.querySelector(`option[value="${st.id}"]`); if (o) o.textContent = T(st.en); }
  const sh = $('uksa-shape'); if (sh) { sh.options[0].textContent = T('Square'); sh.options[1].textContent = T('Round'); }
  const sc = $('uksa-scale'); if (sc) for (const o of sc.options) o.textContent = o.value === 'auto' ? T('Auto') : T(`${o.value} m`);
  document.querySelectorAll('[data-r]').forEach((b) => { b.textContent = T(`r ${b.dataset.r} m`); });
}
const soft = (p) => p.catch((e) => { console.warn(e); return { error: String((e && e.message) || e) }; });
// terrain: the 5 m grid (GeoServer resample of the 1 m DTM) over the frame + 1.5 km, with the 1 m DTM used where it is loaded
function demFrom(t5, t1) {
  const nx = t5.W, ny = t5.H, cell = t5.rx, xa = t5.x0 + cell / 2, ya = t5.y1 - (ny - 0.5) * cell;
  const z = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = t5.data[(ny - 1 - j) * nx + i];
  // 1 m block means where the 1 m DTM covers a 5 m node
  if (t1) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const E = xa + i * cell, N = ya + j * cell, ci = Math.floor(E - t1.x0), cj = Math.floor(t1.y1 - N);
      if (ci < 2 || cj < 2 || ci >= t1.W - 2 || cj >= t1.H - 2) continue;
      let s = 0, n = 0; for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) { const q = t1.data[(cj + v) * t1.W + ci + u]; if (Number.isFinite(q)) { s += q; n++; } }
      if (n >= 6) z[j * nx + i] = s / n;
    }
  }
  // gaps (no LiDAR, e.g. water bodies or the edge of England): filled from the neighbours
  let gaps = 0; for (const v of z) if (!Number.isFinite(v)) gaps++;
  const gapPct = (100 * gaps) / z.length;
  for (let pass = 0; pass < 60 && gaps; pass++) {
    const src = z.slice(); gaps = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (Number.isFinite(src[k])) continue;
      let s = 0, n = 0;
      for (const [u, v] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const ii = i + u, jj = j + v; if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && Number.isFinite(src[jj * nx + ii])) { s += src[jj * nx + ii]; n++; } }
      if (n) z[k] = s / n; else gaps++;
    }
  }
  if (gaps) { let s = 0, n = 0; for (const v of z) if (Number.isFinite(v)) { s += v; n++; } const m = n ? s / n : 0; for (let k = 0; k < z.length; k++) if (!Number.isFinite(z[k])) z[k] = m; }
  let zmax = -Infinity; for (const v of z) if (v > zmax) zmax = v;
  const h5 = (E, N) => {
    let fx = (E - xa) / cell, fy = (N - ya) / cell;
    fx = Math.min(nx - 1.0001, Math.max(0, fx)); fy = Math.min(ny - 1.0001, Math.max(0, fy));
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * nx + i;
    return (z[k] * (1 - u) + z[k + 1] * u) * (1 - v) + (z[k + nx] * (1 - u) + z[k + nx + 1] * u) * v;
  };
  let h = h5;
  if (t1) {                                                    // 1 m bilinear inside the LiDAR window, 5 m elsewhere
    const W = t1.W, H = t1.H, d = t1.data, X0 = t1.x0 + 0.5, Y1 = t1.y1 - 0.5;
    h = (E, N) => {
      const fx = E - X0, fy = Y1 - N;
      if (fx < 0 || fy < 0 || fx >= W - 1 || fy >= H - 1) return h5(E, N);
      const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * W + i;
      const a = d[k], b = d[k + 1], c = d[k + W], e = d[k + W + 1];
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(e))) return h5(E, N);
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
    };
  }
  return { xa, ya, xb: xa + (nx - 1) * cell, yb: ya + (ny - 1) * cell, nx, ny, z, h, zmax, cell, tiles: 1, gapPct };
}
async function analyse() {
  if (state.busy) return;
  const R = siteRing(); if (!R || R.length < 3) return;
  state.busy = true; state.files = null; syncButtons();
  if (view3) { view3.dispose(); view3 = null; } if ($('uksa-3d')) $('uksa-3d').hidden = true;
  document.querySelectorAll('[data-v3]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  const t0 = performance.now();
  try {
    const s = currentScale(R), f = frameOf(R, s);
    if (state.scale !== 'auto' && s !== +state.scale) status(`The site does not fit a ${state.scale} m frame; using ${s} m.`);
    const LB = s <= 400 ? 200 : s <= 600 ? 150 : 100;           // LiDAR buildings loaded this far round the frame (shadow casters)
    const lw = [f.E0 - LB, f.N0 - LB, f.E1 + LB, f.N1 + LB];
    const tw = [f.E0 - TERRAIN_BUF, f.N0 - TERRAIN_BUF, f.E1 + TERRAIN_BUF, f.N1 + TERRAIN_BUF];
    const c = centroid(R), [lat, lon] = toLL(c[0], c[1]);
    // QA round 2 (29 Oct): stop early outside England. One quick point query (no local planning authority = not England),
    // so Edinburgh or Cardiff never reach the LiDAR and noise services (they failed there with 'LiDAR grids differ').
    // If the planning service is down, carry on: the LiDAR and authority checks below still apply.
    status('Checking the site is in England...');
    const inEng = await UK.lpaAt(lat, lon).catch(() => null);
    if (inEng === false) throw Object.assign(new Error(T('the site centre is not in an English local planning authority: the tool covers England only')), { outside: true });
    status('Loading LiDAR, terrain, planning, flood, noise, habitats, wind and transport...');
    const box = [f.E0, f.N0, f.E1, f.N1];
    const borderP = soft(UK.fetchT(BORDER_URL.href, { ms: 15000 }));
    const lidarP = Promise.all(['dtm', 'fz', 'lz'].map((k) => UK.wcs(k, ...lw, { ms: 90000 })));
    const t5P = UK.wcs('dtm', ...tw, { scale: 0.2, ms: 90000 });
    const planP = soft(UK.planning([f.E0 - 100, f.N0 - 100, f.E1 + 100, f.N1 + 100], toLL, toEN));
    const lpaP = soft(UK.planAuthority(lat, lon));
    const habP = soft(UK.habitats(box));
    const nzP = soft(Promise.all(['road16', 'roadN', 'rail16', 'railN'].map((k) => UK.wcs(k, f.E0 - 5, f.N0 - 5, f.E1 + 5, f.N1 + 5, { ms: 60000 }).catch((e) => ({ error: String(e.message || e) })))));
    const windP = soft(UK.windRose(lat, lon));
    const napP = soft(UK.naptan(NAPTAN_BASE, c[0], c[1], 2500));
    const ll0 = toLL(f.E0 - 300, f.N0 - 300), ll1 = toLL(f.E1 + 300, f.N1 + 300);
    // OS Open Roads: the frame plus 300 m (drawing) and the site plus 1.2 km (the 10 minute walk at 80 m a minute, with slack)
    const sb = ringBox(R), rb = [Math.min(f.E0 - 300, sb[0] - 1200), Math.min(f.N0 - 300, sb[1] - 1200), Math.max(f.E1 + 300, sb[2] + 1200), Math.max(f.N1 + 300, sb[3] + 1200)];
    const roadsP = soft(UK.openRoads(ROADS_BASE, ...rb));
    const osmP = soft(UK.overpass(ll0[0].toFixed(5), ll0[1].toFixed(5), ll1[0].toFixed(5), ll1[1].toFixed(5)));
    let dtm, fz, lz, t5;
    try { [[dtm, fz, lz], t5] = await Promise.all([lidarP, t5P]); }
    catch (e) { if ((await lpaP) === null) throw Object.assign(new Error(T('the site centre is not in an English local planning authority: the tool covers England only')), { outside: true }); throw e; }
    // outside the LiDAR coverage (Wales, Scotland, the sea) the EA service sends exact zeros, not 'no data': treat a pixel where
    // terrain and both surfaces are all exactly 0 as missing (QA round 1, F4: Cardiff and the Channel got a full false board)
    let okPx = 0;
    for (let k = 0; k < dtm.data.length; k++) {
      if (dtm.data[k] === 0 && fz.data[k] === 0 && lz.data[k] === 0) { dtm.data[k] = NaN; fz.data[k] = NaN; lz.data[k] = NaN; }
      if (Number.isFinite(dtm.data[k])) okPx++;
    }
    for (let k = 0; k < t5.data.length; k++) if (t5.data[k] === 0) t5.data[k] = NaN;
    if (okPx < dtm.data.length * 0.5) throw Object.assign(new Error(T('no LiDAR here: the Environment Agency LiDAR covers England only, so this tool cannot analyse sites in Wales, Scotland or at sea')), { outside: true });
    status('Finding buildings in the LiDAR...');
    await new Promise((r) => setTimeout(r, 0));
    let fp;
    try { fp = UK.footprints(dtm, fz, lz); }
    catch (e) { if ((await lpaP) === null) throw Object.assign(new Error(T('the site centre is not in an English local planning authority: the tool covers England only')), { outside: true }); throw e; }
    const dem = demFrom(t5, dtm);
    status('Waiting for planning, flood, noise and roads...');
    const [plan, lpa, hab, nz, wind, nap, osm, roads] = await Promise.all([planP, lpaP, habP, nzP, windP, napP, osmP, roadsP]);
    if (lpa === null) throw Object.assign(new Error(T('the site centre is not in an English local planning authority: the tool covers England only')), { outside: true });
    const tFetch = performance.now() - t0;
    status('Working out shadows, levels and constraints...');
    await new Promise((r) => setTimeout(r, 0));
    const extra = { plan, lpa, hab, nz, wind, nap, osm, roads, canopy: fp.canopy };
    state.result = compute({ R, f, fp, dem, extra, dtm1: dtm });
    state.result.border = nearBorder(await borderP, f);
    state.result.h = dem.h; state.result.dem = dem;
    // coverage of the council datasets ('none found' vs 'no data published'), after the main results so it never holds them up
    await coverage(state.result);
    const tBase = performance.now() - t0;
    status('Working out sunlight hours, walking times and sky view...');
    await new Promise((r) => setTimeout(r, 0));
    try { Object.assign(state.result, await AN.computeExtra3(state.result, walkInput(state.result), ctx3)); }
    catch (e) { console.error(e); for (const k of ['sunh', 'walk', 'svf']) if (!state.result[k]) state.result[k] = { error: String(e.message || e) }; }
    state.result.timing = { fetch: tFetch, base: tBase, total: performance.now() - t0 };
    state.stale = false;
    drawSheet();
    const m = state.result;
    const miss = Object.entries(m.extra).filter(([k, v]) => v && v.error && k !== 'osm').map(([k]) => k).concat(['sunh', 'svf'].filter((k) => !m[k] || m[k].error));
    const rdOk = m.extra.roads && !m.extra.roads.error, osmOk = m.extra.osm && !m.extra.osm.error;
    const osmNote = !rdOk && !osmOk ? ' Neither OS Open Roads nor OpenStreetMap loaded, so no roads or names.'
      : !osmOk ? ' Roads from OS Open Roads; OpenStreetMap (footpaths, building names) did not answer.' : '';
    status(`Board ready: ${m.inFrame} LiDAR blocks, ${s} m frame, in ${(m.timing.total / 1000).toFixed(1)} s.` + (miss.length ? ` Not loaded: ${miss.join(', ')}.` : '') + osmNote, 'ok');
  } catch (e) {
    console.error(e);
    if (e.outside) status(`No analysis: ${e.message}.`, 'err');
    else status(`Could not load the data (${e.message}). The government service may be busy: please try again in a minute.`, 'err');
  } finally { state.busy = false; syncButtons(); renderStats(); }
}

// council datasets: is 'nothing here' a real 'none found', or has the council published nothing on planning.data.gov.uk?
async function coverage(res) {
  const p = res.extra.plan, lpa = res.extra.lpa;
  if (!p || p.error) return;
  const cov = {};
  const local = UK.PLAN_SETS.filter(([, , nat]) => !nat).map(([ds]) => ds);
  if (lpa && !lpa.error && lpa.orgs && lpa.orgs.length) {
    await Promise.all(local.map(async (ds) => {
      const st = p.sets[ds]; if (!st || st.error) return;
      if (st.items.length) { cov[ds] = true; return; }
      try { cov[ds] = await UK.publishes(ds, lpa.orgs); } catch (e) { cov[ds] = null; }
    }));
  }
  res.planCov = cov;
  if (res.plan) res.plan.cov = cov;
}

// QA round 2 (29 Oct): a frame within 1 km of England's land border (ONS BUC is generalised by a few hundred metres) gets a
// note that the England-only layers (planning, flood, noise, habitats) are blank over the border, not clear. -> 'Wales' | 'Scotland' | null
function nearBorder(b, f, reach = 1000) {
  if (!b || b.error || !b.lines) return null;
  const x0 = f.E0 - reach, y0 = f.N0 - reach, x1 = f.E1 + reach, y1 = f.N1 + reach;
  const segHits = (a, c) => {        // segment a-c meets the box (Liang-Barsky clip)
    let t0 = 0, t1 = 1; const dx = c[0] - a[0], dy = c[1] - a[1];
    for (const [pp, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
      if (pp === 0) { if (q < 0) return false; continue; }
      const r = q / pp; if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return true;
  };
  for (const l of b.lines) for (let i = 1; i < l.pts.length; i++) if (segHits(l.pts[i - 1], l.pts[i])) return l.name;
  return null;
}

// ---------- the result object (same shape as the HK tool, plus UK layers) ----------
function cleanRing(ring) {
  const pts = [];
  for (const [E, N] of ring) { const p = pts[pts.length - 1]; if (!p || Math.hypot(p[0] - E, p[1] - N) > 0.01) pts.push([E, N]); }
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.01) pts.pop();
  return pts.length >= 3 ? pts : null;
}
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
// OS Open Roads road function -> board road class (the HK ROAD table's UK classes)
const OR_CLS = { 'Motorway': 'Motorway', 'A Road': 'A road', 'B Road': 'B road', 'Minor Road': 'Minor road', 'Local Road': 'Minor road',
  'Local Access Road': 'Service road', 'Restricted Local Access Road': 'Service road', 'Secondary Access Road': 'Service road' };
// road runs (BNG) and named building points: OS Open Roads first; OpenStreetMap only adds footpaths and building names
// (or is the whole road source if the Open Roads tiles failed and Overpass answered)
function osmLayers(osm, roads) {
  const rdOk = roads && !roads.error && Array.isArray(roads.links), osmOk = osm && !osm.error;
  if (!rdOk && !osmOk) return { runs: [], names: [], error: (roads && roads.error) || (osm && osm.error) || 'not loaded' };
  const runs = [], names = [];
  if (rdOk) for (const l of roads.links) {
    const cls = l.tunnel ? 'Tunnel' : OR_CLS[l.fn] || 'Minor road';
    runs.push({ cls, en: l.en || l.ref || '', tc: '', ref: l.ref || '', pts: l.pts, foot: '', access: '', src: 'os', fn: l.fn, fow: l.fow });
  }
  for (const el of (osmOk && osm.elements) || []) {
    if (el.type !== 'way' || !el.geometry) continue;
    const pts = el.geometry.map((g) => toEN(g.lat, g.lon)), t = el.tags || {};
    if (t.highway) {
      let cls = HW[t.highway]; if (!cls) continue;
      if (t.tunnel && t.tunnel !== 'no' && cls !== 'Path') cls = 'Tunnel';
      if (rdOk && cls !== 'Path') continue;               // Open Roads already has the roads; OSM adds paths only
      runs.push({ cls, en: t.name || t.ref || '', tc: '', ref: t.ref || '', pts, foot: t.foot || '', access: t.access || '' });
    } else if (t.building && t.name && pts.length >= 3) names.push({ name: t.name, ring: pts, c: centroid(pts) });
  }
  return { runs, names, base: rdOk ? `OS Open Roads ${roads.release || ''}`.trim() : osm.osm_base, src: rdOk ? (osmOk ? 'os+osm' : 'os') : 'osm' };
}
function compute({ R, f, fp, dem, extra = {}, dtm1 }) {
  const h = dem.h, siteC = centroid(R), siteBox = ringBox(R), siteArea = Math.abs(area(R));
  const tn = trueNorthGrid(siteC[0], siteC[1]);
  const [lat, lon] = toLL(siteC[0], siteC[1]);

  // site ground
  const step = Math.max(0.5, Math.sqrt(siteArea / 2500));
  const pts = [];
  for (let y = siteBox[1] + step / 2; y < siteBox[3]; y += step) for (let x = siteBox[0] + step / 2; x < siteBox[2]; x += step) if (inPoly(x, y, R)) pts.push([x, y, h(x, y)]);
  if (!pts.length) pts.push([siteC[0], siteC[1], h(siteC[0], siteC[1])]);
  let zmin = Infinity, zmax = -Infinity, zsum = 0;
  for (const p of pts) { zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]); zsum += p[2]; }
  const zs = zsum / pts.length;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const [x, y, z] of pts) { const dx = x - siteC[0], dy = y - siteC[1], dz = z - zs; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz; }
  const det = sxx * syy - sxy * sxy, gb = det ? (sxz * syy - syz * sxy) / det : 0, gc = det ? (syz * sxx - sxz * sxy) / det : 0;
  const grad = Math.hypot(gb, gc), fallDir = bearing(-gb, -gc);
  const spots = [];
  const ext = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([ux, uy]) => R.reduce((best, p) => (p[0] * ux + p[1] * uy > best[0] * ux + best[1] * uy ? p : best), R[0]));
  for (const p of ext) if (!spots.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3)) spots.push([p[0], p[1], h(p[0], p[1])]);
  spots.push([siteC[0], siteC[1], h(siteC[0], siteC[1]), true]);

  // OpenStreetMap (optional): roads and building names
  const osm = osmLayers(extra.osm, extra.roads);

  // buildings (LiDAR)
  const blocks = [];
  for (const b0 of fp.blocks) {
    const ring = cleanRing(b0.ring); if (!ring) continue;
    const c = centroid(ring), bb = ringBox(ring);
    const holes = (b0.holes || []).map(cleanRing).filter(Boolean);
    const inFrame = bb[2] > f.E0 && bb[0] < f.E1 && bb[3] > f.N0 && bb[1] < f.N1;
    const onSite = inPoly(c[0], c[1], R);
    blocks.push({ ring, holes, c, bb, zb: b0.zb, zt: b0.zt, H: b0.zt - b0.gmin, gmin: b0.gmin, est: false, onSite, inFrame, id: b0.id, pi: b0.tier || 1, en: '', tc: '', type: b0.tier === 2 ? 'Tower' : 'Block', area: b0.area });
  }
  // names from OpenStreetMap: a named building whose centre falls in a LiDAR block
  for (const nmB of osm.names) {
    const b = blocks.find((q) => q.bb[0] <= nmB.c[0] && q.bb[2] >= nmB.c[0] && q.bb[1] <= nmB.c[1] && q.bb[3] >= nmB.c[1] && inPoly(nmB.c[0], nmB.c[1], q.ring));
    if (b) for (const q of blocks) if (q.id === b.id && !q.en) { q.en = nmB.name; q.tc = ''; }
  }
  const frameBlocks = blocks.filter((b) => b.inFrame);
  const byB = new Map();
  let tallestOnSite = null;
  for (const b of frameBlocks) { if (!(b.c[0] > f.E0 && b.c[0] < f.E1 && b.c[1] > f.N0 && b.c[1] < f.N1)) continue; if (b.onSite) { if (!tallestOnSite || b.zt > tallestOnSite.zt) tallestOnSite = b; continue; } const o = byB.get(b.id); if (!o || b.zt > o.zt) byB.set(b.id, b); }
  const tallest = [...byB.values()].sort((a, b) => b.H - a.H).slice(0, 5).map((b, i) => {
    const base = blocks.filter((q) => q.id === b.id && q.pi === 1)[0] || b;
    const d = polyDist(base.ring, R), br = bearing(b.c[0] - siteC[0], b.c[1] - siteC[1]);
    return { n: i + 1, b, top: b.zt, H: b.H, d, br, en: b.en, tc: b.tc, est: false };
  });

  // sun, shadows and shade on the site: 12:00 clock time on the three dates
  const sun = SUN_DATES.map((dt) => {
    const sp = sunPos(lat, lon, SUN_HR, dt.m, dt.d), azG = sp.az + tn, sb = (azG + 180) % 360, rad = (sb * Math.PI) / 180;
    return { id: dt.id, m: dt.m, d: dt.d, en: dt.en, hr: SUN_HR, tz: sp.tz, alt: sp.alt, az: sp.az, azG, sb, dx: Math.sin(rad), dy: Math.cos(rad), tanA: Math.tan((sp.alt * Math.PI) / 180), ratio: 1 / Math.tan((sp.alt * Math.PI) / 180) };
  });
  const casters = blocks.filter((b) => !b.onSite);
  const terrMax = dem.zmax;
  for (const s of sun) {
    const ux = -s.dx, uy = -s.dy;
    let shaded = 0, byTerrain = 0; const who = new Map();
    for (const [px, py, pz] of pts) {
      let hit = null;
      for (const b of casters) if ((!hit || b.zt > hit.zt) && rayHits(px, py, pz, ux, uy, s.tanA, b)) hit = b;
      let terr = false;
      for (let t = HILL_NEAR; t <= TERRAIN_BUF; t += t < 300 ? 5 : 10) {
        const zr = pz + t * s.tanA; if (zr > terrMax) break;
        if (h(px + ux * t, py + uy * t) > zr + HILL_TOL) { terr = true; break; }
      }
      if (hit || terr) shaded++;
      if (terr) byTerrain++;
      if (hit) who.set(hit.id, (who.get(hit.id) || 0) + 1);
    }
    s.pct = (100 * shaded) / pts.length; s.terrPct = (100 * byTerrain) / pts.length;
    const top = [...who.entries()].sort((a, b) => b[1] - a[1])[0];
    s.mainCaster = top ? { ...casters.find((b) => b.id === top[0]), share: (100 * top[1]) / pts.length } : null;
    s.paths = [];
    for (const b of casters) {
      const Hc = b.zt - zs; if (Hc <= 0.2) continue;
      const Hb = Math.max(0, b.zb - zs), vt = Hc * s.ratio, vb = Hb * s.ratio;
      const ex = [Math.min(b.bb[0], b.bb[0] + s.dx * vt), Math.min(b.bb[1], b.bb[1] + s.dy * vt), Math.max(b.bb[2], b.bb[2] + s.dx * vt), Math.max(b.bb[3], b.bb[3] + s.dy * vt)];
      if (ex[2] < f.E0 || ex[0] > f.E1 || ex[3] < f.N0 || ex[1] > f.N1) continue;
      s.paths.push({ ring: b.ring, vb: [s.dx * vb, s.dy * vb], vt: [s.dx * vt, s.dy * vt] });
    }
  }
  for (const b of frameBlocks) {
    b.roof = 0;
    for (const [hi, s] of sun.entries()) {
      const ux = -s.dx, uy = -s.dy, pz = b.zt + 0.2;
      if (!inPoly(b.c[0], b.c[1], b.ring)) continue;
      for (const o of blocks) if (o !== b && o.zt > pz && rayHits(b.c[0], b.c[1], pz, ux, uy, s.tanA, o)) { b.roof |= 1 << hi; break; }
    }
  }

  // terrain grid over the frame: terrain shadow bits, hillshade, contours
  const gx0 = Math.floor(f.E0 / CELL) * CELL, gy0 = Math.floor(f.N0 / CELL) * CELL;
  const gnx = Math.ceil((f.E1 - gx0) / CELL) + 1, gny = Math.ceil((f.N1 - gy0) / CELL) + 1;
  const gz = new Float32Array(gnx * gny);
  for (let j = 0; j < gny; j++) for (let i = 0; i < gnx; i++) {           // 5 m cell means of the 1 m DTM, so contours are not noisy
    const x = gx0 + i * CELL, y = gy0 + j * CELL; let s = 0, n = 0;
    for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) { const q = h(x + u, y + v); if (Number.isFinite(q)) { s += q; n++; } }
    gz[j * gnx + i] = n ? s / n : h(x, y);
  }
  const sm = new Float32Array(gz.length);
  for (let j = 0; j < gny; j++) for (let i = 0; i < gnx; i++) {
    let a = 0, n = 0;
    for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) { const ii = i + u, jj = j + v; if (ii >= 0 && jj >= 0 && ii < gnx && jj < gny) { a += gz[jj * gnx + ii]; n++; } }
    sm[j * gnx + i] = a / n;
  }
  let fmin = Infinity, fmax = -Infinity; for (const v of sm) { fmin = Math.min(fmin, v); fmax = Math.max(fmax, v); }
  const relief = fmax - fmin;
  const interval = [0.5, 1, 2, 5, 10, 20, 25, 50].find((iv) => relief / iv <= 28) || 50;
  const terrShade = new Uint8Array(gnx * gny), hill = new Float32Array(gnx * gny);
  let terrCells = 0;
  for (let j = 0; j < gny; j++) for (let i = 0; i < gnx; i++) {
    const x = gx0 + i * CELL, y = gy0 + j * CELL, z = gz[j * gnx + i];
    let m = 0;
    for (const [si, s] of sun.entries()) {
      const ux = -s.dx, uy = -s.dy;
      for (let t = HILL_NEAR; t <= TERRAIN_BUF; t += t < 300 ? 5 : 10) { const zr = z + t * s.tanA; if (zr > terrMax) break; if (h(x + ux * t, y + uy * t) > zr + HILL_TOL) { m |= 1 << si; break; } }
    }
    terrShade[j * gnx + i] = m; if (m) terrCells++;
    const zl = gz[j * gnx + Math.max(0, i - 1)], zr2 = gz[j * gnx + Math.min(gnx - 1, i + 1)], zd = gz[Math.max(0, j - 1) * gnx + i], zu = gz[Math.min(gny - 1, j + 1) * gnx + i];
    const dzdx = (zr2 - zl) / (2 * CELL), dzdy = (zu - zd) / (2 * CELL);
    const lx = -Math.sin(Math.PI / 4) * Math.cos(Math.PI / 4), ly = Math.cos(Math.PI / 4) * Math.cos(Math.PI / 4), lz = Math.sin(Math.PI / 4);
    const nz = 1 / Math.hypot(dzdx, dzdy, 1), shade = (-dzdx * lx - dzdy * ly + lz) * nz;
    hill[j * gnx + i] = Math.max(0, Math.min(1, (lz - shade) / lz));
  }
  const contours = marching(sm, gnx, gny, gx0, gy0, interval, fmin, fmax);

  // roads (OS Open Roads tiles; OpenStreetMap paths when Overpass answered)
  const roadRuns = [], near = new Map(); let roadErr = osm.error || null;
  for (const r of osm.runs) {
    const pp = clipRun(r.pts, [f.E0 - 50, f.N0 - 50, f.E1 + 50, f.N1 + 50]);
    for (const part of pp) {
      if (part.length < 2) continue;
      roadRuns.push({ cls: r.cls, en: r.en, tc: '', pts: part });
      if (r.cls === 'Tunnel' || r.cls === 'Path') continue;
      let d = Infinity;
      for (let k = 0; k < part.length - 1; k++) {
        const a = part[k], b = part[k + 1];
        if (inPoly(a[0], a[1], R)) { d = 0; break; }
        for (let i = 0; i < R.length; i++) { const q = R[i], w = R[(i + 1) % R.length]; if (segsCross(a[0], a[1], b[0], b[1], q[0], q[1], w[0], w[1])) { d = 0; break; } d = Math.min(d, segDist(q[0], q[1], a[0], a[1], b[0], b[1])); }
        d = Math.min(d, ringDist(a[0], a[1], R), ringDist(b[0], b[1], R));
      }
      const edge = Math.max(0, d - ROAD[r.cls].w / 2);
      if (edge <= 30) { const key = (r.en || '') + '|' + r.cls, o = near.get(key); if (!o || edge < o.edge) near.set(key, { cls: r.cls, en: r.en, tc: '', edge, cl: d }); }
    }
  }
  const adjacent = [...near.values()].sort((a, b) => a.edge - b.edge || ROAD[a.cls].rank - ROAD[b.cls].rank).slice(0, 6);

  const res = {
    R, f, siteC, siteArea, lat, lon, tn, zs, zmin, zmax, grad, fallDir, spots, pts: pts.length, blocks, frameBlocks, inFrame: frameBlocks.length,
    est: 0, latest: 0, tallest, tallestOnSite: tallestOnSite ? { top: tallestOnSite.zt, H: tallestOnSite.H, en: tallestOnSite.en, tc: '' } : null,
    sun, grid: { gx0, gy0, gnx, gny, terrShade, hill, terrCells, gz }, contours, interval, fmin, fmax,
    roadRuns, roadErr, roadLatest: osm.base || null, adjacent, fetched: fp.blocks.length, demTiles: 1, onSite: blocks.filter((b) => b.onSite).length,
    lidar: { ...fp.stats, gapPct: dem.gapPct, window: [dtm1.x0, dtm1.y1 - dtm1.H, dtm1.x0 + dtm1.W, dtm1.y1] },
    gridRef: gridRef(siteC[0], siteC[1]), uk: true, _osmRuns: osm.runs, roadSrc: osm.src || null,
  };
  res.extra = finishExtra(extra, res);
  res.views = views(blocks, h, siteC, zs, f);
  res.plan = planResult(res.extra.plan, res);
  res.flood = floodResult(res.extra.plan, res);
  res.bre = breCheck(res, pts.map(([x, y, z]) => [x, y, z]), h);
  return res;
}
function clipRun(pts, b) {                                         // keep the parts of a polyline that come near the box
  const out = []; let cur = [];
  const inB = (p) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    if (inB(p) || (q && inB(q)) || (q && Math.max(p[0], q[0]) >= b[0] && Math.min(p[0], q[0]) <= b[2] && Math.max(p[1], q[1]) >= b[1] && Math.min(p[1], q[1]) <= b[3])) { cur.push(p); if (q && !inB(q)) { cur.push(q); out.push(cur); cur = []; } }
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out.filter((r) => r.length >= 2);
}

// ---------- the UK layers ----------
const HAB_CLASS = (m) => {
  const s = String(m || '').toLowerCase();
  if (/orchard/.test(s)) return 'orchard';
  if (/woodland|wood-pasture|parkland/.test(s)) return 'wood';
  if (/heath|bracken|moor/.test(s)) return 'heath';
  if (/fen|reedbed|marsh|bog|mudflat|saltmarsh|swamp|wetland|lake|pond/.test(s)) return 'wet';
  if (/grassland|meadow|calaminarian/.test(s)) return 'grass';
  return 'other';
};
function finishExtra(x, res) {
  const out = {}, R = res.R, f = res.f;
  out.osm = x.osm && x.osm.error ? x.osm : { ok: true, base: x.osm && x.osm.osm_base, server: x.osm && x.osm.server };
  out.roads = x.roads && x.roads.error ? x.roads : { ok: true, release: x.roads && x.roads.release, links: x.roads ? x.roads.links.length : 0, tiles: x.roads && x.roads.tiles };
  out.plan = x.plan || { error: 'no data' };
  out.lpa = x.lpa || null;
  // habitats
  if (x.hab && x.hab.error) out.green = x.hab;
  else {
    out.green = [];
    for (const ft of x.hab || []) {
      const g = ft.geometry; if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const pl of polys) { const ring = cleanRing(pl[0]); if (ring) out.green.push({ cls: HAB_CLASS(ft.properties && ft.properties.MainHabs), main: (ft.properties && ft.properties.MainHabs) || '', ring, holes: pl.slice(1).map(cleanRing).filter(Boolean) }); }
    }
  }
  // tree canopy (LiDAR) inside the frame, as a 1 m mask cut to the frame
  if (x.canopy) {
    const c = x.canopy, i0 = Math.max(0, Math.floor(f.E0 - c.x0)), i1 = Math.min(c.W, Math.ceil(f.E1 - c.x0)), j0 = Math.max(0, Math.floor(c.y1 - f.N1)), j1 = Math.min(c.H, Math.ceil(c.y1 - f.N0));
    const W = i1 - i0, H = j1 - j0, m = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) m[j * W + i] = c.m[(j0 + j) * c.W + i0 + i];
    out.canopy = { W, H, x0: c.x0 + i0, y1: c.y1 - j0, m };
  }
  // noise (Defra Round 4): road + rail LAeq,16h and Lnight on the frame's 10 m grid, combined by energy sum
  if (x.nz && x.nz.error) out.noise = x.nz;
  else if (x.nz) {
    const [r16, rN, l16, lN] = x.nz, okT = (t) => t && !t.error;
    if (!okT(r16) && !okT(l16)) out.noise = { error: (r16 && r16.error) || 'no data' };
    else {
      const g = okT(r16) ? r16 : l16, W = g.W, H = g.H, cell = g.rx;
      const at = (t, k) => (okT(t) && t.W === W && t.H === H ? t.data[k] : NaN);
      const db = (a, b) => { const A = Number.isFinite(a) && a > 0 ? 10 ** (a / 10) : 0, B = Number.isFinite(b) && b > 0 ? 10 ** (b / 10) : 0; return A + B > 0 ? 10 * Math.log10(A + B) : 0; };
      const day = new Float32Array(W * H), night = new Float32Array(W * H), road = new Float32Array(W * H), rail = new Float32Array(W * H);
      for (let k = 0; k < W * H; k++) { road[k] = at(r16, k) || 0; rail[k] = at(l16, k) || 0; day[k] = db(at(r16, k), at(l16, k)); night[k] = db(at(rN, k), at(lN, k)); }
      const sitePts = []; const sb = ringBox(R);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const E = g.x0 + (i + 0.5) * cell, N = g.y1 - (j + 0.5) * cell;
        if (E >= sb[0] - cell && E <= sb[2] + cell && N >= sb[1] - cell && N <= sb[3] + cell && (inPoly(E, N, R) || ringDist(E, N, R) <= cell * 0.71)) sitePts.push(j * W + i);
      }
      const stat = (a) => { let mx = 0, s = 0, n = 0; for (const k of sitePts) { mx = Math.max(mx, a[k]); s += a[k]; n++; } return { max: mx, mean: n ? s / n : 0 }; };
      out.noise = { W, H, x0: g.x0, y1: g.y1, cell, day, night, road, rail, site: { day: stat(day), night: stat(night), road: stat(road), rail: stat(rail) }, n: sitePts.length,
        missing: ['road16', 'roadN', 'rail16', 'railN'].filter((k, i) => !okT(x.nz[i])) };
    }
  }
  out.wind = x.wind || { error: 'no data' };
  // transport (NaPTAN snapshot): bus stops, stations, entrances, with straight-line distances to the site boundary
  if (x.nap && x.nap.error) out.rail = out.bus = x.nap;
  else if (x.nap) {
    const dist = (E, N) => (inPoly(E, N, R) ? 0 : ringDist(E, N, R));
    out.bus = x.nap.bus;
    const exits = x.nap.exits.map((e) => ({ ...e, d: dist(e.E, e.N) })).sort((a, b) => a.d - b.d);
    out.rail = { exits, stations: x.nap.stations, snapshot: x.nap.snapshot };
    out.mtr = { exits: exits.map((e) => ({ E: e.E, N: e.N, d: e.d, ref: null, station: { en: e.station.name, kind: e.station.kind } })), lr: [], stations: [], osm: null };
  }
  return out;
}
function planResult(p, res) {
  if (!p || p.error) return { error: p ? p.error : 'no data' };
  const R = res.R, out = { sets: {}, onSite: [], near: [], lpa: res.extra.lpa && !res.extra.lpa.error ? res.extra.lpa : null };
  const sp = []; const sb = ringBox(R), st = Math.max(1, Math.sqrt(res.siteArea / 400));
  for (let y = sb[1] + st / 2; y < sb[3]; y += st) for (let x = sb[0] + st / 2; x < sb[2]; x += st) if (inPoly(x, y, R)) sp.push([x, y]);
  if (!sp.length) sp.push(res.siteC);
  for (const [ds, st0] of Object.entries(p.sets)) {
    if (st0.error) { out.sets[ds] = { error: st0.error }; continue; }
    const items = st0.items.map((it) => {
      let share = 0, d = Infinity;
      if (it.polys.length) { let hit = 0; for (const [x, y] of sp) if (it.polys.some((P) => inPolyH(x, y, P))) hit++; share = hit / sp.length; for (const P of it.polys) d = Math.min(d, share > 0 ? 0 : polyDistH(P, R)); }
      for (const q of it.points) d = Math.min(d, inPoly(q[0], q[1], R) ? 0 : ringDist(q[0], q[1], R));
      return { ...it, share, d };
    });
    out.sets[ds] = { items };
    for (const it of items) if (it.share > 0 || it.d === 0) out.onSite.push(it);
  }
  return out;
}
function floodResult(p, res) {
  if (!p || p.error) return { error: p ? p.error : 'no data' };
  if (p.flood && p.flood.error) return { error: p.flood.error };
  const R = res.R, items = (p.flood && p.flood.items) || [];
  const sp = []; const sb = ringBox(R), st = Math.max(0.5, Math.sqrt(res.siteArea / 900));
  for (let y = sb[1] + st / 2; y < sb[3]; y += st) for (let x = sb[0] + st / 2; x < sb[2]; x += st) if (inPoly(x, y, R)) sp.push([x, y]);
  if (!sp.length) sp.push(res.siteC);
  const z3 = items.filter((i) => String(i.level) === '3'), z2 = items.filter((i) => String(i.level) === '2');
  let n2 = 0, n3 = 0;
  for (const [x, y] of sp) { const in3 = z3.some((i) => i.polys.some((P) => inPolyH(x, y, P))); const in2 = in3 || z2.some((i) => i.polys.some((P) => inPolyH(x, y, P))); if (in3) n3++; if (in2) n2++; }
  let d2 = Infinity; for (const i of items) for (const P of i.polys) d2 = Math.min(d2, polyDistH(P, R));
  const entry = items.map((i) => i.entry).filter(Boolean).sort().pop() || null;
  return { items, z2: (100 * n2) / sp.length, z3: (100 * n3) / sp.length, zone: n3 ? 3 : n2 ? 2 : 1, nearest: items.length ? d2 : null, entry };
}
// BRE 25 degree screening: for each point of the site, the height above the site's ground at which a new building would cut the
// 25 degree line drawn from an assumed window (2 m above the neighbour's ground) in any neighbouring facade that faces that point
// square on (the point lies in front of the facade, within its width). Facades further than 60 m are not tested.
function breCheck(res, pts, h) {
  const R = res.R, t25 = Math.tan((BRE_ANGLE * Math.PI) / 180);
  const nb = res.frameBlocks.filter((b) => !b.onSite && b.pi === 1 && polyDist(b.ring, R) <= BRE_REACH);
  const faces = [];
  for (const b of nb) {
    const ring = b.ring, ccw = area(ring) > 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length], dx = c[0] - a[0], dy = c[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 2.5) continue;
      const nx = ccw ? dy / L : -dy / L, ny = ccw ? -dx / L : dx / L;      // outward normal
      faces.push({ a, c, nx, ny, L, z: b.gmin + BRE_WIN, b });
    }
  }
  const out = []; let lim0 = Infinity; const used = new Set();
  for (const [x, y, z] of pts) {
    let lim = Infinity, by = null;
    for (const F of faces) {
      const vx = x - F.a[0], vy = y - F.a[1], d = vx * F.nx + vy * F.ny; if (d <= 0.05 || d > BRE_REACH) continue;
      const t = (vx * (F.c[0] - F.a[0]) + vy * (F.c[1] - F.a[1])) / (F.L * F.L); if (t < 0 || t > 1) continue;
      const L2 = F.z + d * t25 - z; if (L2 < lim) { lim = L2; by = F; }
    }
    out.push([x, y, Number.isFinite(lim) ? lim : null]);
    if (by) used.add(by);
    if (lim < lim0) lim0 = lim;
  }
  const lims = out.map((p) => p[2]).filter((v) => v != null).sort((a, b) => a - b);
  const centre = (() => { const [cx, cy] = res.siteC; let best = null, bd = Infinity; for (const p of out) { const d = Math.hypot(p[0] - cx, p[1] - cy); if (d < bd) { bd = d; best = p; } } return best ? best[2] : null; })();
  return { pts: out, faces: [...used].map((F) => ({ a: F.a, c: F.c, nx: F.nx, ny: F.ny, id: F.b.id, z: F.z })), neighbours: nb.map((b) => ({ id: b.id, H: b.H, d: polyDist(b.ring, R) })),
    min: lims.length ? lims[0] : null, centre, covered: lims.length / Math.max(1, out.length), angle: BRE_ANGLE, win: BRE_WIN, reach: BRE_REACH,
    step: pts.length > 1 ? Math.max(0.5, Math.sqrt(res.siteArea / 2500)) : 1 };
}

// ---------- views (as the HK tool): isovists at street level and 30 m up, sky view factor at street level ----------
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
    if (segs.length) out.push({ v: Math.round(v * 100) / 100, idx: Math.abs(v / (iv * 5) - Math.round(v / (iv * 5))) < 1e-6, segs });
  }
  return out;
}

// walking network for analyses.js: OS Open Roads (all roads except motorways and road tunnels) plus OpenStreetMap paths
// when Overpass answered; bus stops and station entrances
function walkInput(res) {
  const x = res.extra || {};
  if (!(res._osmRuns || []).length) return { error: 'no road data loaded (OS Open Roads or OpenStreetMap), so walking times are straight-line only' };
  const road = [];
  for (const r of res._osmRuns || []) {
    if (r.cls === 'Motorway' || r.cls === 'Tunnel' || /^(no|private)$/.test(r.foot) || (r.access === 'private' && r.foot !== 'yes')) continue;
    road.push({ properties: { STREETTYPE: r.cls }, geometry: { type: 'LineString', coordinates: r.pts } });
  }
  const bus = Array.isArray(x.bus) ? x.bus.map(([E, N]) => ({ geometry: { coordinates: [E, N] } })) : { error: 'no bus stops' };
  return { road, bus, pedNear: 0, src: res.roadSrc };
}

// ---------- the board ----------
import { createBoard } from './board.js';
import * as AN from './analyses.js';
import { DIAGRAMS3 } from './diagrams3.js';
const ctx3 = { fetchJSON: (u) => UK.fetchT(u), sunPos, toLL, toEN, inPoly, ringDist, segDist, centroid, ringBox, area, bearing, compass, T, isZh, CELL, HILL_TOL, TERRAIN_BUF, YEAR, TZ };
const CREDITS_EN = 'Data: Environment Agency, LiDAR Composite DTM and First and Last Return DSM 1 m (© Environment Agency copyright and/or database right 2026, all rights reserved; Open Government Licence v3.0). planning.data.gov.uk, Ministry of Housing, Communities and Local Government, with data from Historic England, Natural England, the Environment Agency and local planning authorities (Open Government Licence v3.0). Defra, Strategic noise mapping Round 4 (2022), road and rail (Open Government Licence v3.0). Natural England, Priority Habitats Inventory (England) (© Natural England, Open Government Licence v3.0). DfT, NaPTAN, snapshot 28 Oct 2026 (Open Government Licence v3.0). Wind: Open-Meteo historical weather API, ERA5 reanalysis (Copernicus Climate Change Service), CC BY 4.0. Search: postcodes.io (ONS Postcode Directory and OS Open Names; contains OS data © Crown copyright and database right 2026, Royal Mail data © Royal Mail copyright and database right 2026, ONS data © Crown copyright and database right 2026). Roads, street names and the walking network: OS Open Roads 2026-10, contains OS data © Crown copyright and database right 2026 (Open Government Licence v3.0). Footpaths and building names: © OpenStreetMap contributors (ODbL), when the Overpass API answered. Sun: NOAA solar equations. Derived drawing, provided as is. Hobby project, not official, for reference only; not a substitute for a survey or professional advice.';
const CREDITS_ZH = '';
const titleCase = (s) => (s ? String(s) : s);
const nm = (en, tc) => (en || tc || '');
const board = createBoard({
  T, isZh, compass, sunPos, fmtArea, nm, CELL, ROAD, inPoly, inPolyH, segDist, ringDist, polyDist, gridRef,
  dtmTiles: () => napIndexKeys, credits: () => T(CREDITS_EN), diagrams3: DIAGRAMS3,
});
let napIndexKeys = null;
UK.naptanIndex(NAPTAN_BASE).then((i) => { napIndexKeys = new Set(Object.keys(i.tiles)); }).catch(() => {});
function boardOpts() {
  const a = state.address, nmS = state.name || (a ? a.name || '' : '');
  return { name: nmS, address: a, drawn: new Date().toISOString().slice(0, 10), style: state.style, shape: state.shape };
}
let svgCache = null;
function drawSheet() {
  const res = state.result; if (!res) return;
  svgCache = board.boardSVG(res, boardOpts());
  $('uksa-sheet').innerHTML = svgCache;
  $('uksa-out').classList.add('has-sheet');
  renderStats();
}

// ---------- stats ----------
function renderStats() {
  const el = $('uksa-stats'), m = state.result;
  if (!m) { el.hidden = true; return; }
  const rows = [];
  const add = (en, zh, v) => rows.push(`<div><dt>${T(en)}</dt><dd>${v}</dd></div>`);
  add('Site', '', `${fmtArea(m.siteArea)} <small>${m.zmax - m.zmin < 0.05 ? T(`+${m.zmin.toFixed(1)} m AOD, level`) : T(`+${m.zmin.toFixed(1)} to +${m.zmax.toFixed(1)} m AOD`)}</small>`);
  add('Frame', '', `${T(`${m.f.s} m`)} <small>${T(state.shape === 'circle' ? 'round, every diagram' : 'square, every diagram')}</small>`);
  m.sun.forEach((s) => add(`Shade at 12:00, ${s.en}`, '', `${s.pct.toFixed(0)}% <small>${s.tz ? 'BST' : 'GMT'}</small>`));
  if (m.tallest[0]) add('Tallest nearby', '', `${m.tallest[0].H.toFixed(1)} m <small>${esc(m.tallest[0].en || T('LiDAR block'))}, +${m.tallest[0].top.toFixed(1)} m AOD</small>`);
  if (m.flood && !m.flood.error) add('Flood zone', '', `${m.flood.zone} <small>${T('planning.data.gov.uk copy')}</small>`);
  const x = m.extra || {};
  if (x.rail && !x.rail.error && x.rail.exits[0]) add('Nearest station entrance', '', `${T(`${Math.round(x.rail.exits[0].d / 10) * 10} m`)} <small>${esc(x.rail.exits[0].station.name)}, ${T('straight line')}</small>`);
  add('LiDAR blocks', '', `${m.inFrame} <small>${T('in the frame')}</small>`);
  el.innerHTML = rows.join(''); el.hidden = false;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- export ----------
function fileTag() {
  const m = state.result, base = (state.name || (state.address && state.address.name) || 'site').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'site';
  return `uk-site-analysis_${base}_E${m.siteC[0].toFixed(0)}_N${m.siteC[1].toFixed(0)}`;
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
  doc.setProperties({ title: T('UK Site Analysis') + (boardOpts().name ? ': ' + boardOpts().name : ''), subject: 'Site analysis diagram series (England)', creator: 'anzonwong.com/lab/uk-site-analysis', author: 'AW Design (hobby tool)' });
  doc.addImage(cv.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, board.BW * sc, board.BH * sc, undefined, 'FAST');
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
  const ext = { pdf: 'A3.pdf', pdf2: 'A2.pdf', png: 'board.png', zip: 'diagrams-1080.zip', explode: 'exploded-A3.png', dxf: 'BNG.dxf', svg: 'BNG.svg' }[kind];
  try {
    status(`Writing ${ext}...`);
    await new Promise((r) => setTimeout(r, 30));
    const blob = kind === 'pdf' ? await pdfBlob('a3') : kind === 'pdf2' ? await pdfBlob('a2') : kind === 'zip' ? await zipBlob()
      : kind === 'explode' ? await explodedBlob() : kind === 'dxf' || kind === 'svg' ? await cadBlob(kind) : await pngBlob();
    state.files = { ...(state.files || {}), [kind]: blob.size };
    save(blob, `${fileTag()}_${ext}`);
    status(`Downloaded ${fileTag()}_${ext} (${(blob.size / 1e6).toFixed(1)} MB).`, 'ok');
  } catch (e) {
    console.error(e); status(`Could not write the file (${e.message}).`, 'err');
  } finally { state.busy = false; syncButtons(); }
}
$('uksa-run').addEventListener('click', analyse);
$('uksa-pdf').addEventListener('click', () => exportAs('pdf'));
$('uksa-png').addEventListener('click', () => exportAs('png'));
if ($('uksa-pdf2')) $('uksa-pdf2').addEventListener('click', () => exportAs('pdf2'));
if ($('uksa-zip')) $('uksa-zip').addEventListener('click', () => exportAs('zip'));
for (const k of ['explode', 'dxf', 'svg']) if ($('uksa-' + k)) $('uksa-' + k).addEventListener('click', () => exportAs(k));
$('uksa-zoom').addEventListener('click', () => { const on = $('uksa-out').classList.toggle('zoomed'); $('uksa-zoom').setAttribute('aria-pressed', String(on)); });
status('Search a postcode or a place, or click the map to place the site. Then press Analyse site.');
drawSite(); syncButtons(); fitFrame(); styleLabels();
// ---------- 3D view and CAD exports (as the HK tool) ----------
if ($('uksa-style')) $('uksa-style').addEventListener('change', (e) => { state.style = e.target.value; if (state.result) { drawSheet(); refresh3D(); } });
if ($('uksa-shape')) $('uksa-shape').addEventListener('change', (e) => { state.shape = e.target.value; if (state.result) { drawSheet(); refresh3D(); } });
async function load3D() { if (!v3d) v3d = await import('./view3d.js'); return v3d; }
function opts3D(mode) {
  const o = boardOpts();
  return { mode, keys: board.KEYS, titles: board.titles ? board.titles() : {}, theme: board.theme ? board.theme(o) : null, shape: o.shape,
    plate: (key, px) => board.plateCanvas(state.result, key, o, px), lang: ('en'), T };
}
async function show3D(mode) {
  if (!state.result || state.stale) return;
  const box = $('uksa-3d'); if (!box) return;
  try {
    const m = await load3D();
    if (!m.supported()) { status('This browser cannot show 3D (no WebGL). The board and the downloads still work.', 'err'); return; }
    box.hidden = false;
    if (view3 && view3.res === state.result) view3.setMode(mode, opts3D(mode));
    else { if (view3) view3.dispose(); view3 = await m.mount(box, state.result, opts3D(mode)); view3.res = state.result; }
    document.querySelectorAll('[data-v3]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v3 === mode)));
  } catch (e) { console.error(e); status(`Could not open the 3D view (${e.message}).`, 'err'); }
}
function refresh3D() { if (view3 && view3.res === state.result) view3.update(opts3D(view3.mode || 'explode')); }
document.querySelectorAll('[data-v3]').forEach((b) => b.addEventListener('click', () => show3D(b.dataset.v3)));
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
window.uksa = { state, map, setCentre, setRadius, setPolygon, finishDraw, ringProblem, analyse, sunPos, tzOf, toEN, toLL, gridRef, pdfBlob, pngBlob, singleBlob, zipBlob, board, boardOpts, search, pick,
  get svg() { return svgCache; }, AN, ctx3, UK, load3D, show3D, get view3() { return view3; }, explodedBlob, cadBlob, drawSheet };
