import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadConfig } from '../src/config/env';
import { SEGREDO, SENHA } from './helpers';

const ok = { ADMIN_PASSWORD: SENHA, JWT_SECRET: SEGREDO };

test('config: sem senha nem segredo falha com mensagem clara', () => {
  assert.throws(() => loadConfig({}), (e: Error) => e instanceof ConfigError && /ADMIN_PASSWORD/.test(e.message) && /JWT_SECRET/.test(e.message));
});

test('config: recusa valores de exemplo do .env.example', () => {
  assert.throws(() => loadConfig({ ADMIN_PASSWORD: 'troque-esta-senha', JWT_SECRET: SEGREDO }), /valor de exemplo/);
  assert.throws(() => loadConfig({ ADMIN_PASSWORD: SENHA, JWT_SECRET: 'troque-este-segredo-por-um-valor-aleatorio-longo' }), /valor de exemplo/);
});

test('config: segredo curto ou igual à senha é recusado', () => {
  assert.throws(() => loadConfig({ ADMIN_PASSWORD: SENHA, JWT_SECRET: 'curto' }), /32 caracteres/);
  const igual = 'x'.repeat(40);
  assert.throws(() => loadConfig({ ADMIN_PASSWORD: igual, JWT_SECRET: igual }), /diferente/);
});

test('config: mensagens de erro nunca contêm os valores secretos', () => {
  try {
    loadConfig({ ADMIN_PASSWORD: 'abc', JWT_SECRET: 'segredo-curto' });
    assert.fail('deveria lançar');
  } catch (e) {
    assert.ok(!/segredo-curto/.test((e as Error).message));
  }
});

test('config: produção exige DATA_DIR, CORS_ORIGINS e PUBLIC_BASE_URL', () => {
  try {
    loadConfig({ ...ok, NODE_ENV: 'production' });
    assert.fail('deveria lançar');
  } catch (e) {
    const m = (e as Error).message;
    assert.match(m, /DATA_DIR/);
    assert.match(m, /CORS_ORIGINS/);
    assert.match(m, /PUBLIC_BASE_URL/);
  }
});

// Produção exige também o 2FA por e-mail e o token do GitHub.
const producao = {
  ...ok, NODE_ENV: 'production', DATA_DIR: '/var/data', PUBLIC_BASE_URL: 'https://api.exemplo.com.br/',
  CORS_ORIGINS: 'https://site.com.br/, https://www.site.com.br',
  RESEND_API_KEY: 're_abcdefghijklmnopqrstuvwx', ADMIN_2FA_EMAIL: 'dona@exemplo.com.br',
  GITHUB_TOKEN: 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz',
};

test('config: valores válidos produzem configuração normalizada', () => {
  const c = loadConfig({ ...producao, MAX_UPLOAD_MB: '3' });
  assert.equal(c.publicBaseUrl, 'https://api.exemplo.com.br');
  assert.deepEqual(c.corsOrigins, ['https://site.com.br', 'https://www.site.com.br']);
  assert.equal(c.uploadDir, '/var/data/uploads');
  assert.equal(c.maxUploadBytes, 3 * 1024 * 1024);
  assert.equal(c.jwtExpiresIn, '8h');
});

test('config: CORS_ORIGINS recusa curinga e valores malformados', () => {
  assert.throws(() => loadConfig({ ...ok, CORS_ORIGINS: '*' }), /origem inválida/);
  assert.throws(() => loadConfig({ ...ok, CORS_ORIGINS: 'localhost:3000' }), /origem inválida/);
});

// ── Destinos no GitHub ───────────────────────────────────────────────────────────

const TOKEN = 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz';

test('config/github: sem GITHUB_TOKEN (desenvolvimento) usa arquivo local', () => {
  assert.equal(loadConfig(ok).github, null);
});

test('config/github: com token, os padrões apontam para o arquivo de destinos do repositório do site', () => {
  const c = loadConfig({ ...ok, GITHUB_TOKEN: TOKEN });
  assert.deepEqual(c.github, {
    token: TOKEN, owner: 'LucasLoopsT', repo: 'Macferr-Turismo', branch: 'main', path: 'backend/seed/destinos.json',
  });
});

test('config/github: repositório, branch e caminho podem ser trocados (ex.: branch de testes)', () => {
  const c = loadConfig({ ...ok, GITHUB_TOKEN: TOKEN, GITHUB_REPO: 'maria/site-teste', GITHUB_BRANCH: 'teste/destinos', GITHUB_DESTINOS_PATH: 'dados/destinos.json' });
  assert.deepEqual(c.github, { token: TOKEN, owner: 'maria', repo: 'site-teste', branch: 'teste/destinos', path: 'dados/destinos.json' });
});

test('config/github: produção sem GITHUB_TOKEN não sobe (senão os dados ficariam só no disco do servidor)', () => {
  const { GITHUB_TOKEN: _removido, ...semToken } = producao;
  assert.throws(() => loadConfig(semToken), (e: Error) => e instanceof ConfigError && /GITHUB_TOKEN é obrigatório em produção/.test(e.message));
});

test('config/github: produção completa é aceita', () => {
  assert.equal(loadConfig(producao).github?.token, TOKEN);
});

test('config/github: valor de exemplo, token curto/com espaço, repo, branch e caminho inválidos são recusados', () => {
  assert.throws(() => loadConfig({ ...ok, GITHUB_TOKEN: 'troque-pelo-seu-token-do-github-aqui' }), /GITHUB_TOKEN ainda está com o valor de exemplo/);
  assert.throws(() => loadConfig({ ...ok, GITHUB_TOKEN: 'curto' }), /GITHUB_TOKEN parece inválido/);
  assert.throws(() => loadConfig({ ...ok, GITHUB_TOKEN: TOKEN + ' sobra' }), /GITHUB_TOKEN parece inválido/);
  assert.throws(() => loadConfig({ ...ok, GITHUB_TOKEN: TOKEN, GITHUB_REPO: 'sem-barra' }), /GITHUB_REPO inválido/);
  assert.throws(() => loadConfig({ ...ok, GITHUB_TOKEN: TOKEN, GITHUB_REPO: 'https://github.com/a/b' }), /GITHUB_REPO inválido/);
  assert.throws(() => loadConfig({ ...ok, GITHUB_TOKEN: TOKEN, GITHUB_BRANCH: '../main' }), /GITHUB_BRANCH inválida/);
  assert.throws(() => loadConfig({ ...ok, GITHUB_TOKEN: TOKEN, GITHUB_DESTINOS_PATH: '/backend/seed/destinos.json' }), /GITHUB_DESTINOS_PATH inválido/);
  assert.throws(() => loadConfig({ ...ok, GITHUB_TOKEN: TOKEN, GITHUB_DESTINOS_PATH: 'backend/../segredo.json' }), /GITHUB_DESTINOS_PATH inválido/);
  assert.throws(() => loadConfig({ ...ok, GITHUB_TOKEN: TOKEN, GITHUB_DESTINOS_PATH: 'backend/seed/destinos.txt' }), /GITHUB_DESTINOS_PATH inválido/);
});

test('config/github: o token nunca aparece nas mensagens de erro', () => {
  for (const extra of [{ GITHUB_REPO: 'invalido' }, { GITHUB_BRANCH: '..' }, { GITHUB_DESTINOS_PATH: '../x.json' }]) {
    try {
      loadConfig({ ...ok, GITHUB_TOKEN: TOKEN, ...extra });
      assert.fail('deveria lançar');
    } catch (e) {
      assert.ok(!(e as Error).message.includes(TOKEN));
    }
  }
});
