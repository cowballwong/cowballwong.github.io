// HK Site Analysis v3: board drawers for the three new diagrams (sunlight hours, walking catchment, sky view factor).
// Each draw(res, p, B, K) returns {svg, legend, take, rasters} in the 0..100 map viewBox, like the v2 drawers in board.js.
// Rasters are classed (2 h bands for sun, 0.2 bands for sky view) and drawn 4 to 8 times finer than the analysis grid
// with bilinear values, so class edges read as smooth lines; buildings are drawn over them.

const FALL = {
  sunhRamp: ['#3b4a7a', '#6a5f8f', '#a8768a', '#dc9670', '#f2c36b', '#fbe7a6'],
  svfRamp: ['#2b2d42', '#4d5a7c', '#7d93b2', '#b3c8dc', '#e6eff6'],
  walk5: '#7a4fb5', walk10: '#b9a0dc', walkRest: '#d6d1c7', accDark: '#0a4f4b',
};
const col = (K, k) => (K.C && K.C[k]) || FALL[k];
const hex = (h) => { const s = String(h).replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };

// fill NaN cells (inside buildings) from their neighbours so the upsampled raster has no holes at building edges
function filled(v, nx, ny) {
  let a = Float32Array.from(v);
  for (let pass = 0; pass < 6; pass++) {
    let left = 0; const b = Float32Array.from(a);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!Number.isNaN(a[k])) continue;
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const w = a[jj * nx + ii]; if (!Number.isNaN(w)) { s += w; n++; } }
      if (n) b[k] = s / n; else left++;
    }
    a = b; if (!left) break;
  }
  for (let k = 0; k < a.length; k++) if (Number.isNaN(a[k])) a[k] = 0;
  return a;
}
// classed raster: value -> class colour, sampled bilinearly at 'up' pixels per cell; row 0 of the grid is the south row
function classRaster(grid, vals, cs, width, up) {
  const { nx, ny } = grid, a = filled(vals, nx, ny), W = nx * up, H = ny * up, rgb = cs.map(hex);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'), im = x.createImageData(W, H), d = im.data;
  for (let py = 0; py < H; py++) {
    const gy = Math.min(ny - 1, Math.max(0, (H - 1 - py + 0.5) / up - 0.5)), j = Math.min(ny - 2, Math.floor(gy)), v = gy - j;
    for (let px = 0; px < W; px++) {
      const gx = Math.min(nx - 1, Math.max(0, (px + 0.5) / up - 0.5)), i = Math.min(nx - 2, Math.floor(gx)), u = gx - i, k = j * nx + i;
      const val = (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + nx] * (1 - u) + a[k + nx + 1] * u) * v;
      const c = rgb[Math.max(0, Math.min(cs.length - 1, Math.floor(val / width)))], o = (py * W + px) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  x.putImageData(im, 0, 0);
  return cv;
}
const rasterAt = (grid, p, canvas, id) => ({ canvas, id, x: p.X(grid.x0), y: p.Y(grid.y0 + grid.ny * grid.cell), w: grid.nx * grid.cell * p.U, h: grid.ny * grid.cell * p.U });
// iso line (marching squares) on the filled grid, in map units
function isoPath(grid, vals, level, p, K) {
  const { nx, ny, x0, y0, cell } = grid, a = filled(vals, nx, ny), segs = [];
  const P = (i, j) => [p.X(x0 + (i + 0.5) * cell), p.Y(y0 + (j + 0.5) * cell)];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const z = [a[j * nx + i], a[j * nx + i + 1], a[(j + 1) * nx + i + 1], a[(j + 1) * nx + i]], cnr = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    const pts = [];
    for (let e = 0; e < 4; e++) {
      const z0 = z[e], z1 = z[(e + 1) % 4]; if ((z0 < level) === (z1 < level)) continue;
      const t = (level - z0) / (z1 - z0), A = P(...cnr[e]), Bp = P(...cnr[(e + 1) % 4]);
      pts.push([A[0] + (Bp[0] - A[0]) * t, A[1] + (Bp[1] - A[1]) * t]);
    }
    for (let q = 0; q + 1 < pts.length; q += 2) segs.push(`M${K.f1(pts[q][0])} ${K.f1(pts[q][1])}L${K.f1(pts[q + 1][0])} ${K.f1(pts[q + 1][1])}`);
  }
  return segs.join('');
}
const bldPath = (res, p, K) => K.blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p);
const bldFill = (K) => K.bldFill || (K.C && K.C.bld) || '#d9d4ca';

// ---------------------------------------------------------------- sunlight hours (21 Mar on the map)
function drawSunh(res, p, B, K) {
  const s = res.sunh, C = K.C || {}, cs = col(K, 'sunhRamp'), show = s.show || 'mar', vals = s.hours[show];
  const cv = classRaster(s.grid, vals, cs, 2, 4);                // the raster is the ground; the board paints it under this drawing
  let o = `<path d="${isoPath(s.grid, vals, 2, p, K)}" fill="none" stroke="${C.ink || '#1d1c1a'}" stroke-width="0.22" stroke-dasharray="0.9 0.6" stroke-opacity="0.65"/>`;
  o += `<path d="${bldPath(res, p, K)}" fill="${bldFill(K)}" stroke="${C.dark ? (C.sunBldLine || '#5b6475') : '#ffffff'}" stroke-width="${C.dark ? 0.16 : 0.12}" stroke-opacity="${C.dark ? 0.9 : 0.6}"/>`;
  o += K.siteSVG(res, p, { fill: 0, w: 0.75 });
  const dt = (s.dates || []).find((q) => q.id === show) || { en: '21 Mar' };
  const ticks = cs.map((_, i) => String(i * 2));
  return {
    svg: o, rasters: [rasterAt(s.grid, p, cv, 'sunh')],
    legend: [{ k: 'ramp', cs, ticks, t: K.T(`hours of sun, ${dt.en}`) }, { k: 'dash', c: C.ink || '#1d1c1a', t: K.T('2 h line') }],
    take: K.T(s.take),
  };
}

// ---------------------------------------------------------------- sky view factor
function drawSvf(res, p, B, K) {
  const s = res.svf, C = K.C || {}, cs = col(K, 'svfRamp');
  const cv = classRaster(s.grid, s.v, cs, 1 / cs.length, 8);
  let o = `<path d="${bldPath(res, p, K)}" fill="${bldFill(K)}" stroke="${C.dark ? (C.sunBldLine || '#5b6475') : '#ffffff'}" stroke-width="${C.dark ? 0.16 : 0.12}" stroke-opacity="${C.dark ? 0.9 : 0.6}"/>`;
  o += K.siteSVG(res, p, { fill: 0, w: 0.75 });
  // the point the Views diagram measures from (street level at the site centre)
  if (res.views && res.views.x0 != null) {
    const x = p.X(res.views.x0), y = p.Y(res.views.y0);
    o += `<circle cx="${K.f2(x)}" cy="${K.f2(y)}" r="1.1" fill="${C.panel || '#fff'}" stroke="${C.ink || '#1d1c1a'}" stroke-width="0.45"/>`;
  }
  const ticks = cs.map((_, i) => (i / cs.length).toFixed(1).replace(/^0\.0$/, '0'));
  return {
    svg: o, rasters: [rasterAt(s.grid, p, cv, 'svf')],
    legend: [{ k: 'ramp', cs, ticks, t: K.T('sky view (1 = open sky)') }, { k: 'ring', c: C.ink || '#1d1c1a', t: K.T('Views point') }],
    take: K.T(s.take),
  };
}

// ---------------------------------------------------------------- walking catchment (its own frame and scale)
function drawWalk(res, p0, B, K) {
  const w = res.walk, C = K.C || {}, f = w.frame, F = f.s, U = 100 / F, round = K.shape === 'circle';
  const p = { F, U, X: (E) => 50 + (E - f.cE) * U, Y: (N) => 50 - (N - f.cN) * U };
  const ink = C.ink || '#1d1c1a', dark = col(K, 'accDark'), w5 = col(K, 'walk5'), w10 = col(K, 'walk10'), wr = col(K, 'walkRest');
  const line = (pts) => 'M' + pts.map(([E, N]) => `${K.f1(p.X(E))} ${K.f1(p.Y(N))}`).join('L');
  let o = `<rect width="100" height="100" fill="${C.accBg || C.ground || '#f4f2ed'}"/>`;
  o += `<path d="${w.rest.map((r) => line(r.pts)).join('')}" fill="none" stroke="${wr}" stroke-width="0.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  o += `<path d="${w.edges.filter((e) => e.band === 10).map((e) => line(e.pts)).join('')}" fill="none" stroke="${w10}" stroke-width="0.42" stroke-linecap="round" stroke-linejoin="round"/>`;
  o += `<path d="${w.edges.filter((e) => e.band === 5).map((e) => line(e.pts)).join('')}" fill="none" stroke="${w5}" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"${K.glow ? ' filter="url(#uksa-glow)"' : ''}/>`;
  // the frame the other diagrams show, for scale
  const rf = res.f;
  o += `<rect x="${K.f2(p.X(rf.E0))}" y="${K.f2(p.Y(rf.N1))}" width="${K.f2(rf.s * U)}" height="${K.f2(rf.s * U)}" fill="none" stroke="${ink}" stroke-width="0.32" stroke-dasharray="1.2 0.8" stroke-opacity="0.85"/>`;
  o += K.siteSVG(res, p, { fill: 0.25, w: 0.6 });
  const inside = (X, Y, m) => (round ? Math.hypot(X - 50, Y - 50) <= 50 - m : X >= m && X <= 100 - m && Y >= m && Y <= 100 - m);
  // bus stops within 5 minutes
  let busN = 0;
  for (const b of w.bus || []) {
    if (b.min > 5) continue; const X = p.X(b.E), Y = p.Y(b.N); if (!inside(X, Y, 2)) continue;
    busN++; o += `<circle cx="${K.f2(X)}" cy="${K.f2(Y)}" r="0.75" fill="${C.panel || '#fff'}" stroke="${w5}" stroke-width="0.32"/>`;
  }
  // MTR exits and Light Rail stops within 10 minutes, the nearest few labelled with their minutes
  const placed = [[50, 50]]; let mtrN = 0, lrN = 0;
  for (const e of w.mtr || []) {
    const X = p.X(e.E), Y = p.Y(e.N); if (!inside(X, Y, 3)) continue;
    if (e.kind === 'lr') { lrN++; o += `<circle cx="${K.f2(X)}" cy="${K.f2(Y)}" r="1.6" fill="${C.panel || '#fff'}" stroke="${dark}" stroke-width="0.45"/>` + K.tx(X, Y + 0.55, 'LR', { size: 1.35, bold: true, fill: dark, anchor: 'middle' }); }
    else { mtrN++; o += `<rect x="${K.f2(X - 1.35)}" y="${K.f2(Y - 1.35)}" width="2.7" height="2.7" rx="0.5" fill="${dark}"/>` + K.tx(X, Y + 0.75, 'M', { size: 1.9, bold: true, fill: C.onAccent || '#fff', anchor: 'middle' }); }
  }
  // more than one station (or stop) in reach: name it on each label ("Tsuen Wan West D · 8 min");
  // one station: the exit letter is enough ("D · 8 min"). A station with no name shows its letter only.
  const stKey = (e) => (e.kind || 'mtr') + ':' + (e.en || e.zh || '');
  const named = new Set((w.mtr || []).filter((e) => e.en || e.zh).map(stKey));
  const multi = named.size > 1;
  for (const e of (w.mtr || []).slice(0, 12)) {
    const X = p.X(e.E), Y = p.Y(e.N); if (!inside(X, Y, 3)) continue;
    if (placed.some(([a, b]) => Math.hypot(a - X, b - Y) < 9)) continue;
    const mn = Math.max(1, Math.round(e.min)), name = multi ? K.T(e.en || e.zh || '') : '';
    const head = [name, e.ref || ''].filter(Boolean).join(' ');
    const lab = (head ? head + ' · ' : '') + K.T(`${mn} min`), lw = K.tw(lab, 2, true), right = X + 2 + lw < (round ? 92 : 97);
    o += K.tx(right ? X + 2 : X - 2, Y + 0.7, lab, { size: 2, bold: true, fill: dark, halo: C.halo || '#fff', anchor: right ? 'start' : 'end' });
    placed.push([X, Y]); if (placed.length > 5) break;
  }
  // own scale bar (the board draws only the north arrow on this diagram), labelled in metres.
  // It goes in a flat 'uksa-note' group, which the board keeps outside the circle clip (no nested groups inside it).
  {
    const Lm = [50, 100, 200, 250, 500, 1000].filter((v) => v <= F / (round ? 5 : 4)).pop() || 50, len = Lm * U, by = round ? 96.6 : 94;
    const lab = Lm >= 1000 ? K.T(`${Lm / 1000} km`) : K.T(`${Lm} m`);
    o += `<g class="uksa-note"><rect class="uksa-sb-walk" data-m="${Lm}" data-u="${K.f2(len)}" width="0" height="0"/>`;
    if (!round) o += `<rect x="2.4" y="90.2" width="${K.f2(len + 9)}" height="7.4" rx="0.8" fill="${C.dark ? 'rgba(15,18,23,0.85)' : 'rgba(255,255,255,0.88)'}"/>`;
    o += `<rect x="4" y="${by}" width="${K.f2(len / 2)}" height="1.1" fill="${ink}"/><rect x="${K.f2(4 + len / 2)}" y="${by}" width="${K.f2(len / 2)}" height="1.1" fill="none" stroke="${ink}" stroke-width="0.25"/>`;
    o += K.tx(4, by - 1, '0', { size: 2.3, fill: ink }) + K.tx(4 + len, by - 1, lab, { size: 2.3, fill: ink, anchor: 'middle' }) + '</g>';
  }
  const lg = [{ k: 'line', c: w5, w: 1.2, t: K.T('5 min') }, { k: 'line', c: w10, w: 1.2, t: K.T('10 min') },
    { k: 'line', c: wr, w: 0.8, t: K.T(w.net === 'road' ? 'roads beyond' : 'paths beyond') }];
  if (mtrN) lg.push({ k: 'mtr', c: dark, t: K.T('MTR exit, minutes') });
  if (lrN) lg.push({ k: 'lr', c: dark, t: K.T('Light Rail stop') });
  if (busN) lg.push({ k: 'bus', c: w5, t: K.T('bus stop, 5 min') });
  lg.push({ k: 'dash', c: ink, t: K.T(`${rf.s} m frame`) });
  return { svg: o, legend: lg, take: K.T(w.take), ownScale: true };
}

export const DIAGRAMS3 = {
  sunh: { en: 'Sunlight hours', c: '#e07b39', draw: drawSunh },
  walk: { en: 'Walking distance', c: '#7a4fb5', draw: drawWalk },
  svf: { en: 'Sky view factor', c: '#4f7d99', draw: drawSvf },
};
