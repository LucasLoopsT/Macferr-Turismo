import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Utilitários para estado pequeno guardado em JSON no disco persistente (DATA_DIR).
 * Mesmo padrão do destinos.json: fila de escrita em memória + gravação atômica.
 * Vale para UMA instância do servidor.
 */

/** Fila: executa as funções uma de cada vez, na ordem de chegada (evita corridas de leitura/escrita). */
export function criarFila() {
  let fila: Promise<unknown> = Promise.resolve();
  return function comLock<T>(fn: () => Promise<T>): Promise<T> {
    const resultado = fila.then(fn);
    fila = resultado.catch(() => undefined);
    return resultado;
  };
}

/** Lê um JSON. Arquivo ausente ou ilegível devolve `fallback` (e registra o motivo, se houver `log`). */
export async function lerJson<T>(file: string, fallback: T, log?: (m: string) => void): Promise<T> {
  let bruto: string;
  try {
    bruto = await fs.readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') log?.(`[estado] não foi possível ler ${path.basename(file)}; usando estado vazio.`);
    return fallback;
  }
  try {
    return JSON.parse(bruto) as T;
  } catch {
    log?.(`[estado] ${path.basename(file)} está corrompido; usando estado vazio.`);
    return fallback;
  }
}

/** Grava de forma atômica: escreve em temporário, faz fsync e renomeia por cima do original. */
export async function gravarJsonAtomico(file: string, dados: unknown, mode = 0o600): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    const fh = await fs.open(tmp, 'w', mode);
    try {
      await fh.writeFile(JSON.stringify(dados) + '\n', 'utf8');
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}
