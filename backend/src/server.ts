import 'dotenv/config';
import { ConfigError, loadConfig } from './config/env';
import { createApp, createServices } from './app';
import { verificarSdkResend } from './services/mailService';

const UM_DIA = 24 * 60 * 60 * 1000;

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }

  // 2FA ligado depende do pacote "resend": se não estiver instalado, falha já na inicialização, com instrução clara,
  // em vez de só errar na hora do login.
  if (config.twoFactor.enabled) {
    try {
      await verificarSdkResend();
    } catch (e) {
      console.error(`Falha ao iniciar: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  const services = createServices(config);
  await services.destinos.init();

  // Remove uploads abandonados (enviados mas nunca salvos em um destino) com mais de 24h.
  services.destinos
    .imagensEmUso()
    .then((emUso) => services.images.limparOrfaos(emUso, UM_DIA))
    .then((n) => n > 0 && console.log(`[uploads] ${n} arquivo(s) órfão(s) removido(s).`))
    .catch((e) => console.error('[uploads] limpeza ignorada:', (e as Error).message));

  const app = createApp(config, services);
  const server = app.listen(config.port, () => {
    console.log(`API no ar na porta ${config.port} (${config.nodeEnv}).`);
    console.log(`Destinos em: ${services.destinos.file}${services.destinos.remoto ? ' (GitHub)' : ''}`);
    console.log(`Uploads em: ${config.uploadDir}`);
    console.log(
      services.twoFactor
        ? `2FA por e-mail: ATIVO (estado em ${services.twoFactor.file})`
        : '2FA por e-mail: DESLIGADO (só permitido fora de produção; defina RESEND_API_KEY e ADMIN_2FA_EMAIL para ativar)',
    );
  });

  const encerrar = () => server.close(() => process.exit(0));
  process.on('SIGTERM', encerrar);
  process.on('SIGINT', encerrar);
}

main().catch((e) => {
  console.error('Falha ao iniciar:', (e as Error).message);
  process.exit(1);
});
