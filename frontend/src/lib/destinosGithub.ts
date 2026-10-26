import { API_URL, normalizarDestino, type Destino } from './api';

/**
 * Página inicial: lê os destinos direto do arquivo publicado no GitHub, sem passar pelo backend do Render
 * (que pode estar dormindo). O backend é quem grava nesse mesmo arquivo quando a administradora salva algo no painel.
 *
 * Para apontar para outra branch/arquivo (ex.: testes), defina NEXT_PUBLIC_DESTINOS_JSON_URL antes do build.
 */
export const DESTINOS_JSON_URL = 'https://raw.githubusercontent.com/LucasLoopsT/Macferr-Turismo/main/backend/seed/destinos.json';

/**
 * O raw.githubusercontent.com guarda cada URL em cache por ~5 minutos. Acrescentar um número que muda a cada
 * minuto cria uma URL nova por minuto: quem entra no mesmo minuto compartilha a cópia em cache (poucas
 * requisições ao GitHub), e uma alteração aparece para os visitantes em cerca de 1 minuto, não 5.
 */
export const JANELA_CACHE_MS = 60_000;

export function urlDestinosJson(agora: number = Date.now(), base: string = DESTINOS_JSON_URL): string {
  return `${base}${base.includes('?') ? '&' : '?'}v=${Math.floor(agora / JANELA_CACHE_MS)}`;
}

/** Imagens enviadas pelo painel ficam no backend e o JSON guarda só o caminho (/uploads/...). Completa com o endereço do backend. */
export function resolverImagem(src: string, apiUrl: string = API_URL): string {
  return src.startsWith('/uploads/') ? apiUrl.replace(/\/+$/, '') + src : src;
}

/** Valida o JSON recebido e aplica as mesmas regras de normalização do restante do site. */
export function interpretarDestinos(bruto: unknown): Destino[] {
  if (!Array.isArray(bruto)) throw new Error('O arquivo de destinos não é uma lista.');
  return bruto
    .filter((d): d is Partial<Destino> & { id: string } => !!d && typeof d === 'object' && typeof (d as { id?: unknown }).id === 'string' && (d as { id: string }).id !== '')
    .map(normalizarDestino)
    .map((d) => ({ ...d, imagem: resolverImagem(d.imagem), fotos: d.fotos.map((f) => resolverImagem(f)) }));
}

/** Mesma regra do backend: Disponivel/Esgotada = próximas; Finalizada = realizadas; Rascunho nunca aparece. */
export async function fetchDestinosPublicados(
  opts: { fetchImpl?: typeof fetch; agora?: number; url?: string } = {},
): Promise<{ proximas: Destino[]; realizadas: Destino[] }> {
  const res = await (opts.fetchImpl ?? fetch)(urlDestinosJson(opts.agora, opts.url), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Erro ao buscar destinos (${res.status})`);
  const lista = interpretarDestinos(await res.json());
  return {
    proximas: lista.filter((d) => d.status === 'Disponivel' || d.status === 'Esgotada'),
    realizadas: lista.filter((d) => d.status === 'Finalizada'),
  };
}
