import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createTwoFactorService } from '../src/services/twoFactorService';
import { HttpError } from '../src/utils/errors';
import { SEGREDO, fakeMailer, tempDir } from './helpers';

const DESTINO = 'dona@exemplo.com';
const MIN = 60_000;
const T0 = 1_800_000_000_000;

/** Serviço com relógio controlável. `clock.t` avança o tempo. */
function montar(dir: string, extra: Partial<Parameters<typeof createTwoFactorService>[0]> = {}) {
  const clock = { t: T0 };
  const m = fakeMailer();
  const logs: string[] = [];
  const svc = createTwoFactorService({
    dataDir: dir, jwtSecret: SEGREDO, mailer: m.mailer, destinatario: DESTINO,
    now: () => clock.t, log: (x) => logs.push(x), ...extra,
  });
  return { svc, clock, m, logs };
}

const status = async (p: Promise<unknown>) => p.then(() => 0, (e: HttpError) => e.status);
const erro = async (p: Promise<unknown>) => p.then(() => null, (e: HttpError) => e);

test('2fa: envia código de 6 dígitos ao destinatário e não o expõe (retorno nem disco)', async () => {
  const t = await tempDir();
  try {
    const { svc, m } = montar(t.dir);
    const r = await svc.solicitar();
    assert.deepEqual(Object.keys(r), ['desafio']);
    assert.equal(m.enviados.length, 1);
    assert.equal(m.enviados[0].para, DESTINO);
    assert.equal(m.enviados[0].validadeMinutos, 5);
    const codigo = m.ultimoCodigo()!;
    assert.match(codigo, /^\d{6}$/);
    assert.ok(!JSON.stringify(r).includes(codigo));
    const bruto = await fs.readFile(svc.file, 'utf8');
    assert.ok(!bruto.includes(codigo), 'o código não pode ser gravado em texto');
    assert.ok(!/codigo/i.test(bruto));
    if (process.platform !== 'win32') assert.equal((await fs.stat(svc.file)).mode & 0o777, 0o600);
  } finally { await t.limpar(); }
});

test('2fa: códigos são sempre numéricos de 6 dígitos (com zeros à esquerda) e variam', async () => {
  const t = await tempDir();
  try {
    const { svc, m } = montar(t.dir, { cooldownMs: 0, limite15min: 10_000, limite24h: 10_000 });
    for (let i = 0; i < 300; i++) await svc.solicitar();
    const codigos = m.enviados.map((e) => e.codigo);
    assert.ok(codigos.every((c) => /^\d{6}$/.test(c)));
    assert.ok(new Set(codigos).size > 280, 'esperava códigos bem distribuídos');
  } finally { await t.limpar(); }
});

test('2fa: código correto vale uma única vez', async () => {
  const t = await tempDir();
  try {
    const { svc, m } = montar(t.dir);
    const { desafio } = await svc.solicitar();
    await svc.verificar(desafio, m.ultimoCodigo()!);
    assert.equal(await status(svc.verificar(desafio, m.ultimoCodigo()!)), 401);
  } finally { await t.limpar(); }
});

test('2fa: uso único também vale sob concorrência (5 envios simultâneos do mesmo código, só 1 passa)', async () => {
  const t = await tempDir();
  try {
    const { svc, m } = montar(t.dir);
    const { desafio } = await svc.solicitar();
    const codigo = m.ultimoCodigo()!;
    const r = await Promise.all(Array.from({ length: 5 }, () => status(svc.verificar(desafio, codigo))));
    assert.equal(r.filter((s) => s === 0).length, 1);
  } finally { await t.limpar(); }
});

test('2fa: erro informa tentativas restantes; ao esgotar, o código certo também deixa de valer', async () => {
  const t = await tempDir();
  try {
    const { svc, m } = montar(t.dir, { gerarCodigo: () => '123456' });
    const { desafio } = await svc.solicitar();
    const e1 = await erro(svc.verificar(desafio, '000000'));
    assert.equal(e1?.status, 401);
    assert.deepEqual(e1?.detalhes, { tentativasRestantes: 4 });
    for (let i = 0; i < 3; i++) await svc.verificar(desafio, '000001').catch(() => {});
    assert.equal(await status(svc.verificar(desafio, '000002')), 429); // 5ª falha invalida o desafio
    assert.equal(await status(svc.verificar(desafio, m.ultimoCodigo()!)), 401); // código certo, mas tarde demais
  } finally { await t.limpar(); }
});

test('2fa: tentativas em paralelo não furam o limite de 5 erros', async () => {
  const t = await tempDir();
  try {
    const { svc, m } = montar(t.dir, { gerarCodigo: () => '123456' });
    const { desafio } = await svc.solicitar();
    const r = await Promise.all(Array.from({ length: 12 }, (_, i) => status(svc.verificar(desafio, String(i).padStart(6, '0')))));
    assert.equal(r.filter((s) => s === 429).length, 1); // só a 5ª dispara o bloqueio
    assert.equal(await status(svc.verificar(desafio, m.ultimoCodigo()!)), 401);
    assert.equal((JSON.parse(await fs.readFile(svc.file, 'utf8')) as { desafio: unknown }).desafio, null);
  } finally { await t.limpar(); }
});

test('2fa: expira em 5 minutos (vale até 4:59, não vale em 5:00)', async () => {
  const t = await tempDir();
  try {
    const { svc, clock, m } = montar(t.dir);
    const a = await svc.solicitar();
    clock.t += 5 * MIN - 1000;
    await svc.verificar(a.desafio, m.ultimoCodigo()!); // 4:59, ainda vale

    clock.t += 60 * MIN; // novo ciclo, longe de qualquer limite
    const b = await svc.solicitar();
    const codigoB = m.ultimoCodigo()!;
    clock.t += 5 * MIN;
    const e = await erro(svc.verificar(b.desafio, codigoB));
    assert.equal(e?.status, 401);
    assert.match(e!.message, /expirou/);
    assert.equal(await status(svc.verificar(b.desafio, codigoB)), 401); // e continua inválido
  } finally { await t.limpar(); }
});

test('2fa: novo pedido invalida o código anterior', async () => {
  const t = await tempDir();
  try {
    let n = 0;
    const { svc, clock, m } = montar(t.dir, { gerarCodigo: () => (++n === 1 ? '111111' : '222222') });
    const a = await svc.solicitar();
    clock.t += 31_000;
    const b = await svc.solicitar();
    assert.equal(await status(svc.verificar(a.desafio, '111111')), 401);
    assert.equal(await status(svc.verificar(b.desafio, '111111')), 401);
    await svc.verificar(b.desafio, m.ultimoCodigo()!);
  } finally { await t.limpar(); }
});

test('2fa: limite de solicitações (intervalo mínimo, 3 em 15 min, 10 em 24 h)', async () => {
  const t = await tempDir();
  try {
    const { svc, clock, m } = montar(t.dir);
    await svc.solicitar();
    const cd = await erro(svc.solicitar()); // imediatamente depois
    assert.equal(cd?.status, 429);
    assert.ok((cd?.retryAfterSeg ?? 0) >= 1 && (cd?.retryAfterSeg ?? 99) <= 30);

    clock.t += 31_000; await svc.solicitar();
    clock.t += 31_000; await svc.solicitar();
    clock.t += 31_000;
    const m15 = await erro(svc.solicitar()); // 4º em menos de 15 min
    assert.equal(m15?.status, 429);
    assert.ok((m15?.retryAfterSeg ?? 0) > 60);
    assert.equal(m.enviados.length, 3, 'pedidos bloqueados não enviam e-mail');

    clock.t = T0 + 15 * MIN + 1000; // a primeira solicitação saiu da janela
    await svc.solicitar();
    assert.equal(m.enviados.length, 4);
  } finally { await t.limpar(); }
});

test('2fa: limite diário', async () => {
  const t = await tempDir();
  try {
    const { svc, clock } = montar(t.dir, { cooldownMs: 0, limite15min: 100, limite24h: 4 });
    for (let i = 0; i < 4; i++) { await svc.solicitar(); clock.t += 1000; }
    assert.equal(await status(svc.solicitar()), 429);
    clock.t = T0 + 24 * 60 * MIN + 1000;
    await svc.solicitar();
  } finally { await t.limpar(); }
});

test('2fa: falha no envio retorna 502, descarta o desafio, conta no limite e não vaza o código no log', async () => {
  const t = await tempDir();
  try {
    const { svc, m, logs, clock } = montar(t.dir, { gerarCodigo: () => '654321' });
    m.estado.modo = 'falha';
    m.estado.erro = new Error('SMTP recusou: código 654321 não entregue');
    const e = await erro(svc.solicitar());
    assert.equal(e?.status, 502);
    assert.ok(!e!.message.includes('654321'));
    assert.ok(logs.length >= 1);
    assert.ok(logs.every((l) => !l.includes('654321')), 'o código não pode aparecer no log');
    assert.equal((JSON.parse(await fs.readFile(svc.file, 'utf8')) as { desafio: unknown }).desafio, null);
    assert.equal((await erro(svc.solicitar()))?.status, 429); // o pedido contou (intervalo mínimo)

    m.estado.modo = 'ok';
    clock.t += 31_000;
    await svc.solicitar(); // recupera quando o provedor volta
    assert.equal(m.enviados.length, 1);
  } finally { await t.limpar(); }
});

test('2fa: provedor que não responde estoura o tempo limite e retorna 502', async () => {
  const t = await tempDir();
  try {
    const { svc, m } = montar(t.dir, { timeoutEnvioMs: 40 });
    m.estado.modo = 'trava';
    const antes = Date.now();
    assert.equal(await status(svc.solicitar()), 502);
    assert.ok(Date.now() - antes < 1500);
  } finally { await t.limpar(); }
});

test('2fa: código malformado retorna 400 e não gasta tentativa', async () => {
  const t = await tempDir();
  try {
    const { svc, m } = montar(t.dir);
    const { desafio } = await svc.solicitar();
    for (const ruim of ['', 'abc123', '12345', '1234567', '12 456', '１２３４５６']) assert.equal(await status(svc.verificar(desafio, ruim)), 400, ruim);
    const e = await erro(svc.verificar(desafio, m.ultimoCodigo() === '000000' ? '000001' : '000000'));
    assert.deepEqual(e?.detalhes, { tentativasRestantes: 4 });
  } finally { await t.limpar(); }
});

test('2fa: desafio desconhecido retorna 401', async () => {
  const t = await tempDir();
  try {
    const { svc } = montar(t.dir);
    assert.equal(await status(svc.verificar('inexistente', '123456')), 401);
    await svc.solicitar();
    assert.equal(await status(svc.verificar('inexistente', '123456')), 401);
  } finally { await t.limpar(); }
});

test('2fa: sobrevive a reinício do servidor (estado em disco) e mantém os limites', async () => {
  const t = await tempDir();
  try {
    const a = montar(t.dir);
    const { desafio } = await a.svc.solicitar();
    const codigo = a.m.ultimoCodigo()!;

    const b = montar(t.dir); // "reinício": nova instância, mesma pasta de dados
    assert.equal((await erro(b.svc.solicitar()))?.status, 429, 'o intervalo mínimo continua valendo após reiniciar');
    await b.svc.verificar(desafio, codigo);
  } finally { await t.limpar(); }
});

test('2fa: estado corrompido não trava o login (recomeça vazio e registra o aviso)', async () => {
  const t = await tempDir();
  try {
    const { svc, logs, m } = montar(t.dir);
    await fs.writeFile(svc.file, '{ lixo', 'utf8');
    await svc.solicitar();
    assert.equal(m.enviados.length, 1);
    assert.ok(logs.some((l) => /corrompido/.test(l)));
  } finally { await t.limpar(); }
});
