import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from '../services/authService';

/** Exige `Authorization: Bearer <jwt>` válido. Ausente, malformado, inválido ou expirado resulta em 401. */
export function authenticate(auth: AuthService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    const m = /^Bearer\s+(\S+)$/i.exec(header);
    if (!m || !auth.verificarToken(m[1])) {
      res.set('WWW-Authenticate', 'Bearer');
      res.status(401).json({ erro: 'Não autorizado. Faça login novamente.' });
      return;
    }
    next();
  };
}
