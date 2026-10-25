import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig, type Config } from '../src/config/env';

export async function tempDir(): Promise<{ dir: string; limpar: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'macferr-test-'));
  return { dir, limpar: () => rm(dir, { recursive: true, force: true }) };
}

export const SENHA = 'senha-de-teste-123';
export const SEGREDO = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';

export function configDeTeste(dir: string, extra: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    ADMIN_PASSWORD: SENHA,
    JWT_SECRET: SEGREDO,
    CORS_ORIGINS: 'http://localhost:3000',
    PUBLIC_BASE_URL: 'http://localhost:3001',
    DATA_DIR: dir,
    ...extra,
  });
}

/** Resposta falsa com a mesma interface mínima do Express, para testar middlewares e controllers sem servidor. */
export function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    headersSent: false,
    ended: false,
    status(c: number) { res.statusCode = c; return res; },
    json(b: unknown) { res.body = b; res.ended = true; return res; },
    set(k: string, v: string) { res.headers[k.toLowerCase()] = v; return res; },
    end() { res.ended = true; return res; },
  };
  return res;
}

// PNG mínimo válido de 1x1 pixel
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
export const JPEG_MIN = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
