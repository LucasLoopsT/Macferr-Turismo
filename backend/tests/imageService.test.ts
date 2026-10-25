import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createImageService, detectarImagem } from '../src/services/imageService';
import { HttpError } from '../src/utils/errors';
import { JPEG_MIN, PNG_1X1, tempDir } from './helpers';

const BASE = 'http://localhost:3001';
const svc = (dir: string, maxBytes = 1024 * 1024) => createImageService({ uploadDir: path.join(dir, 'uploads'), publicBaseUrl: BASE, maxBytes });
const status = async (p: Promise<unknown>) => p.then(() => 0, (e: HttpError) => e.status);

test('imagens: detecta tipo real pelos bytes', () => {
  assert.equal(detectarImagem(PNG_1X1)?.mime, 'image/png');
  assert.equal(detectarImagem(JPEG_MIN)?.mime, 'image/jpeg');
  assert.equal(detectarImagem(Buffer.from('GIF89a......'))?.mime, 'image/gif');
  assert.equal(detectarImagem(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))?.mime, 'image/webp');
  assert.equal(detectarImagem(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectarImagem(Buffer.from('#!/bin/sh\necho oi')), null);
});

test('imagens: salva com nome gerado (uuid) e devolve caminho e URL pública', async () => {
  const t = await tempDir();
  try {
    const s = svc(t.dir);
    const r = await s.salvar(PNG_1X1, 'image/png');
    assert.match(r.path, /^\/uploads\/[0-9a-f-]{36}\.png$/);
    assert.equal(r.url, BASE + r.path);
    assert.deepEqual(await fs.readFile(path.join(t.dir, 'uploads', path.basename(r.path))), PNG_1X1);
  } finally { await t.limpar(); }
});

test('imagens: recusa arquivo falso, tipo divergente, vazio e grande demais', async () => {
  const t = await tempDir();
  try {
    const s = svc(t.dir, 100);
    assert.equal(await status(s.salvar(Buffer.from('não sou imagem'), 'image/png')), 415);
    assert.equal(await status(s.salvar(PNG_1X1, 'image/jpeg')), 415);
    assert.equal(await status(s.salvar(Buffer.alloc(0), 'image/png')), 400);
    assert.equal(await status(s.salvar(Buffer.concat([PNG_1X1, Buffer.alloc(200)]), 'image/png')), 413);
    assert.deepEqual(await fs.readdir(path.join(t.dir, 'uploads')).catch(() => []), []);
  } finally { await t.limpar(); }
});

test('imagens: normalizar aceita vazio, URL externa e URL da própria API', async () => {
  const t = await tempDir();
  try {
    const s = svc(t.dir);
    assert.equal(await s.normalizar(''), '');
    assert.equal(await s.normalizar('https://images.unsplash.com/foto.jpg?w=1'), 'https://images.unsplash.com/foto.jpg?w=1');
    const { path: p, url } = await s.salvar(PNG_1X1, 'image/png');
    assert.equal(await s.normalizar(url), p);
    assert.equal(await s.normalizar(p), p);
    assert.equal(s.paraUrlPublica(p), url);
    assert.equal(s.paraUrlPublica('https://x.com/a.jpg'), 'https://x.com/a.jpg');
  } finally { await t.limpar(); }
});

test('imagens: normalizar recusa caminhos arbitrários, esquemas perigosos e arquivo inexistente', async () => {
  const t = await tempDir();
  try {
    const s = svc(t.dir);
    for (const ruim of [
      '/uploads/../../etc/passwd', '/uploads/%2e%2e/x.png', '/etc/passwd', '../x.png', 'x.png',
      'javascript:alert(1)', 'data:text/html;base64,AAAA', 'file:///etc/passwd',
      '/uploads/00000000-0000-0000-0000-000000000000.png', // formato certo, mas não existe
    ]) {
      assert.equal(await status(s.normalizar(ruim)), 400, ruim);
    }
  } finally { await t.limpar(); }
});

test('imagens: remover só apaga uploads com nome seguro', async () => {
  const t = await tempDir();
  try {
    const s = svc(t.dir);
    const { path: p } = await s.salvar(PNG_1X1, 'image/png');
    const outro = path.join(t.dir, 'importante.txt');
    await fs.writeFile(outro, 'não apagar');
    await s.remover('/uploads/../importante.txt');
    await s.remover('https://images.unsplash.com/a.jpg');
    await fs.access(outro);
    await s.remover(p);
    await assert.rejects(fs.access(path.join(t.dir, 'uploads', path.basename(p))));
    await s.remover(p); // já ausente: não lança
  } finally { await t.limpar(); }
});

test('imagens: limpeza de órfãos preserva arquivos em uso e arquivos recentes', async () => {
  const t = await tempDir();
  try {
    const s = svc(t.dir);
    const usada = await s.salvar(PNG_1X1, 'image/png');
    const orfaAntiga = await s.salvar(PNG_1X1, 'image/png');
    const orfaNova = await s.salvar(PNG_1X1, 'image/png');
    const velho = new Date(Date.now() - 48 * 3600 * 1000);
    await fs.utimes(path.join(t.dir, 'uploads', path.basename(orfaAntiga.path)), velho, velho);
    await fs.utimes(path.join(t.dir, 'uploads', path.basename(usada.path)), velho, velho);
    const n = await s.limparOrfaos(new Set([usada.path]), 24 * 3600 * 1000);
    assert.equal(n, 1);
    const restantes = (await fs.readdir(path.join(t.dir, 'uploads'))).sort();
    assert.deepEqual(restantes, [path.basename(usada.path), path.basename(orfaNova.path)].sort());
  } finally { await t.limpar(); }
});
