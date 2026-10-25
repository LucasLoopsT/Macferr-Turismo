import type { NextFunction, Request, Response } from 'express';

/** Log de uma linha por requisição. Registra só método, caminho (sem query), status e duração: nunca cabeçalhos nem corpo. */
export function requestLogger(log: (msg: string) => void = console.log) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const inicio = Date.now();
    res.on('finish', () => log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - inicio}ms`));
    next();
  };
}
