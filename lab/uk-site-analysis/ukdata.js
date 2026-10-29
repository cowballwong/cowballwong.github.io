// UK Site Analysis (anzonwong.com Lab): the England data loaders and the LiDAR building footprints.
// Every source here sends an open CORS header (tested with curl on 28 Oct 2026, then from the page itself):
//   Environment Agency LiDAR Composite DTM / first-return DSM / last-return DSM, 1 m, WCS 2.0.1 (GeoServer), GeoTIFF;
//   Defra strategic noise mapping Round 4, road and rail, WCS 2.0.1, 10 m;
//   planning.data.gov.uk entity API (MHCLG), geometry + intersects;
//   Natural England Priority Habitats Inventory, ArcGIS FeatureServer;
//   Open-Meteo historical weather API (ERA5 reanalysis, Copernicus Climate Change Service), CC BY 4.0;
//   NaPTAN (DfT) as static tiles built by make_naptan.py (the NaPTAN API has no CORS header);
//   OS Open Roads (Ordnance Survey, OS OpenData) as static 10 km tiles built by make_openroads.py: roads, street names and the
//   walking network (29 Oct 2026: Overpass was at capacity, so OSM is no longer the source of roads);
//   OpenStreetMap through the public Overpass API, an optional extra only (footpaths and building names when it answers).
// Coordinates: British National Grid (EPSG:27700) metres throughout; proj4 with the standard OSGB36 7-parameter Helmert
// (no OSTN15 grid), good to about 2 to 5 m when converting to and from latitude and longitude. Raster data and the
// NaPTAN, habitat and noise layers are native BNG; only planning.data.gov.uk geometry (WGS84) passes through proj4.

const WCS = 'https://environment.data.gov.uk/spatialdata/';
export const COV = {
  dtm: ['lidar-composite-digital-terrain-model-dtm-1m', '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m'],
  fz: ['lidar-composite-digital-surface-model-first-return-dsm-1m', 'df4e3ec3-315e-48aa-aaaf-b5ae74d7b2bb__Lidar_Composite_Elevation_FZ_DSM_1m'],
  lz: ['lidar-composite-digital-surface-model-last-return-dsm-1m', '9ba4d5ac-d596-445a-9056-dae3ddec0178__Lidar_Composite_Elevation_LZ_DSM_1m'],
  road16: ['road-noise-all-metrics-england-round-4', '562c9d56-7c2d-4d42-83bb-578d6e97a517__Road_Noise_LAeq16hr_England_Round_4_All'],
  roadN: ['road-noise-all-metrics-england-round-4', '562c9d56-7c2d-4d42-83bb-578d6e97a517__Road_Noise_Lnight_England_Round_4_All'],
  rail16: ['noise-data', '3fb3c2d7-292c-4e0a-bd5b-d8e4e1fe2947__Rail_Noise_LAeq16hr_England_Round_4_All'],
  railN: ['noise-data', '3fb3c2d7-292c-4e0a-bd5b-d8e4e1fe2947__Rail_Noise_Lnight_England_Round_4_All'],
};
const PLAN_API = 'https://www.planning.data.gov.uk/entity.json';
const PHI_URL = 'https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/Priority_Habitats_Inventory_England/FeatureServer/0/query';
const METEO_URL = 'https://archive-api.open-meteo.com/v1/archive';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

// ---------- fetch helpers ----------
export async function fetchT(url, { ms = 60000, tries = 2, type = 'json', init = {} } = {}) {
  let last;
  for (let t = 1; t <= tries; t++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { ...init, signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return type === 'json' ? await r.json() : type === 'buf' ? await r.arrayBuffer() : await r.text();
    } catch (e) { last = e.name === 'AbortError' ? new Error('timed out') : e; } finally { clearTimeout(timer); }
  }
  throw last;
}

// ---------- a small GeoTIFF reader: one band float32, tiles or strips, no compression or Deflate (zlib) ----------
// GeoServer writes the georeference as a ModelTransformation (pixel-is-area, top-left corner); tie point + scale is also read.
async function inflate(u8) {
  const ds = new DecompressionStream('deflate');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
}
export async function readTiff(buf) {
  const dv = new DataView(buf), le = dv.getUint16(0) === 0x4949;
  if (dv.getUint16(2, le) !== 42) throw new Error('not a classic TIFF');
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  const ifd = u32(4), n = u16(ifd), tags = {};
  const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), size = (SZ[type] || 1) * cnt;
    const off = size > 4 ? u32(e + 8) : e + 8, vals = [];
    for (let k = 0; k < cnt; k++) {
      const o = off + k * (SZ[type] || 1);
      vals.push(type === 3 ? u16(o) : type === 4 ? u32(o) : type === 12 ? dv.getFloat64(o, le) : type === 11 ? dv.getFloat32(o, le) : type === 2 || type === 1 ? dv.getUint8(o) : u32(o));
    }
    tags[tag] = vals;
  }
  const W = tags[256][0], H = tags[257][0], comp = (tags[259] || [1])[0], bps = (tags[258] || [32])[0], fmt = (tags[339] || [3])[0], pred = (tags[317] || [1])[0];
  if (bps !== 32 || fmt !== 3) throw new Error('TIFF is not float32');
  if (comp !== 1 && comp !== 8 && comp !== 32946) throw new Error('TIFF compression ' + comp);
  if (pred !== 1) throw new Error('TIFF predictor ' + pred);
  const out = new Float32Array(W * H);
  const tiled = !!tags[322], tw = tiled ? tags[322][0] : W, th = tiled ? tags[323][0] : (tags[278] || [H])[0];
  const offs = tiled ? tags[324] : tags[273], cnts = tiled ? tags[325] : tags[279];
  const across = tiled ? Math.ceil(W / tw) : 1;
  const parts = await Promise.all(offs.map((o, i) => { const b = new Uint8Array(buf, o, cnts[i]); return comp === 1 ? b.slice() : inflate(b); }));
  parts.forEach((p, i) => {
    const f = new Float32Array(p.buffer, p.byteOffset, p.byteLength >> 2), tx = (i % across) * tw, ty = Math.floor(i / across) * th;
    const fv = le ? f : null, pdv = le ? null : new DataView(p.buffer, p.byteOffset, p.byteLength);
    for (let r = 0; r < th && ty + r < H; r++) for (let c = 0; c < tw && tx + c < W; c++) {
      const v = fv ? fv[r * tw + c] : pdv.getFloat32((r * tw + c) * 4, false);
      out[(ty + r) * W + tx + c] = v < -1e30 || v === -96 || !Number.isFinite(v) ? NaN : v;
    }
  });
  let x0, y1, rx, ry;
  if (tags[34264]) { const m = tags[34264]; rx = m[0]; ry = -m[5]; x0 = m[3]; y1 = m[7]; }
  else if (tags[33922] && tags[33550]) { const tp = tags[33922], sc = tags[33550]; rx = sc[0]; ry = sc[1]; x0 = tp[3] - tp[0] * rx; y1 = tp[4] + tp[1] * ry; }
  else throw new Error('TIFF has no georeference');
  return { W, H, x0, y1, rx, ry, data: out };
}
// one WCS coverage over a BNG box (metres), Deflate tiles; scale < 1 asks GeoServer to resample (e.g. 0.2 -> 5 m)
export async function wcs(key, E0, N0, E1, N1, { scale = 1, ms = 60000 } = {}) {
  const [svc, id] = COV[key];
  const q = `service=WCS&version=2.0.1&request=GetCoverage&CoverageId=${id}&format=image/tiff&subset=E(${E0},${E1})&subset=N(${N0},${N1})` +
    '&geotiff:compression=DEFLATE&geotiff:tiling=true&geotiff:tilewidth=256&geotiff:tileheight=256' + (scale !== 1 ? `&SCALEFACTOR=${scale}` : '');
  const buf = await fetchT(`${WCS}${svc}/wcs?${q}`, { type: 'buf', ms });
  return readTiff(buf);
}

// ---------- LiDAR building footprints ----------
// Method (tuned 28 Oct 2026 against OS OpenMap Local buildings in a Hertfordshire city centre and Ashwell; see qa_footprints.py):
//   above = first-return DSM - DTM >= 2.5 m; solid = first-return - last-return < 0.5 m (a laser pulse that does not pass
//   through, i.e. a roof, not a tree); opening 3x3; parts < 20 m2 dropped; regrown 2 px onto 'above' pixels (roof edges fail
//   the solid test); holes up to 16 m2 filled; 4-connected parts >= 20 m2 with at least half their pixels solid are buildings.
// Each part is traced along its pixel edges and simplified (Douglas-Peucker 0.8 m). Height: top = 85th percentile of the
// first-return surface over the part; a part of it at least 5 m higher (a tower, at least 12 m2) becomes a second block on top.
export const FP = { hmin: 2.5, dmax: 0.5, minA: 20, grow: 2, hole: 16, tol: 0.8, tierUp: 5, tierMin: 12, q: 0.85 };

function erode(m, W, H) {
  const o = new Uint8Array(W * H);
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = j * W + i; if (!m[k]) continue;
    if (m[k - 1] && m[k + 1] && m[k - W] && m[k + W] && m[k - W - 1] && m[k - W + 1] && m[k + W - 1] && m[k + W + 1]) o[k] = 1;
  }
  return o;
}
function dilate(m, W, H, allow = null) {
  const o = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (m[k]) { o[k] = 1; continue; }
    if (allow && !allow[k]) continue;
    let hit = 0;
    for (let v = -1; v <= 1 && !hit; v++) { const jj = j + v; if (jj < 0 || jj >= H) continue; for (let u = -1; u <= 1; u++) { const ii = i + u; if (ii >= 0 && ii < W && m[jj * W + ii]) { hit = 1; break; } } }
    o[k] = hit;
  }
  return o;
}
// 4-connected labels of m (non-zero) -> Int32Array (0 = none), sizes[]
function label(m, W, H) {
  const lab = new Int32Array(W * H), sizes = [0], st = new Int32Array(W * H);
  let n = 0;
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || lab[s]) continue;
    n++; let top = 0, cnt = 0; st[top++] = s; lab[s] = n;
    while (top) {
      const k = st[--top]; cnt++;
      const i = k % W, j = (k - i) / W;
      if (i > 0 && m[k - 1] && !lab[k - 1]) { lab[k - 1] = n; st[top++] = k - 1; }
      if (i < W - 1 && m[k + 1] && !lab[k + 1]) { lab[k + 1] = n; st[top++] = k + 1; }
      if (j > 0 && m[k - W] && !lab[k - W]) { lab[k - W] = n; st[top++] = k - W; }
      if (j < H - 1 && m[k + W] && !lab[k + W]) { lab[k + W] = n; st[top++] = k + W; }
    }
    sizes.push(cnt);
  }
  return { lab, sizes, n };
}
// boundary loops of one labelled part, along pixel edges, in grid corner coordinates (x east, y south); interior on the right
function traceLoops(lab, W, H, id, bb) {
  const [i0, j0, i1, j1] = bb, out = new Map(), key = (x, y) => y * (W + 1) + x;
  const add = (ax, ay, bx, by) => { const k = key(ax, ay); let a = out.get(k); if (!a) out.set(k, (a = [])); a.push([bx, by]); };
  const inP = (i, j) => i >= 0 && j >= 0 && i < W && j < H && lab[j * W + i] === id;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (lab[j * W + i] !== id) continue;
    if (!inP(i, j - 1)) add(i, j, i + 1, j);
    if (!inP(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!inP(i, j + 1)) add(i + 1, j + 1, i, j + 1);
    if (!inP(i - 1, j)) add(i, j + 1, i, j);
  }
  const loops = [];
  for (const [k0, lst0] of out) {
    while (lst0.length) {
      const sx = k0 % (W + 1), sy = (k0 - sx) / (W + 1), pts = [[sx, sy]];
      let [cx, cy] = lst0.pop(), px = sx, py = sy, guard = 0;
      while (!(cx === sx && cy === sy) && guard++ < 1e6) {
        pts.push([cx, cy]);
        const lst = out.get(key(cx, cy)); if (!lst || !lst.length) break;
        let pick = 0;
        if (lst.length > 1) {                      // a pinch: turn right first (screen coordinates), so 4-connected parts stay apart
          const dx = cx - px, dy = cy - py, rank = ([nx, ny]) => { const ex = nx - cx, ey = ny - cy, cr = dx * ey - dy * ex; return cr > 0 ? 0 : cr === 0 ? 1 : 2; };
          let best = 9; lst.forEach((q, qi) => { const r = rank(q); if (r < best) { best = r; pick = qi; } });
        }
        const [nx, ny] = lst.splice(pick, 1)[0];
        px = cx; py = cy; cx = nx; cy = ny;
      }
      if (pts.length >= 4) loops.push(pts);
    }
  }
  return loops;
}
function dpOpen(pts, a, b, tol, keep) {
  let best = -1, bi = -1; const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
  for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > best) { best = d; bi = i; } }
  if (best > tol) { keep[bi] = 1; dpOpen(pts, a, bi, tol, keep); dpOpen(pts, bi, b, tol, keep); }
}
export function simplifyRing(pts, tol) {
  const n = pts.length; if (n < 4) return pts;
  let far = 0, fd = -1; for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const keep = new Uint8Array(n); keep[0] = 1; keep[far] = 1;
  const ext = pts.concat([pts[0]]);
  dpOpen(ext, 0, far, tol, keep); const k2 = new Uint8Array(n + 1); dpOpen(ext, far, n, tol, k2);
  for (let i = far; i < n; i++) if (k2[i]) keep[i] = 1;
  const o = pts.filter((_, i) => keep[i]);
  return o.length >= 3 ? o : pts;
}
const sArea = (r) => { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
function quant(arr, q) { if (!arr.length) return NaN; const a = Float32Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1) + 0.5))]; }

// dtm, fz, lz: readTiff results on the same 1 m grid. Returns { blocks, canopy, stats }.
export function footprints(dtm, fz, lz, opts = {}) {
  const P = { ...FP, ...opts }, W = dtm.W, H = dtm.H, N = W * H, x0 = dtm.x0, y1 = dtm.y1;
  if (fz.W !== W || lz.W !== W || fz.H !== H || lz.H !== H) throw new Error('LiDAR grids differ');
  const nd = new Float32Array(N), above = new Uint8Array(N), solid = new Uint8Array(N);
  let missing = 0;
  for (let k = 0; k < N; k++) {
    const g = dtm.data[k], a = fz.data[k], b = lz.data[k];
    if (!Number.isFinite(g) || !Number.isFinite(a)) { nd[k] = NaN; missing++; continue; }
    nd[k] = a - g;
    if (nd[k] >= P.hmin) { above[k] = 1; if (Number.isFinite(b) && a - b < P.dmax) solid[k] = 1; }
  }
  // core: solid, opened 3x3, small parts dropped
  let m = dilate(erode(solid, W, H), W, H);
  { const L = label(m, W, H); for (let k = 0; k < N; k++) if (L.lab[k] && L.sizes[L.lab[k]] < P.minA) m[k] = 0; }
  for (let g = 0; g < P.grow; g++) m = dilate(m, W, H, above);
  // small holes filled
  {
    const inv = new Uint8Array(N); for (let k = 0; k < N; k++) inv[k] = m[k] ? 0 : 1;
    const L = label(inv, W, H), edge = new Uint8Array(L.n + 1);
    for (let i = 0; i < W; i++) { edge[L.lab[i]] = 1; edge[L.lab[(H - 1) * W + i]] = 1; }
    for (let j = 0; j < H; j++) { edge[L.lab[j * W]] = 1; edge[L.lab[j * W + W - 1]] = 1; }
    for (let k = 0; k < N; k++) { const l = L.lab[k]; if (l && !edge[l] && L.sizes[l] <= P.hole) m[k] = 1; }
  }
  const L = label(m, W, H);
  const acc = Array.from({ length: L.n + 1 }, () => ({ n: 0, s: 0, bb: [Infinity, Infinity, -1, -1] }));
  for (let k = 0; k < N; k++) {
    const l = L.lab[k]; if (!l) continue;
    const a = acc[l], i = k % W, j = (k - i) / W; a.n++; if (solid[k]) a.s++;
    if (i < a.bb[0]) a.bb[0] = i; if (j < a.bb[1]) a.bb[1] = j; if (i > a.bb[2]) a.bb[2] = i; if (j > a.bb[3]) a.bb[3] = j;
  }
  const toEN = ([x, y]) => [x0 + x, y1 - y];
  const blocks = [], keepLab = new Uint8Array(L.n + 1);
  let id = 0;
  for (let l = 1; l <= L.n; l++) {
    const a = acc[l]; if (a.n < P.minA || a.s / a.n < 0.5) continue;
    keepLab[l] = 1;
    const loops = traceLoops(L.lab, W, H, l, a.bb).map((lp) => simplifyRing(lp, P.tol).map(toEN)).filter((r) => r.length >= 3 && Math.abs(sArea(r)) >= 2);
    if (!loops.length) continue;
    loops.sort((p, q) => Math.abs(sArea(q)) - Math.abs(sArea(p)));
    const ring = sArea(loops[0]) > 0 ? loops[0] : loops[0].slice().reverse();            // outer counter-clockwise in E, N
    const holes = loops.slice(1).map((h) => (sArea(h) < 0 ? h : h.slice().reverse()));
    // heights from the pixels of this part
    const zs = [], gs = [];
    for (let j = a.bb[1]; j <= a.bb[3]; j++) for (let i = a.bb[0]; i <= a.bb[2]; i++) { const k = j * W + i; if (L.lab[k] === l && Number.isFinite(fz.data[k])) { zs.push(fz.data[k]); gs.push(dtm.data[k]); } }
    if (!zs.length) continue;
    let gmin = Infinity; for (const g of gs) if (g < gmin) gmin = g;
    const ztop = quant(zs, P.q);
    id++;
    const base = { id: 'L' + id, ring, holes, zb: gmin, zt: ztop, gmin, area: a.n, pix: l, src: 'lidar' };
    blocks.push(base);
    // a tower: pixels at least tierUp above the base top, grouped, each its own block on top of the base
    const hi = new Uint8Array(N); let nh = 0;
    for (let j = a.bb[1]; j <= a.bb[3]; j++) for (let i = a.bb[0]; i <= a.bb[2]; i++) { const k = j * W + i; if (L.lab[k] === l && fz.data[k] >= ztop + P.tierUp) { hi[k] = 1; nh++; } }
    if (nh >= P.tierMin) {
      const T = label(hi, W, H);
      for (let t = 1; t <= T.n; t++) {
        if (T.sizes[t] < P.tierMin) continue;
        let bb = [Infinity, Infinity, -1, -1]; const tz = [];
        for (let j = a.bb[1]; j <= a.bb[3]; j++) for (let i = a.bb[0]; i <= a.bb[2]; i++) { const k = j * W + i; if (T.lab[k] === t) { tz.push(fz.data[k]); if (i < bb[0]) bb[0] = i; if (j < bb[1]) bb[1] = j; if (i > bb[2]) bb[2] = i; if (j > bb[3]) bb[3] = j; } }
        const tl = traceLoops(T.lab, W, H, t, bb).map((lp) => simplifyRing(lp, P.tol).map(toEN)).filter((r) => r.length >= 3 && Math.abs(sArea(r)) >= 2);
        if (!tl.length) continue;
        tl.sort((p, q) => Math.abs(sArea(q)) - Math.abs(sArea(p)));
        const tr = sArea(tl[0]) > 0 ? tl[0] : tl[0].slice().reverse();
        blocks.push({ id: 'L' + id, ring: tr, holes: [], zb: ztop, zt: quant(tz, 0.95), gmin, area: T.sizes[t], tier: 2, src: 'lidar' });
      }
    }
  }
  // tree canopy: above ground and not a building, as a 1 m mask (for the green diagram)
  const canopy = new Uint8Array(N); let nCan = 0;
  for (let k = 0; k < N; k++) if (above[k] && !(L.lab[k] && keepLab[L.lab[k]]) && nd[k] >= 3) { canopy[k] = 1; nCan++; }
  return { blocks, canopy: { W, H, x0, y1, m: canopy }, stats: { pixels: N, missing, parts: L.n, buildings: id, blocks: blocks.length, canopyPx: nCan } };
}

// ---------- planning.data.gov.uk ----------
// WKT -> polygons [{outer, holes}] or points [[E, N]] in BNG
function wktNums(s) { const o = []; for (const p of s.split(',')) { const t = p.trim().split(/\s+/); if (t.length >= 2) o.push([+t[0], +t[1]]); } return o; }
export function parseWKT(wkt, toEN) {
  if (!wkt) return { polys: [], points: [] };
  const s = String(wkt).trim(), type = s.slice(0, s.indexOf('(')).trim().toUpperCase(), body = s.slice(s.indexOf('('));
  const polys = [], points = [];
  const ring = (txt) => wktNums(txt).map(([lon, lat]) => toEN(lat, lon));
  if (type.startsWith('POINT')) { const n = wktNums(body.replace(/[()]/g, '')); for (const [lon, lat] of n) points.push(toEN(lat, lon)); }
  else if (type.startsWith('MULTIPOINT')) { for (const [lon, lat] of wktNums(body.replace(/[()]/g, ''))) points.push(toEN(lat, lon)); }
  else if (type.startsWith('POLYGON') || type.startsWith('MULTIPOLYGON')) {
    // split into polygons: each polygon is "((ring),(hole),...)"
    const polyTxt = type.startsWith('MULTI') ? body.slice(1, -1).split(/\)\s*\)\s*,\s*\(\s*\(/) : [body.slice(1, -1)];
    for (let pt of polyTxt) {
      pt = pt.replace(/^\s*\(+/, '').replace(/\)+\s*$/, '');
      const rings = pt.split(/\)\s*,\s*\(/).map(ring).filter((r) => r.length >= 3);
      if (rings.length) polys.push({ outer: rings[0], holes: rings.slice(1) });
    }
  }
  return { polys, points };
}
export const PLAN_SETS = [
  // [dataset, kind, national?]
  ['conservation-area', 'poly', false], ['listed-building', 'point', true], ['listed-building-outline', 'poly', false],
  ['scheduled-monument', 'poly', true], ['park-and-garden', 'poly', true], ['world-heritage-site', 'poly', true],
  ['green-belt', 'poly', true], ['area-of-outstanding-natural-beauty', 'poly', true], ['national-park', 'poly', true],
  ['article-4-direction-area', 'poly', false], ['tree-preservation-zone', 'poly', false], ['tree', 'point', false],
];
async function entities(dataset, wkt, extra = '') {
  const out = []; let url = `${PLAN_API}?dataset=${dataset}&geometry=${encodeURIComponent(wkt)}&geometry_relation=intersects&limit=500${extra}`;
  for (let page = 0; url && page < 8; page++) {
    const j = await fetchT(url, { ms: 45000 });
    out.push(...(j.entities || []));
    url = j.links && j.links.next ? j.links.next : null;
    if ((j.entities || []).length < 500) break;
  }
  return out;
}
// the local planning authority at a point, and the councils (organisation entities) that publish for it
export async function planAuthority(lat, lon) {
  const j = await fetchT(`${PLAN_API}?dataset=local-planning-authority&geometry=${encodeURIComponent(`POINT(${lon} ${lat})`)}&geometry_relation=intersects&limit=5`, { ms: 30000 });
  // QA round 2 (29 Oct): prefer the authority without an end date (Whitby returned the abolished Scarborough LPA first, so no
  // council was found and the 'no data published' line went missing across the 2023 reorganisations)
  const ents = j.entities || [], lpa = ents.find((e) => !e['end-date']) || ents[0]; if (!lpa) return null;
  const orgs = [];
  for (const ds of ['local-authority', 'national-park-authority', 'development-corporation']) {
    try {
      const o = await fetchT(`${PLAN_API}?dataset=${ds}&limit=500`, { ms: 30000 });
      for (const e of o.entities || []) if (e['local-planning-authority'] === lpa.reference && !e['end-date']) orgs.push({ entity: e.entity, name: e.name });
    } catch (e) { /* a missing organisation list only weakens the 'no data published' wording */ }
  }
  return { reference: lpa.reference, name: lpa.name, orgs };
}
// quick England test (QA round 2): true if a local planning authority covers the point, false if none does
export async function lpaAt(lat, lon) {
  const j = await fetchT(`${PLAN_API}?dataset=local-planning-authority&geometry=${encodeURIComponent(`POINT(${lon} ${lat})`)}&geometry_relation=intersects&limit=5&field=reference`, { ms: 12000 });
  return (j.entities || []).length > 0;
}
export async function publishes(dataset, orgs) {
  for (const o of orgs) {
    const j = await fetchT(`${PLAN_API}?dataset=${dataset}&organisation_entity=${o.entity}&limit=1`, { ms: 30000 });
    if ((j.count || (j.entities || []).length) > 0) return true;
  }
  return false;
}
// all constraint layers + flood zones for a box (BNG) -> { sets: {ds: {items, error}}, flood: {items, error}, wkt }
export async function planning(box, toLL, toEN) {
  const [E0, N0, E1, N1] = box, c = [[E0, N0], [E1, N0], [E1, N1], [E0, N1], [E0, N0]].map(([E, N]) => toLL(E, N));
  const wkt = 'POLYGON((' + c.map(([lat, lon]) => `${lon.toFixed(6)} ${lat.toFixed(6)}`).join(',') + '))';
  const conv = (e, kind) => {
    const g = parseWKT(e.geometry || e.point, toEN);
    return { name: e.name || '', ref: e.reference || '', ds: e.dataset, grade: e['listed-building-grade'] || null, level: e['flood-risk-level'] || null,
      type: e['flood-risk-type'] || e['tree-preservation-zone-type'] || null, org: e['organisation-entity'] || null, entry: e['entry-date'] || null,
      polys: kind === 'point' ? [] : g.polys, points: kind === 'point' ? (g.points.length ? g.points : g.polys.map((p) => p.outer[0])) : [] };
  };
  const sets = {};
  await Promise.all(PLAN_SETS.map(async ([ds, kind]) => {
    try { sets[ds] = { items: (await entities(ds, wkt)).map((e) => conv(e, kind)) }; } catch (e) { sets[ds] = { error: String(e.message || e) }; }
  }));
  let flood;
  try { flood = { items: (await entities('flood-risk-zone', wkt)).map((e) => conv(e, 'poly')) }; } catch (e) { flood = { error: String(e.message || e) }; }
  return { sets, flood, wkt };
}

// ---------- Natural England Priority Habitats Inventory ----------
export async function habitats(box) {
  const out = [];
  for (let off = 0; off < 20000; off += 2000) {
    const q = new URLSearchParams({ where: '1=1', geometry: box.join(','), geometryType: 'esriGeometryEnvelope', inSR: '27700', outSR: '27700',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'MainHabs,AreaHa', returnGeometry: 'true', resultOffset: String(off), resultRecordCount: '2000', f: 'geojson' });
    const j = await fetchT(PHI_URL + '?' + q, { ms: 45000 });
    if (j.error) throw new Error(j.error.message || 'habitat service error');
    const fs = j.features || []; out.push(...fs);
    if (fs.length < 2000 && !(j.properties && j.properties.exceededTransferLimit) && !j.exceededTransferLimit) break;
  }
  return out;
}

// ---------- Open-Meteo ERA5 wind rose (16 sectors, 10 m) ----------
export async function windRose(lat, lon, y0 = 2016, y1 = 2025) {
  const u = `${METEO_URL}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=${y0}-01-01&end_date=${y1}-12-31&hourly=wind_speed_10m,wind_direction_10m&models=era5&timezone=UTC&wind_speed_unit=ms`;
  const j = await fetchT(u, { ms: 60000 });
  const t = j.hourly && j.hourly.time, sp = j.hourly && j.hourly.wind_speed_10m, dr = j.hourly && j.hourly.wind_direction_10m;
  if (!t || !sp || !dr || !t.length) throw new Error('no wind data');
  const annual = new Array(16).fill(0), summer = new Array(16).fill(0), winter = new Array(16).fill(0);
  let nA = 0, nS = 0, nW = 0, calm = 0, sum = 0, sumS = 0;
  for (let i = 0; i < t.length; i++) {
    const v = sp[i], d = dr[i]; if (v == null || d == null) continue;
    const mo = +t[i].slice(5, 7); nA++; sum += v;
    const isS = mo >= 6 && mo <= 8, isW = mo === 12 || mo <= 2; if (isS) { nS++; sumS += v; } if (isW) nW++;
    if (v < 0.5) { calm++; continue; }                          // calm: no direction
    const s = Math.round((((d % 360) + 360) % 360) / 22.5) % 16;
    annual[s]++; if (isS) summer[s]++; if (isW) winter[s]++;
  }
  if (!nA) throw new Error('no wind data');
  return { annual: annual.map((v) => v / nA), summer: summer.map((v) => v / Math.max(1, nS)), winter: winter.map((v) => v / Math.max(1, nW)),
    calm: calm / nA, mean: sum / nA, meanSummer: sumS / Math.max(1, nS), hours: nA, years: [y0, y1], at: [j.latitude, j.longitude], level: 10, src: 'ERA5' };
}

// ---------- NaPTAN static tiles (make_naptan.py) ----------
const napCache = new Map();
export async function naptan(base, E, N, R = 2500) {
  const keys = new Set();
  for (const dx of [-R, R]) for (const dy of [-R, R]) keys.add(`${Math.floor((E + dx) / 1e5)}_${Math.floor((N + dy) / 1e5)}`);
  const idx = napCache.get('index') || (await fetchT(new URL('index.json', base).href, { ms: 20000 }));
  napCache.set('index', idx);
  const bus = [], stations = [], exits = [];
  for (const k of keys) {
    if (!idx.tiles[k]) continue;
    let t = napCache.get(k);
    if (!t) { t = await fetchT(new URL(k + '.json', base).href, { ms: 30000 }); napCache.set(k, t); }
    let e = 0, n = 0;
    for (let i = 0; i < t.bus.length; i += 2) { e += t.bus[i]; n += t.bus[i + 1]; if (Math.abs(e - E) <= R && Math.abs(n - N) <= R) bus.push([e, n]); }
    const st = t.st.map(([sE, sN, name, kind]) => ({ E: sE, N: sN, name, kind }));
    for (const [xE, xN, si] of t.ex) if (Math.hypot(xE - E, xN - N) <= R) exits.push({ E: xE, N: xN, station: st[si] });
    for (const s of st) if (Math.hypot(s.E - E, s.N - N) <= R) stations.push(s);
  }
  return { bus, stations, exits, snapshot: idx.snapshot, tiles: [...keys].filter((k) => idx.tiles[k]) };
}
export async function naptanIndex(base) { const i = napCache.get('index') || (await fetchT(new URL('index.json', base).href, { ms: 20000 })); napCache.set('index', i); return i; }

// ---------- OS Open Roads static tiles (make_openroads.py) ----------
// Each link: { fn: road function, fow: form of way, tunnel, en: name1, ref: road number, pts: [[E, N], ...] } in BNG metres.
// A link crossing a tile edge is in both tiles (possibly written the other way round); duplicates are dropped here.
// Format "orb1" (index.format): zlib-compressed binary tiles <tx>_<ty>.bin, layout documented in make_openroads.py.
const ORB_STREAMS = ['str', 'atab', 'attr', 'cnt', 'sc', 'sxy', 'vxf', 'vxr', 'vyf', 'vyr'];
function decodeOrb(u8) {
  if (u8[0] !== 0x4f || u8[1] !== 0x52 || u8[2] !== 0x42 || u8[3] !== 0x31) throw new Error('not an ORB1 road tile');
  let o = 4;
  const rd = () => { let v = 0, m = 1, c; do { c = u8[o++]; v += (c & 127) * m; m *= 128; } while (c >= 128); return v; };
  const [Q, tx, ty, nl, na, ns] = [rd(), rd(), rd(), rd(), rd(), rd()];
  const st = {}, lens = ORB_STREAMS.map(rd);
  ORB_STREAMS.forEach((k, i) => { st[k] = { b: u8.subarray(o, o + lens[i]), p: 0 }; o += lens[i]; });
  const r = (s) => { let v = 0, m = 1, c; do { c = s.b[s.p++]; v += (c & 127) * m; m *= 128; } while (c >= 128); return v; };
  const rs = (f, x) => { let c = f.b[f.p++], v = c & 127, m = 128; while (c >= 128) { c = x.b[x.p++]; v += (c & 127) * m; m *= 128; } return v; };
  const uz = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);
  const strs = [''].concat(ns ? new TextDecoder().decode(st.str.b).split('\n') : []);
  const attrs = [];
  for (let i = 0; i < na; i++) { const k = st.atab.b[st.atab.p++]; attrs.push([k, strs[r(st.atab)], strs[r(st.atab)]]); }
  const T = 10000, ox = tx * T, oy = ty * T, hist = [], mtf = [], links = [];
  let ex = 0, ey = 0, nxt = 0;
  for (let i = 0; i < nl; i++) {
    const sc = r(st.sc);
    let s;
    if (sc === 0) s = hist[hist.length - 1];
    else if (sc === 1) { s = [ex + uz(r(st.sxy)), ey + uz(r(st.sxy))]; hist.push(s); }
    else s = hist[hist.length - sc];
    const ac = r(st.attr), a = ac === 0 ? attrs[nxt++] : mtf.splice(ac - 1, 1)[0];
    mtf.unshift(a);
    const n = r(st.cnt) + 1, pts = [[ox + s[0] * Q, oy + s[1] * Q]];
    let x = s[0], y = s[1];
    for (let j = 0; j < n; j++) { x += uz(rs(st.vxf, st.vxr)); y += uz(rs(st.vyf, st.vyr)); pts.push([ox + x * Q, oy + y * Q]); }
    ex = x; ey = y; hist.push([x, y]);
    links.push({ k: a[0], en: a[1], ref: a[2], pts });
  }
  return links;
}
function legacyRoadTile(t) {   // the first (JSON) tile format, kept so an older tile set still loads
  const [ox, oy] = t.o;
  return t.l.map((l) => {
    let e = ox + l[3], n = oy + l[4]; const pts = [[e, n]];
    for (let i = 5; i < l.length; i += 2) { e += l[i]; n += l[i + 1]; pts.push([e, n]); }
    return { k: l[0], en: l[1] ? t.n[l[1]] : '', ref: l[2] ? t.n[l[2]] : '', pts };
  });
}
const rdCache = new Map();
export async function openRoads(base, E0, N0, E1, N1) {
  const idx = rdCache.get('index') || (await fetchT(new URL('index.json', base).href, { ms: 20000 }));
  rdCache.set('index', idx);
  const T = idx.tile_m, bin = idx.format === 'orb1', links = [], seen = new Set(), used = [];
  for (let tx = Math.floor(E0 / T); tx <= Math.floor(E1 / T); tx++) for (let ty = Math.floor(N0 / T); ty <= Math.floor(N1 / T); ty++) {
    const k = `${tx}_${ty}`; if (!idx.tiles[k]) continue;
    let t = rdCache.get(k);
    if (!t) {
      t = bin ? decodeOrb(await inflate(new Uint8Array(await fetchT(new URL(k + (idx.ext || '.bin'), base).href, { ms: 30000, type: 'buf' }))))
        : legacyRoadTile(await fetchT(new URL(k + '.json', base).href, { ms: 30000 }));
      rdCache.set(k, t);
    }
    used.push(k);
    for (const l of t) {
      const pts = l.pts;
      let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
      for (const [e, n] of pts) { if (e < lo0) lo0 = e; if (e > lo1) lo1 = e; if (n < la0) la0 = n; if (n > la1) la1 = n; }
      if (lo1 < E0 || lo0 > E1 || la1 < N0 || la0 > N1) continue;
      const a = pts[0], b = pts[pts.length - 1], fwd = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
      const p = fwd ? a : b, q = fwd ? b : a, key = `${l.k}|${l.en}|${p[0]},${p[1]}|${q[0]},${q[1]}|${pts.length}`;
      if (seen.has(key)) continue; seen.add(key);
      links.push({ fn: idx.function[l.k >> 5], fow: idx.formOfWay[(l.k >> 1) & 15], tunnel: (l.k & 1) === 1, en: l.en, ref: l.ref, pts });
    }
  }
  return { links, release: idx.release, tiles: used };
}

// ---------- OpenStreetMap (Overpass), optional extra ----------
export async function overpass(s, w, n, e, ms = 12000) {
  const q = `[out:json][timeout:20];(way["highway"](${s},${w},${n},${e});way["building"]["name"](${s},${w},${n},${e}););out geom qt;`;
  let last = null;
  const t0 = performance.now();
  for (const url of OVERPASS) {
    const left = ms - (performance.now() - t0); if (left < 3000) break;
    try {
      const j = await fetchT(url, { ms: left, tries: 1, init: { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } });
      if (!j || !Array.isArray(j.elements)) throw new Error('no elements');
      return { elements: j.elements, osm_base: j.osm3s && j.osm3s.timestamp_osm_base, server: url };
    } catch (err) { last = err; }
  }
  throw last || new Error('Overpass did not answer');
}
