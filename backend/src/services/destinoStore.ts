import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizarDestino, type Destino } from '../types/destino';
import { StorageError } from '../utils/errors';

/** Retrato dos destinos em um instante, com o "número de versão" necessário para gravar sem sobrescrever ninguém. */
export interface Snapshot {
  destinos: Destino[];
  /**
   * Identifica a versão lida (no GitHub é o SHA do arquivo). `null` = o arquivo ainda não existe.
   * A gravação só é aceita se a versão ainda for a mesma: é isso que evita perder alterações de outra origem.
   */
  version: string | null;
}

/** A versão informada na gravação não é mais a atual (alguém gravou no meio do caminho). Releia e tente de novo. */
export class ConflictError extends StorageError {
  constructor(message = 'Conflito de versão ao gravar os destinos.') {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Falha ao falar com um armazenamento remoto (GitHub).
 *  - transitorio: rede, timeout, 5xx ou limite de requisições; vale tentar de novo mais tarde.
 *  - config: token recusado, sem permissão, repositório ou branch inexistente; exige correção de configuração.
 *  - outro: resposta inesperada.
 */
export type TipoErroRemoto = 'transitorio' | 'config' | 'outro';

export class RemoteStoreError extends StorageError {
  constructor(message: string, public readonly tipo: TipoErroRemoto) {
    super(message);
    this.name = 'RemoteStoreError';
  }
}

export interface DestinoStore {
  /** Descrição legível de onde os dados ficam (caminho do arquivo ou repositório@branch:caminho). Só para logs. */
  readonly descricao: string;
  /** true quando os dados vivem fora deste servidor. Nesse caso "arquivo ausente" não deve ser tratado como "sem destinos" em rotinas que apagam coisas. */
  readonly remoto: boolean;
  /** Prepara o armazenamento (cria a pasta e aplica o seed, ou confere acesso ao repositório). */
  init(): Promise<void>;
  /** `fresh: true` ignora qualquer cache e confere a origem (usado antes de toda gravação). */
  ler(opts?: { fresh?: boolean }): Promise<Snapshot>;
  /**
   * Grava a lista inteira, desde que `versao` ainda seja a atual; senão lança ConflictError sem gravar nada.
   * `mensagem` descreve a alteração (vira a mensagem do commit no GitHub). Devolve a nova versão.
   */
  gravar(destinos: Destino[], versao: string | null, mensagem: string): Promise<string | null>;
}

/**
 * Converte o texto de um destinos.json em lista. Nunca "conserta" nada: JSON inválido ou formato inesperado
 * viram erro, e quem chamou não grava por cima do que está lá.
 */
export function parseDestinos(bruto: string, mensagens: { invalido: string; formato: string }): Destino[] {
  let dados: unknown;
  try {
    dados = JSON.parse(bruto.replace(/^\uFEFF/, ''));
  } catch {
    throw new StorageError(mensagens.invalido);
  }
  if (!Array.isArray(dados)) throw new StorageError(mensagens.formato);
  return (dados as (Partial<Destino> & { id: string; status?: string })[]).map(normalizarDestino);
}

/** Formato de gravação: o mesmo do seed (2 espaços e quebra de linha final), para diffs pequenos no Git. */
export function serializarDestinos(lista: Destino[]): string {
  return JSON.stringify(lista, null, 2) + '\n';
}

export interface FileStoreOptions {
  dataDir: string;
  seedFile?: string | null;
}

/** Armazenamento em arquivo local (desenvolvimento, testes ou hospedagem com disco persistente). */
export function createFileStore(opts: FileStoreOptions): DestinoStore {
  const file = path.join(opts.dataDir, 'destinos.json');

  async function lerArquivo(): Promise<Destino[]> {
    let bruto: string;
    try {
      bruto = await fs.readFile(file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new StorageError(`Não foi possível ler ${file}.`);
    }
    return parseDestinos(bruto, {
      invalido: `${file} está corrompido. O backup anterior fica em ${file}.bak.`,
      formato: `${file} tem formato inesperado (era esperado um array).`,
    });
  }

  async function gravarArquivo(lista: Destino[]): Promise<void> {
    await fs.mkdir(opts.dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
    try {
      const fh = await fs.open(tmp, 'w');
      try {
        await fh.writeFile(serializarDestinos(lista), 'utf8');
        await fh.sync();
      } finally {
        await fh.close();
      }
      try {
        await fs.copyFile(file, `${file}.bak`);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      await fs.rename(tmp, file);
    } catch (e) {
      await fs.rm(tmp, { force: true });
      throw new StorageError(`Falha ao gravar ${file}: ${(e as Error).message}`);
    }
  }

  return {
    descricao: file,
    remoto: false,

    async init() {
      await fs.mkdir(opts.dataDir, { recursive: true });
      try {
        await fs.access(file);
        return;
      } catch {
        // O arquivo ainda não existe.
      }
      if (!opts.seedFile) return;

      let seed: unknown;
      try {
        seed = JSON.parse(await fs.readFile(opts.seedFile, 'utf8'));
      } catch {
        throw new StorageError(`SEED_FILE inválido ou ilegível: ${opts.seedFile}`);
      }
      if (!Array.isArray(seed)) throw new StorageError('SEED_FILE deve conter um array de destinos.');

      const lista = (seed as (Partial<Destino> & { id?: string; status?: string })[]).map((d) =>
        normalizarDestino({ ...d, id: typeof d.id === 'string' && d.id ? d.id : randomUUID() }),
      );
      await gravarArquivo(lista);
    },

    async ler() {
      // Processo único com fila de gravação: não há versão a conferir no arquivo local.
      return { destinos: await lerArquivo(), version: null };
    },

    async gravar(destinos) {
      await gravarArquivo(destinos);
      return null;
    },
  };
}
