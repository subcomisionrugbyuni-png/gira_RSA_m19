import { getData, sendError } from '../lib/store.js';

// Pública: solo días desbloqueados, sin bloques ni avisos ocultos
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const data = await getData();
    const days = data.days
      .filter((d) => d.unlocked)
      .map(({ unlocked, ...d }) => ({ ...d, items: d.items.filter((it) => !it.hidden).map(({ hidden, ...it }) => it) }));
    const notices = data.notices.filter((n) => !n.hidden).map(({ hidden, ...n }) => n);
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=20');
    return res.status(200).json({
      trip: data.trip,
      uniforms: data.uniforms,
      days,
      notices,
      info: data.info,
      updatedAt: data.updatedAt || null,
    });
  } catch (err) {
    return sendError(res, err);
  }
}
