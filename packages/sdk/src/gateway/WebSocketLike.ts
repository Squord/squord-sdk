/**
 * Abstração mínima de WebSocket usada pelo gateway.
 *
 * O SDK usa o `WebSocket` global do Node.js (22+) por padrão e aceita
 * qualquer implementação compatível — inclusive o pacote `ws` e os mocks
 * de teste (`@squord/sdk/testing`).
 */

export interface WebSocketCloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}

export interface WebSocketHandlers {
  open: () => void;
  message: (data: string) => void;
  close: (event: WebSocketCloseEvent) => void;
  error: (error: unknown) => void;
}

export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
}

export type WebSocketFactory = (url: string) => unknown;

/** Envelopa a implementação escolhida e normaliza os eventos. */
export function attachWebSocket(ws: unknown, handlers: WebSocketHandlers): WebSocketLike {
  const target = ws as {
    send?: (data: string) => void;
    close?: (code?: number, reason?: string) => void;
    readyState?: number;
    addEventListener?: (type: string, listener: (event: never) => void) => void;
    on?: (event: string, listener: (...args: never[]) => unknown) => unknown;
  };

  if (typeof target.addEventListener === "function") {
    const onOpen = () => handlers.open();
    const onMessage = (event: { data?: unknown }) => {
      const data = event.data;
      if (typeof data === "string") handlers.message(data);
      else if (data instanceof ArrayBuffer) handlers.message(new TextDecoder().decode(data));
      else if (data && typeof data === "object" && "toString" in data) {
        handlers.message(String(data));
      }
    };
    const onClose = (event: { code?: number; reason?: string; wasClean?: boolean }) => {
      handlers.close({
        code: event.code ?? 1005,
        reason: event.reason ?? "",
        wasClean: event.wasClean ?? false,
      });
    };
    const onError = (event: unknown) => handlers.error(event);

    target.addEventListener("open", onOpen as (event: never) => void);
    target.addEventListener("message", onMessage as (event: never) => void);
    target.addEventListener("close", onClose as (event: never) => void);
    target.addEventListener("error", onError as (event: never) => void);

    return {
      send: (data: string) => target.send?.(data),
      close: (code?: number, reason?: string) => target.close?.(code, reason),
      get readyState(): number {
        return target.readyState ?? 0;
      },
    };
  }

  // API estilo `ws` (EventEmitter: on("open"), on("message", data), ...)
  const onMessage = (data: unknown) => {
    if (typeof data === "string") handlers.message(data);
    else if (Buffer.isBuffer(data)) handlers.message(data.toString("utf8"));
    else handlers.message(String(data));
  };
  const onClose = (code: number, reason: string) =>
    handlers.close({ code, reason, wasClean: true });
  const onError = (error: unknown) => handlers.error(error);

  target.on?.("open", handlers.open as (...args: never[]) => unknown);
  target.on?.("message", onMessage as (...args: never[]) => unknown);
  target.on?.("close", onClose as (...args: never[]) => unknown);
  target.on?.("error", onError as (...args: never[]) => unknown);

  return {
    send: (data: string) => target.send?.(data),
    close: (code?: number, reason?: string) => target.close?.(code, reason),
    get readyState(): number {
      return target.readyState ?? 0;
    },
  };
}

/**
 * Fábrica padrão: o `WebSocket` global. Requer Node.js 22+; em versões
 * anteriores, passe `ws` (ou outra implementação) em `GatewayOptions.ws`.
 */
export const globalWebSocketFactory: WebSocketFactory = (url) => new WebSocket(url);
