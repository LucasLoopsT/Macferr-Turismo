import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authenticate } from '../src/middlewares/authenticate';
import { createLoginLimiter } from '../src/middlewares/rateLimit';
import { errorHandler, notFound } from '../src/middlewares/errorHandler';
import { createAuthService } from '../src/services/authService';
import { HttpError, StorageError } from '../src/utils/errors';
import { SEGREDO, SENHA, fakeRes } from './helpers';

const auth = createAuthService({ adminPassword: SENHA, jwtSecret: SEGREDO, expiresIn: '1h' });
const reqComAuth = (authorization?: string) => ({ headers: authorization === undefined ? {} : { authorization } }) as never;

function rodar(authorization?: string) {
  const res = fakeRes();
  let chamou = false;
  authenticate(auth)(reqComAuth(authorization), res as never, () => { chamou = true; });
  return { res, chamou };
}

test('authenticate: sem cabeçalho Authorization retorna 401', () => {
  const { res, chamou } = rodar();
  assert.equal(res.statusCode, 401);
  assert.equal(chamou, false);
  assert.equal(res.headers['www-authenticate'], 'Bearer');
});

test('authenticate: esquema errado, token vazio ou lixo retornam 401', () => {
  for (const h of ['', 'Bearer', 'Bearer ', 'Basic abc', 'Token abc', 'Bearer lixo', 'Bearer a b']) {
    const { res, chamou } = rodar(h);
    assert.equal(res.statusCode, 401, h);
    assert.equal(chamou, false, h);
  }
});

test('authenticate: token de outro segredo, expirado ou adulterado retorna 401', () => {
  assert.equal(rodar('Bearer ' + jwt.sign({ role: 'admin' }, 'outro-segredo-com-mais-de-32-caracteres-ok')).res.statusCode, 401);
  const expirado = jwt.sign({ role: 'admin' }, SEGREDO, { expiresIn: -10 });
  assert.equal(rodar('Bearer ' + expirado).res.statusCode, 401);
  assert.equal(rodar('Bearer ' + auth.emitirToken() + 'x').res.statusCode, 401);
});

test('authenticate: token válido chama next() sem responder', () => {
  const { res, chamou } = rodar('Bearer ' + auth.emitirToken());
  assert.equal(chamou, true);
  assert.equal(res.ended, false);
  assert.equal(rodar('bearer ' + auth.emitirToken()).chamou, true); // esquema sem diferenciar maiúsculas
});

test('login limiter: bloqueia depois de N falhas, libera após a janela e zera no sucesso', () => {
  let agora = 1_000_000;
  const l = createLoginLimiter({ max: 3, windowMs: 60_000, now: () => agora });
  const passa = (ip: string) => {
    const res = fakeRes();
    let ok = false;
    l.middleware({ ip } as never, res as never, () => { ok = true; });
    return { ok, res };
  };
  assert.equal(passa('1.1.1.1').ok, true);
  for (let i = 0; i < 3; i++) l.registrarFalha('1.1.1.1');
  const bloqueado = passa('1.1.1.1');
  assert.equal(bloqueado.ok, false);
  assert.equal(bloqueado.res.statusCode, 429);
  assert.ok(Number(bloqueado.res.headers['retry-after']) > 0);
  assert.equal(passa('2.2.2.2').ok, true); // outro IP não é afetado
  agora += 61_000;
  assert.equal(passa('1.1.1.1').ok, true); // janela expirou
  l.registrarFalha('3.3.3.3'); l.registrarFalha('3.3.3.3'); l.limpar('3.3.3.3');
  l.registrarFalha('3.3.3.3'); l.registrarFalha('3.3.3.3');
  assert.equal(passa('3.3.3.3').ok, true);
});

test('errorHandler: HttpError vira a resposta correspondente, com detalhes', () => {
  const res = fakeRes();
  errorHandler({ log: () => {} })(new HttpError(400, 'Dados inválidos.', [{ campo: 'x' }]), {} as never, res as never, () => {});
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { erro: 'Dados inválidos.', detalhes: [{ campo: 'x' }] });
});

test('errorHandler: erros do body-parser viram 413 e 400', () => {
  const r1 = fakeRes();
  errorHandler({ log: () => {} })(Object.assign(new Error('x'), { type: 'entity.too.large', status: 413 }), {} as never, r1 as never, () => {});
  assert.equal(r1.statusCode, 413);
  const r2 = fakeRes();
  errorHandler({ log: () => {} })(Object.assign(new SyntaxError('x'), { type: 'entity.parse.failed', status: 400 }), {} as never, r2 as never, () => {});
  assert.equal(r2.statusCode, 400);
});

test('errorHandler: erro inesperado vira 500 genérico, sem vazar stack nem detalhes', () => {
  const logs: string[] = [];
  const res = fakeRes();
  errorHandler({ log: (m) => logs.push(m) })(new Error('senha do banco: 123'), {} as never, res as never, () => {});
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { erro: 'Erro interno do servidor.' });
  assert.ok(!JSON.stringify(res.body).includes('senha do banco'));
  assert.equal(logs.length, 1);
  const r2 = fakeRes();
  errorHandler({ log: () => {} })(new StorageError('/var/data/destinos.json corrompido'), {} as never, r2 as never, () => {});
  assert.deepEqual(r2.body, { erro: 'Erro interno do servidor.' });
});

test('notFound: 404 em JSON', () => {
  const res = fakeRes();
  notFound({} as never, res as never);
  assert.equal(res.statusCode, 404);
});
