// People and traffic that change with the year: Roman citizens and ox carts, monks and pilgrims,
// coaches on Holywell Hill, Victorian carriages, then cars and buses. Instanced, so hundreds stay cheap.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const col = h => new THREE.Color(h);
const PAL = {
  roman: ['#e8e0cc', '#b5482f', '#d8c9a0', '#8a5a3b', '#f2ede2', '#6d7d4f'],
  saxon: ['#7b6a4d', '#5d6b48', '#8c7b5c', '#6e4f3a'],
  monk: ['#1e1c1b', '#26231f', '#2d2a26'],
  pilgrim: ['#7a6c5a', '#5f574a', '#8e7f66', '#6b4e36', '#a0927a'],
  medieval: ['#7d3a2d', '#405a6e', '#6b6b3a', '#8b6d4a', '#5a4a6b', '#a68a5b'],
  tudor: ['#3e3a5a', '#6b2f2f', '#34503f', '#7a6648', '#2e2e2e', '#8c7a5c'],
  victorian: ['#262626', '#3a3530', '#2f3640', '#5a4636', '#4a2f2f', '#6b6458'],
  modern: ['#2f6fb0', '#c7463a', '#e7c64a', '#3a8a5c', '#efefef', '#262626', '#8a4fb0', '#e48a3a', '#5aa0c8'],
  car: ['#c9cdd2', '#262829', '#9d1f22', '#1f3f73', '#e7e7e7', '#5b6168', '#2f5b3a', '#c7a03a'],
};
const pick = a => a[(Math.random() * a.length) | 0];

// ---------- geometries (metres; +x is forward) ----------
function person() {
  const body = new THREE.CylinderGeometry(0.2, 0.3, 1.15, 6).translate(0, 0.62, 0);
  const head = new THREE.SphereGeometry(0.14, 6, 4).translate(0, 1.37, 0);
  return mergeGeometries([body, head]);
}
function animal(len = 2.2, h = 1.3) {
  return mergeGeometries([
    new THREE.BoxGeometry(len, 0.75, 0.65).translate(0, h - 0.35, 0),
    new THREE.BoxGeometry(0.6, 0.55, 0.4).translate(len / 2 + 0.15, h + 0.05, 0),
    ...[[-0.8, -0.22], [-0.8, 0.22], [0.8, -0.22], [0.8, 0.22]].map(([x, z]) => new THREE.BoxGeometry(0.16, h - 0.7, 0.16).translate(x * len / 2.2, (h - 0.7) / 2, z)),
  ]);
}
function wheels(xs, r, w) {
  return xs.flatMap(x => [-w, w].map(z => new THREE.CylinderGeometry(r, r, 0.12, 10).rotateX(Math.PI / 2).translate(x, r, z)));
}
function cart() { // ox or horse pulling a two-wheeled cart
  return mergeGeometries([animal().translate(1.9, 0, 0), new THREE.BoxGeometry(2.4, 0.7, 1.5).translate(-0.6, 1.1, 0), ...wheels([-0.6], 0.6, 0.8)]);
}
function carriage() {
  return mergeGeometries([animal(2.0, 1.5).translate(2.4, 0, -0.45), animal(2.0, 1.5).translate(2.4, 0, 0.45),
    new THREE.BoxGeometry(2.6, 1.5, 1.6).translate(-0.5, 1.6, 0), new THREE.BoxGeometry(1.0, 0.2, 1.4).translate(0.9, 1.4, 0),
    ...wheels([-1.4, 0.4], 0.62, 0.85)]);
}
function car() {
  return mergeGeometries([new THREE.BoxGeometry(4.3, 0.75, 1.8).translate(0, 0.65, 0), new THREE.BoxGeometry(2.3, 0.6, 1.62).translate(-0.25, 1.32, 0),
    ...wheels([-1.4, 1.4], 0.34, 0.86)]);
}
function bus() { // double-decker
  return mergeGeometries([new THREE.BoxGeometry(10.8, 4.1, 2.5).translate(0, 2.4, 0), ...wheels([-3.6, 3.4], 0.5, 1.2)]);
}

// ---------- path following ----------
class Path {
  constructor(pts) {
    this.p = pts.map(([x, z]) => new THREE.Vector2(x, z));
    this.cum = [0];
    for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + this.p[i].distanceTo(this.p[i - 1]));
    this.len = this.cum.at(-1);
  }
  at(s, out) {
    s = ((s % this.len) + this.len) % this.len;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const a = this.p[i - 1], b = this.p[i], t = (s - this.cum[i - 1]) / Math.max(1e-6, this.cum[i] - this.cum[i - 1]);
    out.x = a.x + (b.x - a.x) * t; out.z = a.y + (b.y - a.y) * t; out.h = Math.atan2(-(b.y - a.y), b.x - a.x);
    return out;
  }
}

// kind -> geometry, which path set it uses, its speed (m/s), its side offset, how many at most.
const KINDS = {
  person: {geo: person, max: 420, speed: [1.0, 1.5], side: 3.2},
  cart: {geo: cart, max: 40, speed: [0.9, 1.4], side: 2.0},
  carriage: {geo: carriage, max: 40, speed: [2.5, 4], side: 2.0},
  car: {geo: car, max: 140, speed: [6, 11], side: 2.2},
  bus: {geo: bus, max: 14, speed: [5, 8], side: 2.4},
};

// How many of each kind, and their palettes and paths, in a given year.
function mix(y) {
  if (y < 410) return [['person', 170, PAL.roman, 'roman'], ['cart', 14, ['#8a6a48', '#6d5238'], 'roman']];
  if (y < 1077) return [['person', 40, PAL.saxon, 'old'], ['cart', 4, ['#6d5238'], 'old']];
  if (y < 1539) return [['person', 55, PAL.monk, 'abbey'], ['person', 80, PAL.pilgrim, 'old'], ['person', 70, PAL.medieval, 'old'], ['cart', 14, ['#7a5a3a', '#5d4630'], 'old']];
  if (y < 1830) return [['person', 150, PAL.tudor, 'old'], ['cart', 12, ['#7a5a3a'], 'old'], ['carriage', 14, ['#2f2a26', '#4b2a22', '#1f2f3f'], 'old']];
  if (y < 1910) return [['person', 190, PAL.victorian, 'foot'], ['carriage', 26, ['#1e1e1e', '#3b2a22', '#1f2a3a'], 'roads'], ['cart', 10, ['#6d5238'], 'roads']];
  if (y < 1955) return [['person', 220, PAL.victorian.concat(PAL.modern.slice(0, 3)), 'foot'], ['car', 30, ['#1e1e1e', '#2b3a2b', '#3a2b2b', '#5b5b5b'], 'roads'], ['bus', 4, ['#a8261d'], 'roads'], ['cart', 3, ['#6d5238'], 'roads']];
  return [['person', 300, PAL.modern, 'foot'], ['car', 110, PAL.car, 'roads'], ['bus', 10, ['#b8261d', '#2a8a8f', '#e8e8e8'], 'roads']];
}

export function initLife(scene, pathSets) {
  const sets = {};
  for (const [k, list] of Object.entries(pathSets)) sets[k] = list.filter(l => l.length > 1).map(l => new Path(l)).filter(p => p.len > 15);
  const mat = new THREE.MeshStandardMaterial({roughness: 0.8});
  const mesh = {}, agents = {};
  for (const [k, def] of Object.entries(KINDS)) {
    const m = new THREE.InstancedMesh(def.geo(), mat, def.max);
    m.castShadow = true; m.count = 0; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
    mesh[k] = m; agents[k] = [];
  }
  let eraKey = '';
  const group = {visible: true};
  function populate(y) {
    const plan = mix(y), key = plan.map(p => p.join()).join('|');
    if (key === eraKey) return;
    eraKey = key;
    for (const k in agents) agents[k] = [];
    for (const [kind, n, pal, setName] of plan) {
      const paths = sets[setName]?.length ? sets[setName] : sets.old || [];
      if (!paths.length) continue;
      const def = KINDS[kind];
      for (let i = 0; i < n && agents[kind].length < def.max; i++) {
        const path = paths[(Math.random() * paths.length) | 0];
        agents[kind].push({path, s: Math.random() * path.len, v: (def.speed[0] + Math.random() * (def.speed[1] - def.speed[0])) * (Math.random() < 0.5 ? -1 : 1),
          off: (Math.random() < 0.5 ? -1 : 1) * def.side * (kind === 'person' ? 0.6 + Math.random() * 0.6 : 1), c: col(pick(pal))});
      }
    }
    for (const k in mesh) {
      mesh[k].count = agents[k].length;
      agents[k].forEach((a, i) => mesh[k].setColorAt(i, a.c));
      if (mesh[k].instanceColor) mesh[k].instanceColor.needsUpdate = true;
    }
  }
  const o = {}, q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  function update(dt, y, ground = () => 0) {
    populate(y);
    for (const k in mesh) {
      const m = mesh[k];
      m.visible = group.visible;
      if (!group.visible) continue;
      agents[k].forEach((a, i) => {
        a.s += a.v * dt;
        a.path.at(a.s, o);
        const h = o.h + (a.v < 0 ? Math.PI : 0);
        // keep to the side of the road: offset perpendicular to the direction of travel
        const px = o.x + Math.sin(h) * a.off * 0.5, pz = o.z + Math.cos(h) * a.off * 0.5;
        pos.set(px, ground(px, pz), pz);
        q.setFromAxisAngle(up, h);
        m.setMatrixAt(i, m4.compose(pos, q, one));
      });
      m.instanceMatrix.needsUpdate = true;
    }
  }
  return {update, group, populate};
}
