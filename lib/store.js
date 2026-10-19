import crypto from 'node:crypto';
import { SEED } from './seed.js';


// Supabase: la URL y la clave publishable son públicas por diseño.
// La contraseña del panel la verifica la base (supabase/migrations/*.sql).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gvokucecvdhjhwvktlut.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_qpCVHWyd44TdleK__0rQ1Q_prxdmyCu';

export class AuthError extends Error {}

async function rpc(fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) {
    if (text.includes('clave_incorrecta')) {
      await new Promise((r) => setTimeout(r, 800)); // frena intentos de adivinar
      throw new AuthError('Contraseña incorrecta');
    }
    throw new Error(`Supabase ${fn}: ${res.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

// Lo que ve la app: solo días desbloqueados, sin bloques ni avisos ocultos
export function publicView(data) {
  return {
    trip: data.trip,
    uniforms: data.uniforms,
    days: data.days
      .filter((d) => d.unlocked)
      .map(({ unlocked, ...d }) => ({ ...d, items: d.items.filter((it) => !it.hidden).map(({ hidden, ...it }) => it) })),
    notices: data.notices.filter((n) => !n.hidden).map(({ hidden, ...n }) => n),
    info: data.info,
    updatedAt: data.updatedAt || null,
  };
}

export async function getPublic() {
  return (await rpc('leer_publico')) || publicView(SEED);
}

export async function getAdminData(clave) {
  return (await rpc('leer_admin', { clave })) || structuredClone(SEED);
}

export async function saveData(clave, data) {
  await rpc('guardar', { clave, datos: data, publico: publicView(data) });
}

export async function getPhoto(id) {
  return rpc('leer_foto', { foto: id });
}

export async function savePhoto(clave, tipo, datos) {
  return rpc('subir_foto', { clave, tipo, datos });
}

export async function deletePhotos(clave, ids) {
  if (ids.length) await rpc('borrar_fotos', { clave, ids });
}

export function photoIds(data) {
  return (data.days || []).flatMap((d) => (d.photos || []).map((p) => p.id));
}

export const passwordOf = (req) => String(req.headers['x-admin-password'] || '');

export function sendError(res, err) {
  if (err instanceof AuthError) return res.status(401).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: 'No se pudo conectar con la base de datos' });
}

const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const list = (v) => (Array.isArray(v) ? v : []);
const ID_RE = /^[a-zA-Z0-9-]{1,64}$/;
const id = (v) => (ID_RE.test(v) ? v : crypto.randomUUID());
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const time = (v) => (/^\d{2}:\d{2}$/.test(v) ? v : '');
// Imagen de destino: id del catálogo, 'none' (sin imagen) o '' (automática)
const image = (v) => (v === 'none' || /^[a-z0-9-]{1,40}$/.test(v) ? v : '');
const url = (v) => (/^https?:\/\//i.test(str(v)) ? str(v, 1000) : '');

// Limpia lo que manda el panel para guardar siempre la misma forma
export function normalize(input) {
  const uniforms = list(input?.uniforms)
    .map((u) => ({ id: id(u?.id), name: str(u?.name, 120) }))
    .filter((u) => u.name);
  const uniformIds = new Set(uniforms.map((u) => u.id));

  const days = list(input?.days).map((d) => ({
    id: id(d?.id),
    date: date(d?.date),
    title: str(d?.title, 200),
    unlocked: d?.unlocked === true,
    items: list(d?.items)
      .map((it) => ({
        id: id(it?.id),
        from: time(it?.from),
        to: time(it?.to),
        zone: it?.zone === 'AR' ? 'AR' : 'SA',
        activity: str(it?.activity, 300),
        place: str(it?.place, 200),
        uniform: uniformIds.has(it?.uniform) ? it.uniform : '',
        detail: str(it?.detail),
        map: url(it?.map),
        confirmed: it?.confirmed !== false,
        hidden: it?.hidden === true,
        image: image(it?.image),
      }))
      .filter((it) => it.activity || it.from),
    tips: list(d?.tips).map((t) => str(t, 1000)).filter(Boolean),
    photos: list(d?.photos)
      .filter((p) => ID_RE.test(p?.id))
      .map((p) => ({ id: p.id, caption: str(p?.caption, 300) })),
    notes: str(d?.notes, 5000),
    image: image(d?.image),
  }));
  days.sort((a, b) => a.date.localeCompare(b.date));

  const notices = list(input?.notices)
    .map((n) => ({
      id: id(n?.id),
      date: date(n?.date),
      time: time(n?.time),
      title: str(n?.title, 200),
      message: str(n?.message, 3000),
      important: n?.important === true,
      hidden: n?.hidden === true,
    }))
    .filter((n) => n.title || n.message);

  const info = list(input?.info)
    .map((i) => ({ id: id(i?.id), section: str(i?.section, 80), title: str(i?.title, 200), content: str(i?.content, 8000) }))
    .filter((i) => i.title || i.content);

  const t = input?.trip || {};
  return {
    trip: {
      title: str(t.title, 120) || SEED.trip.title,
      subtitle: str(t.subtitle, 200),
      start: date(t.start) || SEED.trip.start,
      end: date(t.end) || SEED.trip.end,
    },
    uniforms,
    days,
    notices,
    info,
    updatedAt: new Date().toISOString(),
  };
}
