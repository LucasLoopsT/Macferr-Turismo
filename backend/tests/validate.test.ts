import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDestino } from '../src/utils/validate';
import { HttpError } from '../src/utils/errors';

const valido = { titulo: ' Europa ', descricao: 'Desc', data: 'Maio 2025', viajantes: 12, categoria: 'Europa', imagem: '' };

test('validate: criação aceita dados válidos, aplica trim e defaults', () => {
  const r = validateDestino({ titulo: ' X ', descricao: 'd', data: 'hoje', categoria: 'Nacional' }, 'create');
  assert.deepEqual(r, { titulo: 'X', descricao: 'd', data: 'hoje', categoria: 'Nacional', viajantes: 0, imagem: '', status: 'realizada', preco: '', tags: [], fotos: [] });
});

test('validate: descarta id e campos desconhecidos', () => {
  const r = validateDestino({ ...valido, id: 'hack', admin: true }, 'create') as Record<string, unknown>;
  assert.ok(!('id' in r) && !('admin' in r));
});

test('validate: criação sem campos obrigatórios retorna 400 com detalhes', () => {
  assert.throws(() => validateDestino({}, 'create'), (e: HttpError) => e.status === 400 && Array.isArray(e.detalhes) && (e.detalhes as unknown[]).length === 4);
});

test('validate: tipos errados e limites são recusados', () => {
  for (const ruim of [
    { ...valido, viajantes: '12' }, { ...valido, viajantes: -1 }, { ...valido, viajantes: 1.5 },
    { ...valido, titulo: '   ' }, { ...valido, titulo: 'a'.repeat(121) }, { ...valido, descricao: 5 },
  ]) {
    assert.throws(() => validateDestino(ruim, 'create'), (e: HttpError) => e.status === 400);
  }
});

test('validate: corpo que não é objeto é recusado', () => {
  for (const ruim of [null, undefined, 'texto', 42, [1, 2]]) {
    assert.throws(() => validateDestino(ruim, 'create'), (e: HttpError) => e.status === 400);
  }
});

test('validate: atualização é parcial, mas não pode ser vazia', () => {
  assert.deepEqual(validateDestino({ titulo: 'Novo' }, 'update'), { titulo: 'Novo' });
  assert.throws(() => validateDestino({}, 'update'), (e: HttpError) => e.status === 400);
  assert.throws(() => validateDestino({ id: 'outro' }, 'update'), (e: HttpError) => e.status === 400);
  assert.throws(() => validateDestino({ viajantes: 'x' }, 'update'), (e: HttpError) => e.status === 400);
});

test('validate: fotos — aceita até 5, faz trim e recusa 6 ou tipos errados', () => {
  const r = validateDestino({ ...valido, fotos: [' https://x.com/a.jpg ', '', 'https://x.com/b.jpg'] }, 'create');
  assert.deepEqual(r.fotos, ['https://x.com/a.jpg', 'https://x.com/b.jpg']);
  const seis = Array.from({ length: 6 }, (_, i) => `https://x.com/${i}.jpg`);
  assert.throws(() => validateDestino({ ...valido, fotos: seis }, 'create'), (e: HttpError) => e.status === 400);
  assert.throws(() => validateDestino({ ...valido, fotos: 'x' }, 'create'), (e: HttpError) => e.status === 400);
  assert.throws(() => validateDestino({ fotos: [1] }, 'update'), (e: HttpError) => e.status === 400);
});

test('validate: status, preço e tags', () => {
  assert.equal(validateDestino({ ...valido, status: 'proxima', preco: ' R$ 5.000 ', tags: ['a', ' a ', 'b'] }, 'create').status, 'proxima');
  assert.deepEqual(validateDestino({ tags: ['a', ' a ', 'b', ''] }, 'update'), { tags: ['a', 'b'] });
  assert.throws(() => validateDestino({ ...valido, status: 'cancelada' }, 'create'), (e: HttpError) => e.status === 400);
  assert.throws(() => validateDestino({ ...valido, tags: Array.from({ length: 7 }, (_, i) => `t${i}`) }, 'create'), (e: HttpError) => e.status === 400);
});
