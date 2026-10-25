
/** Status permitidos para uma viagem. */
export type StatusViagem =
  | 'Rascunho'
  | 'Disponivel'
  | 'Esgotada'
  | 'Finalizada';

/** Máximo de fotos adicionais (além da capa) por viagem. */
export const MAX_FOTOS = 5;

/** Contrato do destino utilizado pela API. */
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
  fotos: string[];
}

/** Campos enviados pelo cliente. O ID é gerado e mantido pelo backend. */
export type DestinoInput = Omit<Destino, 'id'>;

/**
 * Normaliza registros antigos e valores ausentes.
 * Os status antigos são convertidos para os equivalentes atuais.
 */
export function normalizarDestino(
  d: Omit<Partial<Destino>, 'status'> & {
    id: string;
    status?: string;
  },
): Destino {
  let status: StatusViagem;

  switch (d.status) {
    case 'Rascunho':
    case 'Disponivel':
    case 'Esgotada':
    case 'Finalizada':
      status = d.status;
      break;

    // Compatibilidade com o formato antigo.
    case 'proxima':
      status = 'Disponivel';
      break;
    case 'realizada':
      status = 'Finalizada';
      break;
    default:
      // Registros antigos sem status eram tratados como realizados.
      status = 'Finalizada';
  }

  return {
    id: d.id,
    titulo: String(d.titulo ?? ''),
    descricao: String(d.descricao ?? ''),
    data: String(d.data ?? ''),
    viajantes: Number.isInteger(d.viajantes)
      ? (d.viajantes as number)
      : 0,
    categoria: String(d.categoria ?? ''),
    imagem: String(d.imagem ?? ''),
    status,
    preco: typeof d.preco === 'string' ? d.preco : '',
    tags: Array.isArray(d.tags)
      ? d.tags.filter((t): t is string => typeof t === 'string')
      : [],
    fotos: Array.isArray(d.fotos)
      ? d.fotos
          .filter((f): f is string => typeof f === 'string')
          .slice(0, MAX_FOTOS)
      : [],
  };
}
