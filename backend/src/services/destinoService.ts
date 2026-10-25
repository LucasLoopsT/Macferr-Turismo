
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  normalizarDestino,
  type Destino,
  type DestinoInput,
} from '../types/destino';
import { StorageError } from '../utils/errors';

export interface DestinoServiceOptions {
  dataDir: string;
  seedFile?: string | null;
}

export function createDestinoService(opts: DestinoServiceOptions) {
  const file = path.join(opts.dataDir, 'destinos.json');
  let fila: Promise<unknown> = Promise.resolve();

  function comLock<T>(fn: () => Promise<T>): Promise<T> {
    const resultado = fila.then(fn);
    fila = resultado.catch(() => undefined);
    return resultado;
  }

  async function lerArquivo(): Promise<Destino[]> {
    let bruto: string;

    try {
      bruto = await fs.readFile(file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new StorageError(`Não foi possível ler ${file}.`);
    }

    let dados: unknown;

    try {
      dados = JSON.parse(bruto);
    } catch {
      throw new StorageError(
        `${file} está corrompido. O backup anterior fica em ${file}.bak.`,
      );
    }

    if (!Array.isArray(dados)) {
      throw new StorageError(
        `${file} tem formato inesperado (era esperado um array).`,
      );
    }

    return (
      dados as (Partial<Destino> & {
        id: string;
        status?: string;
      })[]
    ).map(normalizarDestino);
  }

  async function gravar(lista: Destino[]): Promise<void> {
    await fs.mkdir(opts.dataDir, { recursive: true });

    const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;

    try {
      const fh = await fs.open(tmp, 'w');

      try {
        await fh.writeFile(
          JSON.stringify(lista, null, 2) + '\n',
          'utf8',
        );
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
      throw new StorageError(
        `Falha ao gravar ${file}: ${(e as Error).message}`,
      );
    }
  }

  return {
    file,

    init(): Promise<void> {
      return comLock(async () => {
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
          throw new StorageError(
            `SEED_FILE inválido ou ilegível: ${opts.seedFile}`,
          );
        }

        if (!Array.isArray(seed)) {
          throw new StorageError(
            'SEED_FILE deve conter um array de destinos.',
          );
        }

        const lista = (
          seed as (Partial<Destino> & { id?: string; status?: string })[]
        ).map((d) =>
          normalizarDestino({
            ...d,
            id: typeof d.id === 'string' && d.id
              ? d.id
              : randomUUID(),
          }),
        );

        await gravar(lista);
      });
    },

    /** Lista todos os registros, inclusive os rascunhos. Uso administrativo. */
    list(): Promise<Destino[]> {
      return lerArquivo();
    },

    /** Próximas viagens visíveis publicamente. */
    async listProximas(): Promise<Destino[]> {
      return (await lerArquivo()).filter(
        (d) => d.status === 'Disponivel' || d.status === 'Esgotada',
      );
    },

    /** Viagens realizadas visíveis publicamente. */
    async listRealizadas(): Promise<Destino[]> {
      return (await lerArquivo()).filter(
        (d) => d.status === 'Finalizada',
      );
    },

    async get(id: string): Promise<Destino | null> {
      return (await lerArquivo()).find((d) => d.id === id) ?? null;
    },

    create(input: DestinoInput): Promise<Destino> {
      return comLock(async () => {
        const lista = await lerArquivo();
        const novo: Destino = { id: randomUUID(), ...input };
        lista.push(novo);
        await gravar(lista);
        return novo;
      });
    },

    update(
      id: string,
      patch: Partial<DestinoInput>,
    ): Promise<{ before: Destino; after: Destino } | null> {
      return comLock(async () => {
        const lista = await lerArquivo();
        const i = lista.findIndex((d) => d.id === id);

        if (i === -1) return null;

        const before = lista[i];
        const after: Destino = {
          ...before,
          ...patch,
          id: before.id,
        };

        lista[i] = after;
        await gravar(lista);

        return { before, after };
      });
    },

    remove(id: string): Promise<Destino | null> {
      return comLock(async () => {
        const lista = await lerArquivo();
        const i = lista.findIndex((d) => d.id === id);

        if (i === -1) return null;

        const [removido] = lista.splice(i, 1);
        await gravar(lista);

        return removido;
      });
    },

    async imagensEmUso(): Promise<Set<string>> {
      const em = new Set<string>();

      for (const d of await lerArquivo()) {
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
