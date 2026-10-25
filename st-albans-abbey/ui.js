// Places list, pins, the place card, the guided tour and the event pop-up.
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

export function initPlaces({spots, camera, renderer, flyTo, onOpen}) {
  const list = $('place-list'), pins = $('pins');
  let filter = 'all', selected = null;
  spots.forEach((sp, i) => {
    sp.n = i + 1;
    sp.v = new THREE.Vector3(sp.x, sp.y, sp.z);
    const pin = document.createElement('div');
    pin.className = `pin ${sp.kind}`;
    pin.innerHTML = `<i>${sp.n}</i><span>${esc(sp.name)}</span>`;
    pin.onclick = () => open(sp);
    pins.appendChild(pin);
    sp.pin = pin;
    const li = document.createElement('li');
    li.className = sp.kind;
    li.innerHTML = `<button><i>${sp.n}</i><div>${esc(sp.name)}<small>${esc(sp.period || '')}</small></div></button>`;
    li.querySelector('button').onclick = () => open(sp);
    list.appendChild(li);
    sp.li = li;
  });
  document.querySelectorAll('.filters button').forEach(b => b.onclick = () => {
    filter = b.dataset.f;
    document.querySelectorAll('.filters button').forEach(x => x.classList.toggle('on', x === b));
    spots.forEach(sp => { sp.li.hidden = filter !== 'all' && sp.kind !== filter; });
  });
  $('card').querySelector('.close').onclick = close;

  function open(sp) {
    selected?.pin.classList.remove('sel');
    selected = sp;
    sp.pin.classList.add('sel');
    const ph = sp.photo;
    $('card-body').innerHTML = `${ph?.src ? `<img src="${ph.src}" alt="${esc(sp.name)}"><div class="credit">Photo: ${esc(ph.author)} · ${esc(ph.licence)} · <a href="${esc(ph.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>` : ''}
      <div class="inner"><div class="kicker">${{interior: 'Inside the cathedral', exterior: 'The building', site: 'Town and Verulamium'}[sp.kind] || ''} · ${esc(sp.period || '')}</div>
      <h3>${esc(sp.name)}</h3>${String(sp.text).split(/\n+/).map(p => `<p>${esc(p)}</p>`).join('')}
      ${sp.source ? `<div class="src">Source: <a href="${esc(sp.source)}" target="_blank" rel="noopener">${esc(new URL(sp.source).hostname.replace('www.', ''))}</a></div>` : ''}</div>`;
    $('card').hidden = false;
    flyTo(sp);
    onOpen?.(sp);
  }
  function close() { $('card').hidden = true; selected?.pin.classList.remove('sel'); selected = null; }

  const v = new THREE.Vector3();
  function place(showInterior, year = 2026, insideOnly = false) {
    const w = innerWidth, h = innerHeight;
    for (const sp of spots) {
      if ((insideOnly && sp.kind !== 'interior') || (sp.kind === 'interior' && !showInterior && sp !== selected) || (sp.from && year < sp.from && sp !== selected)) { sp.pin.style.display = 'none'; continue; }
      v.copy(sp.v).project(camera);
      const ok = v.z < 1 && Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02;
      const d = camera.position.distanceTo(sp.v);
      sp.pin.style.display = ok && (sp.kind !== 'site' || d < 2600) ? '' : 'none';
      sp.pin.style.left = ((v.x + 1) / 2) * w + 'px';
      sp.pin.style.top = ((1 - v.y) / 2) * h + 'px';
      sp.pin.style.zIndex = String(10000 - Math.round(d));
    }
  }
  return {open, close, place};
}

export function showEvent(ev, auto) {
  const el = $('event');
  el.innerHTML = `<div class="d">${esc(ev.date_label || ev.year)}</div><b>${esc(ev.title)}</b>${esc(ev.text)}`;
  el.hidden = false;
  clearTimeout(showEvent.t);
  showEvent.t = setTimeout(() => { el.hidden = true; }, auto ? 5200 : 9000);
}

export function initTour(stops, go) {
  let i = 0;
  const render = () => {
    const s = stops[i];
    $('tour-n').textContent = `${i + 1} of ${stops.length} · ${s.when}`;
    $('tour-title').textContent = s.title;
    $('tour-text').textContent = s.text;
    $('tour-prev').disabled = i === 0;
    $('tour-next').textContent = i === stops.length - 1 ? 'Finish' : 'Next';
    go(s);
  };
  $('tour-prev').onclick = () => { if (i > 0) { i--; render(); } };
  $('tour-next').onclick = () => { if (i < stops.length - 1) { i++; render(); } else document.querySelector('[data-mode=explore]').click(); };
  return {start() { i = 0; render(); }};
}
