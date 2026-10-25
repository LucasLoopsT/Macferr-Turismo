/**
 * Integração HTTP do login em duas etapas (senha + código por e-mail), com o Express de verdade
 * e um mailer falso no lugar do Resend. Usa pastas temporárias.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, createServices } from '../src/app';
import { SENHA, configDeTeste, fakeMailer, tempDir } from './helpers';

let limpar: () => Promise<void>;
let server: Server;
let url: string;
const m = fakeMailer();

before(async () => {
  const t = await tempDir();
  limpar = t.limpar;
  const config = configDeTeste(t.dir, { RESEND_API_KEY: 're_chave_de_teste_123456', ADMIN_2FA_EMAIL: 'dona@exemplo.com' });
  const app = createApp(config, createServices(config, { mailer: m.mailer }));
  await new Promise<void>((r) => { server = app.listen(0, () => { url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; r(); }); });
});
after(async () => { await new Promise<void>((r) => server.close(() => r())); await limpar(); });

const post = (rota: string, corpo: unknown, headers: Record<string, string> = {}) =>
  fetch(url + rota, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(corpo) });

test('2FA por HTTP: senha → código por e-mail → token; só então as rotas admin abrem', async () => {
  // senha errada: 401 e nenhum e-mail
  assert.equal((await post('/api/admin/login', { password: 'errada' })).status, 401);
  assert.equal(m.enviados.length, 0);

  // senha certa: pede o código, sem token
  const r1 = await post('/api/admin/login', { password: SENHA });
  assert.equal(r1.status, 200);
  const etapa1 = (await r1.json()) as { etapa: string; desafio: string; token?: string };
  assert.equal(etapa1.etapa, 'codigo');
  assert.equal(etapa1.token, undefined);
  assert.equal(m.enviados.length, 1);
  assert.equal(m.enviados[0].para, 'dona@exemplo.com');
  const certo = m.ultimoCodigo()!;
  const errado = certo === '000000' ? '000001' : '000000';

  // sem token as rotas admin continuam fechadas
  assert.equal((await post('/api/admin/destinos', { titulo: 'x' })).status, 401);

  // código errado: 401; sem desafio/malformado: 400
  assert.equal((await post('/api/admin/login/verificar', { desafio: etapa1.desafio, codigo: errado })).status, 401);
  assert.equal((await post('/api/admin/login/verificar', { codigo: certo })).status, 400);
  assert.equal((await post('/api/admin/login/verificar', { desafio: etapa1.desafio, codigo: 'abc' })).status, 400);

  // código certo: token
  const r2 = await post('/api/admin/login/verificar', { desafio: etapa1.desafio, codigo: certo });
  assert.equal(r2.status, 200);
  const { token } = (await r2.json()) as { token: string };
  const criar = await post('/api/admin/destinos', { titulo: 'T', descricao: 'D', data: 'x', categoria: 'Nacional' }, { Authorization: `Bearer ${token}` });
  assert.equal(criar.status, 201);

  // o código não pode ser reutilizado
  assert.equal((await post('/api/admin/login/verificar', { desafio: etapa1.desafio, codigo: certo })).status, 401);
});

test('2FA por HTTP: novo pedido imediato é barrado (429 com Retry-After)', async () => {
  const r = await post('/api/admin/login', { password: SENHA });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) >= 1);
});
