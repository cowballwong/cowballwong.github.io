// HK Swept Path · DXF R2000 writer. Adapted from the hand-written writer of HK Site Analysis (lab_hk_site_analysis/cad.js,
// ezdxf audit 0 errors there). Input M = { layers: [{ name, aci, lw, lt, items: [{t:'pl', pts, closed} | {t:'text', x, y, h, s, al} | {t:'circle', x, y, r}] }],
// insunits, textH }. Coordinates are written as given (already in drawing units, y up).
const LT_DASHED = 'DASHED', LT_HIDDEN = 'HIDDEN';
const OFF_BY_DEFAULT = (n) => /^SP-VEHICLE|^SP-OUT-VEHICLE/.test(n);
const n3 = (v) => (Math.abs(v) < 5e-4 ? '0.0' : v.toFixed(3));
function dxfStr(s) {                                    // non-ASCII -> \U+XXXX; astral -> '?'; control chars dropped
  let o = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c < 32) continue;
    if (c < 127) o += ch; else if (c > 0xffff) o += '?'; else o += '\\U+' + c.toString(16).toUpperCase().padStart(4, '0');
  }
  return o;
}
const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);
export function toDXF(M) {
  const o = [];
  let hnd = 0x40; const H = () => (hnd++).toString(16).toUpperCase();
  const MS = '17', PS = '1B';
  const ext = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const grow = (x, y, z = 0) => { if (x < ext[0]) ext[0] = x; if (y < ext[1]) ext[1] = y; if (z < ext[2]) ext[2] = z; if (x > ext[3]) ext[3] = x; if (y > ext[4]) ext[4] = y; if (z > ext[5]) ext[5] = z; };
  const p = (...kv) => { for (let i = 0; i < kv.length; i += 2) o.push(kv[i], kv[i + 1]); };
  const ent = (type, layer) => p(0, type, 5, H(), 330, MS, 100, 'AcDbEntity', 8, layer);
  // entities first (handles from the counter), tables after (they need the layer list and use the same counter)
  for (const l of M.layers) {
    for (const it of l.items) {
      if (it.t === 'pl') {
        ent('LWPOLYLINE', l.name);
        p(100, 'AcDbPolyline', 90, it.pts.length, 70, it.closed ? 1 : 0);
        if (it.z) p(38, n3(it.z));
        if (it.th) p(39, n3(it.th));
        for (const [x, y] of it.pts) { p(10, n3(x), 20, n3(y)); grow(x, y, it.z || 0); if (it.th) grow(x, y, (it.z || 0) + it.th); }
      } else if (it.t === 'circle') {
        ent('CIRCLE', l.name); p(100, 'AcDbCircle', 10, n3(it.x), 20, n3(it.y), 30, '0.0', 40, n3(it.r)); grow(it.x - it.r, it.y - it.r); grow(it.x + it.r, it.y + it.r);
      } else if (it.t === 'point') {
        ent('POINT', l.name); p(100, 'AcDbPoint', 10, n3(it.x), 20, n3(it.y), 30, n3(it.z || 0)); grow(it.x, it.y, it.z || 0);
      } else if (it.t === 'text') {
        const s = dxfStr(it.s), st = isAscii(it.s) ? 'Standard' : 'SP-CJK', z = n3(it.z || 0);
        const ha = it.al === 'c' ? 1 : it.al === 'r' ? 2 : 0, va = it.mid ? 2 : 0;
        ent('TEXT', l.name); p(100, 'AcDbText', 10, n3(it.x), 20, n3(it.y), 30, z, 40, n3(it.h), 1, s, 7, st);
        if (ha || va) p(72, ha, 11, n3(it.x), 21, n3(it.y), 31, z);
        p(100, 'AcDbText'); if (va) p(73, va);
        grow(it.x, it.y, it.z || 0);
      } else if (it.t === 'mtext') {
        let s = String(it.s).replace(/\\/g, '\\\\').replace(/[{}]/g, (m) => '\\' + m).split('\n').map(dxfStr).join('\\P');
        ent('MTEXT', l.name); p(100, 'AcDbMText', 10, n3(it.x), 20, n3(it.y), 30, '0.0', 40, n3(it.h), 41, n3(it.w), 71, 1, 72, 1);
        while (s.length > 250) { let k = 250; const bs = s.lastIndexOf('\\', k); if (bs > k - 8) k = bs; p(3, s.slice(0, k)); s = s.slice(k); }
        p(1, s, 7, 'SP-CJK');
        grow(it.x, it.y); grow(it.x + it.w, it.y - it.h * 40);
      }
    }
  }
  const ents = o.splice(0, o.length);
  if (!Number.isFinite(ext[0])) { ext[0] = 0; ext[1] = 0; ext[2] = 0; ext[3] = 1000; ext[4] = 1000; ext[5] = 0; }

  // tables
  const lts = [['ByBlock', '', []], ['ByLayer', '', []], ['Continuous', 'Solid line', []], [LT_DASHED, 'Dashed __ __ __', [2, -1]], [LT_HIDDEN, 'Hidden _ _ _ _', [1, -0.5]]];
  const ltH = { ByBlock: '24', ByLayer: '25', Continuous: '26' };
  const tables = [];
  const T = (...kv) => { for (let i = 0; i < kv.length; i += 2) tables.push(kv[i], kv[i + 1]); };
  T(0, 'SECTION', 2, 'TABLES');
  T(0, 'TABLE', 2, 'VPORT', 5, '8', 330, '0', 100, 'AcDbSymbolTable', 70, 1);
  const vw = Math.max(ext[3] - ext[0], ext[4] - ext[1]) * 1.05;
  T(0, 'VPORT', 5, '23', 330, '8', 100, 'AcDbSymbolTableRecord', 100, 'AcDbViewportTableRecord', 2, '*Active', 70, 0, 10, '0.0', 20, '0.0', 11, '1.0', 21, '1.0',
    12, n3((ext[0] + ext[3]) / 2), 22, n3((ext[1] + ext[4]) / 2), 13, '0.0', 23, '0.0', 14, '1.0', 24, '1.0', 15, '10.0', 25, '10.0', 16, '0.0', 26, '0.0', 36, '1.0',
    17, '0.0', 27, '0.0', 37, '0.0', 40, n3(vw), 41, '1.4', 42, '50.0', 43, '0.0', 44, '0.0', 50, '0.0', 51, '0.0', 71, 0, 72, 1000, 73, 1, 74, 3, 75, 0, 76, 0, 77, 0, 78, 0);
  T(0, 'ENDTAB');
  T(0, 'TABLE', 2, 'LTYPE', 5, '2', 330, '0', 100, 'AcDbSymbolTable', 70, lts.length);
  for (const [nm, desc, pat] of lts) {
    T(0, 'LTYPE', 5, ltH[nm] || (ltH[nm] = H()), 330, '2', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, nm, 70, 0, 3, desc, 72, 65, 73, pat.length,
      40, n3(pat.reduce((a, v) => a + Math.abs(v), 0)));
    for (const v of pat) T(49, n3(v), 74, 0);
  }
  T(0, 'ENDTAB');
  const lyr = [{ name: '0', aci: 7, lw: -3 }, ...M.layers];
  T(0, 'TABLE', 2, 'LAYER', 5, '1', 330, '0', 100, 'AcDbSymbolTable', 70, lyr.length);
  for (const l of lyr) T(0, 'LAYER', 5, H(), 330, '1', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, l.name, 70, 0, 62, OFF_BY_DEFAULT(l.name) ? -Math.abs(l.aci) : l.aci, 6, l.lt || 'Continuous', 370, l.lw == null ? -3 : l.lw, 390, '13');
  T(0, 'ENDTAB');
  T(0, 'TABLE', 2, 'STYLE', 5, '5', 330, '0', 100, 'AcDbSymbolTable', 70, 2);
  T(0, 'STYLE', 5, '29', 330, '5', 100, 'AcDbSymbolTableRecord', 100, 'AcDbTextStyleTableRecord', 2, 'Standard', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, 'arial.ttf', 4, '');
  T(0, 'STYLE', 5, H(), 330, '5', 100, 'AcDbSymbolTableRecord', 100, 'AcDbTextStyleTableRecord', 2, 'SP-CJK', 70, 0, 40, '0.0', 41, '1.0', 50, '0.0', 71, 0, 42, '2.5', 3, 'msjh.ttc', 4, '');
  T(0, 'ENDTAB');
  T(0, 'TABLE', 2, 'VIEW', 5, '7', 330, '0', 100, 'AcDbSymbolTable', 70, 0, 0, 'ENDTAB');
  T(0, 'TABLE', 2, 'UCS', 5, '6', 330, '0', 100, 'AcDbSymbolTable', 70, 0, 0, 'ENDTAB');
  T(0, 'TABLE', 2, 'APPID', 5, '3', 330, '0', 100, 'AcDbSymbolTable', 70, 1);
  T(0, 'APPID', 5, '2A', 330, '3', 100, 'AcDbSymbolTableRecord', 100, 'AcDbRegAppTableRecord', 2, 'ACAD', 70, 0, 0, 'ENDTAB');
  T(0, 'TABLE', 2, 'DIMSTYLE', 5, '4', 330, '0', 100, 'AcDbSymbolTable', 70, 1, 100, 'AcDbDimStyleTable');
  T(0, 'DIMSTYLE', 105, '2B', 330, '4', 100, 'AcDbSymbolTableRecord', 100, 'AcDbDimStyleTableRecord', 2, 'Standard', 70, 0, 3, '', 4, '', 40, '1.0', 41, '2.5', 42, '0.625', 43, '3.75', 44, '1.25',
    45, '0.0', 46, '0.0', 47, '0.0', 48, '0.0', 140, '2.5', 141, '2.5', 142, '0.0', 143, '0.03937007874', 144, '1.0', 145, '0.0', 146, '1.0', 147, '0.625', 148, '0.0',
    71, 0, 72, 0, 73, 0, 74, 0, 75, 0, 76, 0, 77, 1, 78, 8, 79, 3, 170, 0, 171, 3, 172, 1, 173, 0, 174, 0, 175, 0, 176, 0, 177, 0, 178, 0, 179, 2,
    271, 2, 272, 2, 273, 2, 274, 3, 275, 0, 276, 0, 277, 2, 278, 44, 279, 0, 280, 0, 281, 0, 282, 0, 283, 0, 284, 8, 285, 0, 286, 0, 288, 0, 289, 3, 371, -2, 372, -2);
  T(0, 'ENDTAB');
  T(0, 'TABLE', 2, 'BLOCK_RECORD', 5, '9', 330, '0', 100, 'AcDbSymbolTable', 70, 2);
  T(0, 'BLOCK_RECORD', 5, MS, 330, '9', 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, '*Model_Space', 340, '1A');
  T(0, 'BLOCK_RECORD', 5, PS, 330, '9', 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, '*Paper_Space', 340, '1E');
  T(0, 'ENDTAB', 0, 'ENDSEC');

  // header (written last so it knows the extents and the next handle)
  const head = [];
  const hv = (name, ...kv) => { head.push(9, name); for (let i = 0; i < kv.length; i += 2) head.push(kv[i], kv[i + 1]); };
  head.push(0, 'SECTION', 2, 'HEADER');
  hv('$ACADVER', 1, 'AC1015'); hv('$ACADMAINTVER', 70, 6); hv('$DWGCODEPAGE', 3, 'ANSI_1252');
  hv('$INSBASE', 10, '0.0', 20, '0.0', 30, '0.0');
  hv('$EXTMIN', 10, n3(ext[0]), 20, n3(ext[1]), 30, n3(ext[2])); hv('$EXTMAX', 10, n3(ext[3]), 20, n3(ext[4]), 30, n3(ext[5]));
  hv('$LIMMIN', 10, n3(ext[0]), 20, n3(ext[1])); hv('$LIMMAX', 10, n3(ext[3]), 20, n3(ext[4]));
  hv('$LTSCALE', 40, '1.0'); hv('$TEXTSIZE', 40, n3(M.textH || 250)); hv('$TEXTSTYLE', 7, 'Standard'); hv('$CLAYER', 8, '0');
  hv('$CELTYPE', 6, 'ByLayer'); hv('$LUNITS', 70, 2); hv('$LUPREC', 70, 3); hv('$AUNITS', 70, 0); hv('$AUPREC', 70, 2);
  hv('$PDMODE', 70, 3); hv('$PDSIZE', 40, n3(M.textH || 250)); hv('$MEASUREMENT', 70, 1); hv('$INSUNITS', 70, M.insunits || 4); hv('$LWDISPLAY', 290, 1);
  hv('$HANDSEED', 5, (hnd + 16).toString(16).toUpperCase());
  head.push(0, 'ENDSEC');

  const classes = [0, 'SECTION', 2, 'CLASSES',
    0, 'CLASS', 1, 'ACDBDICTIONARYWDFLT', 2, 'AcDbDictionaryWithDefault', 3, 'ObjectDBX Classes', 90, 0, 280, 0, 281, 0,
    0, 'CLASS', 1, 'ACDBPLACEHOLDER', 2, 'AcDbPlaceHolder', 3, 'ObjectDBX Classes', 90, 0, 280, 0, 281, 0,
    0, 'CLASS', 1, 'LAYOUT', 2, 'AcDbLayout', 3, 'ObjectDBX Classes', 90, 0, 280, 0, 281, 0, 0, 'ENDSEC'];
  const blocks = [0, 'SECTION', 2, 'BLOCKS',
    0, 'BLOCK', 5, '18', 330, MS, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockBegin', 2, '*Model_Space', 70, 0, 10, '0.0', 20, '0.0', 30, '0.0', 3, '*Model_Space', 1, '',
    0, 'ENDBLK', 5, '19', 330, MS, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockEnd',
    0, 'BLOCK', 5, '1C', 330, PS, 100, 'AcDbEntity', 67, 1, 8, '0', 100, 'AcDbBlockBegin', 2, '*Paper_Space', 70, 0, 10, '0.0', 20, '0.0', 30, '0.0', 3, '*Paper_Space', 1, '',
    0, 'ENDBLK', 5, '1D', 330, PS, 100, 'AcDbEntity', 67, 1, 8, '0', 100, 'AcDbBlockEnd', 0, 'ENDSEC'];
  const layout = (h, name, flag, tab, br) => [0, 'LAYOUT', 5, h, 330, 'D', 100, 'AcDbPlotSettings', 1, '', 4, 'A3', 6, '', 40, '7.5', 41, '20.0', 42, '7.5', 43, '20.0', 44, '420.0', 45, '297.0',
    46, '0.0', 47, '0.0', 48, '0.0', 49, '0.0', 140, '0.0', 141, '0.0', 142, '1.0', 143, '1.0', 70, flag, 72, 1, 73, 0, 74, 5, 7, '', 75, 16, 76, 0, 77, 2, 78, 300, 147, '1.0', 148, '0.0', 149, '0.0',
    100, 'AcDbLayout', 1, name, 70, 1, 71, tab, 10, '0.0', 20, '0.0', 11, '420.0', 21, '297.0', 12, '0.0', 22, '0.0', 32, '0.0',
    14, n3(ext[0]), 24, n3(ext[1]), 34, n3(ext[2]), 15, n3(ext[3]), 25, n3(ext[4]), 35, n3(ext[5]), 146, '0.0', 13, '0.0', 23, '0.0', 33, '0.0',
    16, '1.0', 26, '0.0', 36, '0.0', 17, '0.0', 27, '1.0', 37, '0.0', 76, 1, 330, br];
  const objects = [0, 'SECTION', 2, 'OBJECTS',
    0, 'DICTIONARY', 5, 'A', 330, '0', 100, 'AcDbDictionary', 281, 1, 3, 'ACAD_GROUP', 350, 'C', 3, 'ACAD_LAYOUT', 350, 'D', 3, 'ACAD_MLINESTYLE', 350, '10',
    3, 'ACAD_PLOTSETTINGS', 350, '11', 3, 'ACAD_PLOTSTYLENAME', 350, '12',
    0, 'DICTIONARY', 5, 'C', 330, 'A', 100, 'AcDbDictionary', 281, 1,
    0, 'DICTIONARY', 5, 'D', 330, 'A', 100, 'AcDbDictionary', 281, 1, 3, 'Model', 350, '1A', 3, 'Layout1', 350, '1E',
    0, 'DICTIONARY', 5, '10', 330, 'A', 100, 'AcDbDictionary', 281, 1, 3, 'Standard', 350, '22',
    0, 'DICTIONARY', 5, '11', 330, 'A', 100, 'AcDbDictionary', 281, 1,
    0, 'ACDBDICTIONARYWDFLT', 5, '12', 330, 'A', 100, 'AcDbDictionary', 281, 1, 3, 'Normal', 350, '13', 100, 'AcDbDictionaryWithDefault', 340, '13',
    0, 'ACDBPLACEHOLDER', 5, '13', 330, '12',
    ...layout('1A', 'Model', 1024, 0, MS), ...layout('1E', 'Layout1', 0, 1, PS),
    0, 'MLINESTYLE', 5, '22', 102, '{ACAD_REACTORS', 330, '10', 102, '}', 330, '10', 100, 'AcDbMlineStyle', 2, 'Standard', 70, 0, 3, '', 62, 256, 51, '90.0', 52, '90.0', 71, 2,
    49, '0.5', 62, 256, 6, 'BYLAYER', 49, '-0.5', 62, 256, 6, 'BYLAYER',
    0, 'ENDSEC'];
  const all = [...head, ...classes, ...tables, ...blocks, 0, 'SECTION', 2, 'ENTITIES', ...ents, 0, 'ENDSEC', ...objects, 0, 'EOF'];
  const out = new Array(all.length);
  for (let i = 0; i < all.length; i += 2) { out[i] = String(all[i]).padStart(3, ' '); out[i + 1] = String(all[i + 1]); }
  return out.join('\r\n') + '\r\n';
}
