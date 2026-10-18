import { getAdminData, saveData, normalize, photoIds, deletePhotos, passwordOf, sendError } from '../lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const clave = passwordOf(req);
  try {
    if (req.method === 'GET') return res.status(200).json(await getAdminData(clave));

    if (req.method === 'PUT') {
      const before = await getAdminData(clave);
      const data = normalize(req.body);
      await saveData(clave, data);
      // Borra las fotos que se sacaron de algún día
      const keep = new Set(photoIds(data));
      await deletePhotos(clave, photoIds(before).filter((id) => !keep.has(id)));
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return sendError(res, err);
  }
}
