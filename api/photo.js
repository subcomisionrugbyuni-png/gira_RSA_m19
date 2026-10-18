import crypto from 'node:crypto';
import { getPhoto, savePhoto, isAdmin, sendError } from '../lib/store.js';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 3 * 1024 * 1024;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '');
      const photo = /^[a-zA-Z0-9-]{1,64}$/.test(id) ? await getPhoto(id) : null;
      if (!photo) return res.status(404).send('No encontrada');
      res.setHeader('Content-Type', photo.type);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.status(200).send(Buffer.from(photo.data, 'base64'));
    }

    if (req.method === 'POST') {
      if (!(await isAdmin(req))) return res.status(401).json({ error: 'Contraseña incorrecta' });
      const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(req.body?.data || ''));
      if (!match || !TYPES.includes(match[1])) return res.status(400).json({ error: 'Formato de imagen no válido' });
      if (Buffer.byteLength(match[2], 'base64') > MAX_BYTES) return res.status(413).json({ error: 'La foto es demasiado pesada' });
      const id = crypto.randomUUID();
      await savePhoto(id, { type: match[1], data: match[2] });
      return res.status(200).json({ id });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return sendError(res, err);
  }
}
