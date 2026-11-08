/* Facade Surface Studio · exports. OBJ / STL / GLB through the three.js exporter addons (MIT); DXF (R12, mm),
   SVG and CSV written here. Everything is made in the page; nothing is uploaded. */
import * as THREE from 'three';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { flatten, valFromOp } from './geom.js';

export function exportGroup(meshes) {
  const g = new THREE.Group(); g.name = 'facade-surface-studio';
  for (const m of meshes) {
    if (!m) continue;
    const c = new THREE.Mesh(m.geometry, new THREE.MeshStandardMaterial({ color: m.material.color ? m.material.color.clone() : 0xcccccc, metalness: m.material.metalness || 0, roughness: m.material.roughness || 1, vertexColors: !!m.material.vertexColors, side: THREE.DoubleSide }));
    c.name = m.name; g.add(c);
  }
  return g;
}
export function toOBJ(g) { return new OBJExporter().parse(g); }
export function toSTL(g) { return new STLExporter().parse(g, { binary: true }); }
export function toGLB(g) { return new GLTFExporter().parseAsync(g, { binary: true }); }

const f = (x) => (Math.round(x * 10) / 10).toFixed(1);

/* one flattened template per type, laid out on a grid: returns items with 2D geometry in mm */
export function typeSheet(model) {
  const { types, panels, pat, st } = model, items = [];
  for (const T of types) {
    const rep = panels[T.rep];
    const val = pat === 'fins' ? { depth: st.finDepth } : pat === 'pyramids' ? { h: T.op / 1000 } : { open: valFromOp(rep, T.op, pat) };
    const fl = flatten(rep, pat, val);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const all = fl.outer.concat(...(fl.flaps || []));
    for (const q of all) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    items.push({ T, fl, bb: [x0, y0, x1, y1] });
  }
  const cw = Math.max(...items.map(i => i.bb[2] - i.bb[0])) + 900, ch = Math.max(...items.map(i => i.bb[3] - i.bb[1])) + 1500;
  const cols = Math.min(4, Math.ceil(Math.sqrt(items.length)));
  items.forEach((it, k) => {
    const c = k % cols, r = Math.floor(k / cols);
    it.ox = c * cw + 450 - it.bb[0]; it.oy = -(r * ch) - 450 - it.bb[3];  // rows go downwards
  });
  return { items, cw, ch, cols, rows: Math.ceil(items.length / cols) };
}
function label(T, pat) {
  const v = pat === 'fins' ? `angle ${f(T.op)} deg` : pat === 'pyramids' ? `apex ${Math.round(T.op)} mm` : pat === 'perforated' ? `hole dia ${Math.round(T.op)} mm` : `cut-out ${Math.round(T.op)} mm`;
  return `${T.name}  x${T.count}  ${v}`;
}

export function toDXF(model) {
  const sh = typeSheet(model), out = [];
  const g = (c, v) => out.push(String(c), String(v));
  const layers = ['FSS-LABEL', 'FSS-DIM'].concat(sh.items.map(i => 'FSS-' + i.T.name));
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
  layers.forEach((l, k) => { g(0, 'LAYER'); g(2, l); g(70, 0); g(62, k < 2 ? 7 : (k % 6) + 1); g(6, 'CONTINUOUS'); });
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const line = (L, a, b) => { g(0, 'LINE'); g(8, L); g(10, f(a[0])); g(20, f(a[1])); g(30, 0); g(11, f(b[0])); g(21, f(b[1])); g(31, 0); };
  const text = (L, x, y, h, s) => { g(0, 'TEXT'); g(8, L); g(10, f(x)); g(20, f(y)); g(30, 0); g(40, f(h)); g(1, s); };
  const poly = (L, P, ox, oy) => { for (let i = 0; i < P.length; i++) line(L, [P[i][0] + ox, P[i][1] + oy], [P[(i + 1) % P.length][0] + ox, P[(i + 1) % P.length][1] + oy]); };
  for (const it of sh.items) {
    const L = 'FSS-' + it.T.name, { ox, oy, fl } = it;
    poly(L, fl.outer, ox, oy);
    if (fl.inner) poly(L, fl.inner, ox, oy);
    if (fl.circle) { g(0, 'CIRCLE'); g(8, L); g(10, f(fl.circle.cx + ox)); g(20, f(fl.circle.cy + oy)); g(30, 0); g(40, f(fl.circle.r)); }
    if (fl.flaps) for (const t of fl.flaps) { line(L, [t[0][0] + ox, t[0][1] + oy], [t[2][0] + ox, t[2][1] + oy]); line(L, [t[1][0] + ox, t[1][1] + oy], [t[2][0] + ox, t[2][1] + oy]); }
    fl.outer.forEach((q, i) => { const r = fl.outer[(i + 1) % fl.outer.length]; text('FSS-DIM', (q[0] + r[0]) / 2 + ox + 30, (q[1] + r[1]) / 2 + oy + 30, 70, String(Math.round(fl.edges[i]))); });
    text('FSS-LABEL', it.bb[0] + ox, it.bb[3] + oy + 220, 140, label(it.T, model.pat));
  }
  text('FSS-LABEL', 0, 400, 180, `Facade Surface Studio - panel types (flattened, mm) - ${model.pat} - ${model.panels.length} panels, ${model.types.length} types - concept-stage rationalisation, not fabrication data`);
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

export function toSVG(model) {
  const sh = typeSheet(model), W = sh.cols * sh.cw, H = sh.rows * sh.ch + 900, s = [];
  const pt = (x, y) => `${f(x)},${f(-y)}`;
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W / 10)}mm" height="${Math.round(H / 10)}mm" viewBox="0 -700 ${f(W)} ${f(H)}" font-family="Arial, sans-serif">`);
  s.push(`<title>Facade Surface Studio panel types (scale 1:10 on the sheet; drawing units mm)</title><rect x="0" y="-700" width="${f(W)}" height="${f(H)}" fill="#fff"/>`);
  s.push(`<text x="0" y="-400" font-size="180">Facade Surface Studio · panel types, flattened (mm) · ${model.pat} · ${model.panels.length} panels, ${model.types.length} types</text>`);
  for (const it of sh.items) {
    const { ox, oy, fl } = it, col = it.T.colour;
    const P = (A) => A.map(q => pt(q[0] + ox, q[1] + oy)).join(' ');
    s.push(`<g id="${it.T.name}">`);
    if (fl.flaps) for (const t of fl.flaps) s.push(`<polygon points="${P(t)}" fill="${col}" fill-opacity=".18" stroke="#222" stroke-width="6"/>`);
    s.push(`<polygon points="${P(fl.outer)}" fill="${col}" fill-opacity=".35" stroke="#111" stroke-width="8"/>`);
    if (fl.inner) s.push(`<polygon points="${P(fl.inner)}" fill="#fff" stroke="#111" stroke-width="6"/>`);
    if (fl.circle) s.push(`<circle cx="${f(fl.circle.cx + ox)}" cy="${f(-(fl.circle.cy + oy))}" r="${f(fl.circle.r)}" fill="#fff" stroke="#111" stroke-width="6"/>`);
    fl.outer.forEach((q, i) => { const r = fl.outer[(i + 1) % fl.outer.length]; s.push(`<text x="${f((q[0] + r[0]) / 2 + ox + 30)}" y="${f(-((q[1] + r[1]) / 2 + oy + 30))}" font-size="70" fill="#444">${Math.round(fl.edges[i])}</text>`); });
    s.push(`<text x="${f(it.bb[0] + ox)}" y="${f(-(it.bb[3] + oy + 220))}" font-size="140" font-weight="700">${label(it.T, model.pat)}</text></g>`);
  }
  s.push(`<text x="0" y="${f(H - 900)}" font-size="110" fill="#555">Concept-stage rationalisation from anzonwong.com Lab. Not fabrication data; none of it replaces a professional answer.</text></svg>`);
  return s.join('\n');
}

const G_op = (p, pat) => pat === 'fins' ? p.val : pat === 'pyramids' ? p.val * 1000 : pat === 'perforated' ? 2000 * Math.min(Math.sqrt(p.val * p.area / Math.PI), p.inr * 0.92) : 1000 * Math.sqrt(p.val * p.area);
export function toCSV(model) {
  const { panels, pat, st } = model, rows = [];
  const unit = pat === 'fins' ? 'fin_angle_deg' : pat === 'pyramids' ? 'apex_height_mm' : 'open_area_pct';
  rows.push(['panel_id', 'type', 'row', 'col', 'pattern', 'centroid_x_m', 'centroid_y_m', 'centroid_z_m', 'area_m2', 'edges_mm', 'diagonal_mm', 'planarity_mm', 'driver_value', unit, 'opening_dim', 'deviation', 'shape_variation_mm', 'curvature_K_per_m2', 'sun_exposure'].join(','));
  for (const p of panels) {
    const v = pat === 'fins' ? f(p.val) : pat === 'pyramids' ? Math.round(p.val * 1000) : f(p.val * 100);
    rows.push([p.id + 1, model.types[p.type].name, p.row + 1, p.col + 1, pat, f(p.cen[0]), f(p.cen[1]), f(p.cen[2]),
      pat === 'fins' ? f(p.edges[0] * st.finDepth) : (Math.round((p.area || 0) * 1000) / 1000).toFixed(3),
      p.edges.map(e => Math.round(e * 1000)).join(';'), Math.round((p.diag || 0) * 1000), f((p.plan || 0) * 1000),
      (Math.round(p.t * 1000) / 1000).toFixed(3), v, f(G_op(p, pat)), f(p.dev || 0), f(p.shp || 0), (p.K || 0).toExponential(3), (Math.round(p.dv.sun * 1000) / 1000).toFixed(3)].join(','));
  }
  return rows.join('\r\n') + '\r\n';
}
