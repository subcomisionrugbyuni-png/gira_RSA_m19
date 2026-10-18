const POLL_MS = 30000;
const OFFSET = { SA: 2, AR: -3 }; // horas respecto de UTC (sin horario de verano en noviembre)
const ZONE_NAME = { SA: 'Sudáfrica', AR: 'Argentina' };
const HOUR = 3600e3;
const MIN = 60e3;

let data = null;
let lastText = '';
let view = 'hoy';
let zone = store('gira-zona') || (new Date().getTimezoneOffset() === 180 ? 'AR' : 'SA');

// ?ahora=2026-11-17T10:30 simula ese momento (hora de Sudáfrica)
const simulated = (() => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(new URLSearchParams(location.search).get('ahora') || '');
  return m ? { base: instant(m[1], m[2], 'SA'), loaded: Date.now() } : null;
})();
const now = () => (simulated ? simulated.base + (Date.now() - simulated.loaded) : Date.now());

/* ---------- utilidades ---------- */

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { return null; }
}

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

// Texto con links y correos clicables
function linkify(text) {
  const out = [];
  const re = /(https?:\/\/[^\s]+[^\s.,;:!?)]|[\w.+-]+@[\w-]+\.[\w.]+\w)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    const href = m[0].includes('@') && !m[0].startsWith('http') ? `mailto:${m[0]}` : m[0];
    out.push(h('a', { href, target: '_blank', rel: 'noopener' }, m[0]));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function instant(date, time, z) {
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return Date.UTC(y, mo - 1, d, hh, mm) - OFFSET[z] * HOUR;
}
const shifted = (ms, z) => new Date(ms + OFFSET[z] * HOUR);
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (ms, z = zone) => { const d = shifted(ms, z); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const dateKey = (ms, z = zone) => { const d = shifted(ms, z); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const fmtDate = (key, opts) => new Date(`${key}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', ...opts });

function fmtLeft(ms) {
  const m = Math.max(1, Math.round(ms / MIN));
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60);
  if (hrs < 48) return m % 60 ? `${hrs} h ${m % 60} min` : `${hrs} h`;
  return `${Math.round(hrs / 24)} días`;
}

/* ---------- modelo ---------- */

// Todos los bloques visibles con su inicio y fin absolutos
function events() {
  const list = [];
  for (const day of data.days) {
    for (const it of day.items) {
      if (!it.from) continue;
      const start = instant(day.date, it.from, it.zone);
      let end = it.to ? instant(day.date, it.to, it.zone) : null;
      if (end != null && end <= start) end += 24 * HOUR; // cruza la medianoche
      list.push({ ...it, day, start, end });
    }
  }
  list.sort((a, b) => a.start - b.start);
  // Sin hora de fin: dura hasta el siguiente bloque (máx. 2 h)
  list.forEach((e, i) => {
    const next = list[i + 1];
    e.until = e.end ?? Math.min(e.start + 2 * HOUR, next ? next.start : Infinity);
  });
  return list;
}

const uniformOf = (id) => data.uniforms.find((u) => u.id === id);

function timeRange(e) {
  const from = fmtTime(e.start);
  return e.end != null ? `${from}–${fmtTime(e.end)}` : from;
}

// Si el bloque cae otro día en la hora que se está viendo, lo aclara
function dayShift(e) {
  const diff = (Date.parse(dateKey(e.start)) - Date.parse(e.day.date)) / (24 * HOUR);
  return diff ? ` (${diff > 0 ? '+' : ''}${diff} día)` : '';
}

/* ---------- piezas de interfaz ---------- */

function uniformChip(id) {
  const u = uniformOf(id);
  if (!u) return null;
  // Solo se puede tocar si tiene prendas o explicación cargadas
  if (!u.items && !u.detail) return h('span', { class: 'chip' }, `👕 ${u.name}`);
  return h('button', { class: 'chip', type: 'button', onclick: () => openUniform(u) }, `👕 ${u.name}`);
}

function openUniform(u) {
  document.getElementById('ud-title').textContent = u.name;
  const items = document.getElementById('ud-items');
  items.textContent = u.items;
  document.getElementById('ud-detail').replaceChildren(...linkify(u.detail || ''));
  document.getElementById('uniform-dialog').showModal();
}

function itemChips(e) {
  return h('div', { class: 'chips' },
    uniformChip(e.uniform),
    !e.confirmed ? h('span', { class: 'chip warn' }, 'A confirmar') : null,
    e.map ? h('a', { class: 'chip', href: e.map, target: '_blank', rel: 'noopener' }, '📍 Mapa') : null,
  );
}

function timeline(dayEvents, t) {
  return h('ul', { class: 'timeline' }, dayEvents.map((e) => {
    const state = t >= e.until ? 'past' : t >= e.start ? 'now' : '';
    return h('li', { class: state, 'data-id': e.id },
      h('div', { class: 'time' }, fmtTime(e.start),
        e.end != null ? h('small', {}, `a ${fmtTime(e.end)}`) : null),
      h('div', {},
        h('div', { class: 'act' }, e.activity, state === 'now' ? h('span', { class: 'state' }, 'Ahora') : null),
        e.place ? h('div', { class: 'place' }, e.place + dayShift(e)) : null,
        itemChips(e),
        e.detail ? h('p', { class: 'detail' }, ...linkify(e.detail)) : null,
      ));
  }));
}

function dayExtras(day) {
  return [
    day.tips.length ? [h('h4', { class: 'sub' }, 'Recomendaciones'), h('ul', { class: 'tips' }, day.tips.map((t) => h('li', {}, ...linkify(t))))] : null,
    day.photos.length ? [h('h4', { class: 'sub' }, 'Fotos'), h('div', { class: 'photos' }, day.photos.map((p) => {
      const src = `/api/photo?id=${encodeURIComponent(p.id)}`;
      return h('figure', {},
        h('a', { href: src, target: '_blank', rel: 'noopener' }, h('img', { src, alt: p.caption || 'Foto', loading: 'lazy' })),
        p.caption ? h('figcaption', {}, p.caption) : null);
    }))] : null,
    day.notes ? [h('h4', { class: 'sub' }, 'Notas'), h('p', { class: 'notes' }, ...linkify(day.notes))] : null,
  ];
}

function noticeWhen(n) {
  return n.date ? instant(n.date, n.time || '00:00', 'SA') : 0;
}

function emptyState(title, text) {
  return h('div', { class: 'empty' }, h('strong', {}, title), text);
}

/* ---------- pantallas ---------- */

function renderHoy() {
  const t = now();
  const evs = events();
  const tripStart = instant(data.trip.start, '00:00', 'AR');
  const tripEnd = instant(data.trip.end, '23:59', 'AR');
  const parts = [];

  // Aviso importante fijado durante 36 h
  data.notices
    .filter((n) => n.important && noticeWhen(n) <= t && t - noticeWhen(n) < 36 * HOUR)
    .sort((a, b) => noticeWhen(b) - noticeWhen(a))
    .forEach((n) => parts.push(h('div', { class: 'card pinned' },
      h('h3', {}, '📌 ', n.title), n.message ? h('p', {}, ...linkify(n.message)) : null)));

  if (t > tripEnd) {
    parts.push(h('div', { class: 'card big-count' }, h('div', { class: 'n' }, '🏉'),
      h('p', {}, h('strong', {}, 'La gira terminó'), h('br'), '¡Gracias a todos por acompañar a La U!')));
    return parts;
  }

  const current = evs.find((e) => t >= e.start && t < e.until);
  const next = evs.find((e) => e.start > t);

  if (t < tripStart && !current) {
    const days = Math.ceil((tripStart - t) / (24 * HOUR));
    parts.push(h('div', { class: 'card big-count' },
      h('div', { class: 'n' }, days),
      h('p', {}, days === 1 ? 'día para la gira' : 'días para la gira'),
      h('p', {}, `Salimos el ${fmtDate(data.trip.start, { weekday: 'long', day: 'numeric', month: 'long' })}.`)));
  }

  const hero = current || next;
  if (hero) {
    const after = current ? evs[evs.indexOf(current) + 1] : null;
    parts.push(h('div', { class: `card hero${current ? ' now' : ''}` },
      h('span', { class: 'kicker' }, current ? 'Ahora' : 'Lo que sigue'),
      h('h2', {}, hero.activity),
      h('div', { class: 'meta' }, timeRange(hero), hero.place ? ` · ${hero.place}` : '',
        !current && dateKey(hero.start) !== dateKey(t) ? ` · ${fmtDate(dateKey(hero.start), { weekday: 'long', day: 'numeric' })}` : ''),
      itemChips(hero),
      hero.detail ? h('p', { class: 'detail' }, ...linkify(hero.detail)) : null,
      h('div', { class: 'count' }, current
        ? (current.end != null ? `Termina en ${fmtLeft(current.until - t)}` : '')
        : `Empieza en ${fmtLeft(hero.start - t)}`),
      after ? h('div', { class: 'after' }, `Después: ${after.activity} · ${fmtTime(after.start)}`) : null,
    ));
  }

  // Día de hoy: el del bloque actual o el próximo
  const day = hero ? hero.day : null;
  if (day) {
    const dayEvents = evs.filter((e) => e.day === day);
    const isToday = day.date === dateKey(t, 'SA') || day.date === dateKey(t, 'AR') || current;
    parts.push(h('h2', { class: 'section-title' }, isToday ? 'Hoy' : 'Próximo día',
      h('span', { class: 'muted', style: 'font-weight:500;font-size:.9rem' },
        ` · ${fmtDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}`)));
    parts.push(h('div', { class: 'card' },
      h('p', { class: 'label' }, day.title || 'Cronograma'),
      timeline(dayEvents, t),
      dayExtras(day)));

    const idx = data.days.indexOf(day);
    const tomorrow = data.days[idx + 1];
    const first = tomorrow && evs.find((e) => e.day === tomorrow);
    if (first) {
      parts.push(h('div', { class: 'card' },
        h('p', { class: 'label' }, `${fmtDate(tomorrow.date, { weekday: 'long', day: 'numeric' })} · ${tomorrow.title || ''}`),
        h('div', { class: 'act', style: 'font-weight:650' }, `${fmtTime(first.start)} · ${first.activity}`),
        first.place ? h('div', { class: 'muted' }, first.place) : null,
        itemChips(first),
        h('div', { style: 'margin-top:10px' }, h('button', { class: 'chip', type: 'button', onclick: () => show('dias', tomorrow.id) }, 'Ver día completo'))));
    }
  } else if (!data.days.length && t >= tripStart) {
    parts.push(emptyState('Todavía no hay días publicados', 'En cuanto se habilite el próximo día lo vas a ver acá.'));
  } else if (!data.days.length) {
    parts.push(h('p', { class: 'empty' }, 'El cronograma se va publicando día a día durante la gira.'));
  }
  return parts;
}

function renderDias(openId) {
  if (!data.days.length) return [emptyState('Todavía no hay días publicados', 'Los días se van habilitando a medida que avanza la gira.')];
  const t = now();
  const evs = events();
  const todayKey = dateKey(t, 'SA');
  const card = (day) => {
    const date = new Date(`${day.date}T12:00:00Z`);
    return h('details', { class: `day${day.date === todayKey ? ' today' : ''}`, id: `dia-${day.id}`, open: day.id === openId || day.date === todayKey },
      h('summary', {},
        h('div', { class: 'num' },
          h('span', {}, date.toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '')),
          h('b', {}, date.getUTCDate())),
        h('div', { class: 'ttl' }, day.title || 'Día de gira',
          h('small', {}, fmtDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })))),
      h('div', { class: 'day-body' },
        timeline(evs.filter((e) => e.day === day), t),
        dayExtras(day)));
  };
  const past = data.days.filter((d) => d.date < todayKey && d.id !== openId);
  const rest = data.days.filter((d) => !past.includes(d));
  return [
    past.length ? h('details', { class: 'past-group' }, h('summary', {}, `Días anteriores (${past.length})`), past.map(card)) : null,
    rest.map(card),
  ];
}

function seenNotices() {
  try { return new Set(JSON.parse(store('gira-avisos-leidos') || '[]')); } catch { return new Set(); }
}

function renderAvisos() {
  const seen = seenNotices();
  const list = [...data.notices].sort((a, b) => noticeWhen(b) - noticeWhen(a));
  if (!list.length) return [emptyState('No hay avisos', 'Los cambios de horario y recordatorios van a aparecer acá.')];
  return list.map((n) => h('article', { class: `card notice${n.important ? ' important' : ''}` },
    n.date ? h('time', {}, `${fmtDate(n.date, { weekday: 'long', day: 'numeric', month: 'long' })}${n.time ? ` · ${n.time} (hora SA)` : ''}`) : null,
    h('h3', {}, n.title,
      !seen.has(n.id) ? h('span', { class: 'tag new' }, 'Nuevo') : null,
      n.important ? h('span', { class: 'tag imp' }, 'Importante') : null),
    n.message ? h('p', {}, ...linkify(n.message)) : null));
}

function renderInfo() {
  if (!data.info.length) return [emptyState('Sin información', 'Todavía no hay información cargada.')];
  const parts = [];
  const sections = [...new Set(data.info.map((i) => i.section || 'Información'))];
  sections.forEach((s) => {
    parts.push(h('h2', { class: 'section-title' }, s));
    data.info.filter((i) => (i.section || 'Información') === s).forEach((i) => parts.push(h('div', { class: 'card info-item' },
      i.title ? h('h3', {}, i.title) : null,
      h('p', {}, ...linkify(i.content)))));
  });
  return parts;
}

/* ---------- render y navegación ---------- */

function render(openId) {
  if (!data) return;
  document.getElementById('title').textContent = data.trip.title;
  document.getElementById('subtitle').textContent = data.trip.subtitle;
  document.title = data.trip.title;
  document.querySelectorAll('.zone-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zone === zone)));

  const target = document.getElementById(`view-${view}`);
  const builders = { hoy: renderHoy, dias: () => renderDias(openId), avisos: renderAvisos, info: renderInfo };
  // Mantiene abiertos los días que el usuario desplegó
  const opened = new Set([...document.querySelectorAll('#view-dias details[open]')].map((d) => d.id));
  target.replaceChildren(...builders[view]().flat(Infinity).filter(Boolean));
  if (view === 'dias' && !openId) opened.forEach((id) => { const el = document.getElementById(id); if (el) el.open = true; });

  if (view === 'avisos') {
    store('gira-avisos-leidos', JSON.stringify(data.notices.map((n) => n.id)));
  }
  const unread = data.notices.filter((n) => !seenNotices().has(n.id)).length;
  const badge = document.getElementById('badge');
  badge.hidden = !unread || view === 'avisos';
  badge.textContent = unread;
}

function show(v, openId) {
  view = v;
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== `view-${v}`; });
  document.querySelectorAll('.tabs button').forEach((b) => b.toggleAttribute('aria-current', b.dataset.view === v));
  document.querySelectorAll('.tabs button[aria-current]').forEach((b) => b.setAttribute('aria-current', 'page'));
  render(openId);
  if (openId) document.getElementById(`dia-${openId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo(0, 0);
}

function tickClocks() {
  const t = now();
  document.getElementById('clock-sa').textContent = fmtTime(t, 'SA');
  document.getElementById('clock-ar').textContent = fmtTime(t, 'AR');
}

function setOffline(text) {
  document.getElementById('offline').hidden = !text;
  document.getElementById('offline-text').textContent = text || '';
}

async function load() {
  const btn = document.getElementById('refresh');
  btn.classList.add('spin');
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    setOffline('');
    store('gira-datos', text);
    store('gira-datos-fecha', String(Date.now()));
    if (text !== lastText) {
      lastText = text;
      data = JSON.parse(text);
      render();
    }
  } catch {
    const at = Number(store('gira-datos-fecha'));
    setOffline(data
      ? `Sin conexión. Mostrando lo último descargado${at ? ` (${new Date(at).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })})` : ''}.`
      : 'No se pudo cargar la información. Revisá la conexión.');
  } finally {
    btn.classList.remove('spin');
  }
}

/* ---------- arranque ---------- */

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
document.querySelectorAll('.zone-switch button').forEach((b) => b.addEventListener('click', () => {
  zone = b.dataset.zone;
  store('gira-zona', zone);
  render();
}));
document.getElementById('refresh').addEventListener('click', load);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

const cached = store('gira-datos');
if (cached) {
  try { data = JSON.parse(cached); lastText = cached; } catch {}
}
tickClocks();
render();
if (!data) document.getElementById('view-hoy').replaceChildren(h('p', { class: 'empty' }, 'Cargando…'));
load();
setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
// Relojes y cuentas regresivas
setInterval(() => {
  tickClocks();
  if (view === 'hoy' && !document.querySelector('dialog[open]')) render();
}, 20000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
