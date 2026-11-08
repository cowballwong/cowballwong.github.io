/* Facade Surface Studio · geometry engine (no three.js, so it can be tested on its own).
   Surface = podium footprint (closed curve, arc-length u) + a B-spline displacement lattice (periodic in u, clamped in v),
   plus row twist and taper. Panels are made in (u,v) and mapped onto the surface. All lengths in metres unless noted. */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (u) => u - Math.floor(u);

/* ------------------------------------------------------------------ footprint */
function rawFootprint(kind, W, D, r) {
  const pts = [], hw = W / 2, hd = D / 2;
  const arc = (cx, cz, rad, a0, a1, n) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push([cx + rad * Math.cos(a), cz + rad * Math.sin(a)]); } };
  if (kind === 'circle') { const R = Math.min(W, D) / 2; for (let k = 0; k < 160; k++) { const a = k / 160 * TAU; pts.push([R * Math.cos(a), R * Math.sin(a) * (D / Math.min(W, D))]); } return pts; }
  if (kind === 'L') {
    // L: full width along the front (+z), a wing at the left going back; centred roughly on the bounding box.
    const wing = W * 0.46, deep = D * 0.5;
    const c = [[-hw, hd], [hw, hd], [hw, hd - deep], [-hw + wing, hd - deep], [-hw + wing, -hd], [-hw, -hd]];
    const rr = Math.min(r, wing * 0.3, deep * 0.3);
    for (let i = 0; i < c.length; i++) {
      const p = c[i], a = c[(i + c.length - 1) % c.length], b = c[(i + 1) % c.length];
      if (rr < 0.05) { pts.push(p); continue; }
      const ua = norm2([a[0] - p[0], a[1] - p[1]]), ub = norm2([b[0] - p[0], b[1] - p[1]]);
      const p0 = [p[0] + ua[0] * rr, p[1] + ua[1] * rr], p1 = [p[0] + ub[0] * rr, p[1] + ub[1] * rr];
      for (let k = 0; k <= 8; k++) { const t = k / 8; const q0 = lerp2(p0, p, t), q1 = lerp2(p, p1, t); pts.push(lerp2(q0, q1, t)); }
    }
    return pts;
  }
  const rr = kind === 'rect' ? 0 : Math.min(r, hw * 0.95, hd * 0.95);
  if (rr < 0.05) return [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]];
  arc(hw - rr, hd - rr, rr, Math.PI / 2, 0, 12); arc(hw - rr, -hd + rr, rr, 0, -Math.PI / 2, 12);
  arc(-hw + rr, -hd + rr, rr, -Math.PI / 2, -Math.PI, 12); arc(-hw + rr, hd - rr, rr, Math.PI, Math.PI / 2, 12);
  return pts;
}
const norm2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export class Footprint {
  constructor(kind, W, D, r, M = 720) {
    let p = rawFootprint(kind, W, D, r);
    // start u = 0 at the middle of the front (+z) side, running towards +x
    let best = 0, bd = 1e9;
    for (let i = 0; i < p.length; i++) { const d = Math.abs(p[i][0]) + Math.abs(p[i][1] - Math.max(...p.map(q => q[1]))) * 4; if (d < bd) { bd = d; best = i; } }
    p = p.slice(best).concat(p.slice(0, best));
    let A = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; A += a[0] * b[1] - b[0] * a[1]; }
    if (A < 0) { p = [p[0]].concat(p.slice(1).reverse()); }   // make (x,z) order counter-clockwise in maths sense
    // resample by arc length
    const L = [0]; for (let i = 1; i <= p.length; i++) { const a = p[i - 1], b = p[i % p.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const per = L[p.length]; this.perimeter = per; this.M = M;
    const X = new Float64Array(M), Z = new Float64Array(M); let j = 0;
    for (let k = 0; k < M; k++) {
      const s = k / M * per; while (L[j + 1] < s) j++;
      const a = p[j], b = p[(j + 1) % p.length], t = (s - L[j]) / ((L[j + 1] - L[j]) || 1);
      X[k] = a[0] + (b[0] - a[0]) * t; Z[k] = a[1] + (b[1] - a[1]) * t;
    }
    // put u = 0 at the middle of the front (+z) side
    { let zmax = -1e9; for (let k = 0; k < M; k++) zmax = Math.max(zmax, Z[k]);
      let k0 = 0, bx = 1e9; for (let k = 0; k < M; k++) if (Z[k] > zmax - Math.max(0.3, D * 0.01) && Math.abs(X[k]) < bx) { bx = Math.abs(X[k]); k0 = k; }
      const X2 = X.slice(), Z2 = Z.slice(); for (let k = 0; k < M; k++) { X[k] = X2[(k + k0) % M]; Z[k] = Z2[(k + k0) % M]; } }
    // outward normals, smoothed over +-3 samples (sharp corners get a mitred normal)
    const NX = new Float64Array(M), NZ = new Float64Array(M);
    for (let k = 0; k < M; k++) {
      let tx = 0, tz = 0;
      for (let q = 1; q <= 3; q++) { tx += X[(k + q) % M] - X[(k - q + M) % M]; tz += Z[(k + q) % M] - Z[(k - q + M) % M]; }
      const l = Math.hypot(tx, tz) || 1; NX[k] = tz / l; NZ[k] = -tx / l;
    }
    this.X = X; this.Z = Z; this.NX = NX; this.NZ = NZ;
    this.cx = 0; this.cz = 0;
    this.outline = p;
  }
  // Catmull-Rom between resampled points: C1, so second derivatives are usable for curvature
  at(u, o) {
    const M = this.M, f = wrap(u) * M, k = Math.floor(f), t = f - k;
    const i0 = (k - 1 + M) % M, i1 = k % M, i2 = (k + 1) % M, i3 = (k + 2) % M;
    const t2 = t * t, t3 = t2 * t;
    const c0 = -0.5 * t3 + t2 - 0.5 * t, c1 = 1.5 * t3 - 2.5 * t2 + 1, c2 = -1.5 * t3 + 2 * t2 + 0.5 * t, c3 = 0.5 * t3 - 0.5 * t2;
    o.x = c0 * this.X[i0] + c1 * this.X[i1] + c2 * this.X[i2] + c3 * this.X[i3];
    o.z = c0 * this.Z[i0] + c1 * this.Z[i1] + c2 * this.Z[i2] + c3 * this.Z[i3];
    const nx = c0 * this.NX[i0] + c1 * this.NX[i1] + c2 * this.NX[i2] + c3 * this.NX[i3];
    const nz = c0 * this.NZ[i0] + c1 * this.NZ[i1] + c2 * this.NZ[i2] + c3 * this.NZ[i3];
    const l = Math.hypot(nx, nz) || 1; o.nx = nx / l; o.nz = nz / l;
    return o;
  }
}

/* ------------------------------------------------------------------ B-spline bases */
function clampedKnots(n, p) { const m = n + p + 1, k = []; for (let i = 0; i < m; i++) k.push(i <= p ? 0 : i >= n ? 1 : (i - p) / (n - p)); return k; }
function basisClamped(n, p, knots, t, out) {
  // Cox-de Boor, all n basis values at t (t in [0,1])
  t = clamp(t, 0, 1 - 1e-9);
  const N = basisClamped.buf && basisClamped.buf.length === n + p + 1 ? basisClamped.buf.fill(0) : (basisClamped.buf = new Float64Array(n + p + 1));
  for (let i = 0; i < n + p; i++) N[i] = knots[i] <= t && t < knots[i + 1] ? 1 : 0;
  for (let d = 1; d <= p; d++) for (let i = 0; i < n + p - d; i++) {
    let a = 0, b = 0;
    const den1 = knots[i + d] - knots[i], den2 = knots[i + d + 1] - knots[i + 1];
    if (den1 > 0) a = (t - knots[i]) / den1 * N[i];
    if (den2 > 0) b = (knots[i + d + 1] - t) / den2 * N[i + 1];
    N[i] = a + b;
  }
  for (let i = 0; i < n; i++) out[i] = N[i];
  return out;
}

/* ------------------------------------------------------------------ surface */
export class Surface {
  /* cfg: { fp: Footprint, H, nu, nv, deg (1|3), d: Float64Array(nu*nv) outward offsets, y: Float64Array(nu*nv) lifts,
            twist (deg at top), taper (0..0.5 at top), cx, cz } */
  constructor(cfg) {
    Object.assign(this, cfg);
    this.pv = this.deg === 1 ? 1 : Math.min(3, this.nv - 1);
    this.kv = clampedKnots(this.nv, this.pv);
    this.bv = new Float64Array(this.nv);
    this.g = []; // greville abscissae of the rows
    for (let j = 0; j < this.nv; j++) { let s = 0; for (let q = 1; q <= this.pv; q++) s += this.kv[j + q]; this.g.push(s / this.pv); }
    this._f = { x: 0, z: 0, nx: 0, nz: 0 };
    const TN = 2048, tab = new Float64Array((TN + 1) * this.nv), tmp = new Float64Array(this.nv);
    for (let s = 0; s <= TN; s++) { basisClamped(this.nv, this.pv, this.kv, s / TN, tmp); tab.set(tmp, s * this.nv); }
    this._tab = tab; this._TN = TN;
  }
  vbasis(v, out) {
    const TN = this._TN, nv = this.nv, f = clamp(v, 0, 1) * TN, k = Math.min(TN - 1, Math.floor(f)), t = f - k, a = k * nv, b = a + nv, tab = this._tab;
    for (let j = 0; j < nv; j++) out[j] = tab[a + j] * (1 - t) + tab[b + j] * t;
    return out;
  }
  field(u, v) {
    // blended offset (d) and lift (y) at (u,v)
    const nu = this.nu, nv = this.nv, bv = this.bv;
    this.vbasis(v, bv);
    let d = 0, y = 0;
    const t = wrap(u) * nu, k = Math.floor(t), s = t - k;
    if (this.deg === 1) {
      const i0 = k % nu, i1 = (k + 1) % nu;
      for (let j = 0; j < nv; j++) { if (!bv[j]) continue; const r = j * nu; d += bv[j] * ((1 - s) * this.d[r + i0] + s * this.d[r + i1]); y += bv[j] * ((1 - s) * this.y[r + i0] + s * this.y[r + i1]); }
    } else {
      const s2 = s * s, s3 = s2 * s;
      const b = [(1 - s) * (1 - s) * (1 - s) / 6, (3 * s3 - 6 * s2 + 4) / 6, (-3 * s3 + 3 * s2 + 3 * s + 1) / 6, s3 / 6];
      for (let j = 0; j < nv; j++) {
        if (!bv[j]) continue; const r = j * nu;
        for (let q = 0; q < 4; q++) { const i = (k - 1 + q + nu * 4) % nu; d += bv[j] * b[q] * this.d[r + i]; y += bv[j] * b[q] * this.y[r + i]; }
      }
    }
    return [d, y];
  }
  eval(u, v, o) {
    const f = this.fp.at(u, this._f), [d, y] = this.field(u, v);
    const sc = 1 - this.taper * v, a = this.twist * v * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const lx = (f.x - this.cx) * sc + f.nx * d, lz = (f.z - this.cz) * sc + f.nz * d;
    o.x = this.cx + lx * ca - lz * sa; o.z = this.cz + lx * sa + lz * ca; o.y = v * this.H + y;
    return o;
  }
  // control point position for display: the lattice value placed at its own (u_i, greville_j)
  ctrl(i, j, o) {
    const u = i / this.nu, v = this.g[j], f = this.fp.at(u, this._f), k = j * this.nu + i, d = this.d[k];
    const sc = 1 - this.taper * v, a = this.twist * v * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const lx = (f.x - this.cx) * sc + f.nx * d, lz = (f.z - this.cz) * sc + f.nz * d;
    o.x = this.cx + lx * ca - lz * sa; o.z = this.cz + lx * sa + lz * ca; o.y = v * this.H + this.y[k];
    return o;
  }
  frame(u, v) {
    // point, unit normal (outward), tangents, curvature (Gaussian K, mean H) by finite differences
    const hu = 1.2 / this.fp.perimeter, hv = 0.3 / this.H;
    const P = this.eval(u, v, {}), A = this.eval(u + hu, v, {}), B = this.eval(u - hu, v, {});
    const v1 = Math.min(1, v + hv), v0 = Math.max(0, v - hv), C = this.eval(u, v1, {}), Dd = this.eval(u, v0, {});
    const Su = [(A.x - B.x) / (2 * hu), (A.y - B.y) / (2 * hu), (A.z - B.z) / (2 * hu)];
    const Sv = [(C.x - Dd.x) / (v1 - v0), (C.y - Dd.y) / (v1 - v0), (C.z - Dd.z) / (v1 - v0)];
    let n = cross(Su, Sv); const f = this.fp.at(u, {});
    if (n[0] * f.nx + n[2] * f.nz < 0) n = [-n[0], -n[1], -n[2]];
    n = norm3(n);
    return { P, n, Su, Sv };
  }
  curvature(u, v) {
    const hu = 1.5 / this.fp.perimeter, hv = 0.6 / this.H;
    const vv = clamp(v, hv, 1 - hv);
    const e = (a, b) => { const q = this.eval(a, b, {}); return [q.x, q.y, q.z]; };
    const P = e(u, vv), Pu1 = e(u + hu, vv), Pu0 = e(u - hu, vv), Pv1 = e(u, vv + hv), Pv0 = e(u, vv - hv);
    const P11 = e(u + hu, vv + hv), P10 = e(u + hu, vv - hv), P01 = e(u - hu, vv + hv), P00 = e(u - hu, vv - hv);
    const Su = sub(Pu1, Pu0).map(x => x / (2 * hu)), Sv = sub(Pv1, Pv0).map(x => x / (2 * hv));
    const Suu = [0, 1, 2].map(i => (Pu1[i] - 2 * P[i] + Pu0[i]) / (hu * hu));
    const Svv = [0, 1, 2].map(i => (Pv1[i] - 2 * P[i] + Pv0[i]) / (hv * hv));
    const Suv = [0, 1, 2].map(i => (P11[i] - P10[i] - P01[i] + P00[i]) / (4 * hu * hv));
    const n = norm3(cross(Su, Sv));
    const E = dot(Su, Su), F = dot(Su, Sv), G = dot(Sv, Sv), L = dot(Suu, n), Mm = dot(Suv, n), N = dot(Svv, n);
    const den = E * G - F * F || 1e-12;
    return { K: (L * N - Mm * Mm) / den, H: (E * N - 2 * F * Mm + G * L) / (2 * den) };
  }
}
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const P3 = (o) => [o.x, o.y, o.z];

/* ------------------------------------------------------------------ divide + pattern (param space) */
export const PATTERNS = ['quad', 'diamond', 'triangle', 'hex', 'perforated', 'fins', 'pyramids'];
export function panelCount(pattern, nU, nV) {
  if (pattern === 'triangle') return nU * nV * 2;
  if (pattern === 'diamond') return Math.ceil(nU * (nV + 1) / 2);
  if (pattern === 'hex') return nU * Math.ceil(nV / 1.5 + 1);
  return nU * nV;
}
export function divide(pattern, nU, nV) {
  const du = 1 / nU, dv = 1 / nV, out = [];
  const push = (uv, row, col, extra) => out.push(Object.assign({ uv, row, col }, extra || {}));
  if (pattern === 'quad' || pattern === 'perforated' || pattern === 'pyramids') {
    for (let j = 0; j < nV; j++) for (let i = 0; i < nU; i++) push([[i * du, j * dv], [(i + 1) * du, j * dv], [(i + 1) * du, (j + 1) * dv], [i * du, (j + 1) * dv]], j, i);
  } else if (pattern === 'triangle') {
    for (let j = 0; j < nV; j++) for (let i = 0; i < nU; i++) {
      const a = [i * du, j * dv], b = [(i + 1) * du, j * dv], c = [(i + 1) * du, (j + 1) * dv], d = [i * du, (j + 1) * dv];
      if ((i + j) % 2) { push([a, b, c], j, i * 2); push([a, c, d], j, i * 2 + 1); } else { push([a, b, d], j, i * 2); push([b, c, d], j, i * 2 + 1); }
    }
  } else if (pattern === 'diamond') {
    for (let j = 0; j <= nV; j++) for (let i = 0; i < nU; i++) {
      if ((i + j) % 2) continue;
      const cu = i * du, cv = j * dv, L = [cu - du, cv], R = [cu + du, cv], T = [cu, cv + dv], B = [cu, cv - dv];
      if (j === 0) push([L, R, T], j, i); else if (j === nV) push([R, L, B], j, i); else push([B, R, T, L], j, i);
    }
    // the diamonds are 2 cells wide: rescale columns so nU stays the panel count around (nU must be even)
  } else if (pattern === 'hex') {
    const hw = du / 2, hh = dv / 1.5 * 1.0, rows = Math.ceil(1 / (1.5 * hh)) + 1;
    for (let j = 0; j <= rows; j++) {
      const cv = j * 1.5 * hh; if (cv - hh > 1) break;
      for (let i = 0; i < nU; i++) {
        const cu = i * du + (j % 2 ? hw : 0);
        const ring = [[cu, cv - hh], [cu + hw, cv - hh / 2], [cu + hw, cv + hh / 2], [cu, cv + hh], [cu - hw, cv + hh / 2], [cu - hw, cv - hh / 2]]
          .map(p => [p[0], clamp(p[1], 0, 1)]);
        // drop rings squashed to nothing at the top or bottom edge
        const vs = ring.map(p => p[1]); if (Math.max(...vs) - Math.min(...vs) < hh * 0.45) continue;
        // remove duplicate clamped vertices
        const r2 = []; for (const p of ring) { const q = r2[r2.length - 1]; if (!q || Math.abs(q[0] - p[0]) > 1e-9 || Math.abs(q[1] - p[1]) > 1e-9) r2.push(p); }
        if (r2.length > 2 && Math.abs(r2[0][0] - r2[r2.length - 1][0]) < 1e-9 && Math.abs(r2[0][1] - r2[r2.length - 1][1]) < 1e-9) r2.pop();
        push(r2, j, i);
      }
    }
  } else if (pattern === 'fins') {
    for (let j = 0; j < nV; j++) for (let i = 0; i < nU; i++) push([[(i + 0.5) * du, j * dv], [(i + 0.5) * du, (j + 1) * dv]], j, i, { fin: true });
  }
  out.forEach((p, k) => { p.id = k; let su = 0, sv = 0; for (const q of p.uv) { su += q[0]; sv += q[1]; } p.c = [su / p.uv.length, sv / p.uv.length]; });
  return out;
}

/* ------------------------------------------------------------------ panel geometry on the surface */
export function newell(P) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  return [nx, ny, nz];
}
export function mapPanels(S, panels, pat, withCurv = true) {
  const o = {};
  for (const p of panels) {
    const fr = S.frame(p.c[0], p.c[1]);
    p.n = fr.n; p.sv = norm3(fr.Sv);
    if (withCurv) { const cu = S.curvature(p.c[0], p.c[1]); p.K = cu.K; p.H = cu.H; } else if (p.K === undefined) { p.K = 0; p.H = 0; }
    if (p.fin) {
      const a = S.frame(p.uv[0][0], p.uv[0][1]), b = S.frame(p.uv[1][0], p.uv[1][1]);
      p.base = [P3(a.P), P3(b.P)]; p.bn = [a.n, b.n]; p.bt = [norm3(a.Sv), norm3(b.Sv)];
      p.cen = mul(add(p.base[0], p.base[1]), 0.5);
      p.edges = [len(sub(p.base[1], p.base[0]))];
      continue;
    }
    p.P = p.uv.map(q => P3(S.eval(q[0], q[1], o)));
    let cx = 0, cy = 0, cz = 0; for (const q of p.P) { cx += q[0]; cy += q[1]; cz += q[2]; }
    p.cen = [cx / p.P.length, cy / p.P.length, cz / p.P.length];
    const nw = newell(p.P); p.area = len(nw) / 2;
    let fn = norm3(nw); if (dot(fn, p.n) < 0) { fn = mul(fn, -1); p.P.reverse(); p.uv.reverse(); }
    p.fn = fn;
    p.edges = p.P.map((q, i) => len(sub(p.P[(i + 1) % p.P.length], q)));
    p.diag = p.P.length >= 4 ? len(sub(p.P[2], p.P[0])) : 0;
    // planarity: 4-gons = distance of the 4th vertex from the plane of the other 3; n-gons = max distance from the best-fit plane
    if (p.P.length === 3) p.plan = 0;
    else if (p.P.length === 4) { const nn = norm3(cross(sub(p.P[1], p.P[0]), sub(p.P[2], p.P[0]))); p.plan = Math.abs(dot(sub(p.P[3], p.P[0]), nn)); }
    else { let m = 0; for (const q of p.P) m = Math.max(m, Math.abs(dot(sub(q, p.cen), fn))); p.plan = m; }
    // inradius proxy (for apertures): min distance from centroid to an edge
    let ir = 1e9;
    for (let i = 0; i < p.P.length; i++) { const a = p.P[i], b = p.P[(i + 1) % p.P.length], ab = sub(b, a), t = clamp(dot(sub(p.cen, a), ab) / (dot(ab, ab) || 1), 0, 1); ir = Math.min(ir, len(sub(p.cen, add(a, mul(ab, t))))); }
    p.inr = ir;
  }
  if (pat === 'fins') for (const p of panels) p.plan = 0;
}

/* ------------------------------------------------------------------ sun */
export function sunVector(lat, month, hour) {
  // simple solar geometry at local solar time on the 21st of the month; +x east, +y up, -z north
  const N = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355][month - 1];
  const dec = 23.44 * Math.sin(TAU * (284 + N) / 365) * Math.PI / 180, phi = lat * Math.PI / 180, Hh = (hour - 12) * 15 * Math.PI / 180;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(Hh));
  let az = Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI; // from north, clockwise
  const ca = Math.cos(alt);
  return { v: [Math.sin(az) * ca, Math.sin(alt), -Math.cos(az) * ca], alt: alt * 180 / Math.PI, az: ((az * 180 / Math.PI) % 360 + 360) % 360 };
}

/* ------------------------------------------------------------------ drivers */
export function catmull(pts, n) {
  const out = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const p0 = pts[Math.max(0, s - 1)], p1 = pts[s], p2 = pts[s + 1], p3 = pts[Math.min(pts.length - 1, s + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(d => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
export function drivers(S, panels, st) {
  /* st: { w:{att,curve,curv,sun,view,height}, R, Rc, atts:[{u,v,off}], curve:{on,pts:[[u,v]x3]}, sun:{v,alt}, view:{x,z,mode,R},
          hInvert, invert, stretch }  ->  p.t (0..1) and p.dv (per-driver values for the CSV) */
  const o = {}, A = st.atts.map(a => { const f = S.frame(a.u, a.v); return add(P3(f.P), mul(f.n, a.off)); });
  let C = [];
  if (st.curve.on) C = catmull(st.curve.pts, 24).map(q => { const f = S.frame(wrap(q[0]), clamp(q[1], 0, 1)); return add(P3(f.P), mul(f.n, 0.3)); });
  const absH = panels.map(p => Math.abs(p.H)).sort((a, b) => a - b), h95 = absH[Math.floor(absH.length * 0.95)] || 1e-6;
  const sv = st.sun.v, sunUp = st.sun.alt > 0, V = [st.view.x, 1.6, st.view.z];
  const W = st.w;
  let lo = 1e9, hi = -1e9;
  for (const p of panels) {
    const c = p.cen, n = p.fn || p.n, dv = {};
    if (A.length) { let m = 0; for (const a of A) m = Math.max(m, 1 - smooth(len(sub(c, a)) / st.R)); dv.att = m; }
    if (C.length) { let d = 1e9; for (const q of C) d = Math.min(d, len(sub(c, q))); dv.curve = 1 - smooth(d / st.Rc); }
    dv.curv = clamp(Math.abs(p.H) / h95, 0, 1);
    dv.sun = sunUp ? Math.max(0, dot(n, sv)) : 0;
    const tv = sub(V, c), dist = len(tv);
    dv.view = st.view.mode === 'angle' ? Math.max(0, dot(n, mul(tv, 1 / (dist || 1)))) : 1 - smooth(dist / st.view.R);
    dv.height = st.hInvert ? 1 - p.c[1] : p.c[1];
    let s = 0, ws = 0;
    for (const k of ['att', 'curve', 'curv', 'sun', 'view', 'height']) { if (dv[k] === undefined || !W[k]) continue; s += W[k] * dv[k]; ws += W[k]; }
    let t = ws ? s / ws : 0.5; if (st.invert) t = 1 - t;
    p.dv = dv; p.t0 = t; lo = Math.min(lo, t); hi = Math.max(hi, t);
  }
  for (const p of panels) p.t = st.stretch && hi - lo > 1e-6 ? (p.t0 - lo) / (hi - lo) : p.t0;
  return { attPts: A, curvePts: C };
}

/* ------------------------------------------------------------------ openings + features for rationalisation */
export function openingOf(p, open, pat, st) {
  // returns a length in mm that describes the opening/feature driven by t (used as a clustering feature)
  if (pat === 'fins') return open;                       // angle in degrees
  if (pat === 'pyramids') return open * 1000;            // apex height in mm
  if (pat === 'perforated') return Math.min(Math.sqrt(open * p.area / Math.PI), p.inr * 0.92) * 2000; // hole diameter mm
  return Math.sqrt(open) * 1000 * Math.sqrt(p.area);      // opening "size" ~ side of the cut-out, mm
}
export function valFromOp(p, op, pat) {
  // inverse of openingOf: the panel value that gives this opening dimension on this panel
  if (pat === 'fins') return op;
  if (pat === 'pyramids') return op / 1000;
  if (pat === 'perforated') { const r = Math.min(op / 2000, p.inr * 0.92); return Math.min(0.85, Math.PI * r * r / (p.area || 1)); }
  return Math.min(0.85, (op / 1000) * (op / 1000) / (p.area || 1));
}
export function valueFromT(t, pat, st) {
  if (pat === 'fins') return st.finMin + (st.finMax - st.finMin) * t;          // degrees
  if (pat === 'pyramids') return st.pyrMin + (st.pyrMax - st.pyrMin) * t;      // metres
  return (st.oMin + (st.oMax - st.oMin) * t) / 100;                            // open area fraction
}
export function shapeVec(p, pat) {
  // fixed length so triangles at the edges, hexagons and diamonds can share one clustering: 6 edges, 1 diagonal, corner count
  if (pat === 'fins') return [p.edges[0] * 1000];
  const e = p.edges.map(x => x * 1000).slice(0, 6); while (e.length < 6) e.push(0);
  return e.concat([(p.diag || 0) * 1000, p.edges.length * 1000]);
}
export function features(p, pat, val, basis) {
  const geo = shapeVec(p, pat);
  const op = pat === 'fins' ? [val * 20] : [openingOf(p, val, pat)];   // fins: 1 degree counts like 20 mm
  if (basis === 'opening') return op;
  if (basis === 'shape') return geo;
  return geo.concat(op);
}
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function kmeans(X, k, iters = 24, init = null) {
  const n = X.length, d = X[0].length, R = rng(7);
  k = Math.max(1, Math.min(k, n));
  let C;
  if (init && init.length === k && init[0].length === d) C = init.map(c => c.slice());
  else {
    C = [X[Math.floor(R() * n)].slice()];
    const D = new Float64Array(n).fill(Infinity);
    while (C.length < k) {
      const c = C[C.length - 1]; let sum = 0;
      for (let i = 0; i < n; i++) { let s = 0; for (let q = 0; q < d; q++) { const e = X[i][q] - c[q]; s += e * e; } if (s < D[i]) D[i] = s; sum += D[i]; }
      let r = R() * sum, pick = n - 1; for (let i = 0; i < n; i++) { r -= D[i]; if (r <= 0) { pick = i; break; } }
      C.push(X[pick].slice());
    }
  }
  const lab = new Int32Array(n);
  for (let it = 0; it < (init ? 1 : iters); it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let b = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { let s = 0; for (let q = 0; q < d; q++) { const e = X[i][q] - C[c][q]; s += e * e; } if (s < bd) { bd = s; b = c; } }
      if (lab[i] !== b) { lab[i] = b; moved = true; }
    }
    const S = C.map(() => new Float64Array(d)), cnt = new Int32Array(k);
    for (let i = 0; i < n; i++) { cnt[lab[i]]++; for (let q = 0; q < d; q++) S[lab[i]][q] += X[i][q]; }
    for (let c = 0; c < k; c++) if (cnt[c]) for (let q = 0; q < d; q++) C[c][q] = S[c][q] / cnt[c];
    if (!moved && it > 0) break;
  }
  return { lab, C };
}

/* ------------------------------------------------------------------ flatten one panel for the type sheet (mm, 2D) */
export function flatten(p, pat, val) {
  if (pat === 'fins') {
    const Lm = p.edges[0] * 1000, D = val.depth * 1000;
    return { outer: [[0, 0], [D, 0], [D, Lm], [0, Lm]], edges: [D, Lm, D, Lm], note: 'fin' };
  }
  const n = p.fn, c = p.cen;
  let e1 = sub(p.P[1], p.P[0]); e1 = norm3(sub(e1, mul(n, dot(e1, n))));
  const e2 = cross(n, e1);
  const to2 = (q) => { const r = sub(q, c); return [dot(r, e1) * 1000, dot(r, e2) * 1000]; };
  const outer = p.P.map(to2);
  const res = { outer, edges: p.edges.map(e => e * 1000) };
  if (pat === 'pyramids') {
    // exact net: base polygon + one triangle flap per edge, each unfolded about its base edge
    const h = val.h, apex = add(c, mul(n, h)), flaps = [];
    for (let i = 0; i < p.P.length; i++) {
      const A = p.P[i], B = p.P[(i + 1) % p.P.length], a2 = outer[i], b2 = outer[(i + 1) % outer.length];
      const la = len(sub(apex, A)) * 1000, lb = len(sub(apex, B)) * 1000, lab = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
      const x = (la * la - lb * lb + lab * lab) / (2 * lab), y = Math.sqrt(Math.max(0, la * la - x * x));
      const ux = (b2[0] - a2[0]) / lab, uy = (b2[1] - a2[1]) / lab;
      // outward = right-hand side of the edge for a CCW polygon in 2D
      let ox = uy, oy = -ux; const mx = (a2[0] + b2[0]) / 2, my = (a2[1] + b2[1]) / 2;
      if (ox * mx + oy * my < 0) { ox = -ox; oy = -oy; }
      flaps.push([a2, b2, [a2[0] + ux * x + ox * y, a2[1] + uy * x + oy * y]]);
    }
    res.flaps = flaps; res.apexH = h * 1000;
  } else if (pat === 'perforated') {
    res.circle = { cx: 0, cy: 0, r: Math.min(Math.sqrt(val.open * p.area / Math.PI), p.inr * 0.92) * 1000 };
  } else if (val.open > 0.004) {
    const k = Math.sqrt(val.open);
    res.inner = outer.map(q => [q[0] * k, q[1] * k]);
  }
  return res;
}

/* ------------------------------------------------------------------ colour ramps */
export const TYPE_COLOURS = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#8e5572', '#2a9d8f', '#f4d35e', '#c1121f', '#6d597a', '#90be6d', '#577590'];
const HEAT = [[0, [40, 54, 120]], [0.3, [33, 145, 140]], [0.6, [170, 220, 50]], [0.8, [253, 190, 60]], [1, [215, 48, 39]]];
export function heat(t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < HEAT.length; i++) if (t <= HEAT[i][0]) { const a = HEAT[i - 1], b = HEAT[i], s = (t - a[0]) / (b[0] - a[0]); return a[1].map((x, q) => (x + (b[1][q] - x) * s) / 255); }
  return HEAT[HEAT.length - 1][1].map(x => x / 255);
}
export const HEAT_CSS = 'linear-gradient(90deg,' + HEAT.map(h => `rgb(${h[1].join(',')}) ${h[0] * 100}%`).join(',') + ')';
