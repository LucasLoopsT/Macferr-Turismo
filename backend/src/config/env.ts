import path from 'node:path';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  adminPassword: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  dataDir: string;
  uploadDir: string;
  publicBaseUrl: string;
  maxUploadBytes: number;
  seedFile: string | null;
  logRequests: boolean;
  /** 2FA por e-mail (Resend). Obrigatório em produção; opcional em desenvolvimento. */
  twoFactor: { enabled: boolean; apiKey: string; email: string; from: string };
  /**
   * Destinos salvos no GitHub (arquivo JSON do repositório). Obrigatório em produção.
   * null = usa o arquivo local em DATA_DIR (desenvolvimento e testes).
   */
  github: GitHubConfig | null;
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

// Valores copiados do .env.example não podem ir para produção por engano.
const PLACEHOLDER = /^(troque|change[-_ ]?me|exemplo|example)/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMETENTE_PADRAO = 'MacFerr Turismo <onboarding@resend.dev>';
const GITHUB_REPO_PADRAO = 'LucasLoopsT/Macferr-Turismo';
const GITHUB_BRANCH_PADRAO = 'main';
const GITHUB_PATH_PADRAO = 'backend/seed/destinos.json';

/**
 * Lê e valida as variáveis de ambiente. Função pura (recebe o objeto de ambiente),
 * o que facilita testar. Os valores secretos nunca aparecem nas mensagens de erro.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];
  const get = (key: string) => (env[key] ?? '').trim();

  const rawEnv = get('NODE_ENV') || 'development';
  const nodeEnv: Config['nodeEnv'] = rawEnv === 'production' || rawEnv === 'test' ? rawEnv : 'development';
  const prod = nodeEnv === 'production';

  // Senha admin
  const adminPassword = get('ADMIN_PASSWORD');
  if (!adminPassword) problems.push('ADMIN_PASSWORD é obrigatória (senha do painel administrativo).');
  else if (adminPassword.length < 8) problems.push('ADMIN_PASSWORD deve ter pelo menos 8 caracteres.');
  else if (PLACEHOLDER.test(adminPassword)) problems.push('ADMIN_PASSWORD ainda está com o valor de exemplo do .env.example. Defina uma senha própria.');

  // Segredo JWT
  const jwtSecret = get('JWT_SECRET');
  if (!jwtSecret) problems.push('JWT_SECRET é obrigatório (segredo de assinatura do token, independente da senha).');
  else if (jwtSecret.length < 32) problems.push('JWT_SECRET deve ter pelo menos 32 caracteres.');
  else if (PLACEHOLDER.test(jwtSecret)) problems.push('JWT_SECRET ainda está com o valor de exemplo do .env.example. Gere um valor aleatório.');
  else if (adminPassword && jwtSecret === adminPassword) problems.push('JWT_SECRET deve ser diferente de ADMIN_PASSWORD.');

  const jwtExpiresIn = get('JWT_EXPIRES_IN') || '8h';
  if (!/^\d+[smhd]$/.test(jwtExpiresIn)) problems.push('JWT_EXPIRES_IN inválido. Use número + s, m, h ou d (ex.: 30m, 8h, 1d).');

  // Porta
  const portRaw = get('PORT') || '3001';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT deve ser um número entre 1 e 65535.');

  // CORS
  const corsRaw = get('CORS_ORIGINS') || (prod ? '' : 'http://localhost:3000');
  const corsOrigins: string[] = [];
  if (!corsRaw) {
    problems.push('CORS_ORIGINS é obrigatória em produção (domínio do frontend, ex.: https://seusite.com.br).');
  } else {
    for (const item of corsRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
      try {
        const u = new URL(item);
        if (!/^https?:$/.test(u.protocol) || item === '*') throw new Error();
        corsOrigins.push(u.origin);
      } catch {
        problems.push(`CORS_ORIGINS contém uma origem inválida: "${item}". Use o formato https://dominio.com (sem caminho e sem "*").`);
      }
    }
  }

  // Pastas de dados
  const dataDirRaw = get('DATA_DIR');
  if (prod && !dataDirRaw) {
    problems.push('DATA_DIR é obrigatória em produção e deve apontar para o disco persistente (ex.: /var/data). Sem isso os dados se perdem a cada reinício.');
  }
  const dataDir = path.resolve(dataDirRaw || './data');
  const uploadDir = path.resolve(get('UPLOAD_DIR') || path.join(dataDir, 'uploads'));

  // URL pública do backend
  const baseRaw = get('PUBLIC_BASE_URL');
  let publicBaseUrl = `http://localhost:${port}`;
  if (baseRaw) {
    try {
      const u = new URL(baseRaw);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      publicBaseUrl = (u.origin + u.pathname).replace(/\/+$/, '');
    } catch {
      problems.push('PUBLIC_BASE_URL inválida. Use a URL completa do backend (ex.: https://macferr-backend.onrender.com).');
    }
  } else if (prod) {
    problems.push('PUBLIC_BASE_URL é obrigatória em produção (URL pública do backend, usada nos links das imagens).');
  }

  // Upload
  const maxMb = Number(get('MAX_UPLOAD_MB') || '5');
  if (!Number.isFinite(maxMb) || maxMb < 1 || maxMb > 20) problems.push('MAX_UPLOAD_MB deve estar entre 1 e 20.');

  // 2FA por e-mail (Resend)
  const resendKey = get('RESEND_API_KEY');
  const email2fa = get('ADMIN_2FA_EMAIL');
  const from = get('RESEND_FROM') || REMETENTE_PADRAO;
  if (prod && !resendKey) problems.push('RESEND_API_KEY é obrigatória em produção (código de verificação por e-mail via Resend).');
  if (prod && !email2fa) problems.push('ADMIN_2FA_EMAIL é obrigatório em produção (e-mail que recebe o código de verificação).');
  if (resendKey) {
    if (PLACEHOLDER.test(resendKey) || !/^re_[A-Za-z0-9_]{8,}$/.test(resendKey)) {
      problems.push('RESEND_API_KEY inválida. A chave do Resend começa com "re_" (crie em resend.com/api-keys).');
    }
    if (!email2fa) problems.push('ADMIN_2FA_EMAIL é obrigatório quando RESEND_API_KEY está definida.');
  }
  if (email2fa && !EMAIL.test(email2fa)) problems.push('ADMIN_2FA_EMAIL não parece um e-mail válido.');
  if (!/@/.test(from)) problems.push('RESEND_FROM inválido. Use o formato "Nome <email@dominio.com>".');

  // Destinos no GitHub
  const ghToken = get('GITHUB_TOKEN');
  const ghRepo = get('GITHUB_REPO') || GITHUB_REPO_PADRAO;
  const ghBranch = get('GITHUB_BRANCH') || GITHUB_BRANCH_PADRAO;
  const ghPath = get('GITHUB_DESTINOS_PATH') || GITHUB_PATH_PADRAO;
  let github: GitHubConfig | null = null;
  if (prod && !ghToken) {
    problems.push('GITHUB_TOKEN é obrigatório em produção (token do GitHub com "Contents: Read and write" no repositório; é onde os destinos são salvos para o site ler).');
  }
  if (ghToken) {
    const antes = problems.length;
    const repoOk = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(ghRepo);
    const branchOk = /^[A-Za-z0-9._\/-]+$/.test(ghBranch) && !ghBranch.includes('..') && !ghBranch.startsWith('/') && !ghBranch.endsWith('/');
    const pathOk = /^[A-Za-z0-9._\/-]+\.json$/.test(ghPath) && !ghPath.split('/').some((seg) => seg === '..' || seg === '');
    if (PLACEHOLDER.test(ghToken)) problems.push('GITHUB_TOKEN ainda está com o valor de exemplo do .env.example. Crie um token no GitHub (Settings > Developer settings > Fine-grained tokens).');
    else if (/\s/.test(ghToken) || ghToken.length < 20) problems.push('GITHUB_TOKEN parece inválido (curto demais ou com espaços). Copie o token inteiro, sem aspas.');
    if (!repoOk) problems.push('GITHUB_REPO inválido. Use o formato dono/repositorio (ex.: LucasLoopsT/Macferr-Turismo).');
    if (!branchOk) problems.push('GITHUB_BRANCH inválida (ex.: main).');
    if (!pathOk) problems.push('GITHUB_DESTINOS_PATH inválido. Use o caminho do arquivo .json dentro do repositório, sem barra no início (ex.: backend/seed/destinos.json).');
    if (problems.length === antes && repoOk) {
      github = { token: ghToken, owner: repoOk[1], repo: repoOk[2], branch: ghBranch, path: ghPath };
    }
  }

  const seedRaw = get('SEED_FILE');
  const logRaw = get('LOG_REQUESTS').toLowerCase();
  const logRequests = logRaw ? logRaw === 'true' : nodeEnv !== 'test';

  if (problems.length) {
    throw new ConfigError('Configuração inválida:\n' + problems.map((p) => ` - ${p}`).join('\n'));
  }

  return {
    nodeEnv, port, adminPassword, jwtSecret, jwtExpiresIn, corsOrigins,
    dataDir, uploadDir, publicBaseUrl,
    maxUploadBytes: Math.floor(maxMb * 1024 * 1024),
    seedFile: seedRaw ? path.resolve(seedRaw) : null,
    logRequests,
    twoFactor: { enabled: Boolean(resendKey && email2fa), apiKey: resendKey, email: email2fa, from },
    github,
  };
}
