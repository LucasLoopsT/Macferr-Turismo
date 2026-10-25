import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createAuthService } from '../src/services/authService';
import { SEGREDO, SENHA } from './helpers';

const novo = (expiresIn = '8h') => createAuthService({ adminPassword: SENHA, jwtSecret: SEGREDO, expiresIn });

test('auth: senha correta passa e incorretas/inválidas não', () => {
  const a = novo();
  assert.equal(a.verificarSenha(SENHA), true);
  for (const ruim of ['', 'errada', SENHA + ' ', SENHA.toUpperCase(), undefined, null, 123, {}, 'x'.repeat(1000)]) {
    assert.equal(a.verificarSenha(ruim), false, String(ruim));
  }
});

test('auth: token emitido é válido e tem expiração', () => {
  const a = novo('30m');
  const token = a.emitirToken();
  assert.equal(a.verificarToken(token), true);
  const p = jwt.decode(token) as { role: string; exp: number; iat: number };
  assert.equal(p.role, 'admin');
  assert.equal(p.exp - p.iat, 30 * 60);
});

test('auth: token expirado é recusado', async () => {
  const a = novo('1s');
  const token = a.emitirToken();
  assert.equal(a.verificarToken(token), true);
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(a.verificarToken(token), false);
});

test('auth: token adulterado, de outro segredo, sem assinatura ou sem role é recusado', () => {
  const a = novo();
  const valido = a.emitirToken();
  const [h, p, s] = valido.split('.');
  assert.equal(a.verificarToken(`${h}.${p}.${s.slice(0, -2)}xx`), false); // assinatura alterada
  assert.equal(a.verificarToken(jwt.sign({ role: 'admin' }, 'outro-segredo-qualquer-com-32-caracteres!!')), false);
  assert.equal(a.verificarToken(jwt.sign({ role: 'admin' }, SEGREDO, { algorithm: 'HS512' })), false); // algoritmo diferente
  assert.equal(a.verificarToken(jwt.sign({ role: 'visitante' }, SEGREDO)), false);
  const semAssinatura = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"role":"admin"}').toString('base64url')}.`;
  assert.equal(a.verificarToken(semAssinatura), false);
  for (const lixo of ['', 'abc', 'a.b.c', 'Bearer x']) assert.equal(a.verificarToken(lixo), false);
});
