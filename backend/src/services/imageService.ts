import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../utils/errors';

export interface ImageServiceOptions {
  uploadDir: string;
  publicBaseUrl: string;
  maxBytes: number;
}

export const MIMES_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const PREFIXO = '/uploads/';
// Único formato de nome que o backend aceita ler/apagar: uuid + extensão conhecida.
const NOME_SEGURO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

/** Identifica o tipo real da imagem pelos primeiros bytes (o Content-Type enviado pelo cliente não é confiável). */
export function detectarImagem(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.toString('ascii', 0, 6))) return { mime: 'image/gif', ext: 'gif' };
  return null;
}

export function createImageService(opts: ImageServiceOptions) {
  const base = opts.publicBaseUrl.replace(/\/+$/, '');

  const nomeDe = (caminho: string): string | null => {
    if (!caminho.startsWith(PREFIXO)) return null;
    const nome = caminho.slice(PREFIXO.length);
    return NOME_SEGURO.test(nome) ? nome : null;
  };

  const arquivoDe = (nome: string) => path.join(opts.uploadDir, nome);

  return {
    /** Grava a imagem enviada. O nome é gerado aqui; nada vindo do cliente entra no caminho. */
    async salvar(buffer: Buffer, mimeDeclarado: string): Promise<{ path: string; url: string }> {
      if (!buffer.length) throw new HttpError(400, 'Arquivo de imagem vazio.');
      if (buffer.length > opts.maxBytes) {
        throw new HttpError(413, `Imagem maior que o limite de ${Math.floor(opts.maxBytes / 1024 / 1024)} MB.`);
      }
      const tipo = detectarImagem(buffer);
      if (!tipo) throw new HttpError(415, 'O arquivo não é uma imagem válida (JPEG, PNG, WebP ou GIF).');
      if (tipo.mime !== mimeDeclarado) throw new HttpError(415, 'O tipo declarado não corresponde ao conteúdo do arquivo.');

      await fs.mkdir(opts.uploadDir, { recursive: true });
      const nome = `${randomUUID()}.${tipo.ext}`;
      await fs.writeFile(arquivoDe(nome), buffer, { flag: 'wx', mode: 0o644 });
      const caminho = PREFIXO + nome;
      return { path: caminho, url: base + caminho };
    },

    /** Converte o valor guardado no JSON em URL que o navegador consegue abrir. */
    paraUrlPublica(imagem: string): string {
      return imagem.startsWith(PREFIXO) ? base + imagem : imagem;
    },

    /**
     * Normaliza o campo `imagem` recebido do cliente:
     *  - vazio: sem imagem;
     *  - URL da própria API (o frontend devolve o que recebeu): vira caminho relativo /uploads/<arquivo>;
     *  - caminho /uploads/<arquivo>: precisa existir no disco;
     *  - URL http(s) externa: aceita como está;
     *  - qualquer outra coisa (javascript:, data:, ../, caminhos soltos): recusada.
     */
    async normalizar(imagem: string, campoErro = 'imagem'): Promise<string> {
      const valor = imagem.trim();
      if (!valor) return '';

      let candidato = valor;
      if (valor.startsWith(base + PREFIXO)) candidato = valor.slice(base.length);

      if (candidato.startsWith('/')) {
        const nome = nomeDe(candidato);
        if (!nome) throw new HttpError(400, 'Dados inválidos.', [{ campo: campoErro, mensagem: 'Caminho de imagem inválido.' }]);
        try {
          await fs.access(arquivoDe(nome));
        } catch {
          throw new HttpError(400, 'Dados inválidos.', [{ campo: campoErro, mensagem: 'A imagem enviada não foi encontrada. Envie o arquivo novamente.' }]);
        }
        return candidato;
      }

      try {
        const u = new URL(valor);
        if (u.protocol === 'http:' || u.protocol === 'https:') return valor;
      } catch {
        /* cai no erro abaixo */
      }
      throw new HttpError(400, 'Dados inválidos.', [{ campo: campoErro, mensagem: 'Use uma URL http(s) ou envie um arquivo.' }]);
    },

    ehLocal(imagem: string): boolean {
      return nomeDe(imagem) !== null;
    },

    /** Apaga um arquivo local. Ignora valores que não sejam de upload e arquivos já ausentes. */
    async remover(imagem: string): Promise<void> {
      const nome = nomeDe(imagem);
      if (!nome) return;
      await fs.rm(arquivoDe(nome), { force: true });
    },

    /** Apaga uploads que nenhum destino referencia e que têm mais de `idadeMinimaMs` (ex.: envios abandonados). */
    async limparOrfaos(emUso: Set<string>, idadeMinimaMs: number): Promise<number> {
      let nomes: string[];
      try {
        nomes = await fs.readdir(opts.uploadDir);
      } catch {
        return 0;
      }
      let apagados = 0;
      for (const nome of nomes) {
        if (!NOME_SEGURO.test(nome) || emUso.has(PREFIXO + nome)) continue;
        const alvo = arquivoDe(nome);
        const st = await fs.stat(alvo).catch(() => null);
        if (st && Date.now() - st.mtimeMs >= idadeMinimaMs) {
          await fs.rm(alvo, { force: true });
          apagados++;
        }
      }
      return apagados;
    },
  };
}

export type ImageService = ReturnType<typeof createImageService>;
