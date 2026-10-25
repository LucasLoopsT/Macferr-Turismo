import { createHash, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

export interface AuthServiceOptions {
  adminPassword: string;
  jwtSecret: string;
  expiresIn: string;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

export function createAuthService(opts: AuthServiceOptions) {
  const senhaHash = sha256(opts.adminPassword);

  return {
    /** Comparação em tempo constante (compara hashes de tamanho fixo). */
    verificarSenha(candidata: unknown): boolean {
      if (typeof candidata !== 'string' || candidata.length === 0 || candidata.length > 256) return false;
      return timingSafeEqual(sha256(candidata), senhaHash);
    },

    emitirToken(): string {
      return jwt.sign({ role: 'admin' }, opts.jwtSecret, {
        algorithm: 'HS256',
        expiresIn: opts.expiresIn as jwt.SignOptions['expiresIn'],
        subject: 'admin',
      });
    },

    /** Retorna true só para token HS256 válido, não expirado, assinado com o nosso segredo. */
    verificarToken(token: string): boolean {
      try {
        const payload = jwt.verify(token, opts.jwtSecret, { algorithms: ['HS256'] });
        return typeof payload === 'object' && payload !== null && payload.role === 'admin';
      } catch {
        return false;
      }
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
