// Detailed exterior: Grimthorpe's west front (1880-83) and the Norman tower's detail.
// Contract: buildWestFront() creates part('west-front', 1880) itself;
// buildTowerDetail(T) adds detail into the CURRENT part (the tower), T = {x0, x1, z} tower outline.
//
// Everything is modelled in a local wall frame and batched (one mesh per material per part):
//   u = along the wall (to the right when you face it), v = up (world y), d = out of the wall (towards the viewer).
// Mouldings are real profiles swept along arch paths; shafts are lathed (base, shaft, capital).
// Proportions: research/architecture.md plus Commons photos (00_Sandbox/ref/wf_front.jpg, wf_geo.jpg, assets/photos).
import {THREE, M, part, batch} from './scene.js';

const PI = Math.PI;
const WORLD = new THREE.Matrix4();
let F = WORLD;          // current local -> world frame
let BS, BN;             // batches: with ink edges / without (glass, small fry)
let TRIS = 0;

// Frame with origin (ox, oy, oz) and horizontal unit vector U = (ux, 0, uz); outward normal N = U x Y = (-uz, 0, ux).
function frame(ox, oz, ux, uz, oy = 0) {
  return new THREE.Matrix4().set(ux, 0, -uz, ox, 0, 1, 0, oy, uz, 0, ux, oz, 0, 0, 0, 1);
}
// Frame for a wall whose outward normal is (nx, nz), origin on the wall face.
const faceFrame = (ox, oz, nx, nz) => frame(ox, oz, nz, -nx);

function put(geo, mat = M.stone, edges = true) {
  geo.applyMatrix4(F);
  TRIS += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  (edges ? BS : BN).add(geo, mat);
}

// ---------------- primitives (local frame) ----------------
const lbox = (u0, u1, v0, v1, d0, d1, mat = M.stone, e = true) =>
  put(new THREE.BoxGeometry(u1 - u0, v1 - v0, d1 - d0).translate((u0 + u1) / 2, (v0 + v1) / 2, (d0 + d1) / 2), mat, e);

// Box whose front face (d = dF) may slope: dF0 at v0, dF1 at v1 (weatherings, set-offs, sills). Back at dB < dF.
function dbox(u0, u1, v0, v1, dB, dF0, dF1, mat = M.stone) {
  const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x < 0 ? u0 : u1, y < 0 ? v0 : v1, z < 0 ? dB : (y < 0 ? dF0 : dF1));
  }
  put(g, mat);
}
const V2 = p => new THREE.Vector2(p[0], p[1]);
function shape(pts, holes = []) {
  const s = new THREE.Shape(pts.map(V2));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(V2)));
  return s;
}
// Extruded shape in the wall plane, between depths d0 < d1.
function slab(pts, d0, d1, mat = M.stone, holes = [], e = true) {
  put(new THREE.ExtrudeGeometry(shape(pts, holes), {depth: d1 - d0, bevelEnabled: false, curveSegments: 1}).translate(0, 0, d0), mat, e);
}
const flat = (pts, d, mat = M.glass) => put(new THREE.ShapeGeometry(shape(pts)).translate(0, 0, d), mat, false);
const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

// Arch from the left springing over the apex to the right springing. Half-span h, radius R (R = h round, R = 2h equilateral).
// Concentric orders: same centres, so an order offset by a has (h + a, R + a).
const rise = (h, R) => Math.sqrt(R * R - (R - h) * (R - h));
function archPts(cu, ys, h, R, n = 8) {
  const tha = Math.acos((h - R) / R), pts = [];
  for (let i = 0; i <= n; i++) { const t = PI + (tha - PI) * i / n; pts.push([cu - h + R + R * Math.cos(t), ys + R * Math.sin(t)]); }
  for (let i = 1; i <= n; i++) { const t = (PI - tha) * (1 - i / n); pts.push([cu + h - R + R * Math.cos(t), ys + R * Math.sin(t)]); }
  return pts;
}
const opening = (cu, h, R, ys, v0, n) => [[cu - h, v0], ...archPts(cu, ys, h, R, n), [cu + h, v0]];
// Polygon from (uL,v0) along the ground line, dipping into each notch (an opening), to (uR,v0), then back over `top` (right to left).
const notched = (uL, uR, v0, notches, top) => [[uL, v0], ...notches.flat(), [uR, v0], ...top];
// One receding order: the ring between an outer arch (hO,RO) and an inner opening (hI,RI), jambs down to v0.
function ring(cu, hO, RO, hI, RI, ys, v0, d0, d1, mat = M.stone) {
  slab(notched(cu - hO, cu + hO, v0, [opening(cu, hI, RI, ys, v0)], archPts(cu, ys, hO, RO).reverse()), d0, d1, mat);
}

// Sweep a profile [[a, d]] along a path [[u, v]] in the wall plane. a = offset along the path's left normal
// (away from an opening when the path runs clockwise round it), d = depth. Profiles run with the solid on their right.
function sweep(path, prof, mat = M.stone, closedPath = false, closedProf = false) {
  const P = path, n = P.length, pr = closedProf ? [...prof, prof[0]] : prof, m = pr.length;
  const segs = closedPath ? n : n - 1, sn = [];
  for (let i = 0; i < segs; i++) {
    const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    sn.push([-dy / L, dx / L]);
  }
  const vn = P.map((_, i) => {
    const n1 = closedPath ? sn[(i - 1 + segs) % segs] : sn[Math.max(i - 1, 0)];
    const n2 = closedPath ? sn[i % segs] : sn[Math.min(i, segs - 1)];
    const dot = Math.max(-0.7, n1[0] * n2[0] + n1[1] * n2[1]);
    return [(n1[0] + n2[0]) / (1 + dot), (n1[1] + n2[1]) / (1 + dot)];
  });
  const pt = (i, j) => { const k = i % n, q = P[k], nn = vn[k], [a, d] = pr[j]; return [q[0] + nn[0] * a, q[1] + nn[1] * a, d]; };
  const pos = [], rows = closedPath ? n + 1 : n;
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < m - 1; j++) {
    const A = pt(i, j), B = pt(i + 1, j), C = pt(i + 1, j + 1), D = pt(i, j + 1);
    pos.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  put(g, mat);
}
const circlePath = (cu, cv, r, k = 24) => Array.from({length: k}, (_, i) => { const t = -2 * PI * i / k; return [cu + r * Math.cos(t), cv + r * Math.sin(t)]; });
const circ = (ac, dc, r, k = 6) => circlePath(ac, dc, r, k);                      // roll profile (clockwise)
const P_HOOD = (s = 1, d0 = 0) => [[-0.1 * s, d0], [-0.1 * s, d0 + 0.1 * s], [-0.03 * s, d0 + 0.18 * s], [0.1 * s, d0 + 0.18 * s], [0.15 * s, d0 + 0.06 * s], [0.15 * s, d0]];
const P_BAR = (w, d0, d1) => [[-w / 2, d0], [-w / 2, d1 - 0.05], [-w / 2 + 0.05, d1], [w / 2 - 0.05, d1], [w / 2, d1 - 0.05], [w / 2, d0]];
const P_COPE = (dB, dF) => [[-0.14, dB], [-0.14, dF], [0.14, dF + 0.04], [0.26, dF - 0.06], [0.26, dB]];

function lathe(pr, u, d, v0, mat = M.stone, seg = 8) {
  put(new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y)), seg).translate(u, v0, d), mat);
}
// Detached shaft: moulded base, shaft, bell capital. v0..v1 includes base and capital.
const shaftPr = (r, H) => [[0, 0], [r * 1.7, 0], [r * 1.7, 0.1], [r * 1.4, 0.15], [r * 1.5, 0.22], [r, 0.3], [r, H - 0.34],
  [r * 1.3, H - 0.3], [r * 1.25, H - 0.24], [r * 1.9, H - 0.1], [r * 2.0, H - 0.1], [r * 2.0, H], [0, H]];
const shaft = (u, d, v0, v1, r = 0.085, mat = M.stone, seg = 8) => lathe(shaftPr(r, v1 - v0), u, d, v0, mat, seg);
const knob = (u, v, d, r = 0.13, mat = M.stone) => put(new THREE.IcosahedronGeometry(r, 0).translate(u, v, d), mat);
const finial = (u, d, v0, s = 1, mat = M.stone) =>
  lathe([[0, 0], [0.16 * s, 0], [0.2 * s, 0.18 * s], [0.1 * s, 0.32 * s], [0.24 * s, 0.5 * s], [0.07 * s, 0.82 * s], [0, 0.95 * s]], u, d, v0, mat);
// Octagonal prism/frustum (flats facing the frame axes) and pyramids, local frame.
function oct(cu, cd, ap, v0, v1, mat = M.stone, apTop = ap) {
  const k = 1 / Math.cos(PI / 8);
  put(new THREE.CylinderGeometry(apTop * k, ap * k, v1 - v0, 8).rotateY(PI / 8).translate(cu, (v0 + v1) / 2, cd), mat);
}
function spire(cu, cd, half, v0, v1, sides = 4, mat = M.stone) {
  const R = sides === 4 ? half * Math.SQRT2 : half / Math.cos(PI / sides);
  put(new THREE.ConeGeometry(R, v1 - v0, sides).rotateY(PI / sides).translate(cu, (v0 + v1) / 2, cd), mat);
}
// Crockets along a straight rake, offset a outwards.
function crockets(p0, p1, step, a, d, r = 0.13) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  for (let s = step * 0.7; s < L - step * 0.4; s += step) knob(p0[0] + dx * s / L + nx * a, p0[1] + dy * s / L + ny * a, d, r);
}
// Foiled circle (tracery rondel): ring bar plus k foils inside.
function rondel(cu, cv, r, w, d0, d1, foils = 4, rot = 0) {
  sweep(circlePath(cu, cv, r, 28), P_BAR(w, d0, d1), M.stone, true);
  if (!foils) return;
  const fr = r * (foils === 3 ? 0.42 : foils === 4 ? 0.36 : 0.25), off = r - w / 2 - fr;
  for (let i = 0; i < foils; i++) {
    const t = rot + 2 * PI * i / foils;
    sweep(circlePath(cu + off * Math.cos(t), cv + off * Math.sin(t), fr, 14), P_BAR(w * 0.6, d0, d1 - 0.03), M.stone, true);
  }
}
// Run fn with a temporary frame.
function inFrame(m, fn) { const old = F; F = m; fn(); F = old; }
// Square pinnacle: shaft with corner shafts, band, gablets on four faces, crocketed spire, finial (local frame).
function pinnacle(cu, cd, half, v0, vT, tip, mat = M.stone) {
  lbox(cu - half, cu + half, v0, vT, cd - half, cd + half, mat);
  for (const su of [-1, 1]) for (const sd of [-1, 1]) shaft(cu + su * half, cd + sd * half, v0, vT, 0.07, mat, 6);
  lbox(cu - half - 0.1, cu + half + 0.1, vT, vT + 0.18, cd - half - 0.1, cd + half + 0.1, mat);
  const g0 = vT + 0.18, gh = half * 1.3;
  for (const s of [-1, 1]) {
    // gablets facing +-d and +-u
    slab([[cu - half, g0], [cu + half, g0], [cu, g0 + gh]], cd + s * half - 0.08, cd + s * half + 0.06, mat);
    const g = new THREE.ExtrudeGeometry(shape([[-half, g0], [half, g0], [0, g0 + gh]]), {depth: 0.14, bevelEnabled: false})
      .translate(0, 0, -0.08).rotateY(PI / 2).translate(cu + s * half, 0, cd);
    put(g, mat);
    knob(cu + s * half * 0.0, g0 + gh + 0.08, cd + s * (half - 0.01), 0.09, mat);
    knob(cu + s * (half - 0.01), g0 + gh + 0.08, cd, 0.09, mat);
  }
  spire(cu, cd, half * 0.92, g0, tip - 0.45, 4, mat);
  const h = tip - 0.45 - g0;
  for (let k = 1; k <= 3; k++) {
    const t = k / 4.2, y = g0 + h * t, o = half * 0.92 * (1 - t) + 0.07;
    for (const su of [-1, 1]) for (const sd of [-1, 1]) knob(cu + su * o, y, cd + sd * o, 0.08, mat);
  }
  finial(cu, cd, tip - 0.5, 0.6, mat);
}

// ---------------- Grimthorpe west front ----------------
// A porch: gabled front slab with the arch cut through, n receding moulded orders, rolls on every arris,
// detached shafts in the jamb angles, hood mould with stops, crocketed gable coping, tracery rondels, inner doorway.
function porch(o) {
  const {cu, hO, n, step, sd, apexArch, W, eave, apex, back, door, roofTo, hip} = o;
  const hI = hO - (n - 1) * step, RI = 2 * hI, R = h => RI + (h - hI);
  const ys = apexArch - rise(hO, R(hO));
  const hs = Array.from({length: n}, (_, j) => hO - j * step);
  // front slab with gable
  slab(notched(cu - W, cu + W, 0, [opening(cu, hO, R(hO), ys, 0)], [[cu + W, eave], [cu, apex], [cu - W, eave]]), -0.6, 0);
  for (let j = 1; j < n; j++) ring(cu, hs[j - 1] + 0.03, R(hs[j - 1] + 0.03), hs[j], R(hs[j]), ys, 0, -(j + 1) * sd, -j * sd);
  // the porch body behind the orders, with the innermost opening running through as a vault
  slab(notched(cu - W, cu + W, 0, [opening(cu, hI, RI, ys, 0)], [[cu + W, eave], [cu - W, eave]]), -back, -n * sd);
  for (let j = 0; j < n; j++) {
    sweep(archPts(cu, ys, hs[j], R(hs[j]), 10), circ(0.03, -j * sd - 0.03, 0.08), M.stone, false, true);
    if (j > 0) for (const s of [-1, 1]) shaft(cu + s * (hs[j - 1] - 0.095), -j * sd + 0.095, 0.5, ys, 0.085);
  }
  for (const s of [-1, 1]) {
    // bench plinth and impost band across the jamb
    lbox(Math.min(cu + s * (hI - 0.05), cu + s * (W + 0.1)), Math.max(cu + s * (hI - 0.05), cu + s * (W + 0.1)), 0, 0.5, -n * sd - 0.1, 0.14);
    lbox(Math.min(cu + s * (hI - 0.06), cu + s * (hO + 0.1)), Math.max(cu + s * (hI - 0.06), cu + s * (hO + 0.1)), ys - 0.02, ys + 0.12, -n * sd - 0.05, 0.06);
    knob(cu + s * (hO + 0.2), ys + 0.05, 0.16, 0.15);                                         // hood stop
  }
  sweep(archPts(cu, ys, hO + 0.12, R(hO + 0.12), 12), P_HOOD(1.25, 0));
  // gable: coping, crockets, finial
  const L = [cu - W - 0.1, eave - 0.1], A = [cu, apex + 0.05], Rr = [cu + W + 0.1, eave - 0.1];
  sweep([L, A, Rr], P_COPE(-0.62, 0.1));
  crockets(L, A, 0.62, 0.34, -0.2); crockets(A, Rr, 0.62, 0.34, -0.2);
  lbox(cu - 0.2, cu + 0.2, apex, apex + 0.35, -0.45, -0.1);
  finial(cu, -0.27, apex + 0.3, o.finial || 1);
  for (const r of o.rondels || []) rondel(cu + r[0], r[1], r[2], 0.15, 0, 0.13, r[3] || 4, PI / 4);
  // roof behind the gable (lead), hipped back for the central porch so it does not shade the west window
  const dA = -0.5, e = eave - 0.02, t = apex - 0.25, Wl = W + 0.05;
  const q = [];
  const quad = (a, b, c, d) => q.push(a, b, c, a, c, d, a, c, b, a, d, c);
  quad([cu - Wl, e, dA], [cu - Wl, e, roofTo], [cu, t, roofTo], [cu, t, dA]);
  quad([cu + Wl, e, dA], [cu, t, dA], [cu, t, roofTo], [cu + Wl, e, roofTo]);
  if (hip) for (const s of [-1, 1]) q.push([cu + s * Wl, e, roofTo], [cu, t, roofTo], [cu, e, hip], [cu + s * Wl, e, roofTo], [cu, e, hip], [cu, t, roofTo]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(q.flat(), 3));
  put(g, M.lead);
  // inner doorway at the back of the porch: stone tympanum with the door(s) cut out, timber leaves, trumeau
  const dd = door, doors = dd.map(([c, h, y]) => opening(cu + c, h, 2 * h, y, 0));
  slab(notched(cu - hI, cu + hI, 0, doors, archPts(cu, ys, hI, RI).reverse()), -back + 0.12, -back + 0.32);
  for (const dpts of doors) slab(dpts, -back, -back + 0.12, M.timber, [], false);
  for (const [c, h, y] of dd) sweep(archPts(cu + c, y, h, 2 * h, 8), circ(0.02, -back + 0.32, 0.06, 5), M.stone, false, true);
  if (dd.length === 2) { shaft(cu, -back + 0.5, 0, dd[0][2], 0.14); rondel(cu, ys + rise(hI, RI) * 0.45, 0.42, 0.12, -back + 0.32, -back + 0.44, 4); }
}

// Blind arcade tier on a wall face (skin with arch recesses, detached shafts on every pier, arris rolls, optional slit lights).
function arcade(u0, u1, n, v0, vTop, ys, dFace, depth = 0.3, lights = 0) {
  const pitch = (u1 - u0) / n, h = pitch / 2 - 0.11, R = 2 * h, sill = v0 + 0.2, holes = [];
  for (let i = 0; i < n; i++) holes.push(opening(u0 + pitch * (i + 0.5), h, R, ys, sill, 6));
  slab(rect(u0, u1, v0, vTop), dFace - depth, dFace, M.stone, holes);
  for (let i = 0; i < n; i++) {
    const c = u0 + pitch * (i + 0.5);
    sweep(archPts(c, ys, h, R, 6), circ(0.02, dFace - 0.02, 0.05, 5), M.stone, false, true);
    // trefoil cusping in the head
    const cv = ys + rise(h, R) * 0.35;
    for (const s of [-1, 1]) knob(c + s * h * 0.78, cv, dFace - depth + 0.05, 0.07);
    if (lights && i % lights === Math.floor(lights / 2)) flat(opening(c, 0.13, 0.26, ys - 0.15, sill + 0.35, 4), dFace - depth + 0.012);
  }
  for (let i = 0; i <= n; i++) {
    const u = Math.min(u1 - 0.12, Math.max(u0 + 0.12, u0 + pitch * i));
    shaft(u, dFace + 0.06, sill, ys, 0.07, M.stone, 6);
  }
}
const string = (u0, u1, v, d0, s = 1.2) => sweep([[u0, v], [u1, v]], P_HOOD(s, d0));

// Octagonal stair turret with a lancet lantern and stone spirelet (world centre cx, cz).
function turret(cx, cz, ap, outward) {
  inFrame(frame(cx, cz, 1, 0), () => {   // axis-aligned local frame centred on the turret: u = x, d = z
    oct(0, 0, ap + 0.25, 0, 0.75); oct(0, 0, ap, 0.75, 1.05, M.stone, ap); oct(0, 0, ap, 1.05, 15.25);
    for (const v of [7.5, 10.25, 14.3]) oct(0, 0, ap + 0.11, v, v + 0.22);
    oct(0, 0, ap + 0.15, 15.25, 15.65, M.stone, ap + 0.2);
    oct(0, 0, ap - 0.05, 15.65, 17.6);
    oct(0, 0, ap - 0.55, 17.6, 21.2, M.glass);                   // dark core seen through the lantern
    oct(0, 0, ap + 0.1, 17.45, 17.65);
    oct(0, 0, ap + 0.1, 21.2, 21.6, M.stone, ap + 0.18);
    put(new THREE.CylinderGeometry(0, (ap - 0.1) / Math.cos(PI / 8), 6.4, 8).rotateY(PI / 8).translate(0, 21.6 + 3.2, 0), M.stone);
    for (const v of [23.5, 25.4]) { const a = (ap - 0.1) * (1 - (v - 21.6) / 6.4) + 0.06; oct(0, 0, a, v, v + 0.16, M.stone, a - 0.03); }
    finial(0, 0, 27.9, 0.9);
    const cr = (ap - 0.05) / Math.cos(PI / 8);
    for (let k = 0; k < 8; k++) { const t = PI / 8 + k * PI / 4; shaft(cr * 0.97 * Math.cos(t), cr * 0.97 * Math.sin(t), 17.65, 20.2, 0.09, M.stone, 6); }
  });
  // per face: lantern lancets, gablets, slit lights on the outward faces
  for (let k = 0; k < 8; k++) {
    const t = k * PI / 4, nx = Math.cos(t), nz = Math.sin(t);
    inFrame(faceFrame(cx + nx * (ap - 0.05), cz + nz * (ap - 0.05), nx, nz), () => {
      const ws = (ap - 0.05) * Math.tan(PI / 8);
      slab(rect(-ws, ws, 17.65, 21.2), -0.45, 0, M.stone, [opening(0, 0.36, 0.72, 20.15, 17.95, 6)]);
      sweep(archPts(0, 20.15, 0.36, 0.72, 6), circ(0.02, -0.02, 0.05, 5), M.stone, false, true);
      sweep(archPts(0, 20.15, 0.48, 0.84, 6), P_HOOD(0.8, 0));
      slab([[-ws - 0.02, 21.6], [ws + 0.02, 21.6], [0, 22.75]], -0.35, 0.15);
      knob(0, 22.85, -0.1, 0.09);
      if (outward > 0 ? k >= 2 && k <= 4 : k >= 4 && k <= 6)
        for (const v of [3.4, 11.2]) { flat(opening(0, 0.11, 0.11, v + 0.9, v, 3), 0.06); lbox(-0.22, 0.22, v + 1.05, v + 1.15, 0, 0.1); }
    });
  }
}

export function buildWestFront() {
  part('west-front', 1880, 9999, {label: 'Grimthorpe west front'});
  BS = batch(); BN = batch(); TRIS = 0;
  F = frame(0, 0, 0, 1);   // facing west: u = z (south to the right), d = -x

  // ---- nave west wall with the great west window ----
  const WY = 14.42, WS = 9.0;                          // springing, sill; clear opening 7.6 m, apex 21.0
  const RW = h => 7.6 + (h - 3.8), hsW = [4.55, 4.30, 4.05, 3.80];
  slab(rect(-5.75, 5.75, 0, 23.6), -5.6, -4.6, M.stone, [opening(0, 4.55, RW(4.55), WY, WS, 12)]);
  for (let j = 1; j < 4; j++) ring(0, hsW[j - 1] + 0.02, RW(hsW[j - 1] + 0.02), hsW[j], RW(hsW[j]), WY, WS, -5.6, -4.6 - 0.25 * j);
  for (let j = 0; j < 4; j++) {
    sweep(archPts(0, WY, hsW[j], RW(hsW[j]), 14), circ(0.03, -4.6 - 0.25 * j - 0.03, 0.08), M.stone, false, true);
    if (j > 0) for (const s of [-1, 1]) shaft(s * (hsW[j - 1] - 0.095), -4.6 - 0.25 * j + 0.095, WS, WY, 0.08);
  }
  sweep(archPts(0, WY, 4.67, RW(4.67), 16), P_HOOD(1.3, -4.6));
  for (const s of [-1, 1]) knob(s * 4.85, WY - 0.05, -4.4, 0.18);
  dbox(-4.7, 4.7, 8.55, 9.0, -5.6, -4.2, -4.6);                      // weathered sill
  // tracery: 8 lights in two sub-arches of two pairs; big foiled circle, circles in the sub-arch heads
  const TD0 = -5.45, TD1 = -5.15;
  for (const [u, w] of [[0, 0.26], [-1.9, 0.22], [1.9, 0.22], [-0.95, 0.16], [0.95, 0.16], [-2.85, 0.16], [2.85, 0.16]])
    lbox(u - w / 2, u + w / 2, WS, WY, TD0, TD1);
  for (const c of [-1.9, 1.9]) sweep(archPts(c, WY, 1.9, 3.8, 12), P_BAR(0.22, TD0, TD1));
  for (const c of [-2.85, -0.95, 0.95, 2.85]) sweep(archPts(c, WY, 0.95, 1.9, 8), P_BAR(0.18, TD0, TD1));
  for (const c of [-3.325, -2.375, -1.425, -0.475, 0.475, 1.425, 2.375, 3.325]) {
    sweep(archPts(c, WY, 0.475, 0.95, 6), P_BAR(0.14, TD0, TD1 - 0.04));
    for (const s of [-1, 1]) knob(c + s * 0.3, WY + 0.5, TD1 - 0.12, 0.06);          // cusps
  }
  rondel(0, 18.67, 1.9, 0.24, TD0, TD1, 0);
  rondel(0, 18.67, 0.55, 0.16, TD0, TD1, 0);
  for (let i = 0; i < 12; i++) {
    const t = i * PI / 6;
    sweep(circlePath(1.4 * Math.cos(t), 18.67 + 1.4 * Math.sin(t), 0.34, 12), P_BAR(0.1, TD0, TD1 - 0.04), M.stone, true);
    const a = t + PI / 12;
    sweep([[0.6 * Math.cos(a), 18.67 + 0.6 * Math.sin(a)], [1.72 * Math.cos(a), 18.67 + 1.72 * Math.sin(a)]], P_BAR(0.1, TD0, TD1 - 0.04));
  }
  for (const c of [-1.9, 1.9]) rondel(c, 16.545, 0.95, 0.18, TD0, TD1, 4, PI / 4);
  for (const c of [-2.85, -0.95, 0.95, 2.85]) rondel(c, 15.48, 0.475, 0.13, TD0, TD1, 3, PI / 2);
  flat(opening(0, 3.8, 7.6, WY, WS, 14), -5.56);

  // ---- frieze of blind arches above the window, then the gable ----
  string(-5.75, 5.75, 22.3, -4.6, 1.2);
  {
    const n = 11, p = 11.5 / n, holes = [];
    for (let i = 0; i < n; i++) holes.push(opening(-5.75 + p * (i + 0.5), p / 2 - 0.1, p - 0.2, 22.95, 22.5, 5));
    slab(rect(-5.75, 5.75, 22.42, 23.5), -4.6, -4.38, M.stone, holes);
    for (let i = 1; i < n; i++) shaft(-5.75 + p * i, -4.32, 22.5, 22.95, 0.05, M.stone, 5);
  }
  string(-5.9, 5.9, 23.6, -4.38, 1.1);
  const GE = 23.6, GA = 30.6, GW = 5.8, gy = u => GA - Math.abs(u) * (GA - GE) / GW;
  slab([[-GW, GE], [GW, GE], [0, GA]], -5.6, -4.6);
  {
    const L = [[-2.3, 26.9], [-1.15, 28.2], [0, 29.4], [1.15, 28.2], [2.3, 26.9]], holes = [];
    for (const [u, top] of L) holes.push(opening(u, 0.4, 0.8, top - rise(0.4, 0.8), 24.4, 6));
    slab([[-GW + 0.35, GE + 0.05], [GW - 0.35, GE + 0.05], [0, GA - 0.45]], -4.6, -4.32, M.stone, holes);
    for (const [u, top] of L) {
      const ys = top - rise(0.4, 0.8);
      sweep(archPts(u, ys, 0.4, 0.8, 6), circ(0.02, -4.34, 0.05, 5), M.stone, false, true);
      if (Math.abs(u) < 1.5) flat(opening(u, 0.2, 0.4, ys - 0.1, 24.7, 5), -4.585);
    }
    for (const u of [-2.875, -1.725, -0.575, 0.575, 1.725, 2.875]) {
      const near = L.filter(l => Math.abs(l[0] - u) < 0.7).map(l => l[1] - rise(0.4, 0.8));
      shaft(u, -4.26, 24.4, Math.min(...near), 0.07, M.stone, 6);
    }
  }
  sweep([[-GW - 0.1, GE - 0.1], [0, GA + 0.05], [GW + 0.1, GE - 0.1]], P_COPE(-5.7, -4.45));
  crockets([-GW, GE], [0, GA], 0.7, 0.4, -5.0, 0.15); crockets([0, GA], [GW, GE], 0.7, 0.4, -5.0, 0.15);
  // apex cross with ring
  lbox(-0.3, 0.3, GA - 0.1, GA + 0.45, -5.35, -4.85);
  lbox(-0.11, 0.11, GA + 0.45, GA + 2.2, -5.21, -4.99);
  lbox(-0.6, 0.6, GA + 1.42, GA + 1.64, -5.21, -4.99);
  sweep(circlePath(0, GA + 1.53, 0.38, 16), circ(0, -5.1, 0.065, 4), M.stone, true, true);

  // ---- the two great buttresses at the nave wall lines, with set-offs and gabled pinnacles ----
  for (const s of [-1, 1]) {
    const ua = s < 0 ? -7.9 : 5.7, ub = ua + 2.2;
    lbox(ua - 0.12, ub + 0.12, 0, 0.75, -5.6, 0.5);                                   // plinth
    dbox(ua - 0.12, ub + 0.12, 0.75, 0.95, -5.6, 0.5, 0.35);
    lbox(ua, ub, 0.95, 9.6, -5.6, 0.35);
    dbox(ua, ub, 9.6, 10.4, -5.6, 0.35, -0.45);
    lbox(ua + 0.1, ub - 0.1, 10.4, 15.8, -5.6, -0.45);
    dbox(ua + 0.1, ub - 0.1, 15.8, 16.5, -5.6, -0.45, -1.25);
    lbox(ua + 0.2, ub - 0.2, 16.5, 21.6, -5.6, -1.25);
    dbox(ua + 0.2, ub - 0.2, 21.6, 22.2, -5.6, -1.25, -2.05);
    for (const v of [5.0, 13.0, 19.0]) {                                               // string courses wrap the front
      const f = v < 9.6 ? 0.35 : v < 15.8 ? -0.45 : -1.25, inset = v < 9.6 ? 0 : v < 15.8 ? 0.1 : 0.2;
      sweep([[ua + inset, v], [ub - inset, v]], P_HOOD(1.1, f));
    }
    // blind lancet panel on the front of the middle stage
    slab(rect(ua + 0.35, ub - 0.35, 10.9, 15.3), -0.45, -0.3, M.stone, [opening((ua + ub) / 2, 0.42, 0.84, 14.1, 11.2, 6)]);
    pinnacle((ua + ub) / 2, -3.0, 0.88, 22.2, 23.9, 26.6);
  }

  // ---- central porch, its flanking screens and corner pinnacles ----
  porch({cu: 0, hO: 3.1, n: 5, step: 0.2, sd: 0.22, apexArch: 8.4, W: 3.9, eave: 8.6, apex: 12.8, back: 4.6,
    roofTo: -1.9, hip: -3.8, door: [[-1.12, 0.95, 2.6], [1.12, 0.95, 2.6]], finial: 1.2,
    rondels: [[0, 10.35, 0.78, 4], [-1.25, 9.2, 0.38, 3], [1.25, 9.2, 0.38, 3]]});
  for (const s of [-1, 1]) {
    const u0 = s < 0 ? -5.7 : 3.9, u1 = u0 + 1.8, c = (u0 + u1) / 2;
    slab(rect(u0, u1, 0, 7.9), -0.95, -0.6, M.stone, [opening(c, 0.5, 1.0, 5.4, 1.4, 6)]);
    lbox(u0, u1, 0, 7.9, -4.6, -0.95);
    sweep(archPts(c, 5.4, 0.5, 1.0, 6), circ(0.02, -0.62, 0.05, 5), M.stone, false, true);
    shaft(c - s * 0.0 - 0.5 + 0.0, -0.55, 1.4, 5.4, 0.07, M.stone, 6); shaft(c + 0.5, -0.55, 1.4, 5.4, 0.07, M.stone, 6);
    lbox(u0 - 0.05, u1 + 0.05, 7.9, 8.15, -4.6, -0.5);
    rondel(c, 6.95, 0.3, 0.1, -0.6, -0.5, 3, PI / 2);
    // slender buttress at the porch corner, rising to an octagonal pinnacle
    const pu = s * 3.98;
    lbox(pu - 0.32, pu + 0.32, 0, 8.7, -0.7, 0.32);
    dbox(pu - 0.32, pu + 0.32, 3.2, 3.6, -0.7, 0.32, 0.12);
    oct(pu, -0.2, 0.3, 8.7, 10.5); oct(pu, -0.2, 0.36, 10.5, 10.7);
    spire(pu, -0.2, 0.3, 10.7, 12.1, 8);
    finial(pu, -0.2, 12.05, 0.55);
  }

  // ---- aisle wings: side porches, two tiers of blind arcading, parapet; octagonal stair turrets ----
  const WINGS = [{s: -1, uOut: -13.8, uIn: -7.9, aOut: -12.0, n: 6, cu: -9.7, tz: -13.8},
                 {s: 1, uOut: 13.0, uIn: 7.9, aOut: 11.3, n: 5, cu: 9.45, tz: 13.0}];
  for (const w of WINGS) {
    const uL = Math.min(w.uOut, w.uIn), uR = Math.max(w.uOut, w.uIn), aL = Math.min(w.aOut, w.uIn), aR = Math.max(w.aOut, w.uIn);
    const hO = 1.9, n = 3, step = 0.22, hI = hO - (n - 1) * step, ys = 6.4 - rise(hO, 2 * hI + (hO - hI));
    slab(notched(uL, uR, 0, [opening(w.cu, hI, 2 * hI, ys, 0)], [[uR, 7.6], [uL, 7.6]]), -2.4, -1.0);
    lbox(uL, uR, 0, 7.6, -5.6, -2.4);
    lbox(uL, uR, 7.6, 14.45, -5.6, -1.3);
    lbox(uL, uR, 0, 0.7, -1.0, -0.82); dbox(uL, uR, 0.7, 0.9, -1.0, -0.82, -1.0);
    porch({cu: w.cu, hO, n, step, sd: 0.22, apexArch: 6.4, W: 2.25, eave: 6.6, apex: 9.6, back: 2.4,
      roofTo: -1.05, door: [[0, 1.1, 2.3]], rondels: [[0, 7.85, 0.55, 4]]});
    arcade(aL, aR, w.n, 7.65, 10.3, 9.45, -1.0, 0.3, 0);
    arcade(aL, aR, w.n, 10.45, 14.35, 13.3, -1.0, 0.3, 2);
    string(aL, aR, 7.6, -1.0); string(aL, aR, 10.38, -1.0); string(aL, aR, 14.42, -1.0, 1.3);
    lbox(aL, aR, 14.45, 15.2, -1.5, -0.95);
    for (let u = aL + 0.25; u < aR - 0.1; u += 0.42) lbox(u - 0.07, u + 0.07, 14.3, 14.45, -1.0, -0.88);   // corbel table
    lbox(aL - 0.05, aR + 0.05, 15.2, 15.38, -1.58, -0.88);
    turret(1.6, w.tz, 1.75, w.s);
  }

  BS.done({threshold: 35});
  BN.done({edges: false});
  F = WORLD;
  if (typeof location !== 'undefined' && location.search.includes('facadestats')) console.info('facade west-front tris', Math.round(TRIS));
}

// ---------------- Norman crossing tower (Roman brick) ----------------
// One face of the tower, in its face frame: d = 0 on the lower-stage face, hw = half the face width.
function towerFace(hw) {
  const B = M.brick, inner = hw - 1.65, innerB = hw - 1.6;
  // stage 2: lantern, two wide round-headed lights flanking the roof ridge
  slab(rect(-inner, inner, 24.4, 31.9), 0, 0.25, B, [-2.65, 2.65].map(u => opening(u, 1.45, 1.45, 28.25, 25.9, 8)));
  for (const u of [-2.65, 2.65]) {
    ring(u, 1.47, 1.47, 1.15, 1.15, 28.25, 25.9, 0, 0.13, B);
    flat(opening(u, 1.15, 1.15, 28.25, 25.9, 8), 0.012);
    sweep(archPts(u, 28.25, 1.45, 1.45, 8), circ(0.02, 0.23, 0.07, 5), B, false, true);
    dbox(u - 1.55, u + 1.55, 25.55, 25.9, 0, 0.36, 0.25, B);
  }
  string(-inner, inner, 24.4, 0, 1.1);
  lbox(-0.45, 0.45, 18, 31.9, 0, 0.42, B);                                     // mid-face pilaster
  string(-inner, inner, 31.9, 0.25, 1.3);
  // stage 3: ringing-room arcade, 4 arches per face, each split in two on a little column
  const c2 = Math.min(4.15, inner - 1.15), cs = [-c2, -1.7, 1.7, c2];
  slab(rect(-inner, inner, 31.9, 35.0), -0.15, 0.1, B, cs.map(c => opening(c, 1.0, 1.0, 33.55, 32.2, 8)));
  for (const c of cs) {
    const subs = [opening(c - 0.5, 0.42, 0.42, 33.3, 32.2, 6), opening(c + 0.5, 0.42, 0.42, 33.3, 32.2, 6)];
    slab(notched(c - 1.02, c + 1.02, 32.2, subs, archPts(c, 33.55, 1.02, 1.02).reverse()), -0.15, -0.04, B);
    for (const sp of subs) flat(sp, -0.138);
    shaft(c, -0.02, 32.2, 33.3, 0.075, B, 6);
    sweep(archPts(c, 33.55, 1.0, 1.0, 8), circ(0.02, 0.08, 0.05, 5), B, false, true);
  }
  lbox(-0.4, 0.4, 31.9, 35.0, -0.15, 0.22, B);
  string(-inner, inner, 35.0, 0.1, 1.2);
  // stage 4: belfry, two big double openings under enclosing arches, louvres, tympana pierced with triangles
  slab(rect(-innerB, innerB, 35.0, 42.45), -0.3, -0.05, B, [-2.95, 2.95].map(c => opening(c, 2.0, 2.0, 40.2, 35.5, 10)));
  for (const c of [-2.95, 2.95]) {
    ring(c, 2.02, 2.02, 1.78, 1.78, 40.2, 35.5, -0.3, -0.17, B);
    sweep(archPts(c, 40.2, 2.0, 2.0, 10), circ(0.02, -0.07, 0.07, 5), B, false, true);
    sweep(archPts(c, 40.2, 1.78, 1.78, 10), circ(0.02, -0.19, 0.06, 5), B, false, true);
    sweep(archPts(c, 40.2, 2.15, 2.15, 10), P_HOOD(1.0, -0.05), B);
    for (const s of [-1, 1]) shaft(c + s * 1.9, -0.17 + 0.09, 35.5, 40.2, 0.08, B, 6);
    const lights = [opening(c - 0.85, 0.66, 0.66, 38.7, 35.5, 6), opening(c + 0.85, 0.66, 0.66, 38.7, 35.5, 6)], tri = [];
    const rowT = (v0, ks) => ks.forEach((k, i) => {
      const u = c + k * 0.42, up = i % 2 === 0;
      tri.push(up ? [[u - 0.15, v0], [u + 0.15, v0], [u, v0 + 0.3]] : [[u - 0.15, v0 + 0.3], [u, v0], [u + 0.15, v0 + 0.3]]);
    });
    rowT(39.55, [-3, -2, -1, 0, 1, 2, 3]); rowT(40.15, [-2, -1, 0, 1, 2]); rowT(40.75, [-1, 0, 1]);
    slab(notched(c - 1.8, c + 1.8, 35.5, lights, archPts(c, 40.2, 1.8, 1.8).reverse()), -0.3, -0.21, B, tri);
    flat(opening(c, 1.8, 1.8, 40.2, 35.5, 10), -0.295);
    for (const lc of [c - 0.85, c + 0.85]) {
      sweep(archPts(lc, 38.7, 0.66, 0.66, 6), circ(0.02, -0.22, 0.045, 5), B, false, true);
      for (let v = 35.75; v < 38.6; v += 0.34) put(new THREE.BoxGeometry(1.3, 0.035, 0.22).rotateX(0.55).translate(lc, v, -0.255), M.timber, false);
    }
    shaft(c, -0.2, 35.5, 38.7, 0.12, B, 8);
    dbox(c - 2.1, c + 2.1, 35.15, 35.5, -0.3, 0.06, -0.05, B);
  }
  for (const s of [-1, 1]) shaft(s * 0.3, -0.05 + 0.12, 35.0, 42.35, 0.19, B, 8);   // paired half-round shafts
  // stage 5: corbel table, embattled brick parapet
  for (let u = -innerB + 0.3; u < innerB - 0.2; u += 0.55) lbox(u - 0.11, u + 0.11, 42.42, 42.72, -0.3, -0.04, B);
  const pi = hw - 1.45;
  lbox(-pi, pi, 42.72, 43.45, -0.75, 0.02, B);
  const nm = Math.floor((2 * pi + 0.55) / 1.35), sp = (2 * pi - 0.8) / (nm - 1);
  for (let k = 0; k < nm; k++) {
    const u = -pi + 0.4 + k * sp;
    lbox(u - 0.4, u + 0.4, 43.45, 43.95, -0.75, 0.02, B);
    lbox(u - 0.45, u + 0.45, 43.95, 44.05, -0.8, 0.07, M.stone);
  }
}

export function buildTowerDetail(T) {
  BS = batch(); BN = batch(); TRIS = 0;
  const cx = (T.x0 + T.x1) / 2, hx = (T.x1 - T.x0) / 2;
  for (const [nx, nz, hw] of [[0, 1, hx], [0, -1, hx], [1, 0, T.z], [-1, 0, T.z]]) {
    F = faceFrame(nx ? (nx > 0 ? T.x1 : T.x0) : cx, nz * T.z, nx, nz);
    towerFace(hw);
  }
  // corners: flat pilaster buttresses to 35 m, then round angle turrets with their own battlements
  F = WORLD;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = cx + sx * (hx - 0.65), pz = sz * (T.z - 0.65);
    lbox(px - 1.0, px + 1.0, 18, 35.0, pz - 1.0, pz + 1.0, M.brick);
    lbox(px - 1.08, px + 1.08, 24.3, 24.5, pz - 1.08, pz + 1.08, M.brick);
    lbox(px - 1.08, px + 1.08, 31.8, 32.02, pz - 1.08, pz + 1.08, M.brick);
    lathe([[0, 0], [1.1, 0], [1.1, 0.25], [1.0, 0.45], [1.0, 3.85], [1.09, 3.9], [1.09, 4.05], [1.0, 4.1], [1.0, 7.65],
      [1.1, 7.7], [1.1, 8.45], [0, 8.45]], px, pz, 35.0, M.brick, 14);
    for (let k = 0; k < 6; k++) {
      const a = k * PI / 3 + PI / 6;
      put(new THREE.BoxGeometry(0.6, 0.55, 0.3).translate(0, 43.72, 0.92).rotateY(a).translate(px, 0, pz), M.brick);
    }
    const a = Math.atan2(sz, sx), nx = Math.cos(a), nz = Math.sin(a);
    inFrame(faceFrame(px + nx * 1.0, pz + nz * 1.0, nx, nz), () => {
      for (const v of [36.3, 39.6]) flat(opening(0, 0.13, 0.13, v + 0.75, v, 3), 0.02);
    });
  }
  BS.done({threshold: 35});
  BN.done({edges: false});
  if (typeof location !== 'undefined' && location.search.includes('facadestats')) console.info('facade tower tris', Math.round(TRIS));
}
