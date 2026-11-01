// HK Swept Path · raster helpers (page + worker): distance transform, obstacle detection, polygon fill, contours.

const INF = 1e20;
// 1-D squared distance transform (Felzenszwalb & Huttenlocher 2012).
function dt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const t = q - v[k]; d[q] = t * t + f[v[k]]; }
}
// Euclidean distance (in cells) from every cell to the nearest cell where mask == 1.
export function edt(mask, w, h) {
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? 0 : INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    dt1(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) f[x] = g[o + x];
    dt1(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[o + x] = Math.sqrt(d[x]);
  }
  return g;
}

// Dark-pixel mask from RGBA image data, then a morphological opening of radius rpx (removes strokes thinner
// than 2*rpx: text, dimension lines, bay lines), returned at the image resolution.
export function darkMask(img, thr) {
  const { data, width: w, height: h } = img, m = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < m.length; i++, j += 4) {
    const a = data[j + 3] / 255, lum = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) * a + 255 * (1 - a);
    m[i] = lum < thr ? 1 : 0;
  }
  return m;
}
export function opening(m, w, h, rpx) {
  if (rpx < 0.5) return m;
  const inv = new Uint8Array(w * h); for (let i = 0; i < inv.length; i++) inv[i] = m[i] ? 0 : 1;
  const dIn = edt(inv, w, h);                         // distance to background
  const er = new Uint8Array(w * h); for (let i = 0; i < er.length; i++) er[i] = dIn[i] > rpx ? 1 : 0;
  const dEr = edt(er, w, h);
  const out = new Uint8Array(w * h); for (let i = 0; i < out.length; i++) out[i] = dEr[i] <= rpx + 0.5 ? 1 : 0;
  return out;
}
// Small filled symbols (aisle direction arrows, arrowheads, bold note glyphs) are not structure. A separate dark blob is
// dropped when ALL hold: area <= maxA m2; it is neither rectangle-like nor round (its area fills < 70% of its smallest
// enclosing rectangle over 36 orientations: square/rectangular columns ~1.0, round ~0.79, a triangle ~0.5); it is
// compact, not a thin strip (area / inradius^2 < 30); and it has a POINTED END: two long sides of its convex hull meet at
// less than 70 deg (hullMinAngle), or it is under 0.06 m2. Every triangle has a corner of 60 deg or
// less, so arrowheads always have one; L, T, cross, rectangular, polygonal and round columns have none (their hull corners
// are 90 deg or wider), so they stay. Mutates m; returns the dropped blobs (world metres).
export function dropSymbols(m, w, h, s, maxA = 1.5) {
  const lab = new Int32Array(w * h), out = [], maxN = Math.ceil(maxA / (s * s));
  const st = new Int32Array(w * h); let next = 1;
  const CS = []; for (let a = 0; a < 36; a++) { const t = a * Math.PI / 36; CS.push([Math.cos(t), Math.sin(t)]); }
  for (let i0 = 0; i0 < m.length; i0++) {
    if (!m[i0] || lab[i0]) continue;
    const id = next++; let sp = 0, n = 0; st[sp++] = i0; lab[i0] = id;
    const pts = []; let big = false, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (sp) {
      const i = st[--sp], x = i % w, y = (i / w) | 0; n++;
      if (!big) { if (n > maxN) { big = true; pts.length = 0; } else pts.push(i); }
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (m[j] && !lab[j]) { lab[j] = id; st[sp++] = j; }
      }
    }
    if (big || n < 4) continue;
    // smallest enclosing rectangle (a pixel projects to s * (|cos| + |sin|) across)
    let best = Infinity;
    for (const [c, sn] of CS) {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const i of pts) { const x = i % w, y = (i / w) | 0, u = x * c + y * sn, v = -x * sn + y * c; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
      const pw = Math.abs(c) + Math.abs(sn), A = (u1 - u0 + pw) * (v1 - v0 + pw);
      if (A < best) best = A;
    }
    const fill = n / best;
    if (fill >= 0.7) continue;
    // inradius: distance transform of the blob's own box
    const bw = x1 - x0 + 3, bh = y1 - y0 + 3, inv = new Uint8Array(bw * bh).fill(1);
    for (const i of pts) inv[((i / w | 0) - y0 + 1) * bw + (i % w) - x0 + 1] = 0;
    const d = edt(inv, bw, bh); let rin = 0; for (let k = 0; k < d.length; k++) if (d[k] > rin) rin = d[k];
    if (n / (rin * rin) >= 30) continue;
    // below 0.06 m2 (smaller than a 250 x 250 mm column) a blob is too few pixels to read its corners, and a non-rectangular
    // speck that small (hatch-line pile-ups at a hatched area's corners, text) is not structure: dropped as before
    if (n * s * s >= 0.06 && hullMinAngle(pts, w, s, (x, y) => x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === id) >= 70) continue;      // no pointed end: an L / T / irregular column, keep it
    let cx = 0, cy = 0; for (const i of pts) { m[i] = 0; cx += i % w; cy += (i / w) | 0; }
    out.push({ x: (cx / n + 0.5) * s, y: (cy / n + 0.5) * s, area: n * s * s, r: Math.max(x1 - x0 + 1, y1 - y0 + 1) * s / 2 + 0.1 });
  }
  return out;
}

// Sharpest corner (degrees) of a blob's convex hull, read from its LONG sides so that rounded tips (the opening above, or
// the round-joined stroke of a DXF render) and pixel steps do not hide it. Hull of the pixel centres (monotone chain),
// simplified to 1 px (Douglas-Peucker); sides shorter than 0.12 m (at least 3 px) are bends, not sides; the corner
// between two consecutive long sides = 180 - the turn between them. A triangle, rounded or not, has three long sides
// meeting at 60 deg or less somewhere; L / T / rectangular / polygonal columns meet at 90 deg or wider; a round column's
// long chords meet at wide angles. Fewer than 3 long sides: not a pointed shape (returns 180). isIn(x, y) tells whether
// a pixel belongs to the blob (used to skip hull sides that bridge empty space). A tip cut flat counts too: two drawn
// sides with a short drawn side between them (under 40% of either) are measured across it.
function hullMinAngle(pts, w, s, isIn = null) {
  const P = pts.map(i => [i % w, (i / w) | 0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let k = P.length - 1; k >= 0; k--) { const p = P[k]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const H = lo.slice(0, -1).concat(up.slice(0, -1)), n = H.length;
  if (n < 3) return 180;
  // closed Douglas-Peucker at 1 px: split at vertex 0 and the vertex farthest from it
  let far = 0, fd = -1; for (let k = 1; k < n; k++) { const d = Math.hypot(H[k][0] - H[0][0], H[k][1] - H[0][1]); if (d > fd) { fd = d; far = k; } }
  const keep = new Uint8Array(n); keep[0] = keep[far] = 1;
  const dp = (i, j) => {                                // vertices strictly between i and j (cyclic)
    const a = H[i], b = H[j % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let best = -1, bk = -1;
    for (let k = i + 1; k < j; k++) { const q = H[k % n], d = Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / L; if (d > best) { best = d; bk = k; } }
    if (best > 1) { keep[bk % n] = 1; dp(i, bk); dp(bk, j); }
  };
  dp(0, far); dp(far, n);
  const V = H.filter((_, k) => keep[k]), m = V.length, minL = Math.max(0.12 / s, 3);
  // a side is "drawn" when ink runs along >= 60% of it (within 1 px); a side that bridges a notch (the hull across the
  // inside corner of an L, or along an arrow's shaft) is not, and a corner counts only between two drawn sides
  const drawn = (a, b) => { if (!isIn) return true; const L = Math.hypot(b[0] - a[0], b[1] - a[1]), N = Math.max(2, Math.ceil(L)); let hit = 0;
    for (let k = 0; k <= N; k++) { const x = Math.round(a[0] + (b[0] - a[0]) * k / N), y = Math.round(a[1] + (b[1] - a[1]) * k / N); let on = false;
      for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) if (isIn(x + dx, y + dy)) on = true; hit += on; }
    return hit / (N + 1) >= 0.6; };
  const sides = [];                                      // long sides in hull order: direction, drawn or not, length
  for (let k = 0; k < m; k++) { const a = V[k], b = V[(k + 1) % m], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L >= minL) sides.push([Math.atan2(dy, dx), drawn(a, b), L]); }
  const ns = sides.length;
  if (ns < 3) return 180;
  const turn = (p, q) => { let t = Math.abs(q[0] - p[0]) * 180 / Math.PI; return t > 180 ? 360 - t : t; };
  let best = 180;
  for (let k = 0; k < ns; k++) {
    const p = sides[k], q = sides[(k + 1) % ns], r = sides[(k + 2) % ns];
    if (p[1] && q[1] && 180 - turn(p, q) < best) best = 180 - turn(p, q);
    // a tip cut flat (by the opening, or drawn blunt): two drawn sides with one short drawn side between them
    if (ns >= 4 && p[1] && q[1] && r[1] && q[2] < 0.4 * Math.min(p[2], r[2])) { const c = 180 - turn(p, q) - turn(q, r); if (c < best) best = c; }
  }
  return best;
}

// Downsample a px mask (scale s m/px) to an obstacle grid of `cell` metres: a cell is solid when >= frac of it is dark.
export function toGrid(m, w, h, s, cell, frac = 0.3) {
  const gw = Math.ceil(w * s / cell), gh = Math.ceil(h * s / cell), cnt = new Float32Array(gw * gh), tot = new Float32Array(gw * gh);
  const k = s / cell;
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, (y * k) | 0), o = y * w;
    for (let x = 0; x < w; x++) { const gi = gy * gw + Math.min(gw - 1, (x * k) | 0); tot[gi]++; if (m[o + x]) cnt[gi]++; }
  }
  const g = new Uint8Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = tot[i] && cnt[i] / tot[i] >= frac ? 1 : 0;
  return { w: gw, h: gh, cell, data: g };
}

// Scanline fill of a polygon (world metres) into a grid (value v); cell centres inside are set.
export function fillPoly(grid, pts, v = 1) {
  const { w, h, cell, data } = grid;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const r0 = Math.max(0, Math.floor(y0 / cell - 0.5)), r1 = Math.min(h - 1, Math.ceil(y1 / cell - 0.5));
  const xs = [];
  for (let r = r0; r <= r1; r++) {
    const yc = (r + 0.5) * cell; xs.length = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const c0 = Math.max(0, Math.ceil(xs[i] / cell - 0.5)), c1 = Math.min(w - 1, Math.floor(xs[i + 1] / cell - 0.5));
      for (let c = c0; c <= c1; c++) data[r * w + c] = v;
    }
  }
}
// Thick segment as a polygon (for walls drawn as lines).
export function segPoly(a, b, half) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9, nx = -dy / L * half, ny = dx / L * half, ex = dx / L * half, ey = dy / L * half;
  return [[a[0] - ex + nx, a[1] - ey + ny], [b[0] + ex + nx, b[1] + ey + ny], [b[0] + ex - nx, b[1] + ey - ny], [a[0] - ex - nx, a[1] - ey - ny]];
}

// Marching-squares outlines of a binary grid (value 1 = inside). Returns closed rings in world metres.
export function contours(data, w, h, cell, ox = 0, oy = 0) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] ? 1 : 0);
  // edges between corner points; corners at cell centres (x+0.5, y+0.5)
  const segs = new Map(); // start key -> list of end keys
  const key = (x, y) => x * 2 + ',' + y * 2;
  const add = (a, b) => { const k = key(a[0], a[1]); if (!segs.has(k)) segs.set(k, []); segs.get(k).push([a, b]); };
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
    const c = tl * 8 + tr * 4 + br * 2 + bl;
    if (c === 0 || c === 15) continue;
    const T = [x + 0.5, y], R = [x + 1, y + 0.5], B = [x + 0.5, y + 1], L = [x, y + 0.5];
    // orientation: inside on the left when walking (y down)
    switch (c) {
      case 1: add(L, B); break; case 2: add(B, R); break; case 3: add(L, R); break; case 4: add(R, T); break;
      case 5: add(L, T); add(R, B); break; case 6: add(B, T); break; case 7: add(L, T); break; case 8: add(T, L); break;
      case 9: add(T, B); break; case 10: add(T, R); add(B, L); break; case 11: add(T, R); break; case 12: add(R, L); break;
      case 13: add(R, B); break; case 14: add(B, L); break;
    }
  }
  const rings = [];
  for (const [k0, list] of segs) {
    while (list.length) {
      let [a, b] = list.pop(); const ring = [a];
      let guard = 0;
      while (guard++ < 1e7) {
        ring.push(b);
        const nk = key(b[0], b[1]), nl = segs.get(nk);
        if (!nl || !nl.length) break;
        [a, b] = nl.pop();
        if (key(b[0], b[1]) === key(ring[0][0], ring[0][1])) { ring.push(b); break; }
      }
      if (ring.length > 3) rings.push(ring.map((p) => [ox + (p[0] + 0.5) * cell, oy + (p[1] + 0.5) * cell]));
    }
  }
  return rings;
}

// Douglas-Peucker on a closed or open polyline.
export function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(); const a = pts[i], b = pts[j];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    let md = -1, mi = -1;
    for (let k = i + 1; k < j; k++) {
      const p = pts[k];
      const d = L < 1e-12 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / L;
      if (d > md) { md = d; mi = k; }
    }
    if (md > tol) { keep[mi] = 1; st.push([i, mi], [mi, j]); }
  }
  const out = []; for (let k = 0; k < pts.length; k++) if (keep[k]) out.push(pts[k]);
  return out;
}
export function ringArea(r) { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; }
