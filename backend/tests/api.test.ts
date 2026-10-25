/**
 * Testes de integração: sobem o app Express de verdade em uma porta aleatória e
 * conversam por HTTP (fetch nativo do Node 20+). Usam pastas temporárias.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { PNG_1X1, SEGREDO, SENHA, configDeTeste, tempDir } from './helpers';

let dir: string;
let limpar: () => Promise<void>;
let server: Server;
let url: string;
let token: string;

const ORIGEM = 'http://localhost:3000';
const dados = { titulo: 'Noronha', descricao: 'Ilha linda', data: 'Dez 2025', viajantes: 10, categoria: 'Nacional', imagem: '' };

function subir(): Promise<void> {
  const config = configDeTeste(dir);
  return new Promise((resolve) => {
    server = createApp(config).listen(0, () => {
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
}
const parar = () => new Promise<void>((r) => server.close(() => r()));

const json = (method: string, rota: string, corpo?: unknown, tk?: string) =>
  fetch(url + rota, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

before(async () => {
  ({ dir, limpar } = await tempDir());
  await subir();
  const r = await json('POST', '/api/admin/login', { password: SENHA });
  token = ((await r.json()) as { token: string }).token;
});
after(async () => { await parar(); await limpar(); });

test('GET /health responde 200 sem autenticação', async () => {
  const r = await fetch(url + '/health');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'ok' });
});

test('login: senha certa → 200 { token }; errada → 401; sem senha → 400', async () => {
  const ok = await json('POST', '/api/admin/login', { password: SENHA });
  assert.equal(ok.status, 200);
  assert.equal(typeof ((await ok.json()) as { token: string }).token, 'string');
  assert.equal((await json('POST', '/api/admin/login', { password: 'errada' })).status, 401);
  assert.equal((await json('POST', '/api/admin/login', {})).status, 400);
});

test('GET /api/destinos é público e devolve um array direto', async () => {
  const r = await fetch(url + '/api/destinos');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(await r.json()));
});

test('rotas admin sem token → 401', async () => {
  assert.equal((await json('POST', '/api/admin/destinos', dados)).status, 401);
  assert.equal((await json('PUT', '/api/admin/destinos/11111111-1111-4111-8111-111111111111', dados)).status, 401);
  assert.equal((await json('DELETE', '/api/admin/destinos/11111111-1111-4111-8111-111111111111')).status, 401);
  const up = await fetch(url + '/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: PNG_1X1 });
  assert.equal(up.status, 401);
});

test('rotas admin com token inválido, de outro segredo ou expirado → 401', async () => {
  const ruins = [
    'abc.def.ghi',
    jwt.sign({ role: 'admin' }, 'outro-segredo-qualquer-com-mais-de-32-caracteres'),
    jwt.sign({ role: 'admin' }, SEGREDO, { expiresIn: -60 }),
  ];
  for (const t of ruins) assert.equal((await json('POST', '/api/admin/destinos', dados, t)).status, 401);
  const semBearer = await fetch(url + '/api/admin/destinos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token }, body: JSON.stringify(dados) });
  assert.equal(semBearer.status, 401);
});

test('CRUD completo: criar (201), listar, atualizar (id estável), excluir (204), depois 404', async () => {
  const c = await json('POST', '/api/admin/destinos', dados, token);
  assert.equal(c.status, 201);
  const criado = (await c.json()) as { id: string; titulo: string };
  assert.match(criado.id, /^[0-9a-f-]{36}$/);

  const lista = (await (await fetch(url + '/api/destinos')).json()) as { id: string }[];
  assert.ok(lista.some((d) => d.id === criado.id));

  const u = await json('PUT', `/api/admin/destinos/${criado.id}`, { titulo: 'Novo', id: 'tentativa-de-trocar' }, token);
  assert.equal(u.status, 200);
  const atualizado = (await u.json()) as { id: string; titulo: string; descricao: string };
  assert.equal(atualizado.id, criado.id);
  assert.equal(atualizado.titulo, 'Novo');
  assert.equal(atualizado.descricao, dados.descricao);

  assert.equal((await json('DELETE', `/api/admin/destinos/${criado.id}`, undefined, token)).status, 204);
  assert.equal((await json('DELETE', `/api/admin/destinos/${criado.id}`, undefined, token)).status, 404);
  assert.equal((await json('PUT', `/api/admin/destinos/${criado.id}`, { titulo: 'x' }, token)).status, 404);
});

test('validação: 400 para dados inválidos, JSON malformado e id malformado', async () => {
  assert.equal((await json('POST', '/api/admin/destinos', { titulo: '' }, token)).status, 400);
  assert.equal((await json('POST', '/api/admin/destinos', { ...dados, viajantes: 'muitos' }, token)).status, 400);
  const malformado = await fetch(url + '/api/admin/destinos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{ quebrado' });
  assert.equal(malformado.status, 400);
  assert.equal((await json('PUT', '/api/admin/destinos/nao-e-uuid', { titulo: 'x' }, token)).status, 400);
});

test('upload: aceita PNG, serve o arquivo, usa no destino e recusa arquivo falso', async () => {
  const up = await fetch(url + '/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` }, body: PNG_1X1 });
  assert.equal(up.status, 201);
  const { url: imgUrl, path: imgPath } = (await up.json()) as { url: string; path: string };
  assert.match(imgPath, /^\/uploads\/[0-9a-f-]{36}\.png$/);

  // A URL devolvida usa PUBLIC_BASE_URL (http://localhost:3001 no teste); aqui buscamos pelo servidor real.
  const arquivo = await fetch(url + imgPath);
  assert.equal(arquivo.status, 200);
  assert.equal(arquivo.headers.get('content-type'), 'image/png');
  assert.equal(arquivo.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.deepEqual(Buffer.from(await arquivo.arrayBuffer()), PNG_1X1);

  const c = await json('POST', '/api/admin/destinos', { ...dados, imagem: imgUrl }, token);
  assert.equal(c.status, 201);
  const criado = (await c.json()) as { id: string; imagem: string };
  assert.equal(criado.imagem, imgUrl);

  // Excluir o destino apaga o arquivo
  await json('DELETE', `/api/admin/destinos/${criado.id}`, undefined, token);
  assert.equal((await fetch(url + imgPath)).status, 404);

  const falso = await fetch(url + '/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` }, body: 'isto não é uma imagem' });
  assert.equal(falso.status, 415);
  const tipoErrado = await fetch(url + '/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'text/html', Authorization: `Bearer ${token}` }, body: '<script>alert(1)</script>' });
  assert.equal(tipoErrado.status, 415);
});

test('upload: imagem maior que o limite → 413', async () => {
  const grande = Buffer.concat([PNG_1X1, Buffer.alloc(6 * 1024 * 1024)]);
  const r = await fetch(url + '/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` }, body: grande }).catch(() => null);
  // O servidor recusa pelo Content-Length antes de ler o corpo; dependendo do timing, o cliente recebe o 413
  // ou vê a conexão ser encerrada. Os dois significam "recusado"; o limite exato é coberto em imageService.test.ts.
  assert.ok(r === null || r.status === 413, `esperado 413 ou conexão encerrada, veio ${r?.status}`);
});

test('persistência: os dados sobrevivem a um reinício do servidor', async () => {
  const c = await json('POST', '/api/admin/destinos', { ...dados, titulo: 'Persistente' }, token);
  const { id } = (await c.json()) as { id: string };
  await parar();
  await subir(); // novo app, mesma pasta de dados
  const lista = (await (await fetch(url + '/api/destinos')).json()) as { id: string; titulo: string }[];
  assert.equal(lista.find((d) => d.id === id)?.titulo, 'Persistente');
  // o token continua válido porque o segredo é o mesmo
  assert.equal((await json('DELETE', `/api/admin/destinos/${id}`, undefined, token)).status, 204);
  await fs.access(path.join(dir, 'destinos.json'));
});

test('CORS: origem permitida recebe o cabeçalho; origem desconhecida não', async () => {
  const ok = await fetch(url + '/api/destinos', { headers: { Origin: ORIGEM } });
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGEM);
  const ruim = await fetch(url + '/api/destinos', { headers: { Origin: 'https://site-malicioso.example' } });
  assert.equal(ruim.headers.get('access-control-allow-origin'), null);
  const pre = await fetch(url + '/api/admin/destinos', { method: 'OPTIONS', headers: { Origin: ORIGEM, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers') ?? '', /authorization/i);
});

test('rota inexistente → 404 em JSON e nenhum cabeçalho revela a stack', async () => {
  const r = await fetch(url + '/api/nada');
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('x-powered-by'), null);
});
