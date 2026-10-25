import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResendMailer, MailError, type ResendLike } from '../src/services/mailService';

type Envio = Parameters<ResendLike['emails']['send']>[0];

function clienteFalso(resposta: () => Promise<{ data?: unknown; error?: { name?: string; statusCode?: number | null } | null }>) {
  const envios: Envio[] = [];
  const cliente: ResendLike = { emails: { async send(p) { envios.push(p); return resposta(); } } };
  return { cliente, envios };
}
const dados = { para: 'dona@exemplo.com', codigo: '482913', validadeMinutos: 5 };
const opts = { apiKey: 're_teste_123456789', from: 'MacFerr Turismo <onboarding@resend.dev>' };

test('resend: envia ao destinatário com o código no corpo (texto e HTML) e fora do assunto', async () => {
  const { cliente, envios } = clienteFalso(async () => ({ data: { id: 'abc' }, error: null }));
  await createResendMailer({ ...opts, cliente }).enviarCodigo(dados);
  assert.equal(envios.length, 1);
  const e = envios[0];
  assert.deepEqual(e.to, ['dona@exemplo.com']);
  assert.equal(e.from, opts.from);
  assert.ok(e.text.includes('482913') && e.html.includes('482913'));
  assert.ok(!e.subject.includes('482913'), 'o código não deve ficar no assunto (aparece em notificações)');
  assert.match(e.text, /5 minutos/);
});

test('resend: resposta com erro vira MailError sem conter o código nem a chave', async () => {
  const { cliente } = clienteFalso(async () => ({ data: null, error: { name: 'validation_error', statusCode: 403 } }));
  const falha = await createResendMailer({ ...opts, cliente }).enviarCodigo(dados).then(() => null, (e: Error) => e);
  assert.ok(falha instanceof MailError);
  assert.match(falha.message, /validation_error/);
  assert.ok(!falha.message.includes('482913') && !falha.message.includes(opts.apiKey));
});

test('resend: exceção do SDK (rede) vira MailError sem vazar detalhes', async () => {
  const { cliente } = clienteFalso(async () => { throw new Error('ECONNRESET com payload 482913'); });
  const falha = await createResendMailer({ ...opts, cliente }).enviarCodigo(dados).then(() => null, (e: Error) => e);
  assert.ok(falha instanceof MailError);
  assert.ok(!falha.message.includes('482913'));
});
