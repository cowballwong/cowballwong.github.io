// UK Site Analysis (28 Oct 2026, from HK Site Analysis v3): CAD exports of the 2D layers.
//   toDXF(res, opts) -> string  ASCII DXF R2000 (AC1015), metres, X = British National Grid Easting, Y = Northing (EPSG:27700), no offset.
//   toSVG(res, opts) -> string  SVG with the same layers as top-level Inkscape layers, real BNG numbers in the file.
// Heights (Z, thickness, contour and spot levels) are metres above Ordnance Datum Newlyn (m AOD), from the EA LiDAR.
// One geometry model (model()) feeds both writers, so the two files always carry the same layers and shapes.
//
// Z rule (DXF): plan layers sit at Z = 0. Three layers carry real levels in m AOD:
//   UKSA-BLDG / UKSA-BLDG-SITE  closed LWPOLYLINE at elevation = base (zb) with thickness = zt - zb (shows as massing in 3D views),
//   UKSA-CONTOUR-*             LWPOLYLINE at elevation = contour level,
//   UKSA-SPOT                  POINT at the ground level.
// SVG: every layer <g> has transform="matrix(1 0 0 -1 0 0)", so the numbers in the file are E and N (metres);
//   the text inside is flipped back so it reads normally. 1 m on the ground = 1 mm on paper (1:1000): width = viewBox width in mm.
// Text: R2000 is ANSI_1252, so every non-ASCII character is written as \U+XXXX (AutoCAD, BricsCAD, Rhino and ezdxf read it back);
//   characters outside the Basic Multilingual Plane become '?'.
// No dependencies; deterministic (the only date is opts.drawn).

const CREDITS_EN = 'Data: Environment Agency LiDAR Composite DTM and First and Last Return DSM 1 m (c) Environment Agency copyright and/or database right 2026; planning.data.gov.uk (MHCLG) with Historic England, Natural England, Environment Agency and local planning authority data; Defra strategic noise mapping Round 4 (2022); Natural England Priority Habitats Inventory (England); DfT NaPTAN snapshot 28 Oct 2026; all under the Open Government Licence v3.0. Wind: Open-Meteo, ERA5 (Copernicus Climate Change Service), CC BY 4.0. Roads and names: (c) OS Open Roads: contains OS data (c) Crown copyright and database right 2026 (OGL v3.0). OpenStreetMap contributors (ODbL), when loaded. Sun: NOAA solar equations. Derived drawing, provided as is.';
const CREDITS_ZH = '';
const DISC_EN = 'Hobby project, not official, for reference only. Not a substitute for a survey or professional advice.';
const DISC_ZH = '';

// ---------- layers: name -> ACI colour, linetype, lineweight (1/100 mm), SVG look ----------
const LT_DASHED = 'DASHED', LT_HIDDEN = 'HIDDEN';
const ROAD_LAYER = { 'Motorway': ['UKSA-ROAD-MOTORWAY', 30, 35], 'A road': ['UKSA-ROAD-A', 40, 30], 'B road': ['UKSA-ROAD-B', 41, 25],
  'Minor road': ['UKSA-ROAD-MINOR', 42, 18], 'Service road': ['UKSA-ROAD-SERVICE', 8, 13], 'Path': ['UKSA-PATH', 8, 13], 'Tunnel': ['UKSA-ROAD-TUNNEL', 9, 13] };
const GREEN_LAYER = { wood: ['UKSA-HABITAT-WOODLAND', 94, '#2f6b2a'], orchard: ['UKSA-HABITAT-ORCHARD', 52, '#9a7d1e'], heath: ['UKSA-HABITAT-HEATH', 212, '#8a4f8f'],
  wet: ['UKSA-HABITAT-WETLAND', 150, '#2b7fa3'], grass: ['UKSA-HABITAT-GRASSLAND', 82, '#6c9a2a'], other: ['UKSA-HABITAT-OTHER', 8, '#5e6b5a'] };
const PLAN_LAYER = { 'conservation-area': ['UKSA-PLAN-CONSERVATION-AREA', 30, '#b5532f'], 'listed-building-outline': ['UKSA-PLAN-LISTED-OUTLINE', 1, '#8a1c2b'],
  'scheduled-monument': ['UKSA-PLAN-SCHEDULED-MONUMENT', 22, '#7a3b1e'], 'park-and-garden': ['UKSA-PLAN-PARK-GARDEN', 62, '#a3c27a'], 'world-heritage-site': ['UKSA-PLAN-WORLD-HERITAGE', 200, '#6b4fa0'],
  'green-belt': ['UKSA-PLAN-GREEN-BELT', 82, '#7fae6b'], 'area-of-outstanding-natural-beauty': ['UKSA-PLAN-NATIONAL-LANDSCAPE', 52, '#b39b5c'], 'national-park': ['UKSA-PLAN-NATIONAL-PARK', 52, '#b39b5c'],
  'article-4-direction-area': ['UKSA-PLAN-ARTICLE-4', 190, '#5b4a8a'], 'tree-preservation-zone': ['UKSA-PLAN-TPO-AREA', 94, '#2f7a3a'] };
const PED_LAYER = { path: ['UKSA-PED-PATH', 4], cross: ['UKSA-PED-CROSSING', 140], link: ['UKSA-PED-LINK', 5], vert: ['UKSA-PED-VERTICAL', 150], indoor: ['UKSA-PED-INDOOR', 151] };
const HOUR_ACI = [150, 5, 170];
const DEF = {
  'UKSA-FRAME': { aci: 8, lw: 35, svg: { s: '#555555' } },
  'UKSA-SITE': { aci: 1, lw: 50, svg: { s: '#d6312b', w: 0.5 } },
  'UKSA-BLDG': { aci: 7, lw: 18, svg: { s: '#333333', f: '#d9d5cd' } },
  'UKSA-BLDG-SITE': { aci: 30, lw: 18, lt: LT_DASHED, svg: { s: '#c56a1b', dash: '1.5 0.8' } },
  'UKSA-BLDG-HEIGHT': { aci: 8, lw: 13, svg: { s: 'none', f: '#555555' } },
  'UKSA-BLDG-NAME': { aci: 8, lw: 13, svg: { s: 'none', f: '#333333' } },
  'UKSA-CONTOUR-MAJOR': { aci: 32, lw: 25, svg: { s: '#8a5a2b', w: 0.25 } },
  'UKSA-CONTOUR-MINOR': { aci: 33, lw: 13, svg: { s: '#b88a5c', w: 0.13 } },
  'UKSA-CONTOUR-LABEL': { aci: 32, lw: 13, svg: { s: 'none', f: '#8a5a2b' } },
  'UKSA-SPOT': { aci: 7, lw: 13, svg: { s: '#222222', f: '#222222' } },
  'UKSA-BUS': { aci: 6, lw: 18, svg: { s: '#b0249a' } },
  'UKSA-MTR-EXIT': { aci: 10, lw: 25, svg: { s: '#c8102e', f: '#c8102e' } },
  'UKSA-STATION-ENTRANCE': { aci: 10, lw: 25, svg: { s: '#c8102e', f: '#c8102e' } },
  'UKSA-PLAN-LISTED': { aci: 1, lw: 25, svg: { s: '#8a1c2b', f: '#8a1c2b' } },
  'UKSA-PLAN-TPO-TREE': { aci: 94, lw: 18, svg: { s: '#2f7a3a', f: '#2f7a3a' } },
  'UKSA-FLOOD-ZONE-2': { aci: 151, lw: 13, svg: { s: '#7fb2dc', f: '#a9cbe8', op: 0.6, w: 0.1 } },
  'UKSA-FLOOD-ZONE-3': { aci: 150, lw: 18, svg: { s: '#3f7fc0', f: '#3f7fc0', op: 0.5, w: 0.12 } },
  'UKSA-BRE-25-FACADE': { aci: 30, lw: 50, svg: { s: '#d4572a', w: 0.6 } },
  'UKSA-NOISE-LAEQ16': { aci: 210, lw: 18, svg: { s: '#c43d7e', w: 0.2 } },
  'UKSA-LR-STOP': { aci: 12, lw: 25, svg: { s: '#c8102e' } },
  'UKSA-PARK': { aci: 3, lw: 13, svg: { s: '#2f6b2a', f: '#2f6b2a' } },
  'UKSA-WIND': { aci: 4, lw: 18, svg: { s: '#2a9fc0', f: '#2a9fc0', op: 0.25 } },
  'UKSA-WIND-SUMMER': { aci: 4, lw: 25, lt: LT_DASHED, svg: { s: '#0f5a70', dash: '1.5 0.8', w: 0.3 } },
  'UKSA-VIEW-1.5M': { aci: 140, lw: 25, svg: { s: '#6a4fb3', f: '#6a4fb3', op: 0.3 } },
  'UKSA-VIEW-30M': { aci: 141, lw: 18, lt: LT_DASHED, svg: { s: '#6a4fb3', f: '#6a4fb3', op: 0.1, dash: '1.5 0.8' } },
  'UKSA-WALK-05': { aci: 30, lw: 35, svg: { s: '#e0742b', w: 0.6 } },
  'UKSA-WALK-10': { aci: 50, lw: 25, svg: { s: '#e8b44a', w: 0.4 } },
  'UKSA-WALK-HULL': { aci: 30, lw: 18, lt: LT_DASHED, svg: { s: '#e0742b', dash: '2 1' } },
  'UKSA-WALK-REST': { aci: 9, lw: 9, svg: { s: '#bbbbbb', w: 0.1 } },
  'UKSA-WALK-FRAME': { aci: 8, lw: 18, lt: LT_DASHED, svg: { s: '#999999', dash: '3 1.5' } },
  'UKSA-SUNH-2H': { aci: 40, lw: 25, svg: { s: '#d9a400', w: 0.3 } },
  'UKSA-SVF': { aci: 200, lw: 13, svg: { s: '#5a6fb3', w: 0.15 } },
  'UKSA-NORTH': { aci: 7, lw: 25, svg: { s: '#222222', f: '#222222' } },
  'UKSA-TEXT': { aci: 7, lw: 18, svg: { s: 'none', f: '#222222' } },
};
for (const [, [n, aci, lw]] of Object.entries(ROAD_LAYER)) DEF[n] = { aci, lw, lt: n.endsWith('TUNNEL') ? LT_HIDDEN : n.endsWith('TRACK') ? LT_DASHED : undefined, svg: { s: '#9a8f80', w: lw / 100, dash: n.endsWith('TUNNEL') ? '1 1' : n.endsWith('TRACK') ? '1.5 0.8' : undefined } };
for (const [, [n, aci, c]] of Object.entries(GREEN_LAYER)) DEF[n] = { aci, lw: 13, svg: { s: c, f: c, op: 0.35, w: 0.1 } };
for (const [, [n, aci, c]] of Object.entries(PLAN_LAYER)) DEF[n] = { aci, lw: 18, lt: /ARTICLE|TPO/.test(n) ? LT_DASHED : undefined, svg: { s: c, f: c, op: 0.15, w: 0.25, dash: /ARTICLE|TPO/.test(n) ? '1.5 0.8' : undefined } };
for (const [, [n, aci]] of Object.entries(PED_LAYER)) DEF[n] = { aci, lw: n === 'UKSA-PED-PATH' ? 13 : 25, lt: n === 'UKSA-PED-INDOOR' ? LT_DASHED : undefined, svg: { s: '#1a8a83', w: n === 'UKSA-PED-PATH' ? 0.15 : 0.35, dash: n === 'UKSA-PED-INDOOR' ? '1 0.6' : undefined } };
const SHADOW_FILL = ['#7d8fb3', '#4a5a85', '#2d3a5e'];
// layers that start OFF (kept, not frozen): shadows and view rays make the plan busy; users switch them on (lead decision 25 Oct)
const OFF_BY_DEFAULT = (n) => /^UKSA-SHADOW-|^UKSA-VIEW-|^UKSA-NOISE-/.test(n);
const hourLayer = (s) => 'UKSA-SHADOW-' + (s.id ? s.id.toUpperCase() + '-' : '') + String(s.hr).padStart(2, '0') + '00';

// ---------- small geometry helpers ----------
const fin = (...v) => v.every(Number.isFinite);
function sArea(r) { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; }
function inBox(x, y, b) { return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; }
// polyline clipped to a box -> list of runs (Liang-Barsky per segment, consecutive pieces joined)
function clipLine(pts, b) {
  const runs = []; let cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, x0 - b[0]], [dx, b[2] - x0], [-dy, y0 - b[1]], [dy, b[3] - y0]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p; if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { cur = null; continue; }
    const a = [x0 + t0 * dx, y0 + t0 * dy], c = [x0 + t1 * dx, y0 + t1 * dy];
    if (cur && t0 === 0) cur.push(c); else { cur = [a, c]; runs.push(cur); }
    if (t1 < 1) cur = null;
  }
  return runs.filter((r) => r.length > 1 && (r.length > 2 || Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]) > 0.01));
}
// polygon clipped to a box (Sutherland-Hodgman) -> ring or null
function clipPoly(ring, b) {
  let out = ring;
  const edges = [[(p) => p[0] >= b[0], (p, q) => [b[0], p[1] + ((q[1] - p[1]) * (b[0] - p[0])) / (q[0] - p[0])]],
    [(p) => p[0] <= b[2], (p, q) => [b[2], p[1] + ((q[1] - p[1]) * (b[2] - p[0])) / (q[0] - p[0])]],
    [(p) => p[1] >= b[1], (p, q) => [p[0] + ((q[0] - p[0]) * (b[1] - p[1])) / (q[1] - p[1]), b[1]]],
    [(p) => p[1] <= b[3], (p, q) => [p[0] + ((q[0] - p[0]) * (b[3] - p[1])) / (q[1] - p[1]), b[3]]]];
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const p = src[i], q = src[(i + 1) % src.length], pi = inside(p), qi = inside(q);
      if (pi) out.push(p);
      if (pi !== qi) out.push(cut(p, q));
    }
    if (out.length < 3) return null;
  }
  const clean = [];
  for (const p of out) { const l = clean[clean.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 0.001) clean.push(p); }
  if (clean.length > 1 && Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) <= 0.001) clean.pop();
  return clean.length >= 3 && Math.abs(sArea(clean)) > 0.01 ? clean : null;
}
const ringBox = (r) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of r) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } return [a, b, c, d]; };
const boxHit = (p, q) => p[2] >= q[0] && p[0] <= q[2] && p[3] >= q[1] && p[1] <= q[3];
// chain [x0,y0,x1,y1] segments that share end points into polylines -> [{pts, closed}]
function chain(segs) {
  const key = (x, y) => Math.round(x * 1e4) + ',' + Math.round(y * 1e4), at = new Map(), used = new Uint8Array(segs.length);
  segs.forEach((s, i) => { for (const k of [key(s[0], s[1]), key(s[2], s[3])]) { const l = at.get(k); if (l) l.push(i); else at.set(k, [i]); } });
  const next = (x, y) => { const l = at.get(key(x, y)); if (!l) return -1; for (const i of l) if (!used[i]) return i; return -1; };
  const out = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue; used[s0] = 1;
    const s = segs[s0], fwd = [[s[0], s[1]], [s[2], s[3]]], back = [];
    for (const [list, tail] of [[fwd, () => fwd[fwd.length - 1]], [back, () => (back.length ? back[back.length - 1] : fwd[0])]]) {
      for (;;) {
        const [x, y] = tail(), i = next(x, y); if (i < 0) break; used[i] = 1;
        const q = segs[i], k = key(x, y), p = key(q[0], q[1]) === k ? [q[2], q[3]] : [q[0], q[1]];
        list.push(p);
      }
    }
    const pts = back.reverse().concat(fwd), a = pts[0], z = pts[pts.length - 1];
    const closed = pts.length > 3 && key(a[0], a[1]) === key(z[0], z[1]);
    if (closed) pts.pop();
    out.push({ pts, closed });
  }
  return out;
}
// join polylines that meet end to end (greedy; a junction ends a run) -> [[x,y],...][]
function joinLines(lines) {
  const key = (p) => Math.round(p[0] * 1e3) + ',' + Math.round(p[1] * 1e3), at = new Map(), used = new Uint8Array(lines.length);
  lines.forEach((l, i) => { for (const k of [key(l[0]), key(l[l.length - 1])]) { const a = at.get(k); if (a) a.push(i); else at.set(k, [i]); } });
  const grab = (p) => { const a = at.get(key(p)); if (!a || a.length !== 2) return -1; for (const i of a) if (!used[i]) return i; return -1; };
  const out = [];
  for (let s0 = 0; s0 < lines.length; s0++) {
    if (used[s0]) continue; used[s0] = 1; let run = lines[s0].slice();
    for (let pass = 0; pass < 2; pass++) {
      for (;;) {
        const end = run[run.length - 1], i = grab(end); if (i < 0) break; used[i] = 1;
        const l = key(lines[i][0]) === key(end) ? lines[i] : lines[i].slice().reverse();
        run = run.concat(l.slice(1));
      }
      run.reverse();
    }
    out.push(run);
  }
  return out;
}
// marching squares on a grid of cell-centre values (NaN = no data: the cell square is skipped)
function iso(v, nx, ny, X, Y, level) {
  const TAB = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[0, 3]], []];
  const segs = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
    if (!fin(a, b, c, d)) continue;
    const code = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
    if (!code || code === 15) continue;
    const x0 = X(i), x1 = X(i + 1), y0 = Y(j), y1 = Y(j + 1);
    const ep = (e) => e === 0 ? [x0 + ((level - a) / (b - a)) * (x1 - x0), y0] : e === 1 ? [x1, y0 + ((level - b) / (c - b)) * (y1 - y0)]
      : e === 2 ? [x0 + ((level - d) / (c - d)) * (x1 - x0), y1] : [x0, y0 + ((level - a) / (d - a)) * (y1 - y0)];
    for (const [e1, e2] of TAB[code]) { const p = ep(e1), q = ep(e2); segs.push([p[0], p[1], q[0], q[1]]); }
  }
  return chain(segs);
}
// outline of a prism's shadow on a level plane: the footprint swept from offset vb to offset vt
// (the convolution of the ring with the segment; exact for convex rings, may loop inside itself for notched ones;
//  its non-zero winding region is the shadow).
function sweep(ring, vb, vt) {
  const r = sArea(ring) < 0 ? ring.slice().reverse() : ring, n = r.length, vx = vt[0] - vb[0], vy = vt[1] - vb[1];
  if (Math.hypot(vx, vy) < 1e-6) return r.map(([x, y]) => [x + vb[0], y + vb[1]]);
  const front = [];                                    // edge i (r[i] -> r[i+1]) faces the sweep direction
  for (let i = 0; i < n; i++) { const a = r[i], b = r[(i + 1) % n]; front.push((b[1] - a[1]) * vx - (b[0] - a[0]) * vy > 0); }
  const out = [], add = (p, o) => out.push([p[0] + o[0], p[1] + o[1]]);
  for (let i = 0; i < n; i++) {
    const prev = front[(i - 1 + n) % n], cur = front[i], p = r[i];
    if (prev !== cur) { add(p, prev ? vt : vb); add(p, cur ? vt : vb); } else add(p, cur ? vt : vb);
  }
  return out;
}
function selfCross(ring) {
  const n = ring.length; if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = ring[j], d = ring[(j + 1) % n];
      if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
      const o = (p, q, r2) => (q[0] - p[0]) * (r2[1] - p[1]) - (q[1] - p[1]) * (r2[0] - p[0]);
      const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
      if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return true;
    }
  }
  return false;
}
// exact outline of the non-zero region of a self-crossing cycle: split every edge where edges cross or overlap, keep the pieces
// with "inside" on one side only, oriented with inside on the left, and chain them into loops (outer CCW, holes CW).
function outline(cyc) {
  const n = cyc.length, cr = (ax, ay, bx, by) => ax * by - ay * bx, ts = cyc.map(() => [0, 1]);
  for (let i = 0; i < n; i++) {
    const p = cyc[i], p2 = cyc[(i + 1) % n], rx = p2[0] - p[0], ry = p2[1] - p[1];
    for (let j = i + 1; j < n; j++) {
      const q = cyc[j], q2 = cyc[(j + 1) % n], sx = q2[0] - q[0], sy = q2[1] - q[1];
      if (Math.max(p[0], p2[0]) < Math.min(q[0], q2[0]) - 1e-6 || Math.max(q[0], q2[0]) < Math.min(p[0], p2[0]) - 1e-6 ||
        Math.max(p[1], p2[1]) < Math.min(q[1], q2[1]) - 1e-6 || Math.max(q[1], q2[1]) < Math.min(p[1], p2[1]) - 1e-6) continue;
      const den = cr(rx, ry, sx, sy), qpx = q[0] - p[0], qpy = q[1] - p[1], lr = Math.hypot(rx, ry), ls = Math.hypot(sx, sy);
      if (Math.abs(den) > 1e-9 * lr * ls) {
        const t = cr(qpx, qpy, sx, sy) / den, u = cr(qpx, qpy, rx, ry) / den;
        if (t > -1e-9 && t < 1 + 1e-9 && u > -1e-9 && u < 1 + 1e-9) { ts[i].push(t); ts[j].push(u); }
      } else if (Math.abs(cr(qpx, qpy, rx, ry)) < 1e-6 * lr && lr > 0 && ls > 0) {      // collinear: split each at the other's ends
        for (const e of [q, q2]) { const t = ((e[0] - p[0]) * rx + (e[1] - p[1]) * ry) / (lr * lr); if (t > 0 && t < 1) ts[i].push(t); }
        for (const e of [p, p2]) { const u = ((e[0] - q[0]) * sx + (e[1] - q[1]) * sy) / (ls * ls); if (u > 0 && u < 1) ts[j].push(u); }
      }
    }
  }
  const wind = (x, y) => {
    let w = 0;
    for (let i = 0; i < n; i++) {
      const a = cyc[i], b = cyc[(i + 1) % n];
      if (a[1] <= y) { if (b[1] > y && cr(b[0] - a[0], b[1] - a[1], x - a[0], y - a[1]) > 0) w++; }
      else if (b[1] <= y && cr(b[0] - a[0], b[1] - a[1], x - a[0], y - a[1]) < 0) w--;
    }
    return w;
  };
  const keep = [], key = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4), seen = new Set();
  for (let i = 0; i < n; i++) {
    const p = cyc[i], p2 = cyc[(i + 1) % n], rx = p2[0] - p[0], ry = p2[1] - p[1], t = [...new Set(ts[i])].sort((a, b) => a - b);
    for (let k = 0; k < t.length - 1; k++) {
      const a = [p[0] + rx * t[k], p[1] + ry * t[k]], b = [p[0] + rx * t[k + 1], p[1] + ry * t[k + 1]], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      if (l < 1e-5) continue;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = (-dy / l) * 1e-3, ny = (dx / l) * 1e-3;
      const inL = wind(mx + nx, my + ny) !== 0, inR = wind(mx - nx, my - ny) !== 0;
      if (inL === inR) continue;
      const s = inL ? [a, b] : [b, a], kk = key(s[0]) + '>' + key(s[1]);
      if (seen.has(kk)) continue; seen.add(kk); keep.push(s);
    }
  }
  const from = new Map(); keep.forEach((s, i) => { const k = key(s[0]); if (!from.has(k)) from.set(k, []); from.get(k).push(i); });
  const used = new Uint8Array(keep.length), loops = [];
  for (let s0 = 0; s0 < keep.length; s0++) {
    if (used[s0]) continue;
    const loop = [keep[s0][0]]; let cur = s0;
    for (let guard = 0; guard < keep.length + 1; guard++) {
      used[cur] = 1; const end = keep[cur][1];
      if (key(end) === key(loop[0])) break;
      loop.push(end);
      const nxt = (from.get(key(end)) || []).find((i) => !used[i]); if (nxt === undefined) break; cur = nxt;
    }
    // drop points on straight runs
    const out = loop.filter((q, i) => { const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length]; return Math.abs(cr(q[0] - a[0], q[1] - a[1], b[0] - q[0], b[1] - q[1])) > 1e-6; });
    if (out.length >= 3 && Math.abs(sArea(out)) > 0.01) loops.push(out);
  }
  return loops;
}
const okRes = (x) => x && typeof x === 'object' && !x.error;
const titleCase = (s) => (s ? String(s).toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : '');
const DIR16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

// ---------- the model: every layer and its items, in HK1980 metres ----------
// item kinds: {t:'pl', pts, closed, z?, th?} {t:'circle', x, y, r} {t:'point', x, y, z} {t:'text', x, y, h, s, al ('l'|'c'|'r'), mid?, z?}
//             {t:'mtext', x, y, h, w, s}
function model(res, opts = {}) {
  const f = res.f, S = f.s || f.E1 - f.E0, box = [f.E0, f.N0, f.E1, f.N1];
  const layers = new Map(), stats = { shadowLoops: 0 };
  const L = (name) => { let l = layers.get(name); if (!l) { l = { name, ...(DEF[name] || { aci: 7, lw: 18, svg: { s: '#333333' } }), items: [] }; layers.set(name, l); } return l.items; };
  const pl = (name, pts, closed, extra) => { if (pts && pts.length >= (closed ? 3 : 2) && pts.every((p) => fin(p[0], p[1]))) L(name).push({ t: 'pl', pts, closed, ...extra }); };
  const text = (name, x, y, h, s, extra) => { if (fin(x, y, h) && s !== '' && s != null) L(name).push({ t: 'text', x, y, h, s: String(s), al: 'l', ...extra }); };
  const hT = S / 150, hS = S / 300, hXS = S / 500;            // text heights (m): title, labels, small labels
  const U = box.slice(), notes = [];                          // U: union of the frame and the walk frame (title block goes below it)

  // frame and site
  pl('UKSA-FRAME', [[f.E0, f.N0], [f.E1, f.N0], [f.E1, f.N1], [f.E0, f.N1]], true);
  pl('UKSA-SITE', res.R.map((p) => [p[0], p[1]]), true);

  // priority habitats (Natural England), clipped to the frame
  const x = res.extra || {};
  if (Array.isArray(x.green)) for (const g of x.green) {
    const ly = GREEN_LAYER[g.cls]; if (!ly || !g.ring) continue;
    const bb = ringBox(g.ring); if (!boxHit(bb, box)) continue;
    const c = clipPoly(g.ring, box); if (c) pl(ly[0], c, true);
    for (const h of g.holes || []) { const ch = clipPoly(h, box); if (ch) pl(ly[0], ch, true); }
  }
  // planning constraints and flood zones (planning.data.gov.uk), clipped to the frame; listed buildings and protected trees as points
  const pls = res.plan && res.plan.sets;
  if (pls) for (const [ds, st] of Object.entries(pls)) {
    if (!st || !st.items) continue;
    if (PLAN_LAYER[ds]) for (const it of st.items) for (const P of it.polys || []) {
      for (const r of [P.outer, ...(P.holes || [])]) { if (!boxHit(ringBox(r), box)) continue; const c = clipPoly(r, box); if (c) pl(PLAN_LAYER[ds][0], c, true); }
      if (it.name && P.outer && boxHit(ringBox(P.outer), box) && ds !== 'listed-building-outline') { const cc = ringBox(clipPoly(P.outer, box) || P.outer); text(PLAN_LAYER[ds][0], (cc[0] + cc[2]) / 2, (cc[1] + cc[3]) / 2, hXS, it.name, { al: 'c', mid: true }); }
    }
    if (ds === 'listed-building' || ds === 'tree') for (const it of st.items) for (const [E, N] of it.points || []) {
      if (!fin(E, N) || !inBox(E, N, box)) continue;
      const name = ds === 'tree' ? 'UKSA-PLAN-TPO-TREE' : 'UKSA-PLAN-LISTED', d = S / 300;
      L(name).push({ t: 'point', x: E, y: N, z: 0 });
      if (ds === 'tree') L(name).push({ t: 'circle', x: E, y: N, r: d });
      else { pl(name, [[E, N + d], [E + d, N], [E, N - d], [E - d, N]], true); text(name, E + d * 1.5, N, hXS, `Grade ${it.grade || '?'}${it.ref ? ' (' + it.ref + ')' : ''}`, { mid: true }); }
    }
  }
  if (res.flood && Array.isArray(res.flood.items)) for (const it of res.flood.items) {
    const name = String(it.level) === '3' ? 'UKSA-FLOOD-ZONE-3' : 'UKSA-FLOOD-ZONE-2';
    for (const P of it.polys || []) for (const r of [P.outer, ...(P.holes || [])]) { if (!boxHit(ringBox(r), box)) continue; const c = clipPoly(r, box); if (c) pl(name, c, true); }
  }
  if (res.bre && Array.isArray(res.bre.faces)) for (const F of res.bre.faces) pl('UKSA-BRE-25-FACADE', [F.a, F.c], false, { z: F.z });
  if (x.noise && x.noise.day && x.noise.W > 1) {
    const z = x.noise;
    for (const lev of [55, 60, 65, 70]) for (const ch of iso(z.day, z.W, z.H, (i) => z.x0 + (i + 0.5) * z.cell, (j) => z.y1 - (j + 0.5) * z.cell, lev)) {
      pl('UKSA-NOISE-LAEQ16', ch.pts, ch.closed);
      if (ch.pts.length > 10) { const m = ch.pts[ch.pts.length >> 1]; text('UKSA-NOISE-LAEQ16', m[0], m[1], hXS, `${lev} dB`, { al: 'c', mid: true }); }
    }
  }
  if (Array.isArray(x.parks)) for (const p of x.parks) {
    if (!fin(p.E, p.N) || !inBox(p.E, p.N, box)) continue;
    L('UKSA-PARK').push({ t: 'point', x: p.E, y: p.N, z: 0 }, { t: 'circle', x: p.E, y: p.N, r: S / 250 });
    text('UKSA-PARK', p.E + S / 150, p.N, hXS, [p.en, p.zh].filter(Boolean).join(' '), { mid: true });
  }

  // 12:00 shadows on 21 Mar, 21 Jun, 21 Dec (per block, as the board draws them: the footprint swept from vb to vt, on the plane at the site's mean ground)
  for (const [k, s] of (res.sun || []).entries()) {
    const name = hourLayer(s); L(name); layers.get(name).aci = HOUR_ACI[k % 3]; layers.get(name).svg = { s: SHADOW_FILL[k % 3], f: SHADOW_FILL[k % 3], op: 0.16, w: 0.1, rule: 'nonzero' };
    for (const sh of s.paths || []) {
      const r = sweep(sh.ring, sh.vb, sh.vt);
      if (!boxHit(ringBox(r), box)) continue;
      let rings = [r];
      if (selfCross(r)) { stats.shadowLoops++; const o = outline(r); if (o.length) rings = o; else stats.shadowRaw = (stats.shadowRaw || 0) + 1; }
      for (const g of rings) { const c = clipPoly(g, box); if (c) pl(name, c, true); }
    }
  }

  // views: isovists from the site centre at 1.5 m (street) and 30 m up; distances capped at the frame side like the board
  if (okRes(res.views)) {
    const v = res.views;
    for (const [key, name] of [['up', 'UKSA-VIEW-30M'], ['street', 'UKSA-VIEW-1.5M']]) {
      const iv = v[key]; if (!iv || !iv.d) continue;
      const n = iv.d.length, pts = [];
      for (let i = 0; i < n; i++) { const a = (i * 2 * Math.PI) / n, d = Math.min(iv.d[i], S); pts.push([v.x0 + d * Math.sin(a), v.y0 + d * Math.cos(a)]); }
      pl(name, pts, true);
    }
  }

  // contours (5 m DTM, smoothed as on the board), clipped to the frame, chained into polylines at their level
  for (const c of res.contours || []) {
    const name = c.idx ? 'UKSA-CONTOUR-MAJOR' : 'UKSA-CONTOUR-MINOR';
    for (const ch of chain(c.segs)) {
      const runs = ch.closed && ch.pts.every((p) => inBox(p[0], p[1], box)) ? [[ch.pts, true]] : clipLine(ch.closed ? ch.pts.concat([ch.pts[0]]) : ch.pts, box).map((r) => [r, false]);
      for (const [pts, cl] of runs) pl(name, pts, cl, { z: c.v });
      if (c.idx) for (const [pts] of runs) {                   // one label per index contour run long enough to read
        if (pts.length < 6) continue;
        const m = pts[pts.length >> 1];
        text('UKSA-CONTOUR-LABEL', m[0], m[1], hXS, `+${c.v}`, { al: 'c', mid: true, z: c.v });
      }
    }
  }

  // roads (OS Open Roads) and paths (OpenStreetMap, when loaded)
  for (const r of res.roadRuns || []) {
    const ly = (ROAD_LAYER[r.cls] || ['UKSA-ROAD-' + String(r.cls || 'OTHER').toUpperCase().replace(/[^A-Z0-9]+/g, '-'), 8, 18])[0];
    if (!DEF[ly]) DEF[ly] = { aci: 8, lw: 18, svg: { s: '#9a8f80', w: 0.18 } };
    for (const run of clipLine(r.pts.map((p) => [p[0], p[1]]), box)) pl(ly, run, false);
  }
  if (Array.isArray(x.ped)) for (const l of x.ped) {
    const k = l.k === 'cross' ? 'cross' : l.indoor ? 'indoor' : PED_LAYER[l.k] ? l.k : 'path';
    for (const run of clipLine(l.pts, box)) pl(PED_LAYER[k][0], run, false);
  }

  // buildings: closed footprints at their base level, extruded by thickness to the top (mPD); heights and names as text
  const flat = !!opts.cadFlat;
  const named = new Map();
  for (const b of res.frameBlocks || (res.blocks || []).filter((q) => q.inFrame)) {
    if (!fin(b.zb, b.zt)) continue;
    const name = b.onSite ? 'UKSA-BLDG-SITE' : 'UKSA-BLDG', ex = flat ? {} : { z: b.zb, th: Math.max(0, b.zt - b.zb) };
    pl(name, b.ring, true, ex);
    for (const hl of b.holes || []) pl(name, hl, true, ex);
    if (inBox(b.c[0], b.c[1], box)) {
      text('UKSA-BLDG-HEIGHT', b.c[0], b.c[1], hXS, `+${b.zt.toFixed(1)} (${b.H.toFixed(1)} m)`, { al: 'c', mid: true });
      if (b.en || b.tc) { const o = named.get(b.id); if (!o || b.zt > o.zt) named.set(b.id, b); }
    }
  }
  for (const b of [...named.values()].sort((a, c) => String(a.id).localeCompare(String(c.id)))) {
    text('UKSA-BLDG-NAME', b.c[0], b.c[1] - hXS * 1.6, hXS, [titleCase(b.en), b.tc].filter(Boolean).join(' '), { al: 'c', mid: true });
  }

  // spot levels: point at ground level, marker cross, level text
  for (const sp of res.spots || []) {
    const [E, N, z] = sp; if (!fin(E, N, z)) continue;
    const d = S / 300;
    L('UKSA-SPOT').push({ t: 'point', x: E, y: N, z });
    pl('UKSA-SPOT', [[E - d, N - d], [E + d, N + d]], false); pl('UKSA-SPOT', [[E - d, N + d], [E + d, N - d]], false);
    text('UKSA-SPOT', E + d * 1.5, N + d * 1.5, hXS, `+${z.toFixed(2)}`, {});
  }

  // access: bus stops and station entrances (NaPTAN snapshot)
  if (Array.isArray(x.bus)) for (const [E, N] of x.bus) {
    if (!fin(E, N) || !inBox(E, N, box)) continue;
    L('UKSA-BUS').push({ t: 'point', x: E, y: N, z: 0 }, { t: 'circle', x: E, y: N, r: S / 200 });
    text('UKSA-BUS', E + S / 150, N, hXS, 'BUS', { mid: true });
  }
  if (okRes(x.mtr)) {
    for (const e of x.mtr.exits || []) {
      if (!fin(e.E, e.N) || !inBox(e.E, e.N, box)) continue;
      const d = S / 250;
      L('UKSA-STATION-ENTRANCE').push({ t: 'point', x: e.E, y: e.N, z: 0 });
      pl('UKSA-STATION-ENTRANCE', [[e.E - d, e.N - d], [e.E + d, e.N - d], [e.E + d, e.N + d], [e.E - d, e.N + d]], true);
      const st = e.station || {};
      text('UKSA-STATION-ENTRANCE', e.E + d * 1.6, e.N, hXS, `${st.en || 'Station'} entrance`, { mid: true });
    }
    for (const q of x.mtr.lr || []) {
      if (!fin(q.E, q.N) || !inBox(q.E, q.N, box)) continue;
      L('UKSA-LR-STOP').push({ t: 'point', x: q.E, y: q.N, z: 0 }, { t: 'circle', x: q.E, y: q.N, r: S / 250 });
      text('UKSA-LR-STOP', q.E + S / 150, q.N, hXS, ['Light Rail', q.en, q.zh].filter(Boolean).join(' '), { mid: true });
    }
  }

  // wind rose (PlanD site wind data, 200 m level) at the site centre: petals point to where the wind comes FROM, grid north up
  const w = x.wind;
  if (okRes(w) && Array.isArray(w.annual) && w.annual.length === 16) {
    const [cx, cy] = res.siteC, r0 = 0.03 * S, Rm = 0.38 * S, sm = Array.isArray(w.summer) && w.summer.length === 16 ? w.summer : null;
    const mx = Math.max(...w.annual, ...(sm || [])), sc = (v) => r0 + (Rm - r0) * Math.sqrt(Math.max(0, v) / mx);
    const petal = (i, v, half) => {
      const a0 = ((i * 22.5 - half) * Math.PI) / 180, a1 = ((i * 22.5 + half) * Math.PI) / 180, r = sc(v), q = [];
      q.push([cx + r0 * Math.sin(a0), cy + r0 * Math.cos(a0)]);
      for (let k = 0; k <= 6; k++) { const a = a0 + ((a1 - a0) * k) / 6; q.push([cx + r * Math.sin(a), cy + r * Math.cos(a)]); }
      q.push([cx + r0 * Math.sin(a1), cy + r0 * Math.cos(a1)]);
      return q;
    };
    if (mx > 0) {
      w.annual.forEach((v, i) => { if (v > 0) pl('UKSA-WIND', petal(i, v, 9.5), true); });
      if (sm) sm.forEach((v, i) => { if (v > 0) pl('UKSA-WIND-SUMMER', petal(i, v, 7), true); });
      for (const pc of [0.1, 0.2, 0.3]) if (pc <= mx * 1.05) {
        L('UKSA-WIND').push({ t: 'circle', x: cx, y: cy, r: sc(pc), ring: true });
        text('UKSA-WIND', cx + S / 200, cy + sc(pc) + S / 300, hXS, `${pc * 100}%`, {});
      }
      for (const [i, s] of [[0, 'N'], [4, 'E'], [8, 'S'], [12, 'W']]) { const a = (i * 22.5 * Math.PI) / 180, r = Rm + S / 30; text('UKSA-WIND', cx + r * Math.sin(a), cy + r * Math.cos(a), hS, s, { al: 'c', mid: true }); }
      const ia = w.annual.indexOf(Math.max(...w.annual));
      text('UKSA-WIND', cx - Rm, cy - Rm - S / 25, hXS, `Wind rose, ERA5 reanalysis via Open-Meteo (CC BY 4.0), ${w.years ? w.years.join('-') : ''}, 10 m: all year (solid), summer (dashed). Most often from the ${DIR16[ia]} (${(w.annual[ia] * 100).toFixed(0)}% of hours).`, {});
    }
  }

  // v3 analyses (each may be missing or {error})
  const wk = res.walk;
  if (okRes(wk) && Array.isArray(wk.edges)) {
    const wf = wk.frame;
    if (wf && fin(wf.E0, wf.N0, wf.E1, wf.N1)) {
      pl('UKSA-WALK-FRAME', [[wf.E0, wf.N0], [wf.E1, wf.N0], [wf.E1, wf.N1], [wf.E0, wf.N1]], true);
      U[0] = Math.min(U[0], wf.E0); U[1] = Math.min(U[1], wf.N0); U[2] = Math.max(U[2], wf.E1); U[3] = Math.max(U[3], wf.N1);
    }
    notes.push(`Walk: ${wk.mins ? wk.mins.join(' and ') : '5 and 10'} minute reach along the ${wk.net === 'road' ? 'road centrelines' : 'pedestrian network'}${wk.speed ? ` at ${wk.speed} m per minute` : ''}; drawn in its own larger frame (UKSA-WALK-FRAME).`);
    const wb = wf && fin(wf.E0, wf.N0, wf.E1, wf.N1) ? [wf.E0, wf.N0, wf.E1, wf.N1] : null;
    const put = (name, list) => {
      const ls = list.filter((e) => e && Array.isArray(e.pts) && e.pts.length > 1).map((e) => e.pts.map((p) => [p[0], p[1]]).filter((p) => fin(p[0], p[1]))).filter((l) => l.length > 1);
      for (const l of joinLines(ls)) for (const run of wb ? clipLine(l, wb) : [l]) pl(name, run, false);
    };
    put('UKSA-WALK-05', wk.edges.filter((e) => e.band === 5)); put('UKSA-WALK-10', wk.edges.filter((e) => e.band !== 5)); put('UKSA-WALK-REST', wk.rest || []);
    if (wk.hull) for (const m of [5, 10]) if (Array.isArray(wk.hull[m]) && wk.hull[m].length >= 3) {
      pl('UKSA-WALK-HULL', wk.hull[m].map((p) => [p[0], p[1]]), true);
      const top = wk.hull[m].reduce((a, p) => (p[1] > a[1] ? p : a));
      text('UKSA-WALK-HULL', top[0], top[1] + S / 200, hXS, `${m} min walk${wk.speed ? ` at ${wk.speed} m/min` : ''}`, { al: 'c' });
    }
  }
  const sh = res.sunh;
  if (okRes(sh) && sh.grid && sh.hours) {
    const id = sh.show && sh.hours[sh.show] ? sh.show : Object.keys(sh.hours)[0], v = sh.hours[id], g = sh.grid;
    if (v && g.nx > 1 && g.ny > 1) {
      for (const ch of iso(v, g.nx, g.ny, (i) => g.x0 + (i + 0.5) * g.cell, (j) => g.y0 + (j + 0.5) * g.cell, 2)) pl('UKSA-SUNH-2H', ch.pts, ch.closed);
      const dt = (sh.dates || []).find((d) => d.id === id);
      notes.push(`UKSA-SUNH-2H: line of 2 hours of direct sun at ground level on ${dt ? dt.en : id}.`);
    }
  }
  const sv = res.svf;
  if (okRes(sv) && sv.grid && sv.v) {
    const g = sv.grid;
    if (g.nx > 1 && g.ny > 1) for (const lev of [0.3, 0.5, 0.7]) {
      for (const ch of iso(sv.v, g.nx, g.ny, (i) => g.x0 + (i + 0.5) * g.cell, (j) => g.y0 + (j + 0.5) * g.cell, lev)) {
        pl('UKSA-SVF', ch.pts, ch.closed);
        if (ch.pts.length > 8) { const m = ch.pts[ch.pts.length >> 1]; text('UKSA-SVF', m[0], m[1], hXS, lev.toFixed(1), { al: 'c', mid: true }); }
      }
    }
  }

  // grid north arrow (top right inside the frame) and true north note
  {
    const ax = f.E1 - S * 0.06, ay = f.N1 - S * 0.14, len = S * 0.07, wd = S * 0.018;
    pl('UKSA-NORTH', [[ax, ay + len], [ax + wd, ay], [ax, ay + len * 0.28], [ax - wd, ay]], true);
    text('UKSA-NORTH', ax, ay + len + S / 60, hT, 'N', { al: 'c' });
    if (fin(res.tn)) text('UKSA-NORTH', ax, ay - S / 40, hXS, `Grid north. True north ${Math.abs(res.tn).toFixed(2)}° ${res.tn >= 0 ? 'east' : 'west'}`, { al: 'c' });
  }

  // title, notes, credits and disclaimer below the frame
  {
    const name = opts.name || '', a = res.siteC, x0 = U[0];
    let y = U[1] - S / 25;
    const line = (s, h) => { text('UKSA-TEXT', x0, y, h, s, {}); y -= h * 1.7; };
    line('' + (name ? ': ' + name : ''), hT);
    line(`Site centre E ${a[0].toFixed(1)} N ${a[1].toFixed(1)} (British National Grid, EPSG:27700, metres; ${res.gridRef || ''}; Z = m AOD). Site area ${Math.round(res.siteArea)} m2. Ground +${res.zmin.toFixed(1)} to +${res.zmax.toFixed(1)} m AOD. Frame ${S} m square, SW corner E ${f.E0.toFixed(1)} N ${f.N0.toFixed(1)}.`, hXS);
    line(`Buildings: LiDAR blocks (EA first-return DSM minus DTM, roofs told from trees by first minus last return), footprint at base level, thickness to top level (m AOD); text = top level (height above ground). Contours every ${res.interval} m on the LiDAR DTM (5 m means, smoothed). Shadows: 12:00 on ${(res.sun || []).map((s) => s.en + (s.tz ? ' BST' : ' GMT')).join(', ')}, on a level plane at +${res.zs.toFixed(1)} m AOD, blocks on the site left out. BRE 25 deg facades: neighbouring facades facing the site, at the assumed window level (Z). Views: isovists from the site centre at 1.5 m and 30 m, capped at ${S} m.`, hXS);
    if (okRes(res.svf) && res.svf.grid) notes.push('UKSA-SVF: sky view factor lines at 0.3, 0.5 and 0.7 (sky view factor analysis).');
    for (const nt of notes) line(nt, hXS);
    line(`Drawn ${opts.drawn || ''} at anzonwong.com/lab/uk-site-analysis (AW Design hobby tool).`, hXS);
    y -= hXS;
    L('UKSA-TEXT').push({ t: 'mtext', x: x0, y, h: hXS, w: S, s: CREDITS_EN + '\n' + CREDITS_ZH + '\n' + DISC_EN + ' ' + DISC_ZH });
  }
  // draw order (SVG paint order and DXF entity order): ground fills, linework, buildings, site, symbols and labels, frame and text
  const ORDER = ['UKSA-PLAN-GREEN', 'UKSA-PLAN-NATIONAL', 'UKSA-FLOOD', 'UKSA-HABITAT', 'UKSA-PLAN', 'UKSA-NOISE', 'UKSA-GREEN', 'UKSA-SHADOW', 'UKSA-SUNH', 'UKSA-SVF', 'UKSA-VIEW', 'UKSA-CONTOUR-M', 'UKSA-ROAD', 'UKSA-PED', 'UKSA-WALK-REST', 'UKSA-WALK-10', 'UKSA-WALK-05', 'UKSA-WALK-HULL',
    'UKSA-WALK-FRAME', 'UKSA-BLDG-SITE', 'UKSA-BLDG', 'UKSA-WIND', 'UKSA-SITE', 'UKSA-BLDG-HEIGHT', 'UKSA-BLDG-NAME', 'UKSA-CONTOUR-LABEL', 'UKSA-SPOT', 'UKSA-PARK', 'UKSA-BUS', 'UKSA-LR', 'UKSA-MTR', 'UKSA-STATION', 'UKSA-BRE',
    'UKSA-NORTH', 'UKSA-FRAME', 'UKSA-TEXT'];
  const rank = (n) => { let best = ORDER.length, len = -1; ORDER.forEach((p, i) => { if ((n === p || n.startsWith(p)) && p.length > len) { best = i; len = p.length; } }); return best; };
  const out = [...layers.values()].filter((l) => l.items.length).map((l, i) => ({ l, i, r: rank(l.name) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.l);
  return { layers: out, f, S, U, stats };
}

// ---------- DXF writer (R2000) ----------
const n3 = (v) => (Math.abs(v) < 5e-4 ? '0.0' : v.toFixed(3));
function dxfStr(s) {                                    // non-ASCII -> \U+XXXX; astral -> '?'; control chars dropped
  let o = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c < 32) continue;
    if (c < 127) o += ch; else if (c > 0xffff) o += '?'; else o += '\\U+' + c.toString(16).toUpperCase().padStart(4, '0');
  }
  return o;
}
const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);
export function toDXF(res, opts = {}) {
  const M = model(res, opts), o = [];
  let hnd = 0x40; const H = () => (hnd++).toString(16).toUpperCase();
  const MS = '17', PS = '1B';
  const ext = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const grow = (x, y, z = 0) => { if (x < ext[0]) ext[0] = x; if (y < ext[1]) ext[1] = y; if (z < ext[2]) ext[2] = z; if (x > ext[3]) ext[3] = x; if (y > ext[4]) ext[4] = y; if (z > ext[5]) ext[5] = z; };
  const p = (...kv) => { for (let i = 0; i < kv.length; i += 2) o.push(kv[i], kv[i + 1]); };
  const ent = (type, layer) => p(0, type, 5, H(), 330, MS, 100, 'AcDbEntity', 8, layer);
  // entities first (handles from the counter), tables after (they need the layer list and use the same counter)
  for (const l of M.layers) {
    for (const it of l.items) {
      if (it.t === 'pl') {
        ent('LWPOLYLINE', l.name);
        p(100, 'AcDbPolyline', 90, it.pts.length, 70, it.closed ? 1 : 0);
        if (it.z) p(38, n3(it.z));
        if (it.th) p(39, n3(it.th));
        for (const [x, y] of it.pts) { p(10, n3(x), 20, n3(y)); grow(x, y, it.z || 0); if (it.th) grow(x, y, (it.z || 0) + it.th); }
      } else if (it.t === 'circle') {
        ent('CIRCLE', l.name); p(100, 'AcDbCircle', 10, n3(it.x), 20, n3(it.y), 30, '0.0', 40, n3(it.r)); grow(it.x - it.r, it.y - it.r); grow(it.x + it.r, it.y + it.r);
      } else if (it.t === 'point') {
        ent('POINT', l.name); p(100, 'AcDbPoint', 10, n3(it.x), 20, n3(it.y), 30, n3(it.z || 0)); grow(it.x, it.y, it.z || 0);
      } else if (it.t === 'text') {
        const s = dxfStr(it.s), st = isAscii(it.s) ? 'Standard' : 'UKSA-CJK', z = n3(it.z || 0);
        const ha = it.al === 'c' ? 1 : it.al === 'r' ? 2 : 0, va = it.mid ? 2 : 0;
        ent('TEXT', l.name); p(100, 'AcDbText', 10, n3(it.x), 20, n3(it.y), 30, z, 40, n3(it.h), 1, s, 7, st);
        if (ha || va) p(72, ha, 11, n3(it.x), 21, n3(it.y), 31, z);
        p(100, 'AcDbText'); if (va) p(73, va);
        grow(it.x, it.y, it.z || 0);
      } else if (it.t === 'mtext') {
        let s = String(it.s).replace(/\\/g, '\\\\').replace(/[{}]/g, (m) => '\\' + m).split('\n').map(dxfStr).join('\\P');
        ent('MTEXT', l.name); p(100, 'AcDbMText', 10, n3(it.x), 20, n3(it.y), 30, '0.0', 40, n3(it.h), 41, n3(it.w), 71, 1, 72, 1);
        while (s.length > 250) { let k = 250; const bs = s.lastIndexOf('\\', k); if (bs > k - 8) k = bs; p(3, s.slice(0, k)); s = s.slice(k); }
        p(1, s, 7, 'UKSA-CJK');
        grow(it.x, it.y); grow(it.x + it.w, it.y - it.h * 40);
      }
    }
  }
  const ents = o.splice(0, o.length);
  if (!Number.isFinite(ext[0])) { ext[0] = M.f.E0; ext[1] = M.f.N0; ext[2] = 0; ext[3] = M.f.E1; ext[4] = M.f.N1; ext[5] = 0; }

  // tables
  const lts = [['ByBlock', '', []], ['ByLayer', '', []], ['Continuous', 'Solid line', []], [LT_DASHED, 'Dashed __ __ __', [2, -1]], [LT_HIDDEN, 'Hidden _ _ _ _', [1, -0.5]]];
  const ltH = { ByBlock: '24', ByLayer: '25', Continuous: '26' };
  const tables = [];
  const T = (...kv) => { for (let i = 0; i < kv.length; i += 2) tables.push(kv[i], kv[i + 1]); };
  T(0, 'SECTION', 2, 'TABLES');
  T(0, 'TABLE', 2, 'VPORT', 5, '8', 330, '0', 100, 'AcDbSymbolTable', 70, 1);
  const vw = Math.max(ext[3] - ext[0], ext[4] - ext[1]) * 1.05;
  T(0, 'VPORT', 5, '23', 330, '8', 100, 'AcDbSymbolTableRecord', 100, 'AcDbViewportTableRecord', 2, '*Active', 70, 0, 10, '0.0', 20, '0.0', 11, '1.0', 21, '1.0',
    12, n3((ext[0] + ext[3]) / 2), 22, n3((ext[1] + ext[4]) / 2), 13, '0.0', 23, '0.0', 14, '1.0', 24, '1.0', 15, '10.0', 25, '10.0', 16, '0.0', 26, '0.0', 36, '1.0',
    17, '0.0', 27, '0.0', 37, '0.0', 40, n3(vw), 41, '1.4', 42, '50.0', 43, '0.0', 44, '0.0', 50, '0.0', 51, '0.0', 71, 0, 72, 1000, 73, 1, 74, 3, 75, 0, 76, 0, 77, 0, 78, 0);
  T(0, 'ENDTAB');
  T(0, 'TABLE', 2, 'LTYPE', 5, '2', 330, '0', 100, 'AcDbSymbolTable', 70, lts.length);
  for (const [nm, desc, pat] of lts) {
    T(0, 'LTYPE', 5, ltH[nm] || (ltH[nm] = H()), 330, '2', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, nm, 70, 0, 3, desc, 72, 65, 73, pat.length,
      40, n3(pat.reduce((a, v) => a + Math.abs(v), 0)));
    for (const v of pat) T(49, n3(v), 74, 0);
  }
  T(0, 'ENDTAB');
  const lyr = [{ name: '0', aci: 7, lw: -3 }, ...M.layers];
  T(0, 'TABLE', 2, 'LAYER', 5, '1', 330, '0', 100, 'AcDbSymbolTable', 70, lyr.length);
  for (const l of lyr) T(0, 'LAYER', 5, H(), 330, '1', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, l.name, 70, 0, 62, OFF_BY_DEFAULT(l.name) ? -Math.abs(l.aci) : l.aci, 6, l.lt || 'Continuous', 370, l.lw == null ? -3 : l.lw, 390, '13');
  T(0, 'ENDTAB');
  T(0, 'TABLE', 2, 'STYLE', 5, '5', 330, '0', 100, 'AcDbSymbolTable', 70, 2);
  T(0, 'STYLE', 5, '29', 330, '5', 100, 'AcDbSymbolTableRecord', 100, 'AcDbTextStyleTableRecord', 2, 'Standard', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, 'arial.ttf', 4, '');
  T(0, 'STYLE', 5, H(), 330, '5', 100, 'AcDbSymbolTableRecord', 100, 'AcDbTextStyleTableRecord', 2, 'UKSA-CJK', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, 'msjh.ttc', 4, '');
  T(0, 'ENDTAB');
  T(0, 'TABLE', 2, 'VIEW', 5, '7', 330, '0', 100, 'AcDbSymbolTable', 70, 0, 0, 'ENDTAB');
  T(0, 'TABLE', 2, 'UCS', 5, '6', 330, '0', 100, 'AcDbSymbolTable', 70, 0, 0, 'ENDTAB');
  T(0, 'TABLE', 2, 'APPID', 5, '3', 330, '0', 100, 'AcDbSymbolTable', 70, 1);
  T(0, 'APPID', 5, '2A', 330, '3', 100, 'AcDbSymbolTableRecord', 100, 'AcDbRegAppTableRecord', 2, 'ACAD', 70, 0, 0, 'ENDTAB');
  T(0, 'TABLE', 2, 'DIMSTYLE', 5, '4', 330, '0', 100, 'AcDbSymbolTable', 70, 1, 100, 'AcDbDimStyleTable');
  T(0, 'DIMSTYLE', 105, '2B', 330, '4', 100, 'AcDbSymbolTableRecord', 100, 'AcDbDimStyleTableRecord', 2, 'Standard', 70, 0, 3, '', 4, '', 40, '1.0', 41, '2.5', 42, '0.625', 43, '3.75', 44, '1.25',
    45, '0.0', 46, '0.0', 47, '0.0', 48, '0.0', 140, '2.5', 141, '2.5', 142, '0.0', 143, '0.03937007874', 144, '1.0', 145, '0.0', 146, '1.0', 147, '0.625', 148, '0.0',
    71, 0, 72, 0, 73, 0, 74, 0, 75, 0, 76, 0, 77, 1, 78, 8, 79, 3, 170, 0, 171, 3, 172, 1, 173, 0, 174, 0, 175, 0, 176, 0, 177, 0, 178, 0, 179, 2,
    271, 2, 272, 2, 273, 2, 274, 3, 275, 0, 276, 0, 277, 2, 278, 44, 279, 0, 280, 0, 281, 0, 282, 0, 283, 0, 284, 8, 285, 0, 286, 0, 288, 0, 289, 3, 371, -2, 372, -2);
  T(0, 'ENDTAB');
  T(0, 'TABLE', 2, 'BLOCK_RECORD', 5, '9', 330, '0', 100, 'AcDbSymbolTable', 70, 2);
  T(0, 'BLOCK_RECORD', 5, MS, 330, '9', 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, '*Model_Space', 340, '1A');
  T(0, 'BLOCK_RECORD', 5, PS, 330, '9', 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, '*Paper_Space', 340, '1E');
  T(0, 'ENDTAB', 0, 'ENDSEC');

  // header (written last so it knows the extents and the next handle)
  const head = [];
  const hv = (name, ...kv) => { head.push(9, name); for (let i = 0; i < kv.length; i += 2) head.push(kv[i], kv[i + 1]); };
  head.push(0, 'SECTION', 2, 'HEADER');
  hv('$ACADVER', 1, 'AC1015'); hv('$ACADMAINTVER', 70, 6); hv('$DWGCODEPAGE', 3, 'ANSI_1252');
  hv('$INSBASE', 10, '0.0', 20, '0.0', 30, '0.0');
  hv('$EXTMIN', 10, n3(ext[0]), 20, n3(ext[1]), 30, n3(ext[2])); hv('$EXTMAX', 10, n3(ext[3]), 20, n3(ext[4]), 30, n3(ext[5]));
  hv('$LIMMIN', 10, n3(ext[0]), 20, n3(ext[1])); hv('$LIMMAX', 10, n3(ext[3]), 20, n3(ext[4]));
  hv('$LTSCALE', 40, '1.0'); hv('$TEXTSIZE', 40, n3(M.S / 300)); hv('$TEXTSTYLE', 7, 'Standard'); hv('$CLAYER', 8, '0');
  hv('$CELTYPE', 6, 'ByLayer'); hv('$LUNITS', 70, 2); hv('$LUPREC', 70, 3); hv('$AUNITS', 70, 0); hv('$AUPREC', 70, 2);
  hv('$PDMODE', 70, 3); hv('$PDSIZE', 40, n3(M.S / 400)); hv('$MEASUREMENT', 70, 1); hv('$INSUNITS', 70, 6); hv('$LWDISPLAY', 290, 1);
  hv('$HANDSEED', 5, (hnd + 16).toString(16).toUpperCase());
  head.push(0, 'ENDSEC');

  const classes = [0, 'SECTION', 2, 'CLASSES',
    0, 'CLASS', 1, 'ACDBDICTIONARYWDFLT', 2, 'AcDbDictionaryWithDefault', 3, 'ObjectDBX Classes', 90, 0, 280, 0, 281, 0,
    0, 'CLASS', 1, 'ACDBPLACEHOLDER', 2, 'AcDbPlaceHolder', 3, 'ObjectDBX Classes', 90, 0, 280, 0, 281, 0,
    0, 'CLASS', 1, 'LAYOUT', 2, 'AcDbLayout', 3, 'ObjectDBX Classes', 90, 0, 280, 0, 281, 0, 0, 'ENDSEC'];
  const blocks = [0, 'SECTION', 2, 'BLOCKS',
    0, 'BLOCK', 5, '18', 330, MS, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockBegin', 2, '*Model_Space', 70, 0, 10, '0.0', 20, '0.0', 30, '0.0', 3, '*Model_Space', 1, '',
    0, 'ENDBLK', 5, '19', 330, MS, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockEnd',
    0, 'BLOCK', 5, '1C', 330, PS, 100, 'AcDbEntity', 67, 1, 8, '0', 100, 'AcDbBlockBegin', 2, '*Paper_Space', 70, 0, 10, '0.0', 20, '0.0', 30, '0.0', 3, '*Paper_Space', 1, '',
    0, 'ENDBLK', 5, '1D', 330, PS, 100, 'AcDbEntity', 67, 1, 8, '0', 100, 'AcDbBlockEnd', 0, 'ENDSEC'];
  const layout = (h, name, flag, tab, br) => [0, 'LAYOUT', 5, h, 330, 'D', 100, 'AcDbPlotSettings', 1, '', 4, 'A3', 6, '', 40, '7.5', 41, '20.0', 42, '7.5', 43, '20.0', 44, '420.0', 45, '297.0',
    46, '0.0', 47, '0.0', 48, '0.0', 49, '0.0', 140, '0.0', 141, '0.0', 142, '1.0', 143, '1.0', 70, flag, 72, 1, 73, 0, 74, 5, 7, '', 75, 16, 76, 0, 77, 2, 78, 300, 147, '1.0', 148, '0.0', 149, '0.0',
    100, 'AcDbLayout', 1, name, 70, 1, 71, tab, 10, '0.0', 20, '0.0', 11, '420.0', 21, '297.0', 12, '0.0', 22, '0.0', 32, '0.0',
    14, n3(ext[0]), 24, n3(ext[1]), 34, n3(ext[2]), 15, n3(ext[3]), 25, n3(ext[4]), 35, n3(ext[5]), 146, '0.0', 13, '0.0', 23, '0.0', 33, '0.0',
    16, '1.0', 26, '0.0', 36, '0.0', 17, '0.0', 27, '1.0', 37, '0.0', 76, 1, 330, br];
  const objects = [0, 'SECTION', 2, 'OBJECTS',
    0, 'DICTIONARY', 5, 'A', 330, '0', 100, 'AcDbDictionary', 281, 1, 3, 'ACAD_GROUP', 350, 'C', 3, 'ACAD_LAYOUT', 350, 'D', 3, 'ACAD_MLINESTYLE', 350, '10',
    3, 'ACAD_PLOTSETTINGS', 350, '11', 3, 'ACAD_PLOTSTYLENAME', 350, '12',
    0, 'DICTIONARY', 5, 'C', 330, 'A', 100, 'AcDbDictionary', 281, 1,
    0, 'DICTIONARY', 5, 'D', 330, 'A', 100, 'AcDbDictionary', 281, 1, 3, 'Model', 350, '1A', 3, 'Layout1', 350, '1E',
    0, 'DICTIONARY', 5, '10', 330, 'A', 100, 'AcDbDictionary', 281, 1, 3, 'Standard', 350, '22',
    0, 'DICTIONARY', 5, '11', 330, 'A', 100, 'AcDbDictionary', 281, 1,
    0, 'ACDBDICTIONARYWDFLT', 5, '12', 330, 'A', 100, 'AcDbDictionary', 281, 1, 3, 'Normal', 350, '13', 100, 'AcDbDictionaryWithDefault', 340, '13',
    0, 'ACDBPLACEHOLDER', 5, '13', 330, '12',
    ...layout('1A', 'Model', 1024, 0, MS), ...layout('1E', 'Layout1', 0, 1, PS),
    0, 'MLINESTYLE', 5, '22', 102, '{ACAD_REACTORS', 330, '10', 102, '}', 330, '10', 100, 'AcDbMlineStyle', 2, 'Standard', 70, 0, 3, '', 62, 256, 51, '90.0', 52, '90.0', 71, 2,
    49, '0.5', 62, 256, 6, 'BYLAYER', 49, '-0.5', 62, 256, 6, 'BYLAYER',
    0, 'ENDSEC'];
  const all = [...head, ...classes, ...tables, ...blocks, 0, 'SECTION', 2, 'ENTITIES', ...ents, 0, 'ENDSEC', ...objects, 0, 'EOF'];
  const out = new Array(all.length);
  for (let i = 0; i < all.length; i += 2) { out[i] = String(all[i]).padStart(3, ' '); out[i + 1] = String(all[i + 1]); }
  return out.join('\r\n') + '\r\n';
}

// ---------- SVG writer ----------
const xe = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = (v) => (Math.round(v * 100) / 100).toString();
function wrap(s, maxW, h) {                              // rough line breaking for SVG text (Latin ~0.52 h, CJK ~1 h per character)
  const out = [];
  for (const para of String(s).split('\n')) {
    let cur = '', w = 0;
    const toks = para.match(/[⺀-￿]|[^\s⺀-￿]+|\s+/g) || [];
    for (const t of toks) {
      const tw = /[⺀-￿]/.test(t) ? h : /^\s+$/.test(t) ? 0.28 * h : t.length * 0.52 * h;
      if (w + tw > maxW && cur.trim()) { out.push(cur.trim()); cur = ''; w = 0; if (/^\s+$/.test(t)) continue; }
      cur += t; w += tw;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}
export function toSVG(res, opts = {}) {
  const M = model(res, opts), f = M.f, S = M.S;
  const U = M.U, pad = S * 0.04, x0 = U[0] - pad, x1 = U[2] + pad, yTop = U[3] + pad, yBot = U[1] - S * 0.45;
  const W = x1 - x0, Hh = yTop - yBot;
  const o = [];
  o.push('<?xml version="1.0" encoding="UTF-8"?>');
  o.push(`<!-- UK Site Analysis: 2D layers in British National Grid (EPSG:27700), metres. Each layer group has transform="matrix(1 0 0 -1 0 0)", so every x,y in the file is Easting, Northing.`);
  o.push(`     Scale 1:1000: 1 m = 1 mm, width ${n2(W)} mm x height ${n2(Hh)} mm. Stroke widths are paper mm. ${xe(DISC_EN)} -->`);
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" version="1.1" width="${n2(W)}mm" height="${n2(Hh)}mm" viewBox="${n2(x0)} ${n2(-yTop)} ${n2(W)} ${n2(Hh)}">`);
  o.push(`<title>UK Site Analysis${opts.name ? ': ' + xe(opts.name) : ''} (British National Grid, 1:1000)</title>`);
  o.push(`<sodipodi:namedview inkscape:document-units="mm"/>`);
  o.push(`<rect x="${n2(x0)}" y="${n2(-yTop)}" width="${n2(W)}" height="${n2(Hh)}" fill="#ffffff"/>`);
  const font = `font-family="Arial, 'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', sans-serif"`;
  for (const l of M.layers) {
    const sv = l.svg || {}, stroke = sv.s || '#333333', sw = sv.w != null ? sv.w : (l.lw > 0 ? l.lw / 100 : 0.18);
    const fillAttr = sv.f && sv.op != null ? `fill="${sv.f}" fill-opacity="${sv.op}"` : sv.f && /BLDG$|SPOT|MTR|PARK|NORTH/.test(l.name) ? `fill="${sv.f}"` : 'fill="none"';
    const dash = sv.dash ? ` stroke-dasharray="${sv.dash}"` : '';
    o.push(`<g id="${xe(l.name)}" inkscape:groupmode="layer" inkscape:label="${xe(l.name)}"${OFF_BY_DEFAULT(l.name) ? ' style="display:none"' : ''} transform="matrix(1 0 0 -1 0 0)" stroke="${stroke}" stroke-width="${n2(sw)}" stroke-linejoin="round" stroke-linecap="round"${dash}>`);
    const paths = [], texts = [];
    for (const it of l.items) {
      if (it.t === 'pl') paths.push('M' + it.pts.map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L') + (it.closed ? 'Z' : ''));
      else if (it.t === 'circle') o.push(`<circle cx="${n2(it.x)}" cy="${n2(it.y)}" r="${n2(it.r)}" fill="${it.ring ? 'none' : '#ffffff'}"${it.ring ? ' stroke-dasharray="0.8 0.8"' : ''}/>`);
      else if (it.t === 'point') { /* the marker drawn beside it carries the point in SVG */ }
      else if (it.t === 'text') {
        const anc = it.al === 'c' ? 'middle' : it.al === 'r' ? 'end' : 'start';
        texts.push(`<text transform="matrix(1 0 0 -1 ${n2(it.x)} ${n2(it.y)})" font-size="${n2(it.h)}" text-anchor="${anc}"${it.mid ? ' dominant-baseline="central"' : ''}>${xe(it.s)}</text>`);
      } else if (it.t === 'mtext') {
        const lines = wrap(it.s, it.w, it.h);
        texts.push(`<text transform="matrix(1 0 0 -1 ${n2(it.x)} ${n2(it.y)})" font-size="${n2(it.h)}">` + lines.map((s, i) => `<tspan x="0" y="${n2((i + 1) * it.h * 1.45)}">${xe(s)}</tspan>`).join('') + '</text>');
      }
    }
    // one path per layer keeps the file small; shadows use non-zero fill so the swept outlines read as one shadow
    if (paths.length) {
      const chunk = 400;
      for (let i = 0; i < paths.length; i += chunk) o.push(`<path d="${paths.slice(i, i + chunk).join('')}" ${fillAttr}${sv.rule ? ` fill-rule="${sv.rule}"` : ''}/>`);
    }
    if (texts.length) o.push(`<g stroke="none" fill="${sv.f || stroke}" ${font}>` + texts.join('') + '</g>');
    o.push('</g>');
  }
  o.push('</svg>');
  return o.join('\n') + '\n';
}

// for tests: the layer list and item counts without writing a file
export function summary(res, opts = {}) {
  const M = model(res, opts);
  return { layers: M.layers.map((l) => ({ name: l.name, n: l.items.length })), shadowLoops: M.stats.shadowLoops, shadowRaw: M.stats.shadowRaw || 0 };
}
