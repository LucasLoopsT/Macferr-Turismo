import type { Request, Response } from 'express';
import type { AuthService } from '../services/authService';
import type { TwoFactorService } from '../services/twoFactorService';
import type { LoginLimiter } from '../middlewares/rateLimit';
import { HttpError } from '../utils/errors';

export interface AuthControllerDeps {
  auth: AuthService;
  /** Limita senhas erradas por IP. */
  limiter: LoginLimiter;
  /** Limita códigos errados por IP (além do limite por código, que fica no serviço). */
  verifyLimiter: LoginLimiter;
  /** null = 2FA desligado: o login devolve o token direto (só permitido fora de produção). */
  twoFactor: TwoFactorService | null;
  emailDestino?: string;
}

/** "maria@gmail.com" -> "m***@gmail.com" (dica para o usuário saber onde olhar, sem expor o e-mail inteiro). */
export function mascararEmail(email: string): string {
  const [local, dominio] = email.split('@');
  if (!dominio) return '';
  return `${local.slice(0, 1)}***@${dominio}`;
}

export function createAuthController(deps: AuthControllerDeps) {
  const { auth, limiter, verifyLimiter, twoFactor } = deps;

  return {
    /**
     * POST /api/admin/login  { password }
     *  - 2FA desligado: 200 { token }
     *  - 2FA ligado:    200 { etapa: "codigo", desafio, expiraEm, reenviarEm, email }  (sem token)
     */
    async login(req: Request, res: Response): Promise<void> {
      const password = (req.body as { password?: unknown } | undefined)?.password;
      if (typeof password !== 'string' || password.length === 0) {
        throw new HttpError(400, 'Informe a senha.');
      }
      const chave = req.ip ?? 'desconhecido';
      if (!auth.verificarSenha(password)) {
        limiter.registrarFalha(chave);
        throw new HttpError(401, 'Senha incorreta.');
      }
      limiter.limpar(chave);

      if (!twoFactor) {
        res.json({ token: auth.emitirToken() });
        return;
      }
      const { desafio } = await twoFactor.solicitar();
      res.json({
        etapa: 'codigo',
        desafio,
        expiraEm: twoFactor.ttlSegundos,
        reenviarEm: twoFactor.cooldownSegundos,
        email: mascararEmail(deps.emailDestino ?? ''),
      });
    },

    /** POST /api/admin/login/verificar  { desafio, codigo } -> { token } */
    async verificar(req: Request, res: Response): Promise<void> {
      if (!twoFactor) throw new HttpError(404, 'Rota não encontrada.');
      const body = (req.body ?? {}) as { desafio?: unknown; codigo?: unknown };
      if (typeof body.desafio !== 'string' || !body.desafio || body.desafio.length > 128 || typeof body.codigo !== 'string') {
        throw new HttpError(400, 'Informe o código de 6 dígitos.');
      }
      const chave = req.ip ?? 'desconhecido';
      try {
        await twoFactor.verificar(body.desafio, body.codigo.replace(/\s+/g, ''));
      } catch (e) {
        if (e instanceof HttpError && (e.status === 401 || e.status === 429)) verifyLimiter.registrarFalha(chave);
        throw e;
      }
      verifyLimiter.limpar(chave);
      res.json({ token: auth.emitirToken() });
    },
  };
}
