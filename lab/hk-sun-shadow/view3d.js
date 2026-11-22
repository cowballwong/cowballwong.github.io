// HK Sun Shadow: 3D view (three.js 0.170.0, loaded on demand). x = east, y = up (m above the block's ground), z = south.
// Shadows by the renderer's shadow map from the NOAA sun direction; the "new shade from your block" cells from the
// app's own 2 m analysis are draped on the ground in the accent colour, so plan and 3D say the same thing.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createView(el) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const sky = new THREE.Color('#dfe8f1'), night = new THREE.Color('#1c2333');
  scene.background = sky.clone();
  const camera = new THREE.PerspectiveCamera(38, 1, 2, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49;
  const hemi = new THREE.HemisphereLight('#f4f1ea', '#8a8170', 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4dc', 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target);
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffc400' }));
  scene.add(sunBall);

  let site = null, ref = 0, terrain = null, city = null, block = null, clearedKey = '', groundTex = null, texCanvas = null, texCtx = null;
  let running = false, raf = 0, half = 400;
  const matCity = new THREE.MeshLambertMaterial({ color: '#e9e4da' });
  const matBlock = new THREE.MeshLambertMaterial({ color: '#d4561c' });

  function disposeMesh(m) { if (!m) return; scene.remove(m); m.geometry.dispose(); }
  function extrude(ring, base, top) {
    const sh = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.5, top - base), bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.translate(0, base - ref, 0);
    return g;
  }
  function buildTerrain() {
    disposeMesh(terrain);
    const SIDE = Math.sqrt(site.terr.length) * 2, n = 161, step = SIDE / (n - 1); half = SIDE / 2;
    const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -half + i * step, y = -half + j * step, k = j * n + i;
      const z = site.dem.h(site.E0 + x, site.N0 + y) - ref;
      pos[k * 3] = x; pos[k * 3 + 1] = z - 0.15; pos[k * 3 + 2] = -y;
      uv[k * 2] = i / (n - 1); uv[k * 2 + 1] = j / (n - 1);
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, b, c, b, d, c); }   // anticlockwise seen from above
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    texCanvas = document.createElement('canvas'); texCanvas.width = texCanvas.height = 512; texCtx = texCanvas.getContext('2d');
    groundTex = new THREE.CanvasTexture(texCanvas); groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.flipY = false;
    groundTex.magFilter = THREE.NearestFilter;
    terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: groundTex }));
    terrain.receiveShadow = true; scene.add(terrain);
  }
  function buildCity() {
    disposeMesh(city);
    const gs = [];
    for (const b of site.blds) { if (site.cleared.has(b.id)) continue; try { gs.push(extrude(b.ring, b.base, b.top)); } catch (e) { /* bad ring */ } }
    if (!gs.length) { city = null; return; }
    const g = mergeGeometries(gs, false); gs.forEach((x) => x.dispose());
    city = new THREE.Mesh(g, matCity); city.castShadow = true; city.receiveShadow = true; scene.add(city);
    clearedKey = [...site.cleared].sort().join(',');
  }
  function buildBlock(S) {
    disposeMesh(block);
    const b = S.block; if (!b.ring) return;
    block = new THREE.Mesh(extrude(b.ring, b.base, b.top), matBlock); block.castShadow = true; block.receiveShadow = true; scene.add(block);
    block.userData.key = JSON.stringify([b.ring, b.base, b.top]);
  }
  function paintGround(S) {
    if (!texCtx) return;
    const c = texCtx, W = texCanvas.width, SIDE = half * 2;
    c.fillStyle = '#f3efe6'; c.fillRect(0, 0, W, W);
    const px = W / SIDE, NF = S.site ? Math.round(400 / 2) : 0, f0 = (SIDE - 400) / 2;
    c.strokeStyle = 'rgba(29,26,22,.35)'; c.lineWidth = 2; c.setLineDash([8, 6]); c.strokeRect(f0 * px, f0 * px, 400 * px, 400 * px); c.setLineDash([]);
    let flags = null, mode = 'now', H = null;
    if (S.layer === 'hours' && S.day) { mode = 'hours'; H = S.hk === 'new' ? S.day.hNew : S.day.hAll; }
    else if (S.now) flags = S.now.flags;
    for (let j = 0; j < NF; j++) for (let i = 0; i < NF; i++) {
      const q = j * NF + i;
      if (mode === 'now') { if (!flags || flags[q] !== 2) continue; c.fillStyle = 'rgba(194,65,12,.62)'; }
      else { const h = H[q]; if (h < 0.5) continue; const t = Math.min(1, h / 6); c.fillStyle = S.hk === 'new' ? `rgba(${Math.round(250 - 110 * t)},${Math.round(170 - 140 * t)},${Math.round(110 - 100 * t)},.85)` : `rgba(60,70,95,${0.15 + 0.6 * t})`; }
      // texture v runs with +y (north) because uv.y = j / (n - 1) from the south edge and flipY = false
      c.fillRect((f0 + i * 2) * px, (f0 + j * 2) * px, 2 * px + 0.6, 2 * px + 0.6);
    }
    groundTex.needsUpdate = true;
  }
  function placeSun(S) {
    const s = S.now && S.now.sun;
    if (!s || s.elev <= 0.2) { sun.intensity = 0; hemi.intensity = 0.35; scene.background.copy(night); sunBall.visible = false; return; }
    const a = s.azG * Math.PI / 180, e = s.elev * Math.PI / 180;
    const d = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
    const tgt = new THREE.Vector3(S.block.x, 0, -S.block.y);
    sun.target.position.copy(tgt); sun.position.copy(tgt).addScaledVector(d, 1600);
    const cam = sun.shadow.camera, r = half * 1.05;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 10; cam.far = 4000; cam.updateProjectionMatrix();
    const k = Math.min(1, s.elev / 12);
    sun.intensity = 0.6 + 2.2 * k; hemi.intensity = 0.7 + 0.55 * k;
    scene.background.copy(night).lerp(sky, Math.min(1, 0.35 + s.elev / 20));
    sunBall.visible = true; sunBall.position.copy(tgt).addScaledVector(d, 520);
  }
  function render() { controls.update(); renderer.render(scene, camera); }
  function loop() { if (!running) return; render(); raf = requestAnimationFrame(loop); }

  return {
    renderer, camera, controls, scene,
    setSite(s, S) {
      if (site === s) return;
      site = s; ref = S.block.base || s.gmin;
      buildTerrain(); buildCity(); buildBlock(S);
      const b = S.block;
      camera.position.set(b.x - 250, 300, -b.y + 330);   // from the south-west: winter shadows fall north, away from the camera controls.target.set(b.x, 20, -b.y); controls.update();
    },
    update(S) {
      if (!site) return;
      const key = [...site.cleared].sort().join(',');
      if (key !== clearedKey) buildCity();
      const b = S.block, bk = JSON.stringify([b.ring, b.base, b.top]);
      if (!block || block.userData.key !== bk) buildBlock(S);
      placeSun(S); paintGround(S);
      if (!running) render();
    },
    resize() { const r = el.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); render(); },
    active(on) { running = on; cancelAnimationFrame(raf); if (on) loop(); },
    setCamera(pos, tgt) { camera.position.set(...pos); controls.target.set(...tgt); controls.update(); render(); },
    render,
  };
}
