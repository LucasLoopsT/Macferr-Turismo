// Rodar (sem instalar nada no projeto):  npx tsx --test tests/destinosGithub.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESTINOS_JSON_URL, fetchDestinosPublicados, interpretarDestinos, resolverImagem, urlDestinosJson,
} from '../src/lib/destinosGithub';

const item = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, titulo: `T-${id}`, descricao: 'd', data: 'x', viajantes: 1, categoria: 'Nacional', imagem: '', status, preco: '', tags: [], fotos: [], ...extra,
});
const respostaJson = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

test('a URL padrão é o raw.githubusercontent.com do destinos.json do repositório (nunca o backend do Render)', () => {
  assert.equal(DESTINOS_JSON_URL, 'https://raw.githubusercontent.com/LucasLoopsT/Macferr-Turismo/main/backend/seed/destinos.json');
  assert.ok(!/onrender\.com/.test(DESTINOS_JSON_URL));
});

test('o parâmetro de cache muda a cada minuto e é igual dentro do mesmo minuto', () => {
  const t = Date.UTC(2026, 9, 26, 12, 0, 5);
  assert.equal(urlDestinosJson(t), urlDestinosJson(t + 50_000));
  assert.notEqual(urlDestinosJson(t), urlDestinosJson(t + 60_000));
  assert.match(urlDestinosJson(t), /\.json\?v=\d+$/);
  assert.match(urlDestinosJson(t, 'https://x.com/a.json?ref=1'), /\?ref=1&v=\d+$/);
});

test('separa próximas e realizadas, descarta rascunhos e mantém a ordem do arquivo', async () => {
  const dados = [item('1', 'Finalizada'), item('2', 'Rascunho'), item('3', 'Disponivel'), item('4', 'Esgotada'), item('5', 'Finalizada')];
  const { proximas, realizadas } = await fetchDestinosPublicados({ fetchImpl: async () => respostaJson(dados) });
  assert.deepEqual(proximas.map((d) => d.id), ['3', '4']);
  assert.deepEqual(realizadas.map((d) => d.id), ['1', '5']);
});

test('faz um único GET, em URL do GitHub, sem cache do navegador e sem cabeçalhos que exijam preflight de CORS', async () => {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  await fetchDestinosPublicados({ fetchImpl: async (url, init) => { chamadas.push({ url: String(url), init }); return respostaJson([]); } });
  assert.equal(chamadas.length, 1);
  assert.match(chamadas[0].url, /^https:\/\/raw\.githubusercontent\.com\//);
  assert.equal(chamadas[0].init?.cache, 'no-store');
  assert.equal(chamadas[0].init?.headers, undefined);
  assert.ok(!chamadas[0].init?.method || chamadas[0].init.method === 'GET');
});

test('registros antigos (sem status) são tratados como realizados, como no backend', () => {
  const [d] = interpretarDestinos([{ id: 'a', titulo: 'A', descricao: 'd', data: 'x', viajantes: 2, categoria: 'Nacional', imagem: '' }]);
  assert.deepEqual([d.status, d.preco, d.tags, d.fotos], ['Finalizada', '', [], []]);
});

test('imagens enviadas pelo painel (/uploads/...) ganham o endereço do backend; URLs externas ficam como estão', () => {
  assert.equal(resolverImagem('/uploads/a.jpg', 'https://api.exemplo.com/'), 'https://api.exemplo.com/uploads/a.jpg');
  assert.equal(resolverImagem('https://images.unsplash.com/x.jpg', 'https://api.exemplo.com'), 'https://images.unsplash.com/x.jpg');
  assert.equal(resolverImagem('', 'https://api.exemplo.com'), '');
  const [d] = interpretarDestinos([item('a', 'Disponivel', { imagem: '/uploads/capa.jpg', fotos: ['/uploads/f1.jpg'] })]);
  assert.match(d.imagem, /^https:\/\/.+\/uploads\/capa\.jpg$/);
  assert.match(d.fotos[0], /^https:\/\/.+\/uploads\/f1\.jpg$/);
});

test('entradas inválidas: não é lista → erro; itens sem id são ignorados sem derrubar a página', () => {
  assert.throws(() => interpretarDestinos({ a: 1 }), /não é uma lista/);
  assert.throws(() => interpretarDestinos(null), /não é uma lista/);
  assert.deepEqual(interpretarDestinos([null, 3, 'x', {}, { id: '' }, item('ok', 'Disponivel')]).map((d) => d.id), ['ok']);
});

test('erro HTTP ou JSON inválido rejeitam (a página mostra "Tentar de novo")', async () => {
  await assert.rejects(fetchDestinosPublicados({ fetchImpl: async () => respostaJson({}, 404) }), /404/);
  await assert.rejects(fetchDestinosPublicados({ fetchImpl: async () => new Response('não é json', { status: 200 }) }));
  await assert.rejects(fetchDestinosPublicados({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }));
});
