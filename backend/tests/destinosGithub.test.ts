import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createDestinoService } from '../src/services/destinoService';
import { createGitHubStore } from '../src/services/githubStore';
import { createDestinoStore } from '../src/services/destinoStoreFactory';
import { createDestinosController } from '../src/controllers/destinosController';
import { createImageService } from '../src/services/imageService';
import { HttpError, StorageError } from '../src/utils/errors';
import type { DestinoInput } from '../src/types/destino';
import { PNG_1X1, configDeTeste, fakeRes, tempDir } from './helpers';
import { TOKEN_FALSO, criarFakeGitHub, destinoJson, type FakeGitHub } from './fakeGithub';

const lista = (...itens: ReturnType<typeof destinoJson>[]) => JSON.stringify(itens, null, 2) + '\n';
const base: DestinoInput = {
  titulo: 'Noronha', descricao: 'Ilha', data: 'Dez 2025', viajantes: 10, categoria: 'Nacional',
  imagem: '', status: 'Disponivel', preco: '', tags: [], fotos: [],
};

function servico(gh: FakeGitHub, extra: { maxTentativas?: number; ttlMs?: number } = {}) {
  const store = createGitHubStore({ ...gh.opcoes, fetch: gh.fetch, log: () => {}, ttlMs: extra.ttlMs ?? 0 });
  return createDestinoService({ store, esperaConflitoMs: 0, maxTentativas: extra.maxTentativas });
}
const ids = (gh: FakeGitHub) => (gh.json() as { id: string }[]).map((d) => d.id);

// ── Serviço ────────────────────────────────────────────────────────────────────

test('github/serviço: cadastrar, editar e excluir atualizam o arquivo do repositório, um commit por operação', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson('a', 'Existente')) });
  const s = servico(gh);

  const criado = await s.create({ ...base, titulo: 'Nova viagem' });
  assert.match(criado.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(ids(gh), ['a', criado.id]);

  const r = await s.update(criado.id, { titulo: 'Nova viagem (editada)', status: 'Esgotada' });
  assert.equal(r?.after.id, criado.id);
  const salvo = (gh.json() as { id: string; titulo: string; status: string }[]).find((d) => d.id === criado.id);
  assert.deepEqual([salvo?.titulo, salvo?.status], ['Nova viagem (editada)', 'Esgotada']);

  const removido = await s.remove(criado.id);
  assert.equal(removido?.id, criado.id);
  assert.deepEqual(ids(gh), ['a']);

  assert.deepEqual(gh.estado.commits.map((c) => c.message), [
    'Adiciona destino "Nova viagem" (painel)',
    'Atualiza destino "Nova viagem (editada)" (painel)',
    'Remove destino "Nova viagem (editada)" (painel)',
  ]);
  assert.ok(gh.estado.commits.every((c) => c.branch === 'main'));
});

test('github/serviço: título com quebras de linha e texto enorme não estraga a mensagem do commit', async () => {
  const gh = criarFakeGitHub({ arquivo: '[]\n' });
  await servico(gh).create({ ...base, titulo: 'Linha 1\n\nLinha 2 ' + 'x'.repeat(200) });
  const msg = gh.estado.commits[0].message;
  assert.ok(!msg.includes('\n'));
  assert.ok(msg.length < 120);
});

test('github/serviço: editar item inexistente devolve null e não cria commit', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson('a', 'A')) });
  const s = servico(gh);
  assert.equal(await s.update('nao-existe', { titulo: 'x' }), null);
  assert.equal(await s.remove('nao-existe'), null);
  assert.equal(gh.estado.commits.length, 0);
});

test('github/serviço: edição feita direto no GitHub entre duas operações NÃO é perdida', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson('a', 'A')) });
  const s = servico(gh, { ttlMs: 60_000 }); // cache longo: a gravação ainda assim confere a origem
  await s.list(); // aquece o cache
  gh.commitExterno(lista(destinoJson('a', 'A'), destinoJson('ext', 'Cadastrada à mão no GitHub')));
  await s.create({ ...base, titulo: 'Criada no painel' });
  assert.deepEqual(ids(gh).slice(0, 2), ['a', 'ext']);
  assert.equal(ids(gh).length, 3);
  assert.equal(gh.chamadas('PUT').length, 1); // a gravação partiu do dado atual, sem gastar uma tentativa em conflito evitável
});

test('github/serviço: commit externo NO MEIO da operação (entre ler e gravar) causa nova tentativa e nada se perde', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson('a', 'A')) });
  const s = servico(gh);
  gh.antesDoProximoPut(() => gh.commitExterno(lista(destinoJson('a', 'A'), destinoJson('ext', 'Chegou no meio'))));
  const criado = await s.create({ ...base, titulo: 'Minha' });
  assert.deepEqual(ids(gh), ['a', 'ext', criado.id]);
  assert.equal(gh.chamadas('PUT').length, 2); // 1ª recusada (409), 2ª aceita
});

test('github/serviço: update refeito sobre o dado novo preserva as outras alterações do mesmo registro', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson('a', 'Título antigo', { viajantes: 5 })) });
  const s = servico(gh);
  // por fora, alguém muda os viajantes; o painel muda só o título
  gh.antesDoProximoPut(() => gh.commitExterno(lista(destinoJson('a', 'Título antigo', { viajantes: 99 }))));
  await s.update('a', { titulo: 'Título novo' });
  const [d] = gh.json() as { titulo: string; viajantes: number }[];
  assert.deepEqual([d.titulo, d.viajantes], ['Título novo', 99]);
});

test('github/serviço: conflito que não acaba vira 409 claro e o arquivo fica como o outro lado deixou', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson('a', 'A')) });
  const s = servico(gh, { maxTentativas: 3 });
  let ultimoExterno = '';
  for (let i = 0; i < 3; i++) {
    gh.antesDoProximoPut(() => {
      ultimoExterno = lista(destinoJson('a', 'A'), destinoJson(`ext-${i}`, `Externo ${i}`));
      gh.commitExterno(ultimoExterno);
    });
  }
  await assert.rejects(s.create({ ...base, titulo: 'Nunca deve aparecer' }), (e: unknown) => e instanceof HttpError && e.status === 409);
  assert.equal(gh.chamadas('PUT').length, 3); // tentou 3 vezes
  assert.equal(gh.estado.commits.length, 3); // e os 3 commits do arquivo são todos os externos: nenhuma gravação do painel passou
  assert.equal(gh.estado.content, ultimoExterno);
});

test('github/serviço: 25 cadastros simultâneos viram 25 itens e 25 commits, sem perdas', async () => {
  const gh = criarFakeGitHub({ arquivo: '[]\n' });
  const s = servico(gh);
  await Promise.all(Array.from({ length: 25 }, (_, i) => s.create({ ...base, titulo: `T${i}` })));
  assert.equal(new Set(ids(gh)).size, 25);
  assert.equal(gh.estado.commits.length, 25);
});

test('github/serviço: duas instâncias do backend gravando ao mesmo tempo não perdem registros', async () => {
  const gh = criarFakeGitHub({ arquivo: '[]\n' });
  const a = servico(gh, { maxTentativas: 40 });
  const b = servico(gh, { maxTentativas: 40 });
  await Promise.all([
    ...Array.from({ length: 8 }, (_, i) => a.create({ ...base, titulo: `A${i}` })),
    ...Array.from({ length: 8 }, (_, i) => b.create({ ...base, titulo: `B${i}` })),
  ]);
  assert.equal(new Set(ids(gh)).size, 16);
});

test('github/serviço: GitHub fora do ar ao salvar vira 503, sem alterar o arquivo; ao ler também', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson('a', 'A')) });
  const s = servico(gh);
  gh.falharProxima((c) => c.method === 'PUT', () => new Response('{}', { status: 503 }));
  await assert.rejects(s.create(base), (e: unknown) => e instanceof HttpError && e.status === 503 && !/token|github_pat/i.test(e.message));
  assert.deepEqual(ids(gh), ['a']);

  gh.falharProxima((c) => c.method === 'GET', () => { throw new TypeError('fetch failed'); });
  await assert.rejects(s.list(), (e: unknown) => e instanceof HttpError && e.status === 503);
});

test('github/serviço: token sem permissão de escrita (403) é erro interno (500 genérico), nunca vaza o motivo ao cliente', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson('a', 'A')) });
  const s = servico(gh);
  gh.falharProxima((c) => c.method === 'PUT', () => new Response(JSON.stringify({ message: 'Resource not accessible by personal access token' }), { status: 403 }));
  await assert.rejects(s.create(base), (e: unknown) => e instanceof StorageError && !(e instanceof HttpError));
  assert.deepEqual(ids(gh), ['a']);
});

test('github/serviço: JSON inválido no repositório: leituras e gravações falham e o conteúdo não é tocado', async () => {
  const gh = criarFakeGitHub({ arquivo: '[ { "id": "a", ' });
  const s = servico(gh);
  await assert.rejects(s.list(), StorageError);
  await assert.rejects(s.create(base), StorageError);
  await assert.rejects(s.remove('a'), StorageError);
  assert.equal(gh.estado.content, '[ { "id": "a", ');
  assert.equal(gh.chamadas('PUT').length, 0);
});

test('github/serviço: arquivo ainda inexistente é criado na primeira gravação (sem enviar sha)', async () => {
  const gh = criarFakeGitHub({ arquivo: null });
  const s = servico(gh);
  assert.deepEqual(await s.list(), []);
  await s.create(base);
  assert.equal(gh.chamadas('PUT')[0].body?.sha, undefined);
  assert.equal(ids(gh).length, 1);
});

test('github/serviço: imagensEmUso recusa concluir "nada em uso" quando o arquivo remoto não existe (evita apagar uploads por engano)', async () => {
  const gh = criarFakeGitHub({ arquivo: null });
  await assert.rejects(servico(gh).imagensEmUso(), StorageError);
  const gh2 = criarFakeGitHub({ arquivo: lista(destinoJson('a', 'A', { imagem: '/uploads/x.jpg' })) });
  assert.deepEqual([...(await servico(gh2).imagensEmUso())], ['/uploads/x.jpg']);
});

test('github/serviço: listProximas e listRealizadas seguem a mesma regra de status e rascunhos continuam fora das listas públicas', async () => {
  const gh = criarFakeGitHub({
    arquivo: lista(
      destinoJson('1', 'Rascunho', { status: 'Rascunho' }), destinoJson('2', 'Disponível', { status: 'Disponivel' }),
      destinoJson('3', 'Esgotada', { status: 'Esgotada' }), destinoJson('4', 'Finalizada', { status: 'Finalizada' }),
    ),
  });
  const s = servico(gh);
  assert.deepEqual((await s.listProximas()).map((d) => d.id), ['2', '3']);
  assert.deepEqual((await s.listRealizadas()).map((d) => d.id), ['4']);
  assert.equal((await s.list()).length, 4);
});

test('github/fábrica: com GITHUB_TOKEN usa o GitHub; sem token usa arquivo local', async () => {
  const t = await tempDir();
  try {
    const comToken = createDestinoStore(configDeTeste(t.dir, { GITHUB_TOKEN: TOKEN_FALSO }));
    assert.equal(comToken.remoto, true);
    assert.equal(comToken.descricao, 'LucasLoopsT/Macferr-Turismo@main:backend/seed/destinos.json');
    const semToken = createDestinoStore(configDeTeste(t.dir));
    assert.equal(semToken.remoto, false);
    assert.equal(semToken.descricao, path.join(t.dir, 'destinos.json'));
  } finally { await t.limpar(); }
});

// ── Controllers (os handlers de POST/PUT/DELETE /api/admin/destinos) ───────────────

const BASE_URL = 'http://localhost:3001';
const req = (extra: Record<string, unknown> = {}) => ({ params: {}, body: {}, headers: {}, ip: '9.9.9.9', ...extra }) as never;
const UUID_A = '7d1a3c5e-4b2f-4a60-9f31-0c8e6a2b1d01';

async function ambiente(gh: FakeGitHub) {
  const t = await tempDir();
  const destinos = servico(gh);
  const images = createImageService({ uploadDir: path.join(t.dir, 'uploads'), publicBaseUrl: BASE_URL, maxBytes: 1024 * 1024 });
  return { t, destinos, images, ctl: createDestinosController(destinos, images) };
}

test('github/controller: POST cadastra no arquivo do repositório e responde 201 com o destino', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson(UUID_A, 'Existente')) });
  const { t, ctl } = await ambiente(gh);
  try {
    const res = fakeRes();
    await ctl.criar(req({ body: { titulo: 'Europa', descricao: 'Roteiro', data: 'Maio 2026', categoria: 'Europa', status: 'Disponivel', id: 'tentativa-de-forcar-id' } }), res as never);
    assert.equal(res.statusCode, 201);
    const criado = res.body as { id: string; titulo: string };
    assert.notEqual(criado.id, 'tentativa-de-forcar-id');
    assert.deepEqual(ids(gh), [UUID_A, criado.id]);
  } finally { await t.limpar(); }
});

test('github/controller: dados inválidos dão 400 e NÃO geram commit', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson(UUID_A, 'Existente')) });
  const { t, ctl } = await ambiente(gh);
  try {
    await assert.rejects(ctl.criar(req({ body: { titulo: '' } }), fakeRes() as never), (e: unknown) => (e as HttpError).status === 400);
    await assert.rejects(ctl.atualizar(req({ params: { id: UUID_A }, body: { viajantes: -3 } }), fakeRes() as never), (e: unknown) => (e as HttpError).status === 400);
    await assert.rejects(ctl.atualizar(req({ params: { id: 'nao-e-uuid' }, body: { titulo: 'x' } }), fakeRes() as never), (e: unknown) => (e as HttpError).status === 400);
    assert.equal(gh.estado.commits.length, 0);
  } finally { await t.limpar(); }
});

test('github/controller: PUT edita só o que veio, mantém o id, e 404 para id inexistente', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson(UUID_A, 'Antes', { viajantes: 7 })) });
  const { t, ctl } = await ambiente(gh);
  try {
    const res = fakeRes();
    await ctl.atualizar(req({ params: { id: UUID_A }, body: { titulo: 'Depois', id: 'outro' } }), res as never);
    assert.equal(res.statusCode, 200);
    const [d] = gh.json() as { id: string; titulo: string; viajantes: number }[];
    assert.deepEqual([d.id, d.titulo, d.viajantes], [UUID_A, 'Depois', 7]);

    await assert.rejects(
      ctl.atualizar(req({ params: { id: '11111111-2222-4333-8444-555555555555' }, body: { titulo: 'x' } }), fakeRes() as never),
      (e: unknown) => (e as HttpError).status === 404,
    );
  } finally { await t.limpar(); }
});

test('github/controller: DELETE remove do arquivo (204) e 404 na segunda vez', async () => {
  const gh = criarFakeGitHub({ arquivo: lista(destinoJson(UUID_A, 'A')) });
  const { t, ctl } = await ambiente(gh);
  try {
    const res = fakeRes();
    await ctl.excluir(req({ params: { id: UUID_A } }), res as never);
    assert.equal(res.statusCode, 204);
    assert.deepEqual(gh.json(), []);
    await assert.rejects(ctl.excluir(req({ params: { id: UUID_A } }), fakeRes() as never), (e: unknown) => (e as HttpError).status === 404);
  } finally { await t.limpar(); }
});

test('github/controller: GET devolve imagens enviadas com URL absoluta, mas o arquivo no GitHub guarda só o caminho relativo', async () => {
  const gh = criarFakeGitHub({ arquivo: '[]\n' });
  const { t, ctl, images } = await ambiente(gh);
  try {
    const up = await images.salvar(PNG_1X1, 'image/png');
    const res = fakeRes();
    await ctl.criar(req({ body: { titulo: 'Com foto', descricao: 'd', data: 'x', categoria: 'Nacional', imagem: up.url } }), res as never);
    assert.equal((res.body as { imagem: string }).imagem, up.url);
    assert.equal((gh.json() as { imagem: string }[])[0].imagem, up.path); // /uploads/<uuid>.png
  } finally { await t.limpar(); }
});

test('github/controller: trocar a imagem apaga o arquivo antigo do disco só se nenhum destino o usa (lido do GitHub)', async () => {
  const gh = criarFakeGitHub({ arquivo: '[]\n' });
  const { t, ctl, images } = await ambiente(gh);
  try {
    const velha = await images.salvar(PNG_1X1, 'image/png');
    const nova = await images.salvar(PNG_1X1, 'image/png');
    const r = fakeRes();
    await ctl.criar(req({ body: { titulo: 'X', descricao: 'd', data: 'x', categoria: 'Nacional', imagem: velha.url } }), r as never);
    const id = (r.body as { id: string }).id;
    await ctl.atualizar(req({ params: { id }, body: { imagem: nova.url } }), fakeRes() as never);
    await assert.rejects(fs.access(path.join(t.dir, 'uploads', velha.path.replace('/uploads/', ''))));
    await fs.access(path.join(t.dir, 'uploads', nova.path.replace('/uploads/', '')));
  } finally { await t.limpar(); }
});

test('github/controller: falha do GitHub ao salvar não apaga imagem nenhuma e propaga o 503', async () => {
  const gh = criarFakeGitHub({ arquivo: '[]\n' });
  const { t, ctl, images } = await ambiente(gh);
  try {
    const img = await images.salvar(PNG_1X1, 'image/png');
    const r = fakeRes();
    await ctl.criar(req({ body: { titulo: 'X', descricao: 'd', data: 'x', categoria: 'Nacional', imagem: img.url } }), r as never);
    const id = (r.body as { id: string }).id;
    gh.falharProxima((c) => c.method === 'PUT', () => new Response('{}', { status: 502 }));
    await assert.rejects(ctl.excluir(req({ params: { id } }), fakeRes() as never), (e: unknown) => (e as HttpError).status === 503);
    await fs.access(path.join(t.dir, 'uploads', img.path.replace('/uploads/', ''))); // continua no disco
    assert.equal(ids(gh).length, 1); // e o destino continua no arquivo
  } finally { await t.limpar(); }
});
