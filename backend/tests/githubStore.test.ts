import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubStore } from '../src/services/githubStore';
import { ConflictError, RemoteStoreError } from '../src/services/destinoStore';
import { StorageError } from '../src/utils/errors';
import type { Destino } from '../src/types/destino';
import { TOKEN_FALSO, criarFakeGitHub, destinoJson, type FakeGitHub } from './fakeGithub';

const conteudo = (...itens: ReturnType<typeof destinoJson>[]) => JSON.stringify(itens, null, 2) + '\n';

function loja(gh: FakeGitHub, extra: { ttlMs?: number; timeoutMs?: number } = {}) {
  const logs: string[] = [];
  const store = createGitHubStore({ ...gh.opcoes, fetch: gh.fetch, log: (m) => logs.push(m), ttlMs: 0, ...extra });
  return { store, logs };
}

const novoDestino = (id: string, titulo: string) => destinoJson(id, titulo) as unknown as Destino;

test('githubStore: lê o arquivo, normaliza registros antigos e devolve o SHA como versão', async () => {
  const gh = criarFakeGitHub({ arquivo: JSON.stringify([{ id: 'a', titulo: 'Antigo', descricao: 'd', data: 'x', viajantes: 1, categoria: 'Nacional', imagem: '' }]) });
  const { store } = loja(gh);
  const snap = await store.ler();
  assert.equal(snap.version, gh.sha());
  assert.equal(snap.destinos[0].status, 'Finalizada'); // registro sem status: mesma regra do backend
  assert.deepEqual(snap.destinos[0].fotos, []);
});

test('githubStore: chamadas levam token, versão da API, branch e caminho codificado; o token não aparece na URL', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A')) });
  await loja(gh).store.ler();
  const [c] = gh.chamadas('GET');
  assert.equal(c.headers.authorization, `Bearer ${TOKEN_FALSO}`);
  assert.equal(c.headers['x-github-api-version'], '2022-11-28');
  assert.match(c.url, /^\/repos\/dono\/site\/contents\/backend\/seed\/destinos\.json\?ref=main$/);
  assert.ok(!c.url.includes(TOKEN_FALSO));
});

test('githubStore: leitura fresca é condicional (ETag) e o 304 reaproveita o conteúdo sem baixar de novo', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A')) });
  const { store } = loja(gh);
  await store.ler({ fresh: true });
  const segunda = await store.ler({ fresh: true });
  const gets = gh.chamadas('GET');
  assert.equal(gets.length, 2);
  assert.ok(gets[1].headers['if-none-match']);
  assert.equal(segunda.destinos[0].titulo, 'A');
});

test('githubStore: leitura não fresca reaproveita o cache dentro do TTL; fresca sempre confere', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A')) });
  const { store } = loja(gh, { ttlMs: 60_000 });
  await store.ler();
  await store.ler();
  await store.ler();
  assert.equal(gh.chamadas('GET').length, 1);
  await store.ler({ fresh: true });
  assert.equal(gh.chamadas('GET').length, 2);
});

test('githubStore: o que o chamador altera na resposta não contamina o cache', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A')) });
  const { store } = loja(gh, { ttlMs: 60_000 });
  const primeira = await store.ler();
  primeira.destinos[0].titulo = 'ALTERADO NA MEMÓRIA';
  primeira.destinos.push(novoDestino('x', 'X'));
  const segunda = await store.ler();
  assert.deepEqual(segunda.destinos.map((d) => d.titulo), ['A']);
});

test('githubStore: leituras simultâneas compartilham uma única chamada ao GitHub', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A')) });
  const { store } = loja(gh, { ttlMs: 0 });
  await Promise.all([store.ler(), store.ler(), store.ler(), store.ler()]);
  assert.equal(gh.chamadas('GET').length, 1);
});

test('githubStore: arquivo inexistente com repositório e branch corretos = lista vazia, versão null', async () => {
  const gh = criarFakeGitHub({ arquivo: null });
  const snap = await loja(gh).store.ler();
  assert.deepEqual(snap, { destinos: [], version: null });
});

test('githubStore: 404 por repositório errado NÃO vira "lista vazia": é erro de configuração', async () => {
  const gh = criarFakeGitHub({ arquivo: null });
  const store = createGitHubStore({ ...gh.opcoes, repo: 'outro-repo', fetch: gh.fetch, log: () => {}, ttlMs: 0 });
  await assert.rejects(store.ler(), (e: unknown) => e instanceof RemoteStoreError && e.tipo === 'config' && /não encontrado/.test(e.message));
});

test('githubStore: branch inexistente é erro de configuração', async () => {
  const gh = criarFakeGitHub({ arquivo: null });
  const store = createGitHubStore({ ...gh.opcoes, branch: 'nao-existe', fetch: gh.fetch, log: () => {}, ttlMs: 0 });
  await assert.rejects(store.ler(), (e: unknown) => e instanceof RemoteStoreError && e.tipo === 'config' && /branch/i.test(e.message));
});

test('githubStore: grava com o SHA lido, na branch certa, em JSON legível com quebra de linha final', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A')) });
  const { store } = loja(gh);
  const snap = await store.ler({ fresh: true });
  const nova = await store.gravar([...snap.destinos, novoDestino('b', 'B')], snap.version, 'Adiciona destino "B" (painel)');

  const [put] = gh.chamadas('PUT');
  assert.equal(put.body?.sha, snap.version);
  assert.equal(put.body?.branch, 'main');
  assert.equal(put.body?.message, 'Adiciona destino "B" (painel)');
  assert.equal(nova, gh.sha());
  const final = gh.estado.content as string;
  assert.ok(final.endsWith('}\n]\n') || final.endsWith(']\n'));
  assert.ok(final.includes('\n  {\n    "id": "a"')); // 2 espaços, igual ao seed
  assert.deepEqual((gh.json() as { id: string }[]).map((d) => d.id), ['a', 'b']);
});

test('githubStore: criação do arquivo (sem versão) não envia sha', async () => {
  const gh = criarFakeGitHub({ arquivo: null });
  const { store } = loja(gh);
  const snap = await store.ler({ fresh: true });
  await store.gravar([novoDestino('a', 'A')], snap.version, 'cria');
  assert.equal(gh.chamadas('PUT')[0].body?.sha, undefined);
  assert.equal((gh.json() as unknown[]).length, 1);
});

test('githubStore: depois de gravar, a leitura não fresca já enxerga o que foi gravado (sem nova chamada)', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A')) });
  const { store } = loja(gh, { ttlMs: 60_000 });
  const snap = await store.ler({ fresh: true });
  await store.gravar([...snap.destinos, novoDestino('b', 'B')], snap.version, 'm');
  const chamadasAntes = gh.chamadas().length;
  const lida = await store.ler();
  assert.deepEqual(lida.destinos.map((d) => d.id), ['a', 'b']);
  assert.equal(gh.chamadas().length, chamadasAntes);
});

test('githubStore: versão desatualizada vira ConflictError e NADA é gravado por cima', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A')) });
  const { store } = loja(gh);
  const snap = await store.ler({ fresh: true });
  gh.commitExterno(conteudo(destinoJson('a', 'A'), destinoJson('ext', 'Feito por fora')));
  await assert.rejects(store.gravar([novoDestino('b', 'B')], snap.version, 'm'), ConflictError);
  assert.deepEqual((gh.json() as { id: string }[]).map((d) => d.id), ['a', 'ext']);
});

test('githubStore: 422 "sha wasn\'t supplied" (arquivo foi criado por outro) também é conflito', async () => {
  const gh = criarFakeGitHub({ arquivo: null });
  const { store } = loja(gh);
  const snap = await store.ler({ fresh: true });
  gh.commitExterno(conteudo(destinoJson('ext', 'Criado por fora')));
  await assert.rejects(store.gravar([novoDestino('b', 'B')], snap.version, 'm'), ConflictError);
  assert.equal((gh.json() as unknown[]).length, 1);
});

test('githubStore: depois de um conflito o cache é descartado e a releitura traz o dado novo', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A')) });
  const { store } = loja(gh, { ttlMs: 60_000 });
  const snap = await store.ler({ fresh: true });
  gh.commitExterno(conteudo(destinoJson('a', 'A'), destinoJson('ext', 'X')));
  await assert.rejects(store.gravar([], snap.version, 'm'), ConflictError);
  const depois = await store.ler();
  assert.deepEqual(depois.destinos.map((d) => d.id), ['a', 'ext']);
});

test('githubStore: uma leitura lenta que começou ANTES da gravação não sobrescreve o cache com dado velho', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A')) });
  const { store } = loja(gh, { ttlMs: 60_000 });
  const versaoAntiga = gh.sha();

  // 1) uma leitura (sem cache, portanto sem ETag) fica retida no GitHub, com o conteúdo ANTIGO
  const liberar = gh.segurarProximoGet();
  const lenta = store.ler();
  await new Promise((r) => setImmediate(r));

  // 2) enquanto isso, uma gravação conclui e o cache passa a ter o conteúdo NOVO
  await store.gravar([novoDestino('a', 'A'), novoDestino('b', 'B')], versaoAntiga, 'm');

  // 3) a resposta antiga chega depois
  liberar();
  const respostaLenta = await lenta;
  assert.deepEqual(respostaLenta.destinos.map((d) => d.id), ['a']); // quem pediu antes recebe o que existia

  // 4) mas o cache não pode ter voltado no tempo
  const depois = await store.ler();
  assert.deepEqual(depois.destinos.map((d) => d.id), ['a', 'b']);
});

test('githubStore: 401 é erro de configuração e a mensagem não contém o token', async () => {
  const gh = criarFakeGitHub();
  const store = createGitHubStore({ ...gh.opcoes, token: 'github_pat_OUTRO_TOKEN_QUE_NAO_VALE_NADA_123456', fetch: gh.fetch, log: () => {}, ttlMs: 0 });
  await assert.rejects(store.ler(), (e: unknown) => {
    const m = (e as Error).message;
    return e instanceof RemoteStoreError && e.tipo === 'config' && /401/.test(m) && !m.includes('OUTRO_TOKEN') && !m.includes(TOKEN_FALSO);
  });
});

test('githubStore: 403 por limite de requisições é transitório; 403 por permissão é configuração', async () => {
  const gh = criarFakeGitHub();
  const { store } = loja(gh);
  gh.falharProxima((c) => c.method === 'GET', () => new Response(JSON.stringify({ message: 'API rate limit exceeded' }), { status: 403, headers: { 'x-ratelimit-remaining': '0' } }));
  await assert.rejects(store.ler(), (e: unknown) => e instanceof RemoteStoreError && e.tipo === 'transitorio');
  gh.falharProxima((c) => c.method === 'PUT', () => new Response(JSON.stringify({ message: 'Resource not accessible by personal access token' }), { status: 403 }));
  await assert.rejects(store.gravar([], gh.sha(), 'm'), (e: unknown) => e instanceof RemoteStoreError && e.tipo === 'config');
});

test('githubStore: 5xx, queda de rede e timeout são transitórios', async () => {
  const gh = criarFakeGitHub();
  const { store } = loja(gh);
  gh.falharProxima(() => true, () => new Response('{}', { status: 502 }));
  await assert.rejects(store.ler(), (e: unknown) => e instanceof RemoteStoreError && e.tipo === 'transitorio');
  gh.falharProxima(() => true, () => { throw new TypeError('fetch failed'); });
  await assert.rejects(store.ler(), (e: unknown) => e instanceof RemoteStoreError && e.tipo === 'transitorio');
  const lento = createGitHubStore({
    ...gh.opcoes, log: () => {}, ttlMs: 0, timeoutMs: 20,
    fetch: ((_u: unknown, init?: RequestInit) => new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal?.reason)))) as typeof fetch,
  });
  // Num fetch real o socket mantém o processo vivo até o timeout disparar; com este fetch falso, quem faz isso é o intervalo abaixo.
  const manterVivo = setInterval(() => {}, 10);
  try {
    await assert.rejects(lento.ler(), (e: unknown) => e instanceof RemoteStoreError && e.tipo === 'transitorio' && /tempo esgotado/.test((e as Error).message));
  } finally {
    clearInterval(manterVivo);
  }
});

test('githubStore: JSON inválido no repositório gera erro e não grava nada', async () => {
  const gh = criarFakeGitHub({ arquivo: '{ isto não é json' });
  const { store } = loja(gh);
  await assert.rejects(store.ler(), StorageError);
  assert.equal(gh.chamadas('PUT').length, 0);
  assert.equal(gh.estado.content, '{ isto não é json');
});

test('githubStore: arquivo que não é uma lista é recusado', async () => {
  const gh = criarFakeGitHub({ arquivo: '{"a":1}' });
  await assert.rejects(loja(gh).store.ler(), /formato inesperado/);
});

test('githubStore: arquivo com BOM (editado no Windows) é lido normalmente', async () => {
  const gh = criarFakeGitHub({ arquivo: '\uFEFF' + conteudo(destinoJson('a', 'A')) });
  assert.equal((await loja(gh).store.ler()).destinos.length, 1);
});

test('githubStore: lista grande demais para releitura é recusada antes de chamar o GitHub', async () => {
  const gh = criarFakeGitHub();
  const { store } = loja(gh);
  const enorme = Array.from({ length: 700 }, (_, i) => ({ ...novoDestino(String(i), 'T'), descricao: 'x'.repeat(2000) }));
  await assert.rejects(store.gravar(enorme, gh.sha(), 'm'), /grande demais/);
  assert.equal(gh.chamadas('PUT').length, 0);
});

test('githubStore: init registra a contagem; falha passageira vira aviso; token recusado derruba a subida', async () => {
  const gh = criarFakeGitHub({ arquivo: conteudo(destinoJson('a', 'A'), destinoJson('b', 'B')) });
  const ok = loja(gh);
  await ok.store.init();
  assert.match(ok.logs[0], /2 destino\(s\)/);

  gh.falharProxima(() => true, () => new Response('{}', { status: 503 }));
  const passageiro = loja(gh);
  await passageiro.store.init();
  assert.match(passageiro.logs[0], /aviso/);

  const ruim = createGitHubStore({ ...gh.opcoes, token: 'github_pat_REVOGADO_000000000000000000000', fetch: gh.fetch, log: () => {}, ttlMs: 0 });
  await assert.rejects(ruim.init(), (e: unknown) => e instanceof RemoteStoreError && e.tipo === 'config');
});
