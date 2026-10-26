import { createHash } from 'node:crypto';

/**
 * Simula, em memória, a parte da API do GitHub que o backend usa:
 *   GET  /repos/{o}/{r}                      (existência do repositório)
 *   GET  /repos/{o}/{r}/branches/{b}         (existência da branch)
 *   GET  /repos/{o}/{r}/contents/{path}?ref= (leitura, com ETag e 304)
 *   PUT  /repos/{o}/{r}/contents/{path}      (commit com controle de SHA: 409 se desatualizado)
 * Serve para testar conflitos, falhas e limites sem rede e sem tocar em nenhum repositório real.
 */

export const TOKEN_FALSO = 'github_pat_TOKEN_SECRETO_SO_PARA_TESTES_1234567890';

export interface Commit {
  message: string;
  content: string;
  sha: string;
  branch: string;
}

export interface Chamada {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

export interface FakeGitHubOptions {
  owner?: string;
  repo?: string;
  branch?: string;
  path?: string;
  token?: string;
  /** Conteúdo inicial do arquivo. `null` = o arquivo não existe. */
  arquivo?: string | null;
}

const shaDe = (texto: string) => createHash('sha1').update('blob ' + Buffer.byteLength(texto) + '\0' + texto).digest('hex');
const b64 = (texto: string) => Buffer.from(texto, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n');

const json = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } });

export function criarFakeGitHub(opts: FakeGitHubOptions = {}) {
  const owner = opts.owner ?? 'dono';
  const repo = opts.repo ?? 'site';
  const branch = opts.branch ?? 'main';
  const path = opts.path ?? 'backend/seed/destinos.json';
  const token = opts.token ?? TOKEN_FALSO;

  const estado = {
    content: opts.arquivo === undefined ? '[]\n' : opts.arquivo,
    commits: [] as Commit[],
    chamadas: [] as Chamada[],
  };

  // Respostas injetadas para as próximas chamadas (cada item vale para uma chamada que combine com `quando`).
  const falhas: { quando: (c: Chamada) => boolean; resposta: () => Response | Promise<Response> | never }[] = [];
  // Executa antes de processar o próximo PUT (para simular alguém commitando no meio do caminho).
  const antesDoPut: (() => void)[] = [];
  // Segura a resposta do próximo GET de conteúdo até `liberar()` ser chamado.
  let seguraProximoGet: { liberar: () => void; promessa: Promise<void> } | null = null;

  const arquivoUrl = `/repos/${owner}/${repo}/contents/${path}`;

  function commitar(content: string, message: string, branchAlvo: string): Commit {
    estado.content = content;
    const c = { message, content, sha: shaDe(content), branch: branchAlvo };
    estado.commits.push(c);
    return c;
  }

  const fetchFalso = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const chamada: Chamada = {
      method: (init?.method ?? 'GET').toUpperCase(),
      url: url.pathname + url.search,
      headers,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    estado.chamadas.push(chamada);

    const i = falhas.findIndex((f) => f.quando(chamada));
    if (i >= 0) return falhas.splice(i, 1)[0].resposta();

    if (headers.authorization !== `Bearer ${token}`) return json(401, { message: 'Bad credentials' });
    const caminho = decodeURIComponent(url.pathname);

    if (caminho === `/repos/${owner}/${repo}`) return json(200, { full_name: `${owner}/${repo}` });
    if (caminho === `/repos/${owner}/${repo}/branches/${branch}`) return json(200, { name: branch });
    if (!caminho.startsWith(`/repos/${owner}/${repo}`)) return json(404, { message: 'Not Found' });

    if (caminho === arquivoUrl && chamada.method === 'GET') {
      if (seguraProximoGet) {
        const s = seguraProximoGet;
        seguraProximoGet = null;
        // Captura o estado do momento da chamada: a resposta "velha" chega depois que o arquivo já mudou.
        const instantaneo = estado.content;
        await s.promessa;
        return respostaDeLeitura(instantaneo, headers);
      }
      return respostaDeLeitura(estado.content, headers, url.searchParams.get('ref'));
    }

    if (caminho === arquivoUrl && chamada.method === 'PUT') {
      antesDoPut.shift()?.();
      const corpo = chamada.body ?? {};
      if (corpo.branch !== branch) return json(422, { message: `Branch ${String(corpo.branch)} not found` });
      const novo = Buffer.from(String(corpo.content ?? ''), 'base64').toString('utf8');
      const existe = estado.content !== null;
      if (existe && !corpo.sha) return json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
      if (existe && corpo.sha !== shaDe(estado.content as string)) {
        return json(409, { message: `${path} does not match ${String(corpo.sha)}` });
      }
      const c = commitar(novo, String(corpo.message ?? ''), branch);
      return json(existe ? 200 : 201, { content: { sha: c.sha }, commit: { sha: 'commit-' + estado.commits.length } });
    }

    return json(404, { message: 'Not Found' });
  }) as typeof fetch;

  function respostaDeLeitura(content: string | null, headers: Record<string, string>, ref: string | null = branch): Response {
    if (ref !== branch) return json(404, { message: 'No commit found for the ref ' + ref });
    if (content === null) return json(404, { message: 'Not Found' });
    const sha = shaDe(content);
    const etag = `W/"${sha}"`;
    if (headers['if-none-match'] === etag) return new Response(null, { status: 304, headers: { etag } });
    return json(200, { type: 'file', sha, encoding: 'base64', content: b64(content), size: content.length }, { etag });
  }

  return {
    fetch: fetchFalso,
    opcoes: { owner, repo, branch, path, token },
    estado,
    /** Conteúdo atual do arquivo, já como objeto. */
    json: () => JSON.parse(estado.content ?? 'null') as unknown,
    sha: () => (estado.content === null ? null : shaDe(estado.content)),
    /** Simula um commit feito por fora (outra pessoa, outra instância, edição direta no GitHub). */
    commitExterno(content: string, message = 'edição externa') {
      return commitar(content, message, branch);
    },
    /** Executa `fn` logo antes de o próximo PUT ser processado. */
    antesDoProximoPut(fn: () => void) {
      antesDoPut.push(fn);
    },
    /** As próximas chamadas que combinarem com `quando` recebem `resposta` em vez do comportamento normal. */
    falharProxima(quando: (c: Chamada) => boolean, resposta: () => Response | Promise<Response>) {
      falhas.push({ quando, resposta });
    },
    /** Segura a resposta do próximo GET de conteúdo. Devolve a função que a libera. */
    segurarProximoGet(): () => void {
      let liberar!: () => void;
      const promessa = new Promise<void>((r) => { liberar = r; });
      seguraProximoGet = { liberar, promessa };
      return liberar;
    },
    chamadas: (metodo?: string) => estado.chamadas.filter((c) => !metodo || c.method === metodo),
  };
}

export type FakeGitHub = ReturnType<typeof criarFakeGitHub>;

export const destinoJson = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id,
  titulo,
  descricao: 'descrição',
  data: 'Maio 2026',
  viajantes: 5,
  categoria: 'Nacional',
  imagem: '',
  status: 'Disponivel',
  preco: '',
  tags: [],
  fotos: [],
  ...extra,
});
