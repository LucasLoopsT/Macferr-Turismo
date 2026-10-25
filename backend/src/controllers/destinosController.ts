
import type { Request, Response } from 'express';
import type { Destino } from '../types/destino';
import type { DestinoService } from '../services/destinoService';
import type { ImageService } from '../services/imageService';
import { HttpError } from '../utils/errors';
import { validateDestino } from '../utils/validate';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDestinosController(
  destinos: DestinoService,
  images: ImageService,
) {
  const paraApi = (d: Destino): Destino => ({
    ...d,
    imagem: images.paraUrlPublica(d.imagem),
    fotos: d.fotos.map((f) => images.paraUrlPublica(f)),
  });

  const normalizarFotos = async (
    fotos: string[],
  ): Promise<string[]> => {
    const out: string[] = [];

    for (const f of fotos) {
      out.push(await images.normalizar(f, 'fotos'));
    }

    return Array.from(new Set(out.filter(Boolean)));
  };

  const idDe = (req: Request): string => {
    const id = String(req.params.id ?? '');

    if (!UUID.test(id)) {
      throw new HttpError(400, 'ID inválido.');
    }

    return id;
  };

  const limparImagem = async (imagem: string) => {
    if (!imagem || !images.ehLocal(imagem)) return;
    if ((await destinos.imagensEmUso()).has(imagem)) return;

    await images.remover(imagem);
  };

  return {
    /** GET /api/destinos: compatibilidade com clientes existentes. */
    async listar(_req: Request, res: Response): Promise<void> {
      const lista = await destinos.list();

      res.json(
        lista.map(paraApi),
      );
    },

    /** GET /api/destinos/proximas */
    async listarProximas(
      _req: Request,
      res: Response,
    ): Promise<void> {
      res.json((await destinos.listProximas()).map(paraApi));
    },

    /** GET /api/destinos/realizadas */
    async listarRealizadas(
      _req: Request,
      res: Response,
    ): Promise<void> {
      res.json((await destinos.listRealizadas()).map(paraApi));
    },

    /** POST /api/admin/destinos */
    async criar(req: Request, res: Response): Promise<void> {
      const input = validateDestino(req.body, 'create');

      input.imagem = await images.normalizar(input.imagem);
      input.fotos = await normalizarFotos(input.fotos);

      const criado = await destinos.create(input);

      res.status(201).json(paraApi(criado));
    },

    /** PUT /api/admin/destinos/:id */
    async atualizar(req: Request, res: Response): Promise<void> {
      const id = idDe(req);
      const patch = validateDestino(req.body, 'update');

      if (patch.imagem !== undefined) {
        patch.imagem = await images.normalizar(patch.imagem);
      }

      if (patch.fotos !== undefined) {
        patch.fotos = await normalizarFotos(patch.fotos);
      }

      const resultado = await destinos.update(id, patch);

      if (!resultado) {
        throw new HttpError(404, 'Destino não encontrado.');
      }

      if (resultado.before.imagem !== resultado.after.imagem) {
        await limparImagem(resultado.before.imagem);
      }

      for (const f of resultado.before.fotos) {
        if (!resultado.after.fotos.includes(f)) {
          await limparImagem(f);
        }
      }

      res.json(paraApi(resultado.after));
    },

    /** DELETE /api/admin/destinos/:id */
    async excluir(req: Request, res: Response): Promise<void> {
      const removido = await destinos.remove(idDe(req));

      if (!removido) {
        throw new HttpError(404, 'Destino não encontrado.');
      }

      await limparImagem(removido.imagem);

      for (const f of removido.fotos) {
        await limparImagem(f);
      }

      res.status(204).end();
    },
  };
}
