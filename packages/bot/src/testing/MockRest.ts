/**
 * MockRest: um servidor REST em memória para testar bots sem rede.
 *
 * Implementa `fetch` (passado ao cliente em `fetchImpl`) e responde às
 * rotas registradas com padrões tipo `GET /channels/:channelId/messages`.
 * Rotas não registradas respondem `404 NOT_FOUND` com o envelope oficial,
 * e as validações mínimas do protocolo (token presente, JSON válido) são
 * aplicadas como a API real faria.
 */

export interface MockRestCall {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
  requestId: string | null;
}

export interface MockRouteMatch {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  call: MockRestCall;
}

export interface MockRouteHandler {
  (match: MockRouteMatch): { status: number; body?: unknown; headers?: Record<string, string> } | Promise<unknown>;
}

interface Route {
  method: string;
  pattern: string;
  segments: string[];
  handler: MockRouteHandler;
}

const API_ERROR_HEADERS = { "x-request-id": "mock-request-id" };

export class MockRest {
  private routes: Route[] = [];
  private readonly calls: MockRestCall[] = [];
  /** Quando definido, todo request recebe esta resposta (testes de falha). */
  private failingHandler: ((call: MockRestCall) => Promise<Response> | Response) | null = null;
  /** Token esperado no header Authorization (sem o prefixo `Bot `). */
  expectedToken: string | null = null;

  /** Registra uma rota. `handler` devolve `{ status, body }` ou o corpo puro (status 200). */
  on(method: string, pattern: string, handler: MockRouteHandler): this {
    this.routes.push({
      method: method.toUpperCase(),
      pattern,
      segments: pattern.split("/").filter(Boolean),
      handler,
    });
    return this;
  }

  get(pattern: string, handler: MockRouteHandler): this {
    return this.on("GET", pattern, handler);
  }
  post(pattern: string, handler: MockRouteHandler): this {
    return this.on("POST", pattern, handler);
  }
  put(pattern: string, handler: MockRouteHandler): this {
    return this.on("PUT", pattern, handler);
  }
  patch(pattern: string, handler: MockRouteHandler): this {
    return this.on("PATCH", pattern, handler);
  }
  delete(pattern: string, handler: MockRouteHandler): this {
    return this.on("DELETE", pattern, handler);
  }

  /** Força falha em todas as requisições (ex.: simular queda de rede). */
  failWith(handler: (call: MockRestCall) => Promise<Response> | Response): void {
    this.failingHandler = handler;
  }

  /** Volta ao comportamento normal. */
  clearFailure(): void {
    this.failingHandler = null;
  }

  /** Histórico de chamadas recebidas. */
  get callLog(): readonly MockRestCall[] {
    return this.calls;
  }

  /** Última chamada registrada. */
  get lastCall(): MockRestCall | undefined {
    return this.calls[this.calls.length - 1];
  }

  /** Remove rotas e histórico. */
  reset(): void {
    this.routes = [];
    this.calls.length = 0;
    this.failingHandler = null;
  }

  /** A implementação de `fetch` para passar em `new SquordClient({ fetchImpl })`. */
  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input as string | URL, init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    let body: unknown = undefined;
    const rawBody = init?.body ?? (input instanceof Request ? undefined : undefined);
    if (rawBody !== undefined && rawBody !== null) {
      if (typeof rawBody === "string") {
        body = rawBody ? JSON.parse(rawBody) : undefined;
      } else if (rawBody instanceof ArrayBuffer || ArrayBuffer.isView(rawBody)) {
        body = rawBody;
      } else {
        body = rawBody;
      }
    } else if (input instanceof Request) {
      const clone = input.clone();
      const text = await clone.text().catch(() => "");
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of request.headers) headers[key] = value;

    const call: MockRestCall = {
      method,
      path: url.pathname,
      params: {},
      query: url.searchParams,
      body,
      headers,
      requestId: headers["x-request-id"] ?? null,
    };
    this.calls.push(call);

    if (this.failingHandler) {
      return this.failingHandler(call);
    }

    if (this.expectedToken) {
      const auth = headers.authorization ?? "";
      if (auth !== `Bot ${this.expectedToken}`) {
        return jsonResponse(401, {
          statusCode: 401,
          code: "INVALID_TOKEN",
          message: "Invalid token",
        });
      }
    }

    const pathSegments = url.pathname.split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = matchSegments(route.segments, pathSegments);
      if (!match) continue;

      const matchInfo: MockRouteMatch = {
        params: match,
        query: url.searchParams,
        body,
        call: { ...call, params: match },
      };
      const result = await route.handler(matchInfo);
      const response =
        result && typeof result === "object" && "status" in result
          ? (result as { status: number; body?: unknown; headers?: Record<string, string> })
          : { status: 200, body: result };
      return jsonResponse(response.status, response.body, response.headers);
    }

    return jsonResponse(404, {
      statusCode: 404,
      code: "NOT_FOUND",
      message: `Rota não mockada: ${method} ${url.pathname}`,
    });
  };
}

function matchSegments(pattern: string[], path: string[]): Record<string, string> | null {
  if (pattern.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i]!;
const s = path[i]!;
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(s);
    } else if (p !== s) {
      return null;
    }
  }
  return params;
}

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  const payload = body === undefined || body === null ? undefined : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: {
      ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
      ...API_ERROR_HEADERS,
      ...headers,
    },
  });
}

/** Cria um `MockRest` já com as rotas mínimas que o `login()` usa. */
export function createMockRest(options: { token?: string } = {}): MockRest {
  const rest = new MockRest();
  if (options.token) rest.expectedToken = options.token;
  return rest;
}
