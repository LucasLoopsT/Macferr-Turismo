import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createAuthController } from '../src/controllers/authController';
import { createDestinosController } from '../src/controllers/destinosController';
import { createUploadController } from '../src/controllers/uploadController';
import { createAuthService } from '../src/services/authService';
import { createDestinoService } from '../src/services/destinoService';
import { createImageService } from '../src/services/imageService';
import { createLoginLimiter } from '../src/middlewares/rateLimit';
import { HttpError } from '../src/utils/errors';
import { PNG_1X1, SEGREDO, SENHA, fakeRes, tempDir } from './helpers';

const BASE = 'http://localhost:3001';
const dados = { titulo: 'Noronha', descricao: 'Ilha', data: 'Dez 2025', viajantes: 10, categoria: 'Nacional', imagem: '' };

async function ambiente() {
  const t = await tempDir();
  const destinos = createDestinoService({ dataDir: t.dir });
  const images = createImageService({ uploadDir: path.join(t.dir, 'uploads'), publicBaseUrl: BASE, maxBytes: 1024 * 1024 });
  return { t, destinos, images, ctl: createDestinosController(destinos, images), up: createUploadController(images) };
}
const req = (extra: Record<string, unknown> = {}) => ({ params: {}, body: {}, headers: {}, ip: '9.9.9.9', ...extra }) as never;
const codigo = (p: Promise<unknown> | (() => unknown)) =>
  Promise.resolve().then(typeof p === 'function' ? p : () => p).then(() => 0, (e: HttpError) => e.status);

test('login: senha certa devolve { token }; errada 401; ausente 400; falhas repetidas contam no limitador', async () => {
  const auth = createAuthService({ adminPassword: SENHA, jwtSecret: SEGREDO, expiresIn: '1h' });
  const limiter = createLoginLimiter({ max: 2, windowMs: 60_000 });
  const ctl = createAuthController(auth, limiter);

  const ok = fakeRes();
  ctl.login(req({ body: { password: SENHA } }), ok as never);
  const body = ok.body as { token: string };
  assert.deepEqual(Object.keys(body), ['token']);
  assert.equal(auth.verificarToken(body.token), true);

  assert.equal(await codigo(() => ctl.login(req({ body: { password: 'errada' } }), fakeRes() as never)), 401);
  assert.equal(await codigo(() => ctl.login(req({ body: {} }), fakeRes() as never)), 400);
  assert.equal(await codigo(() => ctl.login(req({ body: { password: 123 } }), fakeRes() as never)), 400);

  // Segunda falha: o limitador (max=2) passa a bloquear esse IP; senha ausente (400) não conta como falha.
  assert.equal(await codigo(() => ctl.login(req({ body: { password: 'errada' } }), fakeRes() as never)), 401);
  const bloqueio = fakeRes();
  let seguiu = false;
  limiter.middleware(req() as never, bloqueio as never, () => { seguiu = true; });
  assert.equal(seguiu, false);
  assert.equal(bloqueio.statusCode, 429);
});

test('destinos: criar → listar → atualizar → excluir, com ids estáveis e imagem em URL absoluta', async () => {
  const { t, ctl, images } = await ambiente();
  try {
    const r1 = fakeRes();
    await ctl.criar(req({ body: dados }), r1 as never);
    assert.equal(r1.statusCode, 201);
    const criado = r1.body as { id: string; imagem: string };
    assert.match(criado.id, /^[0-9a-f-]{36}$/);

    const lista = fakeRes();
    await ctl.listar(req(), lista as never);
    assert.ok(Array.isArray(lista.body));
    assert.equal((lista.body as unknown[]).length, 1);

    const r2 = fakeRes();
    await ctl.atualizar(req({ params: { id: criado.id }, body: { titulo: 'Novo título', id: 'outro-id' } }), r2 as never);
    const atualizado = r2.body as { id: string; titulo: string; viajantes: number };
    assert.equal(atualizado.id, criado.id);
    assert.equal(atualizado.titulo, 'Novo título');
    assert.equal(atualizado.viajantes, 10); // campos não enviados permanecem

    const r3 = fakeRes();
    await ctl.excluir(req({ params: { id: criado.id } }), r3 as never);
    assert.equal(r3.statusCode, 204);
    assert.equal(await codigo(ctl.excluir(req({ params: { id: criado.id } }), fakeRes() as never)), 404);
    void images;
  } finally { await t.limpar(); }
});

test('destinos: 400 para dados inválidos e id malformado; 404 para id inexistente', async () => {
  const { t, ctl } = await ambiente();
  try {
    assert.equal(await codigo(ctl.criar(req({ body: { titulo: '' } }), fakeRes() as never)), 400);
    assert.equal(await codigo(ctl.atualizar(req({ params: { id: 'abc' }, body: { titulo: 'x' } }), fakeRes() as never)), 400);
    assert.equal(await codigo(ctl.excluir(req({ params: { id: '../../etc' } }), fakeRes() as never)), 400);
    const inexistente = '11111111-1111-4111-8111-111111111111';
    assert.equal(await codigo(ctl.atualizar(req({ params: { id: inexistente }, body: { titulo: 'x' } }), fakeRes() as never)), 404);
    assert.equal(await codigo(ctl.excluir(req({ params: { id: inexistente } }), fakeRes() as never)), 404);
  } finally { await t.limpar(); }
});

test('upload + destino: arquivo antigo é apagado ao trocar imagem e ao excluir, sem afetar imagem compartilhada', async () => {
  const { t, ctl, up, images } = await ambiente();
  const existe = (url: string) => fs.access(path.join(t.dir, 'uploads', path.basename(url))).then(() => true, () => false);
  const enviar = async () => {
    const r = fakeRes();
    await up.enviar(req({ body: PNG_1X1, headers: { 'content-type': 'image/png' } }), r as never);
    assert.equal(r.statusCode, 201);
    return (r.body as { url: string }).url;
  };
  try {
    const urlA = await enviar();
    const urlB = await enviar();

    const a = fakeRes(); await ctl.criar(req({ body: { ...dados, imagem: urlA } }), a as never);
    const b = fakeRes(); await ctl.criar(req({ body: { ...dados, titulo: 'Outro', imagem: urlA } }), b as never); // mesma imagem
    const idA = (a.body as { id: string }).id;
    const idB = (b.body as { id: string }).id;
    assert.equal((a.body as { imagem: string }).imagem, urlA); // API devolve URL absoluta

    // Trocar a imagem de A: o arquivo continua porque B ainda usa
    await ctl.atualizar(req({ params: { id: idA }, body: { imagem: urlB } }), fakeRes() as never);
    assert.equal(await existe(urlA), true);

    // Trocar a imagem de B: agora ninguém usa urlA, então ela é apagada
    await ctl.atualizar(req({ params: { id: idB }, body: { imagem: 'https://images.unsplash.com/x.jpg' } }), fakeRes() as never);
    assert.equal(await existe(urlA), false);
    assert.equal(await existe(urlB), true);

    // Excluir A apaga urlB
    await ctl.excluir(req({ params: { id: idA } }), fakeRes() as never);
    assert.equal(await existe(urlB), false);
    void images;
  } finally { await t.limpar(); }
});

test('destinos: imagem apontando para arquivo inexistente ou caminho perigoso é recusada', async () => {
  const { t, ctl } = await ambiente();
  try {
    for (const imagem of ['/uploads/../../x.png', 'javascript:alert(1)', BASE + '/uploads/00000000-0000-0000-0000-000000000000.png']) {
      assert.equal(await codigo(ctl.criar(req({ body: { ...dados, imagem } }), fakeRes() as never)), 400, imagem);
    }
  } finally { await t.limpar(); }
});

test('upload: corpo ausente → 415; conteúdo falso → 415; mime divergente → 415', async () => {
  const { t, up } = await ambiente();
  try {
    assert.equal(await codigo(up.enviar(req({ body: {}, headers: { 'content-type': 'image/png' } }), fakeRes() as never)), 415);
    assert.equal(await codigo(up.enviar(req({ body: Buffer.from('oi'), headers: { 'content-type': 'image/png' } }), fakeRes() as never)), 415);
    assert.equal(await codigo(up.enviar(req({ body: PNG_1X1, headers: { 'content-type': 'image/jpeg' } }), fakeRes() as never)), 415);
  } finally { await t.limpar(); }
});

test('fotos: salvar, devolver URLs absolutas, limpar removidas ao editar e ao excluir; limite de 5; legado sem fotos', async () => {
  const { t, ctl, up } = await ambiente();
  const existe = (url: string) => fs.access(path.join(t.dir, 'uploads', path.basename(url))).then(() => true, () => false);
  const enviar = async () => {
    const r = fakeRes();
    await up.enviar(req({ body: PNG_1X1, headers: { 'content-type': 'image/png' } }), r as never);
    return (r.body as { url: string }).url;
  };
  try {
    const [f1, f2, f3] = [await enviar(), await enviar(), await enviar()];
    const c = fakeRes();
    await ctl.criar(req({ body: { ...dados, fotos: [f1, f2, f3, f1] } }), c as never); // duplicada some
    const criado = c.body as { id: string; fotos: string[] };
    assert.deepEqual(criado.fotos, [f1, f2, f3]);

    // Remover f2 da lista apaga o arquivo; f1 e f3 permanecem
    const u = fakeRes();
    await ctl.atualizar(req({ params: { id: criado.id }, body: { fotos: [f1, f3] } }), u as never);
    assert.deepEqual((u.body as { fotos: string[] }).fotos, [f1, f3]);
    assert.equal(await existe(f2), false);
    assert.equal(await existe(f1), true);

    // Mais de 5 → 400; foto inexistente → 400
    const seis = Array.from({ length: 6 }, (_, i) => `https://x.com/${i}.jpg`);
    assert.equal(await codigo(ctl.atualizar(req({ params: { id: criado.id }, body: { fotos: seis } }), fakeRes() as never)), 400);
    assert.equal(await codigo(ctl.criar(req({ body: { ...dados, fotos: [BASE + '/uploads/00000000-0000-0000-0000-000000000000.png'] } }), fakeRes() as never)), 400);

    // Criar sem fotos → []
    const s = fakeRes();
    await ctl.criar(req({ body: dados }), s as never);
    assert.deepEqual((s.body as { fotos: string[] }).fotos, []);

    // Excluir apaga as fotos restantes
    await ctl.excluir(req({ params: { id: criado.id } }), fakeRes() as never);
    assert.equal(await existe(f1), false);
    assert.equal(await existe(f3), false);
  } finally { await t.limpar(); }
});
