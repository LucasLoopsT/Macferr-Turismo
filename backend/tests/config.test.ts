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

test('config: valores válidos produzem configuração normalizada', () => {
  const c = loadConfig({
    ...ok, NODE_ENV: 'production', DATA_DIR: '/var/data', PUBLIC_BASE_URL: 'https://api.exemplo.com.br/',
    CORS_ORIGINS: 'https://site.com.br/, https://www.site.com.br', MAX_UPLOAD_MB: '3',
  });
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
