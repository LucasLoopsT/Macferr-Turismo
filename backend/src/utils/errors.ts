/** Erro com código HTTP e mensagem segura para devolver ao cliente. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detalhes?: unknown,
    /** Segundos até poder tentar de novo (vira o cabeçalho Retry-After nas respostas 429). */
    public readonly retryAfterSeg?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Falha de leitura/gravação do arquivo de dados (nunca vaza detalhes ao cliente). */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}
