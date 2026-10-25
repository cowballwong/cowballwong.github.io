// Procedural material textures drawn on canvas: flint, Roman brick, limestone, lead and clay tile.
// Every texture tile covers TILE metres; geometry gets world-space box UVs (boxUV) so the scale is constant.
import * as THREE from 'three';

export const TILE = 2.4;
const N = 512;
let s = 11;
const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);

function canvas(fill) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = fill; g.fillRect(0, 0, N, N);
  return [c, g];
}
function tex(c, aniso) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
const shade = (base, j) => base.map(v => Math.max(0, Math.min(255, Math.round(v + j))));
const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;

// Knapped flint nodules set in pale lime mortar.
function flint() {
  const [c, g] = canvas('#b9b1a2');
  for (let i = 0; i < 900; i++) {
    const x = r() * N, y = r() * N, w = 7 + r() * 16, h = 6 + r() * 11;
    const dark = r() < 0.7;
    const base = dark ? [58 + r() * 30, 58 + r() * 28, 60 + r() * 28] : [150 + r() * 40, 142 + r() * 36, 128 + r() * 30];
    for (const [dx, dy] of [[0, 0], [-N, 0], [N, 0], [0, -N], [0, N]]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, w / 2, h / 2, r() * Math.PI, 0, Math.PI * 2);
      g.fillStyle = rgb(base); g.fill();
      g.strokeStyle = 'rgba(240,232,215,.45)'; g.lineWidth = 1.2; g.stroke();
    }
  }
  return c;
}
// Thin Roman bricks and tiles reused from Verulamium: long, shallow, uneven orange-red courses.
function brick() {
  const [c, g] = canvas('#cdb89c');
  const rows = 34, rh = N / rows;
  for (let y = 0; y < rows; y++) {
    let x = -r() * 60;
    while (x < N) {
      const w = 40 + r() * 70;
      g.fillStyle = rgb(shade([168, 84, 52], (r() - 0.5) * 50));
      g.fillRect(x + 1.5, y * rh + 1.6, w - 3, rh - 3.2);
      x += w;
    }
  }
  return c;
}
// Ashlar limestone (Barnack / Totternhoe and Victorian dressings).
function stone() {
  const [c, g] = canvas('#cfc3a8');
  const rows = 8, rh = N / rows;
  for (let y = 0; y < rows; y++) {
    let x = y % 2 ? -rh : 0;
    while (x < N) {
      const w = rh * (1.6 + r() * 0.9);
      g.fillStyle = rgb(shade([214, 202, 176], (r() - 0.5) * 22));
      g.fillRect(x + 1, y * rh + 1, w - 2, rh - 2);
      x += w;
    }
  }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(90,80,60,${r() * 0.08})`; g.fillRect(r() * N, r() * N, 2, 2); }
  return c;
}
// Lead roof: sheets with standing seams (seams run down the slope, i.e. along the texture's v).
function lead() {
  const [c, g] = canvas('#80868c');
  const cols = 8, cw = N / cols;
  for (let i = 0; i < cols; i++) {
    g.fillStyle = rgb(shade([128, 134, 140], (r() - 0.5) * 16)); g.fillRect(i * cw, 0, cw, N);
    g.fillStyle = 'rgba(230,235,240,.55)'; g.fillRect(i * cw, 0, 2, N);
    g.fillStyle = 'rgba(40,44,48,.35)'; g.fillRect(i * cw + 2, 0, 2, N);
  }
  return c;
}
function tile() {
  const [c, g] = canvas('#7a3b28');
  const rows = 24, rh = N / rows, cw = N / 16;
  for (let y = 0; y < rows; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = rgb(shade([140, 66, 44], (r() - 0.5) * 40));
    g.fillRect(x * cw + (y % 2) * cw / 2, y * rh, cw - 1, rh - 2);
  }
  return c;
}
// Red brick (1982 chapter house: replica Roman brick; Victorian town buildings).
function redbrick() {
  const [c, g] = canvas('#c9bba5');
  const rows = 32, rh = N / rows, bw = N / 8;
  for (let y = 0; y < rows; y++) for (let x = -1; x < 9; x++) {
    g.fillStyle = rgb(shade([150, 74, 50], (r() - 0.5) * 40));
    g.fillRect(x * bw + (y % 2) * bw / 2 + 1, y * rh + 1, bw - 2, rh - 2);
  }
  return c;
}

export function makeMaterials(renderer) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({map: tex(c, aniso), roughness: 0.92, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...extra});
  return {
    flint: mat(flint()),
    brick: mat(brick()),
    stone: mat(stone()),
    lead: mat(lead(), {roughness: 0.6, metalness: 0.15}),
    tile: mat(tile()),
    redbrick: mat(redbrick()),
    glass: new THREE.MeshStandardMaterial({color: 0x2c3540, roughness: 0.25, metalness: 0.3}),
    timber: new THREE.MeshStandardMaterial({color: 0x6b4b33, roughness: 0.8}),
    marble: new THREE.MeshStandardMaterial({color: 0x6f6658, roughness: 0.4}),
    plain: new THREE.MeshStandardMaterial({color: 0xd8cfbf, roughness: 0.95}),
  };
}

// World-space box projection: each triangle takes the two axes perpendicular to its dominant normal.
export function boxUV(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(b.clone().sub(a)).normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      let u, w;
      if (ay >= ax && ay >= az) { u = v.x; w = v.z; }
      else if (ax >= az) { u = v.z; w = v.y; }
      else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u / TILE; uv[(i + k) * 2 + 1] = w / TILE;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
