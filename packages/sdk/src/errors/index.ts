/**
 * Hierarquia de erros do SDK.
 *
 * A API devolve um envelope único (`statusCode`, `code`, `message`, `details`,
 * `requestId`). Decida pelo `code`, nunca pela `message`. Cada erro do SDK
 * expõe propriedades consistentes: `code`, `status`, `requestId`,
 * `retryAfter` e `cause`, quando aplicáveis.
 *
 * @see https://docs.squord.com.br/referencia/erros
 */

import type { APIErrorBody, APIRateLimitDetails, APIValidationIssue } from "../types/api";

/** Base de todos os erros lançados pelo SDK. */
export class SquordError extends Error {
  /** Código estável do erro, em `SCREAMING_SNAKE`. */
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.name = new.target.name;
    this.code = code;
  }
}

/**
 * Erro devolvido pela API REST do Squord. Teste sempre pelo `code`
 * (ex.: `err.code === "MISSING_PERMISSION"`), nunca pela `message`.
 */
export class SquordAPIError extends SquordError {
  /** Status HTTP da resposta. */
  readonly status: number;
  /** O mesmo valor do header `x-request-id` da resposta. */
  readonly requestId: string | null;
  /** Corpo bruto do erro (o envelope completo), quando disponível. */
  readonly responseBody: APIErrorBody | null;
  /** `details` do envelope, quando existe. */
  readonly details: unknown;

  constructor(body: APIErrorBody, status: number, requestId?: string | null) {
    super(body.code, body.message ?? `Erro da API do Squord (HTTP ${status})`);
    this.status = status;
    this.requestId = requestId ?? body.requestId ?? null;
    this.details = body.details;
    this.responseBody = body;
  }
}

/** `401 UNAUTHENTICATED` — não há credencial na requisição. */
export class AuthenticationError extends SquordAPIError {}

/** `401 INVALID_TOKEN` — token malformado, revogado ou trocado, ou bot/dono excluído ou suspenso. */
export class InvalidTokenError extends AuthenticationError {}

/** `403` — a credencial é válida, mas a ação não é permitida (`MISSING_PERMISSION`, `FORBIDDEN`, `NOT_A_MEMBER`, ...). */
export class PermissionError extends SquordAPIError {
  /** Nome da permissão que faltou, quando o erro é `MISSING_PERMISSION`. */
  readonly missingPermission: string | null;

  constructor(body: APIErrorBody, status: number, requestId?: string | null) {
    super(body, status, requestId);
    const details = body.details as { permission?: string } | null | undefined;
    this.missingPermission = details?.permission ?? null;
  }
}

/** `404` — recurso inexistente ou invisível para o bot. */
export class NotFoundError extends SquordAPIError {}

/** `422 VALIDATION_FAILED` — corpo bem formado, mas inválido. */
export class ValidationError extends SquordAPIError {
  /** Os itens de validação (campo, código do item, limite violado). */
  readonly issues: APIValidationIssue[];

  constructor(body: APIErrorBody, status: number, requestId?: string | null) {
    super(body, status, requestId);
    this.issues = Array.isArray(body.details) ? (body.details as APIValidationIssue[]) : [];
  }
}

/** `429 RATE_LIMITED` — limite de taxa. Espere `retryAfter` segundos. */
export class RateLimitError extends SquordAPIError {
  /** Segundos de espera informados pelo servidor (mínimo 1). */
  readonly retryAfter: number;
  /** O bucket que recusou (`MESSAGE_CREATE`, `BOT_GLOBAL`, ...). */
  readonly bucket: string | null;
  /** `true` quando o SDK já esgotou as retentativas automáticas. */
  readonly exhaustedRetries: boolean;

  constructor(
    body: APIErrorBody,
    status: number,
    options?: { requestId?: string | null; exhaustedRetries?: boolean },
  ) {
    super(body, status, options?.requestId);
    const details = body.details as APIRateLimitDetails | null | undefined;
    this.retryAfter = details?.retryAfter ?? 1;
    this.bucket = details?.bucket ?? null;
    this.exhaustedRetries = options?.exhaustedRetries ?? false;
  }
}

/** Falha de rede antes de receber qualquer resposta (DNS, TCP, TLS). */
export class NetworkError extends SquordError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("NETWORK_ERROR", message, options);
  }
}

/** A requisição excedeu o tempo limite configurado. */
export class RequestTimeoutError extends SquordError {
  /** Milissegundos configurados de timeout. */
  readonly timeoutMs: number;
  /** Método HTTP da requisição que expirou. */
  readonly method: string;
  /** Caminho da requisição que expirou. */
  readonly path: string;

  constructor(method: string, path: string, timeoutMs: number, options?: { cause?: unknown }) {
    super(
      "REQUEST_TIMEOUT",
      `A requisição ${method} ${path} excedeu o timeout de ${timeoutMs} ms`,
      options,
    );
    this.method = method;
    this.path = path;
    this.timeoutMs = timeoutMs;
  }
}

/** Erro de conexão/fechamento do gateway. */
export class GatewayError extends SquordError {
  /** Código de fechamento (4000+) ou `null` em falhas de rede. */
  readonly closeCode: number | null;
  /** Razão textual enviada pelo servidor (informativa; use `closeCode`). */
  readonly reason: string | null;

  constructor(closeCode: number | null, reason: string | null, message?: string) {
    super(
      closeCode === null ? "GATEWAY_NETWORK_ERROR" : "GATEWAY_CLOSE",
      message ?? `Gateway fechou a conexão${closeCode !== null ? ` (código ${closeCode})` : ""}${reason ? `: ${reason}` : ""}`,
      { cause: undefined },
    );
    this.closeCode = closeCode;
    this.reason = reason;
  }
}

/** Erro de uso incorreto da API do SDK (argumentos inválidos no cliente). */
export class SquordTypeError extends SquordError {
  constructor(message: string) {
    super("SDK_INVALID_ARGUMENT", message);
  }
}

/**
 * Normaliza um corpo de erro em {@link SquordAPIError} ou uma subclasse.
 * Exportado para testes e uso avançado.
 */
export function makeAPIError(
  body: APIErrorBody,
  status: number,
  requestId?: string | null,
): SquordAPIError {
  switch (status) {
    case 401:
      return body.code === "INVALID_TOKEN"
        ? new InvalidTokenError(body, status, requestId)
        : new AuthenticationError(body, status, requestId);
    case 403:
      return new PermissionError(body, status, requestId);
    case 404:
      return new NotFoundError(body, status, requestId);
    case 422:
      return new ValidationError(body, status, requestId);
    case 429:
      return new RateLimitError(body, status, { requestId });
    default:
      return new SquordAPIError(body, status, requestId);
  }
}
