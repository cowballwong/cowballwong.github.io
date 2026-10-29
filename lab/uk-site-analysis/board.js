// UK Site Analysis (28 Oct 2026), from HK Site Analysis v3: the diagram series board.
// Fourteen small diagrams of the same site at the same frame and scale, one topic each, 7 x 2 on one board
// (A3 landscape, also A2 and PNG), each diagram as its own 1080 x 1080 PNG, each map alone as a plate (for the 3D view),
// and sheet 2: the exploded layer axonometric with leader labels.
// v3: colour presets (opts.style: paper, mono, vivid, night), round frames (opts.shape: 'circle'), generic raster layers,
// three new diagrams drawn by diagrams3.js through the kit K.
// Every diagram is drawn only from data the app loaded (see app.js); nothing is invented.
// Units: board and tiles in millimetres at A3; each map is a nested SVG with a 0..100 viewBox.
// Type: system fonts only (site design standard); the same fonts render in the on-screen SVG and in the canvas exports.

const FONT = "'Helvetica Neue', Helvetica, Arial, 'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', sans-serif";
const TITLES = {
  fig: ['Figure-ground', ''],
  hgt: ['Building heights', ''],
  topo: ['Topography', ''],
  sun: ['Sun and shadows', ''],
  sunh: ['Sunlight hours', ''],
  svf: ['Sky view factor', ''],
  wind: ['Prevailing wind', ''],
  acc: ['Access and movement', ''],
  walk: ['Walking distance', ''],
  noise: ['Road and rail noise', ''],
  green: ['Green and habitats', ''],
  plan: ['Planning constraints', ''],
  flood: ['Flood zones', ''],
  bre: ['BRE 25° screening', ''],
  view: ['Views and openness', ''],
};
export const KEYS = ['fig', 'hgt', 'topo', 'sun', 'sunh', 'svf', 'wind', 'acc', 'noise', 'green', 'plan', 'flood', 'bre', 'view'];
const NEW3 = ['sunh', 'walk', 'svf'];
export const STYLES = [
  { id: 'paper', en: 'Paper' },
  { id: 'mono', en: 'Line' },
  { id: 'vivid', en: 'Vivid' },
  { id: 'night', en: 'Night' },
];
const H_BRK = [5, 10, 15, 25, 40];                 // UK: classes of height above ground (m)
const VZ = 0.5;                                   // heights drawn at half the plan scale (plan-oblique)

// ---------- colour presets ----------
// paper = the v2 "style B" values exactly. Every other preset overrides the same tokens.
const PAPER = {
  id: 'paper', dark: false, glow: false,
  paper: '#fbfaf7', ink: '#1d1c1a', ink2: '#4a4741', muted: '#7a756b', rule: '#d9d3c7',
  ground: '#f1eee8', road: '#ffffff', roadEdge: '#cfc9bf', bld: '#d9d4ca', hatch: null, site: '#e2483d', white: '#ffffff',
  halo: '#ffffff', panel: '#ffffff', panelOp: 0.93, onAccent: '#ffffff', eyebrow: '#9c4a2f', warn: '#9c4a2f', card: '#f2efe8', locTile: '#cfc8bb', num: null,
  figBg: '#ffffff', figBld: '#1d1c1a',
  hgtBg: '#f4f2ed', hRamp: ['#e6e4f3', '#c6c2e7', '#a29bd5', '#7d73bf', '#5c51a7', '#3b3283'], hShade: [29, 28, 26], hLine: null,
  topoRamp: [[248, 242, 229], [222, 190, 141], [150, 98, 50]], hillK: 0.38, contour: '#6e4a26', contourHalo: '#f6eedf', topoBld: '#ffffff', topoBldOp: 0.55,
  sunBg: '#f4f1ea', shadow: '#2f4a86', shadowOp: 0.17, sunBld: '#fdfcf9', sunBldLine: '#cfc6b6', sunText: '#9a6610',
  windBg: '#f3f2ee', windBld: '#dcd8d0', windText: '#1b6c83', windSummer: '#0f5a70', petalLine: '#ffffff', petalOp: 0.78,
  accBg: '#f4f2ed', accBld: '#e9e5de', accRoads: { Highway: '#b3ada2', 'Main Road': '#c4beb3', 'Secondary Road': '#d5d0c6', 'Restricted Road': '#e0dcd3', Track: '#e0dcd3', other: '#d3cec5' }, accDark: '#0a4f4b',
  noiseBg: '#fbfaf8', noiseBands: ['#f8e3ed', '#efb8d2', '#df7dab'], noiseBld: '#ffffff', noiseBldOp: 0.5, noiseBldLine: '#bdb5a8', noiseMinor: '#d9d4cb', noiseMajor: '#9e2a62',
  greenBg: '#f7f6f2', greenRoad: '#ebe7df', greenBld: '#dedad2', park: '#2f6b2a',
  greenCols: { wood: '#4f8a45', shrub: '#86b46b', grass: '#b5d58f', urban: '#93c47d', agri: '#d4e3a6' },
  viewBg: '#f3f2ee', viewBld: '#d9d5cd',
  // for the v3 drawers (diagrams3.js): sunlight hours few -> many, sky view factor enclosed -> open, walk bands
  sunhRamp: ['#3b4a7a', '#6a5f8f', '#a8768a', '#dc9670', '#f2c36b', '#fbe7a6'],
  svfRamp: ['#2b2d42', '#4d5a7c', '#7d93b2', '#b3c8dc', '#e6eff6'],
  walk5: '#7a4fb5', walk10: '#b9a0dc', walkRest: '#d6d1c7',
  acc: { fig: '#1d1c1a', hgt: '#4b44a3', topo: '#a8713a', sun: '#e89a1c', sunh: '#e07b39', wind: '#2a9fc0', acc: '#13867f', walk: '#7a4fb5', noise: '#c43d7e', green: '#4f9a4a', view: '#3a6fd0', svf: '#4f7d99', plan: '#8a3b2e', flood: '#2369a8', bre: '#d4572a' },
  // UK layers
  sunDates: { mar: '#4a6fb5', jun: '#d99a1e', dec: '#2f4a86' },
  noiseRamp: ['#fbeef3', '#f6cfe0', '#ee9fc3', '#df6ea3', '#c43d7e', '#962a5f', '#5e1a3c'],
  canopy: '#8fbf74', habCols: { wood: '#2f6b2a', orchard: '#9a7d1e', heath: '#8a4f8f', wet: '#2b7fa3', grass: '#6c9a2a', other: '#5e6b5a' },
  planBg: '#f6f4ef', planBld: '#dcd7cd', planCols: { gb: '#7fae6b', aonb: '#b39b5c', pg: '#a3c27a', whs: '#6b4fa0', ca: '#b5532f', sm: '#7a3b1e', a4: '#5b4a8a', tpo: '#2f7a3a', lb: '#8a1c2b' },
  floodBg: '#f7f6f2', floodCols: { z2: '#a9cbe8', z3: '#3f7fc0' },
  breBg: '#f6f4ef', breNb: '#bdb5a6', breRamp: ['#9e1f2b', '#d4572a', '#ee9a4a', '#f6cf7a', '#e6e4b8', '#cfe0c8', '#eceae4'],
};
// light architectural: black and grey line work, hatched blocks, one red site
const MONO = {
  ...PAPER, id: 'mono',
  paper: '#ffffff', ink: '#111111', ink2: '#3b3b3b', muted: '#767676', rule: '#cfcfcf',
  ground: '#f2f2f2', road: '#ffffff', roadEdge: '#bdbdbd', bld: '#d4d4d4', hatch: '#8c8c8c', site: '#e3001b',
  eyebrow: '#111111', warn: '#111111', card: '#f4f4f4', locTile: '#cfcfcf', num: '#111111',
  figBg: '#ffffff', figBld: '#111111',
  hgtBg: '#f6f6f6', hRamp: ['#f1f1f1', '#d9d9d9', '#bdbdbd', '#999999', '#707070', '#444444'], hShade: [0, 0, 0], hLine: '#333333',
  topoRamp: [[252, 252, 252], [222, 222, 222], [150, 150, 150]], hillK: 0.32, contour: '#2b2b2b', contourHalo: '#ffffff', topoBld: '#ffffff', topoBldOp: 0.6,
  sunBg: '#f6f6f6', shadow: '#000000', shadowOp: 0.13, sunBld: '#ffffff', sunBldLine: '#9a9a9a', sunText: '#111111',
  windBg: '#f6f6f6', windBld: '#dddddd', windText: '#111111', windSummer: '#111111', petalLine: '#ffffff', petalOp: 0.5,
  accBg: '#f6f6f6', accBld: '#e4e4e4', accRoads: { Highway: '#a6a6a6', 'Main Road': '#b8b8b8', 'Secondary Road': '#cccccc', 'Restricted Road': '#dddddd', Track: '#dddddd', other: '#d0d0d0' }, accDark: '#111111',
  noiseBg: '#ffffff', noiseBands: ['#f0f0f0', '#d9d9d9', '#b9b9b9'], noiseBld: '#ffffff', noiseBldOp: 0.55, noiseBldLine: '#a8a8a8', noiseMinor: '#d6d6d6', noiseMajor: '#111111',
  greenBg: '#fafafa', greenRoad: '#eeeeee', greenBld: '#dcdcdc', park: '#111111',
  greenCols: { wood: '#5e5e5e', shrub: '#8a8a8a', grass: '#c2c2c2', urban: '#a6a6a6', agri: '#e0e0e0' },
  viewBg: '#f6f6f6', viewBld: '#dadada',
  sunhRamp: ['#3a3a3a', '#636363', '#8c8c8c', '#b4b4b4', '#d9d9d9', '#f7f7f7'],
  svfRamp: ['#262626', '#575757', '#8a8a8a', '#bdbdbd', '#efefef'],
  walk5: '#111111', walk10: '#8a8a8a', walkRest: '#d9d9d9',
  acc: { fig: '#111111', hgt: '#111111', topo: '#111111', sun: '#111111', sunh: '#111111', wind: '#111111', acc: '#111111', walk: '#111111', noise: '#111111', green: '#111111', view: '#111111', svf: '#111111', plan: '#111111', flood: '#111111', bre: '#111111' },
  sunDates: { mar: '#555555', jun: '#999999', dec: '#111111' },
  noiseRamp: ['#f7f7f7', '#e3e3e3', '#cccccc', '#adadad', '#8a8a8a', '#5f5f5f', '#333333'],
  canopy: '#c4c4c4', habCols: { wood: '#333333', orchard: '#555555', heath: '#666666', wet: '#444444', grass: '#777777', other: '#888888' },
  planBg: '#fafafa', planBld: '#dddddd', planCols: { gb: '#9a9a9a', aonb: '#b0b0b0', pg: '#bbbbbb', whs: '#555555', ca: '#222222', sm: '#333333', a4: '#444444', tpo: '#555555', lb: '#111111' },
  floodBg: '#fafafa', floodCols: { z2: '#cfcfcf', z3: '#8a8a8a' },
  breBg: '#fafafa', breNb: '#bcbcbc', breRamp: ['#222222', '#555555', '#888888', '#b4b4b4', '#d6d6d6', '#ebebeb', '#f6f6f6'],
};
// colourful diagram look: each map sits on a soft colour field of its own accent
const VIVID = {
  ...PAPER, id: 'vivid',
  paper: '#fbf7ef', ink: '#1b1a2e', ink2: '#3f3d57', muted: '#77748a', rule: '#ddd5c6',
  ground: '#f4eee2', road: '#ffffff', roadEdge: '#d7cdb9', bld: '#d8cfbe', site: '#ff3b2f',
  eyebrow: '#ff3b2f', warn: '#c2321f', card: '#f1eadb', locTile: '#d3c8b3',
  figBg: '#ffe2d3', figBld: '#1f2b5b',
  hgtBg: '#eef0fb', hRamp: ['#fff1a8', '#ffd166', '#f79d65', '#ef476f', '#b5179e', '#5a189a'], hShade: [30, 20, 60],
  topoRamp: [[236, 247, 220], [160, 210, 140], [52, 118, 86]], hillK: 0.34, contour: '#1f5136', contourHalo: '#eef7e4', topoBld: '#ffffff', topoBldOp: 0.6,
  sunBg: '#fff2cf', shadow: '#4b3fa8', shadowOp: 0.2, sunBld: '#ffffff', sunBldLine: '#e7cf96', sunText: '#a24f00',
  windBg: '#dff3fa', windBld: '#c3e3ee', windText: '#00617f', windSummer: '#023e5a', petalLine: '#ffffff', petalOp: 0.8,
  accBg: '#e3f5ef', accBld: '#c9e8dd', accRoads: { Highway: '#ffffff', 'Main Road': '#ffffff', 'Secondary Road': '#fbfffd', 'Restricted Road': '#f2fbf8', Track: '#f2fbf8', other: '#f6fcfa' }, accDark: '#004d40',
  noiseBg: '#fff0f6', noiseBands: ['#ffd3e6', '#ff9cc7', '#ff5c9d'], noiseBld: '#ffffff', noiseBldOp: 0.65, noiseBldLine: '#f0b6cf', noiseMinor: '#ffffff', noiseMajor: '#9c004e',
  greenBg: '#f1f8e6', greenRoad: '#ffffff', greenBld: '#dcd8cc', park: '#0f5a2c',
  greenCols: { wood: '#2e8b57', shrub: '#5fbf5a', grass: '#a8e063', urban: '#7bd389', agri: '#e3f59a' },
  viewBg: '#e8edff', viewBld: '#c9d4f4',
  sunhRamp: ['#3d2c8d', '#7b2cbf', '#c9408a', '#ff7b54', '#ffb347', '#ffe66d'],
  svfRamp: ['#1d2b64', '#2f5fa8', '#3fa7d6', '#8fd3e8', '#e0f7fa'],
  walk5: '#8e44ec', walk10: '#c9a3ff', walkRest: '#d9d0e6',
  acc: { fig: '#1f2b5b', hgt: '#7a2fc0', topo: '#2e8b57', sun: '#ff9f1c', sunh: '#ff7a00', wind: '#00a6d6', acc: '#00a087', walk: '#8e44ec', noise: '#e5007a', green: '#3fa34d', view: '#3d5afe', svf: '#1aa3b8', plan: '#d1495b', flood: '#0077b6', bre: '#f3722c' },
  sunDates: { mar: '#3d5afe', jun: '#ff9f1c', dec: '#5a189a' },
  noiseRamp: ['#fff0f6', '#ffd3e6', '#ff9cc7', '#ff5c9d', '#e5007a', '#a3005a', '#5c0033'],
  canopy: '#7bd389', habCols: { wood: '#1b7f3b', orchard: '#c99400', heath: '#a23b9a', wet: '#0096c7', grass: '#6ab04c', other: '#4a6b52' },
  planBg: '#fff8ec', planBld: '#e8dfcf', planCols: { gb: '#52b788', aonb: '#e9c46a', pg: '#95d5b2', whs: '#7b2cbf', ca: '#e63946', sm: '#9c4221', a4: '#5a189a', tpo: '#2d6a4f', lb: '#9d0208' },
  floodBg: '#f1f8ff', floodCols: { z2: '#90e0ef', z3: '#0077b6' },
  breBg: '#fff8ec', breNb: '#cdbfa6', breRamp: ['#9d0208', '#e85d04', '#faa307', '#ffd166', '#f1f5c4', '#d8f3dc', '#f4efe6'],
};
// dark sheet, light line work, glowing accents
const NIGHT = {
  ...PAPER, id: 'night', dark: true, glow: true,
  paper: '#0f1217', ink: '#ece9e2', ink2: '#c4c1b9', muted: '#8d8b86', rule: '#2e333b',
  ground: '#161a21', road: '#2b313b', roadEdge: '#3d4450', bld: '#333a46', site: '#ff5b4d', white: '#ffffff',
  halo: '#0f1217', panel: '#1b2029', panelOp: 0.95, onAccent: '#0f1217', eyebrow: '#ffb36b', warn: '#ffb36b', card: '#161a21', locTile: '#3a414d',
  figBg: '#090b0e', figBld: '#e9e5db',
  hgtBg: '#12161c', hRamp: ['#283057', '#334a92', '#3f6fcf', '#5fa0f0', '#9dd0ff', '#e8f6ff'], hShade: [5, 7, 12],
  topoRamp: [[24, 28, 35], [78, 68, 54], [205, 158, 96]], hillK: 0.5, contour: '#e0ac6c', contourHalo: '#0f1217', topoBld: '#0f1217', topoBldOp: 0.5,
  sunBg: '#272c35', shadow: '#04060a', shadowOp: 0.36, sunBld: '#3e4553', sunBldLine: '#5b6475', sunText: '#ffc56b',
  windBg: '#151a21', windBld: '#2a303a', windText: '#8fe3ff', windSummer: '#d2f6ff', petalLine: '#0f1217', petalOp: 0.8,
  accBg: '#141820', accBld: '#262c36', accRoads: { Highway: '#4d5562', 'Main Road': '#434a56', 'Secondary Road': '#3a404b', 'Restricted Road': '#323843', Track: '#323843', other: '#363c47' }, accDark: '#a6f7e9',
  noiseBg: '#12151b', noiseBands: ['#3a1f3f', '#5e2456', '#962f79'], noiseBld: '#0f1217', noiseBldOp: 0.55, noiseBldLine: '#3a414d', noiseMinor: '#2f353f', noiseMajor: '#ff6cb6',
  greenBg: '#12161b', greenRoad: '#20252d', greenBld: '#2b313b', park: '#bdf7a6',
  greenCols: { wood: '#2f7d46', shrub: '#4ea35a', grass: '#7cc46a', urban: '#5fb877', agri: '#a0cf6e' },
  viewBg: '#151a21', viewBld: '#2c323d',
  sunhRamp: ['#1c2233', '#3b3566', '#7a4a7e', '#c46a5e', '#f2a94e', '#ffe08a'],
  svfRamp: ['#0d1017', '#1f3550', '#2f6f8f', '#5fb6c9', '#bff3f5'],
  walk5: '#c18cff', walk10: '#6f55a8', walkRest: '#30363f',
  acc: { fig: '#ece9e2', hgt: '#7fa8ff', topo: '#e0ac6c', sun: '#ffb547', sunh: '#ffcf5a', wind: '#4fd1ff', acc: '#2fe0c4', walk: '#c18cff', noise: '#ff4fa3', green: '#6fdc7a', view: '#6ea8ff', svf: '#7fe7ff', plan: '#ff8a65', flood: '#4fc3f7', bre: '#ffab40' },
  sunDates: { mar: '#7fa8ff', jun: '#ffcf5a', dec: '#c18cff' },
  noiseRamp: ['#1d1a24', '#3a1f3f', '#5e2456', '#8a2c6e', '#b8357f', '#e2479a', '#ff7fc0'],
  canopy: '#2f6b3f', habCols: { wood: '#6fdc7a', orchard: '#e8c547', heath: '#d48ee0', wet: '#4fc3f7', grass: '#a8e063', other: '#9fb8a6' },
  planBg: '#12161b', planBld: '#2b313b', planCols: { gb: '#3f7a4a', aonb: '#8a7a3e', pg: '#4f7f3f', whs: '#9a7fe0', ca: '#ff8a65', sm: '#d08a5a', a4: '#b39ddb', tpo: '#81c784', lb: '#ff5c6c' },
  floodBg: '#12161b', floodCols: { z2: '#1f4f73', z3: '#3f9fe0' },
  breBg: '#12161b', breNb: '#4a5262', breRamp: ['#ff5c6c', '#ff8a4c', '#ffb547', '#ffe08a', '#c9d79a', '#5f8a6a', '#232830'],
};
const THEMES = { paper: PAPER, mono: MONO, vivid: VIVID, night: NIGHT };

// board geometry (mm, A3 landscape): 6 x 2 tiles, title band above, key strip and credits below
const COLS = 7;
const BW = 420, BH = 297, M = 10, GAP = 4, MW = (BW - 2 * M - (COLS - 1) * GAP) / COLS, TH_CAP = 35, TILE_H = MW + TH_CAP;
const GRID_Y = 50, ROW_GAP = 4;
const slot = (i) => ({ x: M + (i % COLS) * (MW + GAP), y: GRID_Y + Math.floor(i / COLS) * (TILE_H + ROW_GAP) });
const STRIP_Y = GRID_Y + 2 * TILE_H + ROW_GAP + 3.5;

export function createBoard(L) {
  const { T, isZh, compass, sunPos, fmtArea, nm, CELL, ROAD } = L;
  const DG3 = L.diagrams3 || {};
  let C = PAPER, SHAPE = 'square', TH = {};
  function useTheme(opts = {}) {
    C = THEMES[opts && opts.style] || PAPER;
    SHAPE = opts && opts.shape === 'circle' ? 'circle' : 'square';
    TH = {};
    for (const k of KEYS) {
      // canonical titles live here; diagrams3.js titles (L.diagrams3[k].en/zh) are overridden so the board and the 3D view agree
      const tt = TITLES[k];
      TH[k] = { c: C.acc[k], en: tt[0] };
    }
    return C;
  }
  useTheme();
  const meas = document.createElement('canvas').getContext('2d');
  const tw = (s, size, bold) => { meas.font = `${bold ? 'bold ' : ''}${size * 20}px ${FONT}`; return meas.measureText(s).width / 20; };
  function wrap(s, size, width, bold) {
    const out = []; let cur = '';
    const toks = (String(s).split(/(\s+)/));
    for (const t of toks) { const n = cur + t; if (tw(n.trim(), size, bold) > width && cur.trim()) { out.push(cur.trim()); cur = t.trimStart(); } else cur = n; }
    if (cur.trim()) out.push(cur.trim());
    return (out);
  }
  // a line never starts with closing punctuation; the mark moves up onto the end of the line before
  const NO_START = ',.;:)';
  function kinsoku(lines) {
    for (let i = 1; i < lines.length; i++) {
      let ln = lines[i], mv = '';
      while (ln && NO_START.includes(ln[0])) { mv += ln[0]; ln = ln.slice(1).trimStart(); }
      if (!mv) continue;
      lines[i - 1] += mv; lines[i] = ln;
      if (!ln) { lines.splice(i, 1); i--; }
    }
    return lines;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = (v) => (Math.round(v * 10) / 10).toString(), f2 = (v) => (Math.round(v * 100) / 100).toString();
  function tx(x, y, s, { size = 2.6, bold = false, weight = null, fill = C.ink, anchor = 'start', halo = null, rot = 0, ls = 0, op = 1, role = null } = {}) {
    const tr = rot ? ` transform="rotate(${f2(rot)} ${f2(x)} ${f2(y)})"` : '';
    const h = halo ? ` stroke="${halo}" stroke-width="${f2(size * 0.3)}" stroke-linejoin="round" paint-order="stroke"` : '';
    const wt = weight ? ` font-weight="${weight}"` : bold ? ' font-weight="bold"' : '';
    // pin the drawn width to the measured one: at small screen sizes Chromium rounds glyph advances and draws text 10 to 25%
    // wider than measured, which pushed captions into the next tile; exports are near 1:1 so the adjustment there is tiny
    const str = String(s == null ? '' : s), fit = !ls && str.length > 2 ? ` textLength="${f2(tw(str, size, bold || (weight && weight >= 600)))}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<text x="${f2(x)}" y="${f2(y)}" font-size="${f2(size)}"${wt} fill="${fill}" text-anchor="${anchor}"${ls ? ` letter-spacing="${ls}"` : ''}${fit}${op < 1 ? ` opacity="${op}"` : ''}${role ? ` data-role="${role}"` : ''}${h}${tr}>${esc(s)}</text>`;
  }
  // is a map point inside the drawn frame with margin m (square: the 0..100 box; round: the circle)
  const inMap = (X, Y, m = 2) => (SHAPE === 'circle' ? Math.hypot(X - 50, Y - 50) <= 50 - m : X >= m && X <= 100 - m && Y >= m && Y <= 100 - m);
  const gl = () => (C.glow ? ' filter="url(#uksa-glow)"' : '');
  const bldFill = () => (C.hatch ? 'url(#uksa-hatch)' : C.bld);
  // shared definitions: round clip (map units), glow (night), hatch (mono blocks)
  function defsSVG() {
    return `<defs><clipPath id="uksa-cc"><circle cx="50" cy="50" r="50"/></clipPath>` +
      `<filter id="uksa-glow" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><feGaussianBlur stdDeviation="0.55" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      `<pattern id="uksa-hatch" patternUnits="userSpaceOnUse" width="1.1" height="1.1" patternTransform="rotate(45)"><rect width="1.1" height="1.1" fill="${C.bld}"/><line x1="0.2" y1="0" x2="0.2" y2="1.1" stroke="${C.hatch || C.bld}" stroke-width="0.2"/></pattern>` +
      `<pattern id="uksa-ca" patternUnits="userSpaceOnUse" width="1.6" height="1.6" patternTransform="rotate(45)"><line x1="0.3" y1="0" x2="0.3" y2="1.6" stroke="${C.planCols.ca}" stroke-width="0.32" stroke-opacity="0.55"/></pattern>` +
      `<pattern id="uksa-sm" patternUnits="userSpaceOnUse" width="1.4" height="1.4"><path d="M0 0L1.4 1.4M1.4 0L0 1.4" stroke="${C.planCols.sm}" stroke-width="0.22" stroke-opacity="0.7"/></pattern>` +
      Object.entries(C.habCols).map(([k, c]) => `<pattern id="uksa-hab-${k}" patternUnits="userSpaceOnUse" width="1.5" height="1.5" patternTransform="rotate(-45)"><rect width="1.5" height="1.5" fill="${c}" fill-opacity="0.22"/><line x1="0.3" y1="0" x2="0.3" y2="1.5" stroke="${c}" stroke-width="0.3" stroke-opacity="0.7"/></pattern>`).join('') + '</defs>';
  }

  // ---------- geometry helpers in map units ----------
  function proj(res) {
    const f = res.f, F = f.E1 - f.E0, U = 100 / F;
    const X = (E) => 50 + (E - f.cE) * U, Y = (N) => 50 - (N - f.cN) * U;
    return { F, U, X, Y };
  }
  const sArea = (pts) => { let s = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
  // rings in screen coords -> path; outer rings one way round, holes the other, so non-zero fill unions overlaps
  function ringsPath(list) {
    const o = [];
    for (const { pts, hole } of list) {
      if (pts.length < 3) continue;
      let p = pts; const a = sArea(p); if ((a > 0) === !!hole) p = p.slice().reverse();
      o.push('M' + p.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + 'Z');
    }
    return o.join('');
  }
  function blocksPath(res, blocks, p) {
    const list = [];
    for (const b of blocks) {
      list.push({ pts: b.ring.map(([E, N]) => [p.X(E), p.Y(N)]) });
      for (const h of b.holes || []) list.push({ pts: h.map(([E, N]) => [p.X(E), p.Y(N)]), hole: true });
    }
    return ringsPath(list);
  }
  const lineD = (pts, p) => 'M' + pts.map(([E, N]) => `${f1(p.X(E))} ${f1(p.Y(N))}`).join('L');
  function roadsSVG(res, p, { color = C.road, minW = 0.45, scale = 1, classes = null, op = 1 } = {}) {
    const runs = res.roadRuns.filter((r) => r.cls !== 'Tunnel' && ROAD[r.cls] && (!classes || classes.includes(r.cls))).sort((a, b) => ROAD[b.cls].rank - ROAD[a.cls].rank);
    const by = new Map();
    for (const r of runs) { const k = r.cls; if (!by.has(k)) by.set(k, []); by.get(k).push(lineD(r.pts, p)); }
    let o = '';
    for (const [cls, ds] of by) {
      const w = Math.max(minW, ROAD[cls].w * p.U * scale);
      o += `<path d="${ds.join('')}" fill="none" stroke="${typeof color === 'function' ? color(cls) : color}" stroke-width="${f2(w)}" stroke-linecap="round" stroke-linejoin="round"${ROAD[cls].dash ? ' stroke-dasharray="1 0.7"' : ''}${op < 1 ? ` opacity="${op}"` : ''}/>`;
    }
    return o;
  }
  const siteD = (res, p) => 'M' + res.R.map(([E, N]) => `${f2(p.X(E))} ${f2(p.Y(N))}`).join('L') + 'Z';
  function siteSVG(res, p, { fill = 0.1, dash = false, w = 0.8 } = {}) {
    return `<path d="${siteD(res, p)}" fill="${C.site}" fill-opacity="${fill}" stroke="${C.site}" stroke-width="${w}"${dash ? ' stroke-dasharray="2.4 0.9"' : ''} stroke-linejoin="round"${gl()}/>`;
  }
  function baseSVG(res, p, { ground = C.ground, bld = bldFill(), roads = true } = {}) {
    let o = `<rect width="100" height="100" fill="${ground}"/>`;
    if (roads) o += roadsSVG(res, p);
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${bld}"/>`;
    return o;
  }
  // north arrow (top right) and a true scale bar (bottom left); in a round frame both sit in the free corners
  function northScale(res, p, { light = false, north = true, scale = true, round = SHAPE === 'circle' } = {}) {
    const ink = light ? '#fff' : C.ink, bg = round ? 'none' : light ? 'rgba(0,0,0,0.35)' : C.dark ? 'rgba(15,18,23,0.85)' : 'rgba(255,255,255,0.88)';
    let o = '';
    if (scale) {
      const Lm = [10, 20, 25, 50, 100, 200, 250, 500].filter((v) => v <= p.F / (round ? 5 : 4)).pop() || 10, len = Lm * p.U, by = round ? 96.6 : 94;
      o += `<g class="uksa-sb" data-m="${Lm}" data-u="${f2(len)}">`;
      if (!round) o += `<rect x="2.4" y="90.2" width="${f2(len + 9)}" height="7.4" rx="0.8" fill="${bg}"/>`;
      o += `<rect x="4" y="${by}" width="${f2(len / 2)}" height="1.1" fill="${ink}"/><rect x="${f2(4 + len / 2)}" y="${by}" width="${f2(len / 2)}" height="1.1" fill="none" stroke="${ink}" stroke-width="0.25"/>`;
      o += tx(4, by - 1, '0', { size: 2.3, fill: ink }) + tx(4 + len, by - 1, T(`${Lm} m`), { size: 2.3, fill: ink, anchor: 'middle' });
      o += '</g>';
    }
    if (north) {
      o += `<g transform="translate(94 4.2)">${bg !== 'none' ? `<rect x="-3.6" y="-1.4" width="7.2" height="10.4" rx="0.8" fill="${bg}"/>` : ''}<path d="M0 0L2.2 6.2L0 5L-2.2 6.2Z" fill="${ink}"/>${tx(0, 8.6, 'N', { size: 2.4, bold: true, fill: ink, anchor: 'middle' })}</g>`;
    }
    return o;
  }
  // a panel in the middle of a map: says plainly that a layer is missing or empty instead of leaving it blank
  function noteBox(head, sub, y = 20) {
    const w = Math.min(84, Math.max(tw(head, 3, true), sub ? tw(sub, 2.4) : 0) + 10);
    return `<g class="uksa-note"><rect x="${f2(50 - w / 2)}" y="${y - 6.5}" width="${f2(w)}" height="${sub ? 15 : 10}" rx="1.5" fill="${C.panel}" fill-opacity="${C.panelOp}" stroke="${C.rule}" stroke-width="0.2"/>` +
      tx(50, y, head, { size: 3, bold: true, anchor: 'middle', fill: C.ink }) + (sub ? tx(50, y + 5, sub, { size: 2.4, anchor: 'middle', fill: C.muted }) : '') + '</g>';
  }
  const LEGEND_KINDS = ['box', 'ring', 'line', 'dash', 'dot', 'bus', 'mtr', 'lr', 'lb', 'arrow', 'text', 'ramp'];
  function kit() {
    return { C, TH, dark: !!C.dark, glow: !!C.glow, shape: SHAPE, style: C.id, tx, f1, f2, esc, wrap, tw, T, isZh, compass, proj, lineD, sArea,
      baseSVG, siteSVG, roadsSVG, ringsPath, blocksPath, noteBox, northScale, legendKinds: LEGEND_KINDS, bldFill: bldFill() };
  }

  // ---------- derived numbers and rasters, once per result ----------
  function prepare(res) {
    if (res._b) return res._b;
    const p = proj(res), F = p.F, R0 = F / 2, [cx, cy] = res.siteC;
    const B = { p, topoBy: {} };
    // coverage inside a circle of radius F/2 round the site, the site itself left out (2 m pixels)
    const px = 2, n = Math.ceil((2 * R0) / px);
    const cov = (ringsList) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = n; const x = cv.getContext('2d');
      const tx_ = (E) => (E - (cx - R0)) / px, ty_ = (N) => ((cy + R0) - N) / px;
      x.fillStyle = '#000'; x.beginPath();
      for (const r of ringsList) { r.forEach(([E, N], i) => (i ? x.lineTo(tx_(E), ty_(N)) : x.moveTo(tx_(E), ty_(N)))); x.closePath(); }
      x.fill('nonzero');
      const d = x.getImageData(0, 0, n, n).data; let hit = 0, tot = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const E = cx - R0 + (i + 0.5) * px, N = cy + R0 - (j + 0.5) * px;
        if (Math.hypot(E - cx, N - cy) > R0 || L.inPoly(E, N, res.R)) continue;
        tot++; if (d[(j * n + i) * 4 + 3] > 127) hit++;
      }
      return tot ? (100 * hit) / tot : 0;
    };
    B.radius = R0;
    B.built = cov(res.blocks.filter((b) => !b.onSite && Math.hypot(b.c[0] - cx, b.c[1] - cy) < R0 + 200).map((b) => b.ring));
    const x = res.extra || {};
    if (x.green && !x.green.error) {
      B.green = x.green.length ? cov(x.green.map((g) => g.ring)) : 0;
      const byC = new Map(); for (const g of x.green) byC.set(g.cls, (byC.get(g.cls) || 0) + Math.abs(sArea(g.ring)));
      B.greenMain = [...byC.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }
    // LiDAR tree canopy within the radius (1 m mask), the site left out
    if (x.canopy) {
      const c = x.canopy; let hit = 0, tot = 0;
      for (let j = 0; j < c.H; j += 2) for (let i = 0; i < c.W; i += 2) {
        const E = c.x0 + i + 0.5, N = c.y1 - j - 0.5; if (Math.hypot(E - cx, N - cy) > R0 || L.inPoly(E, N, res.R)) continue;
        tot++; if (c.m[j * c.W + i]) hit++;
      }
      B.canopy = tot ? (100 * hit) / tot : null;
    }
    // nearest busier road (motorway / A road) to the site edge
    let best = null;
    for (const r of res.roadRuns) {
      if (r.cls !== 'Motorway' && r.cls !== 'A road') continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        let d = Infinity;
        for (const q of res.R) d = Math.min(d, L.segDist(q[0], q[1], a[0], a[1], b[0], b[1]));
        if (L.inPoly(a[0], a[1], res.R)) d = 0;
        d = Math.max(0, d - ROAD[r.cls].w / 2);
        if (!best || d < best.d) best = { d, r };
      }
    }
    B.busy = best;
    res._b = B;
    return B;
  }
  // topography colour at t (0..1) in the current preset's ramp
  const topoCol = (t) => { const [c0, c1, c2] = C.topoRamp; return t < 0.5 ? c0.map((v, m) => v + (c1[m] - v) * t * 2) : c1.map((v, m) => v + (c2[m] - v) * (t - 0.5) * 2); };
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const rgbHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  // topography raster per preset: elevation bands in the ramp, multiplied by the hill shade
  function topoRaster(res, B) {
    if (B.topoBy[C.id]) return B.topoBy[C.id];
    const p = B.p;
    // bands at the contour interval, but the ramp spans at least 30 m, so a flat site stays pale instead of looking steep
    const { gnx, gny, gz, hill } = res.grid, iv = res.interval, lo = Math.floor(res.fmin / iv) * iv, span = Math.max(30, res.fmax - lo);
    const cv = document.createElement('canvas'); cv.width = gnx; cv.height = gny; const xx = cv.getContext('2d'), im = xx.createImageData(gnx, gny);
    for (let j = 0; j < gny; j++) for (let i = 0; i < gnx; i++) {
      const k = j * gnx + i, o = ((gny - 1 - j) * gnx + i) * 4, t = Math.min(1, Math.max(0, (Math.floor((gz[k] - lo) / iv) * iv) / span));
      const c = topoCol(t), sh = 1 - C.hillK * hill[k];
      im.data[o] = c[0] * sh; im.data[o + 1] = c[1] * sh; im.data[o + 2] = c[2] * sh; im.data[o + 3] = 255;
    }
    xx.putImageData(im, 0, 0);
    const { gx0, gy0 } = res.grid;
    return (B.topoBy[C.id] = { id: 'topo', canvas: cv, url: cv.toDataURL(), x: p.X(gx0 - CELL / 2), y: p.Y(gy0 + (gny - 0.5) * CELL), w: gnx * CELL * p.U, h: gny * CELL * p.U, lo, hi: lo + span });
  }
  const urls = new WeakMap();
  const rasterURL = (r) => r.url || urls.get(r.canvas) || (urls.set(r.canvas, r.canvas.toDataURL()), urls.get(r.canvas));

  // ---------- the diagrams: each returns map SVG (0..100), legend items, takeaway and optional rasters ----------
  const D = {};
  // the site is taken as cleared: 'tallest' never counts a block on the site (app.js already leaves them out; filtered again here)
  const offTall = (res) => (res.tallest || []).filter((t) => !(t.b && t.b.onSite));
  function onSiteTop(res) {
    if (res.tallestOnSite && Number.isFinite(res.tallestOnSite.top)) return res.tallestOnSite.top;
    let z = null; for (const b of res.frameBlocks || []) if (b.onSite && (z === null || b.zt > z)) z = b.zt;
    return z;
  }

  D.fig = (res, p, B) => {
    let o = `<rect width="100" height="100" fill="${C.figBg}"/>`;
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.figBld}"/>`;
    o += `<path d="${siteD(res, p)}" fill="${C.site}" stroke="${C.site}" stroke-width="0.5"/>`;
    // the radius the figure is measured in
    o += `<circle cx="${f2(p.X(res.siteC[0]))}" cy="${f2(p.Y(res.siteC[1]))}" r="${f2(B.radius * p.U)}" fill="none" stroke="${C.site}" stroke-width="0.3" stroke-dasharray="1.2 1"/>`;
    return {
      svg: o,
      legend: [{ k: 'box', c: C.figBld, t: T('Buildings') }, { k: 'box', c: C.site, t: T('Site') }, { k: 'ring', c: C.site, t: T(`${B.radius} m radius`) }],
      take: T(`Within ${B.radius} m of the site, buildings cover ${B.built.toFixed(0)}% of the ground.`),
    };
  };

  D.hgt = (res, p) => {
    let o = `<rect width="100" height="100" fill="${C.hgtBg}"/>` + roadsSVG(res, p);
    const ramp = C.hRamp, [sr, sg, sb] = C.hShade;
    const cls = (H) => { let i = 0; while (i < H_BRK.length && H >= H_BRK[i]) i++; return i; };
    const mix = (hex, m) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, k = 1 - m; return `rgb(${Math.round(r * k + sr * m)},${Math.round(g * k + sg * m)},${Math.round(b * k + sb * m)})`; };
    const groups = new Map();
    for (const b of res.frameBlocks) { if (b.onSite) continue; const k = b.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
    const glist = [...groups.values()].map((bs) => ({ bs: bs.sort((a, b) => a.zb - b.zb || b.c[1] - a.c[1]), n: Math.max(...bs.map((b) => b.c[1])) }));
    glist.sort((a, b) => b.n - a.n);                                    // north first, so nearer (southern) blocks overlap
    o += `<path d="${siteD(res, p)}" fill="${C.site}" fill-opacity="0.16" stroke="none"/>`;
    for (const g of glist) for (const b of g.bs) {
      const H = Math.max(0.5, b.H), vb = Math.max(0, b.zb - b.gmin) * p.U * VZ, vt = H * p.U * VZ;
      const col = ramp[cls(H)], ring = sArea(b.ring) > 0 ? b.ring : b.ring.slice().reverse();   // counter-clockwise in E,N
      let wa = '', wb = '';
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length], dx = c[0] - a[0], dy = c[1] - a[1];
        if (dx <= 0) continue;                                          // only walls facing the viewer (south side)
        const q = `M${f1(p.X(a[0]))} ${f1(p.Y(a[1]) - vb)}L${f1(p.X(c[0]))} ${f1(p.Y(c[1]) - vb)}L${f1(p.X(c[0]))} ${f1(p.Y(c[1]) - vt)}L${f1(p.X(a[0]))} ${f1(p.Y(a[1]) - vt)}Z`;
        if (dy > 0) wa += q; else wb += q;                              // outward normal points east / west
      }
      if (wa) o += `<path d="${wa}" fill="${mix(col, 0.22)}"/>`;
      if (wb) o += `<path d="${wb}" fill="${mix(col, 0.38)}"/>`;
      o += `<path d="M${b.ring.map(([E, N]) => `${f1(p.X(E))} ${f1(p.Y(N) - vt)}`).join('L')}Z" fill="${col}" stroke="${C.hLine || mix(col, 0.45)}" stroke-width="${C.hLine ? 0.12 : 0.1}"/>`;
    }
    o += `<path d="${siteD(res, p)}" fill="none" stroke="${C.site}" stroke-width="0.8" stroke-dasharray="2.4 0.9"${gl()}/>`;
    // the three tallest: top level in mPD over the roof
    for (const t of offTall(res).slice(0, 3)) {
      const x = p.X(t.b.c[0]), y = p.Y(t.b.c[1]) - t.b.H * p.U * VZ, yb = p.Y(t.b.c[1]);
      if (x >= 3 && x <= 97 && y >= 6 && y <= 97 && inMap(x, y - 5, 5)) {
        o += `<line x1="${f2(x)}" y1="${f2(y)}" x2="${f2(x)}" y2="${f2(y - 4)}" stroke="${C.ink}" stroke-width="0.2"/><circle cx="${f2(x)}" cy="${f2(y)}" r="0.55" fill="${C.ink}"/>`;
        o += tx(x, y - 4.8, `${t.H.toFixed(0)} m`, { size: 2.5, bold: true, anchor: 'middle', halo: C.halo, fill: C.ink });
      } else if (y < 6 && x >= 6 && x <= 94 && yb > 12 && yb <= 97) {
        // a tall tower whose roof runs off the top of the map: label it at the top of the part that is drawn
        let yl = 4.6; while (yl < yb - 4 && !inMap(x, yl - 2, 3)) yl += 1;
        if (yl < yb - 4) o += tx(x, yl, `${t.H.toFixed(0)} m ↑`, { size: 2.5, bold: true, anchor: 'middle', halo: C.halo, fill: C.ink });
      }
    }
    const hs = res.frameBlocks.filter((b) => !b.onSite).map((b) => b.H).sort((a, b) => a - b), med = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
    if (!hs.length) o += noteBox(T('No buildings found'), T('in the LiDAR for this frame'));
    const estTxt = ['', ''];
    const t0 = offTall(res)[0], tn = t0 ? nm(t0.en, t0.tc) || T('a LiDAR block') : '';
    const tOn = res.tallestOnSite, onTxt = tOn ? [` On the site now up to ${tOn.H.toFixed(0)} m (taken as cleared).`, ''] : ['', ''];
    return {
      svg: o,
      legend: [{ k: 'ramp', cs: ramp, ticks: ['0', ...H_BRK.map(String)], t: T('height above ground, m') }],
      take: t0 ? T(`Tallest nearby: ${tn}, ${t0.H.toFixed(1)} m high (+${t0.top.toFixed(0)} m AOD), ${t0.d < 1 ? 'on the site edge' : t0.d.toFixed(0) + ' m ' + compass(t0.br)}.${onTxt[0]} Typical block ${med.toFixed(0)} m. Heights at half scale.`)
        : T(`No buildings recorded off the site in the frame.${onTxt[0]}`),
    };
  };

  D.topo = (res, p, B) => {
    const tp = topoRaster(res, B);
    let o = '';
    for (const c of res.contours) {
      o += `<path d="${c.segs.map(([a, b, cc, dd]) => `M${f1(p.X(a))} ${f1(p.Y(b))}L${f1(p.X(cc))} ${f1(p.Y(dd))}`).join('')}" fill="none" stroke="${C.contour}" stroke-width="${c.idx ? 0.32 : 0.14}" stroke-opacity="${c.idx ? 0.85 : 0.55}" stroke-linecap="round"/>`;
    }
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.topoBld}" fill-opacity="${C.topoBldOp}" stroke="${C.topoBld}" stroke-width="0.15"/>`;
    o += siteSVG(res, p, { fill: 0.08 });
    // index contour labels, a few, spread out
    const placed = [];
    for (const c of res.contours.filter((c) => c.idx)) {
      let n = 0;
      for (let si = Math.floor(c.segs.length / 4); si < c.segs.length && n < 2; si += Math.max(1, Math.floor(c.segs.length / 6))) {
        const [a, b, cc, dd] = c.segs[si], mx = (p.X(a) + p.X(cc)) / 2, my = (p.Y(b) + p.Y(dd)) / 2;
        if (mx < 8 || mx > 92 || my < 12 || my > 86 || !inMap(mx, my, 8) || placed.some(([x, y]) => Math.hypot(x - mx, y - my) < 22)) continue;
        let ang = (Math.atan2(p.Y(dd) - p.Y(b), p.X(cc) - p.X(a)) * 180) / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        o += tx(mx, my + 0.8, String(c.v), { size: 2.2, fill: C.contour, anchor: 'middle', halo: C.contourHalo, rot: ang });
        placed.push([mx, my]); n++;
      }
    }
    // fall arrow through the site
    const fall = res.grad * 100, [sx, sy] = [p.X(res.siteC[0]), p.Y(res.siteC[1])];
    if (fall >= 1) {
      const a = (res.fallDir * Math.PI) / 180, Lr = Math.max(9, Math.min(22, Math.sqrt(res.siteArea) * p.U * 0.9)), ux = Math.sin(a), uy = -Math.cos(a);
      const x0 = sx - ux * Lr / 2, y0 = sy - uy * Lr / 2, x1 = sx + ux * Lr / 2, y1 = sy + uy * Lr / 2;
      o += `<line x1="${f2(x0)}" y1="${f2(y0)}" x2="${f2(x1 - ux * 2)}" y2="${f2(y1 - uy * 2)}" stroke="${C.ink}" stroke-width="0.9" stroke-linecap="round"/>`;
      o += `<path d="M${f2(x1)} ${f2(y1)}L${f2(x1 - ux * 3.4 - uy * 1.8)} ${f2(y1 - uy * 3.4 + ux * 1.8)}L${f2(x1 - ux * 3.4 + uy * 1.8)} ${f2(y1 - uy * 3.4 - ux * 1.8)}Z" fill="${C.ink}"/>`;
      o += tx(x1 + ux * 2.5, y1 + uy * 2.5 + 1, `${fall.toFixed(0)}%`, { size: 2.8, bold: true, anchor: 'middle', halo: C.halo, fill: C.ink });
    }
    for (const [E, N, z, isC] of res.spots) {
      if (isC) continue;
      const x = p.X(E), y = p.Y(N);
      o += `<circle cx="${f2(x)}" cy="${f2(y)}" r="0.55" fill="${C.ink}"/>` + tx(x + 1.2, y - 0.8, `+${z.toFixed(1)}`, { size: 2.2, halo: C.halo, fill: C.ink });
    }
    return {
      svg: o, rasters: [tp],
      legend: [{ k: 'ramp', cs: [0, 0.33, 0.67, 1].map((t) => rgbHex(topoCol(t))), ticks: [`+${tp.lo.toFixed(0)}`, `+${tp.hi.toFixed(0)} m AOD`] }, { k: 'line', c: C.contour, w: 0.5, t: T(`contour ${res.interval} m`) }],
      take: T((res.zmax - res.zmin < 0.05 ? `Ground +${res.zmin.toFixed(1)} m AOD. ` : `Ground +${res.zmin.toFixed(1)} to +${res.zmax.toFixed(1)} m AOD. `) + (fall < 1 ? 'The site is practically level.' : `The site falls about ${fall.toFixed(0)}% (1 in ${Math.round(100 / fall)}) to the ${compass(res.fallDir)}.`)),
    };
  };

  D.sun = (res, p) => {
    let o = `<rect width="100" height="100" fill="${C.sunBg}"/>` + roadsSVG(res, p);
    for (const s of res.sun.slice().reverse()) {    // UK: the 12:00 shadow on each date, 21 Dec (longest) first, each in its own colour
      const sub = [];
      for (const sh of s.paths) {
        const Rg = sh.ring, n = Rg.length, rings = [Rg.map(([E, N]) => [p.X(E + sh.vb[0]), p.Y(N + sh.vb[1])]), Rg.map(([E, N]) => [p.X(E + sh.vt[0]), p.Y(N + sh.vt[1])])];
        for (let i = 0; i < n; i++) { const a = Rg[i], b = Rg[(i + 1) % n]; rings.push([[p.X(a[0] + sh.vb[0]), p.Y(a[1] + sh.vb[1])], [p.X(b[0] + sh.vb[0]), p.Y(b[1] + sh.vb[1])], [p.X(b[0] + sh.vt[0]), p.Y(b[1] + sh.vt[1])], [p.X(a[0] + sh.vt[0]), p.Y(a[1] + sh.vt[1])]]); }
        for (const rg of rings) if (Math.abs(sArea(rg)) > 0.004) sub.push({ pts: rg });
      }
      o += `<path d="${ringsPath(sub)}" fill="${(C.sunDates && C.sunDates[s.id]) || C.shadow}" fill-opacity="${Math.min(0.5, C.shadowOp * 1.5)}"/>`;
    }
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.sunBld}" stroke="${C.sunBldLine}" stroke-width="0.12"/>`;
    o += siteSVG(res, p, { fill: 0.12 });
    // sun path over the site: polar, horizon circle, 21 Dec bold, 21 Jun dashed
    const cx = p.X(res.siteC[0]), cy = p.Y(res.siteC[1]), Rr = 35, ac = TH.sun.c;
    const pr = (alt, az) => { const r = (Rr * (90 - alt)) / 90, a = (az * Math.PI) / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
    o += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${Rr}" fill="none" stroke="${ac}" stroke-width="0.3" stroke-opacity="0.8"/>`;
    o += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2((Rr * 60) / 90)}" fill="none" stroke="${ac}" stroke-width="0.15" stroke-dasharray="0.6 0.8"/><circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2((Rr * 30) / 90)}" fill="none" stroke="${ac}" stroke-width="0.15" stroke-dasharray="0.6 0.8"/>`;
    const path = (m, d) => { const q = []; for (let h = 3; h <= 22.5; h += 0.1) { const s = sunPos(res.lat, res.lon, h, m, d); if (s.alt > 0) q.push(pr(s.alt, s.az)); } return 'M' + q.map(([x, y]) => `${f2(x)} ${f2(y)}`).join('L'); };
    const dc = (id) => (C.sunDates && C.sunDates[id]) || ac;
    o += `<path d="${path(6, 21)}" fill="none" stroke="${dc('jun')}" stroke-width="0.6" stroke-dasharray="1.4 0.9"/>`;
    o += `<path d="${path(3, 21)}" fill="none" stroke="${dc('mar')}" stroke-width="0.8"/>`;
    o += `<path d="${path(12, 21)}" fill="none" stroke="${dc('dec')}" stroke-width="1.2" stroke-linecap="round"${gl()}/>`;
    for (const s of res.sun) {
      const [x, y] = pr(s.alt, s.az);
      o += `<line x1="${f2(cx)}" y1="${f2(cy)}" x2="${f2(x)}" y2="${f2(y)}" stroke="${dc(s.id)}" stroke-width="0.3" stroke-dasharray="0.8 0.6"/>`;
      o += `<circle cx="${f2(x)}" cy="${f2(y)}" r="2.3" fill="${dc(s.id)}" stroke="${C.halo}" stroke-width="0.4"${gl()}/>` + tx(x, y + 0.8, `${Math.round(s.alt)}°`, { size: 1.8, bold: true, fill: C.onAccent, anchor: 'middle' });
    }
    const pc = Object.fromEntries(res.sun.map((s) => [s.id, s.pct.toFixed(0)])), hill = res.sun.filter((s) => s.terrPct >= 10).map((s) => s.en);
    return {
      svg: o,
      legend: res.sun.map((s) => ({ k: 'box', c: dc(s.id), op: Math.min(0.5, C.shadowOp * 1.5), bg: C.sunBg, t: T(`${s.en} 12:00`) })).concat([{ k: 'line', c: ac, w: 1, t: T('sun paths, noon altitude') }]),
      take: T(`At 12:00 (GMT; BST on 21 Jun) the site is ${pc.jun}% in shade on 21 Jun, ${pc.mar}% on 21 Mar and ${pc.dec}% on 21 Dec, the lowest sun of the year.` + (hill.length ? ` Hill shadow too on ${hill.join(', ')}.` : '')),
    };
  };

  D.wind = (res, p) => {
    const w = res.extra && res.extra.wind;
    let o = baseSVG(res, p, { ground: C.windBg, bld: C.hatch ? bldFill() : C.windBld });
    o += siteSVG(res, p, { fill: 0.12 });
    const DIR_EN = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const DIR_ZH = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    if (!w || w.error) {
      o += noteBox(T('No wind data'), T('Open-Meteo did not answer'), 48.5);
      return { svg: o, legend: [], take: T('Wind data did not load for this site.') };
    }
    const cx = p.X(res.siteC[0]), cy = p.Y(res.siteC[1]), r0 = 3, Rm = 38, ac = TH.wind.c;
    const mx = Math.max(...w.annual, ...w.summer), sc = (v) => r0 + (Rm - r0) * Math.sqrt(v / mx);   // area-true petals
    const petal = (i, v, half = 9.5) => {
      const a0 = ((i * 22.5 - half) * Math.PI) / 180, a1 = ((i * 22.5 + half) * Math.PI) / 180, r = sc(v), q = [];
      for (let k = 0; k <= 6; k++) { const a = a0 + ((a1 - a0) * k) / 6; q.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]); }
      const b0 = [cx + r0 * Math.sin(a1), cy - r0 * Math.cos(a1)], b1 = [cx + r0 * Math.sin(a0), cy - r0 * Math.cos(a0)];
      return `M${f2(b1[0])} ${f2(b1[1])}L` + q.map(([x, y]) => `${f2(x)} ${f2(y)}`).join('L') + `L${f2(b0[0])} ${f2(b0[1])}Z`;
    };
    for (const pc of [0.1, 0.2, 0.3]) if (pc <= mx * 1.05) { const r = sc(pc); o += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="none" stroke="${ac}" stroke-width="0.15" stroke-dasharray="0.6 0.6"/>` + tx(cx + 0.8, cy - r - 0.4, `${pc * 100}%`, { size: 1.9, fill: C.windText, halo: C.halo }); }
    o += `<path d="${w.annual.map((v, i) => petal(i, v)).join('')}" fill="${ac}" fill-opacity="${C.petalOp}" stroke="${C.petalLine}" stroke-width="0.25"${gl()}/>`;
    o += `<path d="${w.summer.map((v, i) => petal(i, v, 7)).join('')}" fill="none" stroke="${C.windSummer}" stroke-width="0.45" stroke-dasharray="1 0.6"/>`;
    o += siteSVG(res, p, { fill: 0, w: 0.7, dash: true });
    for (const [i, s] of [[0, 'N'], [4, 'E'], [8, 'S'], [12, 'W']]) { const a = (i * 22.5 * Math.PI) / 180, r = Rm + 3.5; o += tx(cx + r * Math.sin(a), cy - r * Math.cos(a) + 1, (s), { size: 2.5, bold: true, anchor: 'middle', fill: C.windText, halo: C.halo }); }
    const ia = w.annual.indexOf(Math.max(...w.annual)), is = w.summer.indexOf(Math.max(...w.summer)), D_ = (DIR_EN);
    return {
      svg: o,
      legend: [{ k: 'box', c: ac, op: C.petalOp, t: T('all year') }, { k: 'dash', c: C.windSummer, t: T('summer (Jun-Aug)') }, { k: 'text', t: T(`ERA5 ${w.years[0]}-${w.years[1]}, 10 m`) }],
      take: T(`Wind at 10 m over open ground (ERA5 reanalysis, ${w.years[0]} to ${w.years[1]}, a 25 km grid) comes most often from the ${D_[ia]} (${(w.annual[ia] * 100).toFixed(0)}% of hours), in summer from the ${D_[is]}; mean ${w.mean.toFixed(1)} m/s. Not street-level wind.`),
    };
  };

  // clip a segment to a box (Liang-Barsky); returns the clipped length in metres
  function clipLen(ax, ay, bx, by, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
    for (const [pp, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (pp === 0) { if (q < 0) return 0; continue; }
      const r = q / pp; if (pp < 0) { if (r > t1) return 0; if (r > t0) t0 = r; } else { if (r < t0) return 0; if (r < t1) t1 = r; }
    }
    return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
  }
  // distance from a point to the site boundary (0 inside the site)
  function siteDist(res, E, N) {
    if (L.inPoly(E, N, res.R)) return 0;
    let d = Infinity; const R = res.R;
    for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; d = Math.min(d, L.segDist(E, N, a[0], a[1], b[0], b[1])); }
    return d;
  }
  D.acc = (res, p) => {
    const x = res.extra || {}, ac = TH.acc.c, dk = C.accDark, f = res.f;
    let o = `<rect width="100" height="100" fill="${C.accBg}"/>`;
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.accBld}"/>`;
    o += roadsSVG(res, p, { color: (c) => C.accRoads[c] || C.accRoads.other, minW: 0.6, classes: ['Motorway', 'A road', 'B road', 'Minor road', 'Service road'] });
    // UK: 5 and 10 minute walk along OS Open Roads (plus OSM paths when Overpass answered); otherwise straight-line rings at 400 and 800 m
    const wk = res.walk, walkOk = wk && !wk.error && Array.isArray(wk.edges);
    if (walkOk) {
      const d5 = wk.edges.filter((e) => e.band === 5).map((e) => lineD(e.pts, p)).join(''), d10 = wk.edges.filter((e) => e.band !== 5).map((e) => lineD(e.pts, p)).join('');
      if (d10) o += `<path d="${d10}" fill="none" stroke="${C.walk10}" stroke-width="0.7" stroke-linecap="round"/>`;
      if (d5) o += `<path d="${d5}" fill="none" stroke="${C.walk5}" stroke-width="0.9" stroke-linecap="round"${gl()}/>`;
    } else {
      const [ccx, ccy] = [p.X(res.siteC[0]), p.Y(res.siteC[1])];
      for (const rr of [400, 800]) if (rr * p.U < 140) o += `<circle cx="${f2(ccx)}" cy="${f2(ccy)}" r="${f2(rr * p.U)}" fill="none" stroke="${ac}" stroke-width="0.35" stroke-dasharray="1.2 0.8"/>`;
    }
    o += roadsSVG(res, p, { color: ac, minW: 0.25, classes: ['Path'], op: 0.7 });
    // pedestrian network (LandsD 3D Pedestrian Network); covered share by length, clipped to the frame
    let lenCov = 0, lenAll = 0;
    const gaps = [];
    if (!x.bus || x.bus.error) gaps.push(['bus stops', '']);
    if (!x.rail || x.rail.error) gaps.push(['stations', '']);
    const sets = { path: [], indoor: [], link: [], vert: [], cross: [] };
    if (x.ped && !x.ped.error) {
      for (const l of x.ped) {
        let len = 0;
        for (let i = 0; i < l.pts.length - 1; i++) len += clipLen(l.pts[i][0], l.pts[i][1], l.pts[i + 1][0], l.pts[i + 1][1], f.E0, f.N0, f.E1, f.N1);
        lenAll += len; if (l.cov) lenCov += len;
        const d = lineD(l.pts, p);
        if (l.k === 'cross') sets.cross.push(d); else if (l.indoor) sets.indoor.push(d); else (sets[l.k] || sets.path).push(d);
      }
      o += `<path d="${sets.indoor.join('')}" fill="none" stroke="${ac}" stroke-width="0.28" stroke-dasharray="0.7 0.6" stroke-opacity="0.6"/>`;
      o += `<path d="${sets.path.join('')}" fill="none" stroke="${ac}" stroke-width="0.3" stroke-opacity="0.75" stroke-linecap="round"/>`;
      o += `<path d="${sets.cross.join('')}" fill="none" stroke="${ac}" stroke-width="0.8" stroke-dasharray="0.3 0.3"/>`;
      o += `<path d="${sets.link.join('')}" fill="none" stroke="${ac}" stroke-width="0.9" stroke-linecap="round"${gl()}/>`;
      o += `<path d="${sets.vert.join('')}" fill="none" stroke="${dk}" stroke-width="1.1" stroke-linecap="round"/>`;
    }
    o += siteSVG(res, p, { fill: 0.14 });
    // markers first (drawn last, on top); their boxes are kept so the road names keep clear of them
    let mk = '';
    const avoid = [];                                               // [x0, y0, x1, y1] in map units
    const [sx, sy] = res.siteC; let nBus = 0, busDrawn = 0, mtrDrawn = 0, mtrArrow = 0, lrDrawn = 0;
    if (x.bus && !x.bus.error) for (const [E, N] of x.bus) {
      if (siteDist(res, E, N) <= 200) nBus++;                       // from the site boundary, not the centre
      const X = p.X(E), Y = p.Y(N); if (!inMap(X, Y, 1.5)) continue;
      busDrawn++;
      mk += `<circle cx="${f2(X)}" cy="${f2(Y)}" r="1.45" fill="${C.panel}" stroke="${ac}" stroke-width="0.5"/><rect x="${f2(X - 0.75)}" y="${f2(Y - 0.65)}" width="1.5" height="1.2" rx="0.25" fill="${ac}"/>`;
    }
    // MTR exits (OpenStreetMap); the nearest one gets an arrow from the frame edge when it is outside
    let mtrTxt = null;
    if (x.mtr && !x.mtr.error && x.mtr.exits.length) {
      for (const e of x.mtr.exits) {
        const X = p.X(e.E), Y = p.Y(e.N); if (!inMap(X, Y, 1.8)) continue;
        mtrDrawn++;
        const isM = e.station && e.station.kind === 'm';
        mk += isM ? `<circle cx="${f2(X)}" cy="${f2(Y)}" r="1.75" fill="${dk}"/>` + tx(X, Y + 0.8, 'M', { size: 2.1, bold: true, fill: C.onAccent, anchor: 'middle' })
          : `<rect x="${f2(X - 1.6)}" y="${f2(Y - 1.6)}" width="3.2" height="3.2" rx="0.6" fill="${dk}"/>` + tx(X, Y + 0.85, 'R', { size: 2.3, bold: true, fill: C.onAccent, anchor: 'middle' });
        avoid.push([X - 1.6, Y - 1.6, X + 1.6 + (e.ref ? 0.6 + tw(e.ref, 2, true) : 0), Y + 1.6]);
        if (e.ref) mk += tx(X + 2.2, Y + 0.8, e.ref, { size: 2, bold: true, fill: dk, halo: C.halo });
      }
      // an exit with no station name: the name is dropped, never replaced by a bare placeholder word
      const n = x.mtr.exits[0], st = n.station && (n.station.en || n.station.zh) ? T(n.station.en || n.station.zh) : '';
      const X = p.X(n.E), Y = p.Y(n.N);
      if (!inMap(X, Y, 2)) {
        const br = Math.atan2(n.E - sx, n.N - sy), ux = Math.sin(br), uy = -Math.cos(br), cx = p.X(sx), cy = p.Y(sy);
        // in a round frame the arrow stops at the circle; in a square one at the frame edge
        const t = SHAPE === 'circle' ? Math.max(5, 44 - Math.hypot(cx - 50, cy - 50))
          : Math.min(ux > 0 ? (95 - cx) / ux : ux < 0 ? (5 - cx) / ux : Infinity, uy > 0 ? (95 - cy) / uy : uy < 0 ? (5 - cy) / uy : Infinity);
        const ex = cx + ux * t, ey = cy + uy * t, bx = ex - ux * 9, by = ey - uy * 9;
        mk += `<line x1="${f2(bx)}" y1="${f2(by)}" x2="${f2(ex - ux * 2)}" y2="${f2(ey - uy * 2)}" stroke="${dk}" stroke-width="0.8"/><path d="M${f2(ex)} ${f2(ey)}L${f2(ex - ux * 2.8 - uy * 1.5)} ${f2(ey - uy * 2.8 + ux * 1.5)}L${f2(ex - ux * 2.8 + uy * 1.5)} ${f2(ey - uy * 2.8 - ux * 1.5)}Z" fill="${dk}"/>`;
        const lab = `${st || T('station')} · ${Math.round(n.d / 10) * 10} ${T('m')}`, wd = tw(lab, 2.2, true);
        const lx = Math.min(97 - wd, Math.max(3, bx - wd / 2)), ly = Math.min(88, Math.max(9, by + (uy > 0 ? -2.2 : 3.6)));
        mk += `<rect x="${f2(lx - 0.8)}" y="${f2(ly - 2.4)}" width="${f2(wd + 1.6)}" height="3.4" rx="0.6" fill="${C.panel}" fill-opacity="0.92"/>` + tx(lx, ly, lab, { size: 2.2, bold: true, fill: dk });
        avoid.push([lx - 0.8, ly - 2.4, lx + wd + 0.8, ly + 1]);
        mtrArrow++;                                  // QA r2: an arrow, not the M symbol
      }
      const sEn = n.station && (n.station.en || n.station.zh), wm = walkOk && wk.mtr && wk.mtr[0];
      mtrTxt = wm ? [`${wm.en || 'a station'} entrance ${Math.max(1, Math.round(wm.min))} min on foot`, '']
        : [`nearest station entrance ${Math.round(n.d / 10) * 10} m (${sEn ? sEn + ', ' : ''}straight line)`, ''];
    } else if (x.mtr && !x.mtr.error) mtrTxt = ['no station entrance within 2.5 km', ''];
    // Light Rail stops (OpenStreetMap): a ring with LR; named when it is within 1 km
    let lrTxt = null;
    if (x.mtr && !x.mtr.error && x.mtr.lr && x.mtr.lr.length) {
      for (const q of x.mtr.lr) {
        const X = p.X(q.E), Y = p.Y(q.N); if (!inMap(X, Y, 2)) continue;
        lrDrawn++;
        mk += `<circle cx="${f2(X)}" cy="${f2(Y)}" r="1.9" fill="${C.panel}" stroke="${dk}" stroke-width="0.55"/>` + tx(X, Y + 0.65, 'LR', { size: 1.6, bold: true, fill: dk, anchor: 'middle' });
        avoid.push([X - 1.9, Y - 1.9, X + 1.9, Y + 1.9]);
      }
      const q = x.mtr.lr[0];
      if (q.d <= 1000) lrTxt = [`nearest Light Rail stop ${Math.round(q.d / 10) * 10} m (${q.en || q.zh})`, ''];
    }
    // road names: one per main street, on its best in-frame segment that is long enough and clear of exit labels and other names
    const hitsBox = (l, wd) => {
      const a = (l.ang * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      for (let s = -wd / 2; s <= wd / 2 + 1e-6; s += 0.5) for (const v of [-1.2, 0, 1.2]) {
        const px_ = l.mx + ux * s + vx * v, py_ = l.my + uy * s + vy * v;
        for (const [x0, y0, x1, y1] of avoid) if (px_ >= x0 - 0.4 && px_ <= x1 + 0.4 && py_ >= y0 - 0.4 && py_ <= y1 + 0.4) return true;
      }
      return false;
    };
    const cands = new Map();
    for (const r of res.roadRuns) {
      if (!['Motorway', 'A road', 'B road', 'Minor road'].includes(r.cls)) continue;
      const name = nm(r.en, r.tc); if (!name) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const x1 = p.X(r.pts[i][0]), y1 = p.Y(r.pts[i][1]), x2 = p.X(r.pts[i + 1][0]), y2 = p.Y(r.pts[i + 1][1]), len = Math.hypot(x2 - x1, y2 - y1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        if (mx < 10 || mx > 90 || my < 14 || my > 86 || !inMap(mx, my, 10)) continue;
        let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        if (!cands.has(name)) cands.set(name, []);
        cands.get(name).push({ name, len, mx, my, ang, sc: len / ROAD[r.cls].rank });
      }
    }
    const roads = [...cands.values()].map((cs) => cs.sort((a, b) => b.sc - a.sc)).sort((a, b) => b[0].sc - a[0].sc).slice(0, 5);
    let names = '', nNames = 0, nSkipped = 0;
    for (const cs of roads) {
      const wd = tw(cs[0].name, 2.2);
      const l = cs.find((c) => wd + 2 <= c.len && !hitsBox(c, wd));
      if (!l) { if (cs.some((c) => wd + 2 <= c.len)) nSkipped++; continue; }
      names += tx(l.mx, l.my + 0.75, l.name, { size: 2.2, fill: C.ink2, anchor: 'middle', halo: C.halo, rot: l.ang, role: 'road' });
      nNames++;
      // the placed name becomes an obstacle for the next names
      const a = (l.ang * Math.PI) / 180, hx = (Math.abs(Math.cos(a)) * wd) / 2 + Math.abs(Math.sin(a)) * 1.2, hy = (Math.abs(Math.sin(a)) * wd) / 2 + Math.abs(Math.cos(a)) * 1.2;
      avoid.push([l.mx - hx, l.my - hy, l.mx + hx, l.my + hy]);
    }
    o += `<g data-names="${nNames}" data-skipped="${nSkipped}">${names}</g>` + mk;
    if (gaps.length) o += noteBox(T(`No ${gaps.map((g) => g[0]).join(', ')} data`), T('the transport tiles did not load'));
    else if (res.roadErr) o += noteBox(T('No road data'), T('OS Open Roads tiles did not load: stops only'), 14);
    const rc = C.accRoads['Main Road'] || C.accRoads.other, lg = [];
    if (res.roadRuns.length) lg.push({ k: 'line', c: lum(rc) > 0.9 && !C.dark ? C.roadEdge : rc, w: 1.6, t: T(res.roadSrc === 'osm' ? 'roads (OSM)' : 'roads (OS Open Roads)') });
    if (res.roadRuns.some((r) => r.cls === 'Path')) lg.push({ k: 'line', c: ac, w: 0.4, op: 0.7, t: T('paths (OSM)') });
    if (walkOk) { lg.push({ k: 'line', c: C.walk5, w: 0.9, t: T('5 min walk') }); lg.push({ k: 'line', c: C.walk10, w: 0.7, t: T('10 min walk') }); }
    else lg.push({ k: 'ring', c: ac, t: T('400 and 800 m, straight line') });
    if (busDrawn) lg.push({ k: 'bus', c: ac, t: T('bus stop') });
    if (mtrDrawn) lg.push({ k: 'mtr', c: dk, t: T('station entrance (R rail, M metro / tram)') });
    if (mtrArrow) lg.push({ k: 'arrow', c: dk, t: T('station beyond the frame') });
    const bits = [];
    if (x.bus && !x.bus.error) bits.push(nBus ? [`${nBus} bus stop${nBus === 1 ? '' : 's'} within 200 m of the site (straight line)`, ''] : ['no bus stop within 200 m of the site', '']);
    if (mtrTxt) bits.push(mtrTxt);
    if (walkOk && wk.reach) bits.push([`10 minutes on foot covers ${(wk.reach[10].area / 1e6).toFixed(2)} km²`, '']);
    if (!bits.length) bits.push(['transport data did not load', '']);
    return { svg: o, legend: lg, take: T(bits.map((b) => b[0]).join('; ').replace(/^./, (c) => c.toUpperCase()) + '.') };
  };

  D.noise = (res, p, B) => {
    let o = `<rect width="100" height="100" fill="${C.noiseBg}"/>`;
    const busy = res.roadRuns.filter((r) => r.cls === 'Highway' || r.cls === 'Main Road');
    const [b100, b50, b25] = C.noiseBands, bands = [[100, b100], [50, b50], [25, b25]];
    for (const [d, c] of bands) if (busy.length) o += `<path d="${busy.map((r) => lineD(r.pts, p)).join('')}" fill="none" stroke="${c}" stroke-width="${f2(2 * d * p.U)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.noiseBld}" fill-opacity="${C.noiseBldOp}" stroke="${C.noiseBldLine}" stroke-width="0.12"/>`;
    o += roadsSVG(res, p, { color: C.noiseMinor, minW: 0.35, classes: ['Secondary Road', 'Restricted Road', 'Track'] });
    o += `<g${gl()}>` + roadsSVG(res, p, { color: C.noiseMajor, minW: 0.7, scale: 0.5, classes: ['Highway', 'Main Road'] }) + '</g>';
    o += siteSVG(res, p, { fill: 0.1 });
    const busyIn = busy.some((r) => r.pts.some(([E, N]) => { const X = p.X(E), Y = p.Y(N); return X > -20 && X < 120 && Y > -20 && Y < 120; }));
    if (res.roadErr) o += noteBox(T('Road data did not load'), '');
    else if (!busyIn) o += noteBox(T('No highway or main road'), T('in or near this frame'));
    const b = B.busy, nmr = b ? nm(b.r.en, b.r.tc) || T('an unnamed road') : '';
    return {
      svg: o,
      legend: [{ k: 'box', c: b25, t: T('under 25 m') }, { k: 'box', c: b50, t: T('25 to 50 m') }, { k: 'box', c: b100, t: T('50 to 100 m') }, { k: 'text', t: T('from a highway or main road') }],
      take: b && b.d <= 200 ? T(`Proxy, not a measurement: the nearest highway or main road, ${nmr}, is ${b.d < 1 ? 'on the site edge' : b.d.toFixed(0) + ' m from the site edge'}.`)
        : T(`Proxy, not a measurement: no highway or main road within 200 m of the site.`),
    };
  };

  const GREEN_N = { wood: ['woodland', ''], shrub: ['shrubland', ''], grass: ['grassland', ''], urban: ['green urban area', ''], agri: ['farmland', ''] };
  const G_ORDER = ['wood', 'shrub', 'urban', 'grass', 'agri'];
  D.green = (res, p, B) => {
    const x = res.extra || {};
    let o = `<rect width="100" height="100" fill="${C.greenBg}"/>` + roadsSVG(res, p, { color: C.greenRoad });
    const seen = new Set();
    if (!x.green || x.green.error) o += noteBox(T('No habitat map data'), T('the AFCD server did not answer'));
    if (x.green && !x.green.error) {
      const by = new Map();
      for (const g of x.green) { if (!GREEN_N[g.cls]) continue; if (!by.has(g.cls)) by.set(g.cls, []); by.get(g.cls).push({ pts: g.ring.map(([E, N]) => [p.X(E), p.Y(N)]) }); seen.add(g.cls); }
      for (const k of ['agri', 'grass', 'urban', 'shrub', 'wood']) if (by.has(k)) o += `<path d="${ringsPath(by.get(k))}" fill="${C.greenCols[k]}"/>`;
    }
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.greenBld}"/>`;
    o += siteSVG(res, p, { fill: 0.12 });
    let parkTxt = null, parksDrawn = 0;
    if (x.parks && !x.parks.error) {
      const [sx, sy] = res.siteC; const ps = x.parks.map((q) => ({ ...q, d: Math.hypot(q.E - sx, q.N - sy) })).sort((a, b) => a.d - b.d);
      for (const q of ps) {
        const X = p.X(q.E), Y = p.Y(q.N); if (!inMap(X, Y, 2)) continue;
        const lab = T(q.en), lw = tw(lab, 2.1, true), right = X + 2 + lw < 97 && inMap(X + 2 + lw, Y, 1.5); parksDrawn++;
        o += `<circle cx="${f2(X)}" cy="${f2(Y)}" r="1.3" fill="${C.park}" stroke="${C.halo}" stroke-width="0.35"/>`;
        if (right || X - 2 - lw > 3 && inMap(X - 2 - lw, Y, 1.5)) o += tx(right ? X + 2 : X - 2, Y + 0.8, lab, { size: 2.1, fill: C.park, bold: true, halo: C.halo, anchor: right ? 'start' : 'end' });
      }
      if (ps[0] && ps[0].d <= 1000) parkTxt = [`${ps[0].en} is ${Math.round(ps[0].d / 10) * 10} m away`, ''];
    }
    const lg = [...seen].sort((a, b) => G_ORDER.indexOf(a) - G_ORDER.indexOf(b)).map((k) => ({ k: 'box', c: C.greenCols[k], t: T(GREEN_N[k]) }));
    if (parksDrawn) lg.push({ k: 'dot', c: C.park, t: T('LCSD park') });
    const g = B.green, main = B.greenMain && GREEN_N[B.greenMain] ? T(GREEN_N[B.greenMain]) : '';
    const take = g == null ? T('Green data did not load.')
      : T(`Mapped green covers ${g.toFixed(0)}% of the ground within ${B.radius} m${g >= 1 && main ? `, mostly ${main}` : ''}.` + (parkTxt ? ` ${parkTxt[0]}.` : ''));
    return { svg: o, legend: lg, take };
  };

  D.view = (res, p) => {
    const v = res.views, ac = TH.view.c;
    let o = baseSVG(res, p, { ground: C.viewBg, bld: C.hatch ? bldFill() : C.viewBld });
    const cx = p.X(v.x0), cy = p.Y(v.y0);
    const poly = (iso) => 'M' + Array.from(iso.d, (d, i) => { const a = (i * 2 * Math.PI) / iso.d.length, r = Math.min(d, p.F) * p.U; return `${f2(cx + r * Math.sin(a))} ${f2(cy - r * Math.cos(a))}`; }).join('L') + 'Z';
    o += `<path d="${poly(v.up)}" fill="${ac}" fill-opacity="0.13" stroke="${ac}" stroke-width="0.3" stroke-dasharray="1 0.6"/>`;
    o += `<path d="${poly(v.street)}" fill="${ac}" fill-opacity="0.4" stroke="${ac}" stroke-width="0.4"${gl()}/>`;
    o += siteSVG(res, p, { fill: 0, w: 0.7, dash: true });
    for (const s of v.open.slice(0, 3)) {                          // open sectors from 30 m up: arrows out to the frame
      const a = (s.mid * Math.PI) / 180, ux = Math.sin(a), uy = -Math.cos(a);
      const t = SHAPE === 'circle' ? Math.max(6, 43 - Math.hypot(cx - 50, cy - 50))
        : Math.min(ux > 0 ? (93 - cx) / ux : ux < 0 ? (7 - cx) / ux : Infinity, uy > 0 ? (90 - cy) / uy : uy < 0 ? (10 - cy) / uy : Infinity);
      const ex = cx + ux * t, ey = cy + uy * t, w2 = Math.min(s.w, 70) / 2, a0 = ((s.mid - w2) * Math.PI) / 180, a1 = ((s.mid + w2) * Math.PI) / 180, rr = t * 0.98;
      o += `<path d="M${f2(cx)} ${f2(cy)}L${f2(cx + rr * Math.sin(a0))} ${f2(cy - rr * Math.cos(a0))}A${f2(rr)} ${f2(rr)} 0 0 1 ${f2(cx + rr * Math.sin(a1))} ${f2(cy - rr * Math.cos(a1))}Z" fill="${ac}" fill-opacity="0.08"/>`;
      o += `<line x1="${f2(cx + ux * 6)}" y1="${f2(cy + uy * 6)}" x2="${f2(ex - ux * 2.5)}" y2="${f2(ey - uy * 2.5)}" stroke="${ac}" stroke-width="0.9"/><path d="M${f2(ex)} ${f2(ey)}L${f2(ex - ux * 3.2 - uy * 1.7)} ${f2(ey - uy * 3.2 + ux * 1.7)}L${f2(ex - ux * 3.2 + uy * 1.7)} ${f2(ey - uy * 3.2 - ux * 1.7)}Z" fill="${ac}"/>`;
    }
    o += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="1.4" fill="${C.panel}" stroke="${ac}" stroke-width="0.7"/><circle cx="${f2(cx)}" cy="${f2(cy)}" r="0.5" fill="${ac}"/>`;
    const dirs = v.open.slice(0, 3).map((s) => compass(s.mid));
    const lg = [{ k: 'box', c: ac, op: 0.4, t: T('seen from street level') }, { k: 'box', c: ac, op: 0.13, t: T('seen from 30 m up') }];
    if (v.open.length) lg.push({ k: 'arrow', c: ac, t: T(`clear beyond ${v.openD} m`) });
    return {
      svg: o, legend: lg,
      take: T(`From the street the view typically reaches ${v.street.med.toFixed(0)} m (median; sky view factor ${v.street.svf.toFixed(2)}). ` + (dirs.length ? `From 30 m up it opens to the ${[...new Set(dirs)].join(', ')}.` : 'Even 30 m up it stays enclosed.')),
    };
  };


  // ---------- UK diagrams (28 Oct 2026) ----------
  // clip a ring (E, N) to a box [E0, N0, E1, N1] (Sutherland-Hodgman); planning polygons can be whole districts
  function clipBox(ring, b) {
    let out = ring;
    const edges = [[(p) => p[0] >= b[0], (p, q) => [b[0], p[1] + ((q[1] - p[1]) * (b[0] - p[0])) / (q[0] - p[0])]],
      [(p) => p[0] <= b[2], (p, q) => [b[2], p[1] + ((q[1] - p[1]) * (b[2] - p[0])) / (q[0] - p[0])]],
      [(p) => p[1] >= b[1], (p, q) => [p[0] + ((q[0] - p[0]) * (b[1] - p[1])) / (q[1] - p[1]), b[1]]],
      [(p) => p[1] <= b[3], (p, q) => [p[0] + ((q[0] - p[0]) * (b[3] - p[1])) / (q[1] - p[1]), b[3]]]];
    for (const [ins, cut] of edges) {
      const inp = out; out = [];
      for (let i = 0; i < inp.length; i++) { const p = inp[i], q = inp[(i + 1) % inp.length], a = ins(p), c = ins(q); if (a) out.push(p); if (a !== c) out.push(cut(p, q)); }
      if (out.length < 3) return null;
    }
    return out;
  }
  const fbox = (res, m = 0.06) => { const f = res.f, F = f.E1 - f.E0; return [f.E0 - F * m, f.N0 - F * m, f.E1 + F * m, f.N1 + F * m]; };
  function polysPath(res, p, polys) {
    const list = [], bx = fbox(res);
    for (const P of polys) {
      const o = clipBox(P.outer, bx); if (!o) continue;
      list.push({ pts: o.map(([E, N]) => [p.X(E), p.Y(N)]) });
      for (const h of P.holes || []) { const c = clipBox(h, bx); if (c) list.push({ pts: c.map(([E, N]) => [p.X(E), p.Y(N)]), hole: true }); }
    }
    return ringsPath(list);
  }
  // a raster from a value grid (row 0 = north), coloured by class breaks
  function gridRaster(id, W, H, x0, y1, cell, vals, cls, p) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'), im = x.createImageData(W, H);
    for (let k = 0; k < W * H; k++) { const c = cls(vals[k]); if (!c) continue; const n = parseInt(c.slice(1), 16); im.data[k * 4] = n >> 16; im.data[k * 4 + 1] = (n >> 8) & 255; im.data[k * 4 + 2] = n & 255; im.data[k * 4 + 3] = 255; }
    x.putImageData(im, 0, 0);
    return { id, canvas: cv, x: p.X(x0), y: p.Y(y1), w: W * cell * p.U, h: H * cell * p.U };
  }
  const dist10 = (d) => Math.round(d / 10) * 10;
  // a solid background as a raster, so it sits UNDER the other rasters on screen, in exports and in 3D plates
  function bgR(col) { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 1, 1); return { id: 'bg', canvas: cv, x: -1, y: -1, w: 102, h: 102 }; }
  const NB = [50, 55, 60, 65, 70, 75];                                     // noise class breaks, dB
  D.noise = (res, p) => {
    const z = res.extra && res.extra.noise;
    let o = `<rect width="100" height="100" fill="${C.noiseBg}"/>`;
    if (!z || z.error) {
      o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.noiseBld}" stroke="${C.noiseBldLine}" stroke-width="0.12"/>` + siteSVG(res, p, { fill: 0.1 });
      o += noteBox(T('No noise data'), T('the Defra server did not answer'), 48.5);
      return { svg: o, legend: [], take: T('Noise data did not load for this site.') };
    }
    const ramp = C.noiseRamp, cls = (v) => { if (!(v > 0)) return null; let i = 0; while (i < NB.length && v >= NB[i]) i++; return ramp[i]; };
    const r = gridRaster('noise', z.W, z.H, z.x0, z.y1, z.cell, z.day, cls, p);
    o = '';
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.noiseBld}" fill-opacity="${C.noiseBldOp}" stroke="${C.noiseBldLine}" stroke-width="0.12"/>`;
    o += roadsSVG(res, p, { color: C.noiseMinor, minW: 0.3, scale: 0.4, op: 0.8 });
    o += siteSVG(res, p, { fill: 0.06, w: 0.8 });
    const s = z.site, rd = s.road.max, rl = s.rail.max, dd = s.day.max, nn = s.night.max;
    const src = rl > 0 && rd > 0 ? (rl >= rd + 3 ? ['rail', ''] : rd >= rl + 3 ? ['road', ''] : ['road and rail', '']) : rl > 0 ? ['rail', ''] : ['road', ''];
    const take = dd > 0
      ? T(`Modelled noise on the site reaches ${dd.toFixed(0)} dB LAeq,16h by day (mean ${s.day.mean.toFixed(0)}) and ${nn > 0 ? nn.toFixed(0) + ' dB' : 'below the mapped range'} Lnight, mostly from ${src[0]}. Defra Round 4 (2022) model, not a measurement.`)
      : T('The site is below the range the Defra Round 4 (2022) road and rail noise model maps. A model, not a measurement.');
    return { svg: o, rasters: [bgR(C.noiseBg), r], legend: [{ k: 'ramp', cs: ramp, ticks: ['', ...NB.map(String)], t: T('dB LAeq,16h, road + rail') }], take };
  };

  const HAB_N = { wood: ['woodland', ''], orchard: ['traditional orchard', ''], heath: ['heath', ''], wet: ['wetland', ''], grass: ['grassland', ''], other: ['other priority habitat', ''] };
  const HAB_ORDER = ['wood', 'orchard', 'grass', 'heath', 'wet', 'other'];
  D.green = (res, p, B) => {
    const x = res.extra || {};
    let o = roadsSVG(res, p, { color: C.greenRoad });
    const rasters = [bgR(C.greenBg)];
    if (x.canopy) {
      const c = x.canopy; rasters.push(gridRaster('canopy', c.W, c.H, c.x0, c.y1, 1, c.m, (v) => (v ? C.canopy : null), p));
    }
    const seen = new Set();
    if (x.green && !x.green.error) {
      const by = new Map();
      for (const g of x.green) { if (!by.has(g.cls)) by.set(g.cls, []); by.get(g.cls).push({ outer: g.ring, holes: g.holes || [] }); seen.add(g.cls); }
      for (const k of HAB_ORDER) if (by.has(k)) o += `<path d="${polysPath(res, p, by.get(k))}" fill="none" stroke="${C.habCols[k]}" stroke-width="0.55"/><path d="${polysPath(res, p, by.get(k))}" fill="url(#uksa-hab-${k})" stroke="none"/>`;
    } else o += noteBox(T('No priority habitat data'), T('the Natural England server did not answer'));
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.greenBld}"/>`;
    o += siteSVG(res, p, { fill: 0.12 });
    const lg = [];
    if (x.canopy) lg.push({ k: 'box', c: C.canopy, t: T('tree canopy (LiDAR)') });
    for (const k of HAB_ORDER) if (seen.has(k)) lg.push({ k: 'box', c: C.habCols[k], op: 0.55, t: T(HAB_N[k]) });
    const parts = [];
    if (B.canopy != null) parts.push([`LiDAR tree canopy covers ${B.canopy.toFixed(0)}% of the ground within ${B.radius} m`, '']);
    if (x.green && !x.green.error) {
      const onS = x.green.filter((g) => [g.ring].some((r) => res.R.some(([E, N]) => L.inPoly(E, N, r)) || r.some(([E, N]) => L.inPoly(E, N, res.R))));
      const names = [...new Set(x.green.map((g) => g.main))].filter(Boolean);
      if (!x.green.length) parts.push(['no priority habitat is mapped in the frame', '']);
      else parts.push([`priority habitat in the frame: ${names.slice(0, 2).join(', ').toLowerCase()}${names.length > 2 ? ' and more' : ''}${onS.length ? ', some on the site' : ''}`, '']);
    }
    const take = parts.length ? T(parts.map((q) => q[0]).join('; ').replace(/^./, (c) => c.toUpperCase()) + '.') : T('Green data did not load.');
    return { svg: o, legend: lg, take, rasters };
  };

  const PLAN_N = {
    'conservation-area': ['Conservation area', ''], 'listed-building': ['Listed building', ''], 'listed-building-outline': ['Listed building (outline)', ''],
    'scheduled-monument': ['Scheduled monument', ''], 'park-and-garden': ['Registered park or garden', ''], 'world-heritage-site': ['World Heritage Site', ''],
    'green-belt': ['Green belt', ''], 'area-of-outstanding-natural-beauty': ['National Landscape (AONB)', ''], 'national-park': ['National park', ''],
    'article-4-direction-area': ['Article 4 direction', ''], 'tree-preservation-zone': ['Tree preservation order area', ''], 'tree': ['Protected tree (TPO)', ''],
  };
  D.plan = (res, p) => {
    const pl = res.plan;
    let o = `<rect width="100" height="100" fill="${C.planBg}"/>` + roadsSVG(res, p, { color: C.road, op: 0.9 });
    if (!pl || pl.error) {
      o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.planBld}"/>` + siteSVG(res, p, { fill: 0.12 });
      o += noteBox(T('No planning data'), T('planning.data.gov.uk did not answer'), 48.5);
      return { svg: o, legend: [], take: T('Planning constraint data did not load.') };
    }
    const S = pl.sets, PC = C.planCols, polys = (ds) => (S[ds] && S[ds].items ? S[ds].items.flatMap((i) => i.polys) : []), has = (ds) => polys(ds).length > 0;
    const lg = [];
    const fill = (ds, col, op, key) => { if (!has(ds)) return; o += `<path d="${polysPath(res, p, polys(ds))}" fill="${col}" fill-opacity="${op}" stroke="${col}" stroke-width="0.25" stroke-opacity="0.8"/>`; lg.push({ k: 'box', c: col, op, t: T(PLAN_N[key || ds]) }); };
    fill('green-belt', PC.gb, 0.28); fill('area-of-outstanding-natural-beauty', PC.aonb, 0.25); fill('national-park', PC.aonb, 0.25);
    fill('park-and-garden', PC.pg, 0.25); fill('world-heritage-site', PC.whs, 0.18);
    if (has('conservation-area')) { o += `<path d="${polysPath(res, p, polys('conservation-area'))}" fill="url(#uksa-ca)" stroke="${PC.ca}" stroke-width="0.5" stroke-dasharray="1.6 0.7"/>`; lg.push({ k: 'box', c: PC.ca, op: 0.35, t: T(PLAN_N['conservation-area']) }); }
    if (has('scheduled-monument')) { o += `<path d="${polysPath(res, p, polys('scheduled-monument'))}" fill="url(#uksa-sm)" stroke="${PC.sm}" stroke-width="0.4"/>`; lg.push({ k: 'box', c: PC.sm, op: 0.4, t: T(PLAN_N['scheduled-monument']) }); }
    if (has('article-4-direction-area')) { o += `<path d="${polysPath(res, p, polys('article-4-direction-area'))}" fill="none" stroke="${PC.a4}" stroke-width="0.45" stroke-dasharray="2 0.6 0.4 0.6"/>`; lg.push({ k: 'line', c: PC.a4, w: 0.45, da: '1.4 0.5 0.3 0.5', t: T(PLAN_N['article-4-direction-area']) }); }
    if (has('tree-preservation-zone')) { o += `<path d="${polysPath(res, p, polys('tree-preservation-zone'))}" fill="${PC.tpo}" fill-opacity="0.18" stroke="${PC.tpo}" stroke-width="0.35" stroke-dasharray="0.5 0.5"/>`; lg.push({ k: 'box', c: PC.tpo, op: 0.3, t: T(PLAN_N['tree-preservation-zone']) }); }
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.planBld}" fill-opacity="0.85"/>`;
    if (has('listed-building-outline')) { o += `<path d="${polysPath(res, p, polys('listed-building-outline'))}" fill="${PC.lb}" fill-opacity="0.75" stroke="${PC.lb}" stroke-width="0.2"/>`; }
    o += siteSVG(res, p, { fill: 0.08, w: 0.9 });
    // points: protected trees, listed buildings (with the grade)
    let nT = 0, nL = 0;
    for (const it of (S.tree && S.tree.items) || []) for (const [E, N] of it.points) { const X = p.X(E), Y = p.Y(N); if (!inMap(X, Y, 1)) continue; nT++; o += `<circle cx="${f2(X)}" cy="${f2(Y)}" r="0.55" fill="${PC.tpo}" stroke="${C.halo}" stroke-width="0.15"/>`; }
    for (const it of (S['listed-building'] && S['listed-building'].items) || []) for (const [E, N] of it.points) {
      const X = p.X(E), Y = p.Y(N); if (!inMap(X, Y, 1.2)) continue; nL++;
      const big = it.grade === 'I' || it.grade === 'II*';
      o += `<path d="M${f2(X)} ${f2(Y - (big ? 1.5 : 1))}L${f2(X + (big ? 1.5 : 1))} ${f2(Y)}L${f2(X)} ${f2(Y + (big ? 1.5 : 1))}L${f2(X - (big ? 1.5 : 1))} ${f2(Y)}Z" fill="${PC.lb}" stroke="${C.halo}" stroke-width="0.2"/>`;
      if (big) o += tx(X + 1.9, Y + 0.8, it.grade, { size: 2, bold: true, fill: PC.lb, halo: C.halo });
    }
    if (nL || has('listed-building-outline')) lg.push({ k: 'lb', c: PC.lb, t: T('Listed building (I and II* labelled)') });
    if (nT) lg.push({ k: 'dot', c: PC.tpo, t: T(PLAN_N.tree) });
    // takeaway: what the site is in, listed buildings near it, and what the council has not published
    const hit = (ds) => (S[ds] && S[ds].items ? S[ds].items.filter((i) => i.share > 0 || i.d === 0) : []);
    const onEn = [], onZh = [];
    for (const ds of ['conservation-area', 'green-belt', 'area-of-outstanding-natural-beauty', 'national-park', 'world-heritage-site', 'scheduled-monument', 'park-and-garden', 'article-4-direction-area', 'tree-preservation-zone']) {
      const h = hit(ds); if (!h.length) continue;
      const n0 = h[0].name && ds === 'conservation-area' ? ` (${h[0].name})` : '';
      onEn.push(PLAN_N[ds][0].toLowerCase().replace('(aonb)', '(AONB)').replace('tpo', 'TPO') + n0); onZh.push(PLAN_N[ds][1] + (n0 ? '' : ''));
    }
    const lbs = ((S['listed-building'] && S['listed-building'].items) || []).filter((i) => i.d <= 50).sort((a, b) => a.d - b.d);
    const nogo = Object.entries(res.planCov || pl.cov || {}).filter(([, v]) => v === false).map(([ds]) => ds);
    const lpaName = pl.lpa ? pl.lpa.name : '';
    let en = onEn.length ? `The site is in: ${onEn.join('; ')}.` : 'No area constraint is recorded on the site in planning.data.gov.uk (it may not be published there yet; check with the council).';
    let zh = onZh.length ? '' : '';
    if (lbs.length) { const g = lbs[0]; en += ` ${lbs.length} listed building${lbs.length > 1 ? 's' : ''} within 50 m (nearest Grade ${g.grade || '?'}, ${g.d < 1 ? 'on the site' : g.d.toFixed(0) + ' m'}).`; zh += ''; }
    else { en += ' No listed building within 50 m.'; zh += ''; }
    if (nogo.length) { en += ` No data published${lpaName ? ' for ' + lpaName.replace(/ LPA$/, '') : ''}: ${nogo.map((d) => PLAN_N[d][0].toLowerCase().replace('tpo', 'TPO')).join(', ')}.`; zh += ''; }
    if (res.border) en += ` England data only: the ${res.border === 'Wales' ? 'Welsh' : 'Scottish'} side of the frame is blank, not clear.`;
    const errs = Object.entries(S).filter(([, v]) => v.error).map(([d]) => d);
    if (errs.length) { o += noteBox(T('Some layers did not load'), errs.map((d) => T(PLAN_N[d] || [d, d])).slice(0, 2).join(', '), 14); en += ` Not loaded: ${errs.length} layer${errs.length > 1 ? 's' : ''}.`; zh += ''; }
    return { svg: o, legend: lg, take: T(en) };
  };

  D.flood = (res, p) => {
    const fl = res.flood;
    let o = `<rect width="100" height="100" fill="${C.floodBg}"/>` + roadsSVG(res, p, { color: C.road, op: 0.9 });
    if (!fl || fl.error) {
      o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.planBld}"/>` + siteSVG(res, p, { fill: 0.12 });
      o += noteBox(T('No flood zone data'), T('planning.data.gov.uk did not answer'), 48.5);
      return { svg: o, legend: [], take: T('Flood zone data did not load.') };
    }
    const z2 = fl.items.filter((i) => String(i.level) === '2').flatMap((i) => i.polys), z3 = fl.items.filter((i) => String(i.level) === '3').flatMap((i) => i.polys);
    if (z2.length) o += `<path d="${polysPath(res, p, z2)}" fill="${C.floodCols.z2}" stroke="none"/>`;
    if (z3.length) o += `<path d="${polysPath(res, p, z3)}" fill="${C.floodCols.z3}" stroke="none"/>`;
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite), p)}" fill="${C.planBld}" fill-opacity="0.9"/>`;
    o += siteSVG(res, p, { fill: 0.08, w: 0.9 });
    const lg = [];
    if (z3.length) lg.push({ k: 'box', c: C.floodCols.z3, t: T('Flood Zone 3') });
    if (z2.length) lg.push({ k: 'box', c: C.floodCols.z2, t: T('Flood Zone 2') });
    if (!z2.length && !z3.length) { o += noteBox(T('No Flood Zone 2 or 3 recorded'), T('in this frame (planning.data.gov.uk copy)'), 20); }
    const dt = (fl.entry ? ` planning.data.gov.uk copy dated ${fl.entry}` : ' planning.data.gov.uk copy') + ', rivers and sea only; the EA Flood Map for Planning may be newer: check it.' +
      (res.border ? ` England only: the ${res.border === 'Wales' ? 'Welsh' : 'Scottish'} side is not mapped.` : '');
    const dz = (fl.entry ? '' : '') + '';
    const take = fl.zone === 1
      ? T(`No Flood Zone 2 or 3 is recorded on the site${fl.nearest != null && fl.nearest < 2000 ? ` (nearest ${dist10(fl.nearest)} m away)` : ''}, i.e. Flood Zone 1 if the data is complete. Source:` + dt)
      : T(`Flood Zone ${fl.zone} reaches the site: zone 3 covers ${fl.z3.toFixed(0)}%, zone 2 or 3 ${fl.z2.toFixed(0)}%. Source:` + dt);
    return { svg: o, legend: lg, take };
  };

  const BRE_BRK = [3, 6, 10, 15, 20];
  D.bre = (res, p) => {
    const br = res.bre;
    let o = roadsSVG(res, p, { color: C.road, op: 0.9 });
    const nbIds = new Set((br && br.neighbours || []).map((n) => n.id));
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite && !nbIds.has(b.id)), p)}" fill="${C.planBld}" fill-opacity="0.7"/>`;
    o += `<path d="${blocksPath(res, res.frameBlocks.filter((b) => !b.onSite && nbIds.has(b.id)), p)}" fill="${C.breNb}" stroke="${C.ink}" stroke-width="0.15"/>`;
    const rasters = [bgR(C.breBg)];
    if (!br || br.error) {
      o = `<rect width="100" height="100" fill="${C.breBg}"/>` + o;
      o += siteSVG(res, p, { fill: 0.12 }) + noteBox(T('Check not run'), '', 48.5);
      return { svg: o, legend: [], take: T('The BRE 25° screening did not run.') };
    }
    // the site, coloured by the height at which the 25 degree line is reached (a raster over the site's sample points)
    if (br.pts.length) {
      const st = br.step, xs = br.pts.map((q) => q[0]), ys = br.pts.map((q) => q[1]);
      const x0 = Math.min(...xs) - st / 2, y1 = Math.max(...ys) + st / 2, W = Math.round((Math.max(...xs) - Math.min(...xs)) / st) + 1, H = Math.round((Math.max(...ys) - Math.min(...ys)) / st) + 1;
      if (W * H < 4e6) {
        const v = new Float32Array(W * H).fill(NaN);
        for (const [E, N, lim] of br.pts) { const i = Math.round((E - x0 - st / 2) / st), j = Math.round((y1 - st / 2 - N) / st); if (i >= 0 && j >= 0 && i < W && j < H) v[j * W + i] = lim == null ? 1e9 : lim; }
        const cls = (x) => { if (!Number.isFinite(x)) return null; if (x >= 1e8) return C.breRamp[C.breRamp.length - 1]; let i = 0; while (i < BRE_BRK.length && x >= BRE_BRK[i]) i++; return C.breRamp[Math.min(i, C.breRamp.length - 2)]; };
        rasters.push(gridRaster('bre', W, H, x0, y1, st, v, cls, p));
      }
    }
    // the neighbouring facades that face the site square on, with a short 25 degree arrow from each into the site
    let fo = '';
    for (const F of br.faces) fo += `M${f2(p.X(F.a[0]))} ${f2(p.Y(F.a[1]))}L${f2(p.X(F.c[0]))} ${f2(p.Y(F.c[1]))}`;
    if (fo) o += `<path d="${fo}" fill="none" stroke="${TH.bre.c}" stroke-width="0.9" stroke-linecap="round"${gl()}/>`;
    o += siteSVG(res, p, { fill: 0, w: 0.8 });
    const lg = [{ k: 'ramp', cs: C.breRamp.slice(0, -1), ticks: ['0', ...BRE_BRK.map(String)], t: T('m above ground at the 25° line') }];
    if (br.faces.length) lg.push({ k: 'line', c: TH.bre.c, w: 0.9, t: T('facades facing the site') });
    lg.push({ k: 'box', c: C.breRamp[C.breRamp.length - 1], t: T(`not faced within ${br.reach} m`) });
    const head = T('Screening only, not a daylight assessment.');
    // at or below 0.5 m: the site ground already meets the line (higher ground, or a neighbour right on the boundary)
    const lvE = (v) => `${Math.max(0, v).toFixed(1)} m`, lvZ = (v) => '';
    const take = br.min == null
      ? T(`${head} No neighbouring building within ${br.reach} m faces the site square on, so the BRE 25° test sets no limit here (windows not known).`)
      : T(`${head} From windows assumed ${br.win} m up in neighbouring facades facing the site, height above site ground before a new building crosses the 25° line: ${lvE(br.min)} at the point nearest a facing window${br.centre != null ? `, ${lvE(br.centre)} at the centre` : ''}; ${Math.round(100 * br.covered)}% of the site is faced.`);
    return { svg: o, legend: lg, take, rasters };
  };

  // a diagram that could not be drawn: the plain base map with a note that says why
  function unavailable(res, p, why) {
    let reason = '';
    if (Array.isArray(why)) reason = T(why);
    else if (why) reason = String(why);
    else reason = T('the analysis did not run');
    if (reason.length > 60) reason = reason.slice(0, 57).trimEnd() + '...';
    const o = baseSVG(res, p, { ground: C.ground }) + siteSVG(res, p, { fill: 0.12 }) + noteBox(T('Not available for this site'), reason, 48.5);
    return { svg: o, legend: [], take: T('Not available for this site') + (reason ? T(`: ${reason}.`) : T('.')) };
  }
  // one diagram for the current preset, whatever drew it
  function drawKey(res, key) {
    const B = prepare(res), p = B.p;
    let d;
    if (D[key]) d = D[key](res, p, B);
    else {
      const r = res[key], g = DG3[key];
      if (!g || typeof g.draw !== 'function') d = unavailable(res, p, 'the analysis is not loaded');
      else if (!r) d = unavailable(res, p, 'no result for this site');
      else if (r.error) d = unavailable(res, p, r.error);
      else {
        try { d = g.draw(res, p, B, kit()); } catch (e) { console.warn('diagram ' + key, e); d = null; }
        if (!d || typeof d.svg !== 'string') d = unavailable(res, p, 'the drawing failed');
      }
    }
    return { svg: d.svg, legend: d.legend || [], take: d.take || '', rasters: (d.rasters || []).filter((r) => r && r.canvas), ownScale: !!d.ownScale || key === 'walk' };
  }
  // the map of one diagram (0..100 user units): rasters (screen only), drawing, round clip, ring, north and scale
  function mapBody(res, d, { forExport = false, north = true } = {}) {
    const p = prepare(res).p, round = SHAPE === 'circle';
    const imgs = forExport ? '' : d.rasters.map((r) => `<image href="${rasterURL(r)}" x="${f2(r.x)}" y="${f2(r.y)}" width="${f2(r.w)}" height="${f2(r.h)}" preserveAspectRatio="none" data-raster="${esc(r.id || 'raster')}"/>`).join('');
    let o;
    if (round) {
      const notes = []; const body = d.svg.replace(/<g class="uksa-note">[\s\S]*?<\/g>/g, (m) => { notes.push(m); return ''; });
      o = `<g clip-path="url(#uksa-cc)">${imgs}${body}</g>${notes.join('')}` + ringSVG();
    } else o = imgs + d.svg;
    if (north) o += northScale(res, p, { scale: !d.ownScale });
    return o;
  }
  // the round frame: a fine ring with ticks every 30 degrees, north tick heavier
  function ringSVG() {
    let o = `<circle cx="50" cy="50" r="49.85" fill="none" stroke="${C.ink}" stroke-width="0.32"/>`;
    for (let a = 0; a < 360; a += 30) {
      const r0 = a === 0 ? 46.6 : 48.2, t = (a * Math.PI) / 180, s = Math.sin(t), c = -Math.cos(t);
      o += `<line x1="${f2(50 + r0 * s)}" y1="${f2(50 + r0 * c)}" x2="${f2(50 + 49.85 * s)}" y2="${f2(50 + 49.85 * c)}" stroke="${C.ink}" stroke-width="${a === 0 ? 0.5 : 0.25}"/>`;
    }
    return o;
  }

  // ---------- tile = map + caption ----------
  function legendSVG(items, x0, y0, width, sz = 2.05) {
    let o = '', x = x0, y = y0, rows = 1, rampRow = false;
    for (const it of items) {
      const lab = it.t || '', lw = tw(lab, sz);
      let sw = 4.2;
      if (it.k === 'ramp') sw = 22;
      if (x + sw + lw + 1.2 > x0 + width && x > x0) { x = x0; y += rampRow ? 5.2 : 3.7; rows++; rampRow = false; }
      if (it.bg) o += `<rect x="${f2(x)}" y="${f2(y - 2)}" width="3.2" height="2.4" rx="0.3" fill="${it.bg}"/>`;
      if (it.k === 'box') o += `<rect x="${f2(x)}" y="${f2(y - 2)}" width="3.2" height="2.4" rx="0.3" fill="${it.c}"${it.op ? ` fill-opacity="${it.op}"` : ''}${it.c === C.paper || it.c === '#ffffff' ? ` stroke="${C.rule}" stroke-width="0.15"` : ''}/>`;
      else if (it.k === 'ring') o += `<circle cx="${f2(x + 1.6)}" cy="${f2(y - 0.8)}" r="1.2" fill="none" stroke="${it.c}" stroke-width="0.3" stroke-dasharray="0.6 0.5"/>`;
      else if (it.k === 'line') { const hw = it.cap === 'butt' ? 0 : Math.min(1, (it.w || 0.5) / 2); o += `<line x1="${f2(x + hw)}" y1="${f2(y - 0.8)}" x2="${f2(x + 3.4 - hw)}" y2="${f2(y - 0.8)}" stroke="${it.c}" stroke-width="${it.w || 0.5}" stroke-linecap="${it.cap || 'round'}"${it.da ? ` stroke-dasharray="${it.da}"` : ''}${it.op ? ` stroke-opacity="${it.op}"` : ''}/>`; }
      else if (it.k === 'dash') o += `<line x1="${f2(x)}" y1="${f2(y - 0.8)}" x2="${f2(x + 3.4)}" y2="${f2(y - 0.8)}" stroke="${it.c}" stroke-width="0.45" stroke-dasharray="1 0.6"/>`;
      else if (it.k === 'dot') o += `<circle cx="${f2(x + 1.4)}" cy="${f2(y - 0.8)}" r="1" fill="${it.c}"/>`;
      else if (it.k === 'bus') o += `<circle cx="${f2(x + 1.4)}" cy="${f2(y - 0.8)}" r="1.2" fill="${C.panel}" stroke="${it.c}" stroke-width="0.4"/><rect x="${f2(x + 0.8)}" y="${f2(y - 1.35)}" width="1.2" height="1" rx="0.2" fill="${it.c}"/>`;
      else if (it.k === 'mtr') o += `<rect x="${f2(x + 0.1)}" y="${f2(y - 2.1)}" width="2.6" height="2.6" rx="0.5" fill="${it.c}"/>` + tx(x + 1.4, y - 0.15, 'M', { size: 1.9, bold: true, fill: C.onAccent, anchor: 'middle' });
      else if (it.k === 'lb') o += `<path d="M${f2(x + 1.4)} ${f2(y - 2.1)}L${f2(x + 2.7)} ${f2(y - 0.8)}L${f2(x + 1.4)} ${f2(y + 0.5)}L${f2(x + 0.1)} ${f2(y - 0.8)}Z" fill="${it.c}"/>`;
      else if (it.k === 'lr') o += `<circle cx="${f2(x + 1.4)}" cy="${f2(y - 0.8)}" r="1.3" fill="${C.panel}" stroke="${it.c}" stroke-width="0.4"/>` + tx(x + 1.4, y - 0.35, 'LR', { size: 1.1, bold: true, fill: it.c, anchor: 'middle' });
      else if (it.k === 'arrow') o += `<line x1="${f2(x)}" y1="${f2(y - 0.8)}" x2="${f2(x + 2.4)}" y2="${f2(y - 0.8)}" stroke="${it.c}" stroke-width="0.6"/><path d="M${f2(x + 3.6)} ${f2(y - 0.8)}l-1.4 -0.9v1.8z" fill="${it.c}"/>`;
      else if (it.k === 'text') sw = 0;
      if (it.k === 'ramp') {
        const cs = it.cs || [], n = Math.max(1, cs.length), seg = 22 / n, ticks = it.ticks || [];
        cs.forEach((c, i) => { o += `<rect x="${f2(x + i * seg)}" y="${f2(y - 2.1)}" width="${f2(seg + 0.05)}" height="1.6" fill="${c}"/>`; });
        if (ticks.length === 2) { o += tx(x, y + 1.6, ticks[0], { size: 1.8, fill: C.muted }) + tx(x + 22, y + 1.6, ticks[1], { size: 1.8, fill: C.muted, anchor: 'end' }); }
        else ticks.forEach((t, i) => { o += tx(x + i * seg, y + 1.6, t, { size: 1.8, fill: C.muted, anchor: i ? 'middle' : 'start' }); });
        if (lab) o += tx(x + 23.2, y - 0.3, lab, { size: sz, fill: C.ink2 });
        x += 24.4 + (lab ? lw : 0) + 2.4; if (ticks.length) rampRow = true;
        continue;
      }
      o += tx(x + sw, y, lab, { size: sz, fill: it.k === 'text' ? C.muted : C.ink2 });
      x += sw + lw + 2.6;
    }
    return { o, h: items.length ? y - y0 + (rampRow ? 2.2 : 0.6) : 0 };
  }
  // caption under a map: number + title, the take (as many lines as fit), the legend
  function captionSVG(d, key, idx, width, maxH) {
    const th = TH[key], numCol = C.num || (th.c === C.ink ? C.site : th.c), ty = 4.6;
    let o = tx(0, ty, String(idx + 1).padStart(2, '0'), { size: 3.4, bold: true, fill: numCol });
    o += tx(6.2, ty, T(th.en), { size: 3.4, bold: true, fill: C.ink, role: 'title' });
    const lg = legendSVG(d.legend, 0, 0, width), lines = wrap(d.take, 2.3, width), LH = 3.0, t0 = ty + 4.4;
    let n = lines.length;
    const fits = (k) => t0 + (k - 1) * LH + (lg.h || d.legend.length ? 4.5 + lg.h : 0) <= maxH;
    while (n > 1 && !fits(n)) n--;
    for (let i = 0; i < n; i++) {
      let ln = lines[i];
      if (i === n - 1 && n < lines.length) { while (ln.length > 3 && tw(ln + '...', 2.3) > width) ln = ln.slice(0, -1); ln = ln.trimEnd() + '...'; }
      o += tx(0, t0 + i * LH, ln, { size: 2.3, fill: C.ink2, role: 'take' });
    }
    if (d.legend.length) o += `<g transform="translate(0 ${f2(t0 + (n - 1) * LH + 4.5)})">${lg.o}</g>`;
    return o;
  }
  // a tile on the board: map square (MW) and caption; returns rasters for the exports
  function tileSVG(res, key, idx, { forExport = false } = {}) {
    const d = drawKey(res, key);
    let o = `<svg x="0" y="0" width="${f2(MW)}" height="${f2(MW)}" viewBox="0 0 100 100" overflow="hidden">${mapBody(res, d, { forExport })}</svg>`;
    if (SHAPE !== 'circle') o += `<rect x="0" y="0" width="${f2(MW)}" height="${f2(MW)}" fill="none" stroke="${C.rule}" stroke-width="0.2"/>`;
    o += `<g transform="translate(0 ${f2(MW + 0.4)})">${captionSVG(d, key, idx, MW, TH_CAP - 0.6)}</g>`;
    return { svg: o, take: d.take, rasters: d.rasters };
  }

  // ---------- the board ----------
  function locator(res, x, y, w, h) {
    const idx = L.dtmTiles && L.dtmTiles(); if (!idx) return '';
    let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity; const ts = [];
    for (const k of idx) { const [e, n] = k.split('_').map(Number); ts.push([e, n]); e0 = Math.min(e0, e); e1 = Math.max(e1, e); n0 = Math.min(n0, n); n1 = Math.max(n1, n); }
    if (!ts.length) return '';
    const s = Math.min(w / (e1 - e0 + 1), h / (n1 - n0 + 1)), ox = x + (w - (e1 - e0 + 1) * s) / 2, oy = y + (h - (n1 - n0 + 1) * s) / 2;
    let d = '';
    for (const [e, n] of ts) d += `M${f2(ox + (e - e0) * s)} ${f2(oy + (n1 - n) * s)}h${f2(s * 0.86)}v${f2(s * 0.86)}h${f2(-s * 0.86)}Z`;
    const U = L.locUnit || 100000, sx = ox + (res.siteC[0] / U - e0) * s, sy = oy + (n1 + 1 - res.siteC[1] / U) * s;
    return `<path d="${d}" fill="${C.locTile}"/><circle cx="${f2(sx)}" cy="${f2(sy)}" r="2.6" fill="${C.site}" fill-opacity="0.22"/><circle cx="${f2(sx)}" cy="${f2(sy)}" r="1.1" fill="${C.site}" stroke="${C.halo}" stroke-width="0.3"${gl()}/>`;
  }
  const okR = (r) => r && !r.error;
  const NONE = () => T('none');
  // title band (y 10 to 45): eyebrow, name, address, coordinates; key facts; locator
  function titleBand(res, { name = '', address = null, drawn = '' } = {}, eyebrow) {
    const B = prepare(res), o = [];
    o.push(tx(M, 15, eyebrow, { size: 2.3, bold: true, fill: C.eyebrow, ls: 0.55 }));
    const title = name || T('Site analysis');
    let ty = 26.2;
    for (const ln of wrap(title, 10.5, 172, true).slice(0, 1)) { o.push(tx(M - 0.5, ty, ln, { size: 10.5, bold: true, fill: C.ink, ls: -0.12 })); ty += 6.6; }
    if (address) { o.push(tx(M, ty, wrap(T(address.en || address.name || ''), 3, 172)[0] || '', { size: 3, fill: C.ink2 })); ty += 4.6; }
    o.push(tx(M, ty, `${res.gridRef || ''}   BNG E ${res.siteC[0].toFixed(0)} N ${res.siteC[1].toFixed(0)}   ${res.lat.toFixed(5)} N ${Math.abs(res.lon).toFixed(5)} ${res.lon < 0 ? 'W' : 'E'}   ${T('site')} ${fmtArea(res.siteArea)}   ${T('drawn')} ${drawn}`, { size: 2.1, fill: C.muted, ls: 0.1 }));
    // facts
    const x = res.extra || {}, mtr = x.mtr && !x.mtr.error && x.mtr.exits[0], tn0 = offTall(res)[0];
    const sDec = res.sun.find((s) => s.id === 'dec') || res.sun[res.sun.length - 1];
    const facts = [
      [T('GROUND'), `+${res.zs.toFixed(0)}`, T('m AOD'), T(res.grad * 100 >= 1 ? `falls ${(res.grad * 100).toFixed(0)}% ${compass(res.fallDir)}` : 'level')],
      [T('TALLEST NEARBY'), tn0 ? tn0.H.toFixed(0) : NONE(), tn0 ? T('m') : '', tn0 ? (tn0.d < 1 ? T('on the site edge') : T(`${tn0.d.toFixed(0)} m ${compass(tn0.br)}`)) : T('no building off the site')],
      [T('NOON SHADE 21 DEC'), sDec.pct.toFixed(0), '%', T('of the site')],
    ];
    const sh = res.sunh;
    if (okR(sh) && sh.site && sh.dates) {
      const id = sh.show || 'mar', dd = sh.dates.find((q) => q.id === id), s = sh.site[id];
      if (dd && s && Number.isFinite(s.mean)) facts.push([T(`SUN HOURS ${dd.en}`.toUpperCase()), s.mean.toFixed(1), T('h'), T('site average')]);
    }
    const fl = res.flood, nz = x.noise;
    facts.push([T('FLOOD ZONE'), fl && !fl.error ? String(fl.zone) : NONE(), '', fl && !fl.error ? T(fl.zone === 1 ? 'none of 2 or 3 recorded' : `zone ${fl.zone} on ${(fl.zone === 3 ? fl.z3 : fl.z2).toFixed(0)}% of site`) : T('did not load')]);
    facts.push([T('NOISE BY DAY'), nz && !nz.error && nz.site.day.max > 0 ? nz.site.day.max.toFixed(0) : '-', nz && !nz.error && nz.site.day.max > 0 ? 'dB' : '', T('site max, modelled')]);
    facts.push([T('NEAREST STATION'), mtr ? String(Math.round(mtr.d / 10) * 10) : NONE(), mtr ? T('m') : '', mtr ? (mtr.station && mtr.station.en ? mtr.station.en : T('straight line')) : T('within 2.5 km')]);
    for (const f_ of facts) if (!f_[1] || /NaN|undefined|^-$/.test(String(f_[1]))) { f_[1] = NONE(); f_[2] = ''; }
    const fx0 = 190, fw = (364 - fx0) / facts.length;
    facts.forEach(([lab, val, unit, sub], i) => {
      const fx = fx0 + i * fw;
      o.push(`<line x1="${f2(fx)}" y1="11" x2="${f2(fx)}" y2="40.5" stroke="${C.rule}" stroke-width="0.25"/>`);
      o.push(tx(fx + 2.4, 15, wrap(lab, 1.75, fw - 4, true)[0] || '', { size: 1.75, bold: true, fill: C.muted, ls: 0.3 }));
      o.push(tx(fx + 2.2, 28, val, { size: 8.4, fill: C.ink, ls: -0.2 }) + (unit ? tx(fx + 3.2 + tw(val, 8.4) - 0.2 * val.length, 28, unit, { size: 2.6, fill: C.ink2 }) : ''));
      o.push(tx(fx + 2.4, 33.4, wrap(String(sub), 2.1, fw - 4)[0] || '', { size: 2.1, fill: C.ink2 }));
    });
    o.push(`<rect x="368" y="11" width="${BW - M - 368}" height="29.5" fill="${C.card}"/>` + locator(res, 369.5, 12.5, BW - M - 371, 26.5));
    o.push(`<line x1="${M}" y1="44.5" x2="${BW - M}" y2="44.5" stroke="${C.ink}" stroke-width="0.5"/>`);
    return o;
  }
  function footer(o, fy) {
    const lines = wrap(L.credits(), 1.75, 336);
    let yy = Math.min(fy, BH - 4 - (lines.length - 1) * 2.25);
    o.push(`<line x1="${M}" y1="${f2(yy - 3.6)}" x2="${BW - M}" y2="${f2(yy - 3.6)}" stroke="${C.rule}" stroke-width="0.3"/>`);
    for (const ln of lines) { o.push(tx(M, yy, ln, { size: 1.75, fill: C.muted })); yy += 2.25; }
    o.push(tx(BW - M, fy, 'anzonwong.com/lab/uk-site-analysis', { size: 2.1, fill: C.muted, anchor: 'end' }));
    o.push(tx(BW - M, fy + 3.6, 'AW Design', { size: 2.7, bold: true, anchor: 'end', fill: C.ink, ls: 0.2 }));
  }
  // the key strip under the grid: how to read, notes, data by diagram
  function keyStrip(res, y0) {
    const p = prepare(res).p, o = [];
    o.push(`<line x1="${M}" y1="${f2(y0)}" x2="${BW - M}" y2="${f2(y0)}" stroke="${C.ink}" stroke-width="0.25"/>`);
    const hy = y0 + 4, head = (x, s) => tx(x, hy, s, { size: 1.9, bold: true, fill: C.muted, ls: 0.4 });
    // how to read
    o.push(head(M, T('HOW TO READ')));
    let y = hy + 4.4;
    const row = (sym, label) => { o.push(sym(M, y) + tx(M + 7, y, label, { size: 2.1, fill: C.ink2 })); y += 3.7; };
    row((x, yy) => `<rect x="${x}" y="${yy - 2}" width="5" height="2.6" fill="${C.site}" fill-opacity="0.15" stroke="${C.site}" stroke-width="0.45"/>`, T('The site'));
    row((x, yy) => `<rect x="${x}" y="${yy - 2}" width="5" height="2.6" fill="${bldFill()}"/>`, T('Buildings found in the EA LiDAR'));
    row((x, yy) => `<line x1="${x}" y1="${yy - 0.7}" x2="${x + 5}" y2="${yy - 0.7}" stroke="${C.roadEdge}" stroke-width="1.4"/><line x1="${x}" y1="${yy - 0.7}" x2="${x + 5}" y2="${yy - 0.7}" stroke="${C.road}" stroke-width="0.9"/>`, res.roadErr ? T('Roads: OS Open Roads did not load') : T(res.roadSrc === 'osm' ? 'Roads (OpenStreetMap)' : 'Roads (OS Open Roads)'));
    row((x, yy) => `<path d="M${x + 2.5} ${yy - 2.8}L${x + 4} ${yy + 0.6}L${x + 2.5} ${yy - 0.2}L${x + 1} ${yy + 0.6}Z" fill="${C.ink}"/>`, T(`Grid north up; true north ${Math.abs(res.tn).toFixed(1)}° ${res.tn >= 0 ? 'east' : 'west'} of it`));
    // notes
    const nx = 78, nw = 166;
    o.push(head(nx, T('NOTES')));
    const sh = res.sunh, wk = res.walk;
    const dd = okR(sh) && sh.dates ? sh.dates.find((q) => q.id === (sh.show || 'mar')) : null;
    const dEn = dd ? dd.en : '21 Mar', dZh = dd ? dd.zh : '', spd = okR(wk) && wk.speed ? wk.speed : 80;
    const lid = res.lidar || {};
    const notes = T(`Every diagram shows the same ${p.F} m by ${p.F} m frame round the site; scale bars are true at A3. Buildings are found in the Environment Agency LiDAR (surface minus terrain, roofs told from trees by the laser's first and last returns), so they are blocks of similar height, not addresses, and some sheds, trees or vehicles can slip through. ` +
      `Shadows are drawn at 12:00 clock time (GMT; BST on 21 June). Sunlight hours count direct sun on open ground on ${dEn}, with buildings and terrain blocking it; trees ignored. Noise is the Defra Round 4 (2022) model. Flood zones are rivers and sea only. ` +
      `The BRE 25° check is a screening test with assumed windows, not a daylight assessment. Views and sky view treat the site as cleared. Distances to stops are straight lines unless a walk time is given.` +
      (res.border ? ` This frame reaches the ${res.border === 'Wales' ? 'Welsh' : 'Scottish'} border: planning, flood, noise and habitat data cover England only, so the far side is blank, not clear.` : ''));
    y = hy + 4.2;
    for (const ln of wrap(notes, 1.95, nw)) { o.push(tx(nx, y, ln, { size: 1.95, fill: C.ink2 })); y += 2.6; }
    o.push(tx(nx, y + 0.3, T('Hobby project, not official, for reference only. Not a substitute for a survey or professional advice.'), { size: 2, bold: true, fill: C.warn }));
    // data by diagram
    const dx = 252;
    o.push(head(dx, T('DATA BY DIAGRAM')));
    const w = res.extra && res.extra.wind, fl = res.flood;
    const src = [
      ['01 02', T('EA LiDAR DSM minus DTM, 1 m')],
      ['03', T('EA LiDAR DTM, 1 m')],
      ['04-06', T('NOAA sun, EA LiDAR')],
      ['07', T(`Open-Meteo ERA5${w && w.years ? ' ' + w.years.join('-') : ''}, CC BY 4.0`)],
      ['08', T(`NaPTAN (DfT) 28 Oct 2026, OS Open Roads${res.roadSrc === 'os+osm' ? ', OSM paths' : res.roadSrc === 'osm' ? ' (not loaded), OSM' : ''}`)],
      ['09', T('Defra noise mapping Round 4')],
      ['10', T('Natural England PHI, EA LiDAR')],
      ['11', T('planning.data.gov.uk (MHCLG)')],
      ['12', T(`planning.data.gov.uk (EA)${fl && fl.entry ? ', ' + fl.entry : ''}`)],
      ['13', T('EA LiDAR, BRE BR 209 25° rule')],
      ['14', T('EA LiDAR buildings and terrain')],
    ];
    const cw = (BW - M - dx) / 3;
    src.forEach(([n, t], i) => {
      const cx = dx + Math.floor(i / 4) * cw, cy = hy + 4.2 + (i % 4) * 3.4;
      o.push(tx(cx, cy, n, { size: 1.9, bold: true, fill: C.ink2 }) + tx(cx + 8, cy, wrap(t, 1.9, cw - 9)[0] || '', { size: 1.9, fill: C.ink2 }));
    });
    return o;
  }
  function rootOpen(W, H, units, cls) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}${units}" height="${H}${units}" font-family="${FONT.replace(/"/g, "'")}" class="${cls}">` + defsSVG();
  }
  function buildBoard(res, opts = {}) {
    useTheme(opts);
    const forExport = !!opts.forExport, rasters = [];
    const o = [rootOpen(BW, BH, 'mm', 'uksa-board')];
    if (!forExport) o.push(`<rect width="${BW}" height="${BH}" fill="${C.paper}"/>`);
    o.push(...titleBand(res, opts, T('UK SITE ANALYSIS · ENGLAND · DIAGRAM SERIES')));
    KEYS.forEach((k, i) => {
      const s = slot(i), t = tileSVG(res, k, i, { forExport });
      o.push(`<g transform="translate(${f2(s.x)} ${f2(s.y)})" data-k="${k}">${t.svg}</g>`);
      for (const r of t.rasters) rasters.push({ r, x: s.x, y: s.y, size: MW });
    });
    o.push(...keyStrip(res, STRIP_Y));
    footer(o, 284);
    o.push('</svg>');
    return { svg: o.join('\n'), rasters, round: SHAPE === 'circle' };
  }
  function boardSVG(res, opts = {}) { return buildBoard(res, opts).svg; }

  // ---------- rasterise ----------
  async function svgToImage(svg, w, h) {
    const s = svg.replace(/width="[\d.]+(mm|px)?" height="[\d.]+(mm|px)?"/, `width="${w}" height="${h}"`);
    const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml;charset=utf-8' }));
    try { const img = new Image(); img.decoding = 'sync'; await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('board image')); img.src = url; }); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  // paint raster layers of one map (map units) under the vector drawing; k = px per mm, (x, y, size) = the map square in mm
  function paintRasters(cx, list, k, round) {
    for (const { r, x, y, size } of list) {
      const mk = size / 100;
      cx.save(); cx.beginPath();
      if (round) cx.arc((x + 50 * mk) * k, (y + 50 * mk) * k, 50 * mk * k, 0, 2 * Math.PI); else cx.rect(x * k, y * k, size * k, size * k);
      cx.clip(); cx.imageSmoothingEnabled = true;
      cx.drawImage(r.canvas, (x + r.x * mk) * k, (y + r.y * mk) * k, r.w * mk * k, r.h * mk * k); cx.restore();
    }
  }
  async function boardCanvas(res, opts = {}, dpi = 200, scale = 1) {
    const W = Math.round((BW * scale / 25.4) * dpi), H = Math.round((BH * scale / 25.4) * dpi), k = W / BW;
    const b = buildBoard(res, { ...opts, forExport: true });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    x.fillStyle = C.paper; x.fillRect(0, 0, W, H);
    paintRasters(x, b.rasters, k, b.round);                       // rasters first, under the vector drawing
    x.drawImage(await svgToImage(b.svg, W, H), 0, 0, W, H);
    return cv;
  }
  // single diagram, 1080 x 1080: header, the map large, caption, credits
  const S1 = 1080, S_MAP = 640, S_X = (S1 - S_MAP) / 2, S_Y = 118, S_SC = 9;
  function singleSVG(res, key, opts = {}) {
    useTheme(opts);
    const forExport = !!opts.forExport, i = KEYS.indexOf(key), d = drawKey(res, key);
    let o = rootOpen(S1, S1, 'mm', 'uksa-single');
    if (!forExport) o += `<rect width="${S1}" height="${S1}" fill="${C.paper}"/>`;
    o += tx(S_X, 54, T('UK SITE ANALYSIS') + `  ·  ${String(i + 1).padStart(2, '0')} / ${KEYS.length}`, { size: 17, bold: true, fill: C.eyebrow, ls: 3 });
    o += tx(S_X - 2, 94, wrap(opts.name || T('Site analysis'), 32, S_MAP, true)[0] || '', { size: 32, bold: true, fill: C.ink, ls: -0.4 });
    o += `<svg x="${S_X}" y="${S_Y}" width="${S_MAP}" height="${S_MAP}" viewBox="0 0 100 100" overflow="hidden">${mapBody(res, d, { forExport })}</svg>`;
    if (SHAPE !== 'circle') o += `<rect x="${S_X}" y="${S_Y}" width="${S_MAP}" height="${S_MAP}" fill="none" stroke="${C.rule}" stroke-width="1.6"/>`;
    const capW = S_MAP / S_SC, capY = S_Y + S_MAP + 6;
    o += `<g transform="translate(${S_X} ${capY}) scale(${S_SC})">${captionSVG(d, key, i, capW, (1018 - capY) / S_SC)}</g>`;
    // credits + the full hobby disclaimer: 2 to 3 lines under the caption, type shrunk only as far as needed (never below 10 px)
    const cr = T('Data: Environment Agency, MHCLG planning.data.gov.uk, Defra, Natural England, DfT (OGL v3.0); contains OS data © Crown copyright and database right 2026 (OS Open Roads); ERA5 via Open-Meteo (CC BY 4.0); OpenStreetMap contributors (ODbL). Hobby project, not official, for reference only. Not a substitute for a survey or professional advice.');
    const crW = S_MAP - 130;
    let crS = 12, crL = wrap(cr, crS, crW);
    while (crL.length > 3 && crS > 10) { crS -= 0.5; crL = wrap(cr, crS, crW); }
    const crLH = crS * 1.3;
    let yy = 1066 - (crL.length - 1) * crLH;
    for (const ln of crL) { o += tx(S_X, yy, ln, { size: crS, fill: C.muted, role: 'credit' }); yy += crLH; }
    o += tx(S1 - S_X, S1 - 36, 'anzonwong.com', { size: 15, bold: true, anchor: 'end', fill: C.ink });
    return { svg: o + '</svg>', tx0: S_X, ty0: S_Y, sc: S_MAP / MW, rasters: d.rasters, round: SHAPE === 'circle' };
  }
  async function singleCanvas(res, key, opts = {}) {
    const s = singleSVG(res, key, { ...opts, forExport: true });
    const cv = document.createElement('canvas'); cv.width = cv.height = S1; const x = cv.getContext('2d');
    x.fillStyle = C.paper; x.fillRect(0, 0, S1, S1);
    paintRasters(x, s.rasters.map((r) => ({ r, x: S_X, y: S_Y, size: S_MAP })), 1, s.round);
    x.drawImage(await svgToImage(s.svg, S1, S1), 0, 0, S1, S1);
    return cv;
  }
  // the map of one diagram alone (no caption, north or scale), px x px; transparent outside a round frame
  async function plateCanvas(res, key, opts = {}, px = 1024) {
    useTheme(opts);
    const d = drawKey(res, key), round = SHAPE === 'circle';
    const cv = document.createElement('canvas'); cv.width = cv.height = px; const x = cv.getContext('2d');
    paintRasters(x, d.rasters.map((r) => ({ r, x: 0, y: 0, size: px })), 1, round);
    const body = round ? `<g clip-path="url(#uksa-cc)">${d.svg}</g>` : d.svg;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${px}" height="${px}" font-family="${FONT.replace(/"/g, "'")}">${defsSVG()}${body}</svg>`;
    x.drawImage(await svgToImage(svg, px, px), 0, 0, px, px);
    return cv;
  }

  // ---------- sheet 2: exploded layers with leader labels ----------
  const EX_W = 3307;
  function explodedSVG(res, opts = {}, ex = {}) {
    useTheme(opts);
    const forExport = !!opts.forExport, o = [rootOpen(BW, BH, 'mm', 'uksa-board uksa-exploded')];
    if (!forExport) o.push(`<rect width="${BW}" height="${BH}" fill="${C.paper}"/>`);
    const cvs = ex && ex.canvas, k = cvs ? BW / (cvs.width || EX_W) : BW / EX_W;
    if (cvs && !forExport) o.push(`<image href="${cvs.toDataURL('image/png')}" x="0" y="0" width="${BW}" height="${f2((cvs.height || 2339) * k)}" preserveAspectRatio="none" data-raster="exploded"/>`);
    o.push(...titleBand(res, opts, T('UK SITE ANALYSIS · EXPLODED LAYERS')));
    if (!cvs) {
      o.push(`<g transform="translate(110 100) scale(1.6)"><svg width="100" height="100" viewBox="0 0 100 100" overflow="visible">${noteBox(T('3D view not available'), T('this browser cannot draw WebGL'), 50)}</svg></g>`);
    }
    // labels, right column, in the order of their anchors from top to bottom
    const LX = 300, LW = BW - M - LX, top = 54, bot = 268;
    const items = ((ex && ex.anchors) || []).filter((a) => KEYS.includes(a.key) && Number.isFinite(a.x) && Number.isFinite(a.y))
      .map((a) => { const d = drawKey(res, a.key), lines = wrap(d.take, 2.3, LW - 7).slice(0, 3); return { a, ax: a.x * k, ay: a.y * k, lines, h: 5.4 + lines.length * 3 + 2 }; })
      .sort((p, q) => p.ay - q.ay);
    let y = top;
    for (const it of items) { it.y = Math.max(y, Math.min(it.ay - 2, bot)); y = it.y + it.h; }
    for (let i = items.length - 1, lim = bot; i >= 0; i--) { const it = items[i]; if (it.y + it.h > lim) it.y = lim - it.h; lim = it.y; }
    for (const it of items) {
      const key = it.a.key, i = KEYS.indexOf(key), th = TH[key], col = C.num || (th.c === C.ink ? C.site : th.c), ly = it.y + 3.4;
      let g = `<g data-k="${key}">`;
      g += `<polyline points="${f2(it.ax)},${f2(it.ay)} ${f2(LX - 8)},${f2(ly - 1.1)} ${f2(LX - 1.5)},${f2(ly - 1.1)}" fill="none" stroke="${C.ink}" stroke-width="0.22" stroke-opacity="0.85"/>`;
      g += `<circle cx="${f2(it.ax)}" cy="${f2(it.ay)}" r="0.9" fill="${col}" stroke="${C.halo}" stroke-width="0.3"${gl()}/>`;
      g += tx(LX, ly, String(i + 1).padStart(2, '0'), { size: 3.4, bold: true, fill: col }) + tx(LX + 6.6, ly, T(th.en), { size: 3.4, bold: true, fill: C.ink, role: 'title' });
      it.lines.forEach((ln, j) => { g += tx(LX + 6.6, ly + 4.2 + j * 3, ln, { size: 2.3, fill: C.ink2, role: 'take' }); });
      o.push(g + '</g>');
    }
    footer(o, 284);
    o.push('</svg>');
    return o.join('\n');
  }
  function explodedSheetSVG(res, opts = {}, ex = {}) { return explodedSVG(res, opts, ex); }
  async function explodedSheetCanvas(res, opts = {}, ex = {}, dpi = 200, scale = 1) {
    const W = Math.round((BW * scale / 25.4) * dpi), H = Math.round((BH * scale / 25.4) * dpi);
    const svg = explodedSVG(res, { ...opts, forExport: true }, ex);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    x.fillStyle = C.paper; x.fillRect(0, 0, W, H);
    if (ex && ex.canvas) { x.imageSmoothingEnabled = true; x.drawImage(ex.canvas, 0, 0, W, (ex.canvas.height / ex.canvas.width) * W); }
    x.drawImage(await svgToImage(svg, W, H), 0, 0, W, H);
    return cv;
  }

  // ---------- small APIs for the 3D view and the lead ----------
  function theme(opts = {}) {
    useTheme(opts);
    return { id: C.id, paper: C.paper, ink: C.ink, ink2: C.ink2, muted: C.muted, rule: C.rule, ground: C.ground, bld: C.bld, road: C.road, site: C.site,
      accent: { ...C.acc }, dark: !!C.dark, hRamp: C.hRamp.slice(), hBreaks: H_BRK.slice(), shape: SHAPE };
  }
  function titles() { useTheme({ style: C.id, shape: SHAPE }); const o = {}; for (const k of KEYS) o[k] = [TH[k].en, TH[k].zh]; return o; }
  return { KEYS, STYLES, prepare, boardSVG, boardCanvas, singleSVG, singleCanvas, plateCanvas, explodedSheetSVG, explodedSheetCanvas, theme, titles, kit: (opts) => { useTheme(opts); return kit(); }, BW, BH };
}
