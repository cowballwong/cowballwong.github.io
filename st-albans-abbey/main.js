// Wires it all together: data, model, setting, life, timeline, intro animation and the UI modes.
import {THREE, scene, camera, controls, renderer, sun, M, INK, section, parts, lines, root} from './scene.js';
import {buildCathedral, ANCHORS} from './model.js';
import {buildTerrain, buildGround, buildTown, buildRoman, buildTrees, romanCity, pathSets} from './context.js';
import {initLife} from './life.js';
import {initTimeline} from './timeline.js';
import {initPlaces, showEvent, initTour} from './ui.js';
import {TOUR, VIEWS} from './tour.js';
import {setInteriorLight, setInside, INSIDE_VIEW, stats as interiorStats} from './interior.js';

const get = u => fetch(u).then(r => r.json());
const [C, T, history, spotsRaw] = await Promise.all([get('data/context.json'), get('data/terrain.json'), get('data/history.json'), get('data/spots.json')]);

// ---------- build ----------
const ground = buildTerrain(T);
buildCathedral();
const R = romanCity(C);
C.romanStreets = R.streets;
const groundMesh = buildGround(scene, C, ground, renderer);
const precinct = [[84, 0, 120], [ANCHORS.gateway[0], ANCHORS.gateway[2], 14]];
const town = buildTown(scene, C, ground, {skip: precinct});
const roman = buildRoman(scene, C, ground, R);
buildTrees(scene, C, ground, ([x, z]) => Math.abs(z) < 75 && x > -40 && x < 200);
const life = initLife(scene, pathSets(C, R));

// Spots: site spots come with lat/lon, interior/exterior ones are anchored on the model.
const B = THREE.MathUtils.degToRad(C.meta.axis_bearing_deg), LAT0 = C.meta.origin_lat, LON0 = C.meta.origin_lon;
function toLocal(lat, lon) {
  const n = (lat - LAT0) * 111320, e = (lon - LON0) * 111320 * Math.cos(LAT0 * Math.PI / 180);
  return [n * Math.cos(B) + e * Math.sin(B), n * Math.cos(B + Math.PI / 2) + e * Math.sin(B + Math.PI / 2)];
}
const spots = spotsRaw.filter(sp => {
  const a = ANCHORS[sp.id];
  if (a) [sp.x, sp.y, sp.z] = a;
  else if (sp.lat != null) { [sp.x, sp.z] = toLocal(sp.lat, sp.lon); sp.y = ground(sp.x, sp.z) + 12; }
  else return false;
  const m = String(sp.period || '').match(/(1\d{3}|20\d{2}|[1-9]\d{2})/);
  sp.from = /roman/i.test(sp.period || '') ? 50 : m ? +m[1] : /saxon/i.test(sp.period || '') ? 900 : /medieval/i.test(sp.period || '') ? 1100 : 0;
  return true;
});

// ---------- camera moves ----------
let tween = null;
export function flyTo(cam, look, dur = 1.8) {
  tween = {t: 0, dur, p0: camera.position.clone(), q0: controls.target.clone(), p1: new THREE.Vector3(...cam), q1: new THREE.Vector3(...look)};
}
controls.addEventListener('start', () => { tween = null; });
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ---------- section ----------
let cut = false;
const cutMats = [...Object.values(M), INK];
function setSection(on) {
  cut = on;
  for (const m of cutMats) { m.clippingPlanes = on ? [section] : []; m.needsUpdate = true; }
  document.getElementById('t-section').setAttribute('aria-pressed', String(on));
}
document.getElementById('t-section').onclick = () => { if (!cut && inside) { goInside(false); flyTo(OVERVIEW.cam, OVERVIEW.look); } setSection(!cut); };

// ---------- timeline: parts grow as the years pass ----------
const grow = [];
let lastYear = 2026;
function onYear(y) {
  for (const p of Object.values(parts)) {
    const vis = y >= p.from && y < p.to;
    if (vis && !p.group.visible && y > lastYear && tl?.playing) { p.group.scale.y = 0.02; grow.push(p); }
    p.group.visible = vis;
  }
  town.setYear(y); roman.setYear(y); groundMesh.setYear(y);
  lastYear = y;
}
let tl = null;
tl = initTimeline({events: history, onYear, onEvent: (ev, auto) => showEvent(ev, auto)});

// ---------- places, tour, modes ----------
// Inside mode: eye-level views inside the church (warm light, wider lens, may look up), no section cut.
let inside = false;
function goInside(on, fov) {
  inside = on;
  setInside(on, camera, controls, fov);
  document.getElementById('t-inside').setAttribute('aria-pressed', String(on));
}
const places = initPlaces({spots, camera, renderer, flyTo: sp => {
  const v = VIEWS[sp.id];
  if (v && v.inside) { setSection(false); goInside(true, v.fov); flyTo(v.cam, v.look); return; }
  goInside(false);
  if (sp.kind === 'interior') setSection(true);
  if (v) flyTo(v.cam, v.look);
  else {
    const d = sp.kind === 'site' ? 140 : sp.kind === 'exterior' ? 60 : 26;
    flyTo([sp.x - d * 0.5, sp.y + d * 0.55, sp.z + d], [sp.x, sp.y - (sp.kind === 'interior' ? 2 : 8), sp.z]);
  }
}});
const tour = initTour(TOUR, s => {
  tl.stop(); tl.set(s.year);
  if (s.inside) { setSection(false); goInside(true, s.fov); } else { goInside(false); setSection(!!s.section); }
  flyTo(s.cam, s.look, 2.4);
});
const OVERVIEW = {cam: [-240, 230, 420], look: [70, 0, 30]};
function mode(m) {
  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  document.getElementById('places').hidden = m !== 'places';
  document.getElementById('tour').hidden = m !== 'tour';
  if (m === 'tour') { places.close(); tour.start(); }
}
document.querySelectorAll('.modes button').forEach(b => b.onclick = () => mode(b.dataset.mode));
document.getElementById('t-reset').onclick = () => { setSection(false); goInside(false); flyTo(OVERVIEW.cam, OVERVIEW.look); };
document.getElementById('t-inside').onclick = () => {
  if (inside) { goInside(false); flyTo(OVERVIEW.cam, OVERVIEW.look); }
  else { setSection(false); goInside(true, INSIDE_VIEW.fov); flyTo(INSIDE_VIEW.cam, INSIDE_VIEW.look); }
};
const about = document.getElementById('about');
document.getElementById('t-about').onclick = () => { about.hidden = false; };
about.querySelector('.close').onclick = () => { about.hidden = true; };
about.onclick = e => { if (e.target === about) about.hidden = true; };
addEventListener('keydown', e => { if (e.key === 'Escape') about.hidden = true; });
const lifeBtn = document.getElementById('t-life');
lifeBtn.onclick = () => { life.group.visible = !life.group.visible; lifeBtn.setAttribute('aria-pressed', String(life.group.visible)); };

// ---------- intro: the abbey is drawn in pencil, then the materials come in ----------
const paper = new THREE.Color(0xf1ebdf), sky = scene.background;
const meshes = [];
root.traverse(o => { if (o.isMesh) meshes.push(o); });
const setting = scene.children.filter(o => o !== root && (o.isMesh || o.isGroup || o.isInstancedMesh));
const xs = lines.map(l => { l.geometry.computeBoundingBox(); return l.geometry.boundingBox.getCenter(new THREE.Vector3()).x; });
const xmin = Math.min(...xs), xmax = Math.max(...xs);
lines.forEach((l, i) => { l.userData.order = (xs[i] - xmin) / (xmax - xmin || 1); l.geometry.setDrawRange(0, 0); });
meshes.forEach(m => { m.visible = false; });
setting.forEach(o => { o.userData.wasVisible = o.visible; o.visible = false; });
scene.background = paper; scene.fog.color.copy(paper);
sun.castShadow = false;
const introFrom = {cam: [-85, 78, 175], look: [78, 12, 0]};
camera.position.set(...introFrom.cam); controls.target.set(...introFrom.look);
const DRAW = 4.2, FADE = 1.6;
let intro = 0;
const fadeMats = new Set();
let introFreeze = false;
function introStep(dt) {
  intro += introFreeze ? 0 : dt;
  const t = Math.min(1, intro / DRAW);
  for (const l of lines) l.geometry.setDrawRange(0, Math.floor(l.userData.count * Math.max(0, Math.min(1, (t - l.userData.order * 0.65) / 0.35)) / 2) * 2);
  document.getElementById('intro-pct').textContent = Math.round(t * 100) + '%';
  if (intro >= DRAW && !fadeMats.size && !introStep.started) {
    introStep.started = true;
    meshes.forEach(m => { m.visible = true; for (const mm of [].concat(m.material)) { mm.transparent = true; mm.opacity = 0; fadeMats.add(mm); } });
    setting.forEach(o => { o.visible = o.userData.wasVisible; });
    scene.background = sky; sun.castShadow = true;
    document.getElementById('intro').classList.add('done');
    document.getElementById('pins').classList.remove('hidden');
    onYear(tl.year);
    flyTo(OVERVIEW.cam, OVERVIEW.look, 3);
  }
  if (intro >= DRAW) {
    const k = Math.min(1, (intro - DRAW) / FADE);
    fadeMats.forEach(mm => { mm.opacity = k; });
    INK.opacity = 0.9 * (1 - k) + 0.1 * k;
    scene.fog.color.lerpColors(paper, new THREE.Color(0xe2ded4), k);
    if (k >= 1) { fadeMats.forEach(mm => { mm.transparent = false; mm.opacity = 1; mm.needsUpdate = true; }); return true; }
  }
  return false;
}

// ---------- loop ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
}
addEventListener('resize', resize);
let last = performance.now(), introDone = false;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  resize();
  if (!introDone) introDone = introStep(dt);
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / tween.dur);
    const k = ease(tween.t);
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.q0, tween.q1, k);
    if (tween.t >= 1) tween = null;
  }
  for (let i = grow.length - 1; i >= 0; i--) {
    const g = grow[i].group;
    g.scale.y = Math.min(1, g.scale.y + dt * 0.8);
    if (g.scale.y >= 1) grow.splice(i, 1);
  }
  if (introDone) life.update(dt, tl.year, ground);
  controls.update();
  renderer.render(scene, camera);
  if (introDone) places.place(cut || inside, tl.year, inside);
  requestAnimationFrame(frame);
}
resize();
requestAnimationFrame(frame);
window.__sa = {scene, camera, controls, parts, tl, flyTo, setSection, setInteriorLight, setInside, mode, spots, get introDone() { return introDone; }};

// QA switches: ?nointro&year=1400&cam=x,y,z&look=x,y,z&section=1&tour=3&mode=places&spot=id
{
  const q = new URLSearchParams(location.search);
  if (q.has('nointro')) intro = DRAW + FADE;
  if (q.has('introfreeze')) { intro = +q.get('introfreeze'); introFreeze = true; }
  const after = () => {
    if (!introDone) return requestAnimationFrame(after);
    if (q.has('year')) tl.set(+q.get('year'));
    if (q.has('section')) setSection(true);
    if (q.has('cam')) { tween = null; camera.position.set(...q.get('cam').split(',').map(Number)); controls.target.set(...q.get('look').split(',').map(Number)); }
    if (q.has('mode')) mode(q.get('mode'));
    if (q.has('about')) document.getElementById('t-about').click();
    if (q.has('clean')) document.body.classList.add('clean'); // share-image renders: no chrome, no pins
    if (q.has('tour')) { mode('tour'); for (let i = 1; i < +q.get('tour'); i++) document.getElementById('tour-next').click(); tween && (tween.t = 1); }
    if (q.has('inside')) goInside(true);
    if (q.has('calls')) setTimeout(() => console.log('drawcalls', renderer.info.render.calls, 'tris', renderer.info.render.triangles, 'interior meshes', interiorStats.meshes), 3000);
    if (q.has('spot')) { const sp = spots.find(s => s.id === q.get('spot')); if (sp) { sp.pin.click(); tween && (tween.t = 1); } }
  };
  after();
}
