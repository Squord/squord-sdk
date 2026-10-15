/**
 * Cliente REST do Squord.
 *
 * Encapsula `https://api.squord.com.br/api/v1` com:
 * - autenticação por token de bot (`Authorization: Bot sqb_...`);
 * - timeout configurável e cancelamento via `AbortSignal`;
 * - `x-request-id` em toda requisição (o valor volta nos erros);
 * - respeito aos limites de taxa: espera `details.retryAfter` em 429,
 *   observa os headers `X-RateLimit-*` e aplica um teto global conservador;
 * - retentativas para falhas transitórias (5xx, rede, 429) **somente em
 *   operações idempotentes ou protegidas por `nonce`** — a regra de ouro:
 *   nunca repetir automaticamente uma operação sem saber se a primeira foi
 *   processada;
 * - erros tipados (veja `../errors`).
 */

import {
  NetworkError,
  RateLimitError,
  RequestTimeoutError,
  SquordAPIError,
  makeAPIError,
} from "../errors";
import type { Logger } from "../logger";
import { noopLogger } from "../logger";
import { backoffDelay, sleep } from "../utils/backoff";
import { newRequestId } from "../utils/misc";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RestClientOptions {
  /** URL base da API. Padrão: `https://api.squord.com.br/api/v1`. */
  baseURL?: string;
  /** Token do bot (`sqb_...`). O SDK adiciona o prefixo `Bot `. */
  token: string;
  /** Timeout por requisição, em milissegundos. Padrão: 15000. */
  timeoutMs?: number;
  /**
   * Retentativas automáticas adicionais para falhas transitórias
   * (429, 5xx, rede). Padrão: 3.
   */
  maxRetries?: number;
  /**
   * Teto global de requisições por segundo, abaixo do `BOT_GLOBAL`
   * oficial (50/s). Padrão: 45. Use `0` para desligar.
   */
  globalRequestsPerSecond?: number;
  /** Implementação de fetch (injetável para testes). Padrão: global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Logger. O SDK não imprime nada por padrão. */
  logger?: Logger;
}

export interface RequestOptions {
  /** Parâmetros de query string (valores `undefined`/`null` são omitidos). */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Corpo JSON da requisição. */
  body?: unknown;
  /** Sinal de cancelamento externo. */
  signal?: AbortSignal;
  /** Id de requisição para rastreamento (`x-request-id`). */
  requestId?: string;
  /**
   * `false` para rotas públicas, como os callbacks de interação
   * (`/interactions/{id}/{token}/callback`), que não levam o header
   * `Authorization`. Padrão: `true`.
   */
  auth?: boolean;
  /**
   * Se a operação pode ser repetida com segurança após falha incerta
   * (timeout de rede, 5xx). Padrão: `true` para GET/PUT/DELETE e `false`
   * para POST. Operações POST protegidas por `nonce` (envio de mensagens,
   * confirmação de upload) devem marcar `true`.
   */
  retryable?: boolean;
}

export interface RestResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  requestId: string | null;
  request: Request;
}

/** Headers de rate limit de uma resposta. */
export interface RateLimitState {
  limit: number | null;
  remaining: number | null;
  /** Quando a janela renova, em segundos Unix. */
  reset: number | null;
}

const DEFAULT_BASE_URL = "https://api.squord.com.br/api/v1";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;

export class RestClient {
  readonly baseURL: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Logger;
  private readonly bucketStates = new Map<string, RateLimitState>();
  private readonly bucketBlockedUntil = new Map<string, number>();
  private readonly globalWindow: number[] = [];
  private readonly globalLimit: number;
  private destroyed = false;

  constructor(options: RestClientOptions) {
    this.baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = (options.logger ?? noopLogger).child("rest");
    const rps = options.globalRequestsPerSecond ?? 45;
    this.globalLimit = rps > 0 ? rps : Number.POSITIVE_INFINITY;
  }

  /** GET tipado. */
  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, options);
  }

  /** Implementação de fetch em uso (exposta para uploads e testes). */
  get fetch(): typeof fetch {
    return this.fetchImpl;
  }

  /** POST tipado. Não é retentável por padrão. */
  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("POST", path, { ...options, body });
  }

  /** PUT tipado (idempotente). */
  put<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("PUT", path, { ...options, body });
  }

  /** PATCH tipado (retentável por padrão quando idempotente pelo caller). */
  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("PATCH", path, { ...options, body });
  }

  /** DELETE tipado. Resposta 204 devolve `null`. */
  delete<T = null>(path: string, options: RequestOptions = {}): Promise<T | null> {
    return this.request<T | null>("DELETE", path, options);
  }

  /** Executa uma requisição com política completa de erros, retries e rate limits. */
  async request<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const response = await this.requestRaw<T>(method, path, options);
    return response.data;
  }

  /** Como `request`, mas devolve também status, headers e `x-request-id`. */
  async requestRaw<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<RestResponse<T>> {
    if (this.destroyed) {
      throw new SquordAPIError(
        { statusCode: 0, code: "SDK_DESTROYED", message: "O cliente foi destruído" },
        0,
      );
    }

    const retryable = options.retryable ?? method !== "POST";
    const url = this.buildUrl(path, options.query);
    const requestId = options.requestId ?? newRequestId();
    const routeKey = routeKeyOf(method, path);

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (options.signal?.aborted) throw new DOMException("Requisição cancelada", "AbortError");

      await this.waitForRouteBucket(routeKey, options.signal);
      await this.acquireGlobalSlot(options.signal);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-request-id": requestId,
      };
      if (options.auth !== false) {
        headers.Authorization = `Bot ${this.token}`;
      }
      const request = new Request(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });

      // Compõe timeout + sinal externo (com cancelamento do timer ao final).
      const signals: AbortSignal[] = [];
      const timeoutController = new AbortController();
      const timer = setTimeout(() => {
        timeoutController.abort(new DOMException("Request timed out", "TimeoutError"));
      }, this.timeoutMs);
      signals.push(timeoutController.signal);
      if (options.signal) signals.push(options.signal);
      const compositeSignal =
        signals.length === 1 ? signals[0]! : AbortSignal.any(signals);

      let response: Response;
      try {
        response = await this.fetchImpl(request, { signal: compositeSignal });
      } catch (err) {
        lastError = this.toNetworkError(err, method, path);
        const canRetry = retryable && attempt < this.maxRetries;
        this.logger.debug("network failure", { method, path, attempt, retryable, canRetry });
        if (!canRetry) throw lastError;
        await sleep(backoffDelay(attempt, { baseMs: 500, maxMs: 8_000 }), options.signal);
        continue;
      } finally {
        clearTimeout(timer);
      }

      this.recordBucketState(routeKey, response.headers);

      if (response.ok) {
        const data = (await this.parseBody<T>(response)) as T;
        return {
          data,
          status: response.status,
          headers: response.headers,
          requestId: response.headers.get("x-request-id") ?? requestId,
          request,
        };
      }

      // Erro HTTP: decide entre esperar/repetir ou falhar.
      const apiError = await this.toAPIError(response);
      lastError = apiError;

      if (apiError.status === 429 && apiError instanceof RateLimitError) {
        if (attempt < this.maxRetries) {
          const waitMs = apiError.retryAfter * 1000;
          this.logger.warn("rate limit, aguardando", {
            bucket: apiError.bucket,
            retryAfter: apiError.retryAfter,
          });
          await sleep(waitMs, options.signal);
          continue;
        }
        throw new RateLimitError(apiError.responseBody!, 429, {
          requestId: apiError.requestId,
          exhaustedRetries: true,
        });
      }

      if (
        apiError.status >= 500 &&
        retryable &&
        attempt < this.maxRetries
      ) {
        const waitMs = backoffDelay(attempt, { baseMs: 500, maxMs: 8_000 });
        this.logger.warn("erro 5xx, repetindo", { status: apiError.status, attempt, waitMs });
        await sleep(waitMs, options.signal);
        continue;
      }

      if (
        apiError.status === 409 &&
        (apiError.code === "COMMANDS_CONFLICT" || apiError.code === "THREAD_CHANGED") &&
        attempt < this.maxRetries
      ) {
        await sleep(250 + backoffDelay(attempt, { baseMs: 200, maxMs: 2_000 }), options.signal);
        continue;
      }

      throw apiError;
    }

    throw lastError;
  }

  /** Encerra o cliente: novas requisições falham imediatamente. */
  destroy(): void {
    this.destroyed = true;
    this.bucketStates.clear();
    this.bucketBlockedUntil.clear();
  }

  /** Estado de rate limit conhecido para uma rota (diagnóstico). */
  bucketState(method: HttpMethod, path: string): RateLimitState | undefined {
    return this.bucketStates.get(routeKeyOf(method, path));
  }

  // -----------------------------------------------------------------

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): string {
    let url = `${this.baseURL}${path.startsWith("/") ? path : `/${path}`}`;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
    return url;
  }

  private async parseBody<T>(response: Response): Promise<T | null> {
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  private async toAPIError(response: Response): Promise<SquordAPIError> {
    let body: {
      statusCode?: number;
      code?: string;
      message?: string;
      details?: unknown;
      requestId?: string;
    } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // resposta sem corpo
    }
    const enriched = {
      statusCode: response.status,
      code: body.code ?? `HTTP_${response.status}`,
      message: body.message ?? response.statusText,
      details: body.details,
      requestId: body.requestId ?? response.headers.get("x-request-id") ?? undefined,
    };
    return makeAPIError(enriched as Parameters<typeof makeAPIError>[0], response.status, enriched.requestId);
  }

  private toNetworkError(err: unknown, method: string, path: string): unknown {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return new RequestTimeoutError(method, path, this.timeoutMs, { cause: err });
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      return err; // cancelamento explícito: propaga
    }
    const reason = (err as { reason?: unknown })?.reason;
    if (reason instanceof DOMException && reason.name === "TimeoutError") {
      return new RequestTimeoutError(method, path, this.timeoutMs, { cause: err });
    }
    return new NetworkError(`Falha de rede em ${method} ${path}: ${String((err as Error)?.message ?? err)}`, {
      cause: err,
    });
  }

  private recordBucketState(routeKey: string, headers: Headers): void {
    const limit = headers.get("x-ratelimit-limit");
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    if (limit === null && remaining === null && reset === null) return;
    const state: RateLimitState = {
      limit: limit !== null ? Number(limit) : null,
      remaining: remaining !== null ? Number(remaining) : null,
      reset: reset !== null ? Number(reset) : null,
    };
    this.bucketStates.set(routeKey, state);
    if (state.remaining === 0 && state.reset !== null) {
      const blockedUntil = state.reset * 1000;
      this.bucketBlockedUntil.set(routeKey, blockedUntil);
    }
  }

  private async waitForRouteBucket(routeKey: string, signal?: AbortSignal): Promise<void> {
    for (;;) {
      const blockedUntil = this.bucketBlockedUntil.get(routeKey);
      if (blockedUntil === undefined) return;
      const waitMs = blockedUntil - Date.now();
      if (waitMs <= 0) {
        this.bucketBlockedUntil.delete(routeKey);
        return;
      }
      await sleep(waitMs, signal).catch(() => {});
      if (signal?.aborted) return;
    }
  }

  private async acquireGlobalSlot(signal?: AbortSignal): Promise<void> {
    if (this.globalLimit === Number.POSITIVE_INFINITY) return;
    for (;;) {
      const now = Date.now();
      while (this.globalWindow.length > 0 && now - this.globalWindow[0]! >= 1000) {
        this.globalWindow.shift();
      }
      if (this.globalWindow.length < this.globalLimit) {
        this.globalWindow.push(now);
        return;
      }
      const waitMs = 1000 - (now - this.globalWindow[0]!) + 10;
      await sleep(waitMs, signal);
    }
  }
}

/**
 * Chave de bucket de rate limit: método + caminho com ids substituídos.
 * Ex.: `POST /channels/{id}/messages` para qualquer canal.
 */
export function routeKeyOf(method: string, path: string): string {
  const normalized = path
    .replace(/\/\d{5,20}\b/g, "/{id}")
    .replace(/\/[0-9a-f]{24}\b/gi, "/{id}");
  return `${method} ${normalized}`;
}
