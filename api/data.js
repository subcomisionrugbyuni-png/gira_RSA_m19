import { getPublic, sendError } from '../lib/store.js';

// Pública: solo días desbloqueados, sin bloques ni avisos ocultos
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const data = await getPublic();
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=20');
    return res.status(200).json(data);
  } catch (err) {
    return sendError(res, err);
  }
}
