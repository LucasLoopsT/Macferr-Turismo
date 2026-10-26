import {
  ConflictError,
  RemoteStoreError,
  parseDestinos,
  serializarDestinos,
  type DestinoStore,
  type Snapshot,
} from './destinoStore';
import { StorageError } from '../utils/errors';
import type { Destino } from '../types/destino';

export interface GitHubStoreOptions {
  /** Token com permissão de escrita em "Contents" SOMENTE neste repositório. Nunca vai para logs nem para o cliente. */
  token: string;
  owner: string;
  repo: string;
  branch: string;
  /** Caminho do arquivo dentro do repositório, ex.: backend/seed/destinos.json */
  path: string;
  /** Para testes. Padrão: fetch global. */
  fetch?: typeof fetch;
  apiBase?: string;
  /** Tempo máximo de cada chamada ao GitHub. Padrão 15 s. */
  timeoutMs?: number;
  /** Por quanto tempo uma leitura "não fresca" (listagens públicas) pode ser reaproveitada. Padrão 5 s. */
  ttlMs?: number;
  log?: (msg: string) => void;
}

/** A API de conteúdo do GitHub só devolve o arquivo na resposta JSON até 1 MB. Gravar mais que isso criaria um arquivo que não conseguimos reler. */
const LIMITE_BYTES = 900_000;

interface RespostaGitHub {
  status: number;
  headers: Headers;
  json: Record<string, unknown> | null;
}

interface Cache {
  destinos: Destino[];
  version: string | null;
  etag: string | null;
  em: number;
}

const clonar = <T>(v: T): T => structuredClone(v);

export function createGitHubStore(opts: GitHubStoreOptions): DestinoStore {
  const fetchImpl = opts.fetch ?? fetch;
  const api = (opts.apiBase ?? 'https://api.github.com').replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const ttlMs = opts.ttlMs ?? 5_000;
  const log = opts.log ?? ((m: string) => console.log(m));
  const repoUrl = `${api}/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}`;
  const caminho = opts.path.split('/').map(encodeURIComponent).join('/');
  const arquivoUrl = `${repoUrl}/contents/${caminho}`;
  const descricao = `${opts.owner}/${opts.repo}@${opts.branch}:${opts.path}`;

  let cache: Cache | null = null;
  // Cada gravação (ou conflito) incrementa a geração; uma leitura que começou antes não pode sobrescrever o cache com dado velho.
  let geracao = 0;
  let lendo: Promise<Snapshot> | null = null;

  async function chamar(method: 'GET' | 'PUT', url: string, extra: { body?: unknown; etag?: string | null } = {}): Promise<RespostaGitHub> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${opts.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'macferr-backend',
    };
    if (extra.body !== undefined) headers['Content-Type'] = 'application/json';
    if (extra.etag) headers['If-None-Match'] = extra.etag;

    let res: Response;
    try {
      res = await fetchImpl(url, {
        method,
        headers,
        body: extra.body === undefined ? undefined : JSON.stringify(extra.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // Nunca repassa a mensagem original: poderia conter detalhes da requisição.
      const motivo = (e as Error)?.name === 'TimeoutError' ? 'tempo esgotado' : 'falha de rede';
      throw new RemoteStoreError(`GitHub: ${motivo} em ${method} ${descricao}.`, 'transitorio');
    }

    let json: Record<string, unknown> | null = null;
    if (res.status !== 304) {
      try {
        const texto = await res.text();
        if (texto) {
          const parsed: unknown = JSON.parse(texto);
          if (parsed && typeof parsed === 'object') json = parsed as Record<string, unknown>;
          else json = { valor: parsed };
        }
      } catch {
        json = null;
      }
    }
    return { status: res.status, headers: res.headers, json };
  }

  const mensagemDe = (r: RespostaGitHub) => (typeof r.json?.message === 'string' ? (r.json.message as string) : '');

  function limiteExcedido(r: RespostaGitHub): boolean {
    if (r.status === 429) return true;
    if (r.status !== 403) return false;
    return (
      r.headers.get('x-ratelimit-remaining') === '0' ||
      r.headers.has('retry-after') ||
      /rate limit|abuse|secondary/i.test(mensagemDe(r))
    );
  }

  /** Converte respostas de erro em exceções classificadas. Nunca inclui o token. */
  function erroDe(r: RespostaGitHub, operacao: string): RemoteStoreError {
    const detalhe = mensagemDe(r);
    const sufixo = detalhe ? ` (${detalhe})` : '';
    if (r.status === 401) {
      return new RemoteStoreError(`GitHub recusou o token (401) ao ${operacao}. Verifique GITHUB_TOKEN (pode ter expirado ou sido revogado).`, 'config');
    }
    if (limiteExcedido(r)) {
      return new RemoteStoreError(`GitHub: limite de requisições atingido (${r.status}) ao ${operacao}.`, 'transitorio');
    }
    if (r.status === 403) {
      return new RemoteStoreError(
        `GitHub negou a operação (403) ao ${operacao}${sufixo}. O token precisa de "Contents: Read and write" neste repositório, e a branch não pode exigir pull request.`,
        'config',
      );
    }
    if (r.status >= 500) {
      return new RemoteStoreError(`GitHub indisponível (${r.status}) ao ${operacao}.`, 'transitorio');
    }
    return new RemoteStoreError(`GitHub respondeu ${r.status} ao ${operacao}${sufixo}.`, 'outro');
  }

  /** Um 404 no arquivo pode ser "arquivo ainda não existe" ou "repositório/branch errado ou sem acesso". Só o primeiro caso é inofensivo. */
  async function confirmarQueSoOArquivoNaoExiste(): Promise<void> {
    const repo = await chamar('GET', repoUrl);
    if (repo.status === 404) {
      throw new RemoteStoreError(
        `Repositório ${opts.owner}/${opts.repo} não encontrado, ou o token não tem acesso a ele. Confira GITHUB_REPO e as permissões do token.`,
        'config',
      );
    }
    if (repo.status !== 200) throw erroDe(repo, 'consultar o repositório');
    const branch = await chamar('GET', `${repoUrl}/branches/${opts.branch.split('/').map(encodeURIComponent).join('/')}`);
    if (branch.status === 404) {
      throw new RemoteStoreError(`A branch "${opts.branch}" não existe em ${opts.owner}/${opts.repo}. Confira GITHUB_BRANCH.`, 'config');
    }
    if (branch.status !== 200) throw erroDe(branch, 'consultar a branch');
  }

  async function lerRemoto(condicional = true): Promise<Snapshot> {
    const geracaoInicial = geracao;
    const etag = condicional ? (cache?.etag ?? null) : null;
    const r = await chamar('GET', `${arquivoUrl}?ref=${encodeURIComponent(opts.branch)}`, { etag });

    if (r.status === 304) {
      if (!cache) return lerRemoto(false); // o cache foi descartado durante a chamada: busca de novo, sem condição
      if (geracao === geracaoInicial) cache.em = Date.now();
      return { destinos: clonar(cache.destinos), version: cache.version };
    }

    if (r.status === 404) {
      await confirmarQueSoOArquivoNaoExiste();
      const vazio: Snapshot = { destinos: [], version: null };
      if (geracao === geracaoInicial) cache = { ...vazio, etag: null, em: Date.now() };
      return vazio;
    }
    if (r.status !== 200 || !r.json) throw erroDe(r, 'ler o arquivo de destinos');

    const j = r.json;
    if (j.type !== 'file' || typeof j.sha !== 'string') {
      throw new RemoteStoreError(`${descricao} não é um arquivo.`, 'config');
    }
    if (j.encoding !== 'base64' || typeof j.content !== 'string' || j.content === '') {
      throw new RemoteStoreError(`${descricao} é grande demais para a API de conteúdo do GitHub (limite de 1 MB).`, 'outro');
    }
    const bruto = Buffer.from(j.content, 'base64').toString('utf8');
    const destinos = parseDestinos(bruto, {
      invalido: `${descricao} não contém um JSON válido. Nada foi gravado; corrija o arquivo no repositório (o histórico do Git guarda as versões anteriores).`,
      formato: `${descricao} tem formato inesperado (era esperado um array). Nada foi gravado.`,
    });
    const snap: Snapshot = { destinos, version: j.sha };
    if (geracao === geracaoInicial) {
      cache = { ...snap, destinos: clonar(destinos), etag: r.headers.get('etag'), em: Date.now() };
    }
    return { destinos: clonar(destinos), version: j.sha };
  }

  return {
    descricao,
    remoto: true,

    /** Confere token, repositório e branch já na subida. Falhas de configuração derrubam o start; falhas passageiras só viram aviso. */
    async init() {
      try {
        const s = await lerRemoto();
        log(
          s.version === null
            ? `[github] ${descricao}: o arquivo ainda não existe; será criado na primeira gravação.`
            : `[github] ${descricao}: ${s.destinos.length} destino(s) lido(s).`,
        );
      } catch (e) {
        if (e instanceof RemoteStoreError && e.tipo === 'transitorio') {
          log(`[github] aviso: não foi possível conferir ${descricao} agora (${e.message}). Seguindo; as requisições tentarão de novo.`);
          return;
        }
        throw e;
      }
    },

    async ler(opcoes = {}) {
      if (!opcoes.fresh) {
        if (cache && Date.now() - cache.em < ttlMs) return { destinos: clonar(cache.destinos), version: cache.version };
        // Leituras simultâneas compartilham a mesma chamada ao GitHub.
        if (!lendo) lendo = lerRemoto().finally(() => { lendo = null; });
        const s = await lendo;
        return { destinos: clonar(s.destinos), version: s.version };
      }
      return lerRemoto();
    },

    async gravar(destinos, versao, mensagem) {
      const texto = serializarDestinos(destinos);
      if (Buffer.byteLength(texto, 'utf8') > LIMITE_BYTES) {
        throw new StorageError('A lista de destinos ficou grande demais para ser salva no GitHub (limite de leitura de 1 MB).');
      }
      const corpo: Record<string, unknown> = {
        message: mensagem,
        content: Buffer.from(texto, 'utf8').toString('base64'),
        branch: opts.branch,
      };
      if (versao) corpo.sha = versao;

      const r = await chamar('PUT', arquivoUrl, { body: corpo });
      geracao++;

      if (r.status === 200 || r.status === 201) {
        const novo = (r.json?.content as { sha?: unknown } | undefined)?.sha;
        if (typeof novo !== 'string') {
          cache = null;
          throw new RemoteStoreError('GitHub aceitou a gravação, mas não informou a nova versão do arquivo.', 'outro');
        }
        cache = { destinos: clonar(destinos), version: novo, etag: null, em: Date.now() };
        return novo;
      }

      cache = null;
      // 409: o SHA enviado não é mais o atual (ou dois commits chegaram juntos). 422 com "sha": o arquivo já existe e não enviamos SHA.
      if (r.status === 409 || (r.status === 422 && /\bsha\b/i.test(mensagemDe(r)))) throw new ConflictError();
      throw erroDe(r, 'gravar o arquivo de destinos');
    },
  };
}
