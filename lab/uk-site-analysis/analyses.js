// UK Site Analysis (28 Oct 2026), copied from HK Site Analysis v3 and adapted: three analyses worked out in the browser from
// the data app.js already holds:
//   res.sunh  hours of direct sun at ground level on 21 Mar, 21 Jun and 21 Dec over the frame (clock time GMT / BST),
//   res.walk  5 and 10 minute walking catchment along OS Open Roads (plus OpenStreetMap paths when the Overpass API answered),
//   res.svf   sky view factor at 1.5 m above ground over the frame.
// Blocks are the LiDAR-derived prisms of app.js / ukdata.js; terrain the LiDAR DTM resampled to 5 m (res.dem.cell).
// The site is taken as cleared (its own blocks cast nothing), as in v2. Every number comes from the loaded data.
//
// Shading model (sunh, svf): a surface raster (DSM) of every non-site block top (2 m cells over the frame + 500 m, the
// same blocks app.js loads), marched cell by cell toward the sun with a 32 m max-pyramid to skip empty sky; terrain
// from the 5 m DTM through a precomputed horizon (same convention as app.js: hill 60 m or more away, 2 m tolerance).
// Checked against app.js rayHits (exact prism test) and in Python (shapely rays, Astronomical Almanac sun).

const SPEED = 80;                       // walking speed, m per minute
const MINS = [5, 10];
const STEP_MIN = 10;                    // sun time step, minutes
const MIN_ALT = 2;                      // sun counted only above this altitude, deg
const HILL_NEAR = 60;                   // as app.js: terrain nearer than this is not a hill (the DTM carries canopy and flyovers)
const SVF_RAYS = 36;
const TERR_AZ = 72;                     // terrain horizon bins (5 deg)
const DATES = [{ id: 'mar', m: 3, d: 21, en: '21 Mar' }, { id: 'jun', m: 6, d: 21, en: '21 Jun' }, { id: 'dec', m: 12, d: 21, en: '21 Dec' }];

const soft = (p) => p.catch((e) => { console.warn(e); return { error: String((e && e.message) || e) }; });
const now = () => performance.now();
const r1 = (v) => Math.round(v * 10) / 10;
// a usable name: trimmed, and not a bare "MTR" or "station" placeholder (which would print "MTR MTR")
const nm = (s) => { const t = s == null ? '' : String(s).trim(); return !t || /^(mtr|station)$/i.test(t) ? '' : t; };

// ---------------------------------------------------------------- fetch (runs in parallel with app.js loads)
async function pagedGeo(ctx, base, box, fields, extra = {}) {
  const N = 2000;
  const common = { where: '1=1', geometry: box.map((v) => v.toFixed(1)).join(','), geometryType: 'esriGeometryEnvelope', inSR: '2326', spatialRel: 'esriSpatialRelIntersects' };
  const url = (o) => base + '?' + new URLSearchParams({ ...common, ...o });
  const page = (off) => ctx.fetchJSON(url({ outFields: fields, outSR: '2326', returnGeometry: 'true', orderByFields: 'OBJECTID', resultOffset: String(off), resultRecordCount: String(N), f: 'geojson', ...extra }));
  const cntP = ctx.fetchJSON(url({ returnCountOnly: 'true', f: 'json' })).then((j) => j.count).catch(() => null);
  const first = page(0);
  const cnt = await cntP;
  const pages = [first];
  if (cnt != null) for (let off = N; off < cnt; off += N) pages.push(page(off));
  const got = await Promise.all(pages);
  let out = got.flatMap((j) => j.features || []);
  // the count can lag the data: keep paging while the last page came back full
  let off = N * pages.length, last = got[got.length - 1];
  while (last && (last.features || []).length >= N) { last = await page(off); out = out.concat(last.features || []); off += N; }
  const seen = new Set();
  return out.filter((ft) => { const id = ft.id != null ? ft.id : ft.properties && ft.properties.OBJECTID; if (seen.has(id)) return false; seen.add(id); return true; });
}
const geoLines = (g) => (!g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);

export async function fetchExtra3_HK_unused(R, f, ctx) {
  const t0 = now();
  try {
    const bb = ctx.ringBox(R), M = MINS[1] * SPEED + 30;
    const box = [bb[0] - M, bb[1] - M, bb[2] + M, bb[3] + M];
    const busBox = [bb[0] - MINS[0] * SPEED - 60, bb[1] - MINS[0] * SPEED - 60, bb[2] + MINS[0] * SPEED + 60, bb[3] + MINS[0] * SPEED + 60];
    const out = { box, busBox };
    const pedP = soft(pagedGeo(ctx, ctx.PED_URL, box, 'OBJECTID,FeatureType,Location,Enabled,Direction', { returnZ: 'true', geometryPrecision: '1' }).then((fs) => { out.tPed = now() - t0; return fs; }));
    const busP = soft(pagedGeo(ctx, ctx.BUS_URL, busBox, 'OBJECTID', { geometryPrecision: '1' }));
    const [ped, bus] = await Promise.all([pedP, busP]);
    out.ped = ped; out.bus = bus;
    // rural: little or no pedestrian network near the site -> road centrelines
    let near = 0;
    if (!ped.error) for (const ft of ped) for (const l of geoLines(ft.geometry)) for (const q of l) if (q[0] > bb[0] - 150 && q[0] < bb[2] + 150 && q[1] > bb[1] - 150 && q[1] < bb[3] + 150 && (ctx.inPoly(q[0], q[1], R) || ctx.ringDist(q[0], q[1], R) <= 150)) near++;
    out.pedNear = near;
    if (ped.error || near < 6) { const t1 = now(); out.road = await soft(pagedGeo(ctx, ctx.RD_URL, box, 'OBJECTID,STREETTYPE', { geometryPrecision: '1' })); out.tRoad = now() - t1; }
    out.tFetch = now() - t0;
    return out;
  } catch (e) { console.warn(e); return { error: String(e.message || e), tFetch: now() - t0 }; }
}

// ---------------------------------------------------------------- shared rasters
// point in ring (even-odd)
function inRing(x, y, R) {
  let c = false;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const xi = R[i][0], yi = R[i][1], xj = R[j][0], yj = R[j][1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
}
// DSM of non-site block prisms (2 m cells over the frame + the block buffer). Cells crossed by a footprint edge keep the list
// of blocks touching them and are tested exactly (point in footprint) at each sample; cells wholly inside footprints keep up to
// two height spans (base..top), so a gap between stacked blocks (a bridge over a podium) stays open. 'top' = highest of all,
// for the skip pyramids and the sky view.
function buildDSM(res) {
  const f = res.f, F = f.E1 - f.E0, buf = F >= 800 ? 300 : 500;      // app.js loads blocks to the same buffer
  const cell = F <= 600 ? 2 : F <= 1000 ? 3 : 4;
  const xa = f.E0 - buf, ya = f.N0 - buf, nx = Math.ceil((F + 2 * buf) / cell), ny = nx;
  const top = new Float32Array(nx * ny).fill(-1e9), bot = new Float32Array(nx * ny).fill(1e9), top2 = new Float32Array(nx * ny).fill(-1e9), bot2 = new Float32Array(nx * ny).fill(1e9);
  const eIdx = new Int32Array(nx * ny).fill(-1), lists = [], BL = res.blocks.filter((b) => !b.onSite);
  const put = (k, zb, zt) => {
    if (top[k] < -1e8 || (zb <= top[k] + 0.5 && zt >= bot[k] - 0.5)) { if (zt > top[k]) top[k] = zt; if (zb < bot[k]) bot[k] = zb; return; }
    if (zb < bot2[k]) bot2[k] = zb; if (zt > top2[k]) top2[k] = zt;
  };
  const addE = (k, bi) => { let e = eIdx[k]; if (e < 0) { e = eIdx[k] = lists.length; lists.push([bi]); } else if (!lists[e].includes(bi)) lists[e].push(bi); };
  // pass 1: cells crossed by any footprint edge (sampled every quarter cell)
  BL.forEach((b, bi) => {
    for (const r of [b.ring, ...(b.holes || [])]) for (let q = 0, n = r.length; q < n; q++) {
      const A = r[q], C = r[(q + 1) % n], L = Math.hypot(C[0] - A[0], C[1] - A[1]), m = Math.max(1, Math.ceil((4 * L) / cell));
      for (let s = 0; s <= m; s++) {
        const i = Math.floor((A[0] + ((C[0] - A[0]) * s) / m - xa) / cell), j = Math.floor((A[1] + ((C[1] - A[1]) * s) / m - ya) / cell);
        if (i >= 0 && j >= 0 && i < nx && j < ny) addE(j * nx + i, bi);
      }
    }
  });
  // pass 2: cells whose centre is inside a footprint
  let zmax = -1e9; const xs = [];
  BL.forEach((b, bi) => {
    const rings = [b.ring, ...(b.holes || [])];
    const j0 = Math.max(0, Math.ceil((b.bb[1] - ya) / cell - 0.5)), j1 = Math.min(ny - 1, Math.floor((b.bb[3] - ya) / cell - 0.5));
    for (let j = j0; j <= j1; j++) {
      const y = ya + (j + 0.5) * cell; xs.length = 0;
      for (const r of rings) for (let k = 0, n = r.length; k < n; k++) { const a = r[k], c = r[(k + 1) % n]; if ((a[1] > y) !== (c[1] > y)) xs.push(a[0] + ((y - a[1]) * (c[0] - a[0])) / (c[1] - a[1])); }
      xs.sort((p, q) => p - q);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m] - xa) / cell - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[m + 1] - xa) / cell - 0.5));
        for (let i = i0, k = j * nx + i0; i <= i1; i++, k++) { if (eIdx[k] >= 0) addE(k, bi); else put(k, b.zb, b.zt); }
      }
    }
    if (b.zt > zmax && b.bb[2] > xa && b.bb[0] < xa + nx * cell && b.bb[3] > ya && b.bb[1] < ya + ny * cell) zmax = b.zt;
  });
  const tall = new Float32Array(nx * ny);
  for (let k = 0; k < tall.length; k++) {
    let v = Math.max(top[k], top2[k]); const e = eIdx[k];
    if (e >= 0) for (const bi of lists[e]) if (BL[bi].zt > v) v = BL[bi].zt;
    tall[k] = v;
  }
  // max pyramids (16 and 4 cell blocks), each dilated by one block so a jump of S cells from anywhere in a block stays covered
  const pyr = (S) => {
    const cnx = Math.ceil(nx / S), cny = Math.ceil(ny / S), cm = new Float32Array(cnx * cny).fill(-1e9);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = tall[j * nx + i], c = ((j / S) | 0) * cnx + ((i / S) | 0); if (v > cm[c]) cm[c] = v; }
    const cmd = new Float32Array(cnx * cny).fill(-1e9);
    for (let J = 0; J < cny; J++) for (let I = 0; I < cnx; I++) {
      let m = -1e9;
      for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) { const II = I + u, JJ = J + v; if (II >= 0 && JJ >= 0 && II < cnx && JJ < cny && cm[JJ * cnx + II] > m) m = cm[JJ * cnx + II]; }
      cmd[J * cnx + I] = m;
    }
    return { cnx, cmd };
  };
  const P16 = pyr(16), P4 = pyr(4);
  return { xa, ya, cell, nx, ny, top: tall, t1: top, b1: bot, t2: top2, b2: bot2, eIdx, lists, BL, zmax, cnx: P16.cnx, cmd: P16.cmd, cnx4: P4.cnx, cmd4: P4.cmd, edgeCells: lists.length };
}
// exact test at an edge cell: is (x, y) inside a listed block whose span overlaps lo..hi
function edgeHit(D, e, x, y, lo, hi) {
  for (const bi of D.lists[e]) {
    const b = D.BL[bi]; if (lo > b.zt || hi < b.zb) continue;
    if (x < b.bb[0] || x > b.bb[2] || y < b.bb[1] || y > b.bb[3]) continue;
    if (inRing(x, y, b.ring) && !(b.holes || []).some((h) => inRing(x, y, h))) return true;
  }
  return false;
}
const inBld = (D, E, N) => {
  const i = Math.floor((E - D.xa) / D.cell), j = Math.floor((N - D.ya) / D.cell); if (i < 0 || j < 0 || i >= D.nx || j >= D.ny) return false;
  const k = j * D.nx + i, e = D.eIdx[k];
  return e >= 0 ? edgeHit(D, e, E, N, -1e9, 1e9) : D.t1[k] > -1e8;
};

// Is the sun ray from (E, N, z) toward grid bearing (ux, uy), rising tanA per metre, stopped by a block?
// Samples every half cell; each covers the ray heights over its own half-cell stretch (lo..lo + dz/2). Interior cells are
// tested on their height spans, edge cells exactly against the footprints of the blocks touching them.
function dsmHit(D, E, N, z, ux, uy, tanA) {
  const { xa, ya, cell, nx, ny, t1, b1, t2, b2, eIdx, cnx, cmd, cnx4, cmd4 } = D, dz = tanA * cell, zcap = D.zmax;
  const h2 = dz / 2;
  let t = 0.25, lo = z;
  const gx = (E - xa) / cell, gy = (N - ya) / cell;
  for (;;) {
    if (lo > zcap) return false;
    const x = gx + ux * t, y = gy + uy * t;
    if (x < 0 || y < 0 || x >= nx || y >= ny) return false;
    const i = x | 0, j = y | 0;
    if (cmd[(j >> 4) * cnx + (i >> 4)] < lo) { t += 16; lo += 16 * dz; continue; }
    if (cmd4[(j >> 2) * cnx4 + (i >> 2)] < lo) { t += 4; lo += 4 * dz; continue; }
    const k = j * nx + i, e = eIdx[k];
    if (e >= 0) { if (edgeHit(D, e, xa + x * cell, ya + y * cell, lo, lo + h2)) return true; }
    else if ((lo <= t1[k] && lo + h2 >= b1[k]) || (lo <= t2[k] && lo + h2 >= b2[k])) return true;
    t += 0.5; lo += h2;
  }
}

// terrain max pyramid: 100 m blocks of the DTM, dilated by one block (skip 100 m of a terrain ray when nothing there can rise above it)
function terrainPyr(res) {
  const dem = res.dem, B = 100, C5 = dem.cell || 5, xa = dem.xa, ya = dem.ya, W = (dem.nx - 1) * C5, H = (dem.ny - 1) * C5;
  const cnx = Math.ceil(W / B) + 1, cny = Math.ceil(H / B) + 1, cm = new Float32Array(cnx * cny).fill(-1e9);
  for (let j = 0; j < dem.ny; j++) for (let i = 0; i < dem.nx; i++) { const c = Math.floor((j * C5) / B) * cnx + Math.floor((i * C5) / B), v = dem.z[j * dem.nx + i]; if (v > cm[c]) cm[c] = v; }
  const cmd = new Float32Array(cnx * cny).fill(-1e9);
  for (let J = 0; J < cny; J++) for (let I = 0; I < cnx; I++) {
    let m = -1e9;
    for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) { const II = I + u, JJ = J + v; if (II >= 0 && JJ >= 0 && II < cnx && JJ < cny && cm[JJ * cnx + II] > m) m = cm[JJ * cnx + II]; }
    cmd[J * cnx + I] = m;
  }
  const zmax = dem.zmax;                                        // outside the DTM block the bound is the overall top
  return { zmax, at: (E, N) => { const I = Math.floor((E - xa) / B), J = Math.floor((N - ya) / B); return I < 0 || J < 0 || I >= cnx || J >= cny ? zmax : cmd[J * cnx + I]; } };
}
// steepest (h - zo - tol) / t along a ray, t from t0 to tEnd in the app's 5 / 10 m steps; skips 100 m stretches that cannot beat 'best'
function terrainRay(h, P, E, N, zo, ux, uy, t0, tEnd, tol, best, outT) {
  let bt = 0;
  for (let t = t0; t <= tEnd;) {
    if ((P.zmax - zo - tol) / t <= best) break;
    if ((P.at(E + ux * t, N + uy * t) - zo - tol) / t <= best) { t += 100; t = t < 300 ? Math.ceil(t / 5) * 5 : Math.ceil(t / 10) * 10; continue; }
    const v = (h(E + ux * t, N + uy * t) - zo - tol) / t;
    if (v > best) { best = v; bt = t; }
    t += t < 300 ? 5 : 10;
  }
  if (outT) outT[0] = bt;
  return best;
}

// Terrain horizon (tangent) on a coarse grid over the frame: for each node and azimuth bin, the steepest
// (h - z - 2 m) / t for t >= 60 m out to 1500 m, and the distance where it occurs (to shift it for a nearby lower or higher point).
function terrainHorizon(res, ctx, P) {
  const f = res.f, F = f.E1 - f.E0, h = res.h;
  const tn = 15, cell = F / (tn - 1), NA = TERR_AZ;
  const tan = new Float32Array(tn * tn * NA), dist = new Float32Array(tn * tn * NA), z = new Float32Array(tn * tn), ot = [0];
  const floor = Math.tan((MIN_ALT * Math.PI) / 180) - 0.02;      // horizons lower than the lowest sun counted do not matter
  for (let j = 0; j < tn; j++) for (let i = 0; i < tn; i++) {
    const n = j * tn + i, x = f.E0 + i * cell, y = f.N0 + j * cell, z0 = h(x, y); z[n] = z0;
    for (let a = 0; a < NA; a++) {
      const ang = (a * 2 * Math.PI) / NA;
      const best = terrainRay(h, P, x, y, z0, Math.sin(ang), Math.cos(ang), HILL_NEAR, ctx.TERRAIN_BUF, ctx.HILL_TOL, floor, ot);
      tan[n * NA + a] = best; dist[n * NA + a] = ot[0] || 1e6;
    }
  }
  return { tn, cell, NA, tan, dist, z, x0: f.E0, y0: f.N0 };
}
// the terrain horizon tangents for one point, all bins (bilinear between nodes, shifted for the point's own height)
function horizonAt(TH, E, N, zp, out) {
  const fx = Math.min(TH.tn - 1.0001, Math.max(0, (E - TH.x0) / TH.cell)), fy = Math.min(TH.tn - 1.0001, Math.max(0, (N - TH.y0) / TH.cell));
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, NA = TH.NA;
  const ns = [j * TH.tn + i, j * TH.tn + i + 1, (j + 1) * TH.tn + i, (j + 1) * TH.tn + i + 1], ws = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
  for (let a = 0; a < NA; a++) {
    let s = 0;
    for (let q = 0; q < 4; q++) { const k = ns[q] * NA + a; s += ws[q] * (TH.tan[k] + (TH.z[ns[q]] - zp) / TH.dist[k]); }
    out[a] = s;
  }
  return out;
}
const horizonTan = (hz, NA, azDeg) => { const x = ((((azDeg % 360) + 360) % 360) / 360) * NA, a = Math.floor(x) % NA, b = (a + 1) % NA, w = x - Math.floor(x); return hz[a] * (1 - w) + hz[b] * w; };

// sample points inside the site (about n of them), left out where a neighbouring (not cleared) block overlaps the site
function sitePoints(R, ctx, n = 400, D = null) {
  const b = ctx.ringBox(R), a = Math.abs(ctx.area(R)), st = Math.max(0.5, Math.sqrt(a / n)), pts = [];
  for (let y = b[1] + st / 2; y < b[3]; y += st) for (let x = b[0] + st / 2; x < b[2]; x += st) if (ctx.inPoly(x, y, R)) pts.push([x, y]);
  if (!pts.length) pts.push(ctx.centroid(R));
  const open = D ? pts.filter(([x, y]) => !inBld(D, x, y)) : pts;
  return open.length ? open : pts;
}

// ---------------------------------------------------------------- sunlight hours
function sunSteps(res, ctx, dt) {
  const at = (hr) => ctx.sunPos(res.lat, res.lon, hr, dt.m, dt.d);
  let t0 = null, t1 = null;
  for (let mnt = 2 * 60; mnt <= 23 * 60; mnt++) { if (at(mnt / 60).alt > MIN_ALT) { if (t0 === null) t0 = mnt; t1 = mnt; } }
  // refine the crossings to a few seconds
  const cross = (a, b) => { for (let k = 0; k < 30; k++) { const m = (a + b) / 2; if ((at(a / 60).alt > MIN_ALT) === (at(m / 60).alt > MIN_ALT)) a = m; else b = m; } return (a + b) / 2; };
  const s0 = cross(t0 - 1, t0) / 60, s1 = cross(t1, t1 + 1) / 60, len = s1 - s0, n = Math.max(1, Math.round((len * 60) / STEP_MIN)), w = len / n;
  const steps = [];
  for (let k = 0; k < n; k++) {
    const hr = s0 + (k + 0.5) * w, sp = at(hr), azG = sp.az + res.tn, a = (azG * Math.PI) / 180;
    steps.push({ hr, alt: sp.alt, azG, ux: Math.sin(a), uy: Math.cos(a), tanA: Math.tan((sp.alt * Math.PI) / 180) });
  }
  return { steps, w, dayLen: len, rise: s0, set: s1 };
}
function litCount(D, hz, NA, E, N, z, st) { return !(st.tanA < horizonTan(hz, NA, st.azG)) && !dsmHit(D, E, N, z, st.ux, st.uy, st.tanA); }

function sunHours(res, ctx, D, TH) {
  const f = res.f, F = f.E1 - f.E0, n = 120, cell = F / n, h = res.h, NA = TH.NA;
  const grid = { x0: f.E0, y0: f.N0, cell, nx: n, ny: n };
  const cells = [];                                              // [k, E, N, z, horizon]
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const E = f.E0 + (i + 0.5) * cell, N = f.N0 + (j + 0.5) * cell;
    if (inBld(D, E, N)) continue;
    const z = h(E, N); cells.push([j * n + i, E, N, z, horizonAt(TH, E, N, z, new Float32Array(NA))]);
  }
  const sp = sitePoints(res.R, ctx, 400, D).map(([E, N]) => { const z = h(E, N); return [E, N, z, horizonAt(TH, E, N, z, new Float32Array(NA))]; });
  const hours = {}, dayLen = {}, site = {}, times = {};
  for (const dt of DATES) {
    const S = sunSteps(res, ctx, dt), hv = new Float32Array(n * n).fill(NaN);
    for (const [k, E, N, z, hz] of cells) { let c = 0; for (const st of S.steps) if (litCount(D, hz, NA, E, N, z, st)) c++; hv[k] = c * S.w; }
    const sv = sp.map(([E, N, z, hz]) => { let c = 0; for (const st of S.steps) if (litCount(D, hz, NA, E, N, z, st)) c++; return c * S.w; });
    let s = 0, mn = Infinity, mx = -Infinity, u2 = 0; for (const v of sv) { s += v; mn = Math.min(mn, v); mx = Math.max(mx, v); if (v < 2) u2++; }
    hours[dt.id] = hv; dayLen[dt.id] = S.dayLen; times[dt.id] = { rise: S.rise, set: S.set, steps: S.steps.length };
    site[dt.id] = { mean: s / sv.length, min: mn, max: mx, under2: (100 * u2) / sv.length, over2: 100 - (100 * u2) / sv.length };
  }
  const fm = (v) => v.toFixed(1), M = site.mar, J = site.jun, Dd = site.dec;
  // BRE BR 209 (2022) suggests at least half of a garden or amenity area should see 2 h of sun on 21 March: reported for the open
  // ground of the site as a screening figure only (the site is taken as cleared, so no new building is in it)
  const o2 = Math.round(M.over2);
  const take = [`On 21 Mar the site gets ${fm(M.mean)} h of direct sun on average (21 Jun ${fm(J.mean)} h, 21 Dec ${fm(Dd.mean)} h); ${o2}% of it gets 2 h or more on 21 Mar (BRE amenity guide: at least half; screening only, site taken as cleared).`,
    ''];
  return {
    dates: DATES, show: 'mar', grid, hours, dayLen, site, times, step: STEP_MIN, minAlt: MIN_ALT, samples: sp.length,
    method: `Sun every ${STEP_MIN} min while it is more than ${MIN_ALT} deg up (NOAA equations, clock time GMT / BST, grid bearing = true azimuth + convergence); a ray from each ${r1(cell)} m cell at ground level toward the sun, stopped by any non-site LiDAR block prism (2 m surface raster) or by terrain 60 m or more away (LiDAR DTM at 5 m, 2 m tolerance). Site taken as cleared; trees ignored.`,
    take,
  };
}

// ---------------------------------------------------------------- sky view factor
function svfAt(D, P, res, ctx, E, N, zo) {
  const { xa, ya, cell, nx, ny, t1, t2, eIdx, cnx, cmd, cnx4, cmd4 } = D, h = res.h;
  let s2 = 0;
  const gx = (E - xa) / cell, gy = (N - ya) / cell;
  for (let r = 0; r < SVF_RAYS; r++) {
    const a = (r * 2 * Math.PI) / SVF_RAYS, ux = Math.sin(a), uy = Math.cos(a);
    let best = 0;                                                 // tangent of the horizon (at least level)
    for (let t = 0.25; ;) {                                        // blocks: highest top / distance along the ray
      const x = gx + ux * t, y = gy + uy * t;
      if (x < 0 || y < 0 || x >= nx || y >= ny) break;
      const i = x | 0, j = y | 0, dm = Math.max(t * cell, 1);
      if ((D.zmax - zo) / dm <= best) break;
      if ((cmd[(j >> 4) * cnx + (i >> 4)] - zo) / dm <= best) { t += 16; continue; }
      if ((cmd4[(j >> 2) * cnx4 + (i >> 2)] - zo) / dm <= best) { t += 4; continue; }
      const k = j * nx + i, e = eIdx[k];
      let zt = Math.max(t1[k], t2[k]);
      if (e >= 0) {                                                // edge cell: only blocks whose footprint holds this sample
        const sx = xa + x * cell, sy = ya + y * cell;
        for (const bi of D.lists[e]) { const b = D.BL[bi]; if (b.zt > zt && sx >= b.bb[0] && sx <= b.bb[2] && sy >= b.bb[1] && sy <= b.bb[3] && inRing(sx, sy, b.ring) && !(b.holes || []).some((hh) => inRing(sx, sy, hh))) zt = b.zt; }
      }
      const v = (zt - zo) / dm; if (v > best) best = v;
      t += t < 20 ? 0.5 : 1;
    }
    best = terrainRay(h, P, E, N, zo, ux, uy, 10, ctx.TERRAIN_BUF, ctx.HILL_TOL, best, null);   // terrain, as app.js views()
    const sb = best / Math.sqrt(1 + best * best);                  // sin of the horizon elevation
    s2 += sb * sb;
  }
  return 1 - s2 / SVF_RAYS;
}
function skyView(res, ctx, D, P) {
  const f = res.f, F = f.E1 - f.E0, n = 48, cell = F / n, h = res.h;
  const v = new Float32Array(n * n).fill(NaN); let s = 0, c = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const E = f.E0 + (i + 0.5) * cell, N = f.N0 + (j + 0.5) * cell;
    if (inBld(D, E, N)) continue;
    const x = svfAt(D, P, res, ctx, E, N, h(E, N) + 1.5); v[j * n + i] = x; s += x; c++;
  }
  const sv = sitePoints(res.R, ctx, 120, D).map(([E, N]) => svfAt(D, P, res, ctx, E, N, h(E, N) + 1.5));
  let ss = 0, mn = Infinity, mx = -Infinity; for (const x of sv) { ss += x; mn = Math.min(mn, x); mx = Math.max(mx, x); }
  const site = { mean: ss / sv.length, min: mn, max: mx }, street = res.views && res.views.street ? res.views.street.svf : null;
  const word = (x) => (x >= 0.8 ? ['open', ''] : x >= 0.6 ? ['fairly open', ''] : x >= 0.4 ? ['partly enclosed', ''] : ['enclosed', '']);
  const w = word(site.mean);
  const take = [`Sky view factor over the site averages ${site.mean.toFixed(2)} (${site.min.toFixed(2)} to ${site.max.toFixed(2)}; 0 = sky fully blocked, 1 = open sky), so the ground is ${w[0]}.` + (street != null ? ` The street-level value at the centre in Views is ${street.toFixed(2)}.` : ''),
    '' + (street != null ? '' : '')];
  return {
    grid: { x0: f.E0, y0: f.N0, cell, nx: n, ny: n }, v, site, frameMean: c ? s / c : null, rays: SVF_RAYS, maxD: ctx.TERRAIN_BUF, samples: sv.length,
    method: `At 1.5 m above ground on ${r1(cell)} m cells: horizon in ${SVF_RAYS} directions from every non-site LiDAR block top (2 m surface raster, to 100 to 200 m beyond the frame) and the terrain (LiDAR DTM at 5 m, 10 to 1500 m, 2 m tolerance); SVF = 1 - mean(sin^2 horizon elevation), as the Views diagram. Site taken as cleared; trees ignored.`,
    take,
  };
}

// ---------------------------------------------------------------- walking catchment
// edge cost in metres at walking pace: 3D length, with stairs, escalators, lifts and signal crossings slower
const PED_COST = (ft) => ([12, 20].includes(ft) ? { k: 2, add: 0 } : [8, 16].includes(ft) ? { k: 1.5, add: 0 } : [10, 13, 18, 21].includes(ft) ? { k: 1, add: 40 } : ft === 30 ? { k: 1, add: 40 } : { k: 1, add: 0 });
class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; }
    return top;
  }
  get size() { return this.k.length; }
}
function buildNet(lines, tol = 0.75, ztol = 3) {
  // every vertex is a node; vertices of different lines within tol (and ztol in height) are one node
  const X = [], Y = [], Z = [], cellOf = new Map(), q = (v) => Math.floor(v / tol);
  const nodeOf = (x, y, z) => {
    const cx = q(x), cy = q(y);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = cellOf.get((cx + a) * 1e6 + (cy + b)); if (!list) continue;
      for (const id of list) if (Math.abs(X[id] - x) <= tol && Math.abs(Y[id] - y) <= tol && Math.hypot(X[id] - x, Y[id] - y) <= tol && Math.abs(Z[id] - z) <= ztol) return id;
    }
    const id = X.length; X.push(x); Y.push(y); Z.push(z);
    const key = cx * 1e6 + cy; if (!cellOf.has(key)) cellOf.set(key, []); cellOf.get(key).push(id);
    return id;
  };
  const eu = [], ev = [], ew = [], el = [], ed = [];               // ed: 0 both ways, 1 only eu -> ev, -1 only ev -> eu
  for (const L of lines) {
    const dir = L.dir === 1 || L.dir === -1 ? L.dir : 0;
    L.ids = L.pts.map(([x, y, z]) => nodeOf(x, y, z || 0));
    L.eid = [];
    for (let k = 0; k + 1 < L.ids.length; k++) {
      const a = L.ids[k], b = L.ids[k + 1];
      if (a === b) { L.eid.push(-1); continue; }
      const l2 = Math.hypot(X[b] - X[a], Y[b] - Y[a]), l3 = Math.hypot(l2, Z[b] - Z[a]);
      const c = L.cost, last = k + 2 === L.ids.length;
      L.eid.push(eu.length); eu.push(a); ev.push(b); el.push(l2); ed.push(dir);
      ew.push(l3 * c.k + (last ? c.add : 0));                         // a lift or a crossing wait counted once per feature
    }
  }
  const n = X.length, deg = new Int32Array(n + 1);
  for (let e = 0; e < eu.length; e++) { deg[eu[e] + 1]++; deg[ev[e] + 1]++; }
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const adj = new Int32Array(deg[n]), pos = deg.slice(0, n);
  for (let e = 0; e < eu.length; e++) { adj[pos[eu[e]]++] = e; adj[pos[ev[e]]++] = e; }
  const idx = new Map(), IC = 20;                                  // 20 m buckets for nearby-node searches
  for (let i = 0; i < n; i++) { const key = Math.floor(X[i] / IC) * 1e6 + Math.floor(Y[i] / IC); if (!idx.has(key)) idx.set(key, []); idx.get(key).push(i); }
  return { X, Y, Z, n, eu, ev, ew, el, ed, off: deg, adj, cellOf, tol, idx, IC };
}
// one-way links (LandsD Direction 1 = along the drawn vertex order, -1 = against it): may the walk go from node u along edge e?
const canGo = (G, e, u) => (G.ed[e] === 0 || (G.ed[e] === 1 ? G.eu[e] === u : G.ev[e] === u));
function dijkstra(G, starts) {
  const d = new Float64Array(G.n).fill(Infinity), H = new Heap();
  for (const [id, c] of starts) if (c < d[id]) { d[id] = c; H.push(c, id); }
  while (H.size) {
    const u = H.pop(), du = d[u];
    for (let p = G.off[u]; p < G.off[u + 1]; p++) {
      const e = G.adj[p]; if (!canGo(G, e, u)) continue;
      const v = G.eu[e] === u ? G.ev[e] : G.eu[e], nd = du + G.ew[e];
      if (nd < d[v]) { d[v] = nd; H.push(nd, v); }
    }
  }
  return d;
}
function nodesNear(G, x, y, r) {
  const out = [], IC = G.IC, k = Math.ceil(r / IC), cx = Math.floor(x / IC), cy = Math.floor(y / IC);
  for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) {
    const list = G.idx.get((cx + a) * 1e6 + (cy + b)); if (!list) continue;
    for (const id of list) { const dd = Math.hypot(G.X[id] - x, G.Y[id] - y); if (dd <= r) out.push([id, dd]); }
  }
  return out;
}
function walkCatchment(res, ctx, fetched) {
  const R = res.R, F = fetched || {};
  let net = 'ped', lines = [];
  if (F.ped && !F.ped.error && !(F.pedNear < 6 && F.road && !F.road.error && F.road.length)) {
    for (const ft of F.ped) {
      const p = ft.properties || {};
      if (p.Location === 3 || p.Enabled === 2) continue;           // paid MTR concourse; disabled links
      // Direction: one-way escalators and travelators kept one way (the Central to Mid-Levels escalator is two lines, one each way)
      for (const l of geoLines(ft.geometry)) if (l.length > 1) lines.push({ pts: l, ft: p.FeatureType, cost: PED_COST(p.FeatureType), dir: p.Direction === 1 || p.Direction === -1 ? p.Direction : 0 });
    }
  } else if (F.road && !F.road.error) {
    net = 'road';
    for (const ft of F.road) {
      const p = ft.properties || {}; if (p.STREETTYPE === 'Motorway' || p.STREETTYPE === 'Tunnel') continue;
      for (const l of geoLines(ft.geometry)) if (l.length > 1) lines.push({ pts: l.map((q) => [q[0], q[1], 0]), ft: 0, cost: { k: 1, add: 0 } });
    }
  } else return { error: F.error || (F.ped && F.ped.error) || 'no walking network loaded' };
  if (!lines.length) return { error: 'no walking network near the site' };
  const G = buildNet(lines);
  // start nodes: on the site or within 15 m of its boundary, costed by the straight step to the boundary
  const bb = ctx.ringBox(R), starts = [];
  for (let i = 0; i < G.n; i++) {
    const x = G.X[i], y = G.Y[i]; if (x < bb[0] - 15 || x > bb[2] + 15 || y < bb[1] - 15 || y > bb[3] + 15) continue;
    const dd = ctx.inPoly(x, y, R) ? 0 : ctx.ringDist(x, y, R); if (dd <= 15) starts.push([i, dd]);
  }
  let startNote = null;
  if (!starts.length) {                                          // nothing at the boundary: the nearest nodes, with the straight walk to them
    const c = ctx.centroid(R), all = [];
    for (let i = 0; i < G.n; i++) all.push([i, ctx.ringDist(G.X[i], G.Y[i], R)]);
    all.sort((a, b) => a[1] - b[1]);
    for (const s of all.slice(0, 3)) if (s[1] <= all[0][1] + 20) starts.push(s);
    startNote = all[0] ? all[0][1] : null; void c;
  }
  const d = dijkstra(G, starts), T5 = MINS[0] * SPEED, T10 = MINS[1] * SPEED;
  lastWalk = { G, d, starts };
  // split each line into band pieces (5, 10, rest) at the exact marks along each edge
  const edges = [], rest = [], len = { 5: 0, 10: 0 };
  let ex0 = Infinity, ey0 = Infinity, ex1 = -Infinity, ey1 = -Infinity;
  const ext = (x, y) => { if (x < ex0) ex0 = x; if (x > ex1) ex1 = x; if (y < ey0) ey0 = y; if (y > ey1) ey1 = y; };
  for (const L of lines) {
    let cur = null;
    const emit = (band, x0, y0, x1, y1, l) => {
      if (l <= 1e-6) return;
      if (band) { len[10] += l; if (band === 5) len[5] += l; ext(x0, y0); ext(x1, y1); }
      if (cur && cur.band === band) cur.pts.push([x1, y1]);
      else { cur = { band, pts: [[x0, y0], [x1, y1]] }; (band ? edges : rest).push(cur); }
    };
    for (let k = 0; k < L.eid.length; k++) {
      const e = L.eid[k]; if (e < 0) continue;
      // a one-way link is entered only at its start: the other end's cost does not flow back along it
      const a = L.ids[k], b = L.ids[k + 1], w = G.ew[e], l = G.el[e], ca = G.ed[e] === -1 ? Infinity : d[a], cb = G.ed[e] === 1 ? Infinity : d[b];
      const xa = G.X[a], ya = G.Y[a], xb = G.X[b], yb = G.Y[b];
      // cost at fraction s: min(ca + s w, cb + (1 - s) w); cut points where it crosses T5 and T10
      const cuts = [0, 1];
      for (const T of [T5, T10]) {
        const s1 = (T - ca) / w, s2 = 1 - (T - cb) / w;
        if (s1 > 0 && s1 < 1) cuts.push(s1); if (s2 > 0 && s2 < 1) cuts.push(s2);
      }
      if (Number.isFinite(ca) && Number.isFinite(cb)) { const sm = (cb - ca + w) / (2 * w); if (sm > 0 && sm < 1) cuts.push(sm); }
      cuts.sort((p, q) => p - q);
      for (let m = 0; m + 1 < cuts.length; m++) {
        const s0 = cuts[m], s1 = cuts[m + 1]; if (s1 - s0 < 1e-9) continue;
        const sm = (s0 + s1) / 2, c = Math.min(ca + sm * w, cb + (1 - sm) * w), band = c <= T5 ? 5 : c <= T10 ? 10 : 0;
        emit(band, xa + (xb - xa) * s0, ya + (yb - ya) * s0, xa + (xb - xa) * s1, ya + (yb - ya) * s1, l * (s1 - s0));
      }
    }
  }
  // catchment area (pedshed): ground within 20 m of the reached network, on a 10 m grid; compared with the 800 m circle
  const area = { 5: 0, 10: 0 };
  {
    const g = 10, buf = 20, gx0 = ex0 - 40, gy0 = ey0 - 40, gnx = Math.ceil((ex1 - ex0 + 80) / g), gny = Math.ceil((ey1 - ey0 + 80) / g);
    if (Number.isFinite(gnx) && gnx > 0 && gny > 0 && gnx * gny < 4e6) {
      const m = new Uint8Array(gnx * gny), rr = Math.ceil(buf / g);
      for (const e of edges) for (let q = 0; q + 1 < e.pts.length; q++) {
        const [xa, ya] = e.pts[q], [xb, yb] = e.pts[q + 1], L2 = Math.hypot(xb - xa, yb - ya), n = Math.max(1, Math.ceil(L2 / 5));
        for (let s = 0; s <= n; s++) {
          const x = xa + ((xb - xa) * s) / n, y = ya + ((yb - ya) * s) / n, ci = Math.floor((x - gx0) / g), cj = Math.floor((y - gy0) / g);
          for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
            const ii = ci + di, jj = cj + dj; if (ii < 0 || jj < 0 || ii >= gnx || jj >= gny) continue;
            const cx = gx0 + (ii + 0.5) * g, cy = gy0 + (jj + 0.5) * g; if (Math.hypot(cx - x, cy - y) > buf) continue;
            const k = jj * gnx + ii; if (e.band === 5) m[k] = 5; else if (!m[k]) m[k] = 10;
          }
        }
      }
      for (const v of m) { if (v) area[10] += g * g; if (v === 5) area[5] += g * g; }
    }
  }
  const circle = Math.PI * (MINS[1] * SPEED) ** 2;
  // MTR exits and Light Rail stops within 10 minutes: best node within 40 m (or the nearest + 10 m) + the straight bit
  const timeTo = (E, N) => {
    let near = nodesNear(G, E, N, 40); if (!near.length) near = nodesNear(G, E, N, 120);
    if (!near.length) return Infinity;
    const dmin = Math.min(...near.map((q) => q[1]));
    let best = Infinity; for (const [id, dd] of near) if (dd <= Math.max(40, dmin + 10)) best = Math.min(best, d[id] + dd);
    return best / SPEED;
  };
  const x = res.extra || {}, mtr = [];
  if (x.rail && !x.rail.error) {                                  // UK: National Rail and metro / tram station entrances (NaPTAN)
    const bestBy = new Map();
    for (const e of x.rail.exits || []) {
      const mn = timeTo(e.E, e.N); if (!(mn <= MINS[1])) continue;
      const nmS = (e.station && e.station.name) || null, o = { kind: e.station && e.station.kind === 'm' ? 'metro' : 'rail', ref: null, en: nmS, E: e.E, N: e.N, min: mn };
      const key = (nmS || '?') + (nmS ? '' : '|' + Math.round(e.E) + ',' + Math.round(e.N));
      if (!bestBy.has(key) || bestBy.get(key).min > mn) bestBy.set(key, o);
    }
    mtr.push(...bestBy.values());
  } else if (x.mtr && !x.mtr.error) {
    const bestBy = new Map();
    for (const e of x.mtr.exits || []) {
      const mn = timeTo(e.E, e.N); if (!(mn <= MINS[1])) continue;
      // a station with no name keeps en/zh null (the labels then show the exit letter only, never "MTR MTR");
      // one station drawn as several OSM nodes is merged by its English name; zh in Traditional characters
      const st = e.station || {}, en = nm(st.en) || null, zh = nm(st.zh) || en;
      const o = { kind: 'mtr', ref: nm(e.ref) || null, en: en || null, E: e.E, N: e.N, min: mn };
      const key = (en || zh || '?') + '|' + (o.ref || '') + (o.ref || en || zh ? '' : '|' + Math.round(e.E) + ',' + Math.round(e.N));
      if (!bestBy.has(key) || bestBy.get(key).min > mn) bestBy.set(key, o);
    }
    for (const q of x.mtr.lr || []) { const mn = timeTo(q.E, q.N); if (mn <= MINS[1]) mtr.push({ kind: 'lr', ref: null, en: nm(q.en) || nm(q.zh) || null, E: q.E, N: q.N, min: mn }); }
    mtr.push(...bestBy.values());
  }
  mtr.sort((a, b) => a.min - b.min);
  let bus5 = null, busPts = [];
  const busSrc = F.bus && !F.bus.error ? F.bus.map((ft) => ft.geometry && ft.geometry.coordinates).filter(Boolean) : null;
  if (busSrc) { busPts = busSrc.map(([E, N]) => ({ E, N, min: timeTo(E, N) })).filter((b) => b.min <= MINS[1]); bus5 = busPts.filter((b) => b.min <= MINS[0]).length; }
  // the walk frame: a square round the 10-minute reach and the site, with a margin, in round 100 m
  const rb = ctx.ringBox(R); ext(rb[0], rb[1]); ext(rb[2], rb[3]);
  const cE = (ex0 + ex1) / 2, cN = (ey0 + ey1) / 2, s = Math.ceil((Math.max(ex1 - ex0, ey1 - ey0) + 120) / 100) * 100;
  const frame = { cE, cN, s, E0: cE - s / 2, E1: cE + s / 2, N0: cN - s / 2, N1: cN + s / 2 };
  const inF = (pts) => pts.some(([px, py]) => px > frame.E0 && px < frame.E1 && py > frame.N0 && py < frame.N1);
  const restIn = rest.filter((r) => inF(r.pts)).map((r) => ({ pts: r.pts }));
  // take
  const m0 = mtr[0], mm = (v) => Math.max(1, Math.round(v)), a10 = area[10] / 1e6, pct = Math.round((100 * area[10]) / circle);
  const hasMtr = x.rail && !x.rail.error;
  const at = m0 && m0.min < 0.5, wEn = m0 ? (at ? 'at the site' : `${mm(m0.min)} min away`) : '', wZh = m0 ? (at ? '' : '') : '';
  // EN: "MTR Wan Chai exit A3 is 4 min away"; no station name: "MTR exit A3 is ..."
  const lrEn = m0 && m0.en ? `${m0.en} stop` : 'a tram or metro stop', lrZh = m0 && m0.zh ? '' : '';
  const mtEn = m0 ? `${m0.en || 'a'} station entrance` : '';
  const mtZh = m0 ? '' : '';
  const mEn = m0 ? (m0.kind === 'metro' ? `; ${lrEn} is ${wEn}` : `; ${mtEn} is ${wEn}`) : hasMtr ? '; no station entrance within 10 min' : '';
  const bEn = bus5 == null ? '' : bus5 ? `, ${bus5} bus stop${bus5 === 1 ? '' : 's'} within 5 min` : ', no bus stop within 5 min';
  const rEn = net === 'road' ? (F.src === 'osm' ? ' Along OpenStreetMap roads and paths.' : F.src === 'os+osm' ? ' Along OS Open Roads and OpenStreetMap paths.' : ' Along OS Open Roads (roads only, no footpaths).') : '';
  const g = startNote != null && startNote > 30 ? Math.round(startNote / 10) * 10 : 0;
  const gEn = g ? ` Nearest ${net === 'road' ? 'road' : 'path'} ${g} m away (straight line).` : '';
  // zh: built from clauses joined by punctuation, so no clause starts with a mark
  const tiny = a10 < 0.01;                          // QA r1: a country-park site printed 0.00 km² (0%)
  const zc = [tiny ? '' : ''];
  if (m0) zc.push(m0.kind === 'metro' ? `${lrZh}${wZh}` : `${mtZh}${wZh}`); else if (hasMtr) zc.push('');
  let zh = zc.join('');
  if (bus5 != null) zh += '' + (bus5 ? '' : '');
  zh += '';
  if (net === 'road') zh += '';
  if (g) zh += '';
  const take = [(tiny ? 'At 80 m a minute, no mapped walking network is reachable from the site within 10 minutes' : `At 80 m a minute, 10 minutes on foot covers ${a10.toFixed(2)} km² (${pct}% of an 800 m circle)`) + `${mEn}${bEn}.${rEn}${gEn}`, zh];
  return {
    speed: SPEED, mins: MINS, frame, edges, rest: restIn, hull: { 5: null, 10: null },
    starts: starts.map(([i]) => [G.X[i], G.Y[i]]), startGap: startNote, net, reach: { 5: { len: len[5], area: area[5] }, 10: { len: len[10], area: area[10] } }, pedshed: area[10] / circle,
    mtr, bus5, bus: busPts.map((b) => ({ E: b.E, N: b.N, min: b.min })), nodes: G.n, links: G.eu.length, features: lines.length,
    method: net === 'ped'
      ? 'LandsD 3D Pedestrian Network at 80 m a minute on 3D lengths; stairs count double, escalators 1.5 times, lifts and signalled crossings add 30 s; paid MTR concourses left out; links joined only where their vertices meet (0.75 m, 3 m in height); escalators and travelators coded one-way in the data (Direction field) are walked only that way, times measured outward from the site; the Central to Mid-Levels escalator, which reverses at 10:00, counts both ways.'
      : F.src === 'osm'
        ? 'OpenStreetMap roads, paths, footways and steps (not motorways, road tunnels or ways marked foot=no or private) at 80 m a minute, joined where their vertices meet (0.75 m); no waiting times at crossings.'
        : 'OS Open Roads road links (not motorways or road tunnels; footpaths are not in Open Roads' + (F.src === 'os+osm' ? ', so OpenStreetMap paths are added' : ', so cut-throughs are missed') + ') at 80 m a minute along the road centre lines, joined where their ends meet (0.75 m); no waiting times at crossings.',
    take,
  };
}

// ---------------------------------------------------------------- entry
let last = null, lastWalk = null;                              // for the QA script (read-only)
export async function computeExtra3(res, fetched, ctx) {
  const out = {}, tm = {}, t0 = now();
  let D = null, TH = null, P = null;
  try { D = buildDSM(res); tm.dsm = now() - t0; tm.edgeCells = D.edgeCells; P = terrainPyr(res); TH = terrainHorizon(res, ctx, P); tm.prep = now() - t0; } catch (e) { console.error(e); }
  const run = (k, fn) => { const t = now(); try { out[k] = fn(); } catch (e) { console.error(e); out[k] = { error: String(e.message || e) }; } tm[k] = now() - t; };
  run('sunh', () => { if (!D) throw new Error('surface model failed'); return sunHours(res, ctx, D, TH); });
  run('walk', () => (fetched && fetched.error ? { error: fetched.error } : walkCatchment(res, ctx, fetched)));
  run('svf', () => { if (!D) throw new Error('surface model failed'); return skyView(res, ctx, D, P); });
  tm.total = now() - t0; tm.fetch = fetched && fetched.tFetch; tm.ped = fetched && fetched.tPed; tm.road = fetched && fetched.tRoad;
  for (const k of ['sunh', 'walk', 'svf']) if (out[k] && !out[k].error) out[k].ms = tm[k];
  last = { res, D, TH, P, ctx, tm };
  out.sunh && (out.sunh.timing = tm);
  return out;
}
// QA hooks: the same per-point tests the maps use
export const _qa = {
  get timing() { return last && last.tm; },
  litAt(E, N, m, d, hr) {
    const { res, D, TH, ctx } = last, sp = ctx.sunPos(res.lat, res.lon, hr, m, d); if (sp.alt <= 0) return { lit: false, alt: sp.alt };
    const z = res.h(E, N), hz = horizonAt(TH, E, N, z, new Float32Array(TH.NA)), azG = sp.az + res.tn, a = (azG * Math.PI) / 180, tanA = Math.tan((sp.alt * Math.PI) / 180);
    const terr = tanA < horizonTan(hz, TH.NA, azG), bld = dsmHit(D, E, N, z, Math.sin(a), Math.cos(a), tanA);
    return { lit: !terr && !bld, terr, bld, alt: sp.alt, z, inBld: inBld(D, E, N) };
  },
  hitWhere(E, N, m, d, hr) {          // where along the sun ray the surface model stops it (debug)
    const { res, D, ctx } = last, sp = ctx.sunPos(res.lat, res.lon, hr, m, d), azG = sp.az + res.tn, a = (azG * Math.PI) / 180, tanA = Math.tan((sp.alt * Math.PI) / 180);
    const ux = Math.sin(a), uy = Math.cos(a), z = res.h(E, N), dz = tanA * D.cell, h2 = dz / 2, gx = (E - D.xa) / D.cell, gy = (N - D.ya) / D.cell;
    for (let t = 0.25, lo = z; t < 2000; t += 0.5, lo += h2) {
      const x = gx + ux * t, y = gy + uy * t; if (x < 0 || y < 0 || x >= D.nx || y >= D.ny) return null;
      const k = (y | 0) * D.nx + (x | 0), e = D.eIdx[k], sx = D.xa + x * D.cell, sy = D.ya + y * D.cell;
      const hit = e >= 0 ? edgeHit(D, e, sx, sy, lo, lo + h2) : (lo <= D.t1[k] && lo + h2 >= D.b1[k]) || (lo <= D.t2[k] && lo + h2 >= D.b2[k]);
      if (hit) return { E: sx, N: sy, cE: D.xa + ((x | 0) + 0.5) * D.cell, cN: D.ya + ((y | 0) + 0.5) * D.cell, lo, t: t * D.cell, edge: e >= 0 };
    }
    return null;
  },
  svfAt(E, N) { const { res, D, P, ctx } = last; return svfAt(D, P, res, ctx, E, N, res.h(E, N) + 1.5); },
  walkAt(E, N) { const W = lastWalk; if (!W) return null; const nn = nodesNear(W.G, E, N, 3).sort((a, b) => a[1] - b[1])[0]; return nn ? { min: W.d[nn[0]] / SPEED, node: [W.G.X[nn[0]], W.G.Y[nn[0]], W.G.Z[nn[0]]], gap: nn[1] } : null; },
  walkNodes(k, seed = 7) { const W = lastWalk; if (!W) return []; let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647); const ok = []; for (let i = 0; i < W.G.n; i++) if (W.d[i] > 0 && W.d[i] <= 900) ok.push(i); const out = []; for (let q = 0; q < k && ok.length; q++) { const i = ok[Math.floor(rnd() * ok.length)]; out.push({ E: W.G.X[i], N: W.G.Y[i], Z: W.G.Z[i], min: W.d[i] / SPEED }); } return out; },
  walkStarts() { const W = lastWalk; return W ? W.starts.map(([i, c]) => [W.G.X[i], W.G.Y[i], W.G.Z[i], c]) : []; },
  steps(id) { const { res, ctx } = last; const S = sunSteps(res, ctx, DATES.find((q) => q.id === id)); return { w: S.w, rise: S.rise, set: S.set, hrs: S.steps.map((s) => s.hr) }; },
};
