// HK Sun Shadow · 香港日照陰影 (anzonwong.com Lab). Plain ES module, no bundler, no build step.
// Place a block anywhere in Hong Kong, pick a day and a time, see the shadow it casts on its neighbours,
// and a whole-day "hours in shadow" map. Teaching sketch only.
//
// Data, all fetched live in the browser (CORS open, no key), the same sources as HK Wind Sketch / HK Site Analysis:
//   LandsD Building (CSDI Portal FeatureServer, HK1980 Grid), LandsD 5 m DTM as the HK Site Model 1 km tiles,
//   place search = map.gov.hk locationSearch (HK1980 x/y) + Address Lookup Service (ALS).
// Sun: NOAA Solar Calculator equations (sun.js), HKT = UTC+8.
// Shadows: a 2 m height raster (terrain + block prisms); for each sun position one line sweep along the sun's
// bearing gives the "shadow height" over every cell (max over the cells toward the sun of z - distance x tan(elev)).
// A point is in shade when it sits lower than that. One sweep for the existing city, one for the new block alone:
// new shade = shaded by the new block and not already in shade.

import { sunAtHKT, sunTimes, fmtHM } from './sun.js';

const L = window.L, proj4 = window.proj4;
proj4.defs('EPSG:2326', '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243649,-1.158827,-1.094246 +units=m +no_defs');
const toEN = (lat, lon) => proj4('EPSG:4326', 'EPSG:2326', [lon, lat]);
const toLL = (E, N) => { const p = proj4('EPSG:2326', 'EPSG:4326', [E, N]); return [p[1], p[0]]; };

const CSDI = 'https://portal.csdi.gov.hk/server/rest/services/common/';
const BLD_URL = CSDI + 'landsd_rcd_1637211194312_35158/FeatureServer/0/query';
const ALS_URL = 'https://www.als.gov.hk/lookup';
const PLACE_URL = 'https://www.map.gov.hk/gs/api/v1.0.0/locationSearch?q=';
const DTM_URL = /(^|\.)anzonwong\.com$/.test(location.hostname)
  ? new URL('../hk-site-model/dtm/', import.meta.url).href : 'https://anzonwong.com/lab/hk-site-model/dtm/';
const DTM_CELL = 5, DTM_TILE = 201;
const BOUNDS = { E: [801000, 862500], N: [801000, 847000] };

const FRAME = 400, BUF = 200, RES = 2;           // analysis square (m), ring loaded around it for shade casters, raster cell (m)
const SIDE = FRAME + 2 * BUF, NR = SIDE / RES;  // raster covers SIDE x SIDE
const NF = FRAME / RES, F0 = BUF / RES;          // analysis cells per side, first analysis cell index
const MROT = Math.ceil(SIDE * Math.SQRT2 / RES) + 2;
const STEP_MIN = 10, MIN_ELEV = 5, TOL = 0.3, WALL_OFF = 2.5;
const YEAR = 2026;
const PRESETS = { winter: [12, 21], equinox: [3, 20], summer: [6, 21] };
const COL = { paper: '#f7f4ee', ground: '#fbfaf6', ink: '#1d1a16', rule: '#c9c1b3', accent: '#c2410c', exist: [58, 74, 99], new: [194, 65, 12] };
const HCLASS = [[10, '#ebe6dc'], [30, '#dcd4c4'], [60, '#c9bda7'], [100, '#b2a289'], [150, '#968469'], [Infinity, '#7a6a52']];
const HOURS_STEPS = [0.5, 1, 2, 3, 4, 6];
const CREDITS = 'Data: Lands Department, The Government of the Hong Kong SAR: Building (CSDI Portal, live) and 5 m Digital Terrain Model (DATA.GOV.HK). Intellectual property rights in the data belong to the Government of the HKSAR. Place search: map.gov.hk and Address Lookup Service (ALS). Sun: NOAA Solar Calculator equations. Base map © Lands Department. Personal hobby project, not official, for teaching only. 資料：香港特別行政區政府地政總署。個人興趣項目，只供教學參考。';

const $ = (id) => document.getElementById(id);
const S = {
  site: null,              // { E0, N0, lat, lon, label, blds, terr, surfB, ... }
  shape: 'rect', block: { x: 0, y: 0, w: 30, d: 20, rot: 0, h: 100, ring: null, drawn: null },
  date: [12, 21], tmin: 720, layer: 'now', hk: 'new', tab: 'map',
  now: null, day: null, dirtyDay: true, playing: false,
};
window.HSS = { S, get view() { return view; } };

// ---------------------------------------------------------------- small helpers
function status(t, cls) { const e = $('hssStatus'); e.textContent = t || ''; e.className = 'hss-status' + (cls ? ' ' + cls : ''); }
function busy(t) { const e = $('hssBusy'); e.textContent = t || ''; e.hidden = !t; }
const tick = () => new Promise((r) => setTimeout(r, 0));
function pip(x, y, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function area(ring) { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; return a / 2; }   // > 0 = anticlockwise
const cellOf = (x, y) => { const i = Math.floor((x + SIDE / 2) / RES), j = Math.floor((y + SIDE / 2) / RES); return i >= 0 && j >= 0 && i < NR && j < NR ? j * NR + i : -1; };
const cx = (i) => -SIDE / 2 + (i + 0.5) * RES;
function cellsInRing(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const i0 = Math.max(0, Math.floor((x0 + SIDE / 2) / RES)), i1 = Math.min(NR - 1, Math.floor((x1 + SIDE / 2) / RES));
  const j0 = Math.max(0, Math.floor((y0 + SIDE / 2) / RES)), j1 = Math.min(NR - 1, Math.floor((y1 + SIDE / 2) / RES));
  const out = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (pip(cx(i), cx(j), ring)) out.push(j * NR + i);
  return out;
}
function hm(min) { return fmtHM(min); }
function fmtH(h) { return h >= 1 ? h.toFixed(1) + ' h' : Math.round(h * 60) + ' min'; }

// ---------------------------------------------------------------- data
async function fetchJSON(url, opt, tries = 2) {
  for (let t = 1; ; t++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch(url, Object.assign({ signal: ctl.signal }, opt || {}));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j && j.error) throw new Error(j.error.message || 'service error');
      return j;
    } catch (e) { if (t >= tries) throw e; } finally { clearTimeout(timer); }
  }
}
async function queryBuildings(E0, N0, E1, N1, onPage) {
  const out = [], n = 2000;
  for (let off = 0; ; off += n) {
    const q = new URLSearchParams({
      where: '1=1', geometry: `${E0},${N0},${E1},${N1}`, geometryType: 'esriGeometryEnvelope', inSR: '2326',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'OBJECTID,BuildingBlockType,Status,BaseHeight,TopHeight,Storeys', outSR: '2326',
      returnGeometry: 'true', orderByFields: 'OBJECTID', resultOffset: String(off), resultRecordCount: String(n), f: 'geojson',
    });
    const j = await fetchJSON(BLD_URL + '?' + q);
    const fs = j.features || [];
    out.push(...fs); if (onPage) onPage(out.length);
    const more = (j.properties && j.properties.exceededTransferLimit) || j.exceededTransferLimit;
    if (!fs.length || (fs.length < n && !more)) break;
  }
  return out;
}
let dtmIndex = null;
const tileCache = new Map();
async function loadTile(key) {
  if (tileCache.has(key)) return tileCache.get(key);
  const p = (async () => {
    if (!dtmIndex.has(key)) return null;                      // no tile = sea, 0 mPD
    const r = await fetch(DTM_URL + key + '.bin');
    if (!r.ok) throw new Error('DTM tile ' + key + ' ' + r.status);
    const buf = await new Response(r.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    const flag = new Uint8Array(buf, 0, 1)[0], a = new Int16Array(buf.slice(1));
    const out = new Float32Array(DTM_TILE * DTM_TILE);
    for (let j = 0; j < DTM_TILE; j++) {
      let acc = 0;
      for (let i = 0; i < DTM_TILE; i++) { const k = j * DTM_TILE + i; acc = flag || i === 0 ? a[k] : acc + a[k]; out[k] = acc === -32768 ? 0 : acc / 10; }
    }
    return out;
  })();
  tileCache.set(key, p); p.catch(() => tileCache.delete(key));
  return p;
}
async function loadDEM(xa, ya, xb, yb) {                      // HK1980 Grid; as HK Site Analysis
  xa = Math.floor(xa / DTM_CELL) * DTM_CELL; ya = Math.floor(ya / DTM_CELL) * DTM_CELL; xb = Math.ceil(xb / DTM_CELL) * DTM_CELL; yb = Math.ceil(yb / DTM_CELL) * DTM_CELL;
  if (!dtmIndex) dtmIndex = new Set((await fetchJSON(DTM_URL + 'index.json')).tiles);
  const nx = Math.round((xb - xa) / DTM_CELL) + 1, ny = Math.round((yb - ya) / DTM_CELL) + 1;
  const z = new Float32Array(nx * ny), keys = [];
  for (let ek = Math.floor(xa / 1000); ek * 1000 <= xb; ek++) for (let nk = Math.floor(ya / 1000); nk * 1000 <= yb; nk++) keys.push([ek, nk]);
  const tiles = await Promise.all(keys.map(([ek, nk]) => loadTile(`${ek}_${nk}`)));
  keys.forEach(([ek, nk], t) => {
    const tl = tiles[t]; if (!tl) return;
    const tx = ek * 1000, ty = nk * 1000;
    const i0 = Math.max(0, Math.round((tx - xa) / DTM_CELL)), i1 = Math.min(nx - 1, Math.round((tx + 1000 - xa) / DTM_CELL));
    const j0 = Math.max(0, Math.round((ty - ya) / DTM_CELL)), j1 = Math.min(ny - 1, Math.round((ty + 1000 - ya) / DTM_CELL));
    for (let j = j0; j <= j1; j++) { const tj = Math.round((ya + j * DTM_CELL - ty) / DTM_CELL); for (let i = i0; i <= i1; i++) z[j * nx + i] = tl[tj * DTM_TILE + Math.round((xa + i * DTM_CELL - tx) / DTM_CELL)]; }
  });
  const h = (E, N) => {
    let fx = (E - xa) / DTM_CELL, fy = (N - ya) / DTM_CELL;
    fx = Math.min(nx - 1.0001, Math.max(0, fx)); fy = Math.min(ny - 1.0001, Math.max(0, fy));
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * nx + i;
    return (z[k] * (1 - u) + z[k + 1] * u) * (1 - v) + (z[k + nx] * (1 - u) + z[k + nx + 1] * u) * v;
  };
  return { xa, ya, nx, ny, z, h };
}
function trueNorthGrid(E, N) {                               // grid bearing of true north (deg), HK1980 is a TM: tiny
  const [lat, lon] = toLL(E, N), a = toEN(lat - 0.002, lon), b = toEN(lat + 0.002, lon);
  return Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI;
}

async function loadSite(lat, lon, label) {
  const [E0, N0] = toEN(lat, lon);
  if (E0 < BOUNDS.E[0] || E0 > BOUNDS.E[1] || N0 < BOUNDS.N[0] || N0 > BOUNDS.N[1]) { status('That point is outside Hong Kong. 請選擇香港境內的地點。', 'err'); return; }
  S.playing = false; syncPlay();
  busy('Loading buildings and terrain… 載入建築物及地形…');
  status('Loading buildings and terrain… 載入中…');
  try {
    const h = SIDE / 2;
    const [feats, dem] = await Promise.all([
      queryBuildings(E0 - h, N0 - h, E0 + h, N0 + h, (k) => busy(`Loading buildings… ${k} 載入建築物…`)),
      loadDEM(E0 - h - 10, N0 - h - 10, E0 + h + 10, N0 + h + 10),
    ]);
    busy('Preparing the model… 準備模型…'); await tick();
    const site = buildSite(E0, N0, lat, lon, label, feats, dem);
    S.site = site;
    S.block.x = 0; S.block.y = 0; S.block.drawn = null; S.shape = 'rect'; syncShapeButtons();
    applyURLBlock();
    rebuildBlock();
    document.querySelectorAll('.needs-site').forEach((e) => e.classList.remove('locked'));
    status(`Loaded ${site.blds.length} blocks around ${label || 'the picked point'}; ground ${site.gmin.toFixed(1)} to ${site.gmax.toFixed(1)} mPD. 已載入 ${site.blds.length} 座建築。`);
    setTab('plan');
    fitPlan();
    if (view) view.setSite(site, S);
    update();
  } catch (e) {
    console.error(e);
    status(`Could not load the data (${e.message}). The government service may be busy; try again in a minute. 未能載入資料，請稍後再試。`, 'err');
  } finally { busy(''); }
}

function buildSite(E0, N0, lat, lon, label, feats, dem) {
  // terrain raster
  const terr = new Float32Array(NR * NR);
  let gmin = Infinity, gmax = -Infinity;
  for (let j = 0; j < NR; j++) for (let i = 0; i < NR; i++) {
    const z = dem.h(E0 + cx(i), N0 + cx(j)); terr[j * NR + i] = z;
    if (i >= F0 && i < F0 + NF && j >= F0 && j < F0 + NF) { gmin = Math.min(gmin, z); gmax = Math.max(gmax, z); }
  }
  const blds = [], seen = new Set();
  for (const f of feats) {
    const p = f.properties || {}, g = f.geometry || {};
    if (p.Status != null && String(p.Status).toLowerCase() !== 'active' && p.Status !== 1) continue;
    if (p.TopHeight == null) continue;
    if (seen.has(p.OBJECTID)) continue; seen.add(p.OBJECTID);
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      if (!poly || !poly[0] || poly[0].length < 4) continue;
      const ring = poly[0].slice(0, -1).map(([E, N]) => [E - E0, N - N0]);
      const cells = cellsInRing(ring);
      if (!cells.length) continue;
      const top = +p.TopHeight;
      let gz = 0; for (const k of cells) gz += terr[k]; gz /= cells.length;
      const base = p.BaseHeight != null ? Math.min(+p.BaseHeight, gz) : gz;
      if (!(top > base + 1)) continue;
      let ax = 0, ay = 0; for (const [x, y] of ring) { ax += x; ay += y; } ax /= ring.length; ay /= ring.length;
      blds.push({ id: blds.length, oid: p.OBJECTID, ring, cells: Int32Array.from(cells), top, base, h: top - base, cx: ax, cy: ay, type: p.BuildingBlockType || '' });
    }
  }
  const surfB = new Float32Array(NR * NR);
  const site = { E0, N0, lat, lon, label, blds, terr, gmin, gmax, dem, surfB, conv: trueNorthGrid(E0, N0), cleared: new Set(), wallPts: null };
  return site;
}
function rebuildSurfaceB(site) {
  const s = site.surfB; s.set(site.terr);
  for (const b of site.blds) { if (site.cleared.has(b.id)) continue; for (const k of b.cells) if (b.top > s[k]) s[k] = b.top; }
}

// ---------------------------------------------------------------- the proposed block
function rectRing(b) {
  const c = Math.cos(b.rot * Math.PI / 180), s = Math.sin(b.rot * Math.PI / 180), hw = b.w / 2, hd = b.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [b.x + u * c + v * s, b.y - u * s + v * c]);
}
function rebuildBlock() {
  const site = S.site; if (!site) return;
  const b = S.block;
  b.ring = S.shape === 'draw' && b.drawn ? b.drawn.map(([x, y]) => [x + b.x, y + b.y]) : rectRing(b);
  b.cells = Int32Array.from(cellsInRing(b.ring));
  let gz = Infinity; for (const k of b.cells) gz = Math.min(gz, site.terr[k]);
  b.base = isFinite(gz) ? gz : 0; b.top = b.base + b.h;
  // existing blocks mostly under the new footprint are taken as cleared
  const mine = new Set(b.cells);
  site.cleared = new Set();
  for (const e of site.blds) {
    let n = 0; for (const k of e.cells) if (mine.has(k)) n++;
    if (n / e.cells.length > 0.3 || pip(e.cx, e.cy, b.ring)) site.cleared.add(e.id);
  }
  rebuildSurfaceB(site);
  site.wallPts = buildWallPoints(site);
  const fa = Math.abs(area(b.ring));
  $('hssBlockFacts').textContent = `Footprint ${Math.round(fa)} m², ground ${b.base.toFixed(1)} mPD, top ${b.top.toFixed(1)} mPD` +
    (site.cleared.size ? `, ${site.cleared.size} existing block(s) under it cleared` : '') + `. 佔地 ${Math.round(fa)} 平方米。`;
  S.dirtyDay = true;
}

// sample points 2.5 m in front of every neighbour wall, at several heights
function buildWallPoints(site) {
  const xs = [], ys = [], zs = [], nxs = [], nys = [], bi = [];
  const lim = FRAME / 2 + 40;
  for (const b of site.blds) {
    if (site.cleared.has(b.id)) continue;
    if (Math.abs(b.cx) > lim || Math.abs(b.cy) > lim) continue;
    const ring = b.ring, ccw = area(ring) > 0;
    const levels = [];
    const n = Math.min(10, Math.max(1, Math.floor((b.h - 2) / 6) + 1));
    for (let k = 0; k < n; k++) levels.push(b.base + 2 + (n === 1 ? 0 : k * (b.h - 4) / (n - 1)));
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
      const len = Math.hypot(x2 - x1, y2 - y1); if (len < 2) continue;
      const tx = (x2 - x1) / len, ty = (y2 - y1) / len;
      const nx = ccw ? ty : -ty, ny = ccw ? -tx : tx;           // outward normal
      const m = Math.max(1, Math.round(len / 4));
      for (let s = 0; s < m; s++) {
        const t = (s + 0.5) / m, px = x1 + (x2 - x1) * t + nx * WALL_OFF, py = y1 + (y2 - y1) * t + ny * WALL_OFF;
        const k = cellOf(px, py); if (k < 0) continue;
        for (const z of levels) {
          if (site.surfB[k] > z) continue;                    // inside or under another block
          xs.push(px); ys.push(py); zs.push(z); nxs.push(nx); nys.push(ny); bi.push(b.id);
        }
      }
    }
  }
  return { x: Float32Array.from(xs), y: Float32Array.from(ys), z: Float32Array.from(zs), nx: Float32Array.from(nxs), ny: Float32Array.from(nys), b: Int32Array.from(bi), n: xs.length };
}

// ---------------------------------------------------------------- shadow sweep
const SH_E = new Float32Array(MROT * MROT), SH_P = new Float32Array(MROT * MROT);
let propSurf = null;
function propRaster() {
  if (!propSurf) propSurf = new Float32Array(NR * NR);
  propSurf.fill(-1e9);
  const b = S.block; for (const k of b.cells) propSurf[k] = b.top;
  return propSurf;
}
// shadow-height field for one sun position. azG = grid bearing toward the sun (deg), tanE = tan(elevation)
function sweep(surf, azG, tanE, out) {
  const a = azG * Math.PI / 180, sx = -Math.sin(a), sy = -Math.cos(a);   // shadow direction (away from the sun)
  const px = -sy, py = sx, half = MROT / 2 - 0.5, drop = RES * tanE;
  for (let r = 0; r < MROT; r++) {
    const v = (r - half) * RES;
    let h = -1e9, row = r * MROT;
    let x = -half * RES * sx + v * px, y = -half * RES * sy + v * py;
    const dx = RES * sx, dy = RES * sy;
    for (let c = 0; c < MROT; c++, x += dx, y += dy) {
      out[row + c] = h;
      const i = Math.floor((x + SIDE / 2) / RES), j = Math.floor((y + SIDE / 2) / RES);
      if (i >= 0 && j >= 0 && i < NR && j < NR) { const z = surf[j * NR + i]; if (z > h) h = z; }
      h -= drop;
    }
  }
  return { sx, sy, px, py, half };
}
function shAt(out, g, x, y) {
  const c = Math.round((x * g.sx + y * g.sy) / RES + g.half), r = Math.round((x * g.px + y * g.py) / RES + g.half);
  return c >= 0 && r >= 0 && c < MROT && r < MROT ? out[r * MROT + c] : -1e9;
}
function sunAt(tmin) {
  const site = S.site, [m, d] = S.date;
  const p = sunAtHKT(YEAR, m, d, tmin, site.lat, site.lon);
  return Object.assign(p, { azG: p.az + site.conv });
}

// shade flags over the analysis square for one time: 0 sun, 1 existing shade, 2 new shade from the block, 3 block roof, 4 night
function shadeOnce(sun, flags, wallHit) {
  const site = S.site, b = S.block, sb = site.surfB;
  if (sun.elev <= 0.2) { flags.fill(4); if (wallHit) wallHit.fill(0); return; }
  const tanE = Math.tan(sun.elev * Math.PI / 180);
  const ge = sweep(sb, sun.azG, tanE, SH_E), gp = sweep(propRaster(), sun.azG, tanE, SH_P);
  const ps = propSurf;
  for (let j = 0; j < NF; j++) {
    const y = cx(F0 + j);
    for (let i = 0; i < NF; i++) {
      const k = (F0 + j) * NR + F0 + i, x = cx(F0 + i), q = j * NF + i;
      if (ps[k] > -1e8) { flags[q] = shAt(SH_E, ge, x, y) > ps[k] + TOL ? 1 : 3; continue; }
      const z = sb[k];
      const e = shAt(SH_E, ge, x, y) > z + TOL;
      flags[q] = e ? 1 : shAt(SH_P, gp, x, y) > z + TOL ? 2 : 0;
    }
  }
  if (wallHit) {
    const W = site.wallPts, a = sun.azG * Math.PI / 180, tx = Math.sin(a), ty = Math.cos(a);
    for (let n = 0; n < W.n; n++) {
      wallHit[n] = 0;
      if (W.nx[n] * tx + W.ny[n] * ty < 0.1) continue;             // wall faces away from the sun: no sun to lose
      const x = W.x[n], y = W.y[n], z = W.z[n];
      if (shAt(SH_P, gp, x, y) > z + TOL && !(shAt(SH_E, ge, x, y) > z + TOL)) wallHit[n] = 1;
    }
  }
}

function computeNow() {
  if (!S.site) return;
  const sun = sunAt(S.tmin);
  const flags = new Uint8Array(NF * NF), wall = new Uint8Array(S.site.wallPts.n);
  shadeOnce(sun, flags, wall);
  S.now = { sun, flags, wall };
}
async function computeDay() {
  if (!S.site) return;
  const [m, d] = S.date, site = S.site;
  const t = sunTimes(YEAR, m, d, site.lat, site.lon);
  const hNew = new Float32Array(NF * NF), hAll = new Float32Array(NF * NF);
  const W = site.wallPts, wMin = new Float32Array(W.n);
  const flags = new Uint8Array(NF * NF), wall = new Uint8Array(W.n);
  const nb = new Map();                                       // building id -> { steps:Set }
  let counted = 0, first = null, last = null;
  const t0 = performance.now();
  for (let tm = Math.ceil(t.sunrise / STEP_MIN) * STEP_MIN; tm <= t.sunset; tm += STEP_MIN) {
    const sun = sunAt(tm); if (sun.elev < MIN_ELEV) continue;
    if (first == null) first = tm; last = tm;
    counted++;
    shadeOnce(sun, flags, wall);
    const dt = STEP_MIN / 60;
    for (let q = 0; q < flags.length; q++) { const f = flags[q]; if (f === 2) { hNew[q] += dt; hAll[q] += dt; } else if (f === 1) hAll[q] += dt; }
    for (let n = 0; n < W.n; n++) if (wall[n]) {
      wMin[n] += STEP_MIN;
      const id = W.b[n]; let r = nb.get(id); if (!r) nb.set(id, r = { steps: new Set(), pts: 0 }); r.steps.add(tm);
    }
  }
  const rows = [];
  for (const [id, r] of nb) {
    const bl = site.blds[id];
    let mx = 0; for (let n = 0; n < W.n; n++) if (W.b[n] === id && wMin[n] > mx) mx = wMin[n];
    const steps = [...r.steps].sort((a, b) => a - b), segs = [];
    for (const s of steps) { const g = segs[segs.length - 1]; if (g && s - g[1] <= STEP_MIN) g[1] = s; else segs.push([s, s]); }
    rows.push({ id, b: bl, maxH: mx / 60, segs, dist: Math.hypot(bl.cx - S.block.x, bl.cy - S.block.y) });
  }
  rows.sort((a, b) => b.maxH - a.maxH || a.dist - b.dist);
  rows.forEach((r, i) => { r.label = 'N' + (i + 1); });
  // the 2 m raster puts a one-cell strip of false shade along the block's own walls: leave cells within 4 m out of the maximum
  const near = new Uint8Array(NF * NF);
  for (const k of S.block.cells) {
    const i = (k % NR) - F0, j = Math.floor(k / NR) - F0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = i + di, c = j + dj; if (a >= 0 && c >= 0 && a < NF && c < NF) near[c * NF + a] = 1; }
  }
  let maxNew = 0; for (let q = 0; q < hNew.length; q++) if (!near[q] && hNew[q] > maxNew) maxNew = hNew[q];
  S.day = { hNew, hAll, wMin, rows, counted, hours: counted * STEP_MIN / 60, first, last, times: t, maxNew, ms: performance.now() - t0 };
  S.dirtyDay = false;
  renderNeighbours();
}

// ---------------------------------------------------------------- plan view
const cv = $('hssPlan'), ctx = cv.getContext('2d');
const P = { cx: 0, cy: 0, s: 2 };                          // view centre (m) and pixels per metre (CSS px)
let dpr = 1;
function sizeCanvas() {
  const r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(10, Math.round(r.width * dpr)); cv.height = Math.max(10, Math.round(r.height * dpr));
}
function fitPlan() { sizeCanvas(); const r = cv.getBoundingClientRect(); P.cx = 0; P.cy = 0; P.s = Math.min(r.width, r.height) / (FRAME + 30); drawPlan(); }
const W2S = (x, y) => { const r = cv.getBoundingClientRect(); return [r.width / 2 + (x - P.cx) * P.s, r.height / 2 - (y - P.cy) * P.s]; };
const S2W = (sx, sy) => { const r = cv.getBoundingClientRect(); return [P.cx + (sx - r.width / 2) / P.s, P.cy - (sy - r.height / 2) / P.s]; };
const off = document.createElement('canvas'); off.width = NF; off.height = NF;
const offCtx = off.getContext('2d');
function hoursColour(h) {                                    // sequential, light to deep
  const ramp = [[253, 224, 197], [251, 176, 120], [240, 120, 60], [204, 72, 20], [150, 40, 10], [90, 20, 8]];
  let k = 0; while (k < HOURS_STEPS.length - 1 && h >= HOURS_STEPS[k + 1]) k++;
  return ramp[k];
}
function paintLayer() {
  const img = offCtx.createImageData(NF, NF), D = img.data;
  const put = (q, c, a) => { const j = NF - 1 - Math.floor(q / NF), i = q % NF, o = (j * NF + i) * 4; D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = a; };
  if (S.layer === 'now' && S.now) {
    const f = S.now.flags;
    for (let q = 0; q < f.length; q++) {
      if (f[q] === 1) put(q, COL.exist, 74); else if (f[q] === 2) put(q, COL.new, 165); else if (f[q] === 4) put(q, [20, 24, 40], 150);
    }
  } else if (S.layer === 'hours' && S.day) {
    const H = S.hk === 'new' ? S.day.hNew : S.day.hAll;
    for (let q = 0; q < H.length; q++) { const h = H[q]; if (h >= HOURS_STEPS[0] - 1e-6) put(q, S.hk === 'new' ? hoursColour(h) : greyColour(h), S.hk === 'new' ? 200 : 170); }
  }
  offCtx.putImageData(img, 0, 0);
}
function greyColour(h) { const t = Math.min(1, h / Math.max(1, S.day ? S.day.hours : 10)); const v = Math.round(225 - 170 * t); return [v - 10, v - 4, v + 12]; }
function path(ring) { ctx.beginPath(); ring.forEach(([x, y], i) => { const [a, b] = W2S(x, y); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); }); ctx.closePath(); }
function drawPlan() {
  if (!cv.width) return;
  const r = cv.getBoundingClientRect(), Wd = r.width, Ht = r.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COL.paper; ctx.fillRect(0, 0, Wd, Ht);
  const site = S.site; if (!site) return;
  // ground inside the square
  const [qx0, qy0] = W2S(-FRAME / 2, FRAME / 2);
  ctx.fillStyle = COL.ground; ctx.fillRect(qx0, qy0, FRAME * P.s, FRAME * P.s);
  // blocks (roof tone by height)
  for (const b of site.blds) {
    if (site.cleared.has(b.id)) continue;
    let c = HCLASS[0][1]; for (const [mx, col] of HCLASS) { if (b.h < mx) { c = col; break; } }
    path(b.ring); ctx.fillStyle = c; ctx.fill();
  }
  // shade layer over ground and roofs
  paintLayer();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, qx0, qy0, FRAME * P.s, FRAME * P.s);
  // outlines
  ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(40,34,28,.55)';
  for (const b of site.blds) { if (site.cleared.has(b.id)) continue; path(b.ring); ctx.stroke(); }
  ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(120,110,95,.8)';
  for (const id of site.cleared) { path(site.blds[id].ring); ctx.stroke(); }
  ctx.setLineDash([]);
  // the block
  const bk = S.block;
  path(bk.ring); ctx.fillStyle = 'rgba(194,65,12,.88)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#7c2d12'; ctx.stroke();
  // walls newly shaded at this time
  if (S.layer === 'now' && S.now && S.now.wall) {
    const W = site.wallPts; ctx.fillStyle = '#b91c1c';
    const seen = new Set();
    for (let n = 0; n < W.n; n++) if (S.now.wall[n]) {
      const key = Math.round(W.x[n]) + ',' + Math.round(W.y[n]); if (seen.has(key)) continue; seen.add(key);
      const [a, b2] = W2S(W.x[n] - W.nx[n] * WALL_OFF, W.y[n] - W.ny[n] * WALL_OFF);
      ctx.beginPath(); ctx.arc(a, b2, 2.6, 0, 7); ctx.fill();
    }
  }
  // neighbour labels
  if (S.day && !S.dirtyDay) {
    ctx.font = '700 11px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const row of S.day.rows.slice(0, 9)) {
      const [a, b2] = W2S(row.b.cx, row.b.cy);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(a - 13, b2 - 8, 26, 16, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b91c1c'; ctx.fillText(row.label, a, b2 + 0.5);
    }
  }
  // block label
  {
    const [a, b2] = W2S(bk.x, bk.y);
    ctx.font = '700 12px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const t = `${Math.round(bk.h)} m`; const w = ctx.measureText(t).width + 10;
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(a - w / 2, b2 - 9, w, 18); ctx.fillStyle = '#7c2d12'; ctx.fillText(t, a, b2);
  }
  // draw-in-progress
  if (drawPts.length) {
    ctx.strokeStyle = COL.accent; ctx.lineWidth = 2; ctx.beginPath();
    drawPts.forEach(([x, y], i) => { const [a, b2] = W2S(x, y); if (i) ctx.lineTo(a, b2); else ctx.moveTo(a, b2); });
    if (hoverPt) { const [a, b2] = W2S(...hoverPt); ctx.lineTo(a, b2); }
    ctx.stroke();
    for (const [x, y] of drawPts) { const [a, b2] = W2S(x, y); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(a, b2, 4, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  // analysis square
  ctx.strokeStyle = 'rgba(29,26,22,.45)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1; ctx.strokeRect(qx0, qy0, FRAME * P.s, FRAME * P.s); ctx.setLineDash([]);
  drawFurniture(Wd, Ht);
}
function drawFurniture(Wd, Ht) {
  const site = S.site;
  // north arrow (grid north up; true north differs by site.conv, a few hundredths of a degree)
  const nx = Wd - 34, ny = 44;
  ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.moveTo(nx, ny - 20); ctx.lineTo(nx + 8, ny + 6); ctx.lineTo(nx, ny); ctx.lineTo(nx - 8, ny + 6); ctx.closePath(); ctx.fill();
  ctx.font = '700 12px Arial'; ctx.textAlign = 'center'; ctx.fillText('N', nx, ny + 18);
  // sun compass
  if (S.layer === 'now' && S.now) {
    const sun = S.now.sun, R = 34, ox = Wd - 34 - 70, oy = 50;
    ctx.strokeStyle = 'rgba(29,26,22,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ox, oy, R, 0, 7); ctx.stroke();
    if (sun.elev > 0) {
      const a = sun.azG * Math.PI / 180, rr = R * (1 - sun.elev / 90);
      const sx = ox + Math.sin(a) * rr, sy = oy - Math.cos(a) * rr;
      ctx.strokeStyle = 'rgba(58,74,99,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - Math.sin(a) * R, oy + Math.cos(a) * R); ctx.stroke();
      ctx.fillStyle = '#e9a400'; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 7); ctx.fill(); ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.fillStyle = COL.ink; ctx.font = '11px Arial'; ctx.fillText('Sun 太陽', ox, oy + R + 13);
  }
  // scale bar
  const len = P.s * 100 > 160 ? 50 : 100, bx = 18, by = Ht - 22;
  ctx.fillStyle = COL.ink; ctx.fillRect(bx, by, len * P.s, 4);
  ctx.fillStyle = '#fff'; ctx.fillRect(bx + len * P.s / 2, by + 1, len * P.s / 2 - 1, 2);
  ctx.fillStyle = COL.ink; ctx.font = '11px Arial'; ctx.textAlign = 'left'; ctx.fillText(`${len} m`, bx + len * P.s + 6, by + 5);
  // time stamp
  ctx.textAlign = 'left'; ctx.font = '700 13px Arial';
  const [m, d] = S.date, dd = `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${YEAR}`;
  const txt = S.layer === 'now' ? `${dd} · ${hm(S.tmin)} HKT` : `${dd} · ${S.hk === 'new' ? 'extra hours in shade from the block 新建築帶來的陰影時數' : 'all hours in shade 全日陰影時數'}`;
  const w = ctx.measureText(txt).width + 16;
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(12, 12, w, 24); ctx.fillStyle = COL.ink; ctx.fillText(txt, 20, 29);
}

// ---------------------------------------------------------------- plan interaction
let drag = null, drawPts = [], hoverPt = null;
function inBlock(x, y) { return S.block.ring && pip(x, y, S.block.ring); }
cv.addEventListener('pointerdown', (e) => {
  if (!S.site) return;
  const r = cv.getBoundingClientRect(), [x, y] = S2W(e.clientX - r.left, e.clientY - r.top);
  cv.setPointerCapture(e.pointerId);
  if (S.shape === 'draw' && !S.block.drawn) {
    if (drawPts.length >= 3) { const [a, b] = W2S(...drawPts[0]), [c, d] = [e.clientX - r.left, e.clientY - r.top]; if (Math.hypot(a - c, b - d) < 10) { finishDraw(); return; } }
    drawPts.push([x, y]); drawPlan(); return;
  }
  if (inBlock(x, y)) drag = { kind: 'block', x0: x, y0: y, bx: S.block.x, by: S.block.y };
  else drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: P.cx, cy: P.cy };
});
cv.addEventListener('pointermove', (e) => {
  const r = cv.getBoundingClientRect(), [x, y] = S2W(e.clientX - r.left, e.clientY - r.top);
  if (S.shape === 'draw' && drawPts.length) { hoverPt = [x, y]; drawPlan(); }
  if (!drag) { cv.style.cursor = S.site && inBlock(x, y) ? 'move' : (S.shape === 'draw' && !S.block.drawn ? 'crosshair' : 'grab'); return; }
  if (drag.kind === 'block') {
    const lim = FRAME / 2 - 10;
    S.block.x = Math.max(-lim, Math.min(lim, drag.bx + x - drag.x0)); S.block.y = Math.max(-lim, Math.min(lim, drag.by + y - drag.y0));
    S.block.ring = S.shape === 'draw' && S.block.drawn ? S.block.drawn.map(([a, b]) => [a + S.block.x, b + S.block.y]) : rectRing(S.block);
    S.block.cells = Int32Array.from(cellsInRing(S.block.ring)); quickUpdate();
  } else {
    P.cx = drag.cx - (e.clientX - drag.sx) / P.s; P.cy = drag.cy + (e.clientY - drag.sy) / P.s; drawPlan();
  }
});
cv.addEventListener('pointerup', () => { if (drag && drag.kind === 'block') { rebuildBlock(); update(); } drag = null; });
cv.addEventListener('dblclick', () => { if (S.shape === 'draw' && drawPts.length >= 3) finishDraw(); });
cv.addEventListener('wheel', (e) => {
  e.preventDefault(); const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const [x, y] = S2W(sx, sy); P.s = Math.max(0.5, Math.min(12, P.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  const [x2, y2] = S2W(sx, sy); P.cx += x - x2; P.cy += y - y2; drawPlan();
}, { passive: false });
function finishDraw() {
  let ax = 0, ay = 0; for (const [x, y] of drawPts) { ax += x; ay += y; } ax /= drawPts.length; ay /= drawPts.length;
  S.block.drawn = drawPts.map(([x, y]) => [x - ax, y - ay]); S.block.x = ax; S.block.y = ay;
  drawPts = []; hoverPt = null; rebuildBlock(); update();
}
let qTimer = 0;
function quickUpdate() {                                   // during a drag: shade now only, no day map
  if (S.layer === 'now') { computeNow(); drawPlan(); if (view) view.update(S); }
  else drawPlan();
  clearTimeout(qTimer);
}

// ---------------------------------------------------------------- update cycle
let dayTimer = 0;
function update() {
  if (!S.site) return;
  computeNow(); renderSun(); renderLegend(); drawPlan();
  if (view) view.update(S);
  clearTimeout(dayTimer);
  if (S.dirtyDay) dayTimer = setTimeout(async () => { busy('Working out the whole day… 計算全日陰影…'); await tick(); await computeDay(); busy(''); drawPlan(); renderLegend(); if (view) view.update(S); }, 250);
}
function renderSun() {
  const sun = S.now && S.now.sun; if (!sun) return;
  const [m, d] = S.date, t = sunTimes(YEAR, m, d, S.site.lat, S.site.lon);
  const shadowLen = sun.elev > 0.5 ? (S.block.h / Math.tan(sun.elev * Math.PI / 180)) : Infinity;
  const dir = (az) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(az / 22.5) % 16];
  $('hssSun').innerHTML = sun.elev > 0
    ? `Sun 太陽: <b>${sun.elev.toFixed(1)}°</b> up, from <b>${dir(sun.az)}</b> (${sun.az.toFixed(1)}°). A ${Math.round(S.block.h)} m block casts a shadow about <b>${shadowLen < 5000 ? Math.round(shadowLen) + ' m' : 'very'}</b> long, pointing ${dir((sun.az + 180) % 360)}.<br>Sunrise 日出 ${hm(t.sunrise)} · solar noon 正午 ${hm(t.noon)} · sunset 日落 ${hm(t.sunset)} HKT`
    : `The sun is down. 太陽已落山。 Sunrise 日出 ${hm(t.sunrise)} · sunset 日落 ${hm(t.sunset)} HKT`;
}
function renderLegend() {
  const L2 = $('hssLegend');
  if (S.layer === 'now') {
    L2.innerHTML = `<div><span class="sw" style="background:rgba(194,65,12,.65)"></span>New shade from your block 新建築帶來的陰影</div>
      <div><span class="sw" style="background:rgba(58,74,99,.36)"></span>Already in shade (existing city) 原有陰影</div>
      <div><span class="sw" style="background:#b91c1c;border-radius:50%"></span>Neighbour wall losing its sun now 此刻失去陽光的外牆</div>`;
  } else if (S.day) {
    const steps = HOURS_STEPS;
    L2.innerHTML = (S.hk === 'new'
      ? steps.map((h, i) => `<div><span class="sw" style="background:rgb(${hoursColour(h).join(',')})"></span>${h}${steps[i + 1] ? ' to ' + steps[i + 1] : '+'} h</div>`).join('')
      : '<div>Darker = more hours in shade 顏色越深，陰影時數越多</div>')
      + `<div class="hint">Counted ${hm(S.day.first)} to ${hm(S.day.last)} HKT, ${S.day.hours.toFixed(1)} h with the sun at least ${MIN_ELEV}° up, every ${STEP_MIN} min. Most extra shade at one spot (4 m or more from the block): ${S.day.maxNew.toFixed(1)} h.</div>`;
  } else L2.innerHTML = '';
}
function renderNeighbours() {
  const ol = $('hssNb'), D2 = S.day; ol.innerHTML = '';
  if (!D2) return;
  if (!D2.rows.length) { ol.innerHTML = '<li>No neighbouring wall loses sun on this day. 當日沒有鄰近外牆失去陽光。</li>'; return; }
  for (const r of D2.rows.slice(0, 9)) {
    const li = document.createElement('li');
    const segs = r.segs.map(([a, b]) => `${hm(a)} to ${hm(b + STEP_MIN)}`).join(', ');
    li.innerHTML = `<b>${r.label}</b> · ${Math.round(r.b.h)} m block, ${Math.round(r.dist)} m away<br>In your block's shadow 處於新建築陰影: ${segs} HKT<small>Longest at one point on a sun-facing wall: ${fmtH(r.maxH)}</small>`;
    ol.appendChild(li);
  }
  if (D2.rows.length > 9) { const li = document.createElement('li'); li.textContent = `+ ${D2.rows.length - 9} more blocks with less. 另有 ${D2.rows.length - 9} 座影響較少。`; ol.appendChild(li); }
}

// ---------------------------------------------------------------- controls
function syncShapeButtons() {
  document.querySelectorAll('[data-shape]').forEach((b) => b.classList.toggle('on', b.dataset.shape === S.shape));
  $('rectCtl').hidden = S.shape !== 'rect'; $('drawHint').hidden = S.shape !== 'draw';
}
document.querySelectorAll('[data-shape]').forEach((b) => b.addEventListener('click', () => {
  S.shape = b.dataset.shape; syncShapeButtons();
  if (S.shape === 'draw') { S.block.drawn = null; drawPts = []; setTab('plan'); status('Click the corners of your outline on the plan. 請在平面圖逐點點選。'); }
  else { drawPts = []; status(''); rebuildBlock(); update(); }
}));
const bindRange = (id, out, fmt, set) => { const el = $(id); const f = () => { $(out).textContent = fmt(+el.value); set(+el.value); }; el.addEventListener('input', () => { f(); if (S.site) { rebuildBlock(); update(); } }); f(); };
bindRange('inW', 'oW', (v) => v + ' m', (v) => { S.block.w = v; });
bindRange('inD', 'oD', (v) => v + ' m', (v) => { S.block.d = v; });
bindRange('inR', 'oR', (v) => v + '°', (v) => { S.block.rot = v; });
bindRange('inH', 'oH', (v) => v + ' m', (v) => { S.block.h = v; });
$('inT').addEventListener('input', () => { S.tmin = +$('inT').value; $('oT').textContent = hm(S.tmin); if (S.site) { computeNow(); renderSun(); drawPlan(); if (view) view.update(S); } });
function setDate(m, d) {
  S.date = [m, d]; $('inDate').value = `${YEAR}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  document.querySelectorAll('[data-preset]').forEach((b) => { const p = PRESETS[b.dataset.preset]; b.classList.toggle('on', p[0] === m && p[1] === d); });
  S.dirtyDay = true; if (S.site) update();
}
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => setDate(...PRESETS[b.dataset.preset])));
$('inDate').addEventListener('change', () => { const v = $('inDate').value; if (/^\d{4}-\d\d-\d\d$/.test(v)) setDate(+v.slice(5, 7), +v.slice(8, 10)); });
function setLayer(l) { S.layer = l; document.querySelectorAll('[data-layer]').forEach((b) => b.classList.toggle('on', b.dataset.layer === l)); $('hoursKind').hidden = l !== 'hours'; renderLegend(); drawPlan(); if (view) view.update(S); }
document.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => setLayer(b.dataset.layer)));
document.querySelectorAll('[data-hk]').forEach((b) => b.addEventListener('click', () => { S.hk = b.dataset.hk; document.querySelectorAll('[data-hk]').forEach((x) => x.classList.toggle('on', x === b)); renderLegend(); drawPlan(); }));
function syncPlay() { $('btnPlay').textContent = S.playing ? '❚❚ Pause 暫停' : '▶ Play the day 播放一日'; $('btnPlay').classList.toggle('on', S.playing); }
let playLast = 0;
function playFrame(ts) {
  if (!S.playing) return;
  if (ts - playLast > 60) {
    playLast = ts;
    const [m, d] = S.date, t = sunTimes(YEAR, m, d, S.site.lat, S.site.lon);
    let v = S.tmin + 5; if (v > t.sunset) v = Math.ceil(t.sunrise / 5) * 5;
    setTime(v);
  }
  requestAnimationFrame(playFrame);
}
$('btnPlay').addEventListener('click', () => { if (!S.site) return; S.playing = !S.playing; syncPlay(); if (S.playing) { setLayer('now'); requestAnimationFrame(playFrame); } });
function setTime(v) { S.tmin = v; $('inT').value = v; $('oT').textContent = hm(v); computeNow(); renderSun(); drawPlan(); if (view) view.update(S); }

// tabs
let view = null, viewP = null;
async function setTab(t) {
  S.tab = t;
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $('hssMap').classList.toggle('on', t === 'map'); $('hssPlanWrap').classList.toggle('on', t === 'plan'); $('hss3d').classList.toggle('on', t === '3d');
  if (t === 'map' && map) setTimeout(() => map.invalidateSize(), 0);
  if (t === 'plan') { sizeCanvas(); drawPlan(); }
  if (t === '3d' && S.site) {
    if (!viewP) { busy('Loading the 3D view… 載入立體…'); viewP = import('./view3d.js').then((m) => { view = m.createView($('hss3d')); return view; }); }
    await viewP; busy('');
    view.resize(); view.setSite(S.site, S); view.update(S);
  }
  if (view) view.active(t === '3d');
}
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { if (b.classList.contains('locked')) return; setTab(b.dataset.tab); }));
window.addEventListener('resize', () => { if (S.tab === 'plan') { sizeCanvas(); drawPlan(); } if (view) view.resize(); });

// ---------------------------------------------------------------- map + search
let map = null, marker = null;
function initMap() {
  map = L.map('hssMap', { zoomControl: true, attributionControl: true }).setView([22.33, 114.17], 12);
  L.tileLayer('https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png', { maxZoom: 19, minZoom: 10, attribution: '© Lands Department' }).addTo(map);
  L.tileLayer('https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/en/WGS84/{z}/{x}/{y}.png', { maxZoom: 19, minZoom: 10 }).addTo(map);
  map.on('click', (e) => pickPoint(e.latlng.lat, e.latlng.lng, null));
}
let square = null;
function pickPoint(lat, lon, label) {
  if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  const [E, N] = toEN(lat, lon), h = FRAME / 2;
  const b = [toLL(E - h, N - h), toLL(E + h, N + h)];
  if (square) square.setBounds(b); else square = L.rectangle(b, { color: '#c2410c', weight: 2, fillOpacity: 0.06, interactive: false }).addTo(map);
  map.fitBounds(b, { maxZoom: 17, padding: [20, 20] });
  setURL({ lat: lat.toFixed(6), lon: lon.toFixed(6) });
  loadSite(lat, lon, label);
}
async function runSearch(q) {
  const ul = $('hssSugg'); ul.hidden = false; ul.innerHTML = '<li>Searching… 搜尋中…</li>';
  const items = [];
  try {
    const arr = await fetchJSON(PLACE_URL + encodeURIComponent(q), null, 1).catch(() => []);
    for (const r of (arr || []).slice(0, 6)) { const [lat, lon] = toLL(+r.x, +r.y); items.push({ t: `${r.nameEN || ''} ${r.nameZH || ''}`.trim(), s: r.addressEN || r.districtEN || '', lat, lon }); }
  } catch (e) { /* ignore */ }
  try {
    const d = await fetchJSON(`${ALS_URL}?q=${encodeURIComponent(q)}&n=4`, { headers: { Accept: 'application/json' } }, 1);
    for (const s of (d.SuggestedAddress || []).slice(0, 4)) {
      const pa = s.Address.PremisesAddress, e = pa.EngPremisesAddress || {}, g = pa.GeospatialInformation || {};
      items.push({ t: e.BuildingName || (e.EngStreet && e.EngStreet.StreetName) || 'Address', s: (e.EngDistrict && e.EngDistrict.DcDistrict) || '', lat: +g.Latitude, lon: +g.Longitude });
    }
  } catch (e) { /* ignore */ }
  ul.innerHTML = '';
  const ok = items.filter((x) => isFinite(x.lat) && isFinite(x.lon));
  if (!ok.length) { ul.innerHTML = '<li>Nothing found. Try another name, or click the map. 找不到，請試另一名稱或直接點選地圖。</li>'; return; }
  ok.forEach((it) => {
    const li = document.createElement('li'); li.innerHTML = `${it.t}<small>${it.s}</small>`;
    li.addEventListener('click', () => { ul.hidden = true; $('hssQ').value = it.t; setTab('map'); pickPoint(it.lat, it.lon, it.t); });
    ul.appendChild(li);
  });
}
$('hssSearch').addEventListener('submit', (e) => { e.preventDefault(); const q = $('hssQ').value.trim(); if (q) runSearch(q); });

// ---------------------------------------------------------------- URL state (?lat&lon&bx&by&w&d&rot&h&date&t)
function setURL(q) { try { const u = new URL(location.href); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v); history.replaceState(null, '', u); } catch (e) { /* file:// */ } }
function applyURLBlock() {
  const u = new URLSearchParams(location.search), b = S.block;
  const num = (k) => (u.has(k) && isFinite(+u.get(k)) ? +u.get(k) : null);
  for (const [k, key] of [['bx', 'x'], ['by', 'y'], ['w', 'w'], ['d', 'd'], ['rot', 'rot'], ['h', 'h']]) { const v = num(k); if (v != null) b[key] = v; }
  $('inW').value = b.w; $('inD').value = b.d; $('inR').value = b.rot; $('inH').value = b.h;
  $('oW').textContent = b.w + ' m'; $('oD').textContent = b.d + ' m'; $('oR').textContent = b.rot + '°'; $('oH').textContent = b.h + ' m';
}

// ---------------------------------------------------------------- start
$('hssCredits').textContent = CREDITS;
document.querySelectorAll('.needs-site').forEach((e) => e.classList.add('locked'));
initMap();
{
  const u = new URLSearchParams(location.search);
  const dt = u.get('date'); if (dt && /^\d{4}-\d\d-\d\d$/.test(dt)) { S.date = [+dt.slice(5, 7), +dt.slice(8, 10)]; }
  setDate(...S.date);
  const t = u.get('t'); if (t && /^\d\d:\d\d$/.test(t)) { S.tmin = +t.slice(0, 2) * 60 + +t.slice(3); $('inT').value = S.tmin; $('oT').textContent = t; }
  if (u.has('lat') && u.has('lon')) pickPoint(+u.get('lat'), +u.get('lon'), u.get('q') || null);
}
// test hook: the block's own shadow on bare terrain (ignoring the city) against the closed-form tip length
function testPropShadow(tmin) {
  const site = S.site, b = S.block, sun = sunAt(tmin), tanE = Math.tan(sun.elev * Math.PI / 180);
  const gp = sweep(propRaster(), sun.azG, tanE, SH_P);
  let best = -1e9, bestK = -1, n = 0, mx = 0, my = 0;
  for (let j = 0; j < NR; j++) for (let i = 0; i < NR; i++) {
    const k = j * NR + i; if (propSurf[k] > -1e8) continue;
    const x = cx(i), y = cx(j);
    if (shAt(SH_P, gp, x, y) > site.terr[k] + TOL) { const pr = (x - b.x) * gp.sx + (y - b.y) * gp.sy; if (pr > best) { best = pr; bestK = k; } n++; mx += x; my += y; }
  }
  let corner = -1e9; for (const [x, y] of b.ring) corner = Math.max(corner, (x - b.x) * gp.sx + (y - b.y) * gp.sy);
  const zTip = bestK >= 0 ? site.terr[bestK] : b.base;
  const cBear = (Math.atan2(mx / n - b.x, my / n - b.y) * 180 / Math.PI + 360) % 360;
  return { elev: sun.elev, az: sun.az, azG: sun.azG, tip: best, expected: corner + (b.top - zTip) / tanE, cells: n, centroidBearing: cBear, shadowBearing: (sun.azG + 180) % 360 };
}
Object.assign(window.HSS, { map, testPropShadow, setTime, setDate, setLayer, setTab, pickPoint, rebuildBlock, update, computeDay, drawPlan, fitPlan, W2S, S2W, P, FRAME, NF, sunAt });
