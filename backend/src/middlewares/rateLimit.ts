import type { NextFunction, Request, Response } from 'express';

export interface LoginLimiterOptions {
  /** Falhas permitidas por IP dentro da janela. */
  max: number;
  windowMs: number;
  now?: () => number;
}

/**
 * Limitador em memória para tentativas de login: só conta FALHAS.
 * Após `max` falhas na janela, o IP recebe 429 até a janela expirar.
 */
export function createLoginLimiter(opts: LoginLimiterOptions) {
  const now = opts.now ?? Date.now;
  const falhas = new Map<string, { count: number; expira: number }>();

  const atual = (chave: string) => {
    const f = falhas.get(chave);
    if (f && f.expira <= now()) {
      falhas.delete(chave);
      return undefined;
    }
    return f;
  };

  return {
    middleware(req: Request, res: Response, next: NextFunction): void {
      const f = atual(req.ip ?? 'desconhecido');
      if (f && f.count >= opts.max) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((f.expira - now()) / 1000))));
        res.status(429).json({ erro: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.' });
        return;
      }
      next();
    },
    registrarFalha(chave: string): void {
      const f = atual(chave);
      if (f) f.count++;
      else falhas.set(chave, { count: 1, expira: now() + opts.windowMs });
      if (falhas.size > 5000) for (const [k, v] of falhas) if (v.expira <= now()) falhas.delete(k);
    },
    limpar(chave: string): void {
      falhas.delete(chave);
    },
  };
}

export type LoginLimiter = ReturnType<typeof createLoginLimiter>;
