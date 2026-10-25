
import express, { Router } from 'express';
import type { AuthService } from '../services/authService';
import type { DestinoService } from '../services/destinoService';
import type { ImageService } from '../services/imageService';
import type { TwoFactorService } from '../services/twoFactorService';
import { MIMES_PERMITIDOS } from '../services/imageService';
import { authenticate } from '../middlewares/authenticate';
import { createLoginLimiter } from '../middlewares/rateLimit';
import { createAuthController } from '../controllers/authController';
import { createDestinosController } from '../controllers/destinosController';
import { createUploadController } from '../controllers/uploadController';
import { asyncHandler } from '../utils/asyncHandler';

export interface RouterDeps {
  auth: AuthService;
  destinos: DestinoService;
  images: ImageService;
  twoFactor: TwoFactorService | null;
  emailDestino: string;
  maxUploadBytes: number;
}

/** Monta /api. Tudo sob /api/admin exige JWT, exceto o login. */
export function createApiRouter(deps: RouterDeps): Router {
  const api = Router();
  const limiter = createLoginLimiter({
    max: 10,
    windowMs: 15 * 60 * 1000,
  });
  const verifyLimiter = createLoginLimiter({ max: 20, windowMs: 15 * 60 * 1000 });
  const authCtl = createAuthController({ auth: deps.auth, limiter, verifyLimiter, twoFactor: deps.twoFactor, emailDestino: deps.emailDestino });
  const destinosCtl = createDestinosController(
    deps.destinos,
    deps.images,
  );
  const uploadCtl = createUploadController(deps.images);

  // Rotas públicas.
  api.get('/destinos', asyncHandler(destinosCtl.listar));
  api.get('/destinos/proximas', asyncHandler(destinosCtl.listarProximas),);
  api.get('/destinos/realizadas', asyncHandler(destinosCtl.listarRealizadas),);
  // Etapa 1: senha. Com 2FA ligado devolve um desafio (e envia o código por e-mail); sem 2FA devolve o token.
  api.post('/admin/login', limiter.middleware, asyncHandler(authCtl.login));
  // Etapa 2: código recebido por e-mail. Só aqui o JWT é emitido quando o 2FA está ligado.
  api.post('/admin/login/verificar', verifyLimiter.middleware, asyncHandler(authCtl.verificar));

  // Rotas administrativas protegidas.
  const admin = Router();

  admin.use(authenticate(deps.auth));

  admin.post('/destinos', asyncHandler(destinosCtl.criar));
  admin.put('/destinos/:id', asyncHandler(destinosCtl.atualizar));
  admin.delete('/destinos/:id', asyncHandler(destinosCtl.excluir));

  admin.post(
    '/upload',
    express.raw({
      type: [...MIMES_PERMITIDOS],
      limit: deps.maxUploadBytes,
    }),
    asyncHandler(uploadCtl.enviar),
  );

  api.use('/admin', admin);

  return api;
}
