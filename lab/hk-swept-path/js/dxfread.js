// HK Swept Path · minimal DXF reader (ASCII DXF, any version). Returns flattened 2-D geometry per layer.
// Supported: LINE, LWPOLYLINE (bulges), POLYLINE/VERTEX, CIRCLE, ARC, ELLIPSE, SOLID, 3DFACE, HATCH (polyline and
// line/arc edge boundaries), SPLINE (control polygon), INSERT (nested blocks, scale, rotation, arrays). TEXT/MTEXT and
// DIMENSION are skipped (not obstacles). Paper space entities are ignored.

function pairs(text) {
  const lines = text.split(/\r?\n/); const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i].trim(), 10), lines[i + 1].replace(/\s+$/, '')]);
  return out;
}

function bulgeArc(a, b, bulge, out) {
  if (!bulge) { out.push(b); return; }
  const th = 4 * Math.atan(bulge), dx = b[0] - a[0], dy = b[1] - a[1], c = Math.hypot(dx, dy);
  if (c < 1e-12) { out.push(b); return; }
  const r = c / (2 * Math.sin(th / 2)), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const h = r * Math.cos(th / 2), nx = -dy / c, ny = dx / c;
  const cx = mx + nx * h, cy = my + ny * h;
  const a0 = Math.atan2(a[1] - cy, a[0] - cx); const n = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 18)));
  const R = Math.abs(r);
  for (let i = 1; i <= n; i++) { const t = a0 + th * i / n; out.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]); }
  out[out.length - 1] = b;
}
function arcPts(cx, cy, r, a0, a1) {
  while (a1 <= a0) a1 += 360;
  const n = Math.max(4, Math.ceil((a1 - a0) / 10)), out = [];
  for (let i = 0; i <= n; i++) { const t = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  return out;
}

export function parseDXF(text) {
  const P = pairs(text);
  let i = 0; const header = {}, blocks = {}, layers = new Set(), ents = [];
  const readEntities = (stopAt, sink) => {
    // P[i] is at an entity start (0, TYPE). Read until a 0 with value in stopAt.
    while (i < P.length && !(P[i][0] === 0 && stopAt.includes(P[i][1]))) {
      if (P[i][0] !== 0) { i++; continue; }
      const type = P[i][1]; const g = []; i++;
      while (i < P.length && P[i][0] !== 0) { g.push(P[i]); i++; }
      if (type === 'POLYLINE') {
        const verts = [];
        while (i < P.length && P[i][0] === 0 && P[i][1] === 'VERTEX') {
          const vg = []; i++; while (i < P.length && P[i][0] !== 0) { vg.push(P[i]); i++; }
          verts.push(vg);
        }
        if (i < P.length && P[i][1] === 'SEQEND') { i++; while (i < P.length && P[i][0] !== 0) i++; }
        sink.push({ type, g, verts });
      } else sink.push({ type, g });
    }
  };
  while (i < P.length) {
    const [c, v] = P[i];
    if (c === 0 && v === 'SECTION') {
      const name = P[i + 1][1]; i += 2;
      if (name === 'HEADER') {
        let cur = null;
        while (i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC')) { if (P[i][0] === 9) cur = P[i][1]; else if (cur && !(cur in header)) header[cur] = P[i][1]; i++; }
      } else if (name === 'TABLES') {
        let inLayer = false;
        while (i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC')) {
          if (P[i][0] === 0) inLayer = P[i][1] === 'LAYER';
          else if (inLayer && P[i][0] === 2) layers.add(P[i][1]);
          i++;
        }
      } else if (name === 'BLOCKS') {
        while (i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC')) {
          if (P[i][0] === 0 && P[i][1] === 'BLOCK') {
            i++; const bg = []; while (i < P.length && P[i][0] !== 0) { bg.push(P[i]); i++; }
            const nm = (bg.find((q) => q[0] === 2) || [0, ''])[1];
            const bx = +((bg.find((q) => q[0] === 10) || [0, 0])[1]), by = +((bg.find((q) => q[0] === 20) || [0, 0])[1]);
            const list = []; readEntities(['ENDBLK'], list);
            blocks[nm] = { base: [bx, by], ents: list };
            i++; while (i < P.length && P[i][0] !== 0) i++;
          } else i++;
        }
      } else if (name === 'ENTITIES') {
        readEntities(['ENDSEC'], ents);
      } else { while (i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC')) i++; }
    }
    i++;
  }

  const out = []; // {layer, pts, closed, fill}
  const num = (g, c, d = 0) => { const q = g.find((x) => x[0] === c); return q ? parseFloat(q[1]) : d; };
  const str = (g, c, d = '') => { const q = g.find((x) => x[0] === c); return q ? q[1] : d; };
  const emit = (layer, pts, closed, fill, T) => {
    if (pts.length < 2) return;
    out.push({ layer, pts: pts.map(T), closed, fill }); layers.add(layer);
  };
  const walk = (list, T, parentLayer, depth) => {
    if (depth > 8) return;
    for (const e of list) {
      const g = e.g; let layer = str(g, 8, '0'); if (layer === '0' && parentLayer) layer = parentLayer;
      if (num(g, 67) === 1) continue; // paper space
      switch (e.type) {
        case 'LINE': emit(layer, [[num(g, 10), num(g, 20)], [num(g, 11), num(g, 21)]], false, false, T); break;
        case 'LWPOLYLINE': {
          const flag = num(g, 70), pts = [], bul = []; let cur = null;
          for (const [c, v] of g) {
            if (c === 10) { cur = [parseFloat(v), 0]; pts.push(cur); bul.push(0); }
            else if (c === 20 && cur) cur[1] = parseFloat(v);
            else if (c === 42 && pts.length) bul[pts.length - 1] = parseFloat(v);
          }
          const closed = !!(flag & 1), o = [pts[0]];
          for (let k = 1; k < pts.length; k++) bulgeArc(pts[k - 1], pts[k], bul[k - 1], o);
          if (closed && pts.length > 2) bulgeArc(pts[pts.length - 1], pts[0], bul[pts.length - 1], o);
          if (pts.length) emit(layer, o, closed, false, T); break;
        }
        case 'POLYLINE': {
          const flag = num(g, 70); if (flag & (16 | 64)) break; // mesh / polyface
          const pts = e.verts.map((vg) => [num(vg, 10), num(vg, 20)]), bul = e.verts.map((vg) => num(vg, 42));
          const closed = !!(flag & 1), o = pts.length ? [pts[0]] : [];
          for (let k = 1; k < pts.length; k++) bulgeArc(pts[k - 1], pts[k], bul[k - 1], o);
          if (closed && pts.length > 2) bulgeArc(pts[pts.length - 1], pts[0], bul[pts.length - 1], o);
          emit(layer, o, closed, false, T); break;
        }
        case 'CIRCLE': emit(layer, arcPts(num(g, 10), num(g, 20), num(g, 40), 0, 360), true, false, T); break;
        case 'ARC': emit(layer, arcPts(num(g, 10), num(g, 20), num(g, 40), num(g, 50), num(g, 51)), false, false, T); break;
        case 'ELLIPSE': {
          const cx = num(g, 10), cy = num(g, 20), mx = num(g, 11), my = num(g, 21), ra = num(g, 40, 1);
          let t0 = num(g, 41, 0), t1 = num(g, 42, 2 * Math.PI); if (t1 <= t0) t1 += 2 * Math.PI;
          const pts = []; const n = 48;
          for (let k = 0; k <= n; k++) { const t = t0 + (t1 - t0) * k / n; pts.push([cx + mx * Math.cos(t) - my * ra * Math.sin(t), cy + my * Math.cos(t) + mx * ra * Math.sin(t)]); }
          emit(layer, pts, Math.abs(t1 - t0 - 2 * Math.PI) < 1e-6, false, T); break;
        }
        case 'SOLID': case '3DFACE': {
          const q = [[num(g, 10), num(g, 20)], [num(g, 11), num(g, 21)], [num(g, 13, num(g, 12)), num(g, 23, num(g, 22))], [num(g, 12), num(g, 22)]];
          emit(layer, e.type === 'SOLID' ? q : [q[0], q[1], q[3], q[2]], true, true, T); break;
        }
        case 'HATCH': {
          // boundary loops: polyline loops (flag 2) and edge loops of lines / arcs
          let k = g.findIndex((x) => x[0] === 91); if (k < 0) break;
          const nLoops = parseInt(g[k][1], 10); k++;
          for (let L = 0; L < nLoops && k < g.length; L++) {
            while (k < g.length && g[k][0] !== 92) k++; if (k >= g.length) break;
            const lf = parseInt(g[k][1], 10); k++;
            const pts = [];
            if (lf & 2) {
              k++; // 72 has bulge
              const hasB = g[k - 1][0] === 72 && g[k - 1][1].trim() === '1';
              while (k < g.length && g[k][0] !== 93) k++; const nv = parseInt(g[k][1], 10); k++;
              const raw = [], bul = [];
              for (let q = 0; q < nv; q++) {
                const x = parseFloat(g[k][1]), y = parseFloat(g[k + 1][1]); k += 2; let b = 0;
                if (hasB && g[k] && g[k][0] === 42) { b = parseFloat(g[k][1]); k++; }
                raw.push([x, y]); bul.push(b);
              }
              if (raw.length) { pts.push(raw[0]); for (let q = 1; q < raw.length; q++) bulgeArc(raw[q - 1], raw[q], bul[q - 1], pts); bulgeArc(raw[raw.length - 1], raw[0], bul[raw.length - 1], pts); }
            } else {
              while (k < g.length && g[k][0] !== 93) k++; const ne = parseInt(g[k][1], 10); k++;
              for (let q = 0; q < ne && k < g.length; q++) {
                const et = parseInt(g[k][1], 10); k++;
                if (et === 1) { const a = [parseFloat(g[k][1]), parseFloat(g[k + 1][1])], b = [parseFloat(g[k + 2][1]), parseFloat(g[k + 3][1])]; k += 4; if (!pts.length) pts.push(a); pts.push(b); }
                else if (et === 2) {
                  const cx = parseFloat(g[k][1]), cy = parseFloat(g[k + 1][1]), r = parseFloat(g[k + 2][1]), a0 = parseFloat(g[k + 3][1]), a1 = parseFloat(g[k + 4][1]), ccw = parseInt(g[k + 5][1], 10); k += 6;
                  const ap = ccw ? arcPts(cx, cy, r, a0, a1) : arcPts(cx, cy, r, -a0, -a1).map((p) => [p[0], 2 * cy - p[1]]);
                  pts.push(...ap);
                } else { while (k < g.length && g[k][0] !== 72 && g[k][0] !== 92 && g[k][0] !== 97) k++; }
              }
            }
            if (pts.length > 2) emit(layer, pts, true, true, T);
          }
          break;
        }
        case 'SPLINE': {
          const pts = []; let cur = null;
          for (const [c, v] of g) { if (c === 10) { cur = [parseFloat(v), 0]; pts.push(cur); } else if (c === 20 && cur) cur[1] = parseFloat(v); }
          emit(layer, pts, !!(num(g, 70) & 1), false, T); break;
        }
        case 'INSERT': {
          const b = blocks[str(g, 2)]; if (!b) break;
          const ix = num(g, 10), iy = num(g, 20), sx = num(g, 41, 1), sy = num(g, 42, 1), rot = num(g, 50) * Math.PI / 180;
          const nc = Math.max(1, num(g, 70, 1)), nr = Math.max(1, num(g, 71, 1)), dc = num(g, 44), dr = num(g, 45);
          const c = Math.cos(rot), s = Math.sin(rot);
          for (let r = 0; r < nr; r++) for (let q = 0; q < nc; q++) {
            const ox = q * dc, oy = r * dr;
            const T2 = (p) => { const x = (p[0] - b.base[0]) * sx + ox, y = (p[1] - b.base[1]) * sy + oy; return T([ix + c * x - s * y, iy + s * x + c * y]); };
            walk(b.ents, T2, layer, depth + 1);
          }
          break;
        }
        default: break;
      }
    }
  };
  walk(ents, (p) => p, null, 0);
  const ins = parseInt(header.$INSUNITS || '0', 10);
  return { items: out, layers: [...layers].sort(), insunits: ins };
}

// Metres per drawing unit from $INSUNITS (0 = unitless: guess from the extents).
export function unitScale(dxf, override) {
  if (override && override !== 'auto') return { mm: 0.001, cm: 0.01, m: 1 }[override];
  const u = dxf.insunits;
  const map = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 14: 0.1 };
  if (map[u]) return map[u];
  let x0 = Infinity, x1 = -Infinity;
  for (const it of dxf.items) for (const p of it.pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; }
  return (x1 - x0) > 2000 ? 0.001 : 1;
}

export function guessObstacleLayers(layers) {
  const yes = /wall|col|struct|core|kerb|curb|obst|barrier|parapet|lift|stair|ramp|墻|牆|柱|s-|a-wall/i;
  const no = /text|txt|dim|anno|bay|park|stall|line|grid|axis|title|defpoints|hatch|vp|view|centre|center/i;
  const pick = layers.filter((l) => yes.test(l) && !no.test(l));
  return pick.length ? pick : layers.filter((l) => !no.test(l) && l !== '0');
}
