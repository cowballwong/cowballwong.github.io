// Renderer, light, camera, the part registry (for the timeline) and the modelling helpers.
// Local frame: metres, origin = centre of the west front at ground level, +x east along the axis, +z south, y up.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {makeMaterials, boxUV} from './textures.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export {THREE};
export const canvas = document.getElementById('view');
export const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;

export const scene = new THREE.Scene();
{
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#9fb3c4'); gr.addColorStop(0.55, '#d9dcd6'); gr.addColorStop(1, '#e9e3d6');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog(0xe2ded4, 1100, 3200);
export const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 4000);
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 4;
controls.maxDistance = 1400;

scene.add(new THREE.HemisphereLight(0xe8eef5, 0x8a7d66, 1.35));
export const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(-160, 230, 260);
sun.target.position.set(80, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, {left: -260, right: 260, top: 200, bottom: -200, near: 10, far: 900});
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.4;
scene.add(sun, sun.target);

export const M = makeMaterials(renderer);
export const INK = new THREE.LineBasicMaterial({color: 0x3d342b, transparent: true, opacity: 0.9});
export const section = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.4);
for (const m of [...Object.values(M), INK]) m.clippingPlanes = [];

// ---------- parts: everything is built into a named part with a date range for the timeline ----------
export const root = new THREE.Group();
scene.add(root);
export const parts = {};
export const lines = [];
let cur = null;
export function part(id, from, to = 9999, meta = {}) {
  if (!parts[id]) {
    const group = new THREE.Group();
    group.name = id;
    root.add(group);
    parts[id] = {id, from, to, group, ...meta};
  }
  cur = parts[id];
  return cur;
}
export const current = () => cur.group;

// Add a mesh to the current part, with box UVs, shadows and a sketch outline for the opening animation.
export function add(geo, mat = M.stone, {edges = true, shadow = true, threshold = 25, parent} = {}) {
  const g = mat.map ? boxUV(geo) : geo;
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  (parent || cur.group).add(mesh);
  if (edges) {
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(g, threshold), INK);
    l.userData.count = l.geometry.attributes.position.count;
    (parent || cur.group).add(l);
    lines.push(l);
  }
  return mesh;
}
export function box(x0, x1, y0, y1, z0, z1, mat = M.stone, o) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return add(g, mat, o);
}
// Gabled roof over [x0,x1]x[z0,z1]; ridge along x (alongX) or along z. Optional hip (0 = gable).
export function roof(x0, x1, z0, z1, yE, yR, alongX = true, mat = M.lead, overhang = 0.4) {
  const half = (alongX ? z1 - z0 : x1 - x0) / 2 + overhang;
  const s = new THREE.Shape();
  s.moveTo(-half, 0); s.lineTo(half, 0); s.lineTo(0, yR - yE); s.closePath();
  const len = alongX ? x1 - x0 : z1 - z0;
  const g = new THREE.ExtrudeGeometry(s, {depth: len, bevelEnabled: false});
  if (alongX) { g.rotateY(Math.PI / 2); g.translate(x0, yE, (z0 + z1) / 2); }
  else g.translate((x0 + x1) / 2, yE, z0);
  return add(g, mat);
}
// Lean-to (aisle) roof between the arcade wall zIn and the outer wall zOut.
export function leanTo(x0, x1, zIn, zOut, yHi, yLo, mat = M.lead) {
  const s = new THREE.Shape(), o = Math.sign(zOut - zIn) * 0.4;
  s.moveTo(zIn, yHi); s.lineTo(zOut + o, yLo - 0.15); s.lineTo(zOut + o, yLo - 0.45); s.lineTo(zIn, yHi - 0.3); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {depth: x1 - x0, bevelEnabled: false});
  g.rotateY(-Math.PI / 2); g.translate(x1, 0, 0);
  return add(g, mat);
}
// Pyramid / spirelet.
export function pyramid(cx, cz, w, y0, h, mat = M.lead, sides = 4) {
  const g = new THREE.ConeGeometry(w / Math.SQRT2, h, sides, 1);
  g.rotateY(Math.PI / 4); g.translate(cx, y0 + h / 2, cz);
  return add(g, mat);
}
export function cyl(cx, cz, rad, y0, y1, mat = M.stone, seg = 8) {
  const g = new THREE.CylinderGeometry(rad, rad, y1 - y0, seg);
  g.translate(cx, (y0 + y1) / 2, cz);
  return add(g, mat);
}

// Arched opening outline (round or equilateral pointed) as a Shape in the wall plane.
function archShape(w, h, head) {
  const r = w / 2, sh = new THREE.Shape();
  if (head === 'round') {
    sh.moveTo(-r, 0); sh.lineTo(-r, h - r); sh.absarc(0, h - r, r, Math.PI, 0, true); sh.lineTo(r, 0);
  } else if (head === 'flat') {
    sh.moveTo(-r, 0); sh.lineTo(-r, h); sh.lineTo(r, h); sh.lineTo(r, 0);
  } else {
    const ys = h - w * Math.sin(Math.PI / 3);
    sh.moveTo(-r, 0); sh.lineTo(-r, ys);
    sh.absarc(r, ys, w, Math.PI, Math.PI * 2 / 3, true);
    sh.absarc(-r, ys, w, Math.PI / 3, 0, true);
    sh.lineTo(r, 0);
  }
  sh.closePath();
  return sh;
}
// A window: dark glass panel set back into a stone surround, with optional mullions.
// face 'z' = wall at constant z (window faces ±z, u runs along x); face 'x' = wall at constant x (u along z).
// out = +1/-1: which way the wall faces.
export function windowAt(face, plane, out, u, y0, w, h, head = 'pointed', lights = 1, o = {}) {
  const g = cur.group, frame = 0.28;
  const outer = archShape(w + frame * 2, h + frame, head);
  outer.holes.push(archShape(w, h, head));
  const surround = new THREE.ExtrudeGeometry(outer, {depth: 0.25, bevelEnabled: false});
  const glass = new THREE.ShapeGeometry(archShape(w, h, head));
  const place = (geo, off) => {
    if (face === 'z') { if (out < 0) geo.rotateY(Math.PI); geo.translate(u, y0, plane + out * off); }
    else { geo.rotateY(out > 0 ? Math.PI / 2 : -Math.PI / 2); geo.translate(plane + out * off, y0, u); }
    return geo;
  };
  add(place(surround.translate(0, -frame / 2, -0.12), 0.02), o.mat || M.stone, {shadow: false, threshold: 40});
  add(place(glass, -0.18), M.glass, {edges: false, shadow: false});
  for (let k = 1; k < lights; k++) {
    const mu = -w / 2 + (w * k) / lights;
    const m = new THREE.BoxGeometry(0.14, h * 0.78, 0.14).translate(mu, h * 0.39, 0);
    add(place(m, -0.08), M.stone, {edges: false, shadow: false});
  }
}
export function windowsAlong(face, plane, out, from, to, n, y0, w, h, head, lights = 1, o) {
  const step = (to - from) / n;
  for (let i = 0; i < n; i++) windowAt(face, plane, out, from + step * (i + 0.5), y0, w, h, head, lights, o);
}
// Buttress: a stepped pier against a wall. side = +1 (south) / -1 (north) when on a 'z' wall; for 'x' walls side = ±1 east/west.
export function buttress(face, plane, out, u, h, depth = 1.4, width = 1.2, mat = M.stone, pinnacle = 0) {
  const steps = [[0, h * 0.55, depth], [h * 0.55, h, depth * 0.6]];
  for (const [y0, y1, d] of steps) {
    if (face === 'z') box(u - width / 2, u + width / 2, y0, y1, plane, plane + out * d, mat);
    else box(plane, plane + out * d, y0, y1, u - width / 2, u + width / 2, mat);
  }
  if (pinnacle) {
    const cx = face === 'z' ? u : plane + out * depth * 0.3, cz = face === 'z' ? plane + out * depth * 0.3 : u;
    box(cx - width * 0.35, cx + width * 0.35, h, h + pinnacle * 0.35, cz - width * 0.35, cz + width * 0.35, mat);
    pyramid(cx, cz, width * 0.7, h + pinnacle * 0.35, pinnacle * 0.65, mat);
  }
}
// Parapet with a coping along a wall top (x-run or z-run).
export function parapet(x0, x1, z0, z1, y, h = 1, mat = M.stone) {
  box(x0, x1, y, y + h, z0, z1, mat, {threshold: 30});
}

// Batch many small detail pieces (mouldings, shafts, tracery) into ONE mesh per material in the current part.
// Use for anything numerous: thousands of separate meshes would kill the frame rate on phones.
//   const b = batch(); b.add(geo, M.stone); ...; b.done();
export function batch() {
  const bins = new Map();
  return {
    add(geo, mat = M.stone) {
      let g = geo.index ? geo.toNonIndexed() : geo;
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      if (!bins.has(mat)) bins.set(mat, []);
      bins.get(mat).push(g);
    },
    done({edges = true, threshold = 30, shadow = true} = {}) {
      for (const [mat, list] of bins) {
        if (!list.length) continue;
        const merged = mergeGeometries(list);
        add(merged, mat, {edges, threshold, shadow});
      }
      bins.clear();
    },
  };
}
