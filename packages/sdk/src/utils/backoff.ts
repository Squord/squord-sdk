/**
 * Backoff exponencial com jitter, para reconexões do gateway e retentativas
 * de REST. A recomendação da documentação: 1 s, 2 s, 4 s ... até 60 s, mais
 * um valor aleatório.
 */

export interface BackoffOptions {
  /** Primeira espera, em milissegundos. Padrão 1000. */
  baseMs?: number;
  /** Multiplicador entre tentativas. Padrão 2. */
  factor?: number;
  /** Teto da espera base, em milissegundos. Padrão 60000. */
  maxMs?: number;
  /** Fração de jitter: 0.25 espera ±25%. Padrão 0.25. */
  jitter?: number;
}

/** Calcula a espera para a tentativa `attempt` (0-based). */
export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const { baseMs = 1000, factor = 2, maxMs = 60_000, jitter = 0.25 } = options;
  const bounded = Math.min(attempt, 16); // evita overflow
  const exp = Math.min(baseMs * factor ** bounded, maxMs);
  const jitterAmount = exp * jitter * (Math.random() * 2 - 1);
  return Math.max(250, Math.round(exp + jitterAmount));
}

/** Cria um gerador de esperas de backoff infinito. */
export function* backoffSequence(options: BackoffOptions = {}): Generator<number, never, void> {
  for (let attempt = 0; ; attempt++) {
    yield backoffDelay(attempt, options);
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Sleep aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Jitter uniforme em [0, max]. */
export function jitter(max: number): number {
  return Math.floor(Math.random() * max);
}
