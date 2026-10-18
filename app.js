const POLL_MS = 30000;
const OFFSET = { SA: 2, AR: -3 }; // horas respecto de UTC (sin horario de verano en noviembre)
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
    day.items.forEach((it, idx) => {
      if (!it.from) return;
      const start = instant(day.date, it.from, it.zone);
      let end = it.to ? instant(day.date, it.to, it.zone) : null;
      if (end != null && end <= start) end += 24 * HOUR; // cruza la medianoche
      list.push({ ...it, day, idx, start, end });
    });
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

const ICONS = {
  pin: '<path d="M12 21s-7-6.1-7-11.2a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>',
  hanger: '<path d="M9.6 6.6A2.4 2.4 0 1 1 13 8.8c-.6.3-1 .8-1 1.5v.6"/><path d="M12 10.9 3.5 17a1.6 1.6 0 0 0 .9 2.9h15.2a1.6 1.6 0 0 0 .9-2.9z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="M12 9v6M9 12h6"/>',
  ball: '<ellipse cx="12" cy="12" rx="9.5" ry="5.6" transform="rotate(-40 12 12)"/><path d="m8.6 15.4 6.8-6.8M10.3 11.7l2 2M12.3 9.7l2 2"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  bed: '<path d="M3 19V6M3 15h18M21 19v-6a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11.5" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.5"/>',
};

function icon(name, cls = 'ic') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
}

// Solo se puede tocar si tiene prendas o explicación cargadas
const hasUniformInfo = (u) => !!(u.items || u.detail);

function uniformMeta(id) {
  const u = uniformOf(id);
  if (!u) return null;
  if (!hasUniformInfo(u)) return h('span', { class: 'meta' }, icon('hanger'), u.name);
  return h('button', { class: 'meta', type: 'button', onclick: () => openUniform(u) }, icon('hanger'), u.name);
}

function openUniform(u) {
  document.getElementById('ud-title').textContent = u.name;
  const items = document.getElementById('ud-items');
  items.textContent = u.items;
  document.getElementById('ud-detail').replaceChildren(...linkify(u.detail || ''));
  document.getElementById('uniform-dialog').showModal();
}

function itemTags(e, cls = 'tags') {
  if (e.confirmed && !e.map) return null;
  return h('div', { class: cls },
    !e.confirmed ? h('span', { class: 'tag warn' }, 'A confirmar') : null,
    e.map ? h('a', { class: 'tag link', href: e.map, target: '_blank', rel: 'noopener' }, icon('pin'), 'Ver mapa') : null,
  );
}

function timeline(dayEvents, t) {
  // En el orden que definió el panel
  const ordered = [...dayEvents].sort((a, b) => a.idx - b.idx);
  const upcoming = dayEvents.filter((e) => e.start > t).sort((a, b) => a.start - b.start)[0];
  return h('ol', { class: 'tl' }, ordered.map((e) => {
    const state = t >= e.until ? 'past' : t >= e.start ? 'now' : e === upcoming ? 'next' : '';
    return h('li', { class: `tl-item ${state}`.trim(), 'data-id': e.id },
      h('div', { class: 'tl-time' }, h('b', {}, fmtTime(e.start)), e.end != null ? h('span', {}, fmtTime(e.end)) : null),
      h('div', { class: 'tl-rail' }, h('i')),
      h('div', { class: 'tl-body' },
        h('div', { class: 'tl-title' }, h('span', { class: 'act' }, e.activity),
          state === 'now' ? h('span', { class: 'pill now' }, 'Ahora') : state === 'next' ? h('span', { class: 'pill next' }, 'Sigue') : null),
        e.place || uniformOf(e.uniform) ? h('div', { class: 'tl-meta' },
          e.place ? h('span', { class: 'meta' }, icon('pin'), e.place + dayShift(e)) : null,
          uniformMeta(e.uniform)) : null,
        itemTags(e),
        e.detail ? h('p', { class: 'tl-detail' }, ...linkify(e.detail)) : null,
      ));
  }));
}

function dayExtras(day) {
  return [
    day.tips.length ? h('div', { class: 'extra' }, h('h4', { class: 'extra-title' }, 'Recomendaciones'),
      h('ul', { class: 'checklist' }, day.tips.map((t) => h('li', {}, icon('check'), h('span', {}, ...linkify(t)))))) : null,
    day.photos.length ? h('div', { class: 'extra' }, h('h4', { class: 'extra-title' }, 'Fotos'),
      h('div', { class: 'photos' }, day.photos.map((p) => {
        const src = `/api/photo?id=${encodeURIComponent(p.id)}`;
        return h('figure', {},
          h('a', { href: src, target: '_blank', rel: 'noopener' }, h('img', { src, alt: p.caption || 'Foto', loading: 'lazy' })),
          p.caption ? h('figcaption', {}, p.caption) : null);
      }))) : null,
    day.notes ? h('div', { class: 'extra' }, h('h4', { class: 'extra-title' }, 'Notas'), h('p', { class: 'notes' }, ...linkify(day.notes))) : null,
  ];
}

function noticeWhen(n) {
  return n.date ? instant(n.date, n.time || '00:00', 'SA') : 0;
}

function emptyState(title, text, ic = 'calendar') {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, icon(ic)), h('strong', {}, title), h('p', {}, text));
}

const longDate = (key) => fmtDate(key, { weekday: 'long', day: 'numeric', month: 'long' });

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
    .forEach((n) => parts.push(h('div', { class: 'pinned' },
      h('div', { class: 'pinned-ic' }, icon('bell')),
      h('div', { class: 'pinned-body' },
        h('span', { class: 'overline' }, 'Aviso importante'),
        h('h3', {}, n.title),
        n.message ? h('p', {}, ...linkify(n.message)) : null))));

  if (t > tripEnd) {
    parts.push(h('section', { class: 'card countdown' },
      h('span', { class: 'overline' }, data.trip.title),
      h('div', { class: 'cd-label' }, 'La gira terminó'),
      h('p', {}, '¡Gracias a todos por acompañar a La U!')));
    return parts;
  }

  const current = evs.find((e) => t >= e.start && t < e.until);
  const next = evs.find((e) => e.start > t);

  if (t < tripStart && !current) {
    const days = Math.ceil((tripStart - t) / (24 * HOUR));
    parts.push(h('section', { class: 'card countdown' },
      h('span', { class: 'overline' }, 'Cuenta regresiva'),
      h('div', { class: 'cd-num' }, days),
      h('div', { class: 'cd-label' }, days === 1 ? 'día para la gira' : 'días para la gira'),
      h('p', {}, `Salimos el ${longDate(data.trip.start)}.`)));
  }

  const hero = current || next;
  if (hero) {
    const after = current ? evs[evs.indexOf(current) + 1] : null;
    const count = current
      ? (current.end != null ? `Termina en ${fmtLeft(current.until - t)}` : '')
      : `Empieza en ${fmtLeft(hero.start - t)}`;
    const u = uniformOf(hero.uniform);
    const cells = [
      h('div', { class: 'hero-cell' }, h('span', {}, 'Horario'), h('b', {}, timeRange(hero))),
      !current && dateKey(hero.start) !== dateKey(t)
        ? h('div', { class: 'hero-cell' }, h('span', {}, 'Día'), h('b', {}, fmtDate(dateKey(hero.start), { weekday: 'long', day: 'numeric' })))
        : null,
      u ? h('div', { class: 'hero-cell' }, h('span', {}, 'Vestimenta'), hasUniformInfo(u)
        ? h('button', { class: 'cell-btn', type: 'button', onclick: () => openUniform(u) }, u.name, icon('right'))
        : h('b', {}, u.name)) : null,
    ].filter(Boolean);
    if (cells.length % 2) cells[cells.length - 1].classList.add('wide');
    if (hero.place) cells.push(h('div', { class: 'hero-cell wide' }, h('span', {}, 'Lugar'), h('b', {}, hero.place)));
    const progress = current && current.end != null
      ? Math.min(100, Math.max(0, ((t - current.start) / (current.until - current.start)) * 100))
      : null;

    parts.push(h('section', { class: `hero${current ? ' now' : ''}` },
      h('div', { class: 'hero-top' },
        h('span', { class: 'kicker' }, current ? h('i', { class: 'live-dot' }) : null, current ? 'Ahora' : 'Lo que sigue'),
        count ? h('span', { class: 'hero-count' }, count) : null),
      h('h2', { class: 'hero-title' }, hero.activity),
      h('div', { class: 'hero-grid' }, cells),
      itemTags(hero, 'tags hero-tags'),
      hero.detail ? h('p', { class: 'hero-detail' }, ...linkify(hero.detail)) : null,
      progress != null ? h('div', { class: 'hero-progress' }, h('i', { style: `width:${progress.toFixed(1)}%` })) : null,
      after ? h('div', { class: 'hero-next' }, h('span', {}, 'A continuación'), h('b', {}, `${fmtTime(after.start)} · ${after.activity}`)) : null,
    ));
  }

  // Día de hoy: el del bloque actual o el próximo
  const day = hero ? hero.day : null;
  if (day) {
    const dayEvents = evs.filter((e) => e.day === day);
    const isToday = day.date === dateKey(t, 'SA') || day.date === dateKey(t, 'AR') || current;
    parts.push(h('div', { class: 'sec-head' },
      h('span', { class: 'overline' }, `${isToday ? 'Hoy' : 'Próximo día'} · ${longDate(day.date)}`),
      h('h2', {}, day.title || 'Cronograma')));
    parts.push(h('section', { class: 'card' }, timeline(dayEvents, t), dayExtras(day)));

    const idx = data.days.indexOf(day);
    const tomorrow = data.days[idx + 1];
    const first = tomorrow && evs.filter((e) => e.day === tomorrow).sort((a, b) => a.idx - b.idx)[0];
    if (first) {
      parts.push(h('div', { class: 'sec-head' },
        h('span', { class: 'overline' }, longDate(tomorrow.date)),
        h('h2', {}, tomorrow.title || 'Día siguiente')));
      parts.push(h('section', { class: 'card preview' },
        h('div', { class: 'preview-row' },
          h('div', { class: 'preview-time' }, fmtTime(first.start)),
          h('div', { class: 'preview-body' },
            h('span', { class: 'overline' }, 'Primera actividad'),
            h('div', { class: 'preview-title' }, first.activity),
            first.place || uniformOf(first.uniform) ? h('div', { class: 'tl-meta' },
              first.place ? h('span', { class: 'meta' }, icon('pin'), first.place) : null,
              uniformMeta(first.uniform)) : null)),
        h('button', { class: 'btn-row', type: 'button', onclick: () => show('dias', tomorrow.id) }, 'Ver día completo', icon('arrow'))));
    }
  } else if (!data.days.length && t >= tripStart) {
    parts.push(emptyState('Todavía no hay días publicados', 'En cuanto se habilite el próximo día lo vas a ver acá.'));
  } else if (!data.days.length) {
    parts.push(h('p', { class: 'note-center' }, 'El cronograma se va publicando día a día durante la gira.'));
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
    const isToday = day.date === todayKey;
    return h('details', { class: `day${isToday ? ' today' : ''}`, id: `dia-${day.id}`, open: day.id === openId || isToday },
      h('summary', {},
        h('div', { class: 'date-badge' },
          h('span', {}, date.toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '')),
          h('b', {}, date.getUTCDate())),
        h('div', { class: 'day-info' },
          h('b', {}, day.title || 'Día de gira'),
          h('small', {}, longDate(day.date))),
        isToday ? h('span', { class: 'pill now' }, 'Hoy') : null,
        icon('chevron', 'ic chev')),
      h('div', { class: 'day-body' },
        timeline(evs.filter((e) => e.day === day), t),
        dayExtras(day)));
  };
  const past = data.days.filter((d) => d.date < todayKey && d.id !== openId);
  const rest = data.days.filter((d) => !past.includes(d));
  return [
    past.length ? h('details', { class: 'past-group' },
      h('summary', {}, icon('calendar'), `Días anteriores (${past.length})`, icon('chevron', 'ic chev')),
      past.map(card)) : null,
    rest.map(card),
  ];
}

function seenNotices() {
  try { return new Set(JSON.parse(store('gira-avisos-leidos') || '[]')); } catch { return new Set(); }
}

function renderAvisos() {
  const seen = seenNotices();
  const list = [...data.notices].sort((a, b) => noticeWhen(b) - noticeWhen(a));
  if (!list.length) return [emptyState('No hay avisos', 'Los cambios de horario y recordatorios van a aparecer acá.', 'bell')];
  return list.map((n) => h('article', { class: `card notice${n.important ? ' important' : ''}${seen.has(n.id) ? '' : ' unread'}` },
    h('div', { class: 'notice-ic' }, icon('bell')),
    h('div', { class: 'notice-body' },
      h('div', { class: 'notice-meta' },
        n.date ? h('time', {}, `${longDate(n.date)}${n.time ? ` · ${n.time} (hora SA)` : ''}`) : null,
        !seen.has(n.id) ? h('span', { class: 'tag new' }, 'Nuevo') : null,
        n.important ? h('span', { class: 'tag imp' }, 'Importante') : null),
      h('h3', {}, n.title),
      n.message ? h('p', {}, ...linkify(n.message)) : null)));
}

const SECTION_ICONS = [[/asist|seguro|salud|m[eé]dic/i, 'shield'], [/partido|rugby/i, 'ball'], [/vuelo|a[eé]re/i, 'plane'], [/aloj|hotel/i, 'bed']];
const sectionIcon = (s) => (SECTION_ICONS.find(([re]) => re.test(s)) || [null, 'info'])[1];

function renderInfo() {
  if (!data.info.length) return [emptyState('Sin información', 'Todavía no hay información cargada.', 'info')];
  const parts = [];
  const sections = [...new Set(data.info.map((i) => i.section || 'Información'))];
  sections.forEach((s) => {
    parts.push(h('div', { class: 'info-head' }, h('div', { class: 'info-ic' }, icon(sectionIcon(s))), h('h2', {}, s)));
    data.info.filter((i) => (i.section || 'Información') === s).forEach((i) => parts.push(h('section', { class: 'card info-card' },
      i.title ? h('h3', {}, i.title) : null,
      h('ul', { class: 'rows' }, i.content.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => h('li', {}, ...linkify(l)))))));
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

/* ---------- agregar a la pantalla de inicio ---------- */

// Android/Chrome instalan con un botón; en iPhone solo se pueden mostrar los pasos.
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const HIDE_DAYS = 3;
let installPrompt = null;

function showInstall(visible) {
  const hiddenAt = Number(store('gira-instalar-oculto'));
  const dismissed = hiddenAt && Date.now() - hiddenAt < HIDE_DAYS * 24 * HOUR;
  document.getElementById('install').hidden = !visible || isInstalled() || dismissed;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  showInstall(true);
});
window.addEventListener('appinstalled', () => { installPrompt = null; showInstall(false); });

document.getElementById('install-btn').addEventListener('click', async () => {
  if (installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') showInstall(false);
    installPrompt = null;
  } else {
    document.getElementById('install-dialog').showModal();
  }
});
document.getElementById('install-close').addEventListener('click', () => {
  store('gira-instalar-oculto', String(Date.now()));
  showInstall(false);
});
if (isIOS) showInstall(true);

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
if (!data) document.getElementById('view-hoy').replaceChildren(h('div', { class: 'sk sk-hero' }), h('div', { class: 'sk sk-line' }), h('div', { class: 'sk sk-card' }));
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
