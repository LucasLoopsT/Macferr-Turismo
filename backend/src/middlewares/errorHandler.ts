import type { NextFunction, Request, Response } from 'express';
import { HttpError, StorageError } from '../utils/errors';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ erro: 'Rota não encontrada.' });
}

/**
 * Último middleware. Erros esperados viram respostas 4xx claras; qualquer outro erro vira 500 genérico.
 * Stack trace e mensagens internas só vão para o log do servidor, nunca para o cliente.
 */
export function errorHandler(opts: { log?: (msg: string) => void } = {}) {
  const log = opts.log ?? ((m: string) => console.error(m));

  return (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) return next(err);

    if (err instanceof HttpError) {
      if (err.retryAfterSeg) res.set('Retry-After', String(err.retryAfterSeg));
      res.status(err.status).json(err.detalhes ? { erro: err.message, detalhes: err.detalhes } : { erro: err.message });
      return;
    }

    // Erros do body-parser do Express (JSON malformado, corpo grande demais...)
    const e = err as { type?: string; status?: number };
    if (e?.type === 'entity.too.large') {
      res.status(413).json({ erro: 'Corpo da requisição maior que o limite permitido.' });
      return;
    }
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ erro: 'JSON inválido.' });
      return;
    }
    if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500) {
      res.status(e.status).json({ erro: 'Requisição inválida.' });
      return;
    }

    log(err instanceof StorageError ? `[storage] ${err.message}` : `[erro] ${(err as Error)?.stack ?? String(err)}`);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  };
}
