import type { Request, Response } from 'express';
import type { ImageService } from '../services/imageService';
import { HttpError } from '../utils/errors';

export function createUploadController(images: ImageService) {
  return {
    /**
     * POST /api/admin/upload (protegido)
     * Corpo = bytes da imagem, com Content-Type image/jpeg|png|webp|gif.
     * Responde 201 { url, path }. Use `url` no campo `imagem` do destino.
     */
    async enviar(req: Request, res: Response): Promise<void> {
      if (!Buffer.isBuffer(req.body)) {
        throw new HttpError(415, 'Envie a imagem no corpo da requisição com Content-Type image/jpeg, image/png, image/webp ou image/gif.');
      }
      const mime = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      const { url, path } = await images.salvar(req.body, mime);
      res.status(201).json({ url, path });
    },
  };
}
