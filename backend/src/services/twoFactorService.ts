import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { mascararCodigos, type Mailer } from './mailService';
import { HttpError } from '../utils/errors';
import { criarFila, gravarJsonAtomico, lerJson } from '../utils/jsonFile';

const MIN = 60 * 1000;

export interface TwoFactorOptions {
  dataDir: string;
  /** Chave do HMAC que protege os códigos guardados (usa o JWT_SECRET). */
  jwtSecret: string;
  mailer: Mailer;
  /** Para onde o código é enviado (ADMIN_2FA_EMAIL). */
  destinatario: string;
  /** Validade do código. Padrão: 5 minutos. */
  ttlMs?: number;
  /** Erros de código permitidos por desafio antes de invalidá-lo. Padrão: 5. */
  maxTentativas?: number;
  /** Intervalo mínimo entre dois pedidos de código. Padrão: 30 s. */
  cooldownMs?: number;
  /** Máximo de códigos pedidos em 15 minutos e em 24 horas. Padrão: 3 e 10. */
  limite15min?: number;
  limite24h?: number;
  /** Tempo máximo esperando o provedor de e-mail. Padrão: 10 s. */
  timeoutEnvioMs?: number;
  now?: () => number;
  log?: (msg: string) => void;
  /** Gerador do código (só para testes). Padrão: aleatório criptográfico de 6 dígitos. */
  gerarCodigo?: () => string;
  /** Inclui o motivo da falha de envio em `detalhes.motivo` da resposta 502 (use só fora de produção). */
  exporMotivo?: boolean;
}

interface Desafio {
  id: string;
  /** HMAC do código. O código em si NUNCA é gravado. */
  hash: string;
  criadoEm: number;
  expiraEm: number;
  tentativas: number;
}

interface Estado {
  desafio: Desafio | null;
  /** Instantes (ms) dos pedidos de código nas últimas 24 h, para limitar solicitações. */
  solicitacoes: number[];
}

const ESTADO_VAZIO = (): Estado => ({ desafio: null, solicitacoes: [] });

export function createTwoFactorService(opts: TwoFactorOptions) {
  const file = path.join(opts.dataDir, 'auth-2fa.json');
  const ttlMs = opts.ttlMs ?? 5 * MIN;
  const maxTentativas = opts.maxTentativas ?? 5;
  const cooldownMs = opts.cooldownMs ?? 30 * 1000;
  const limite15 = opts.limite15min ?? 3;
  const limite24 = opts.limite24h ?? 10;
  const timeoutEnvioMs = opts.timeoutEnvioMs ?? 10 * 1000;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.error(m));
  const gerarCodigo = opts.gerarCodigo ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0'));
  const comLock = criarFila();

  const hashDe = (id: string, codigo: string) =>
    createHmac('sha256', opts.jwtSecret).update(`macferr:2fa:${id}:${codigo}`).digest('hex');

  const iguais = (a: string, b: string) => {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && timingSafeEqual(x, y);
  };

  async function ler(): Promise<Estado> {
    const e = await lerJson<Partial<Estado>>(file, ESTADO_VAZIO(), log);
    return {
      desafio: e.desafio && typeof e.desafio.id === 'string' ? e.desafio : null,
      solicitacoes: Array.isArray(e.solicitacoes) ? e.solicitacoes.filter((t) => Number.isFinite(t)) : [],
    };
  }

  /** Descarta o desafio e devolve o pedido ao limite: quando o e-mail não saiu, a falha não é culpa de quem tentou entrar. */
  async function desfazerPedido(id: string, criadoEm: number) {
    await comLock(async () => {
      const estado = await ler();
      if (estado.desafio?.id === id) estado.desafio = null;
      const i = estado.solicitacoes.indexOf(criadoEm);
      if (i !== -1) estado.solicitacoes.splice(i, 1);
      await gravarJsonAtomico(file, estado);
    });
  }

  /** Espera o envio, mas não mais que `timeoutEnvioMs`. */
  async function enviarComTimeout(codigo: string) {
    let timer: NodeJS.Timeout | undefined;
    const limite = new Promise<never>((_, rejeitar) => {
      timer = setTimeout(() => rejeitar(new Error('tempo esgotado ao enviar o e-mail')), timeoutEnvioMs);
    });
    try {
      await Promise.race([
        opts.mailer.enviarCodigo({ para: opts.destinatario, codigo, validadeMinutos: Math.round(ttlMs / MIN) }),
        limite,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    file,
    ttlSegundos: Math.round(ttlMs / 1000),
    cooldownSegundos: Math.round(cooldownMs / 1000),

    /**
     * Gera um código, guarda só o hash e envia por e-mail. Um novo pedido invalida o anterior.
     * Lança 429 se os limites de solicitação forem excedidos e 502 se o e-mail não puder ser enviado.
     */
    async solicitar(): Promise<{ desafio: string }> {
      const { id, codigo, criadoEm } = await comLock(async () => {
        const agora = now();
        const estado = await ler();
        estado.solicitacoes = estado.solicitacoes.filter((t) => agora - t < 24 * 60 * MIN);
        if (estado.desafio && agora >= estado.desafio.expiraEm) estado.desafio = null;

        const bloqueado = (msg: string, liberaEm: number) => {
          const seg = Math.max(1, Math.ceil((liberaEm - agora) / 1000));
          return new HttpError(429, msg, undefined, seg);
        };

        const ultima = Math.max(0, ...estado.solicitacoes);
        if (ultima && agora - ultima < cooldownMs) {
          const seg = Math.ceil((ultima + cooldownMs - agora) / 1000);
          throw bloqueado(`Aguarde ${seg} segundo${seg === 1 ? '' : 's'} para pedir um novo código.`, ultima + cooldownMs);
        }
        const janela15 = estado.solicitacoes.filter((t) => agora - t < 15 * MIN);
        if (janela15.length >= limite15) {
          throw bloqueado('Muitos códigos solicitados. Aguarde alguns minutos e tente de novo.', Math.min(...janela15) + 15 * MIN);
        }
        if (estado.solicitacoes.length >= limite24) {
          throw bloqueado('Limite diário de códigos atingido. Tente novamente mais tarde.', Math.min(...estado.solicitacoes) + 24 * 60 * MIN);
        }

        const codigo = gerarCodigo();
        const id = randomBytes(18).toString('base64url');
        estado.desafio = { id, hash: hashDe(id, codigo), criadoEm: agora, expiraEm: agora + ttlMs, tentativas: 0 };
        estado.solicitacoes.push(agora);
        // Grava ANTES de enviar: o pedido conta para os limites mesmo que o processo caia no meio.
        await gravarJsonAtomico(file, estado);
        return { id, codigo, criadoEm: agora };
      });

      try {
        await enviarComTimeout(codigo);
      } catch (e) {
        // O código não chegou ao destinatário: descarta o desafio, devolve o pedido ao limite e avisa o cliente.
        // O motivo vai para o log do servidor (sem o código); a resposta ao cliente só traz o motivo fora de produção.
        const motivo = mascararCodigos((e as Error)?.message ?? 'erro desconhecido');
        log(`[2fa] falha ao enviar o e-mail: ${motivo}`);
        await desfazerPedido(id, criadoEm);
        throw new HttpError(
          502,
          'Não foi possível enviar o código por e-mail agora. Tente novamente em instantes.',
          opts.exporMotivo ? { motivo } : undefined,
        );
      }
      return { desafio: id };
    },

    /**
     * Confere o código. Uso único: ao acertar, o desafio é apagado. Cada erro conta como tentativa
     * e, ao atingir o máximo, o desafio é invalidado. As verificações são serializadas, então
     * tentativas em paralelo não furam o limite.
     */
    async verificar(desafio: string, codigo: string): Promise<void> {
      if (!/^\d{6}$/.test(codigo)) throw new HttpError(400, 'Informe o código de 6 dígitos.');

      await comLock(async () => {
        const agora = now();
        const estado = await ler();
        const d = estado.desafio;

        if (!d || d.id !== desafio) {
          throw new HttpError(401, 'Código expirado ou inválido. Faça login novamente para receber outro.');
        }
        if (agora >= d.expiraEm) {
          estado.desafio = null;
          await gravarJsonAtomico(file, estado);
          throw new HttpError(401, 'O código expirou. Faça login novamente para receber outro.');
        }
        if (d.tentativas >= maxTentativas) {
          estado.desafio = null;
          await gravarJsonAtomico(file, estado);
          throw new HttpError(429, 'Muitas tentativas. Faça login novamente para receber outro código.');
        }

        if (!iguais(hashDe(d.id, codigo), d.hash)) {
          d.tentativas += 1;
          const esgotou = d.tentativas >= maxTentativas;
          if (esgotou) estado.desafio = null;
          await gravarJsonAtomico(file, estado);
          if (esgotou) throw new HttpError(429, 'Muitas tentativas. Faça login novamente para receber outro código.');
          throw new HttpError(401, 'Código incorreto.', { tentativasRestantes: maxTentativas - d.tentativas });
        }

        estado.desafio = null; // uso único
        await gravarJsonAtomico(file, estado);
      });
    },
  };
}

export type TwoFactorService = ReturnType<typeof createTwoFactorService>;
