const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type StatusViagem = 'Rascunho' | 'Disponivel' | 'Esgotada' | 'Finalizada';

/** Máximo de fotos adicionais (além da capa) por viagem. Espelha MAX_FOTOS do backend. */
export const MAX_FOTOS = 5;

export interface Destino {
  id: string;
  titulo: string;
  descricao: string;
  data: string;
  viajantes: number;
  categoria: string;
  imagem: string;
  status: StatusViagem;
  preco: string;
  tags: string[];
  /** Fotos adicionais da galeria (até MAX_FOTOS). */
  fotos: string[];
}

/** Garante os campos novos em respostas de registros antigos (sem fotos, status, preço ou tags). */
/** Garante os campos novos em respostas de registros antigos. */
export function normalizarDestino(
  d: Partial<Destino> & { id: string },
): Destino {
  let status: StatusViagem;

  switch (d.status as string | undefined) {
    case 'Rascunho':
      status = 'Rascunho';
      break;
    case 'Disponivel':
    case 'proxima':
      status = 'Disponivel';
      break;
    case 'Esgotada':
      status = 'Esgotada';
      break;
    case 'Finalizada':
    case 'realizada':
    default:
      status = 'Finalizada';
      break;
  }

  return {
    id: d.id,
    titulo: d.titulo ?? '',
    descricao: d.descricao ?? '',
    data: d.data ?? '',
    viajantes: d.viajantes ?? 0,
    categoria: d.categoria ?? '',
    imagem: d.imagem ?? '',
    status,
    preco: d.preco ?? '',
    tags: Array.isArray(d.tags) ? d.tags : [],
    fotos: Array.isArray(d.fotos)
      ? d.fotos.filter(Boolean).slice(0, MAX_FOTOS)
      : [],
  };
}

async function mensagemDeErro(res: Response, padrao: string): Promise<string> {
  try {
    const data = await res.json();
    if (data?.erro) return data.erro;
  } catch {
    // resposta sem JSON
  }
  return padrao;
}

// ── Público ────────────────────────────────────────────────────────────────────

export async function fetchDestinos(): Promise<Destino[]> {
  const res = await fetch(`${API_URL}/api/destinos`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Erro ao buscar destinos');
  return ((await res.json()) as (Partial<Destino> & { id: string })[]).map(normalizarDestino);
}

/** Busca viagens disponíveis e esgotadas. */
export async function fetchProximasDestinos(): Promise<Destino[]> {
  const res = await fetch(`${API_URL}/api/destinos/proximas`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Erro ao buscar próximas viagens');
  }

  const destinos = (await res.json()) as (
    Partial<Destino> & { id: string }
  )[];

  return destinos.map(normalizarDestino);
}

/** Busca viagens finalizadas. */
export async function fetchDestinosRealizados(): Promise<Destino[]> {
  const res = await fetch(`${API_URL}/api/destinos/realizadas`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Erro ao buscar viagens realizadas');
  }

  const destinos = (await res.json()) as (
    Partial<Destino> & { id: string }
  )[];

  return destinos.map(normalizarDestino);
}

// ── Admin ──────────────────────────────────────────────────────────────────────

/** Erro de uma chamada à API, com o status HTTP e a mensagem enviada pelo backend (campo `erro`). */
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly detalhes?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function erroDaApi(res: Response, padrao: string): Promise<ApiError> {
  try {
    const data = await res.json();
    if (data && typeof data.erro === 'string') return new ApiError(data.erro, res.status, data.detalhes);
  } catch {
    // resposta sem JSON
  }
  return new ApiError(padrao, res.status);
}

/**
 * Resultado da etapa 1 do login (senha):
 *  - 'codigo': o backend enviou um código por e-mail; falta confirmá-lo com adminVerificarCodigo;
 *  - 'token': 2FA desligado no backend (só possível fora de produção); já está autenticado.
 */
export type LoginResposta =
  | { etapa: 'token'; token: string }
  | { etapa: 'codigo'; desafio: string; expiraEm: number; reenviarEm: number; email: string };

export async function adminLogin(password: string): Promise<LoginResposta> {
  const res = await fetch(`${API_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw await erroDaApi(res, 'Senha incorreta');
  const data = await res.json();
  if (typeof data.token === 'string') return { etapa: 'token', token: data.token };
  return {
    etapa: 'codigo',
    desafio: String(data.desafio),
    expiraEm: Number(data.expiraEm) || 300,
    reenviarEm: Number(data.reenviarEm) || 30,
    email: String(data.email ?? ''),
  };
}

/** Etapa 2 do login: confirma o código recebido por e-mail e devolve o token (JWT). */
export async function adminVerificarCodigo(desafio: string, codigo: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/admin/login/verificar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ desafio, codigo }),
  });
  if (!res.ok) throw await erroDaApi(res, 'Código inválido');
  const data = await res.json();
  return data.token;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function adminCreateDestino(token: string, destino: Omit<Destino, 'id'>): Promise<Destino> {
  const res = await fetch(`${API_URL}/api/admin/destinos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(destino),
  });
  if (!res.ok) throw new Error(await mensagemDeErro(res, 'Erro ao criar destino'));
  return normalizarDestino(await res.json());
}

export async function adminUpdateDestino(token: string, id: string, destino: Partial<Destino>): Promise<Destino> {
  const res = await fetch(`${API_URL}/api/admin/destinos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(destino),
  });
  if (!res.ok) throw new Error(await mensagemDeErro(res, 'Erro ao atualizar destino'));
  return normalizarDestino(await res.json());
}

export async function adminDeleteDestino(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/destinos/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Erro ao deletar destino');
}

/**
 * Envia uma imagem (JPEG, PNG, WebP ou GIF) e devolve a URL pública para usar no campo `imagem`.
 * O arquivo vai cru no corpo da requisição; o backend valida tipo, tamanho e conteúdo.
 */
export async function adminUploadImagem(token: string, file: File): Promise<string> {
  const res = await fetch(`${API_URL}/api/admin/upload`, {
    method: 'POST',
    headers: { 'Content-Type': file.type, Authorization: `Bearer ${token}` },
    body: file,
  });
  if (!res.ok) {
    let msg = 'Erro ao enviar imagem';
    try {
      const data = await res.json();
      if (data?.erro) msg = data.erro;
    } catch {
      // resposta sem JSON
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return data.url;
}

// Wake up Render (evita cold start durante visita ao admin)
export async function wakeBackend(): Promise<void> {
  try {
    await fetch(`${API_URL}/health`);
  } catch {
    // silencioso
  }
}
