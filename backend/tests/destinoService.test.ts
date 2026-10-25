import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createDestinoService } from '../src/services/destinoService';
import { StorageError } from '../src/utils/errors';
import { tempDir } from './helpers';

const base = {
  titulo: 'T',
  descricao: 'D',
  data: 'Mês 2025',
  viajantes: 3,
  categoria: 'Nacional',
  imagem: '',
  status: 'Finalizada' as const,
  preco: '',
  tags: [] as string[],
  fotos: [] as string[],
};

test('destinoService: começa vazio e cria com id gerado pelo backend', async () => {
  const t = await tempDir();
  try {
    const s = createDestinoService({ dataDir: t.dir });
    await s.init();
    assert.deepEqual(await s.list(), []);
    const a = await s.create(base);
    const b = await s.create(base);
    assert.match(a.id, /^[0-9a-f-]{36}$/);
    assert.notEqual(a.id, b.id);
    assert.equal((await s.list()).length, 2);
  } finally { await t.limpar(); }
});

test('destinoService: update altera campos, mas mantém o id', async () => {
  const t = await tempDir();
  try {
    const s = createDestinoService({ dataDir: t.dir });
    const a = await s.create(base);
    const r = await s.update(a.id, { titulo: 'Novo', id: 'tentativa' } as never);
    assert.equal(r?.after.id, a.id);
    assert.equal(r?.after.titulo, 'Novo');
    assert.equal(r?.before.titulo, 'T');
    assert.equal((await s.get(a.id))?.id, a.id);
    assert.equal(await s.update('nao-existe', { titulo: 'x' }), null);
  } finally { await t.limpar(); }
});

test('destinoService: remove devolve o registro e depois não existe mais', async () => {
  const t = await tempDir();
  try {
    const s = createDestinoService({ dataDir: t.dir });
    const a = await s.create(base);
    assert.equal((await s.remove(a.id))?.id, a.id);
    assert.equal(await s.remove(a.id), null);
    assert.equal(await s.get(a.id), null);
  } finally { await t.limpar(); }
});

test('destinoService: dados persistem entre instâncias (simula reinício do servidor)', async () => {
  const t = await tempDir();
  try {
    const a = await createDestinoService({ dataDir: t.dir }).create(base);
    const depois = createDestinoService({ dataDir: t.dir });
    assert.deepEqual((await depois.list()).map((d) => d.id), [a.id]);
  } finally { await t.limpar(); }
});

test('destinoService: 60 criações simultâneas não perdem nem corrompem registros', async () => {
  const t = await tempDir();
  try {
    const s = createDestinoService({ dataDir: t.dir });
    await Promise.all(Array.from({ length: 60 }, (_, i) => s.create({ ...base, titulo: `T${i}` })));
    const lista = await s.list();
    assert.equal(lista.length, 60);
    assert.equal(new Set(lista.map((d) => d.id)).size, 60);
    JSON.parse(await fs.readFile(s.file, 'utf8')); // arquivo íntegro
    const sobras = (await fs.readdir(t.dir)).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(sobras, []);
  } finally { await t.limpar(); }
});

test('destinoService: updates simultâneos no mesmo registro não se perdem', async () => {
  const t = await tempDir();
  try {
    const s = createDestinoService({ dataDir: t.dir });
    const a = await s.create(base);
    await Promise.all([s.update(a.id, { titulo: 'A' }), s.update(a.id, { descricao: 'B' }), s.update(a.id, { viajantes: 9 })]);
    const f = await s.get(a.id);
    assert.deepEqual([f?.titulo, f?.descricao, f?.viajantes], ['A', 'B', 9]);
  } finally { await t.limpar(); }
});

test('destinoService: guarda backup (.bak) do estado anterior a cada gravação', async () => {
  const t = await tempDir();
  try {
    const s = createDestinoService({ dataDir: t.dir });
    await s.create(base);
    await s.create(base);
    const bak = JSON.parse(await fs.readFile(s.file + '.bak', 'utf8'));
    assert.equal(bak.length, 1);
  } finally { await t.limpar(); }
});

test('destinoService: arquivo corrompido gera erro e NÃO é sobrescrito', async () => {
  const t = await tempDir();
  try {
    const s = createDestinoService({ dataDir: t.dir });
    await fs.writeFile(s.file, '{ isto não é json', 'utf8');
    await assert.rejects(s.list(), StorageError);
    await assert.rejects(s.create(base), StorageError);
    assert.equal(await fs.readFile(s.file, 'utf8'), '{ isto não é json');
  } finally { await t.limpar(); }
});

test('destinoService: seed só é aplicado quando o arquivo ainda não existe', async () => {
  const t = await tempDir();
  try {
    const seed = path.join(t.dir, 'seed.json');
    await fs.writeFile(seed, JSON.stringify([{ id: 'seed-1', titulo: 'S', descricao: 'd', data: 'x', viajantes: 1, categoria: 'Nacional', imagem: '' }]));
    const dataDir = path.join(t.dir, 'dados');
    const s = createDestinoService({ dataDir, seedFile: seed });
    await s.init();
    assert.equal((await s.list())[0].id, 'seed-1');
    await s.remove('seed-1');
    await createDestinoService({ dataDir, seedFile: seed }).init(); // reinício: não ressuscita o seed
    assert.deepEqual(await s.list(), []);
  } finally { await t.limpar(); }
});

test('destinoService: registros antigos (sem fotos/status/preço/tags) são lidos com valores padrão', async () => {
  const t = await tempDir();
  try {
    const s = createDestinoService({ dataDir: t.dir });
    await fs.writeFile(path.join(t.dir, 'destinos.json'), JSON.stringify([{ id: 'velho', titulo: 'V', descricao: 'd', data: 'x', viajantes: 2, categoria: 'Nacional', imagem: '' }]));
    const [d] = await s.list();
    assert.deepEqual([d.status, d.preco, d.tags, d.fotos], ['realizada', '', [], []]);
    const r = await s.update('velho', { fotos: ['/uploads/a.jpg'] });
    assert.deepEqual(r?.after.fotos, ['/uploads/a.jpg']);
  } finally { await t.limpar(); }
});


test('destinoService: separa próximas viagens e realizadas', async () => {
  const t = await tempDir();

  try {
    const s = createDestinoService({ dataDir: t.dir });

    await s.create({ ...base, titulo: 'Rascunho', status: 'Rascunho' });
    await s.create({ ...base, titulo: 'Disponível', status: 'Disponivel' });
    await s.create({ ...base, titulo: 'Esgotada', status: 'Esgotada' });
    await s.create({ ...base, titulo: 'Finalizada', status: 'Finalizada' });

    const proximas = await s.listProximas();
    const realizadas = await s.listRealizadas();
    const todas = await s.list();

    assert.deepEqual(
      proximas.map((d) => d.titulo).sort(),
      ['Disponível', 'Esgotada'],
    );

    assert.deepEqual(
      realizadas.map((d) => d.titulo),
      ['Finalizada'],
    );

    // O CRUD administrativo continua acessando todos os registros.
    assert.equal(todas.length, 4);
  } finally {
    await t.limpar();
  }
});

test('destinoService: converte status antigos para o novo contrato', async () => {
  const t = await tempDir();

  try {
    const s = createDestinoService({ dataDir: t.dir });

    await fs.writeFile(
      s.file,
      JSON.stringify([
        { id: 'antigo-proxima', status: 'proxima' },
        { id: 'antigo-realizada', status: 'realizada' },
        { id: 'sem-status' },
      ]),
      'utf8',
    );

    const lista = await s.list();

    assert.deepEqual(
      lista.map((d) => d.status),
      ['Disponivel', 'Finalizada', 'Finalizada'],
    );
  } finally {
    await t.limpar();
  }
});

test('destinoService: imagensEmUso inclui a capa e as fotos adicionais', async () => {
  const t = await tempDir();
  try {
    const s = createDestinoService({ dataDir: t.dir });
    await s.create({ ...base, imagem: '/uploads/capa.jpg', fotos: ['/uploads/f1.jpg', '/uploads/f2.jpg'] });
    assert.deepEqual([...(await s.imagensEmUso())].sort(), ['/uploads/capa.jpg', '/uploads/f1.jpg', '/uploads/f2.jpg']);
  } finally { await t.limpar(); }
});
