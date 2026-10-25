import { MAX_FOTOS, type DestinoInput } from '../types/destino';
import { HttpError } from './errors';

type Campo = keyof DestinoInput;
type Detalhe = { campo: string; mensagem: string };

const LIMITES = { titulo: 120, descricao: 2000, data: 60, categoria: 40, imagem: 2048, viajantesMax: 100000, preco: 60, tag: 30, tagsMax: 6 };

/**
 * Valida o corpo de criação (todos os campos obrigatórios presentes) ou de atualização (parcial).
 * Só os campos conhecidos são aceitos: `id` e quaisquer extras são descartados.
 */
export function validateDestino(body: unknown, modo: 'create'): DestinoInput;
export function validateDestino(body: unknown, modo: 'update'): Partial<DestinoInput>;
export function validateDestino(body: unknown, modo: 'create' | 'update'): DestinoInput | Partial<DestinoInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Corpo da requisição inválido. Envie um objeto JSON.');
  }
  const src = body as Record<string, unknown>;
  const erros: Detalhe[] = [];
  const out: Partial<DestinoInput> = {};

  const texto = (campo: Campo, max: number, obrigatorio: boolean) => {
    const v = src[campo];
    if (v === undefined) {
      if (obrigatorio && modo === 'create') erros.push({ campo, mensagem: 'Campo obrigatório.' });
      return;
    }
    if (typeof v !== 'string') return void erros.push({ campo, mensagem: 'Deve ser um texto.' });
    const t = v.trim();
    if (obrigatorio && !t) return void erros.push({ campo, mensagem: 'Não pode ficar vazio.' });
    if (t.length > max) return void erros.push({ campo, mensagem: `Máximo de ${max} caracteres.` });
    (out as Record<string, unknown>)[campo] = t;
  };

  texto('titulo', LIMITES.titulo, true);
  texto('descricao', LIMITES.descricao, true);
  texto('data', LIMITES.data, true);
  texto('categoria', LIMITES.categoria, true);
  texto('imagem', LIMITES.imagem, false);

  texto('preco', LIMITES.preco, false);

  if (src.status !== undefined) {
    if (src.status !== 'Rascunho' && src.status !== 'Disponivel' && src.status !== 'Esgotada' && src.status !== 'Finalizada') erros.push({ campo: 'status', mensagem: "Use um status válido." });
    else out.status = src.status;
  }

  if (src.tags !== undefined) {
    const t = src.tags;
    if (!Array.isArray(t) || t.some((x) => typeof x !== 'string')) erros.push({ campo: 'tags', mensagem: 'Deve ser uma lista de textos.' });
    else {
      const limpas = Array.from(new Set(t.map((x) => (x as string).trim()).filter(Boolean)));
      if (limpas.length > LIMITES.tagsMax) erros.push({ campo: 'tags', mensagem: `Máximo de ${LIMITES.tagsMax} tags.` });
      else if (limpas.some((x) => x.length > LIMITES.tag)) erros.push({ campo: 'tags', mensagem: `Cada tag pode ter no máximo ${LIMITES.tag} caracteres.` });
      else out.tags = limpas;
    }
  }

  if (src.fotos !== undefined) {
    const f = src.fotos;
    if (!Array.isArray(f) || f.some((x) => typeof x !== 'string')) erros.push({ campo: 'fotos', mensagem: 'Deve ser uma lista de textos (URLs).' });
    else {
      const limpas = (f as string[]).map((x) => x.trim()).filter(Boolean);
      if (limpas.length > MAX_FOTOS) erros.push({ campo: 'fotos', mensagem: `Máximo de ${MAX_FOTOS} fotos adicionais.` });
      else if (limpas.some((x) => x.length > LIMITES.imagem)) erros.push({ campo: 'fotos', mensagem: `Cada foto pode ter no máximo ${LIMITES.imagem} caracteres.` });
      else out.fotos = limpas;
    }
  }

  const via = src.viajantes;
  if (via !== undefined) {
    if (typeof via !== 'number' || !Number.isInteger(via) || via < 0 || via > LIMITES.viajantesMax) {
      erros.push({ campo: 'viajantes', mensagem: `Deve ser um número inteiro entre 0 e ${LIMITES.viajantesMax}.` });
    } else out.viajantes = via;
  }

  if (erros.length) throw new HttpError(400, 'Dados inválidos.', erros);

  if (modo === 'create') {
    // Status omitido = 'Finalizada', o mesmo tratamento que normalizarDestino dá a registros antigos sem status.
    return { viajantes: 0, imagem: '', status: 'Finalizada', preco: '', tags: [], fotos: [], ...out } as DestinoInput;
  }
  if (Object.keys(out).length === 0) throw new HttpError(400, 'Nenhum campo válido para atualizar.');
  return out;
}
