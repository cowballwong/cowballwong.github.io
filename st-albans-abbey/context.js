// The setting: real terrain (EU-DEM), a painted ground map (OSM roads, water, parks), the town's buildings
// appearing over the centuries, the Roman city of Verulamium, trees, and the path network people walk on.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Streets that existed in the medieval town (they get buildings early and carry medieval traffic).
const OLD_STREETS = /^(Holywell Hill|George Street|Fishpool Street|French Row|Market Place|St Peter'?s Street|Romeland|Romeland Hill|Abbey Mill Lane|Sopwell Lane|High Street|Chequer Street|St Michael'?s Street|Verulam Road|Spencer Street|Upper Dagnall Street|Lower Dagnall Street|Catherine Street)$/i;
const CAR_ROADS = /^(primary|secondary|tertiary|residential|unclassified|trunk|primary_link|secondary_link|tertiary_link|living_street)$/;

let s = 3;
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

export function buildTerrain(T) {
  const base = sample(T, 0, 0);
  const h = (x, z) => {
    let y = sample(T, x, z) - base;
    // Level the cathedral's own platform so the floor sits at y = 0.
    const dx = Math.max(0, Math.abs(x - 84) - 95), dz = Math.max(0, Math.abs(z) - 30);
    const d = Math.hypot(dx, dz), k = Math.min(1, d / 60);
    return y * k * k * (3 - 2 * k);
  };
  return h;
}
function sample(T, x, z) {
  const fx = (x - T.x0) / T.step, fz = (z - T.z0) / T.step;
  const i = Math.max(0, Math.min(T.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(T.nz - 2, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
  const H = (a, b) => T.heights[b * T.nx + a];
  return H(i, j) * (1 - u) * (1 - v) + H(i + 1, j) * u * (1 - v) + H(i, j + 1) * (1 - u) * v + H(i + 1, j + 1) * u * v;
}

// ---------- painted ground maps ----------
const BOUNDS = {x0: -1320, x1: 960, z0: -1060, z1: 1060};
function groundCanvas(C, era, px) {
  const W = BOUNDS.x1 - BOUNDS.x0, H = BOUNDS.z1 - BOUNDS.z0;
  const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * H / W);
  const g = c.getContext('2d'), sx = c.width / W, sz = c.height / H;
  const P = ([x, z]) => [(x - BOUNDS.x0) * sx, (z - BOUNDS.z0) * sz];
  const poly = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](...P(p))); g.closePath(); g.fillStyle = fill; g.fill(); };
  const line = (pts, w, stroke) => { g.beginPath(); pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](...P(p))); g.lineWidth = w * sx; g.strokeStyle = stroke; g.lineCap = g.lineJoin = 'round'; g.stroke(); };
  // fields: soft mottled greens
  g.fillStyle = era === 'roman' ? '#9da874' : '#9fae78'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${70 + rnd() * 50},${90 + rnd() * 40},${40 + rnd() * 30},.08)`; const r = 8 + rnd() * 60; g.beginPath(); g.arc(rnd() * c.width, rnd() * c.height, r, 0, 7); g.fill(); }
  if (era === 'modern' || era === 'victorian') {
    for (const gr of C.green) poly(gr.outline, /wood|forest/.test(gr.kind) ? '#6f8a55' : /pitch|golf/.test(gr.kind) ? '#93b36a' : '#a3b97a');
    // the built-up town: a pale ground under the streets
    for (const b of C.buildings) poly(b.outline, '#cfc6b6');
  } else if (era === 'medieval') {
    for (const gr of C.green) if (/wood|forest/.test(gr.kind)) poly(gr.outline, '#7d9460');
  }
  // Verulamium Lake was dug in 1929-30; earlier maps show only the river and small ponds
  for (const w of C.water) if (era === 'modern' || w.outline.length < 40 && polyArea(w.outline) < 3000) poly(w.outline, era === 'modern' ? '#7d9fae' : '#86a3a4');
  for (const r of C.rivers) line(r.line, 7, '#7d9fae');
  if (era === 'modern' || era === 'victorian') {
    for (const p of C.paths) line(p.line, 1.8, '#d9cfbb');
    for (const r of C.roads) {
      const w = /primary|trunk/.test(r.kind) ? 11 : /secondary|tertiary/.test(r.kind) ? 9 : /residential|unclassified|living/.test(r.kind) ? 7 : 4;
      line(r.line, w + 1.4, '#8f877a'); line(r.line, w, /service|footway|pedestrian/.test(r.kind) ? '#cdc4b2' : '#6d6a66');
    }
  } else if (era === 'medieval') {
    for (const r of C.roads) if (r.name && OLD_STREETS.test(r.name)) line(r.line, 8, '#b9a586');
  } else {
    for (const r of C.romanStreets) line(r, 7, '#c2ad8a');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function buildGround(scene, C, ground, renderer) {
  const W = BOUNDS.x1 - BOUNDS.x0, H = BOUNDS.z1 - BOUNDS.z0, seg = 180;
  const geo = new THREE.PlaneGeometry(W, H, seg, Math.round(seg * H / W)).rotateX(-Math.PI / 2);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + (BOUNDS.x0 + BOUNDS.x1) / 2, z = p.getZ(i) + (BOUNDS.z0 + BOUNDS.z1) / 2;
    p.setXYZ(i, x, ground(x, z) - 0.05, z);
    uv.setXY(i, (x - BOUNDS.x0) / W, 1 - (z - BOUNDS.z0) / H);
  }
  geo.computeVertexNormals();
  const maps = {modern: groundCanvas(C, 'modern', 4096), victorian: groundCanvas(C, 'victorian', 2048), medieval: groundCanvas(C, 'medieval', 2048), roman: groundCanvas(C, 'roman', 2048)};
  for (const t of Object.values(maps)) t.flipY = true;
  const mat = new THREE.MeshStandardMaterial({map: maps.modern, roughness: 1});
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  let cur = 'modern';
  return {mesh, setYear(y) {
    const k = y < 450 ? 'roman' : y < 1820 ? 'medieval' : y < 1930 ? 'victorian' : 'modern';
    if (k !== cur) { cur = k; mat.map = maps[k]; mat.needsUpdate = true; }
  }};
}

// ---------- the Roman city: a schematic street grid inside the wall circuit ----------
export function romanCity(C) {
  // Schematic circuit: an oval of about 82 ha running north-west from the surviving south-east wall (in the park)
  // past the theatre, aligned with Watling Street. Only the surviving wall segments come from OSM.
  const cx = -890, cz = 370, ang = Math.atan2(-700, -750), A = 640, Bm = 400;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const hull = [];
  for (let i = 0; i < 64; i++) { const t = (i / 64) * Math.PI * 2, u = A * Math.cos(t), v = Bm * Math.sin(t); hull.push([cx + u * ca - v * sa, cz + u * sa + v * ca]); }
  const streets = [], blocks = [];
  const rot = (u, v) => [cx + u * ca - v * sa, cz + u * sa + v * ca];
  for (let u = -600; u <= 600; u += 120) {
    const seg = []; for (let v = -600; v <= 600; v += 20) { const q = rot(u, v); if (inside(hull, q)) seg.push(q); }
    if (seg.length > 2) streets.push(seg);
  }
  for (let v = -600; v <= 600; v += 120) {
    const seg = []; for (let u = -600; u <= 600; u += 20) { const q = rot(u, v); if (inside(hull, q)) seg.push(q); }
    if (seg.length > 2) streets.push(seg);
  }
  for (let u = -540; u <= 540; u += 120) for (let v = -540; v <= 540; v += 120) {
    const q = rot(u, v);
    if (!inside(hull, q)) continue;
    for (let k = 0; k < 6; k++) {
      const du = (rnd() - 0.5) * 80, dv = (rnd() - 0.5) * 80, q2 = rot(u + du, v + dv);
      if (inside(hull, q2)) blocks.push({x: q2[0], z: q2[1], w: 10 + rnd() * 14, d: 8 + rnd() * 10, h: 4 + rnd() * 3, a: ang});
    }
  }
  return {hull, streets, blocks, centre: [cx, cz], angle: ang};
}
function convexHull(P) {
  const p = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length > 1 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function inside(poly, [x, z]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const polyArea = o => Math.abs(o.reduce((a, p, i) => { const q = o[(i + 1) % o.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const centroid = o => [o.reduce((a, p) => a + p[0], 0) / o.length, o.reduce((a, p) => a + p[1], 0) / o.length];
function distToLine(p, line) {
  let best = 1e9;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L));
    best = Math.min(best, Math.hypot(p[0] - ax - t * dx, p[1] - az - t * dz));
  }
  return best;
}

// ---------- town buildings, bucketed by the year they appear ----------
const WALLS = ['#c9b79c', '#b98a6a', '#d8cdb8', '#a7745a', '#e2d8c4', '#9c6b52', '#cbbfa8'];
const ROOFS = ['#6b5f58', '#8a4a35', '#5d5a58', '#7a4433', '#63666b'];
export function buildTown(scene, C, ground, {skip = []} = {}) {
  const old = C.roads.filter(r => r.name && OLD_STREETS.test(r.name));
  const clock = C.pois.find(p => /Clock Tower/i.test(p.name)) || {x: 160, z: -140};
  const buckets = new Map();
  for (const b of C.buildings) {
    if (b.outline.length < 3) continue;
    const c = centroid(b.outline);
    if (skip.some(([x, z, r]) => Math.hypot(c[0] - x, c[1] - z) < r)) continue;
    const nearOld = old.some(r => distToLine(c, r.line) < 28);
    const dist = Math.hypot(c[0] - clock.x, c[1] - clock.z);
    let from = nearOld ? 1250 + Math.round(rnd() * 300) : Math.round(1840 + (dist / 1100) * 110 + rnd() * 40);
    if (!nearOld && dist < 260) from = Math.round(1700 + rnd() * 160);
    from = Math.min(from, 2005);
    const key = from < 1600 ? Math.floor(from / 50) * 50 : Math.floor(from / 10) * 10;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({b, c, from});
  }
  const mat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.9});
  const groups = [];
  for (const [year, list] of [...buckets].sort((a, b) => a[0] - b[0])) {
    const geos = [];
    for (const {b, c} of list) {
      const sh = new THREE.Shape(b.outline.map(([x, z]) => new THREE.Vector2(x, -z)));
      const gy = Math.min(...b.outline.map(([x, z]) => ground(x, z))) - 0.6;
      const h = (b.height || 7) + 0.6 + (ground(...c) - gy);
      const g = new THREE.ExtrudeGeometry(sh, {depth: h, bevelEnabled: false}).rotateX(-Math.PI / 2).translate(0, gy, 0);
      const wall = new THREE.Color(WALLS[(rnd() * WALLS.length) | 0]), roof = new THREE.Color(ROOFS[(rnd() * ROOFS.length) | 0]);
      const n = g.attributes.normal, cols = new Float32Array(n.count * 3);
      for (let i = 0; i < n.count; i++) { const cc = n.getY(i) > 0.5 ? roof : wall; cols.set([cc.r, cc.g, cc.b], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geos.push(g.index ? g.toNonIndexed() : g);
    }
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    groups.push({from: year, mesh: m});
  }
  return {groups, setYear(y) { for (const g of groups) g.mesh.visible = y >= g.from; }};
}

// ---------- Verulamium: houses, forum, theatre, wall (standing, then ruins) ----------
export function buildRoman(scene, C, ground, R) {
  const stone = new THREE.MeshStandardMaterial({color: 0xd8ccb2, roughness: 0.95});
  const tile = new THREE.MeshStandardMaterial({color: 0xb0583a, roughness: 0.9});
  const flintw = new THREE.MeshStandardMaterial({color: 0x8c877c, roughness: 1});
  const city = new THREE.Group(), ruins = new THREE.Group();
  scene.add(city, ruins);
  const houses = [], roofs = [], footings = [];
  for (const b of R.blocks) {
    const y = ground(b.x, b.z);
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).rotateY(-b.a).translate(b.x, y + b.h / 2 - 0.3, b.z);
    houses.push(g);
    const r = new THREE.ConeGeometry(Math.hypot(b.w, b.d) / 2 * 1.02, 2.4, 4, 1).rotateY(Math.PI / 4).scale(b.w / Math.hypot(b.w, b.d) * Math.SQRT2, 1, b.d / Math.hypot(b.w, b.d) * Math.SQRT2)
      .rotateY(-b.a).translate(b.x, y + b.h + 0.9, b.z);
    roofs.push(r);
    footings.push(new THREE.BoxGeometry(b.w, 0.7, b.d).rotateY(-b.a).translate(b.x, y + 0.2, b.z));
  }
  // forum and basilica at the centre of the grid
  const [fx, fz] = R.centre, fy = ground(fx, fz);
  houses.push(new THREE.BoxGeometry(110, 11, 30).rotateY(-R.angle).translate(fx, fy + 5.2, fz));
  roofs.push(new THREE.BoxGeometry(112, 1.2, 32).rotateY(-R.angle).translate(fx, fy + 11.2, fz));
  const m1 = new THREE.Mesh(mergeGeometries(houses), stone), m2 = new THREE.Mesh(mergeGeometries(roofs), tile);
  m1.castShadow = m2.castShadow = true; m1.receiveShadow = true;
  city.add(m1, m2);
  ruins.add(new THREE.Mesh(mergeGeometries(footings), flintw));
  // theatre: a stepped half-ring
  const th = C.pois.find(p => /Roman Theatre/i.test(p.name));
  let theatre = null;
  if (th) {
    theatre = new THREE.Group();
    const ty = ground(th.x, th.z);
    for (let k = 0; k < 6; k++) {
      const ring = new THREE.RingGeometry(14 + k * 4, 18 + k * 4, 40, 1, 0, Math.PI * 1.25).rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape().absarc(0, 0, 18 + k * 4, 0, Math.PI * 1.25).lineTo(0, 0), {depth: 0.9 * (k + 1), bevelEnabled: false}).rotateX(-Math.PI / 2).translate(th.x, ty - 0.2, th.z), stone);
      mesh.castShadow = true; theatre.add(mesh); ring.dispose();
    }
    scene.add(theatre);
  }
  // the wall circuit: full height in the Roman city, broken ruins afterwards
  const wallGeo = (h, src) => mergeGeometries(src.walls.flatMap(w => w.line.slice(1).map((p, i) => {
    const a = w.line[i], dx = p[0] - a[0], dz = p[1] - a[1], L = Math.hypot(dx, dz);
    const y = ground((a[0] + p[0]) / 2, (a[1] + p[1]) / 2);
    return new THREE.BoxGeometry(L + 0.3, h, 2.6).rotateY(-Math.atan2(dz, dx)).translate((a[0] + p[0]) / 2, y + h / 2 - 0.4, (a[1] + p[1]) / 2);
  })));
  const circuit = {walls: [{line: R.hull.concat([R.hull[0]])}]};
  const wallFull = new THREE.Mesh(wallGeo(6.5, circuit), flintw), wallRuin = new THREE.Mesh(wallGeo(2.2, C), flintw);
  wallFull.castShadow = wallRuin.castShadow = true;
  scene.add(wallFull, wallRuin);
  return {setYear(y) {
    city.visible = y < 450;
    ruins.visible = y >= 450 && y < 1100;
    wallFull.visible = y < 450;
    wallRuin.visible = y >= 450;
    if (theatre) { theatre.visible = y < 450 || y > 1847; theatre.scale.y = y < 450 ? 1 : 0.35; }
  }};
}

// ---------- trees in parks, woods and the abbey orchard ----------
export function buildTrees(scene, C, ground, avoid) {
  const pts = [];
  for (const g of C.green) {
    if (!/park|wood|forest|garden|grass|meadow|recreation|cemetery|orchard/.test(g.kind)) continue;
    const o = g.outline, xs = o.map(p => p[0]), zs = o.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const area = (x1 - x0) * (z1 - z0), dense = /wood|forest/.test(g.kind) ? 1 / 90 : 1 / 650;
    for (let i = 0; i < Math.min(500, area * dense); i++) {
      const q = [x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0)];
      if (inside(o, q) && !avoid(q) && !C.water.some(w => inside(w.outline, q))) pts.push(q);
    }
  }
  const crown = new THREE.IcosahedronGeometry(1, 1), trunk = new THREE.CylinderGeometry(0.18, 0.28, 1, 5).translate(0, 0.5, 0);
  const cm = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({color: 0x5f7a45, roughness: 1, flatShading: true}), pts.length);
  const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({color: 0x4f3d2c}), pts.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  pts.forEach(([x, z], i) => {
    const sz = 3 + rnd() * 3.5, y = ground(x, z);
    m.makeScale(sz, sz * (1 + rnd() * 0.4), sz).setPosition(x, y + sz * 1.6 + 1.5, z); cm.setMatrixAt(i, m);
    cm.setColorAt(i, c.setHSL(0.24 + rnd() * 0.06, 0.28 + rnd() * 0.15, 0.3 + rnd() * 0.1));
    m.makeScale(1.4, sz + 2, 1.4).setPosition(x, y, z); tm.setMatrixAt(i, m);
  });
  cm.castShadow = true; cm.receiveShadow = true; tm.castShadow = true;
  scene.add(cm, tm);
  return {count: pts.length};
}

// ---------- path sets for people and traffic ----------
export function pathSets(C, R) {
  const near = (line, r) => line.some(([x, z]) => Math.hypot(x - 84, z) < r);
  return {
    roman: R.streets,
    old: C.roads.filter(r => r.name && OLD_STREETS.test(r.name)).map(r => r.line).concat(C.paths.filter(p => near(p.line, 260)).map(p => p.line)),
    abbey: [[[-6, 16], [84, 16], [84, 62], [-6, 62], [-6, 16]], [[-30, -40], [175, -40], [175, 40], [-30, 40], [-30, -40]], [[60, 16], [60, 62]]],
    roads: C.roads.filter(r => CAR_ROADS.test(r.kind)).map(r => r.line),
    foot: C.paths.map(p => p.line).concat(C.roads.filter(r => /residential|pedestrian|living_street|footway/.test(r.kind)).map(r => r.line)),
  };
}
