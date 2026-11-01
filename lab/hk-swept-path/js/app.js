// HK Swept Path · 泊車軌跡 · page logic. Everything runs in this browser tab; nothing is uploaded.
import * as pdfjs from '../vendor/pdf.min.mjs';
import { PRESETS, DEFAULTS, makeVehicle, bodies, rectPoly, wheels, HKPSG_BAYS } from './vehicles.js';
import { darkMask, opening, toGrid, fillPoly, segPoly, contours, simplify, dropSymbols } from './raster.js';
import { parseDXF, unitScale, guessObstacleLayers } from './dxfread.js';
import { toDXF } from './dxfwrite.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const CELL = 0.1;
const COL = { g: '#2f7a4a', a: '#c98612', r: '#c0392b', p: '#9d978b', ink: '#1d1c1a', obs: 'rgba(60,72,92,0.55)' };
const lang = () => document.documentElement.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
const L = (en, zh) => (lang() === 'zh' ? zh : en);

// ---------------------------------------------------------------- state
const S = {
  step: 1, file: null, kind: null,           // kind: pdf | image | dxf
  plan: null, s: 0.02, calibrated: false,    // plan bitmap (canvas) and metres per plan pixel
  ox: 0, oy: 0, unitM: 0.001,                // world -> drawing: X = (x + ox) / unitM, Y = (oy - y) / unitM
  dxf: null, dxfSel: new Set(),
  auto: null, grid: null, obsBmp: null, edits: [],
  thr: 140, stroke: 150,
  entry: null, exit: null, rows: [], singles: [],
  vehId: 'car', vOver: {}, buffer: 0.3, reduced: 0.15, empty: false,
  results: new Map(), running: false, worker: null, order: [], done: 0,
  sel: null, anims: [], tool: null, temp: null, cal: [],
};
const view = { z: 10, x: 0, y: 0 };  // z = screen px per metre; x,y = world point at the canvas top-left
window.SP = { S, view };             // test hook (read-only use)

// ---------------------------------------------------------------- language toggle
// On anzonwong.com the button is a link to the other language's page (/lab/hk-swept-path/ <-> /zh/lab/hk-swept-path/; both
// pages hold both languages, build.py inpage_lang). With nothing loaded it simply follows the link. Once a plan is loaded it
// switches in place and swaps the address with history.replaceState, so a reload stays in the chosen language and the plan
// and results are kept. Both pages sit one folder level apart, so the page's relative links still lead to the same language.
// The target comes from <html data-alt>: on the built zh pages build.py's link localiser turns the button's own href into "./"
// (seen 1 Nov 2026 on every live zh page), while data-alt keeps the right address.
$('#langBtn').addEventListener('click', (ev) => {
  const a = ev.currentTarget, root = document.documentElement;
  const href = a.tagName === 'A' ? (root.getAttribute('data-alt') || a.getAttribute('href')) : null;
  ev.preventDefault();
  if (href && !S.plan && !S.results.size) { location.href = new URL(href, location.href).href; return; }
  const l = lang() === 'zh' ? 'en' : 'zh';
  document.documentElement.setAttribute('data-lang', l); document.documentElement.lang = l === 'zh' ? 'zh-Hant-HK' : 'en-GB';
  try { localStorage.setItem('aw-lang', l); } catch (e) { /* private mode */ }
  if (href) {
    try {
      const to = new URL(href, location.href), from = location.href.split('#')[0];
      history.replaceState(history.state, '', to.pathname + location.search + location.hash);
      a.setAttribute('href', from); root.setAttribute('data-alt', from); a.setAttribute('hreflang', l === 'zh' ? 'en-GB' : 'zh-Hant-HK');
    } catch (e) { /* file:// preview */ }
  }
  buildVehSelect(); refreshAll();
});

// ---------------------------------------------------------------- canvas / view
const cv = $('#sp-canvas'), stage = $('#sp-stage');
let ctx = cv.getContext('2d'), dpr = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = stage.getBoundingClientRect();
  cv.width = Math.max(10, Math.round(r.width * dpr)); cv.height = Math.max(10, Math.round(r.height * dpr));
  draw();
}
new ResizeObserver(resize).observe(stage);
const toWorld = (sx, sy) => [view.x + sx / view.z, view.y + sy / view.z];
const toScreen = (x, y) => [(x - view.x) * view.z, (y - view.y) * view.z];
SP.toScreen = toScreen; SP.toWorld = toWorld;
function worldExtent() {
  if (S.plan) return [0, 0, S.plan.width * S.s, S.plan.height * S.s];
  return [0, 0, 60, 40];
}
function fit(box) {
  const [x0, y0, x1, y1] = box || contentBox();
  const r = stage.getBoundingClientRect(), pad = 24;
  view.z = Math.min((r.width - 2 * pad) / (x1 - x0), (r.height - 2 * pad) / (y1 - y0));
  view.x = (x0 + x1) / 2 - r.width / 2 / view.z; view.y = (y0 + y1) / 2 - r.height / 2 / view.z;
  draw();
}
function contentBox() {
  // obstacles + marks when present, else the plan
  const pts = [];
  for (const b of allBays()) pts.push(...b.poly);
  for (const g of [S.entry, S.exit]) if (g) pts.push([g.x - 6, g.y - 6], [g.x + 6, g.y + 6]);
  if (pts.length < 4) return worldExtent();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return [x0 - 4, y0 - 4, x1 + 4, y1 + 4];
}
SP.fit = fit;
$('#sp-fit').onclick = () => fit();
const zoomAt = (f, sx, sy) => { const [wx, wy] = toWorld(sx, sy); view.z *= f; view.x = wx - sx / view.z; view.y = wy - sy / view.z; draw(); };
$('#sp-zin').onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(1.4, r.width / 2, r.height / 2); };
$('#sp-zout').onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(1 / 1.4, r.width / 2, r.height / 2); };
cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
for (const id of ['#sp-show-plan', '#sp-show-obs', '#sp-show-paths']) $(id).onchange = draw;

// ---------------------------------------------------------------- steps
function setStep(n) {
  S.step = n;
  $$('.sp-steps button').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.step === n)));
  $$('.sp-pane').forEach((p) => { p.hidden = +p.dataset.pane !== n; });
  setTool(null); hintForStep();
}
$$('.sp-steps button').forEach((b) => (b.onclick = () => setStep(+b.dataset.step)));
SP.setStep = setStep;
function hint(msg, kind) { const h = $('#sp-hint'); h.textContent = msg || ''; if (kind) h.dataset.kind = kind; else delete h.dataset.kind; }
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
function hintForStep() {
  const n = S.step;
  if (!S.plan) return hint(L('Start with a plan: choose a file, drop one on the canvas, or try a sample.', '先放入圖則：選擇檔案、拖放到畫布，或試用示例。'));
  if (n === 2 && !S.calibrated) return hint(L('Not to scale yet: click "Pick two points", click both ends of a known dimension, type it in mm, then "Set scale".', '尚未定比例：按「點選兩點」，點選已知尺寸的兩端，輸入毫米數，再按「設定比例」。'), 'err');
  if (n === 3) return hint(L('Drag the entrance and the exit as arrows (direction of travel), then drag bay rows along the aisle edge.', '以箭咀拖出入口及出口（行車方向），再沿車道邊拖出一排車位。'));
  if (n === 4) return hint(L('Pick the vehicle and press "Check every bay".', '選擇車輛，再按「檢查每個車位」。'));
  if (n === 2) return hint(L('Check the grey overlay: every wall and column must be grey. Trace hatched walls with Wall. Shapes ringed in orange were ignored: check each one is not a column.', '請核對灰色圖層：所有牆及柱都應呈灰色。剖面線牆請用「牆」描出。橙圈內的圖形已略去：請逐一核對並非柱。'));
  hint(TOUCH ? L('Drag to pan, use + / − to zoom.', '拖動以移動，用 + / − 縮放。') : L('Drag to pan, scroll to zoom.', '拖動以移動，滾動以縮放。'));
}

// ---------------------------------------------------------------- loading
const fileInput = $('#sp-file');
fileInput.onchange = () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); };
stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag'); });
stage.addEventListener('dragleave', () => stage.classList.remove('drag'));
stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

async function loadFile(file, opts = {}) {
  const name = file.name || 'plan', ext = name.toLowerCase().split('.').pop();
  resetAll(); S.file = name;
  hint(L('Reading ' + name + ' …', '正在讀取 ' + name + ' …'));
  try {
    if (ext === 'pdf' || file.type === 'application/pdf') await loadPDF(file);
    else if (ext === 'dxf') await loadDXF(file, opts);
    else await loadImage(file);
  } catch (err) {
    console.error(err); hint(L('Could not read this file: ', '無法讀取此檔案：') + (err.message || err), 'err'); return false;
  }
  stage.classList.add('loaded');
  if (S.kind !== 'dxf') detect(); else dxfObstacles();
  fit(worldExtent());
  updateInfo();
  if (!opts.keepStep) setStep(S.kind === 'dxf' ? 1 : 2);
  hintForStep();
  return true;
}
SP.loadFile = loadFile;
function resetAll() {
  stopRun(); S.results.clear(); S.sel = null; S.anims = [];
  S.entry = S.exit = null; S.rows = []; S.singles = []; S.edits = []; S.cal = [];
  S.dxf = null; S.plan = null; S.auto = null; S.grid = null; S.obsBmp = null; S.symbols = []; S.calibrated = false; S.ox = 0; S.oy = 0; S.unitM = 0.001;
  $('#sp-dxfbox').hidden = true; renderList();
}
async function loadPDF(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const page = await doc.getPage(1), vp0 = page.getViewport({ scale: 1 });
  const k = Math.min(6, 4200 / Math.max(vp0.width, vp0.height)), vp = page.getViewport({ scale: k });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: cx, viewport: vp }).promise;
  S.plan = c; S.kind = 'pdf';
  S.s = (0.0254 / 72) * 100 / k; // provisional: 1:100 on paper until calibrated
  S.pdfPages = doc.numPages;
}
async function loadImage(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 6000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(bmp, 0, 0, c.width, c.height);
  S.plan = c; S.kind = 'image'; S.s = 0.02;
}
async function loadDXF(file, opts) {
  const text = await file.text();
  const d = parseDXF(text);
  if (!d.items.length) throw new Error(L('no drawable entities in model space', '模型空間內沒有可讀取的圖元'));
  S.dxf = d; S.kind = 'dxf';
  S.dxfUnits = opts.units || 'auto';
  $('#sp-dxf-units').value = S.dxfUnits;
  S.dxfSel = new Set(opts.layers || guessObstacleLayers(d.layers));
  buildDxfWorld();
  renderLayers();
  $('#sp-dxfbox').hidden = false;
}
function buildDxfWorld() {
  const d = S.dxf, u = unitScale(d, S.dxfUnits);
  // robust extents: ignore far-away stray entities (2nd-98th percentile of points, then grow)
  const xs = [], ys = [];
  for (const it of d.items) for (const p of it.pts) { xs.push(p[0] * u); ys.push(p[1] * u); }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * f)))];
  let x0 = q(xs, 0.0), x1 = q(xs, 1.0), y0 = q(ys, 0.0), y1 = q(ys, 1.0);
  if ((x1 - x0) > 3 * (q(xs, 0.98) - q(xs, 0.02)) + 50) { x0 = q(xs, 0.02); x1 = q(xs, 0.98); }
  if ((y1 - y0) > 3 * (q(ys, 0.98) - q(ys, 0.02)) + 50) { y0 = q(ys, 0.02); y1 = q(ys, 0.98); }
  const m = 3; S.ox = x0 - m; S.oy = y1 + m; S.unitM = u;
  S.dxfW = d.items.map((it) => ({ layer: it.layer, closed: it.closed, fill: it.fill, pts: it.pts.map((p) => [p[0] * u - S.ox, S.oy - p[1] * u]) }));
  const W = x1 - x0 + 2 * m, H = y1 - y0 + 2 * m;
  const r = Math.max(0.025, Math.max(W, H) / 6000);
  const c = document.createElement('canvas'); c.width = Math.ceil(W / r); c.height = Math.ceil(H / r);
  const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
  cx.setTransform(1 / r, 0, 0, 1 / r, 0, 0); cx.lineWidth = r * 1.2; cx.strokeStyle = '#333'; cx.fillStyle = '#bbb';
  for (const it of S.dxfW) {
    cx.beginPath(); it.pts.forEach((p, i) => (i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1]))); if (it.closed) cx.closePath();
    if (it.fill) cx.fill(); cx.stroke();
  }
  S.plan = c; S.s = r; S.calibrated = true;
}
function renderLayers() {
  const ul = $('#sp-layers'); ul.innerHTML = '';
  const cnt = {}; for (const it of S.dxf.items) cnt[it.layer] = (cnt[it.layer] || 0) + 1;
  for (const l of S.dxf.layers) {
    if (!cnt[l]) continue;
    const li = document.createElement('li');
    li.innerHTML = `<label><input type="checkbox" value="${l.replace(/"/g, '&quot;')}" ${S.dxfSel.has(l) ? 'checked' : ''}> <span></span><small>${cnt[l]}</small></label>`;
    li.querySelector('span').textContent = l; ul.appendChild(li);
  }
}
$('#sp-dxf-apply').onclick = () => {
  S.dxfSel = new Set($$('#sp-layers input:checked').map((i) => i.value));
  const units = $('#sp-dxf-units').value;
  if (units !== S.dxfUnits) { S.dxfUnits = units; buildDxfWorld(); fit(worldExtent()); }
  dxfObstacles(); clearResults(); draw(); updateInfo();
};

// ---------------------------------------------------------------- obstacles
function gridDims() { return [Math.ceil(S.plan.width * S.s / CELL), Math.ceil(S.plan.height * S.s / CELL)]; }
function detect() {
  if (!S.plan) return;
  const t0 = performance.now();
  // working resolution: pixels no smaller than 20 mm (keeps the morphology fast on big renders)
  const f = Math.max(1, Math.floor(0.02 / S.s));
  const w = Math.round(S.plan.width / f), h = Math.round(S.plan.height / f), sw = S.s * f;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(S.plan, 0, 0, w, h);
  const m = darkMask(cx.getImageData(0, 0, w, h), S.thr);
  const op = opening(m, w, h, (S.stroke / 2000) / sw);
  S.symbols = dropSymbols(op, w, h, sw);              // aisle arrows and other small filled symbols are not structure
  const g = toGrid(op, w, h, sw, CELL, 0.5);
  const [gw, gh] = gridDims();
  S.auto = { w: gw, h: gh, cell: CELL, data: new Uint8Array(gw * gh) };
  for (let y = 0; y < Math.min(gh, g.h); y++) for (let x = 0; x < Math.min(gw, g.w); x++) S.auto.data[y * gw + x] = g.data[y * g.w + x];
  applyEdits();
  S.detectMs = Math.round(performance.now() - t0);
}
function dxfObstacles() {
  const [gw, gh] = gridDims();
  const c = document.createElement('canvas'); c.width = gw; c.height = gh;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, gw, gh); cx.setTransform(1 / CELL, 0, 0, 1 / CELL, 0, 0);
  cx.fillStyle = '#000'; cx.strokeStyle = '#000'; cx.lineWidth = 0.2; cx.lineCap = 'round'; cx.lineJoin = 'round';
  for (const it of S.dxfW) {
    if (!S.dxfSel.has(it.layer)) continue;
    cx.beginPath(); it.pts.forEach((p, i) => (i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])));
    if (it.closed) cx.closePath();
    const area = it.closed ? Math.abs(polyArea(it.pts)) : 0;
    if (it.fill || (it.closed && area < 4)) cx.fill();
    cx.stroke();
  }
  const id = cx.getImageData(0, 0, gw, gh).data, data = new Uint8Array(gw * gh);
  for (let i = 0; i < data.length; i++) data[i] = id[i * 4] < 128 ? 1 : 0;
  // small filled symbols (arrows): found on a finer render, then only the 100 mm cells whose ink was all symbol are cleared
  const f = Math.max(1, Math.min(4, Math.floor(Math.sqrt(24e6 / (gw * gh))))), fw = gw * f, fh = gh * f;
  const c2 = document.createElement('canvas'); c2.width = fw; c2.height = fh;
  const x2 = c2.getContext('2d', { willReadFrequently: true });
  x2.fillStyle = '#fff'; x2.fillRect(0, 0, fw, fh); x2.setTransform(f / CELL, 0, 0, f / CELL, 0, 0);
  x2.fillStyle = '#000'; x2.strokeStyle = '#000'; x2.lineWidth = 0.2; x2.lineCap = 'round'; x2.lineJoin = 'round';
  for (const it of S.dxfW) {
    if (!S.dxfSel.has(it.layer)) continue;
    x2.beginPath(); it.pts.forEach((p, i) => (i ? x2.lineTo(p[0], p[1]) : x2.moveTo(p[0], p[1])));
    if (it.closed) x2.closePath();
    if (it.fill || (it.closed && Math.abs(polyArea(it.pts)) < 4)) x2.fill();
    x2.stroke();
  }
  const fd = x2.getImageData(0, 0, fw, fh).data, fm = new Uint8Array(fw * fh);
  for (let i = 0; i < fm.length; i++) fm[i] = fd[i * 4] < 128 ? 1 : 0;
  const before = new Uint8Array(fm);
  S.symbols = dropSymbols(fm, fw, fh, CELL / f);
  if (S.symbols.length) for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (!data[y * gw + x]) continue;
    let had = 0, left = 0;
    for (let v = 0; v < f; v++) for (let u = 0; u < f; u++) { const j = (y * f + v) * fw + x * f + u; had += before[j]; left += fm[j]; }
    if (had && !left) data[y * gw + x] = 0;
  }
  S.auto = { w: gw, h: gh, cell: CELL, data };
  applyEdits();
}
function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function applyEdits() {
  const { w, h } = S.auto, data = new Uint8Array(S.auto.data);
  const g = { w, h, cell: CELL, data };
  for (const e of S.edits) {
    const v = e.op === 'add' ? 1 : 0;
    if (e.shape === 'rect') {
      const [a, b] = e.pts; fillPoly(g, [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]], v);
    } else {
      const pts = e.pts;
      if (pts.length === 1) fillPoly(g, circlePoly(pts[0], e.r), v);
      for (let i = 1; i < pts.length; i++) { fillPoly(g, segPoly(pts[i - 1], pts[i], e.r), v); fillPoly(g, circlePoly(pts[i], e.r), v); }
    }
  }
  S.grid = g;
  // overlay bitmap
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d'), im = cx.createImageData(w, h);
  for (let i = 0; i < data.length; i++) if (data[i]) { im.data[i * 4] = 60; im.data[i * 4 + 1] = 72; im.data[i * 4 + 2] = 92; im.data[i * 4 + 3] = 150; }
  cx.putImageData(im, 0, 0); S.obsBmp = c;
  clearResults(); updateInfo(); draw();
}
function circlePoly(c, r) { const o = []; for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2; o.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); } return o; }
$('#sp-thr').oninput = (e) => { S.thr = +e.target.value; };
$('#sp-thr').onchange = () => { if (S.kind !== 'dxf') detect(); };
$('#sp-stroke').onchange = (e) => { S.stroke = +e.target.value; if (S.kind !== 'dxf') detect(); };
$('#sp-detect').onclick = () => (S.kind === 'dxf' ? dxfObstacles() : detect());
$('#sp-undo').onclick = () => { if (S.edits.length) { S.edits.pop(); applyEdits(); } };

// ---------------------------------------------------------------- calibration
$('#sp-cal').onclick = () => setTool(S.tool === 'cal' ? null : 'cal');
$('#sp-cal-ok').onclick = () => {
  if (S.cal.length < 2) return;
  const mm = +$('#sp-cal-mm').value; if (!(mm > 0)) return;
  const [a, b] = S.cal, dpx = Math.hypot(b[0] - a[0], b[1] - a[1]) / S.s; // plan pixels
  setScale(mm / 1000 / dpx);
  S.cal = []; setTool(null); $('#sp-cal-ok').disabled = true;
};
function setScale(sNew) {
  const k = sNew / S.s;
  const sc = (p) => [p[0] * k, p[1] * k];
  if (S.entry) Object.assign(S.entry, { x: S.entry.x * k, y: S.entry.y * k });
  if (S.exit) Object.assign(S.exit, { x: S.exit.x * k, y: S.exit.y * k });
  for (const r of S.rows) { r.a = sc(r.a); r.b = sc(r.b); }
  for (const b of S.singles) b.c = sc(b.c);
  for (const e of S.edits) e.pts = e.pts.map(sc);
  view.x *= k; view.y *= k; view.z /= k;
  S.s = sNew; S.calibrated = true;
  if (S.kind === 'dxf') dxfObstacles(); else detect();
  updateInfo(); hintForStep(); draw();
}
SP.setScale = setScale;

// ---------------------------------------------------------------- tools and pointer
function setTool(t) {
  S.tool = t; S.temp = null;
  $$('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  $('#sp-cal').setAttribute('aria-pressed', String(t === 'cal'));
  stage.classList.toggle('tool', !!t);
  const help = {
    cal: L('Click the first point, then the second.', '點選第一點，再點選第二點。'),
    wall: L('Click wall corners; double-click or Enter to finish.', '點選牆的轉角；雙擊或按 Enter 完成。'),
    col: L('Drag a box over the column.', '在柱上拖出方框。'),
    brush: L('Paint obstacles.', '塗上障礙物。'), erase: L('Rub out false obstacles.', '擦去誤認的障礙物。'),
    entry: L('Drag from the entrance in the direction cars drive in.', '由入口沿車輛駛入方向拖動。'),
    exit: L('Drag from the exit in the direction cars drive out.', '由出口沿車輛駛出方向拖動。'),
    row: L('Drag along the aisle edge of a row of bays (bays go to the left of the drag; press F or "Flip last row" to swap).', '沿一排車位的車道邊拖動（車位在拖動方向左邊；按 F 或「反轉最後一排」對調）。'),
    single: L('Drag from the bay entrance (aisle side) towards the back of the bay.', '由車位入口（車道一邊）向車位後方拖動。'),
    del: L('Click a bay, a row or a gate to delete it.', '點選車位、一排車位或出入口以刪除。'),
  };
  if (t) hint(help[t]); else hintForStep();
  if (S.step === 3) $('#sp-mark-help').textContent = t ? help[t] || '' : '';
  draw();
}
$$('[data-tool]').forEach((b) => (b.onclick = () => setTool(S.tool === b.dataset.tool ? null : b.dataset.tool)));

let drag = null;
const evW = (e) => { const r = cv.getBoundingClientRect(); return toWorld(e.clientX - r.left, e.clientY - r.top); };
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  const w = evW(e);
  if (!S.tool || e.button === 1 || e.button === 2 || spaceDown) { drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; return; }
  const t = S.tool;
  if (t === 'cal') { S.cal.push(w); if (S.cal.length > 2) S.cal = [w]; $('#sp-cal-ok').disabled = S.cal.length < 2; updateInfo(); draw(); return; }
  if (t === 'wall') { if (!S.temp) S.temp = { pts: [w] }; else S.temp.pts.push(w); draw(); return; }
  if (t === 'del') { deleteAt(w); return; }
  drag = { tool: t, a: w, b: w, pts: [w] };
});
cv.addEventListener('pointermove', (e) => {
  const w = evW(e);
  $('#sp-cursor').textContent = S.plan ? `x ${w[0].toFixed(2)}  y ${w[1].toFixed(2)} m${S.calibrated ? '' : ' ?'}` : '';
  if (!drag) { if (S.tool === 'wall' && S.temp) { S.temp.hover = w; draw(); } return; }
  if (drag.pan) { view.x = drag.vx - (e.clientX - drag.sx) / view.z; view.y = drag.vy - (e.clientY - drag.sy) / view.z; draw(); return; }
  drag.b = w; if (drag.tool === 'brush' || drag.tool === 'erase') drag.pts.push(w);
  S.temp = { ...drag }; draw();
});
cv.addEventListener('pointerup', (e) => {
  const d = drag; drag = null; if (!d || d.pan) return;
  const len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
  const size = (+$('#sp-brush').value || 300) / 1000;
  switch (d.tool) {
    case 'col': if (len > 0.1) { S.edits.push({ op: 'add', shape: 'rect', pts: [[Math.min(d.a[0], d.b[0]), Math.min(d.a[1], d.b[1])], [Math.max(d.a[0], d.b[0]), Math.max(d.a[1], d.b[1])]] }); applyEdits(); } break;
    case 'brush': case 'erase': S.edits.push({ op: d.tool === 'brush' ? 'add' : 'erase', shape: 'poly', pts: d.pts, r: size / 2 }); applyEdits(); break;
    case 'entry': case 'exit': {
      if (len < 0.3) { hint(L('Drag a little further to give the direction.', '請拖長一點以定方向。'), 'err'); break; }
      S[d.tool] = { x: d.a[0], y: d.a[1], th: Math.atan2(d.b[1] - d.a[1], d.b[0] - d.a[0]), w: +$('#sp-gatew').value || 6 };
      clearResults(); break;
    }
    case 'row': if (len > 1) { S.rows.push({ a: d.a, b: d.b, angle: +$('#sp-angle').value, side: 1, L: +$('#sp-bayl').value, W: +$('#sp-bayw').value }); clearResults(); } break;
    case 'single': if (len > 0.5) {
      const ax = [(d.b[0] - d.a[0]) / len, (d.b[1] - d.a[1]) / len], Lb = +$('#sp-bayl').value, Wb = +$('#sp-bayw').value;
      S.singles.push({ c: [d.a[0] + ax[0] * Lb / 2, d.a[1] + ax[1] * Lb / 2], th: Math.atan2(ax[1], ax[0]), L: Lb, W: Wb }); clearResults();
    } break;
  }
  S.temp = null; updateInfo(); draw();
});
cv.addEventListener('dblclick', () => finishWall());
let spaceDown = false;
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input,select,textarea')) return;
  if (e.key === ' ') { spaceDown = true; e.preventDefault(); }
  if (e.key === 'Enter') finishWall();
  if (e.key === 'Escape') { S.temp = null; drag = null; setTool(null); }
  if (e.key === 'f' || e.key === 'F') flipLast();
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });
function finishWall() {
  if (S.tool !== 'wall' || !S.temp || S.temp.pts.length < 2) return;
  const pts = S.temp.pts.filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.05);
  S.edits.push({ op: 'add', shape: 'poly', pts, r: ((+$('#sp-brush').value || 300) / 1000) / 2 }); S.temp = null; applyEdits();
}
function flipLast() { const r = S.rows[S.rows.length - 1]; if (r) { r.side *= -1; clearResults(); updateInfo(); draw(); } }
$('#sp-flip').onclick = flipLast;
$('#sp-clearmarks').onclick = () => { S.entry = S.exit = null; S.rows = []; S.singles = []; clearResults(); updateInfo(); draw(); };
function deleteAt(w) {
  for (const g of ['entry', 'exit']) if (S[g] && Math.hypot(S[g].x - w[0], S[g].y - w[1]) < 2.5) { S[g] = null; clearResults(); updateInfo(); draw(); return; }
  for (const b of allBays()) if (inPoly(w, b.poly)) {
    if (b.row != null) S.rows.splice(b.row, 1); else S.singles.splice(b.single, 1);
    clearResults(); updateInfo(); draw(); return;
  }
}
function inPoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

// ---------------------------------------------------------------- bays
function rowBays(r) {
  const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1], len = Math.hypot(dx, dy); if (len < 0.5) return [];
  const u = [dx / len, dy / len], n = [-u[1] * r.side, u[0] * r.side], th = r.angle * Math.PI / 180;
  const out = [];
  if (r.angle === 0) {
    const cnt = Math.floor((len + 0.3) / r.L);
    for (let i = 0; i < cnt; i++) {
      const P = [r.a[0] + u[0] * i * r.L, r.a[1] + u[1] * i * r.L];
      const poly = [P, [P[0] + u[0] * r.L, P[1] + u[1] * r.L], [P[0] + u[0] * r.L + n[0] * r.W, P[1] + u[1] * r.L + n[1] * r.W], [P[0] + n[0] * r.W, P[1] + n[1] * r.W]];
      out.push({ c: [P[0] + u[0] * r.L / 2 + n[0] * r.W / 2, P[1] + u[1] * r.L / 2 + n[1] * r.W / 2], ax: u, L: r.L, W: r.W, angle: 0, poly });
    }
    return out;
  }
  const c = Math.cos(th), s = Math.sin(th);
  const d = [c * u[0] + s * n[0], c * u[1] + s * n[1]], e = [s * u[0] - c * n[0], s * u[1] - c * n[1]];
  const pitch = r.W / s, cnt = Math.floor((len + 0.3) / pitch);  // a drag up to 0.3 m short still counts the last bay
  for (let i = 0; i < cnt; i++) {
    const Q = [r.a[0] + u[0] * i * pitch + n[0] * r.W * c, r.a[1] + u[1] * i * pitch + n[1] * r.W * c];
    const F = [Q[0] + e[0] * r.W, Q[1] + e[1] * r.W];
    const poly = [Q, F, [F[0] + d[0] * r.L, F[1] + d[1] * r.L], [Q[0] + d[0] * r.L, Q[1] + d[1] * r.L]];
    out.push({ c: [Q[0] + e[0] * r.W / 2 + d[0] * r.L / 2, Q[1] + e[1] * r.W / 2 + d[1] * r.L / 2], ax: d, L: r.L, W: r.W, angle: r.angle, poly });
  }
  return out;
}
function allBays() {
  const out = []; let k = 0;
  S.rows.forEach((r, ri) => { for (const b of rowBays(r)) { b.row = ri; b.id = 'B' + String(++k).padStart(2, '0'); out.push(b); } });
  S.singles.forEach((sb, si) => {
    const ax = [Math.cos(sb.th), Math.sin(sb.th)], n = [-ax[1], ax[0]], hl = sb.L / 2, hw = sb.W / 2, c = sb.c;
    const P = (a, b) => [c[0] + ax[0] * a + n[0] * b, c[1] + ax[1] * a + n[1] * b];
    out.push({ c, ax, L: sb.L, W: sb.W, angle: 90, poly: [P(-hl, -hw), P(-hl, hw), P(hl, hw), P(hl, -hw)], single: si, id: 'B' + String(++k).padStart(2, '0') });
  });
  return out;
}
SP.allBays = allBays;

// ---------------------------------------------------------------- vehicles
function preset() { return PRESETS.find((p) => p.id === S.vehId); }
function vehicle() { return makeVehicle(preset(), S.vOver); }
function buildVehSelect() {
  const sel = $('#sp-veh'), cur = S.vehId; sel.innerHTML = '';
  for (const p of PRESETS) { const o = document.createElement('option'); o.value = p.id; o.textContent = lang() === 'zh' ? p.zh : p.en; sel.appendChild(o); }
  sel.value = cur; buildVehTable();
}
function buildVehTable() {
  const p = preset(), v = vehicle(), u = new Set(p.u || []);
  const rows = [
    ['L', L('Length', '車長'), 'L'], ['W', L('Width', '車闊'), 'W'], ['FOH', L('Front overhang', '前懸'), 'FOH'], ['WB', L('Wheelbase', '軸距'), 'WB'],
    ['ROH', L('Rear overhang', '後懸'), 'ROH'], ['Rk', L('Kerb-to-kerb radius', '路壆至路壆半徑'), 'Rk'], ['T', L('Track', '輪距'), 'T', true],
    ['lockDist', L('Lock to lock travel', '左盡至右盡行車距離'), 'lockDist', true],
  ];
  if (p.artic) { rows.splice(0, 1); rows.splice(5, 0, ['KP', L('Kingpin ahead of rear axle', '牽引銷在後軸前'), 'KP'], ['A3', L('Trailer wheelbase', '拖架軸距'), 'A3'], ['VF', L('Trailer front overhang', '拖架前懸'), 'VF'], ['VB', L('Trailer rear overhang', '拖架後懸'), 'VB']); }
  let h = '<table class="sp-vt">';
  for (const [k, label, key, assumed] of rows) {
    const val = S.vOver[key] != null ? S.vOver[key] : (key === 'T' ? v.T : key === 'lockDist' ? v.lockDist : p[key]);
    h += `<tr class="${u.has(k) || assumed ? 'u' : ''}"><td>${label}</td><td><input data-k="${key}" type="number" step="0.01" value="${(+val).toFixed(3).replace(/\.?0+$/, '')}"> m</td></tr>`;
  }
  h += '</table>';
  h += `<p class="sp-meta">${L('Rear-axle min radius', '後軸最小半徑')} ${v.Rmin.toFixed(2)} m\n${L('Wall-to-wall radius (ours)', '牆至牆半徑（本工具）')} ${v.RwCalc.toFixed(2)} m${p.Rw ? `  ·  TPDM ${p.Rw.toFixed(2)} m` : ''}\n${L('Bay (HKPSG)', '車位（規劃標準）')} ${p.bay[0]} × ${p.bay[1]} m\n${L('Source', '來源')}: ${p.src}</p>`;
  $('#sp-vtable').innerHTML = h;
  $$('#sp-vtable input').forEach((i) => (i.onchange = () => { const x = parseFloat(i.value); if (x > 0) S.vOver[i.dataset.k] = x; clearResults(); buildVehTable(); }));
}
$('#sp-veh').onchange = (e) => setVehicle(e.target.value);
function setVehicle(id) {
  S.vehId = id; S.vOver = {}; const p = preset();
  $('#sp-veh').value = id; $('#sp-bayl').value = p.bay[0]; $('#sp-bayw').value = p.bay[1];
  clearResults(); buildVehTable(); draw();
}
SP.setVehicle = setVehicle;
$('#sp-buf').onchange = (e) => { S.buffer = (+e.target.value) / 1000; clearResults(); };
$('#sp-buf2').onchange = (e) => { S.reduced = (+e.target.value) / 1000; clearResults(); };
$('#sp-empty').onchange = (e) => { S.empty = e.target.checked; clearResults(); };

// ---------------------------------------------------------------- run
function clearResults() { if (S.running) stopRun(); S.results.clear(); S.union = null; S.sel = null; S.anims = []; renderList(); }
function stopRun() {
  if (S.worker) { S.worker.terminate(); S.worker = null; }
  S.running = false; $('#sp-run').disabled = false; $('#sp-cancel').hidden = true;
}
$('#sp-cancel').onclick = () => { stopRun(); $('#sp-progtxt').textContent = L('Cancelled', '已取消'); };
$('#sp-run').onclick = () => run();
let runResolve = null;
function run() {
  const bays = allBays();
  if (!S.grid) { hint(L('Load a plan first.', '請先放入圖則。'), 'err'); return Promise.resolve(false); }
  if (!S.entry) { hint(L('Mark the entrance first (step 3).', '請先標示入口（第 3 步）。'), 'err'); return Promise.resolve(false); }
  if (!bays.length) { hint(L('Mark at least one bay (step 3).', '請最少標示一個車位（第 3 步）。'), 'err'); return Promise.resolve(false); }
  clearResults(); S.running = true; S.done = 0; S.phase = null; S.t0 = performance.now();
  const v = vehicle();
  S.order = bays.map((b, i) => [i, Math.hypot(b.c[0] - S.entry.x, b.c[1] - S.entry.y)]).sort((a, b) => a[1] - b[1]).map((q) => q[0]);
  const w = new Worker(new URL('./planner.worker.js', import.meta.url), { type: 'module' });
  S.worker = w; S.runBays = bays; S.runVeh = v;
  w.onmessage = (e) => onWorker(e.data);
  w.onerror = (e) => { console.error(e); hint(L('The checker stopped: ', '檢查中斷：') + (e.message || ''), 'err'); stopRun(); };
  w.postMessage({ type: 'grid', grid: { w: S.grid.w, h: S.grid.h, cell: CELL, data: S.grid.data } });
  w.postMessage({ type: 'run', vehicle: { ...preset(), ...S.vOver }, settings: { buffer: S.buffer, reduced: S.reduced, empty: S.empty, reqBay: HKPSG_BAYS[S.vehId] },
    bays: bays.map((b) => ({ id: b.id, c: b.c, ax: b.ax, L: b.L, W: b.W, angle: b.angle })), entry: S.entry, exit: S.exit, order: S.order });
  $('#sp-run').disabled = true; $('#sp-cancel').hidden = false; $('#sp-prog').hidden = false; progress();
  return new Promise((res) => { runResolve = res; });
}
SP.run = run;
function onWorker(m) {
  if (m.type === 'error') { console.error(m.msg); hint(L('The checker hit an error.', '檢查出錯。'), 'err'); stopRun(); if (runResolve) runResolve(false); return; }
  if (m.type === 'done') {
    S.running = false; S.worker && S.worker.terminate(); S.worker = null;
    $('#sp-run').disabled = false; $('#sp-cancel').hidden = true; S.runMs = Math.round(performance.now() - S.t0);
    progress(); renderList(); draw(); if (runResolve) { runResolve(true); runResolve = null; } return;
  }
  if (m.type === 'phase') { S.phase = m.what; progress(); return; }
  if (m.type === 'bay') {
    S.phase = null; prepResult(m); S.results.set(m.id, m); S.done++;
    if (!SP.noAnim) S.anims.push({ id: m.id, t0: performance.now(), dur: 900 });
    progress(); renderList(); kick();
  }
}
function progress() {
  const n = S.runBays ? S.runBays.length : 0;
  $('#sp-progbar').style.width = n ? (100 * S.done / n) + '%' : '0';
  $('#sp-progtxt').textContent = S.running && S.phase === 'route' ? L('Working out the routes through the car park…', '正在計算停車場內的行車路線…') : S.running ? L(`Bay ${S.done + 1} of ${n}`, `第 ${S.done + 1} / ${n} 個車位`) : n ? L(`${S.done} of ${n} bays checked`, `已檢查 ${S.done} / ${n} 個車位`) + (S.runMs ? ` · ${(S.runMs / 1000).toFixed(1)} s` : '') : '';
}
const ringPath = (rings) => { const p = new Path2D(); for (const r of rings) { r.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]))); p.closePath(); } return p; };
function prepResult(r) {
  if (!S.union) S.union = { g: new Path2D(), a: new Path2D(), r: new Path2D() };
  for (const k of ['in', 'out']) if (r[k]) { r[k].bodyP = ringPath(r[k].body.rings); r[k].clearP = ringPath(r[k].clear.rings); S.union[r.grade].addPath(r[k].clearP); }
  if (r.clash && r.clash.length) {
    const p = new Path2D(), w = S.grid.w, cl = new Map();
    for (const i of r.clash) {
      const x = (i % w) * CELL, y = ((i / w) | 0) * CELL; p.rect(x, y, CELL, CELL);
      const k = Math.floor(x / 1.5) + ',' + Math.floor(y / 1.5); if (!cl.has(k)) cl.set(k, []); cl.get(k).push([x + CELL / 2, y + CELL / 2]);
    }
    r.clashP = p;
    // one halo per cluster of clash cells
    r.clashC = [...cl.values()].map((pts) => { const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      return [cx, cy, 0.6 + Math.max(...pts.map((q) => Math.hypot(q[0] - cx, q[1] - cy)))]; });
  }
}

// ---------------------------------------------------------------- results list
const REASON = {
  'in-none': ['Cannot get in', '駛不進'], 'in-limit': ['In: no path found within the search limit', '駛入：在搜尋上限內找不到路徑'], 'g-limit': ['One-manoeuvre search stopped at its limit: a cleaner path may exist', '一次操控的搜尋已達上限：或有更簡單的路線'], 'out-limit': ['Out: no path found within the search limit', '駛出：在搜尋上限內找不到路徑'], 'in-shunts': ['In: extra shunts', '駛入需額外前後移動'], 'in-buffer': ['In: only with the smaller buffer', '駛入只能以較小緩衝'],
  'in-lockrev': ['In: steering lock reversed on the final move', '駛入最後一步需反方向扭軚'], 'out-none': ['Cannot get out to the exit', '駛不出出口'],
  'out-shunts': ['Out: extra shunts', '駛出需額外前後移動'], 'in-many': ['In: three or more gear changes', '駛入需轉波三次或以上'], 'out-many': ['Out: three or more gear changes', '駛出需轉波三次或以上'], 'out-buffer': ['Out: only with the smaller buffer', '駛出只能以較小緩衝'],
};
function reasonText(r) {
  const out = [];
  for (const k of r.reasons) {
    let t = L(...REASON[k]);
    if ((k === 'in-shunts' || k === 'in-many') && r.in) t += ` (${r.in.cusps} ${L('gear changes', '次轉波')})`;
    if ((k === 'out-shunts' || k === 'out-many') && r.out) t += ` (${r.out.cusps} ${L('gear changes', '次轉波')})`;
    out.push(t);
  }
  if (!out.length && r.grade === 'g') out.push(r.in && r.in.pose === 'fwd' ? L('Forward in, one manoeuvre', '車頭泊入，一次操控') : L('Reverse in, one manoeuvre', '倒車泊入，一次操控'));
  return out.join('; ');
}
function flagText(f) {
  return f.map((x) => x.k === 'size' ? L(`Bay ${x.L} × ${x.W} m is below HKPSG ${x.req[0]} × ${x.req[1]} m`, `車位 ${x.L} × ${x.W} 米小於規劃標準 ${x.req[0]} × ${x.req[1]} 米`)
    : L(`Beside a wall: TPDM asks ${x.need.toFixed(2)} m wide`, `車位靠牆：運輸署要求闊 ${x.need.toFixed(2)} 米`)).join('; ');
}
function counts() { const c = { g: 0, a: 0, r: 0 }; for (const r of S.results.values()) c[r.grade]++; return c; }
function renderList() {
  const c = counts(), n = S.results.size;
  $('#sp-sum').innerHTML = n ? `<span class="g">${c.g} ${L('green', '綠')}</span><span class="a">${c.a} ${L('amber', '黃')}</span><span class="r">${c.r} ${L('red', '紅')}</span>` : '';
  if (!n) { $('#sp-list').innerHTML = ''; return; }
  const bays = S.runBays || allBays();
  let h = `<table><thead><tr><th>${L('Bay', '車位')}</th><th>${L('In', '入')}</th><th>${L('Out', '出')}</th><th>${L('Clear', '緩衝')}</th><th>${L('Why', '原因')}</th></tr></thead><tbody>`;
  for (const b of bays) {
    const r = S.results.get(b.id);
    if (!r) { h += `<tr data-id="${b.id}"><td><span class="sp-dot p"></span>${b.id}</td><td colspan="4" class="sp-why">…</td></tr>`; continue; }
    const clr = Math.min(r.in ? r.in.minClr : Infinity, r.out ? r.out.minClr : Infinity);
    h += `<tr data-id="${b.id}" class="${S.sel === b.id ? 'sel' : ''}"><td><span class="sp-dot ${r.grade}"></span>${b.id}</td><td>${r.in ? r.in.cusps : '×'}</td><td>${r.out ? r.out.cusps : '×'}</td><td>${Number.isFinite(clr) ? Math.round(Math.max(0, clr) * 1000) : 'n/a'}</td>` +
      `<td><span class="sp-why">${reasonText(r)}</span>${r.flags.length ? `<br><span class="sp-flag">${flagText(r.flags)}</span>` : ''}</td></tr>`;
  }
  h += '</tbody></table>';
  $('#sp-list').innerHTML = h;
  $$('#sp-list tr[data-id]').forEach((tr) => (tr.onclick = () => selectBay(tr.dataset.id)));
}
function selectBay(id) {
  S.sel = id; renderList();
  const r = S.results.get(id); if (r) { S.anims = S.anims.filter((a) => a.id !== id); S.anims.push({ id, t0: performance.now(), dur: 2600, replay: true }); kick(); }
  draw();
}
SP.selectBay = selectBay;

// ---------------------------------------------------------------- drawing
let raf = 0;
function kick() { if (!raf) raf = requestAnimationFrame(frame); }
function frame() { raf = 0; const now = performance.now(); S.anims = S.anims.filter((a) => now - a.t0 < a.dur + 50); draw(now); if (S.anims.length) kick(); }
function draw(now = performance.now()) {
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, -view.x * view.z * dpr, -view.y * view.z * dpr);
  drawWorld(ctx, { z: view.z, now, screen: true });
  // labels in screen space
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawLabels(ctx, (x, y) => toScreen(x, y), view.z, 1);
}
function drawWorld(c, o) {
  const px = 1 / o.z; // one screen pixel in metres
  if (S.plan && (o.exportPlan !== false) && (!o.screen || $('#sp-show-plan').checked)) {
    c.save(); c.globalAlpha = o.screen ? 0.9 : 0.75; c.imageSmoothingEnabled = true; c.drawImage(S.plan, 0, 0, S.plan.width * S.s, S.plan.height * S.s); c.restore();
  }
  if (S.obsBmp && (!o.screen || $('#sp-show-obs').checked)) {
    c.save(); c.imageSmoothingEnabled = false; c.globalAlpha = o.screen ? 0.75 : 0.5; c.drawImage(S.obsBmp, 0, 0, S.grid.w * CELL, S.grid.h * CELL); c.restore();
    if (o.screen && S.symbols && S.symbols.length) {
      c.save(); c.strokeStyle = '#d9822b'; c.lineWidth = 0.08; c.setLineDash([0.25, 0.15]);
      for (const q of S.symbols) { c.beginPath(); c.arc(q.x, q.y, q.r, 0, Math.PI * 2); c.stroke(); }
      c.restore();
    }
  }
  const bays = S.results.size && S.runBays ? S.runBays : allBays();
  // bays
  for (const b of bays) {
    const r = S.results.get(b.id);
    c.beginPath(); b.poly.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath();
    if (r) { c.fillStyle = COL[r.grade]; c.globalAlpha = 0.32; c.fill(); c.globalAlpha = 1; }
    c.lineWidth = 1.2 * px; c.strokeStyle = r ? COL[r.grade] : '#3a5a8c'; c.stroke();
  }
  const showPaths = !o.screen || $('#sp-show-paths').checked;
  if (showPaths && S.results.size) {
    const anim = new Map(S.anims.map((a) => [a.id, a]));
    const sel = o.sel !== undefined ? o.sel : S.sel;
    // overview: one union fill per grade (no stacking), body outlines faint, clash halos
    if (S.union) for (const k of ['g', 'a', 'r']) { c.fillStyle = COL[k]; c.globalAlpha = sel ? 0.05 : 0.13; c.fill(S.union[k], 'nonzero'); }
    c.globalAlpha = 1;
    for (const b of bays) {
      const r = S.results.get(b.id); if (!r) continue;
      const a = anim.get(b.id);
      if (a && o.screen) { drawAnimated(c, r, Math.min(1, (o.now - a.t0) / a.dur), px, a.replay); continue; }
      if (b.id === sel) continue;
      if (!sel) for (const k of ['in']) if (r[k]) { c.strokeStyle = COL[r.grade]; c.globalAlpha = 0.45; c.lineWidth = 0.7 * px; c.stroke(r[k].bodyP); c.globalAlpha = 1; }
      drawClash(c, r, px, !sel);
    }
    if (sel && S.results.get(sel) && !anim.has(sel)) drawResult(c, S.results.get(sel), px, true);
  }
  // gates
  for (const [g, col] of [[S.entry, '#1d1c1a'], [S.exit, '#9c4a2f']]) if (g) drawGate(c, g, col, px);
  // tool previews
  if (o.screen) drawPreview(c, px);
}
function drawResult(c, r, px, strong) {
  const col = COL[r.grade];
  for (const k of ['in', 'out']) {
    const p = r[k]; if (!p) continue;
    c.fillStyle = col; c.globalAlpha = strong ? 0.16 : 0.05; c.fill(p.clearP, 'evenodd');
    c.globalAlpha = strong ? 0.9 : 0.35; c.lineWidth = (strong ? 1.6 : 0.8) * px; c.strokeStyle = col;
    if (k === 'out') c.setLineDash([6 * px, 4 * px]);
    c.stroke(p.bodyP); c.setLineDash([]); c.globalAlpha = 1;
    if (strong) { drawWheels(c, p.sm, px, k === 'out' ? '#6a4fb3' : '#1d1c1a'); drawOutlines(c, p.sm, px, col); }
  }
  if (r.template) {
    c.globalAlpha = strong ? 0.8 : 0.45; c.strokeStyle = COL.r; c.lineWidth = 1 * px; c.setLineDash([4 * px, 3 * px]);
    drawOutlines(c, r.template, px, COL.r, 1.5); c.setLineDash([]); c.globalAlpha = 1;
  }
  drawClash(c, r, px, true);
}
function drawClash(c, r, px, halo) {
  if (!r.clashP) return;
  c.fillStyle = COL.r; c.fill(r.clashP);
  if (halo && r.clashC) {
    c.strokeStyle = COL.r; c.lineWidth = 2.2 * px; c.fillStyle = 'rgba(192,57,43,0.16)';
    for (const [x, y, rad] of r.clashC) { c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill(); c.stroke(); }
  }
}
function poseOf(q) { return S.runVeh.artic ? [q[0], q[1], q[2], q[3]] : [q[0], q[1], q[2]]; }
function drawWheels(c, sm, px, col) {
  const v = S.runVeh, tracks = wheels(v, poseOf(sm[0])).map(() => []);
  for (let i = 0; i < sm.length; i += 2) wheels(v, poseOf(sm[i])).forEach((w, k) => tracks[k].push(w));
  c.strokeStyle = col; c.lineWidth = 0.8 * px; c.globalAlpha = 0.85;
  for (const t of tracks) { c.beginPath(); t.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); }
  c.globalAlpha = 1;
}
function drawOutlines(c, sm, px, col, every = 2) {
  const v = S.runVeh; let acc = 1e9;
  c.strokeStyle = col; c.lineWidth = 0.9 * px;
  for (let i = 0; i < sm.length; i++) {
    if (i) acc += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
    if (acc < every && i !== sm.length - 1) continue; acc = 0;
    for (const pl of bodies(v, poseOf(sm[i])).map((b) => rectPoly(b, 0))) { c.beginPath(); pl.forEach((q, j) => (j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.stroke(); }
  }
}
function drawAnimated(c, r, t, px, replay) {
  const segs = [r.in && r.in.sm, replay && r.out && r.out.sm].filter(Boolean);
  if (!segs.length && r.template) segs.push(r.template);
  const total = segs.reduce((a, s) => a + s.length, 0); let k = Math.floor(t * total);
  const v = S.runVeh, col = COL[r.grade];
  for (const sm of segs) {
    const n = Math.min(sm.length, k); if (n <= 0) break; k -= n;
    const trail = new Path2D();
    for (let i = 0; i < n; i += 3) for (const pl of bodies(v, poseOf(sm[i])).map((b) => rectPoly(b, S.buffer))) { pl.forEach((q, j) => (j ? trail.lineTo(q[0], q[1]) : trail.moveTo(q[0], q[1]))); trail.closePath(); }
    c.fillStyle = col; c.globalAlpha = 0.18; c.fill(trail, 'nonzero'); c.globalAlpha = 1;
    const cur = sm[n - 1];
    for (const pl of bodies(v, poseOf(cur)).map((b) => rectPoly(b, 0))) {
      c.beginPath(); pl.forEach((q, j) => (j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath();
      c.fillStyle = '#fff'; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1; c.strokeStyle = COL.ink; c.lineWidth = 1.6 * px; c.stroke();
    }
  }
  if (t >= 1 && r.clashP) { c.fillStyle = COL.r; c.fill(r.clashP); }
}
function drawGate(c, g, col, px) {
  const u = [Math.cos(g.th), Math.sin(g.th)], n = [-u[1], u[0]], h = g.w / 2;
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2 * px;
  c.beginPath(); c.moveTo(g.x + n[0] * h, g.y + n[1] * h); c.lineTo(g.x - n[0] * h, g.y - n[1] * h); c.stroke();
  const tip = [g.x + u[0] * 3, g.y + u[1] * 3];
  c.beginPath(); c.moveTo(g.x - u[0] * 1, g.y - u[1] * 1); c.lineTo(tip[0], tip[1]); c.stroke();
  c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(tip[0] - u[0] * 0.9 + n[0] * 0.5, tip[1] - u[1] * 0.9 + n[1] * 0.5); c.lineTo(tip[0] - u[0] * 0.9 - n[0] * 0.5, tip[1] - u[1] * 0.9 - n[1] * 0.5); c.closePath(); c.fill();
}
function drawPreview(c, px) {
  c.lineWidth = 1.5 * px; c.strokeStyle = '#9c4a2f'; c.fillStyle = 'rgba(156,74,47,.15)';
  for (const p of S.cal) { c.beginPath(); c.arc(p[0], p[1], 5 * px, 0, 7); c.stroke(); }
  if (S.cal.length === 2) { c.beginPath(); c.moveTo(...S.cal[0]); c.lineTo(...S.cal[1]); c.stroke(); }
  const t = S.temp; if (!t) return;
  if (t.tool === 'col') { c.fillRect(Math.min(t.a[0], t.b[0]), Math.min(t.a[1], t.b[1]), Math.abs(t.b[0] - t.a[0]), Math.abs(t.b[1] - t.a[1])); }
  if ((t.tool === 'brush' || t.tool === 'erase') && t.pts) { c.lineWidth = (+$('#sp-brush').value || 300) / 1000; c.lineCap = 'round'; c.strokeStyle = t.tool === 'brush' ? 'rgba(60,72,92,.6)' : 'rgba(255,255,255,.85)'; c.beginPath(); t.pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); }
  if (S.tool === 'wall' && t.pts) { c.lineWidth = (+$('#sp-brush').value || 300) / 1000; c.strokeStyle = 'rgba(60,72,92,.6)'; c.beginPath(); t.pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); if (t.hover) c.lineTo(...t.hover); c.stroke(); }
  if (t.tool === 'entry' || t.tool === 'exit') drawGate(c, { x: t.a[0], y: t.a[1], th: Math.atan2(t.b[1] - t.a[1], t.b[0] - t.a[0]), w: +$('#sp-gatew').value || 6 }, '#9c4a2f', px);
  if (t.tool === 'row') for (const b of rowBays({ a: t.a, b: t.b, angle: +$('#sp-angle').value, side: 1, L: +$('#sp-bayl').value, W: +$('#sp-bayw').value })) { c.beginPath(); b.poly.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill(); c.stroke(); }
  if (t.tool === 'single') { c.beginPath(); c.moveTo(...t.a); c.lineTo(...t.b); c.stroke(); }
}
function drawLabels(c, T, z, scale) {
  const bays = S.results.size && S.runBays ? S.runBays : allBays();
  if (z * 2.5 < 16) return;
  c.font = `${Math.round(Math.min(13, z * 0.5) * scale)}px ui-monospace, Consolas, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const b of bays) {
    const [x, y] = T(b.c[0], b.c[1]); const r = S.results.get(b.id);
    c.fillStyle = r ? (r.grade === 'a' ? '#5a3c06' : r.grade === 'r' ? '#7a1d14' : '#163d24') : '#3a5a8c';
    c.fillText(b.id.slice(1), x, y);
  }
  for (const [g, t] of [[S.entry, L('IN', '入')], [S.exit, L('OUT', '出')]]) if (g) {
    const [x, y] = T(g.x - Math.cos(g.th) * 2, g.y - Math.sin(g.th) * 2);
    c.fillStyle = '#1d1c1a'; c.font = `bold ${Math.round(12 * scale)}px system-ui, sans-serif`; c.fillText(t, x, y);
  }
}

// ---------------------------------------------------------------- info lines
function updateInfo() {
  const fi = $('#sp-fileinfo');
  fi.textContent = S.plan ? `${S.file}\n${S.plan.width} × ${S.plan.height} px · ${S.kind.toUpperCase()}${S.pdfPages > 1 && S.kind === 'pdf' ? ` · ${L('page 1 of', '第 1 頁，共')} ${S.pdfPages}` : ''}` : '';
  $('#sp-scaleinfo').textContent = S.plan ? (S.kind === 'dxf' ? L(`From the drawing units: 1 unit = ${S.unitM * 1000} mm`, `按圖則單位：1 單位 = ${S.unitM * 1000} 毫米`) :
    S.calibrated ? L(`Scale set: 1 px = ${(S.s * 1000).toFixed(1)} mm · plan ${(S.plan.width * S.s).toFixed(1)} × ${(S.plan.height * S.s).toFixed(1)} m`, `已定比例：1 像素 = ${(S.s * 1000).toFixed(1)} 毫米 · 圖則 ${(S.plan.width * S.s).toFixed(1)} × ${(S.plan.height * S.s).toFixed(1)} 米`)
      : L('Not to scale yet.', '尚未定比例。')) + (S.cal.length === 2 ? `\n${L('Picked', '已選')}: ${(Math.hypot(S.cal[1][0] - S.cal[0][0], S.cal[1][1] - S.cal[0][1]) / S.s).toFixed(0)} px` : '') : '';
  if (S.grid) { let n = 0; for (const v of S.grid.data) n += v; const ns = (S.symbols || []).length;
    $('#sp-obsinfo').textContent = L(`Obstacles: ${(n * CELL * CELL).toFixed(0)} m² on a 100 mm grid · ${S.edits.length} edits`, `障礙物：${(n * CELL * CELL).toFixed(0)} 平方米（100 毫米網格）· 修正 ${S.edits.length} 次`)
      + (ns ? L(` · ${ns} small pointed shapes (arrows) ignored, ringed in orange: check each`, ` · 已略去 ${ns} 個帶尖端的細小圖形（箭咀），以橙圈標示，請逐一核對`) : ''); }
  const nb = allBays().length;
  $('#sp-markinfo').textContent = L(`Entrance: ${S.entry ? 'set' : 'not set'} · Exit: ${S.exit ? 'set' : 'same as the entrance'} · Bays: ${nb}`, `入口：${S.entry ? '已設' : '未設'} · 出口：${S.exit ? '已設' : '與入口相同'} · 車位：${nb}`);
  $$('.sp-steps button').forEach((b) => b.classList.toggle('done', (+b.dataset.step === 1 && !!S.plan) || (+b.dataset.step === 2 && S.calibrated) || (+b.dataset.step === 3 && !!S.entry && nb > 0) || (+b.dataset.step === 4 && S.results.size > 0)));
}
function refreshAll() { updateInfo(); renderList(); progress(); hintForStep(); expInfo(); draw(); }

// ---------------------------------------------------------------- samples
async function loadSample(key) {
  const meta = await (await fetch(new URL('../samples/samples.json', import.meta.url))).json();
  const isDxf = key.endsWith('-dxf'), k = key.replace('-dxf', ''), m = meta[k];
  const url = new URL(`../samples/sample-${k}.${isDxf ? 'dxf' : 'pdf'}`, import.meta.url);
  const blob = await (await fetch(url)).blob();
  const file = new File([blob], `sample-${k}.${isDxf ? 'dxf' : 'pdf'}`, { type: isDxf ? 'application/dxf' : 'application/pdf' });
  await loadFile(file, { keepStep: true });
  let X0, Ytop;
  if (isDxf) { X0 = S.ox; Ytop = S.oy; }
  else { X0 = m.page.X0; Ytop = m.page.Ytop; setScaleQuiet(m.page.Wm / S.plan.width); }
  applyMarks(m, X0, Ytop);
  setVehicle(m.vehicle);
  fit(); setStep(4); updateInfo();
  return m;
}
SP.loadSample = loadSample;
function setScaleQuiet(s) { S.s = s; S.calibrated = true; detect(); }
function applyMarks(m, X0, Ytop) {
  const W = (p) => [p[0] - X0, Ytop - p[1]];
  const gate = (g) => ({ x: g.X - X0, y: Ytop - g.Y, th: -g.th * Math.PI / 180, w: g.w });
  S.entry = gate(m.gates.entry); S.exit = m.gates.exit ? gate(m.gates.exit) : null;
  S.rows = m.rows.map((r) => {
    const a = W(r.a), b = W(r.b), t = W(r.toward), u = [b[0] - a[0], b[1] - a[1]];
    const side = (-u[1] * (t[0] - a[0]) + u[0] * (t[1] - a[1])) > 0 ? 1 : -1;
    return { a, b, angle: r.angle, side, L: r.L, W: r.W };
  });
  S.singles = []; clearResults(); updateInfo(); draw();
}
SP.applyMarks = applyMarks;
$$('[data-sample]').forEach((b) => (b.onclick = () => loadSample(b.dataset.sample)));

// ---------------------------------------------------------------- exports
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
const baseName = () => (S.file || 'plan').replace(/\.[^.]+$/, '') + '_swept-path';
function needResults() { if (!S.results.size) { hint(L('Run "Check every bay" first (step 4).', '請先「檢查每個車位」（第 4 步）。'), 'err'); return false; } return true; }

function dxfModel() {
  const T = (p) => [(p[0] + S.ox) / S.unitM, (S.oy - p[1]) / S.unitM], k = 1 / S.unitM;
  const lay = {};
  const layer = (name, aci, lt) => (lay[name] || (lay[name] = { name, aci, lt, items: [] })).items;
  const pl = (name, aci, pts, closed, lt) => { if (pts.length > 1) layer(name, aci, lt).push({ t: 'pl', pts: pts.map(T), closed }); };
  const txt = (name, aci, p, s, h, al) => { const q = T(p); layer(name, aci).push({ t: 'text', x: q[0], y: q[1], h: h * k, s, al, mid: true }); };
  // obstacles (traced)
  for (const r of contours(S.grid.data, S.grid.w, S.grid.h, CELL)) pl('SP-OBSTACLES', 8, simplify(r, 0.05), true);
  const v = S.runVeh, bays = S.runBays;
  for (const b of bays) {
    const r = S.results.get(b.id);
    pl('SP-BAYS', 7, b.poly, true);
    if (r) pl({ g: 'SP-GRADE-GREEN', a: 'SP-GRADE-AMBER', r: 'SP-GRADE-RED' }[r.grade], { g: 3, a: 40, r: 1 }[r.grade], b.poly, true);
    txt('SP-BAY-NO', 7, b.c, r ? `${b.id} ${r.grade.toUpperCase()}` : b.id, 0.45, 'c');
    if (!r) continue;
    for (const [kk, suf] of [['in', ''], ['out', '-OUT']]) {
      const p = r[kk]; if (!p) continue;
      for (const ring of p.body.rings) pl('SP-BODY' + suf, kk === 'in' ? 5 : 150, ring, true);
      for (const ring of p.clear.rings) pl('SP-CLEAR' + suf, 30, ring, true, 'DASHED');
      const tracks = wheels(v, poseOf(p.sm[0])).map(() => []);
      for (let i = 0; i < p.sm.length; i += 2) wheels(v, poseOf(p.sm[i])).forEach((w, j) => tracks[j].push(w));
      for (const t of tracks) pl('SP-WHEEL' + suf, kk === 'in' ? 4 : 6, simplify(t, 0.01), false);
      let acc = 1e9;
      for (let i = 0; i < p.sm.length; i++) {
        if (i) acc += Math.hypot(p.sm[i][0] - p.sm[i - 1][0], p.sm[i][1] - p.sm[i - 1][1]);
        if (acc < 2 && i !== p.sm.length - 1) continue; acc = 0;
        for (const b2 of bodies(v, poseOf(p.sm[i]))) pl('SP-VEHICLE' + suf, 8, rectPoly(b2, 0), true);
      }
    }
    if (r.template) {
      const tracks = [];
      for (const b2 of bodies(v, poseOf(r.template[r.template.length - 1]))) tracks.push(rectPoly(b2, 0));
      for (const t of tracks) pl('SP-TEMPLATE', 1, t, true, 'DASHED');
      pl('SP-TEMPLATE', 1, r.template.map((q) => [q[0], q[1]]), false, 'DASHED');
    }
  }
  // clashes: union of red cells, outlined
  const cl = new Uint8Array(S.grid.w * S.grid.h); let any = false;
  for (const r of S.results.values()) if (r.clash) for (const i of r.clash) { cl[i] = 1; any = true; }
  if (any) for (const ring of contours(cl, S.grid.w, S.grid.h, CELL)) pl('SP-CLASH', 1, ring, true);
  for (const [g, nm] of [[S.entry, 'IN'], [S.exit, 'OUT']]) if (g) {
    const u = [Math.cos(g.th), Math.sin(g.th)], n = [-u[1], u[0]];
    pl('SP-GATES', 5, [[g.x + n[0] * g.w / 2, g.y + n[1] * g.w / 2], [g.x - n[0] * g.w / 2, g.y - n[1] * g.w / 2]], false);
    pl('SP-GATES', 5, [[g.x - u[0], g.y - u[1]], [g.x + u[0] * 3, g.y + u[1] * 3], [g.x + u[0] * 2.1 + n[0] * 0.5, g.y + u[1] * 2.1 + n[1] * 0.5]], false);
    txt('SP-GATES', 5, [g.x - u[0] * 2, g.y - u[1] * 2], nm, 0.6, 'c');
  }
  // notes
  const box = contentBox(), c = counts();
  const notes = [
    `HK Swept Path - ${new Date().toISOString().slice(0, 10)} - ${S.file || ''}`,
    `Vehicle: ${preset().en} (L ${v.total.toFixed(2)} W ${v.W} WB ${v.WB} kerb-to-kerb R ${v.Rk} m, rear-axle Rmin ${v.Rmin.toFixed(2)} m)`,
    `Buffer ${Math.round(S.buffer * 1000)} mm (amber ${Math.round(S.reduced * 1000)} mm); other bays ${S.empty ? 'empty' : 'occupied by parked vehicles'}`,
    `Bays: ${c.g} green, ${c.a} amber, ${c.r} red. Green = APP-111 App. A (v) one distinct manoeuvre (our reading).`,
    'Sketch-stage check, not a swept path analysis by a traffic consultant. Free hobby tool by Anzon Wong, anzonwong.com, not professional advice.',
  ];
  notes.forEach((s, i) => txt('SP-NOTES', 7, [box[0], box[3] + 1.5 + i * 0.9], s, 0.45, 'l'));
  const order = ['SP-OBSTACLES', 'SP-BAYS', 'SP-GRADE-GREEN', 'SP-GRADE-AMBER', 'SP-GRADE-RED', 'SP-BAY-NO', 'SP-GATES', 'SP-WHEEL', 'SP-BODY', 'SP-CLEAR', 'SP-VEHICLE', 'SP-WHEEL-OUT', 'SP-BODY-OUT', 'SP-CLEAR-OUT', 'SP-VEHICLE-OUT', 'SP-TEMPLATE', 'SP-CLASH', 'SP-NOTES'];
  const layers = order.filter((n) => lay[n]).map((n) => lay[n]);
  for (const l of layers) l.items.forEach((it) => { if (it.t === 'text') delete it.mid; });
  for (const l of layers) l.items.forEach((it) => { if (it.t === 'text' && it.al === 'l') delete it.al; });
  const insunits = S.kind === 'dxf' ? ({ 0.001: 4, 0.01: 5, 1: 6 }[S.unitM] || 4) : 4;
  return { layers, insunits, textH: 0.45 * k };
}
SP.dxfText = () => toDXF(dxfModel());
$('#sp-dxf').onclick = () => { if (!needResults()) return; download(new Blob([toDXF(dxfModel())], { type: 'application/dxf' }), baseName() + '.dxf'); expInfo('DXF'); };

function renderSheet(W, H, opts = {}) {
  // a plan image with every path, fitted into W x H px
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const [x0, y0, x1, y1] = opts.box || contentBox();
  const z = Math.min(W / (x1 - x0), H / (y1 - y0)), ox = (W - (x1 - x0) * z) / 2, oy = (H - (y1 - y0) * z) / 2;
  g.setTransform(z, 0, 0, z, ox - x0 * z, oy - y0 * z);
  drawWorld(g, { z, now: 0, screen: false, all: !!opts.all });
  g.setTransform(1, 0, 0, 1, 0, 0);
  drawLabels(g, (x, y) => [ox + (x - x0) * z, oy + (y - y0) * z], z, Math.max(1, z / 25));
  return { c, z, box: [x0, y0, x1, y1] };
}
SP.renderSheet = renderSheet;
function legend(g, x, y, s) {
  const items = [[COL.g, L('Green: one distinct manoeuvre, in and out, 300 mm buffer (100 mm beside the bay)', '綠：一次清晰操控駛入及駛出，300 毫米緩衝（車位兩旁 100 毫米）')],
    [COL.a, L('Amber: extra shunts or smaller buffer only', '黃：需額外前後移動或只能以較小緩衝')],
    [COL.r, L('Red: cannot get in or out; red cells = clash', '紅：駛不進或駛不出；紅格 = 碰撞')]];
  g.font = `${16 * s}px system-ui, sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'left';
  items.forEach(([col, t], i) => { g.fillStyle = col; g.fillRect(x, y + i * 28 * s - 8 * s, 16 * s, 16 * s); g.fillStyle = '#1d1c1a'; g.fillText(t, x + 26 * s, y + i * 28 * s); });
}
async function pngBlob() {
  const box = contentBox(), aspect = (box[2] - box[0]) / (box[3] - box[1]);
  const W = Math.min(6000, Math.max(2400, Math.round((box[2] - box[0]) * 40))), H = Math.round(W / aspect);
  const band = Math.round(W * 0.05);
  const { c } = renderSheet(W, H, { all: false });
  const out = document.createElement('canvas'); out.width = W; out.height = H + band;
  const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height); g.drawImage(c, 0, 0);
  const s = band / 110, cc = counts();
  g.fillStyle = '#1d1c1a'; g.font = `${26 * s}px Georgia, serif`; g.textBaseline = 'middle';
  g.fillText(`HK Swept Path · 泊車軌跡  ·  ${lang() === 'zh' ? preset().zh : preset().en}  ·  ${cc.g} / ${cc.a} / ${cc.r}`, 30 * s, H + 32 * s);
  legend(g, 30 * s, H + 66 * s, s * 0.85);
  g.font = `${13 * s}px system-ui, sans-serif`; g.fillStyle = '#6f6a60'; g.textAlign = 'right';
  g.fillText(L('Sketch-stage check · free hobby tool · anzonwong.com · not professional advice', '草圖階段檢查 · 免費個人興趣工具 · anzonwong.com · 並非專業意見'), W - 30 * s, H + 92 * s);
  return await new Promise((res) => out.toBlob(res, 'image/png'));
}
SP.pngBlob = pngBlob;
$('#sp-png').onclick = async () => { if (!needResults()) return; download(await pngBlob(), baseName() + '.png'); expInfo('PNG'); };

function sheetCanvas() {
  // A3 landscape at 200 dpi: 3307 x 2339
  const W = 3307, H = 2339, s = 1.6, m = 70;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const colW = 1000, planW = W - colW - 3 * m, planH = H - 2 * m;
  const { c: pc } = renderSheet(planW, planH, {});
  g.drawImage(pc, m, m); g.strokeStyle = '#d9d3c7'; g.lineWidth = 2; g.strokeRect(m, m, planW, planH);
  let x = W - colW - m, y = m + 10;
  g.fillStyle = '#1d1c1a'; g.textBaseline = 'top'; g.textAlign = 'left';
  g.font = `${44 * s}px Georgia, "Microsoft JhengHei", serif`; g.fillText('HK Swept Path', x, y); y += 46 * s;
  g.font = `${30 * s}px "Microsoft JhengHei", "PingFang TC", serif`; g.fillText('泊車軌跡', x, y); y += 42 * s;
  g.font = `${15 * s}px ui-monospace, Consolas, monospace`; g.fillStyle = '#6f6a60';
  g.fillText(`${(S.file || '').slice(0, 48)}  ·  ${new Date().toISOString().slice(0, 10)}`, x, y); y += 30 * s;
  const v = S.runVeh, p = preset(), cc = counts();
  const line = (t, f = 17, col = '#1d1c1a') => { g.font = `${f * s}px system-ui, "Microsoft JhengHei", sans-serif`; g.fillStyle = col; g.fillText(t, x, y); y += (f + 7) * s; };
  g.fillStyle = '#1d1c1a'; g.fillRect(x, y, colW, 2); y += 12 * s;
  line(L('Vehicle', '車輛') + ': ' + (lang() === 'zh' ? p.zh : p.en), 18);
  line(`L ${v.total.toFixed(2)} · W ${v.W} · WB ${v.WB} · ${L('kerb-to-kerb R', '路壆半徑')} ${v.Rk} m`, 15, '#4a4741');
  line(`${L('Rear-axle min R', '後軸最小半徑')} ${v.Rmin.toFixed(2)} m · ${L('wall-to-wall R', '牆至牆半徑')} ${v.RwCalc.toFixed(2)} m${p.Rw ? ` (TPDM ${p.Rw})` : ''}`, 15, '#4a4741');
  line(`${L('Buffer', '緩衝')} ${Math.round(S.buffer * 1000)} mm (${L('amber', '黃')} ${Math.round(S.reduced * 1000)} mm) · ${S.empty ? L('empty car park', '空置停車場') : L('other bays occupied', '其餘車位已泊車')}`, 15, '#4a4741');
  line(`${L('Source', '來源')}: ${p.src}`, 13, '#6f6a60');
  y += 6 * s; g.fillStyle = '#1d1c1a'; g.fillRect(x, y, colW, 2); y += 12 * s;
  line(`${cc.g} ${L('green', '綠')}   ${cc.a} ${L('amber', '黃')}   ${cc.r} ${L('red', '紅')}`, 24);
  legend(g, x, y + 8 * s, s * 0.95); y += 92 * s;
  // bay table
  g.fillStyle = '#1d1c1a'; g.fillRect(x, y, colW, 2); y += 10 * s;
  const bays = S.runBays, rowsAvail = Math.floor((H - m - 240 - y) / (17 * s)), cols = Math.max(1, Math.ceil(bays.length / Math.max(1, rowsAvail)));
  const cw = colW / Math.min(cols, 3), perCol = Math.ceil(bays.length / Math.min(cols, 3));
  g.font = `${12 * s}px ui-monospace, Consolas, monospace`;
  bays.slice(0, perCol * 3).forEach((b, i) => {
    const r = S.results.get(b.id), cx = x + Math.floor(i / perCol) * cw, cy = y + (i % perCol) * 17 * s;
    g.fillStyle = r ? COL[r.grade] : '#ccc'; g.fillRect(cx, cy + 2 * s, 11 * s, 11 * s);
    g.fillStyle = '#1d1c1a';
    const clr = r ? Math.min(r.in ? r.in.minClr : 9, r.out ? r.out.minClr : 9) : NaN;
    const t = r ? `${b.id} ${L('in', '入')}${r.in ? r.in.cusps : '×'} ${L('out', '出')}${r.out ? r.out.cusps : '×'} ${clr < 9 ? Math.round(Math.max(0, clr) * 1000) + 'mm' : ''}` : b.id;
    g.fillText(t, cx + 16 * s, cy);
  });
  // notes
  y = H - m - 230;
  g.fillStyle = '#1d1c1a'; g.fillRect(x, y, colW, 2); y += 12;
  const notes = [L('Green = APP-111 Appendix A (v) "one distinct manoeuvre without reversals of the steering lock" (our reading): at most one gear change and no lock reversal on the final move, in and out, at the 300 mm buffer (100 mm to structure and parked vehicles within 0.8 m of the long sides of the bay). Numbers per bay: gear changes in / out, least clearance.', '綠 = 按 APP-111 附錄 A (v)「一次清晰的操控動作，毋須反方向扭軚」（本工具的理解）：最多轉波一次，最後一步不需反方向扭軚，駛入及駛出均保持 300 毫米緩衝（車位長邊外 0.8 米內的結構及已泊車輛為 100 毫米）。每個車位數字：駛入／駛出轉波次數、最小緩衝。'),
    L('Sketch-stage check, not a substitute for a swept path analysis by your traffic consultant. Free hobby tool by Anzon Wong, anzonwong.com. Not professional advice. Not affiliated with BD, PlanD or TD.', '草圖階段自行檢查，不能取代交通顧問的掃掠軌跡分析。Anzon Wong 免費個人興趣工具，anzonwong.com。並非專業意見，與屋宇署、規劃署及運輸署無關。')];
  g.font = `${12.5 * s}px system-ui, "Microsoft JhengHei", sans-serif`; g.fillStyle = '#4a4741';
  for (const n of notes) { for (const ln of wrapText(g, n, colW)) { g.fillText(ln, x, y); y += 18 * s; } y += 8 * s; }
  return c;
}
function wrapText(g, t, w) {
  const out = []; let cur = '';
  const tokens = t.match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+\s*|\s+/g) || [];
  for (const tk of tokens) { if (g.measureText(cur + tk).width > w && cur) { out.push(cur.trimEnd()); cur = tk.trimStart(); } else cur += tk; }
  if (cur) out.push(cur.trimEnd()); return out;
}
async function pdfBlob() {
  const c = sheetCanvas();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a3' });
  doc.setProperties({ title: 'HK Swept Path', subject: 'Car park swept path check', author: 'HK Swept Path (anzonwong.com)', creator: 'HK Swept Path' });
  doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 420, 297);
  return doc.output('blob');
}
SP.pdfBlob = pdfBlob;
$('#sp-pdf').onclick = async () => { if (!needResults()) return; download(await pdfBlob(), baseName() + '.pdf'); expInfo('PDF'); };
function expInfo(k) { if (k !== undefined) S.expK = k; if (S.expK) $('#sp-expinfo').textContent = L(`${S.expK} saved to your downloads.`, `${S.expK} 已存到你的下載資料夾。`); }

// ---------------------------------------------------------------- post frames (hero image / animation)
// t in [0, 1]: bays light up in check order, each car sweeps in over a short window. opts: { W, H, rotate, title, sub, foot }
function renderFrame(t, o = {}) {
  const W = o.W || 1080, H = o.H || 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = '#f5f2ec'; g.fillRect(0, 0, W, H);
  const top = o.top || 210, bot = o.bot || 170, side = 60;
  const box = o.box || contentBox(), bw = box[2] - box[0], bh = box[3] - box[1];
  const rot = o.rotate != null ? o.rotate : bw > bh && H > W;
  const aw = W - 2 * side, ah = H - top - bot;
  const z = rot ? Math.min(aw / bh, ah / bw) : Math.min(aw / bw, ah / bh);
  const cx = W / 2, cy = top + ah / 2, mx = (box[0] + box[2]) / 2, my = (box[1] + box[3]) / 2;
  g.fillStyle = '#ffffff';
  g.save();
  g.beginPath(); g.rect(side, top, aw, ah); g.clip();
  g.translate(cx, cy); if (rot) g.rotate(-Math.PI / 2); g.scale(z, z); g.translate(-mx, -my);
  const px = 1 / z;
  g.fillRect(box[0] - 1e3, box[1] - 1e3, bw + 2e3, bh + 2e3);
  if (S.plan) { g.globalAlpha = 0.55; g.drawImage(S.plan, 0, 0, S.plan.width * S.s, S.plan.height * S.s); g.globalAlpha = 1; }
  if (S.obsBmp) { g.imageSmoothingEnabled = false; g.globalAlpha = 0.9; g.drawImage(S.obsBmp, 0, 0, S.grid.w * CELL, S.grid.h * CELL); g.globalAlpha = 1; g.imageSmoothingEnabled = true; }
  const bays = S.runBays || allBays(), order = S.order.length ? S.order : bays.map((b, i) => i), N = order.length;
  const D = o.dur || 0.22, step0 = (0.88 - D) / Math.max(1, N - 1);
  const v = S.runVeh;
  const poly = (pl) => { g.beginPath(); pl.forEach((q, j) => (j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); };
  // bays first
  order.forEach((bi, k) => {
    const b = bays[bi], r = S.results.get(b.id), t0 = k * step0, done = t >= t0 + D;
    poly(b.poly);
    if (r && done) { g.fillStyle = COL[r.grade]; g.globalAlpha = r.grade === 'r' ? 0.75 : 0.42; g.fill(); g.globalAlpha = 1; }
    g.lineWidth = 1.4 * px; g.strokeStyle = r && done ? COL[r.grade] : '#8a8579'; g.stroke();
  });
  // paths
  order.forEach((bi, k) => {
    const b = bays[bi], r = S.results.get(b.id); if (!r) return;
    if (o.only && !o.only.includes(b.id)) return;
    const t0 = k * step0, f = (t - t0) / D; if (f <= 0) return;
    const col = COL[r.grade], sm = r.in ? r.in.sm : r.template; if (!sm) return;
    const n = Math.max(1, Math.min(sm.length, Math.floor(Math.min(1, f) * sm.length)));
    const trail = new Path2D();
    for (let i = 0; i < n; i += 3) for (const pl of bodies(v, poseOf(sm[i])).map((bb) => rectPoly(bb, S.buffer))) { pl.forEach((q, j) => (j ? trail.lineTo(q[0], q[1]) : trail.moveTo(q[0], q[1]))); trail.closePath(); }
    g.fillStyle = col; g.globalAlpha = f < 1 ? 0.22 : 0.10; g.fill(trail, 'nonzero'); g.globalAlpha = 1;
    if (f >= 1 && r.in) { g.strokeStyle = col; g.globalAlpha = 0.85; g.lineWidth = 1.1 * px; g.stroke(r.in.bodyP); g.globalAlpha = 1; }
    // wheel tracks of the moving car
    if (f < 1 || o.tracks) {
      const tr = wheels(v, poseOf(sm[0])).map(() => []);
      for (let i = 0; i < n; i += 2) wheels(v, poseOf(sm[i])).forEach((w, j) => tr[j].push(w));
      g.strokeStyle = '#1d1c1a'; g.lineWidth = 1 * px; g.globalAlpha = 0.7;
      for (const q of tr) { g.beginPath(); q.forEach((w, j) => (j ? g.lineTo(w[0], w[1]) : g.moveTo(w[0], w[1]))); g.stroke(); }
      g.globalAlpha = 1;
    }
    if (f < 1) for (const pl of bodies(v, poseOf(sm[n - 1])).map((bb) => rectPoly(bb, 0))) { poly(pl); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#1d1c1a'; g.lineWidth = 2.2 * px; g.stroke(); }
    if (f >= 1 && r.clashP) { drawClash(g, r, px * 1.3, true); g.strokeStyle = COL.r; g.lineWidth = 1.2 * px; g.setLineDash([5 * px, 4 * px]); for (const pl of bodies(v, poseOf(r.template[r.template.length - 1] || r.template[0])).map((bb) => rectPoly(bb, 0))) { poly(pl); g.stroke(); } g.setLineDash([]); }
  });
  for (const [gt, colr] of [[S.entry, '#1d1c1a'], [S.exit, '#9c4a2f']]) if (gt) drawGate(g, gt, colr, px * 1.4);
  g.restore();
  // text
  const serif = 'Georgia, "Iowan Old Style", "Microsoft JhengHei", serif', sans = 'system-ui, "Segoe UI", "Microsoft JhengHei", sans-serif', mono = 'Consolas, ui-monospace, monospace';
  g.fillStyle = '#1d1c1a'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `400 64px ${serif}`; g.fillText('HK Swept Path', side, 104);
  const tw = g.measureText('HK Swept Path').width; g.font = `400 46px ${serif}`; g.fillStyle = '#4a4741'; g.fillText('泊車軌跡', side + tw + 22, 104);
  g.fillStyle = '#4a4741'; g.font = `400 27px ${sans}`;
  g.fillText(o.sub || 'Every bay driven in and out, in your browser', side, 150);
  g.fillText(o.sub2 || '每個車位自動駛入駛出檢查，瀏覽器內完成', side, 188);
  // footer: counts so far + legend
  let cg = 0, ca = 0, cr = 0;
  order.forEach((bi, k) => { const r = S.results.get(bays[bi].id); if (r && t >= k * step0 + D) { if (r.grade === 'g') cg++; else if (r.grade === 'a') ca++; else cr++; } });
  const fy = H - bot + 62;
  g.font = `400 30px ${mono}`;
  let x = side;
  for (const [n, col, en] of [[cg, COL.g, 'green'], [ca, COL.a, 'amber'], [cr, COL.r, 'red']]) {
    if (en === 'amber' && !ca && !o.showAmber) continue;
    g.fillStyle = col; g.fillRect(x, fy - 22, 24, 24); g.fillStyle = '#1d1c1a'; const s = `${n} ${en}`; g.fillText(s, x + 34, fy); x += 34 + g.measureText(s).width + 36;
  }
  g.fillStyle = '#6f6a60'; g.font = `400 21px ${sans}`;
  g.fillText(o.foot || 'TPDM design car · APP-111 one distinct manoeuvre · 300 mm buffer', side, fy + 46);
  g.fillText(o.foot2 || 'Fictional sample plan · sketch-stage check · anzonwong.com/lab', side, fy + 78);
  return c;
}
SP.renderFrame = (t, o) => renderFrame(t, o).toDataURL('image/png');
SP.renderFrameJpeg = (t, o) => renderFrame(t, o).toDataURL('image/jpeg', 0.92);
SP.addEdit = (e) => { S.edits.push(e); applyEdits(); };

// ---------------------------------------------------------------- start
buildVehSelect(); setVehicle('car'); setStep(1); resize(); refreshAll();
SP.ready = true;
