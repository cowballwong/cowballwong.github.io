// HK Swept Path · planner worker (module). Plans every bay: in-path (entrance -> bay) and out-path (bay -> exit).
// Method:
//  * World: the obstacle grid (0.1 m) + every other bay occupied by a parked vehicle of the tested type (toggle).
//  * Collision: disc cover of each body rectangle on a Euclidean distance field; free when dist >= r + buffer.
//  * Search: Hybrid A* over (x, y, heading, steer level, direction [, trailer angle]) with arcs at 5 steer levels,
//    a steering-rate limit between arcs (any steer when stopped at a gear change), forward and reverse.
//    The in-path is searched backward in time from the exact parked pose to the entrance gate (the car may pass
//    anywhere across the gate), so the bay pose is exact without an analytic end shot.
//  * Guide (heuristic): the larger of an obstacle-aware holonomic distance (per bay) and a heading-aware "route map"
//    (forward-only Dijkstra over x, y, heading with the vehicle's own arcs, once per run per gate), so loops and
//    U-turns round an island are followed instead of flooded. See routeMaps().
//  * Limits are node counts only (no wall-clock caps), so a grade never depends on the device's speed. A bay that fails
//    because a search hit its node limit is reported as "no path found within the search limit", not "cannot get in".
//  * Grading (APP-111 App. A (v), our reading): green = one distinct manoeuvre (at most one gear change) with no
//    reversal of the steering lock on the final move, full buffer; amber = more gear changes (<= 5) or only with
//    the reduced buffer; red = no path. Red bays get the template manoeuvre with its clashes painted.
import { makeVehicle, step, bodies, coverFor, ang, rectPoly } from './vehicles.js';
import { edt, fillPoly, contours, simplify } from './raster.js';

let BASE = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'grid') { BASE = m.grid; return; }
  if (m.type === 'run') { try { run(m); } catch (err) { self.postMessage({ type: 'error', msg: String(err && err.stack || err) }); } }
  if (m.type === 'selftest') self.postMessage({ type: 'selftest', out: selfTest(m) });
};

let DBG = [], LIMIT = false, GLIM = false, ROUTE = null;
let V, COVER, CELL, GW, GH, D, G, HC = 0.2, HW, HH;
const NSTEER = 5;

function setup(vp) {
  V = makeVehicle(vp, vp);
  COVER = coverFor(V);
}

function bayPoses(bay, v) {
  const ax = bay.ax, B = [bay.c[0] + ax[0] * bay.L / 2, bay.c[1] + ax[1] * bay.L / 2];
  const len = v.total, m = Math.max(0, Math.min(0.2, (bay.L - len) / 2));
  const thOut = Math.atan2(-ax[1], -ax[0]), thIn = Math.atan2(ax[1], ax[0]);
  const at = (d) => [B[0] - ax[0] * d, B[1] - ax[1] * d];
  const rev = v.artic ? [...at(m + v.A3 + v.VB - v.KP), thOut, thOut] : [...at(m + v.ROH), thOut];
  const fwd = v.artic ? [...at(m + v.WB + v.FOH), thIn, thIn] : [...at(m + v.WB + v.FOH), thIn];
  return { rev, fwd };
}
let NEARM = null;
function nearPoly(bay) {
  const ax = bay.ax, n = [-ax[1], ax[0]], hl = bay.L / 2 + 0.5, hw = bay.W / 2 + 0.8, c = bay.c;
  const P = (a, b) => [c[0] + ax[0] * a + n[0] * b, c[1] + ax[1] * a + n[1] * b];
  return [P(-bay.L / 2, -hw), P(hl, -hw), P(hl, hw), P(-bay.L / 2, hw)];
}
function parkedPolys(bay, v) {
  const p = bayPoses(bay, v).rev;
  return bodies(v, p).map((b) => rectPoly(b, 0));
}

// Buffer rule. The full buffer applies to everything except the structure and parked vehicles right beside the
// target bay (within 0.8 m of its long sides, over its depth: "NEAR"), where the vehicle must clear by 100 mm.
// Why: an HKPSG 2.5 m bay leaves ~375 mm each side of a centred design car, and TPDM lets columns stand 500 mm
// behind the aisle line, so a 300 mm buffer there would fail every compliant layout. Two distance fields per bay.
let DN = null; const NEAR_BUF = 0.1;
function freeAt(s, buf) {
  const bn = Math.min(buf, NEAR_BUF);
  const bs = bodies(V, s);
  for (let b = 0; b < bs.length; b++) {
    const r = bs[b], c = Math.cos(r.th), sn = Math.sin(r.th), cov = COVER[b], cx = r.c[0], cy = r.c[1];
    for (let i = 0; i < cov.length; i++) {
      const q = cov[i], x = cx + c * q[0] - sn * q[1], y = cy + sn * q[0] + c * q[1];
      const ix = (x / CELL) | 0, iy = (y / CELL) | 0;
      if (x < 0 || y < 0 || ix >= GW || iy >= GH) return false;
      const k = iy * GW + ix;
      if (D[k] < q[2] + buf || DN[k] < q[2] + bn) return false;
    }
  }
  return true;
}
function clearance(s, near = false) {
  const bs = bodies(V, s); let mn = Infinity;
  for (let b = 0; b < bs.length; b++) {
    const r = bs[b], c = Math.cos(r.th), sn = Math.sin(r.th), cov = COVER[b];
    for (const q of cov) {
      const x = r.c[0] + c * q[0] - sn * q[1], y = r.c[1] + sn * q[0] + c * q[1];
      const ix = (x / CELL) | 0, iy = (y / CELL) | 0;
      const d = (ix < 0 || iy < 0 || ix >= GW || iy >= GH) ? -1 : (near ? DN : D)[iy * GW + ix] - q[2];
      if (d < mn) mn = d;
    }
  }
  return mn;
}

// Holonomic distance-to-gate map on a 0.2 m grid (cells where the body half width does not fit are blocked).
function gateMap(gates) {
  HW = Math.ceil(GW * CELL / HC); HH = Math.ceil(GH * CELL / HC);
  const H = new Float64Array(HW * HH).fill(Infinity), need = V.W / 2 * 0.9;
  const blocked = new Uint8Array(HW * HH);
  for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
    const ix = Math.min(GW - 1, ((x + 0.5) * HC / CELL) | 0), iy = Math.min(GH - 1, ((y + 0.5) * HC / CELL) | 0);
    blocked[y * HW + x] = Math.min(D[iy * GW + ix], DN[iy * GW + ix]) < need ? 1 : 0;
  }
  const heap = new Heap();
  for (const gate of (Array.isArray(gates) ? gates : [gates])) {
    const g = [Math.cos(gate.th), Math.sin(gate.th)], n = [-g[1], g[0]], al = gate.alongTol || 1.0;
    for (let t = -gate.w / 2; t <= gate.w / 2; t += 0.1) for (let a = -al; a <= al; a += 0.2) {
      const x = gate.x + n[0] * t + g[0] * a, y = gate.y + n[1] * t + g[1] * a;
      const cx = (x / HC) | 0, cy = (y / HC) | 0;
      if (cx < 0 || cy < 0 || cx >= HW || cy >= HH) continue;
      const i = cy * HW + cx; if (H[i] > 0) { H[i] = 0; heap.push(i, 0); }
    }
  }
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  while (heap.size) {
    const [i, d] = heap.pop(); if (d > H[i] + 1e-4) continue;
    const x = i % HW, y = (i / HW) | 0;
    for (const [dx, dy, c] of nb) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= HW || ny >= HH) continue;
      const j = ny * HW + nx; if (blocked[j]) continue;
      const nd = d + c * HC; if (nd < H[j]) { H[j] = nd; heap.push(j, nd); }
    }
  }
  return H;
}
function hAt(H, x, y) {
  const cx = (x / HC) | 0, cy = (y / HC) | 0;
  if (cx < 0 || cy < 0 || cx >= HW || cy >= HH) return Infinity;
  return H[cy * HW + cx];
}

// Heading-aware cost-to-go from a gate ("route map"), built once per run per gate with every bay occupied.
// Why: the holonomic map above ignores heading and turning radius. On a one-way loop it sends the search into gaps a car
// cannot turn through (or hugging an island's end column), and the search floods those before it ever tries the real
// route round the loop, so it runs out of nodes. The route map is a coarse Dijkstra over (x, y, heading, direction of
// travel) that drives the vehicle's own arcs (5 steer levels up to full lock) from the gate across the car park at the
// full buffer to structure and every parked vehicle. Reverse metres count double; the first gear change costs 3 m (as in
// the search: the normal reverse into or out of a bay) and every further one 60 m, because green allows one gear change
// and amber two: a route that needs a string of shunts (a narrow gap) must not look cheaper than driving round the loop. Poses it cannot reach (inside the target bay, which is occupied in the map) get the fallback
// "HB": the map's cheapest value at nearby positions, spread through space clear of structure, at 10x per metre through
// parked vehicles (so a bay never inherits the value of the aisle behind the back-to-back row), plus 2 m.
// Cells 0.5 m, 36 headings, 0.75-1.0 m arcs. sgn = +1: real cost entrance -> pose (in-path); -1: pose -> exit (out-path).
const LC = 0.5, LNH = 36, LCUSP1 = 3.0, LCUSP2 = 60.0;
let LD = null, LDS = null, LBUF = 0.3, LX0 = 0, LY0 = 0, LW = 0, LH = 0;
function latticeFree(s) {
  const bs = bodies(V, s);
  for (let b = 0; b < bs.length; b++) {
    const r = bs[b], c = Math.cos(r.th), sn = Math.sin(r.th), cov = COVER[b];
    for (let i = 0; i < cov.length; i++) {
      const q = cov[i], x = r.c[0] + c * q[0] - sn * q[1], y = r.c[1] + sn * q[0] + c * q[1];
      const ix = (x / CELL) | 0, iy = (y / CELL) | 0;
      if (x < 0 || y < 0 || ix >= GW || iy >= GH) return false;
      if (LD[iy * GW + ix] < q[2] + LBUF) return false;
    }
  }
  return true;
}
function latticeMap(gate, sgn) {
  // state index = (cell * LNH + heading) * 4 + d * 2 + c: d = 1 forward / 0 reverse (the real move that joins this pose to
  // the gate side), c = 1 once a gear change has been used
  const n = LW * LH * LNH * 4, C = new Float64Array(n).fill(Infinity), PX = new Float32Array(n), PY = new Float32Array(n), PT = new Float32Array(n);
  const TAU = Math.PI * 2, cellOf = (x, y, th) => {
    const ix = Math.floor((x - LX0) / LC), iy = Math.floor((y - LY0) / LC); if (ix < 0 || iy < 0 || ix >= LW || iy >= LH) return -1;
    return (iy * LW + ix) * LNH + ((((th % TAU) + TAU) % TAU) / TAU * LNH | 0) % LNH;
  };
  const heap = new Heap(), g = [Math.cos(gate.th), Math.sin(gate.th)], nv = [-g[1], g[0]], al = gate.alongTol || 1.0;
  for (let t = -gate.w / 2; t <= gate.w / 2 + 1e-9; t += 0.25) for (let a = -al; a <= al + 1e-9; a += 0.5) {
    const s = [gate.x + nv[0] * t + g[0] * a, gate.y + nv[1] * t + g[1] * a, gate.th];
    const c = cellOf(s[0], s[1], s[2]); if (c < 0) continue; const k = c * 4 + 2;
    if (C[k] === 0 || !latticeFree(s)) continue;
    C[k] = 0; PX[k] = s[0]; PY[k] = s[1]; PT[k] = s[2]; heap.push(k, 0);
  }
  const Lp = Math.max(0.75, Math.min(1.0, 0.25 * V.Rmin)), levels = [-1, -0.5, 0, 0.5, 1].map((f) => f * V.kmax);
  while (heap.size) {
    const [k, d] = heap.pop(); if (d > C[k] + 1e-6) continue;
    const s = [PX[k], PY[k], PT[k]], dk = (k >> 1) & 1, ck = k & 1;
    for (const nd of [1, 0]) {
      const cusp = nd !== dk, nc = cusp ? 1 : ck;
      const ds = sgn * (nd ? 1 : -1) * Lp, cost = d + Lp * (nd ? 1 : 2) + (cusp ? (ck ? LCUSP2 : LCUSP1) : 0);
      for (const kk of levels) {
        const q1 = step(V, s, kk, ds / 3), q2 = step(V, q1, kk, ds / 3), p = step(V, q2, kk, ds / 3);
        const c = cellOf(p[0], p[1], p[2]); if (c < 0) continue; const j = c * 4 + nd * 2 + nc;
        if (cost >= C[j]) continue;
        if (!latticeFree(q1) || !latticeFree(q2) || !latticeFree(p)) continue;
        C[j] = cost; PX[j] = p[0]; PY[j] = p[1]; PT[j] = p[2]; heap.push(j, cost);
      }
    }
  }
  // per pose (either direction) and the fallback HB
  // CP: any route; CF: forward only with no gear change (what a green path does away from the bay itself)
  const CP = new Float64Array(LW * LH * LNH), CF = new Float64Array(LW * LH * LNH);
  for (let i = 0; i < CP.length; i++) { CP[i] = Math.min(C[4 * i], C[4 * i + 1], C[4 * i + 2], C[4 * i + 3]); CF[i] = C[4 * i + 2]; }
  const HB = new Float64Array(LW * LH).fill(Infinity), hp = new Heap();
  for (let c = 0; c < LW * LH; c++) { let m = Infinity; for (let h = 0; h < LNH; h++) if (CP[c * LNH + h] < m) m = CP[c * LNH + h]; if (m < Infinity) { HB[c] = m; hp.push(c, m); } }
  const need = V.W / 2 * 0.9, wgt = new Float32Array(LW * LH);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const ix = ((LX0 + (x + 0.5) * LC) / CELL) | 0, iy = ((LY0 + (y + 0.5) * LC) / CELL) | 0, i = iy * GW + ix;
    const ok = ix >= 0 && iy >= 0 && ix < GW && iy < GH && LDS[i] >= need;
    wgt[y * LW + x] = !ok ? 0 : LD[i] <= 0 ? 10 : 1;
  }
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  while (hp.size) {
    const [i, d] = hp.pop(); if (d > HB[i] + 1e-6) continue;
    const x = i % LW, y = (i / LW) | 0;
    for (const [dx, dy, c] of nb) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= LW || ny >= LH) continue;
      const j = ny * LW + nx; if (!wgt[j]) continue;
      const nd = d + c * LC * wgt[j]; if (nd < HB[j]) { HB[j] = nd; hp.push(j, nd); }
    }
  }
  return { C: CP, HB, green: { C: CF, alt: CP, HB } };
}
function hLat(L, x, y, th) {
  if (!L) return Infinity;
  const ix = Math.floor((x - LX0) / LC), iy = Math.floor((y - LY0) / LC); if (ix < 0 || iy < 0 || ix >= LW || iy >= LH) return Infinity;
  const TAU = Math.PI * 2, f = (((th % TAU) + TAU) % TAU) / TAU * LNH, c = iy * LW + ix, o = c * LNH, b = (f | 0) % LNH;
  // nearest heading bin, else its neighbours (the map is coarse); green: the forward-only value first, then any route; else HB
  for (const C of L.alt ? [L.C, L.alt] : [L.C]) {
    const v = C[o + b]; if (v < Infinity) return v;
    const w = Math.min(C[o + (b + 1) % LNH], C[o + (b + LNH - 1) % LNH]); if (w < Infinity) return w + LC;
  }
  return L.HB[c] + 2;
}
function routeMaps(set, bays, parked, entry, exit) {
  if (V.artic) return null;
  // domain: every bay and both gates, plus 8 m
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const b of bays) ext(b.c[0], b.c[1]);
  for (const q of [entry, exit]) ext(q.x, q.y);
  x0 = Math.max(0, x0 - 8); y0 = Math.max(0, y0 - 8); x1 = Math.min(GW * CELL, x1 + 8); y1 = Math.min(GH * CELL, y1 + 8);
  LX0 = x0; LY0 = y0; LW = Math.ceil((x1 - x0) / LC); LH = Math.ceil((y1 - y0) / LC);
  const t0 = performance.now(), Ga = new Uint8Array(BASE.data);
  if (!set.empty) for (const ps of parked) for (const p of ps) fillPoly({ w: GW, h: GH, cell: CELL, data: Ga }, p, 1);
  LD = edt(Ga, GW, GH); LDS = edt(BASE.data, GW, GH);
  for (let i = 0; i < LD.length; i++) { LD[i] = LD[i] * CELL - CELL / 2; LDS[i] = LDS[i] * CELL - CELL / 2; }
  // the map steers instantly and samples three poses per arc, so it is kept 150 mm more cautious than the search:
  // marginal squeezes drop out of it and do not lure the search; routes with real room stay
  LBUF = set.buffer + 0.15;
  const Lin = latticeMap(entry, 1), Lout = latticeMap(exit, -1);
  LD = null; LDS = null;
  return { Lin, Lout, ms: performance.now() - t0 };
}

function inGate(s, gate) {
  const g = [Math.cos(gate.th), Math.sin(gate.th)], dx = s[0] - gate.x, dy = s[1] - gate.y;
  const along = dx * g[0] + dy * g[1], lat = -dx * g[1] + dy * g[0];
  if (Math.abs(along) > (gate.alongTol || 1.0)) return false;
  if (Math.abs(lat) > (gate.latTol || Math.max(0.3, gate.w / 2 - V.W / 2))) return false;
  if (Math.abs(ang(s[2] - gate.th)) > (gate.hTol || 0.35)) return false;
  if (V.artic && Math.abs(ang(s[2] - s[3]) - (gate.art || 0)) > (gate.tTol || 0.26)) return false;
  return true;
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(id, pr) {
    const k = this.k, v = this.v; let i = k.length; k.push(id); v.push(pr);
    while (i > 0) { const p = (i - 1) >> 1; if (v[p] <= pr) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = id; v[i] = pr;
  }
  pop() {
    const k = this.k, v = this.v, top = [k[0], v[0]], lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && v[c + 1] < v[c]) c++; if (v[c] >= lv) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

// Hybrid A*. dirSign: real direction = dirSign * search direction (-1 for the time-reversed in-path).
function search(start, dirSign, goals, H, opt) {
  if (!Array.isArray(goals)) goals = [goals];
  const t0 = performance.now(), prim = V.prim, sub = V.artic ? 0.1 : 0.1;
  const kStep = Math.max(1, Math.round(4 * prim / V.lockDist));
  const levels = [-1, -0.5, 0, 0.5, 1].map((f) => f * V.kmax);
  const maxRev = Math.max(11, 2 * V.total + 4);
  const cap = opt.nodeCap;
  const N = { s: [], st: new Int8Array(cap + 64), dir: new Int8Array(cap + 64), g: new Float64Array(cap + 64),
    cu: new Int8Array(cap + 64), sg: new Int8Array(cap + 64), rv: new Float32Array(cap + 64), par: new Int32Array(cap + 64) };
  let n = 0;
  const add = (s, st, dir, g, cu, rv, par, sg = 0) => { N.s[n] = s; N.st[n] = st; N.dir[n] = dir; N.g[n] = g; N.cu[n] = cu; N.rv[n] = rv; N.par[n] = par; N.sg[n] = sg; return n++; };
  // the parked pose is set by the bay: it must not overlap anything; every move away from it is checked with the buffers
  if (!freeAt(start, opt.startBuf || 0)) return { found: false, why: 'start' };
  const h0 = hAt(H, start[0], start[1]); if (!Number.isFinite(h0)) return { found: false, why: 'unreachable' };
  const open = new Heap(), closed = new Map(), wH = opt.wH || 1.6, RL = opt.L;
  // guide = the larger of the holonomic distance and the heading-aware route map (where the route map knows the pose)
  const hOf = (p, h2) => { const hl = hLat(RL, p[0], p[1], p[2]); return Number.isFinite(hl) && hl > h2 ? hl : h2; };
  open.push(add(start, 2, 0, 0, 0, 0, -1), wH * hOf(start, h0));
  const hbin = 72, TAU = Math.PI * 2;
  const keyOf = (s, st, dir) => {
    const ix = (s[0] / HC) | 0, iy = (s[1] / HC) | 0, it = (((s[2] % TAU) + TAU) % TAU) / TAU * hbin | 0;
    let k = (((ix * HH + iy) * hbin + it) * NSTEER + st) * 2 + (dir > 0 ? 1 : 0);
    if (V.artic) k = k * 40 + (((ang(s[2] - s[3]) + Math.PI / 2) / Math.PI * 40) | 0);
    return k;
  };
  let exp = 0;
  while (open.size) {
    if (n >= cap) return { found: false, why: 'budget', nodes: n };
    const [id] = open.pop(); exp++;
    const s = N.s[id], st = N.st[id], dir = N.dir[id], g = N.g[id], cu = N.cu[id];
    // analytic shot: one arc then a straight onto the gate line, real direction forward
    const hs = hAt(H, s[0], s[1]);
    if (hs < 30 && (exp % 4 === 0 || hs < 8)) {
      const sd = dirSign, cusp = dir !== 0 && sd !== dir;
      if (cu + (cusp ? 1 : 0) <= opt.maxCusps) {
        const near = goals.length === 1 ? goals : goals.map((q, i) => [Math.hypot(q.x - s[0], q.y - s[1]), i]).sort((a, b) => a[0] - b[0]).slice(0, 4).map((q) => goals[q[1]]);
        for (const gt of near) {
          const sh = shot(s, sd, gt, opt.buf, (cu + (cusp ? 1 : 0)) === 0 && opt.noFlip ? N.sg[id] : 0);
          if (sh) return { found: true, end: id, shot: sh, goal: gt, N, nodes: n, ms: performance.now() - t0 };
        }
      }
    }
    for (const sd of [1, -1]) {
      const cusp = dir !== 0 && sd !== dir;
      const ncu = cu + (cusp ? 1 : 0); if (ncu > opt.maxCusps) continue;
      const real = dirSign * sd;
      const prevReal = dir === 0 ? 0 : dirSign * dir;
      const nrv = real < 0 ? (prevReal < 0 ? N.rv[id] : 0) + prim : 0;
      if (nrv > maxRev) continue;
      const lo = (dir === 0 || cusp) ? 0 : Math.max(0, st - kStep), hi = (dir === 0 || cusp) ? NSTEER - 1 : Math.min(NSTEER - 1, st + kStep);
      for (let ns = lo; ns <= hi; ns++) {
        const k = levels[ns];
        // green tier: no reversal of the steering lock on the final move (search order: before the first gear change)
        let nsg = 0;
        if (ncu === 0) { const sgk = Math.sign(k), psg = N.sg[id]; if (opt.noFlip && sgk && psg && sgk !== psg) continue; nsg = sgk || psg; }
        let p = s, ok = true; const nsub = Math.ceil(prim / sub), ds = sd * prim / nsub;
        for (let i = 0; i < nsub; i++) {
          p = step(V, p, k, ds);
          if (V.artic && Math.abs(ang(p[2] - p[3])) > 1.2) { ok = false; break; }
          if (!freeAt(p, opt.buf)) { ok = false; break; }
        }
        if (!ok) continue;
        const hv = hAt(H, p[0], p[1]); if (!Number.isFinite(hv)) continue;
        const flip = (levels[st] * k < 0 && !cusp && dir !== 0) ? 0.6 : 0;
        const ng = g + prim * (real < 0 ? 2.0 : 1.0) + (cusp ? 3.0 : 0) + 0.15 * Math.abs(ns - st) * (cusp || dir === 0 ? 0 : 1) + flip;
        const key = keyOf(p, ns, sd), old = closed.get(key);
        if (old !== undefined && old <= ng + 1e-6) continue;
        closed.set(key, ng);
        const nid = add(p, ns, sd, ng, ncu, nrv, id, nsg);
        if (real > 0) for (const gt of goals) if (Math.abs(gt.x - p[0]) < 3 && Math.abs(gt.y - p[1]) < 3 || goals.length === 1) { if (inGate(p, gt)) return { found: true, end: nid, goal: gt, N, nodes: n, ms: performance.now() - t0 }; }
        open.push(nid, ng + wH * hOf(p, hv));
        if (n >= cap) break;
      }
    }
  }
  return { found: false, why: 'exhausted', nodes: n };
}

// One arc (|k| = kmax or kmax/2) that turns the heading onto the gate, then a straight that reaches the gate line.
function shot(s, sd, gate, buf, sgReq) {
  const dth = ang(gate.th - s[2]); if (Math.abs(dth) > 1.75) return null;
  const g = [Math.cos(gate.th), Math.sin(gate.th)];
  for (const f of [1, 0.5]) {
    const kap = V.kmax * f; let segs = [], p = s, ok = true;
    if (Math.abs(dth) > 0.005) {
      const L = Math.abs(dth) / kap, k = dth / (sd * L);
      if (sgReq && Math.sign(k) !== sgReq) continue;
      const n = Math.ceil(L / 0.1);
      for (let i = 0; i < n && ok; i++) { p = step(V, p, k, sd * L / n); if (!freeAt(p, buf)) ok = false; }
      if (!ok) continue; segs.push([k, sd * L]);
    }
    const along = (p[0] - gate.x) * g[0] + (p[1] - gate.y) * g[1], ds = -along;
    if (Math.abs(along) > 1 && Math.sign(ds) !== sd) continue;
    if (Math.abs(ds) > 45) continue;
    const n = Math.max(1, Math.ceil(Math.abs(ds) / 0.1));
    for (let i = 0; i < n && ok; i++) { p = step(V, p, 0, ds / n); if (!freeAt(p, buf)) ok = false; }
    if (!ok || !inGate(p, gate)) continue;
    segs.push([0, ds]);
    return segs;
  }
  return null;
}

// Rebuild a found search into samples (real time order), 0.05 m spacing: [x, y, th, th2, k, realDir].
function samplesOf(res, start, dirSign) {
  const { N } = res; const chain = [];
  for (let i = res.end; i > 0; i = N.par[i]) chain.push(i);
  chain.reverse();
  const levels = [-1, -0.5, 0, 0.5, 1].map((f) => f * V.kmax), prim = V.prim;
  const out = []; let p = start;
  const push = (q, k, real) => out.push([q[0], q[1], q[2], V.artic ? q[3] : q[2], k, real]);
  push(p, 0, 0);
  for (const id of chain) {
    const k = levels[N.st[id]], sd = N.dir[id], real = dirSign * sd, n = Math.ceil(prim / 0.05), ds = sd * prim / n;
    for (let i = 0; i < n; i++) { p = step(V, p, k, ds); push(p, k, real); }
  }
  for (const [k, L] of res.shot || []) {
    const n = Math.max(1, Math.ceil(Math.abs(L) / 0.05)), real = dirSign * Math.sign(L);
    for (let i = 0; i < n; i++) { p = step(V, p, k, L / n); push(p, k, real); }
  }
  if (dirSign < 0) { out.reverse(); for (let i = out.length - 1; i > 0; i--) out[i][5] = out[i - 1][5] || out[i][5]; }
  // real direction of the first sample = that of the second
  if (out.length > 1) out[0][5] = out[1][5];
  // in time-reversed order the curvature belongs to the segment ending at the sample; good enough for display
  return out;
}

function analyse(sm) {
  let cusps = 0, len = 0, minClr = Infinity, rev = 0;
  for (let i = 1; i < sm.length; i++) {
    len += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
    if (sm[i][5] && sm[i - 1][5] && sm[i][5] !== sm[i - 1][5]) cusps++;
    if (sm[i][5] < 0) rev += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
  }
  let bayClr = Infinity;
  for (let i = 0; i < sm.length; i += 2) { const c = clearance(sm[i]), cn = clearance(sm[i], true); if (c < minClr) minClr = c; if (cn < bayClr) bayClr = cn; }
  return { cusps, len, minClr, bayClr, rev };
}
// Reversal of the steering lock on the final move into the bay (after the last gear change).
function lockReversal(sm) {
  let i = sm.length - 1; const d = sm[i][5];
  while (i > 0 && sm[i - 1][5] === d) i--;
  let last = 0, flips = 0; const th = 0.4 * V.kmax;
  for (let j = i; j < sm.length; j++) { const k = sm[j][4]; if (Math.abs(k) < th) continue; const sg = Math.sign(k); if (last && sg !== last) flips++; last = sg; }
  return flips > 0;
}

function plan(start, dirSign, gate, H, buf, maxCusps, budget) {
  const r = search(start, dirSign, gate, H, { buf, maxCusps, nodeCap: budget.nodes * (self.__capMult || 1), noFlip: !!budget.noFlip, startBuf: budget.startBuf, L: budget.L });
  if (!r.found && r.why === 'budget') LIMIT = true;
  if (!r.found) return { found: false, why: r.why, nodes: r.nodes };
  const sm = samplesOf(r, start, dirSign), a = analyse(sm);
  return { found: true, sm, ...a, buf, nodes: r.nodes, ms: r.ms, goal: r.goal };
}

function bestIn(poses, gate, H, set) {
  // Green: one manoeuvre at full buffer; then amber: more gear changes; then reduced buffer.
  const tries = [
    { buf: set.buffer, cu: 1, nodes: 25000, lvl: 'g', noFlip: true },
    { buf: set.buffer, cu: 1, nodes: 25000, lvl: 'g', noFlip: true, hol: true },
    { buf: set.buffer, cu: 1, nodes: 25000, lvl: 'g', noFlip: true, fwd: true },
    { buf: set.buffer, cu: 2, nodes: 40000, lvl: 'a' },
    { buf: set.reduced, cu: 2, nodes: 40000, lvl: 'a2' },
    { buf: set.buffer, cu: 5, nodes: 50000, lvl: 'r' },
  ].filter((t) => ROUTE ? true : !t.fwd && !t.hol).map((t) => ({ ...t, L: ROUTE && !t.hol ? (t.fwd ? ROUTE.Lin.green : ROUTE.Lin) : null }));
  for (const t of tries) {
    let best = null;
    for (const [nm, p] of poses) {
      const r = plan(p, -1, gate, H, t.buf, t.cu, t);
      if (!r.found) { if (t.lvl === 'g' && r.why === 'budget') GLIM = true; DBG.push(t.lvl + (t.fwd ? 'f' : t.hol ? 'h' : '') + ':' + nm + ':' + r.why + ':' + (r.nodes || 0)); continue; }
      r.pose = nm; r.lvl = t.lvl; r.lockRev = lockReversal(r.sm);
      const score = r.cusps * 10 + r.len * 0.1 + (r.lockRev ? 20 : 0);
      if (!best || score < best.score) best = { ...r, score };
      if (t.lvl === 'g' && !r.lockRev && r.cusps <= 1 && nm === poses[0][0]) break;
    }
    if (best) return best;
  }
  return null;
}
// Articulated in-path, two stages (searching backward in time makes a trailer unstable on the approach):
// 1. from the parked pose pull the trailer out forward (stable) through a family of arcs; keep collision-free
//    end poses with the trailer nearly straight ("staging" poses). In real time the truck reverses in along these.
// 2. search forward in real time from the entrance to any staging pose, then join the two.
function stagingSet(P, buf) {
  const out = [], seen = new Set();
  for (const s0 of [0, 3, 6, 9, 12]) for (const sg of [1, -1]) for (const f of [1, 0.75, 0.5]) for (const deg of [60, 90, 120]) {
    let p = P, ok = true, turned = 0, dist = 0; const traj = [[...p, 0]], k = sg * f * V.kmax;
    const seq = [[0, s0], [k, deg * Math.PI / 180 / Math.abs(k)], [0, 18]];
    for (let q = 0; q < seq.length && ok; q++) {
      const [kk, L] = seq[q], n = Math.ceil(L / 0.1);
      for (let i = 0; i < n; i++) {
        const np = step(V, p, kk, L / n);
        if (Math.abs(ang(np[2] - np[3])) > 1.2 || !freeAt(np, buf)) { ok = q < 2 ? false : ok; if (q === 2) break; ok = false; break; }
        p = np; dist += L / n; traj.push([...p, kk]);
        if (q === 1) turned += Math.abs(kk * L / n);
        // a staging pose every metre once the truck has turned at least 30 degrees
        if ((q === 2 || turned > 0.5) && (traj.length % 10 === 0)) {
          const key = ((p[0] / 0.5) | 0) + ',' + ((p[1] / 0.5) | 0) + ',' + ((p[2] / 0.1) | 0) + ',' + (((p[2] - p[3]) / 0.1) | 0);
          if (seen.has(key)) continue; seen.add(key);
          out.push({ x: p[0], y: p[1], th: p[2], w: V.W + 1.0, alongTol: 0.5, latTol: 0.4, hTol: 0.1, tTol: 0.15, art: ang(p[2] - p[3]), traj: traj.slice() });
        }
      }
      if (q < 2 && !ok) break;
    }
  }
  return out;
}
// Approach family from the entrance (real forward, stable): straight runs, one arc, or an S-curve, each followed by a
// straight tail. Shared prefixes are simulated once (a tree). Returns pose records and the candidate indices.
function approachTree(st, buf, aMax = 40, tailMax = 24) {
  const P = [st], K = [0], PAR = [-1], cand = [];
  const run = (from, k, L) => {
    let p = P[from], idx = from; const n = Math.max(1, Math.round(L / 0.1)), ds = L / n;
    for (let i = 0; i < n; i++) {
      p = step(V, p, k, ds);
      if (Math.abs(ang(p[2] - p[3])) > 1.2 || !freeAt(p, buf)) return [idx, false];
      P.push(p); K.push(k); PAR.push(idx); idx = P.length - 1;
    }
    return [idx, true];
  };
  const tail = (from) => { let c = from; cand.push(c); for (let d = 0; d < tailMax; d += 0.5) { const [i, ok] = run(c, 0, 0.5); c = i; cand.push(c); if (!ok) break; } };
  let cur = 0; const aNodes = [0];
  for (let a = 0; a < aMax; a += 2) { const [i, ok] = run(cur, 0, 2); cur = i; if (!ok) break; aNodes.push(i); cand.push(i); }
  for (const an of aNodes) for (const ks of [1, -1]) for (const f of [1, 0.6]) {
    const k = ks * f * V.kmax, dphi = (15 * Math.PI / 180) / Math.abs(k);
    let c1 = an;
    for (let phi = 1; phi <= 6; phi++) {
      const [i, ok] = run(c1, k, dphi); if (!ok) break; c1 = i; tail(c1);
      for (const b of [0, 3]) {
        let c2 = c1; if (b) { const [j, ok2] = run(c1, 0, b); if (!ok2) continue; c2 = j; }
        const [j2, ok3] = run(c2, -k, dphi * phi); if (ok3) tail(j2);
      }
    }
  }
  return { P, K, PAR, cand };
}
function bestInArtic(P0, entry, set) {
  let st = [entry.x, entry.y, entry.th, entry.th];
  for (let i = 0; i < 60 && !freeAt(st, 0); i++) st = step(V, st, 0, 0.5);
  for (const t of [{ buf: set.buffer, lvl: 'g' }, { buf: set.reduced, lvl: 'a2' }]) {
    const stg = stagingSet(P0, t.buf);
    if (!stg.length) { DBG.push(t.lvl + ':nostaging'); continue; }
    const hash = new Map(), key = (x, y) => ((x / 0.5) | 0) + ',' + ((y / 0.5) | 0);
    stg.forEach((g, gi) => { const k = key(g.x, g.y); if (!hash.has(k)) hash.set(k, []); hash.get(k).push(gi); });
    const tree = approachTree(st, t.buf);
    let best = null;
    for (const ci of tree.cand) {
      const p = tree.P[ci], cx = (p[0] / 0.5) | 0, cy = (p[1] / 0.5) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const list = hash.get((cx + dx) + ',' + (cy + dy)); if (!list) continue;
        for (const gi of list) {
          const g = stg[gi], dpos = Math.hypot(g.x - p[0], g.y - p[1]);
          if (dpos > 0.5 || Math.abs(ang(g.th - p[2])) > 0.1 || Math.abs(ang(p[2] - p[3]) - g.art) > 0.15) continue;
          let len = 0; for (let q = ci; q > 0; q = tree.PAR[q]) len += 0.1;
          const cost = len + g.traj.length * 0.1 * 2 + dpos * 10;
          if (!best || cost < best.cost) best = { cost, ci, g };
        }
      }
    }
    DBG.push(t.lvl + ':staging' + stg.length + ':approach' + tree.cand.length + (best ? ':match' : ':nomatch'));
    if (!best) continue;
    const chain = []; for (let q = best.ci; q >= 0; q = tree.PAR[q]) chain.push(q); chain.reverse();
    const sm1 = chain.map((q) => { const p = tree.P[q]; return [p[0], p[1], p[2], p[3], tree.K[q], 1]; });
    const tr = best.g.traj.slice().reverse().map((q) => [q[0], q[1], q[2], q[3], q[4], -1]);
    const sm = sm1.concat(tr), a = analyse(sm);
    return { found: true, sm, ...a, buf: t.buf, nodes: tree.P.length, lvl: t.lvl, pose: 'rev', lockRev: lockReversal(sm) };
  }
  return null;
}

// Articulated out-path: forward family from the parked pose to the exit gate (no gear change).
function outArtic(start, gate, set) {
  for (const t of [{ buf: set.buffer, lvl: 'g' }, { buf: set.reduced, lvl: 'a2' }]) {
    const tree = approachTree(start, t.buf, 18, 44);
    let best = null;
    for (const ci of tree.cand) { if (!inGate(tree.P[ci], gate)) continue; let len = 0; for (let q = ci; q > 0; q = tree.PAR[q]) len += 0.1; if (!best || len < best.len) best = { ci, len }; }
    DBG.push('out-tree-' + t.lvl + ':' + (best ? 'ok' : 'none'));
    if (!best) continue;
    const chain = []; for (let q = best.ci; q >= 0; q = tree.PAR[q]) chain.push(q); chain.reverse();
    const sm = chain.map((q) => { const p = tree.P[q]; return [p[0], p[1], p[2], p[3], tree.K[q], 1]; });
    return { found: true, sm, ...analyse(sm), buf: t.buf, nodes: tree.P.length, lvl: t.lvl };
  }
  return null;
}
function bestOut(start, gate, H, set) {
  const tries = [
    { buf: set.buffer, cu: 1, nodes: 25000, lvl: 'g' },
    { buf: set.buffer, cu: 1, nodes: 25000, lvl: 'g', hol: true },
    { buf: set.buffer, cu: 1, nodes: 25000, lvl: 'g', fwd: true },
    { buf: set.buffer, cu: 2, nodes: 40000, lvl: 'a' },
    { buf: set.reduced, cu: 2, nodes: 40000, lvl: 'a2' },
    { buf: set.buffer, cu: 5, nodes: 50000, lvl: 'r' },
  ].filter((t) => ROUTE ? true : !t.fwd && !t.hol).map((t) => ({ ...t, L: ROUTE && !t.hol ? (t.fwd ? ROUTE.Lout.green : ROUTE.Lout) : null }));
  for (const t of tries) { const r = plan(start, 1, gate, H, t.buf, t.cu, t); if (r.found) { r.lvl = t.lvl; return r; } if (t.lvl === 'g' && r.why === 'budget') GLIM = true; DBG.push('out-' + t.lvl + (t.fwd ? 'f' : t.hol ? 'h' : '') + ':' + r.why + ':' + (r.nodes || 0)); }
  return null;
}

// Template manoeuvre (ignores obstacles) for red bays, and the grid cells it clashes with.
function template(poses, gate, buf, bay) {
  const away = [bay.c[0] - gate.x, bay.c[1] - gate.y];
  let best = null;
  for (const [nm, p0] of poses) {
    for (const turn of [1, -1]) for (const s0 of [0, 1.0, 2.0]) {
      const sd = nm === 'rev' ? 1 : -1; // time-reversed: leave the bay along its axis
      const seq = [[0, s0], [turn * V.kmax, V.Rmin * Math.PI / 2], [0, 3]];
      let p = p0; const pts = [[...p, 0]];
      for (const [k, L] of seq) { const n = Math.ceil(L / 0.1); for (let i = 0; i < n; i++) { p = step(V, p, k, sd * L / n); pts.push([...p, k]); } }
      const endH = [Math.cos(p[2]), Math.sin(p[2])];
      // in real time the car arrives travelling away from the entrance (reverse-in) or into the bay (forward-in)
      const realHead = endH; // in real time the car travels along its heading here, away from the entrance
      const good = (realHead[0] * away[0] + realHead[1] * away[1]) > 0 ? 0 : 1;
      const cl = clashCells(pts, buf);
      const score = cl.size + good * 100000;
      if (!best || score < best.score) best = { score, pts, cl, nm };
    }
  }
  const sm = best.pts.slice().reverse().map((q) => [q[0], q[1], q[2], V.artic ? q[3] : q[2], q[q.length - 1], best.nm === 'rev' ? -1 : 1]);
  return { sm, clash: [...best.cl] };
}
function clashCells(pts, buf) {
  const set = new Set();
  for (let i = 0; i < pts.length; i += 1) {
    for (const b of bodies(V, pts[i])) {
      const poly = rectPoly(b, buf);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      const c = Math.cos(b.th), s = Math.sin(b.th);
      for (let iy = Math.max(0, (y0 / CELL) | 0); iy <= Math.min(GH - 1, (y1 / CELL) | 0); iy++)
        for (let ix = Math.max(0, (x0 / CELL) | 0); ix <= Math.min(GW - 1, (x1 / CELL) | 0); ix++) {
          const idx = iy * GW + ix; if (!G[idx]) continue;
          const bb = NEARM[idx] ? Math.min(buf, NEAR_BUF) : buf;
          const dx = (ix + 0.5) * CELL - b.c[0], dy = (iy + 0.5) * CELL - b.c[1];
          const u = dx * c + dy * s, w = -dx * s + dy * c;
          if (u >= b.x0 - bb && u <= b.x1 + bb && Math.abs(w) <= b.hw + bb) set.add(idx);
        }
    }
  }
  return set;
}

// Envelope outlines of a sampled path: body union and clearance (body + buffer) union, 0.05 m raster.
function envelopes(sm, buf) {
  const polysB = [], polysC = [];
  for (let i = 0; i < sm.length; i++) {
    const s = V.artic ? [sm[i][0], sm[i][1], sm[i][2], sm[i][3]] : [sm[i][0], sm[i][1], sm[i][2]];
    for (const b of bodies(V, s)) { polysB.push(rectPoly(b, 0)); polysC.push(rectPoly(b, buf)); }
  }
  const ring = (P) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of P) for (const q of p) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    const c = 0.05, ox = x0 - 2 * c, oy = y0 - 2 * c, w = Math.ceil((x1 - ox) / c) + 3, h = Math.ceil((y1 - oy) / c) + 3;
    const g = { w, h, cell: c, data: new Uint8Array(w * h) };
    for (const p of P) fillPoly(g, p.map((q) => [q[0] - ox, q[1] - oy]), 1);
    let area = 0; for (let i = 0; i < g.data.length; i++) area += g.data[i];
    return { rings: contours(g.data, w, h, c, ox, oy).map((r) => simplify(r, 0.01)), area: area * c * c };
  };
  return { body: ring(polysB), clear: ring(polysC) };
}

function bayFlags(bay, set, structGrid) {
  const f = [];
  const req = set.reqBay;
  if (req && (bay.L < req[0] - 0.005 || bay.W < req[1] - 0.005)) f.push({ k: 'size', L: bay.L, W: bay.W, req });
  // wall along a long side: sample a strip 0.05-0.30 m outside each long side
  const ax = bay.ax, nx = -ax[1], ny = ax[0];
  for (const side of [1, -1]) {
    let hit = 0, tot = 0;
    for (let t = -bay.L / 2 + 0.25; t <= bay.L / 2 - 0.25; t += 0.25) for (const o of [0.1, 0.25]) {
      const x = bay.c[0] + ax[0] * t + nx * side * (bay.W / 2 + o), y = bay.c[1] + ax[1] * t + ny * side * (bay.W / 2 + o);
      const ix = (x / CELL) | 0, iy = (y / CELL) | 0; tot++;
      if (ix < 0 || iy < 0 || ix >= GW || iy >= GH || structGrid[iy * GW + ix]) hit++;
    }
    if (tot && hit / tot > 0.5 && req && bay.W < req[1] + 0.3 - 0.005) { f.push({ k: 'wall', W: bay.W, need: req[1] + 0.3 }); break; }
  }
  return f;
}

function run(m) {
  setup(m.vehicle);
  const set = m.settings, bays = m.bays, entry = m.entry, exit = m.exit || { ...m.entry, th: m.entry.th + Math.PI };
  CELL = BASE.cell; GW = BASE.w; GH = BASE.h;
  const parked = bays.map((b) => parkedPolys(b, V));
  if (!V.artic) self.postMessage({ type: 'phase', what: 'route' });
  ROUTE = routeMaps(set, bays, parked, entry, exit);
  for (const bi of m.order) {
    const t0 = performance.now(), bay = bays[bi];
    G = new Uint8Array(BASE.data);
    if (!set.empty) for (let j = 0; j < bays.length; j++) if (j !== bi) for (const p of parked[j]) fillPoly({ w: GW, h: GH, cell: CELL, data: G }, p, 1);
    // split obstacles into NEAR (beside the target bay) and the rest
    NEARM = new Uint8Array(GW * GH); fillPoly({ w: GW, h: GH, cell: CELL, data: NEARM }, nearPoly(bay), 1);
    const Gf = new Uint8Array(GW * GH), Gn = new Uint8Array(GW * GH);
    for (let i = 0; i < G.length; i++) if (G[i]) { if (NEARM[i]) Gn[i] = 1; else Gf[i] = 1; }
    D = edt(Gf, GW, GH); DN = edt(Gn, GW, GH);
    for (let i = 0; i < D.length; i++) { D[i] = D[i] * CELL - CELL / 2; DN[i] = DN[i] * CELL - CELL / 2; }
    const Hin = gateMap(entry);
    const P = bayPoses(bay, V);
    const order = V.artic ? [['rev', P.rev]] : (bay.angle < 80 ? [['fwd', P.fwd], ['rev', P.rev]] : [['rev', P.rev], ['fwd', P.fwd]]);
    const res = { type: 'bay', id: bay.id, idx: bi, flags: bayFlags(bay, set, BASE.data), reasons: [] };
    DBG = ROUTE ? ['route:' + Math.round(ROUTE.ms) + 'ms'] : []; if (ROUTE) ROUTE.ms = 0; LIMIT = false; GLIM = false;
    const din = V.artic ? bestInArtic(P.rev, entry, set) : bestIn(order, entry, Hin, set);
    if (!din) {
      res.grade = 'r'; res.reasons.push(LIMIT ? 'in-limit' : 'in-none');
      const tp = template(order, entry, set.buffer, bay); res.template = tp.sm; res.clash = tp.clash;
    } else {
      res.in = pack(din, set);
      let g = din.lvl === 'g' && !din.lockRev ? 'g' : din.lvl === 'r' ? 'r' : 'a';
      if (din.lvl === 'a') res.reasons.push('in-shunts'); if (din.lvl === 'a2') res.reasons.push('in-buffer');
      if (din.lvl === 'r') { res.reasons.push('in-many'); const tp = template(order, entry, set.buffer, bay); res.template = tp.sm; res.clash = tp.clash; }
      if (din.lockRev) res.reasons.push('in-lockrev');
      const Hout = gateMap(exit); LIMIT = false;
      const startOut = din.sm[din.sm.length - 1];
      const sOut = V.artic ? [startOut[0], startOut[1], startOut[2], startOut[3]] : [startOut[0], startOut[1], startOut[2]];
      const dout = (V.artic && outArtic(sOut, exit, set)) || bestOut(sOut, exit, Hout, set);
      if (!dout) { g = 'r'; res.reasons.push(LIMIT ? 'out-limit' : 'out-none'); }
      else {
        res.out = pack(dout, set);
        if (dout.lvl === 'r') { g = 'r'; res.reasons.push('out-many'); }
        else if (dout.lvl !== 'g') { g = g === 'r' ? 'r' : 'a'; res.reasons.push(dout.lvl === 'a' ? 'out-shunts' : 'out-buffer'); }
      }
      res.grade = g;
    }
    // the one-manoeuvre (green) search stopped at its node limit: a cleaner path than the one graded may exist
    if (res.grade !== 'g' && GLIM) res.reasons.push('g-limit');
    res.dbg = DBG.join(' ');
    res.ms = Math.round(performance.now() - t0);
    self.postMessage(res);
  }
  self.postMessage({ type: 'done' });
}
function pack(r, set) {
  const env = envelopes(r.sm, r.buf);
  return { sm: r.sm, cusps: r.cusps, len: +r.len.toFixed(2), minClr: +r.minClr.toFixed(3), bayClr: Number.isFinite(r.bayClr) ? +r.bayClr.toFixed(3) : null, buf: r.buf, pose: r.pose, lvl: r.lvl,
    lockRev: !!r.lockRev, nodes: r.nodes, body: env.body, clear: env.clear };
}

// T1 helper: drive a full-lock circle and return the measured radii.
function selfTest(m) {
  setup(m.vehicle); let p = V.artic ? [0, 0, 0, 0] : [0, 0, 0]; const pts = [];
  const n = Math.ceil(2 * Math.PI * V.Rmin / 0.02);
  for (let i = 0; i < n; i++) { p = step(V, p, V.kmax, 0.02); pts.push(p); }
  const cx = 0, cy = V.Rmin; // centre of the rear-axle circle (left turn, y down: centre at +y)
  let ra = 0, rf = 0, rw = 0;
  for (const q of pts) {
    ra = Math.max(ra, Math.hypot(q[0] - cx, q[1] - cy));
    const c = Math.cos(q[2]), s = Math.sin(q[2]);
    const fo = [q[0] + c * V.WB + s * V.T / 2, q[1] + s * V.WB - c * V.T / 2]; // outer front wheel (right side for a left turn)
    rf = Math.max(rf, Math.hypot(fo[0] - cx, fo[1] - cy));
    const co = [q[0] + c * (V.WB + V.FOH) + s * V.W / 2, q[1] + s * (V.WB + V.FOH) - c * V.W / 2];
    rw = Math.max(rw, Math.hypot(co[0] - cx, co[1] - cy));
  }
  return { Rmin: V.Rmin, rearAxleR: ra, outerFrontWheelR: rf, Rk: V.Rk, wallR: rw, RwCalc: V.RwCalc };
}
// debugging hook for the Node test harness (no effect in the browser)
self.__dbg = { get ROUTE() { return ROUTE; }, hLat, plan,  clearance, shot, step: (a,b,c)=>step(V,a,b,c), gateMap, hAt, bayPoses, freeAt, get D() { return D; }, get DN() { return DN; }, get V() { return V; }, get HW() { return HW; }, get HH() { return HH; } };
