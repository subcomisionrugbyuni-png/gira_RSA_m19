import crypto from 'node:crypto';
import { SEED } from './seed.js';

// Contraseña del panel /administrador (se puede pisar con la variable ADMIN_PASSWORD en Vercel)
const ADMIN_PASSWORD = 'LaU1907';

const DATA_KEY = 'gira:data';
const PHOTO_PREFIX = 'gira:photo:';

export class ConfigError extends Error {}

// Upstash Redis via REST: la integración de Vercel crea KV_REST_API_*,
// una base creada a mano en Upstash usa UPSTASH_REDIS_REST_*.
export async function redis(...command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new ConfigError('Falta conectar la base de datos (Upstash Redis) en Vercel.');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

export async function getData() {
  const raw = await redis('GET', DATA_KEY);
  return raw ? JSON.parse(raw) : structuredClone(SEED);
}

export async function saveData(data) {
  await redis('SET', DATA_KEY, JSON.stringify(data));
}

export async function getPhoto(id) {
  const raw = await redis('GET', PHOTO_PREFIX + id);
  return raw ? JSON.parse(raw) : null;
}

export async function savePhoto(id, photo) {
  await redis('SET', PHOTO_PREFIX + id, JSON.stringify(photo));
}

export async function deletePhotos(ids) {
  if (ids.length) await redis('DEL', ...ids.map((id) => PHOTO_PREFIX + id));
}

export function photoIds(data) {
  return (data.days || []).flatMap((d) => (d.photos || []).map((p) => p.id));
}

export async function isAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD;
  const given = String(req.headers['x-admin-password'] || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (crypto.timingSafeEqual(a, b)) return true;
  // Frena intentos de adivinar la contraseña
  await new Promise((r) => setTimeout(r, 800));
  return false;
}

export function sendError(res, err) {
  if (err instanceof ConfigError) return res.status(503).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: 'Error del servidor' });
}

const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const list = (v) => (Array.isArray(v) ? v : []);
const ID_RE = /^[a-zA-Z0-9-]{1,64}$/;
const id = (v) => (ID_RE.test(v) ? v : crypto.randomUUID());
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const time = (v) => (/^\d{2}:\d{2}$/.test(v) ? v : '');
const url = (v) => (/^https?:\/\//i.test(str(v)) ? str(v, 1000) : '');

// Limpia lo que manda el panel para guardar siempre la misma forma
export function normalize(input) {
  const uniforms = list(input?.uniforms)
    .map((u) => ({ id: id(u?.id), name: str(u?.name, 120), items: str(u?.items), detail: str(u?.detail) }))
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
      }))
      .filter((it) => it.activity || it.from),
    tips: list(d?.tips).map((t) => str(t, 1000)).filter(Boolean),
    photos: list(d?.photos)
      .filter((p) => ID_RE.test(p?.id))
      .map((p) => ({ id: p.id, caption: str(p?.caption, 300) })),
    notes: str(d?.notes, 5000),
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
