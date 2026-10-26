import { randomUUID } from 'node:crypto';
import type { Destino, DestinoInput } from '../types/destino';
import { HttpError, StorageError } from '../utils/errors';
import {
  ConflictError,
  RemoteStoreError,
  createFileStore,
  type DestinoStore,
  type Snapshot,
} from './destinoStore';

export interface DestinoServiceOptions {
  /** Armazenamento a usar (GitHub, por exemplo). Se omitido, usa arquivo local em `dataDir`. */
  store?: DestinoStore;
  dataDir?: string;
  seedFile?: string | null;
  /** Quantas vezes refazer "ler, alterar, gravar" quando outra gravação passar na frente. Padrão 4. */
  maxTentativas?: number;
  /** Pausa entre tentativas após conflito (dá tempo de o GitHub propagar o commit). Padrão 150 ms, multiplicada pela tentativa. */
  esperaConflitoMs?: number;
}

/** Texto curto e de uma linha para mensagens de commit. */
const rotulo = (titulo: string) => titulo.replace(/\s+/g, ' ').trim().slice(0, 60);

const dormir = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

function armazenamentoPadrao(opts: DestinoServiceOptions): DestinoStore {
  if (!opts.dataDir) throw new Error('createDestinoService: informe `store` ou `dataDir`.');
  return createFileStore({ dataDir: opts.dataDir, seedFile: opts.seedFile });
}

export function createDestinoService(opts: DestinoServiceOptions) {
  const store = opts.store ?? armazenamentoPadrao(opts);
  const maxTentativas = opts.maxTentativas ?? 4;
  const esperaConflitoMs = opts.esperaConflitoMs ?? 150;

  // Fila de gravações deste processo: uma alteração por vez. Entre processos (ou commits feitos à mão no GitHub),
  // quem protege é a conferência de versão feita em store.gravar.
  let fila: Promise<unknown> = Promise.resolve();
  function comLock<T>(fn: () => Promise<T>): Promise<T> {
    const resultado = fila.then(fn);
    fila = resultado.catch(() => undefined);
    return resultado;
  }

  /** Falhas passageiras do armazenamento remoto viram 503 com mensagem segura; o resto segue como erro interno (log no servidor). */
  function traduzir(e: unknown, acao: 'carregar' | 'salvar'): unknown {
    if (e instanceof RemoteStoreError && e.tipo === 'transitorio') {
      return new HttpError(503, `Não foi possível ${acao} os destinos agora (GitHub indisponível). Tente de novo em instantes.`);
    }
    return e;
  }

  async function lerSnapshot(fresh = false): Promise<Snapshot> {
    try {
      return await store.ler({ fresh });
    } catch (e) {
      throw traduzir(e, 'carregar');
    }
  }

  /**
   * Alteração segura: lê a versão mais recente, aplica `op` sobre ela e grava informando essa versão.
   * Se outra gravação passou na frente (conflito), relê e reaplica `op` sobre o dado novo; assim nada que
   * outra origem tenha gravado é sobrescrito. `op` devolve null quando não há o que gravar (registro inexistente).
   */
  function mutar<T>(
    op: (lista: Destino[]) => { lista: Destino[]; resultado: T } | null,
    mensagem: (resultado: T) => string,
  ): Promise<T | null> {
    return comLock(async () => {
      for (let tentativa = 1; ; tentativa++) {
        const snap = await lerSnapshot(true);
        const r = op([...snap.destinos]);
        if (!r) return null;
        try {
          await store.gravar(r.lista, snap.version, mensagem(r.resultado));
          return r.resultado;
        } catch (e) {
          if (e instanceof ConflictError) {
            if (tentativa >= maxTentativas) {
              throw new HttpError(409, 'Os destinos foram alterados por outra operação ao mesmo tempo. Recarregue a lista e tente de novo.');
            }
            await dormir(esperaConflitoMs * tentativa);
            continue;
          }
          throw traduzir(e, 'salvar');
        }
      }
    });
  }

  return {
    /** Onde os dados ficam (caminho do arquivo ou repositório@branch:caminho). */
    file: store.descricao,
    remoto: store.remoto,

    init(): Promise<void> {
      return comLock(() => store.init());
    },

    /** Lista todos os registros, inclusive os rascunhos. Uso administrativo. */
    async list(): Promise<Destino[]> {
      return (await lerSnapshot()).destinos;
    },

    /** Próximas viagens visíveis publicamente. */
    async listProximas(): Promise<Destino[]> {
      return (await lerSnapshot()).destinos.filter((d) => d.status === 'Disponivel' || d.status === 'Esgotada');
    },

    /** Viagens realizadas visíveis publicamente. */
    async listRealizadas(): Promise<Destino[]> {
      return (await lerSnapshot()).destinos.filter((d) => d.status === 'Finalizada');
    },

    async get(id: string): Promise<Destino | null> {
      return (await lerSnapshot()).destinos.find((d) => d.id === id) ?? null;
    },

    async create(input: DestinoInput): Promise<Destino> {
      const novo: Destino = { id: randomUUID(), ...input };
      await mutar(
        (lista) => ({ lista: [...lista, novo], resultado: novo }),
        (d) => `Adiciona destino "${rotulo(d.titulo)}" (painel)`,
      );
      return novo;
    },

    update(id: string, patch: Partial<DestinoInput>): Promise<{ before: Destino; after: Destino } | null> {
      return mutar(
        (lista) => {
          const i = lista.findIndex((d) => d.id === id);
          if (i === -1) return null;
          const before = lista[i];
          const after: Destino = { ...before, ...patch, id: before.id };
          lista[i] = after;
          return { lista, resultado: { before, after } };
        },
        ({ after }) => `Atualiza destino "${rotulo(after.titulo)}" (painel)`,
      );
    },

    remove(id: string): Promise<Destino | null> {
      return mutar(
        (lista) => {
          const i = lista.findIndex((d) => d.id === id);
          if (i === -1) return null;
          const [removido] = lista.splice(i, 1);
          return { lista, resultado: removido };
        },
        (d) => `Remove destino "${rotulo(d.titulo)}" (painel)`,
      );
    },

    /** Imagens referenciadas por algum destino (capa e fotos). Usado para decidir o que pode ser apagado do disco. */
    async imagensEmUso(): Promise<Set<string>> {
      const snap = await lerSnapshot();
      // Com dados remotos, "arquivo inexistente" pode ser só um erro de configuração. Nesse caso nunca concluímos que nada está em uso.
      if (store.remoto && snap.version === null) {
        throw new StorageError(`${store.descricao} não existe; operação que apagaria imagens foi cancelada.`);
      }
      const em = new Set<string>();
      for (const d of snap.destinos) {
        if (d.imagem) em.add(d.imagem);
        for (const f of d.fotos) {
          if (f) em.add(f);
        }
      }
      return em;
    },
  };
}

export type DestinoService = ReturnType<typeof createDestinoService>;
