/** Envio do código de verificação por e-mail. A interface permite trocar o provedor e simular nos testes. */
export interface Mailer {
  enviarCodigo(p: { para: string; codigo: string; validadeMinutos: number }): Promise<void>;
}

export class MailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailError';
  }
}

/** Troca qualquer sequência de 6 dígitos por bolinhas, para um código nunca vazar em mensagens de erro ou logs. */
export const mascararCodigos = (texto: string) => texto.replace(/\b\d{6}\b/g, '••••••');

const MENSAGEM_SEM_PACOTE =
  "O pacote 'resend' não está instalado. Rode 'npm install' na pasta do backend e reinicie o servidor.";

/** Confere se o SDK do Resend está instalado. Usado na inicialização para falhar cedo, com instrução clara. */
export async function verificarSdkResend(): Promise<void> {
  try {
    await import('resend');
  } catch {
    throw new MailError(MENSAGEM_SEM_PACOTE);
  }
}

// Só o pedaço da API do Resend que usamos (evita acoplar os tipos do pacote ao restante do código).
export interface ResendLike {
  emails: {
    send(p: { from: string; to: string[]; subject: string; html: string; text: string }): Promise<{
      data?: unknown;
      error?: { name?: string; message?: string; statusCode?: number | null } | null;
    }>;
  };
}

export interface ResendMailerOptions {
  apiKey: string;
  from: string;
  /** Cliente já pronto (usado nos testes, para nunca chamar o Resend de verdade). */
  cliente?: ResendLike;
}

/** Traduz os erros mais comuns do Resend em uma orientação do que fazer. */
function dicaResend(e: { name?: string; message?: string; statusCode?: number | null }): string {
  const texto = `${e.name ?? ''} ${e.message ?? ''}`.toLowerCase();
  if (e.statusCode === 401 || /api[_ ]key|restricted/.test(texto)) {
    return ' Dica: confira a RESEND_API_KEY (chave inválida, revogada ou sem permissão de envio).';
  }
  if (e.statusCode === 403 || /own email|testing emails|verify a domain|domain/.test(texto)) {
    return ' Dica: sem domínio verificado, o Resend só entrega no e-mail da própria conta; use esse mesmo e-mail em ADMIN_2FA_EMAIL (ou verifique um domínio e defina RESEND_FROM).';
  }
  if (e.statusCode === 429) return ' Dica: limite de envios do Resend atingido; tente novamente mais tarde.';
  return '';
}

/**
 * Mailer usando o Resend (https://resend.com).
 * O SDK é carregado só no primeiro envio, então com o 2FA desligado ele nem é importado.
 * As mensagens de erro dizem o motivo da falha, mas nunca incluem o código nem a chave.
 */
export function createResendMailer(opts: ResendMailerOptions): Mailer {
  let cliente: ResendLike | null = opts.cliente ?? null;

  return {
    async enviarCodigo({ para, codigo, validadeMinutos }) {
      if (!cliente) {
        try {
          const { Resend } = await import('resend');
          cliente = new Resend(opts.apiKey) as unknown as ResendLike;
        } catch {
          throw new MailError(MENSAGEM_SEM_PACOTE);
        }
      }

      const assunto = 'Código de acesso ao painel MacFerr';
      const texto =
        `Seu código de acesso ao painel da MacFerr Turismo é: ${codigo}\n\n` +
        `Ele vale por ${validadeMinutos} minutos e só pode ser usado uma vez.\n` +
        'Se você não tentou entrar agora, ignore este e-mail e considere trocar a senha do painel.';
      const html =
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0f172a">' +
        '<p style="font-size:16px;margin:0 0 16px">Seu código de acesso ao painel da <strong>MacFerr Turismo</strong>:</p>' +
        `<p style="font-size:34px;letter-spacing:10px;font-weight:700;margin:0 0 16px;color:#7c3aed">${codigo}</p>` +
        `<p style="font-size:14px;color:#475569;margin:0 0 8px">Vale por ${validadeMinutos} minutos e só pode ser usado uma vez.</p>` +
        '<p style="font-size:13px;color:#64748b;margin:0">Se você não tentou entrar agora, ignore este e-mail e considere trocar a senha do painel.</p>' +
        '</div>';

      let resposta;
      try {
        resposta = await cliente.emails.send({ from: opts.from, to: [para], subject: assunto, html, text: texto });
      } catch (e) {
        const err = e as Error;
        throw new MailError(mascararCodigos(`Não foi possível falar com o Resend (${err?.name ?? 'erro'}: ${String(err?.message ?? '').slice(0, 160)}).`));
      }
      if (resposta?.error) {
        const { name, message, statusCode } = resposta.error;
        const detalhe = `${name ?? 'erro'}${statusCode ? `, HTTP ${statusCode}` : ''}`;
        throw new MailError(mascararCodigos(`O Resend recusou o envio (${detalhe}): ${String(message ?? 'sem detalhes').slice(0, 200)}.${dicaResend(resposta.error)}`));
      }
    },
  };
}
