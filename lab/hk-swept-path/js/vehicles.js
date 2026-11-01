// HK Swept Path · vehicles, kinematics, footprints. Shared by the page and the planner worker.
// World: metres, y DOWN (image space). Heading th: unit vector (cos th, sin th). Curvature k > 0 turns th up.
// Reference point of a rigid vehicle (and of an articulated tractor) = middle of the rear axle.

// Presets: research.md 1.6 (TPDM Vol 2 / Vol 7, Aug 2026 editions). u: fields flagged UNVERIFIED (shown as assumptions in the UI).
export const PRESETS = [
  { id: 'car', en: 'Private car (TPDM design car)', zh: '私家車（運輸署設計車）', L: 4.57, W: 1.75, FOH: 0.76, WB: 2.74, ROH: 1.07, Rk: 6.40,
    bay: [5, 2.5], src: 'TPDM Vol 2 Diagram 2.2.3.1', Rw: 7.35 },
  { id: 'large', en: 'Large car', zh: '大型私家車', L: 5.158, W: 1.855, FOH: 0.867, WB: 3.085, ROH: 1.206, Rk: 5.85,
    bay: [5, 2.5], src: 'TPDM Vol 2 Table 2.2.2.2 (11.7 m swept diameter)', u: ['Rk'] },
  { id: 'van', en: 'Van-type LGV', zh: '客貨車（輕型貨車）', L: 4.69, W: 1.69, FOH: 0.98, WB: 2.645, ROH: 1.04, Rk: 5.40,
    bay: [5, 2.5], src: 'TPDM Vol 2 Table 2.2.2.2 (10.8 m swept diameter)', u: ['Rk'] },
  { id: 'lgv', en: 'Light goods vehicle (LGV)', zh: '輕型貨車', L: 6.59, W: 1.988, FOH: 0.939, WB: 4.025, ROH: 1.625, Rk: 7.15,
    bay: [7, 3.5], src: 'TPDM Vol 2 Table 2.2.2.2 (14.3 m swept diameter)', u: ['Rk'] },
  { id: 'lbus', en: 'Light bus', zh: '小巴', L: 6.99, W: 2.08, FOH: 1.15, WB: 3.935, ROH: 1.905, Rk: 7.30,
    bay: [8, 3], src: 'TPDM Vol 2 Diagram 2.2.3.11 + Table 2.2.2.2', Rw: 7.90 },
  { id: 'hgv', en: 'Medium / heavy goods vehicle (rigid)', zh: '中型／重型貨車（硬身）', L: 10.0, W: 2.5, FOH: 1.3, WB: 6.2, ROH: 2.5, Rk: 12.0,
    bay: [11, 3.5], src: 'TPDM Vol 7 Table 5.4.4.2', Rw: 12.7 },
  { id: 'coach', en: 'Coach / bus 12 m', zh: '12 米旅遊巴', L: 12.0, W: 2.5, FOH: 2.7, WB: 6.0, ROH: 3.3, Rk: 11.8,
    bay: [12, 3.5], src: 'TPDM Vol 2 p22 radii; axle positions assumed', u: ['FOH', 'WB', 'ROH'], Rw: 13.75 },
  { id: 'artic', en: 'Container / articulated truck', zh: '貨櫃車（拖架）', artic: true,
    W: 2.5, FOH: 1.3, WB: 3.2, ROH: 1.0, KP: 0.5, A3: 9.0, VF: 0.7, VB: 2.5, Rk: 6.75,
    bay: [16, 3.5], src: 'TPDM Vol 7 Table 5.4.4.2 (tractor turning circle 13.5 m between kerbs)', Rw: 7.45 },
];

// Assumptions every preset shares (UNVERIFIED in research.md): shown and editable in the UI.
export const DEFAULTS = {
  trackGap: 0.25,      // track = width - 0.25 m (UNVERIFIED)
  lockDist: 2.0,       // metres of travel from left lock to right lock, car (scaled with wheelbase) (UNVERIFIED)
  buffer: 0.30,        // clearance to structure and parked vehicles (practice, not an HK rule: UNVERIFIED)
  reduced: 0.15,       // amber if only passes with this buffer
};

export function makeVehicle(p, o = {}) {
  const v = { ...p, ...o };
  v.T = v.T != null ? v.T : v.W - DEFAULTS.trackGap;
  if (v.artic) v.L = v.FOH + v.WB + v.KP; // tractor reference length (front to kingpin), trailer separate
  // R_min (rear-axle radius) from the kerb-to-kerb radius: the outer front wheel traces R_k.
  const r = Math.sqrt(Math.max(v.Rk * v.Rk - v.WB * v.WB, 0.01)) - v.T / 2;
  v.Rmin = Math.max(r, v.WB * 0.6);
  v.kmax = 1 / v.Rmin;
  // computed wall-to-wall (outer front body corner) radius, tractor body for articulated
  v.RwCalc = Math.hypot(v.Rmin + v.W / 2, v.WB + v.FOH);
  v.total = v.artic ? (v.FOH + v.WB) + (v.A3 + v.VB - v.KP) : v.L;
  v.prim = Math.min(1.0, Math.max(0.5, 0.5 * v.WB / 2.74));     // primitive arc length
  v.lockDist = o.lockDist != null ? o.lockDist : DEFAULTS.lockDist * Math.max(1, v.WB / 2.74);
  return v;
}

// One kinematic step: rigid pose [x,y,th] (+ trailer th2) along signed arc length ds with curvature k.
export function step(v, s, k, ds) {
  const [x, y, th] = s;
  const th1 = th + k * ds;
  let nx, ny;
  if (Math.abs(k) < 1e-9) { nx = x + Math.cos(th) * ds; ny = y + Math.sin(th) * ds; }
  else { nx = x + (Math.sin(th1) - Math.sin(th)) / k; ny = y - (Math.cos(th1) - Math.cos(th)) / k; }
  if (!v.artic) return [nx, ny, th1];
  // trailer: d th2 / ds = (sin(th - th2) + k * KP * cos(th - th2)) / A3   (hitch KP ahead of the tractor rear axle)
  let th2 = s[3]; const n = Math.max(1, Math.ceil(Math.abs(ds) / 0.05)), h = ds / n;
  for (let i = 0; i < n; i++) {
    const t = th + k * h * (i + 0.5), d = t - th2;
    th2 += h * (Math.sin(d) + k * v.KP * Math.cos(d)) / v.A3;
  }
  return [nx, ny, th1, th2];
}

// Body rectangles in world coordinates: [{c:[x,y], th, x0, x1, hw}] local x from x0 to x1 along th, half width hw.
export function bodies(v, s) {
  const [x, y, th] = s;
  if (!v.artic) return [{ c: [x, y], th, x0: -v.ROH, x1: v.WB + v.FOH, hw: v.W / 2 }];
  const hx = x + Math.cos(th) * v.KP, hy = y + Math.sin(th) * v.KP, th2 = s[3];
  const ax = hx - Math.cos(th2) * v.A3, ay = hy - Math.sin(th2) * v.A3;
  return [{ c: [x, y], th, x0: -v.ROH, x1: v.WB + v.FOH, hw: v.W / 2 },
          { c: [ax, ay], th: th2, x0: -v.VB, x1: v.A3 + v.VF, hw: v.W / 2 }];
}

export function rectPoly(b, grow = 0) {
  const c = Math.cos(b.th), s = Math.sin(b.th), [x, y] = b.c;
  const P = (u, w) => [x + c * u - s * w, y + s * u + c * w];
  const x0 = b.x0 - grow, x1 = b.x1 + grow, h = b.hw + grow;
  return [P(x0, -h), P(x1, -h), P(x1, h), P(x0, h)];
}

export function polys(v, s, grow = 0) { return bodies(v, s).map((b) => rectPoly(b, grow)); }

// Wheel centres (front left/right, rear left/right; trailer axle for articulated).
export function wheels(v, s) {
  const [x, y, th] = s, c = Math.cos(th), sn = Math.sin(th), t = v.T / 2;
  const P = (u, w) => [x + c * u - sn * w, y + sn * u + c * w];
  const out = [P(v.WB, -t), P(v.WB, t), P(0, -t), P(0, t)];
  if (v.artic) {
    const b = bodies(v, s)[1], c2 = Math.cos(b.th), s2 = Math.sin(b.th);
    out.push([b.c[0] + s2 * t, b.c[1] - c2 * t], [b.c[0] - s2 * t, b.c[1] + c2 * t]);
  }
  return out;
}

// Disc cover of a body rectangle, in the body's local frame: [u, w, r]. A pose is free when distance(obstacle)
// >= r + buffer at every disc centre. Edge strips: discs at depth d inside each edge, 0.15 m apart, radius
// sqrt(0.075^2 + d^2): they bulge only ~15 mm past the edge and cover a band 2d deep. Inscribed discs on the centre
// line cover the rest of the inside.
export function discCover(x0, x1, hw) {
  const l = x1 - x0, out = [], sp = 0.15, d = Math.max(0.15, 0.15 * hw), r = Math.hypot(sp / 2, d);
  // edge strips stop short of the corners so they do not overhang the ends; four small corner discs close the gap
  const ul = l - 2 * d, wl = 2 * hw - 2 * d;
  const nl = Math.max(1, Math.round(ul / sp)), nw = Math.max(1, Math.round(wl / sp));
  for (let i = 0; i < nl; i++) { const u = x0 + d + (i + 0.5) * ul / nl; out.push([u, -hw + d, r], [u, hw - d, r]); }
  for (let j = 0; j < nw; j++) { const w = -hw + d + (j + 0.5) * wl / nw; out.push([x0 + d, w, r], [x1 - d, w, r]); }
  const c = 0.075, rc = c * Math.SQRT2;
  for (const u of [x0 + c, x1 - c]) for (const w of [-hw + c, hw - c]) out.push([u, w, rc]);
  if (l > 2 * hw) { const n = Math.max(1, Math.ceil((l - 2 * hw) / 0.4)); for (let i = 0; i <= n; i++) out.push([x0 + hw + (l - 2 * hw) * i / n, 0, hw]); }
  else out.push([(x0 + x1) / 2, 0, Math.min(hw, l / 2)]);
  return out;
}

export function coverFor(v) {
  const b = bodies(v, v.artic ? [0, 0, 0, 0] : [0, 0, 0]);
  return b.map((r) => discCover(r.x0, r.x1, r.hw));
}

export function ang(a) { a = a % (2 * Math.PI); if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI; return a; }

// HKPSG Ch 8 Table 6 / APP-111 Table 1 bay sizes for the size check.
export const HKPSG_BAYS = { car: [5, 2.5], large: [5, 2.5], van: [5, 2.5], lgv: [7, 3.5], lbus: [8, 3], hgv: [11, 3.5], coach: [12, 3.5], artic: [16, 3.5] };
