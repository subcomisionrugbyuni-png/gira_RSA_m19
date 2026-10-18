import { getData, saveData, normalize, photoIds, deletePhotos, isAdmin, sendError } from '../lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!(await isAdmin(req))) return res.status(401).json({ error: 'Contraseña incorrecta' });

    if (req.method === 'GET') return res.status(200).json(await getData());

    if (req.method === 'PUT') {
      const before = await getData();
      const data = normalize(req.body);
      await saveData(data);
      // Borra las fotos que se sacaron de algún día
      const keep = new Set(photoIds(data));
      await deletePhotos(photoIds(before).filter((id) => !keep.has(id)));
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return sendError(res, err);
  }
}
