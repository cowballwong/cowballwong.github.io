// The year slider. Eras get fixed shares of the track, so 1,700 years stay readable.
export const ERAS = [
  {id: 'roman', name: 'Roman', from: 50, to: 410, w: 13},
  {id: 'saxon', name: 'Saxon', from: 410, to: 1066, w: 9},
  {id: 'norman', name: 'Norman', from: 1066, to: 1190, w: 11},
  {id: 'gothic', name: 'Medieval abbey', from: 1190, to: 1539, w: 25},
  {id: 'tudor', name: 'Parish church', from: 1539, to: 1830, w: 13},
  {id: 'victorian', name: 'Victorian', from: 1830, to: 1901, w: 13},
  {id: 'modern', name: 'Modern', from: 1901, to: 2026, w: 16},
];
const TOTAL = ERAS.reduce((a, e) => a + e.w, 0);
export const YEAR0 = ERAS[0].from, YEAR1 = ERAS.at(-1).to;

export function yearToPos(y) {
  let acc = 0;
  for (const e of ERAS) {
    if (y <= e.to || e === ERAS.at(-1)) return (acc + e.w * Math.max(0, Math.min(1, (y - e.from) / (e.to - e.from)))) / TOTAL;
    acc += e.w;
  }
  return 1;
}
export function posToYear(p) {
  let acc = 0;
  p *= TOTAL;
  for (const e of ERAS) {
    if (p <= acc + e.w) return e.from + ((p - acc) / e.w) * (e.to - e.from);
    acc += e.w;
  }
  return YEAR1;
}
export const eraOf = y => ERAS.find(e => y <= e.to) || ERAS.at(-1);

export function initTimeline({events, onYear, onEvent}) {
  const slider = document.getElementById('slider'), yearEl = document.getElementById('year'), eraEl = document.getElementById('era');
  const play = document.getElementById('play'), ticks = document.getElementById('ticks'), eras = document.getElementById('eras');
  for (const e of ERAS) {
    const d = document.createElement('div');
    d.style.width = (e.w / TOTAL) * 100 + '%';
    d.textContent = e.name;
    eras.appendChild(d);
  }
  const tickEls = events.map(ev => {
    const b = document.createElement('button');
    b.style.left = yearToPos(ev.year) * 100 + '%';
    b.title = `${ev.date_label || ev.year} · ${ev.title}`;
    b.setAttribute('aria-label', b.title);
    b.onclick = () => { stop(); set(ev.year); onEvent(ev); };
    ticks.appendChild(b);
    return b;
  });
  let year = YEAR1, playing = false, lastShown = null;
  function set(y, fromPlay = false) {
    year = Math.max(YEAR0, Math.min(YEAR1, y));
    slider.value = Math.round(yearToPos(year) * 1000);
    const yr = Math.round(year);
    yearEl.textContent = yr < 1000 ? `AD ${yr}` : yr;
    eraEl.textContent = eraOf(year).name;
    tickEls.forEach((t, i) => t.classList.toggle('past', events[i].year <= year));
    onYear(year);
    if (fromPlay) {
      const ev = [...events].reverse().find(e => e.year <= year && e.year > year - 40);
      if (ev && ev !== lastShown) { lastShown = ev; onEvent(ev, true); }
    }
  }
  slider.addEventListener('input', () => { stop(); set(posToYear(slider.value / 1000)); });
  // Play: the whole track in about 75 s, slowing near events so they can be read.
  let t0 = 0;
  function tick(now) {
    if (!playing) return;
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    const near = events.some(e => Math.abs(e.year - year) < 6);
    const p = yearToPos(year) + dt / (near ? 150 : 75);
    if (p >= 1) { set(YEAR1, true); stop(); return; }
    set(posToYear(p), true);
    requestAnimationFrame(tick);
  }
  function start() {
    if (year >= YEAR1 - 1) set(YEAR0);
    playing = true; play.classList.add('on'); play.textContent = '❚❚'; play.setAttribute('aria-label', 'Pause');
    t0 = performance.now(); requestAnimationFrame(tick);
  }
  function stop() { playing = false; play.classList.remove('on'); play.textContent = '▶'; play.setAttribute('aria-label', 'Play the timeline'); }
  play.onclick = () => (playing ? stop() : start());
  set(YEAR1);
  return {set, start, stop, get year() { return year; }, get playing() { return playing; }};
}
