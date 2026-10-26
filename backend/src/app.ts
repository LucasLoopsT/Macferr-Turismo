import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Config } from './config/env';
import { createApiRouter } from './routes';
import { createAuthService } from './services/authService';
import { createDestinoService } from './services/destinoService';
import { createDestinoStore } from './services/destinoStoreFactory';
import type { DestinoStore } from './services/destinoStore';
import { createImageService } from './services/imageService';
import { createResendMailer, type Mailer } from './services/mailService';
import { createTwoFactorService } from './services/twoFactorService';
import { errorHandler, notFound } from './middlewares/errorHandler';
import { requestLogger } from './middlewares/requestLogger';

/**
 * `overrides.mailer` permite trocar o envio de e-mail e `overrides.store` o armazenamento dos destinos (testes).
 * Em produção: Resend para o 2FA e o arquivo de destinos no GitHub.
 */
export function createServices(config: Config, overrides: { mailer?: Mailer; store?: DestinoStore } = {}) {
  const mailer =
    overrides.mailer ?? (config.twoFactor.enabled ? createResendMailer({ apiKey: config.twoFactor.apiKey, from: config.twoFactor.from }) : null);

  return {
    auth: createAuthService({ adminPassword: config.adminPassword, jwtSecret: config.jwtSecret, expiresIn: config.jwtExpiresIn }),
    destinos: createDestinoService({ store: overrides.store ?? createDestinoStore(config) }),
    images: createImageService({ uploadDir: config.uploadDir, publicBaseUrl: config.publicBaseUrl, maxBytes: config.maxUploadBytes }),
    /** null = 2FA desligado (só possível fora de produção). */
    twoFactor:
      config.twoFactor.enabled && mailer
        ? createTwoFactorService({ dataDir: config.dataDir, jwtSecret: config.jwtSecret, mailer, destinatario: config.twoFactor.email, exporMotivo: config.nodeEnv !== 'production' })
        : null,
  };
}

export type Services = ReturnType<typeof createServices>;

export function createApp(config: Config, services: Services = createServices(config)): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // atrás do proxy do Render: req.ip passa a ser o IP real do cliente

  if (config.logRequests) app.use(requestLogger());

  // CORP "cross-origin": o frontend (outro domínio) precisa conseguir exibir as imagens de /uploads.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const permitidas = new Set(config.corsOrigins);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || permitidas.has(origin)),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Imagens enviadas. Os nomes são UUIDs imutáveis, então o cache longo é seguro.
  app.use('/uploads', express.static(config.uploadDir, { index: false, dotfiles: 'deny', maxAge: '30d', immutable: true }));

  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createApiRouter({ ...services, emailDestino: config.twoFactor.email, maxUploadBytes: config.maxUploadBytes }));

  app.use(notFound);
  app.use(errorHandler());
  return app;
}
