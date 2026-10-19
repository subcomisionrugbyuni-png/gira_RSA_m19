let pw = '';
let state = null;
let dirty = false;
let tab = 'dias';
const openDays = new Set();

/* ---------- utilidades ---------- */

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = (n) => String(n).padStart(2, '0');
// Fecha y hora actuales en Sudáfrica (UTC+2)
function nowSA() {
  const d = new Date(Date.now() + 2 * 3600e3);
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}
const fmtDate = (key, opts) => (key ? new Date(`${key}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', ...opts }) : 'Sin fecha');

function session(value) {
  try {
    if (value === undefined) return sessionStorage.getItem('gira-admin') || '';
    if (value) sessionStorage.setItem('gira-admin', value); else sessionStorage.removeItem('gira-admin');
  } catch { return ''; }
}

function toast(text) {
  const el = h('div', { class: 'toast' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 3000);
}

function setDirty(v = true) {
  dirty = v;
  document.getElementById('save').disabled = !v;
  const s = document.getElementById('status');
  s.className = `status${v ? ' dirty' : ''}`;
  if (v) s.textContent = 'Cambios sin guardar';
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/* ---------- campos enlazados al estado ---------- */

function input(obj, key, attrs = {}) {
  return h('input', {
    type: 'text', ...attrs, value: obj[key] ?? '',
    oninput: (e) => { obj[key] = e.target.value; setDirty(); attrs.onchange?.(e); },
  });
}

function area(obj, key, attrs = {}) {
  return h('textarea', { rows: 3, ...attrs, value: obj[key] ?? '', oninput: (e) => { obj[key] = e.target.value; setDirty(); } });
}

function select(obj, key, options, onchange) {
  return h('select', { onchange: (e) => { obj[key] = e.target.value; setDirty(); onchange?.(e); } },
    options.map(([v, label]) => h('option', { value: v, selected: obj[key] === v }, label)));
}

function check(obj, key, label, onchange) {
  return h('label', {}, h('input', {
    type: 'checkbox', checked: !!obj[key],
    onchange: (e) => { obj[key] = e.target.checked; setDirty(); onchange?.(e); },
  }), label);
}

const field = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);

function move(arr, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  setDirty();
  render();
}

/* ---------- Días ---------- */

function dayCard(day) {
  const open = openDays.has(day.id);
  const date = day.date ? new Date(`${day.date}T12:00:00Z`) : null;
  const sw = h('label', { class: `switch${day.unlocked ? ' on' : ''}` },
    h('span', {}, day.unlocked ? 'Visible' : 'Bloqueado'),
    h('input', {
      type: 'checkbox', checked: day.unlocked,
      onchange: (e) => {
        day.unlocked = e.target.checked;
        setDirty();
        sw.classList.toggle('on', day.unlocked);
        sw.querySelector('span').textContent = day.unlocked ? 'Visible' : 'Bloqueado';
        sw.closest('.aday').classList.toggle('on', day.unlocked);
      },
    }),
    h('i'));

  return h('article', { class: `card aday${day.unlocked ? ' on' : ''}` },
    h('div', { class: 'aday-head' },
      h('button', {
        class: 'open', type: 'button',
        onclick: () => { open ? openDays.delete(day.id) : openDays.add(day.id); render(); },
      },
        h('div', { class: 'num' },
          h('span', {}, date ? date.toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '') : '—'),
          h('b', {}, date ? date.getUTCDate() : '?')),
        h('div', { class: 't' }, day.title || 'Día sin título',
          h('small', {}, `${fmtDate(day.date, { day: 'numeric', month: 'long' })} · ${day.items.length} bloques ${open ? '▴' : '▾'}`))),
      sw),
    open ? dayBody(day) : null);
}

function dayBody(day) {
  const uniforms = [['', '— Sin vestimenta —'], ...state.uniforms.map((u) => [u.id, u.name])];

  const block = (it, i) => h('div', { class: `block${it.hidden ? ' hid' : ''}` },
    h('div', { class: 'block-bar' },
      h('span', { class: 'block-n' }, `Bloque ${i + 1}`),
      h('button', { class: 'x', type: 'button', title: 'Subir', 'aria-label': 'Subir bloque', disabled: i === 0, onclick: () => move(day.items, i, -1) }, '↑'),
      h('button', { class: 'x', type: 'button', title: 'Bajar', 'aria-label': 'Bajar bloque', disabled: i === day.items.length - 1, onclick: () => move(day.items, i, 1) }, '↓'),
      h('button', {
        class: 'x', type: 'button', title: 'Borrar bloque',
        onclick: () => { if (confirm(`¿Borrar "${it.activity || 'este bloque'}"?`)) { day.items.splice(i, 1); setDirty(); render(); } },
      }, '✕')),
    h('div', { class: 'row two' },
      field('Desde', input(it, 'from', { type: 'time' })),
      field('Hasta', input(it, 'to', { type: 'time' }))),
    field('Actividad', input(it, 'activity', { placeholder: 'Ej.: Desayuno buffet' })),
    field('Lugar', input(it, 'place')),
    h('div', { class: 'row two' },
      field('Vestimenta', select(it, 'uniform', uniforms)),
      field('Zona horaria', select(it, 'zone', [['SA', 'Hora SA'], ['AR', 'Hora AR']]))),
    field('Detalle / explicación', area(it, 'detail', { rows: 2 })),
    field('Link de mapa (opcional)', input(it, 'map', { type: 'url', placeholder: 'https://maps.google.com/…' })),
    h('div', { class: 'checks' },
      check(it, 'confirmed', 'Confirmado'),
      check(it, 'hidden', 'Oculto', (e) => e.target.closest('.block').classList.toggle('hid', e.target.checked))));

  const last = day.items[day.items.length - 1];
  return h('div', { class: 'aday-body' },
    h('div', { class: 'row' },
      field('Fecha', input(day, 'date', { type: 'date' })),
      field('Título del día', input(day, 'title', { placeholder: 'Ej.: Ciudad del Cabo · 2.º partido' }))),

    h('h3', { class: 'h' }, 'Cronograma'),
    day.items.map(block),
    h('button', {
      class: 'btn add', type: 'button',
      onclick: () => {
        day.items.push({ id: uid(), from: '', to: '', zone: last?.zone || 'SA', activity: '', place: last?.place || '', uniform: '', detail: '', map: '', confirmed: true, hidden: false });
        setDirty(); render();
      },
    }, '+ Agregar bloque'),

    h('h3', { class: 'h' }, 'Recomendaciones'),
    day.tips.map((t, i) => h('div', { class: 'line' },
      h('input', { type: 'text', value: t, oninput: (e) => { day.tips[i] = e.target.value; setDirty(); } }),
      h('button', { class: 'x', type: 'button', onclick: () => { day.tips.splice(i, 1); setDirty(); render(); } }, '✕'))),
    h('button', { class: 'btn add', type: 'button', onclick: () => { day.tips.push(''); setDirty(); render(); } }, '+ Agregar recomendación'),

    h('h3', { class: 'h' }, 'Fotos'),
    h('div', { class: 'aphotos' }, day.photos.map((p, i) => h('div', { class: 'aphoto' },
      h('img', { src: `/api/photo?id=${encodeURIComponent(p.id)}`, alt: '' }),
      h('button', { class: 'x', type: 'button', title: 'Quitar foto', onclick: () => { day.photos.splice(i, 1); setDirty(); render(); } }, '✕'),
      input(p, 'caption', { placeholder: 'Epígrafe (opcional)' })))),
    h('label', { class: 'btn add upload' }, '+ Subir fotos',
      h('input', { type: 'file', accept: 'image/*', multiple: true, onchange: (e) => uploadPhotos(day, e.target) })),

    h('h3', { class: 'h' }, 'Notas'),
    area(day, 'notes', { rows: 3, placeholder: 'Texto libre para el día (opcional)' }),

    h('div', { class: 'footer-actions' },
      h('button', {
        class: 'btn danger', type: 'button',
        onclick: () => {
          if (!confirm(`¿Borrar el día "${day.title || day.date}" con todo su contenido?`)) return;
          state.days.splice(state.days.indexOf(day), 1);
          setDirty(); render();
        },
      }, 'Borrar día'),
      h('button', { class: 'btn', type: 'button', onclick: () => { openDays.delete(day.id); render(); } }, 'Cerrar')));
}

function renderDias() {
  state.days.sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const visible = state.days.filter((d) => d.unlocked).length;
  return [
    h('p', { class: 'hint' }, `Activá el interruptor para desbloquear un día en la app (${visible} de ${state.days.length} visibles). Los bloques marcados como "Oculto" no se muestran aunque el día esté visible. Los horarios se cargan en hora de Sudáfrica (SA) o de Argentina (AR). Con ↑ ↓ cambiás el orden de los bloques; la app muestra ese mismo orden. No te olvides de tocar "Guardar".`),
    state.days.map(dayCard),
    h('button', {
      class: 'btn add', type: 'button',
      onclick: () => {
        const last = state.days[state.days.length - 1];
        let date = '';
        if (last?.date) { const d = new Date(`${last.date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); date = d.toISOString().slice(0, 10); }
        const day = { id: uid(), date, title: '', unlocked: false, items: [], tips: [], photos: [], notes: '' };
        state.days.push(day);
        openDays.add(day.id);
        setDirty(); render();
      },
    }, '+ Agregar día'),
  ];
}

// Achica la foto en el celular antes de subirla
function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

async function uploadPhotos(day, inputEl) {
  const files = [...inputEl.files];
  inputEl.value = '';
  for (const [i, file] of files.entries()) {
    try {
      toast(`Subiendo foto ${i + 1} de ${files.length}…`);
      const { id } = await api('/api/photo', { method: 'POST', body: JSON.stringify({ data: await compress(file) }) });
      day.photos.push({ id, caption: '' });
      setDirty(); render();
    } catch (err) {
      toast(`No se pudo subir ${file.name}: ${err.message}`);
    }
  }
  if (files.length) toast('Fotos subidas. Tocá "Guardar" para publicarlas.');
}

/* ---------- Avisos ---------- */

function renderAvisos() {
  state.notices.sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  return [
    h('p', { class: 'hint' }, 'Los avisos se muestran en la pestaña Avisos, el más nuevo primero. Si marcás "Importante" queda fijado arriba de todo en Hoy durante 36 horas desde la fecha y hora del aviso (hora de Sudáfrica).'),
    h('button', {
      class: 'btn add', type: 'button', style: 'margin-bottom:12px',
      onclick: () => { state.notices.unshift({ id: uid(), ...nowSA(), title: '', message: '', important: false, hidden: false }); setDirty(); render(); },
    }, '+ Nuevo aviso'),
    state.notices.map((n, i) => h('article', { class: `card${n.hidden ? ' hid' : ''}` },
      h('div', { class: 'block-head' },
        h('div', { class: 'row', style: 'grid-template-columns:1fr 1fr' },
          field('Fecha', input(n, 'date', { type: 'date' })),
          field('Hora (SA)', input(n, 'time', { type: 'time' }))),
        h('button', { class: 'x', type: 'button', onclick: () => { if (confirm('¿Borrar este aviso?')) { state.notices.splice(i, 1); setDirty(); render(); } } }, '✕')),
      field('Título', input(n, 'title')),
      field('Mensaje', area(n, 'message')),
      h('div', { class: 'checks' }, check(n, 'important', 'Importante (fijar en Hoy)'), check(n, 'hidden', 'Oculto')))),
  ];
}

/* ---------- Info ---------- */

function renderInfo() {
  return [
    h('p', { class: 'hint' }, 'Información útil que se ve en la pestaña Info, agrupada por sección y en este orden. Los links y correos se vuelven clicables. No cargues datos personales: la app es pública.'),
    state.info.map((it, i) => h('article', { class: 'card' },
      h('div', { class: 'block-head' },
        h('div', { class: 'row', style: 'grid-template-columns:1fr' }, field('Sección', input(it, 'section', { placeholder: 'Ej.: Alojamiento' }))),
        h('button', { class: 'x', type: 'button', title: 'Subir', onclick: () => move(state.info, i, -1) }, '↑'),
        h('button', { class: 'x', type: 'button', title: 'Bajar', onclick: () => move(state.info, i, 1) }, '↓'),
        h('button', { class: 'x', type: 'button', title: 'Borrar', onclick: () => { if (confirm('¿Borrar esta información?')) { state.info.splice(i, 1); setDirty(); render(); } } }, '✕')),
      field('Título', input(it, 'title')),
      field('Contenido', area(it, 'content', { rows: 5 })))),
    h('button', {
      class: 'btn add', type: 'button',
      onclick: () => { state.info.push({ id: uid(), section: '', title: '', content: '' }); setDirty(); render(); },
    }, '+ Agregar información'),
  ];
}

/* ---------- Vestimenta ---------- */

function renderVestimenta() {
  return [
    h('p', { class: 'hint' }, 'Vestimentas que se eligen en cada bloque del cronograma. En la app se ve solo el nombre.'),
    state.uniforms.map((u, i) => h('article', { class: 'card' },
      h('div', { class: 'block-head' },
        h('div', { class: 'row', style: 'grid-template-columns:1fr' }, field('Nombre', input(u, 'name'))),
        h('button', {
          class: 'x', type: 'button',
          onclick: () => {
            const uses = state.days.reduce((n, d) => n + d.items.filter((it) => it.uniform === u.id).length, 0);
            if (!confirm(uses ? `"${u.name}" se usa en ${uses} bloques, que van a quedar sin vestimenta. ¿Borrar igual?` : `¿Borrar "${u.name}"?`)) return;
            state.uniforms.splice(i, 1);
            state.days.forEach((d) => d.items.forEach((it) => { if (it.uniform === u.id) it.uniform = ''; }));
            setDirty(); render();
          },
        }, '✕')),
    )),
    h('button', {
      class: 'btn add', type: 'button',
      onclick: () => { state.uniforms.push({ id: uid(), name: 'Nueva vestimenta' }); setDirty(); render(); },
    }, '+ Agregar vestimenta'),
  ];
}

/* ---------- General ---------- */

function renderGeneral() {
  return [
    h('article', { class: 'card' },
      field('Título de la app', input(state.trip, 'title')),
      field('Subtítulo', input(state.trip, 'subtitle')),
      h('div', { class: 'row' },
        field('Inicio de la gira', input(state.trip, 'start', { type: 'date' })),
        field('Fin de la gira', input(state.trip, 'end', { type: 'date' })))),
    h('p', { class: 'hint' }, 'Antes del inicio la app muestra la cuenta regresiva y, después del fin, "La gira terminó". Para probar cómo se ve en un momento dado abrí la app con ?ahora=2026-11-17T10:30 al final del link (hora de Sudáfrica).'),
    h('button', {
      class: 'btn danger', type: 'button',
      onclick: () => { pw = ''; session(''); location.reload(); },
    }, 'Cerrar sesión'),
  ];
}

/* ---------- render y guardado ---------- */

function render() {
  const builders = { dias: renderDias, avisos: renderAvisos, info: renderInfo, vestimenta: renderVestimenta, general: renderGeneral };
  const y = window.scrollY;
  document.getElementById('panel').replaceChildren(...builders[tab]().flat(Infinity).filter(Boolean));
  window.scrollTo(0, y);
}

async function save() {
  const btn = document.getElementById('save');
  btn.disabled = true;
  const status = document.getElementById('status');
  status.textContent = 'Guardando…';
  try {
    state = await api('/api/admin', { method: 'PUT', body: JSON.stringify(state) });
    setDirty(false);
    status.className = 'status ok';
    status.textContent = `Guardado ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    render();
  } catch (err) {
    setDirty(true);
    status.textContent = `Error: ${err.message}`;
    if (err.status === 401) toast('La contraseña cambió. Volvé a entrar.');
  }
}

async function login(password) {
  pw = password;
  const errorEl = document.getElementById('login-error');
  errorEl.hidden = true;
  try {
    state = await api('/api/admin');
    session(pw);
    document.getElementById('login').hidden = true;
    document.getElementById('editor').hidden = false;
    render();
  } catch (err) {
    session('');
    errorEl.textContent = err.status === 401 ? 'Contraseña incorrecta' : err.message;
    errorEl.hidden = false;
  }
}

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  login(document.getElementById('password').value);
});
document.getElementById('save').addEventListener('click', save);
document.getElementById('admin-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  tab = b.dataset.tab;
  document.querySelectorAll('#admin-tabs button').forEach((x) => x.toggleAttribute('aria-current', x === b));
  b.setAttribute('aria-current', 'page');
  window.scrollTo(0, 0);
  render();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (dirty) save(); }
});
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

if (session()) login(session());
