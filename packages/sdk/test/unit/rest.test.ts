import { describe, expect, it, vi } from "vitest";
import { RestClient, routeKeyOf } from "../../src/rest/RestClient";
import {
  AuthenticationError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ValidationError,
  SquordAPIError,
  NetworkError,
} from "../../src/errors";
import { createMockRest } from "../../src/testing/MockRest";

const TOKEN = "sqb_1.segredo";

function ok(body: unknown) {
  return { status: 200, body };
}

describe("RestClient — básico", () => {
  it("envia Authorization, Content-Type e x-request-id", async () => {
    const mock = createMockRest();
    mock.get("/bots/@me", () => ok({ id: "1" }));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });

    await client.get("/bots/@me");
    const call = mock.lastCall!;
    expect(call.headers.authorization).toBe(`Bot ${TOKEN}`);
    expect(call.headers["content-type"]).toBe("application/json");
    expect(call.requestId).toBeTruthy();
  });

  it("codifica query params e omiti vazios", async () => {
    const mock = createMockRest();
    mock.get("/channels/:id/messages", (m) => ok({ limit: m.query.get("limit") }));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    await client.get("/channels/1300/messages", {
      query: { limit: 50, before: undefined, after: null as never },
    });
    const call = mock.lastCall!;
    expect(call.query.get("limit")).toBe("50");
    expect(call.query.has("before")).toBe(false);
  });

  it("serializa corpo JSON", async () => {
    const mock = createMockRest();
    mock.post("/channels/:id/messages", (m) => ok({ nonce: (m.body as never as { nonce: string }).nonce }));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    const result = await client.post("/channels/1/messages", { content: "oi", nonce: "abc" });
    expect(result).toEqual({ nonce: "abc" });
    expect(mock.lastCall!.body).toEqual({ content: "oi", nonce: "abc" });
  });

  it("DELETE 204 devolve null", async () => {
    const mock = createMockRest();
    mock.delete("/channels/:id/messages/:mid", () => ({ status: 204 }));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    await expect(client.delete("/channels/1/messages/2")).resolves.toBeNull();
  });

  it("rota pública (callback de interação) não envia Authorization", async () => {
    const mock = createMockRest();
    mock.post("/interactions/:id/:token/callback", () => ({ status: 204 }));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    await client.post("/interactions/i1/tk/callback", { type: "MESSAGE" }, { auth: false });
    expect(mock.lastCall!.headers.authorization).toBeUndefined();
  });
});

describe("RestClient — mapeamento de erros", () => {
  it("401 vira AuthenticationError com requestId", async () => {
    const mock = createMockRest();
    mock.get("/x", () => ({
      status: 401,
      body: { statusCode: 401, code: "INVALID_TOKEN", message: "Invalid token" },
    }));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    const error = await client.get("/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as SquordAPIError).code).toBe("INVALID_TOKEN");
    expect((error as SquordAPIError).requestId).toBeTruthy();
  });

  it("403 MISSING_PERMISSION vira PermissionError com detalhe", async () => {
    const mock = createMockRest();
    mock.get("/x", () => ({
      status: 403,
      body: {
        statusCode: 403,
        code: "MISSING_PERMISSION",
        message: "Missing permission: SEND_MESSAGES",
        details: { permission: "SEND_MESSAGES" },
      },
    }));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    const error = (await client.get("/x").catch((e: unknown) => e)) as PermissionError;
    expect(error).toBeInstanceOf(PermissionError);
    expect(error.missingPermission).toBe("SEND_MESSAGES");
  });

  it("404 vira NotFoundError", async () => {
    const mock = createMockRest();
    mock.get("/x", () => ({ status: 404, body: { statusCode: 404, code: "NOT_FOUND", message: "não" } }));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    await expect(client.get("/x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("422 VALIDATION_FAILED vira ValidationError com issues", async () => {
    const mock = createMockRest();
    mock.post("/x", () => ({
      status: 422,
      body: {
        statusCode: 422,
        code: "VALIDATION_FAILED",
        message: "Request payload failed validation",
        details: [{ path: "embeds.0.title", code: "TOO_LONG", message: "Too long" }],
      },
    }));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    const error = (await client.post("/x", {}).catch((e: unknown) => e)) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.issues[0]!.path).toBe("embeds.0.title");
  });
});

describe("RestClient — política de retentativas", () => {
  it("espera details.retryAfter em 429 e repete", async () => {
    const mock = createMockRest();
    let calls = 0;
    mock.get("/bots/@me", () => {
      calls++;
      if (calls === 1) {
        return {
          status: 429,
          body: {
            statusCode: 429,
            code: "RATE_LIMITED",
            message: "Too many requests",
            details: { bucket: "DEFAULT", retryAfter: 1 },
          },
          headers: { "Retry-After": "1" },
        };
      }
      return ok({ id: "1" });
    });
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    const result = await client.get("/bots/@me");
    expect(result).toEqual({ id: "1" });
    expect(calls).toBe(2);
  });

  it("429 esgotado vira RateLimitError com exhaustedRetries", async () => {
    const mock = createMockRest();
    mock.get("/x", () => ({
      status: 429,
      body: {
        statusCode: 429,
        code: "RATE_LIMITED",
        message: "Too many",
        details: { bucket: "DEFAULT", retryAfter: 1 },
      },
    }));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test", maxRetries: 1 });
    const error = (await client.get("/x").catch((e: unknown) => e)) as RateLimitError;
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfter).toBe(1);
    expect(error.bucket).toBe("DEFAULT");
    expect(error.exhaustedRetries).toBe(true);
  });

  it("repete 5xx em operação idempotente (GET)", async () => {
    const mock = createMockRest();
    let calls = 0;
    mock.get("/bots/@me", () => {
      calls++;
      if (calls <= 2) {
        return { status: 503, body: { statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "x" } };
      }
      return ok({ ok: true });
    });
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    const result = await client.get("/bots/@me");
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it("NÃO repete 5xx em POST sem retryable (regra de ouro)", async () => {
    const mock = createMockRest();
    let calls = 0;
    mock.post("/uploads", () => {
      calls++;
      return { status: 503, body: { statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "x" } };
    });
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    await expect(client.post("/uploads", {})).rejects.toBeInstanceOf(SquordAPIError);
    expect(calls).toBe(1);
  });

  it("repete POST quando retryable (mensagem protegida por nonce)", async () => {
    const mock = createMockRest();
    let calls = 0;
    mock.post("/channels/:id/messages", (m) => {
      calls++;
      if (calls === 1) {
        return { status: 503, body: { statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "x" } };
      }
      return ok({ id: "m1", nonce: (m.body as never as { nonce: string }).nonce });
    });
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    const result = await client.post(
      "/channels/1/messages",
      { content: "oi", nonce: "fixo" },
      { retryable: true },
    );
    expect((result as { nonce: string }).nonce).toBe("fixo");
    expect(calls).toBe(2);
    // O nonce é preservado nas retentativas: mesma chave de idempotência.
    const bodies = mock.callLog.map((call) => (call.body as never as { nonce: string }).nonce);
    expect(bodies).toEqual(["fixo", "fixo"]);
  });

  it("repete 409 COMMANDS_CONFLICT (doc: releia e repita)", async () => {
    const mock = createMockRest();
    let calls = 0;
    mock.put("/bots/@me/commands", () => {
      calls++;
      if (calls === 1) {
        return { status: 409, body: { statusCode: 409, code: "COMMANDS_CONFLICT", message: "x" } };
      }
      return ok([]);
    });
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    await client.put("/bots/@me/commands", []);
    expect(calls).toBe(2);
  });

  it("falha de rede vira NetworkError e repete idempotentes", async () => {
    const mock = createMockRest();
    let calls = 0;
    mock.get("/bots/@me", () => {
      calls++;
      if (calls === 1) throw new TypeError("fetch failed");
      return ok({ ok: true });
    });
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    const result = await client.get("/bots/@me");
    expect(result).toEqual({ ok: true });
  });

  it("falha de rede em POST não-retentável falha direto", async () => {
    const mock = createMockRest();
    let calls = 0;
    mock.post("/uploads", () => {
      calls++;
      throw new TypeError("fetch failed");
    });
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    const error = await client.post("/uploads", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(calls).toBe(1);
  });

  it("respeita AbortSignal externo", async () => {
    const mock = createMockRest();
    mock.get("/bots/@me", () => {
      throw new DOMException("aborted", "AbortError");
    });
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
    const controller = new AbortController();
    controller.abort();
    await expect(client.get("/bots/@me", { signal: controller.signal })).rejects.toThrow();
  });

  it("timeout tipado não repete POST não-idempotente", async () => {
    const mock = createMockRest();
    let calls = 0;
    mock.post("/uploads", () => {
      calls++;
      throw new DOMException("timeout", "TimeoutError");
    });
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test", timeoutMs: 50 });
    const error = await client.post("/uploads", {}).catch((e: unknown) => e);
    expect((error as Error).name).toBe("RequestTimeoutError");
    expect(calls).toBe(1);
  });
});

describe("RestClient — rate limits locais", () => {
  it("bloqueia a rota quando X-RateLimit-Remaining chega a 0", async () => {
    vi.useFakeTimers();
    try {
      const mock = createMockRest();
      let seq = 0;
      const resetAt = Math.floor(Date.now() / 1000) + 1;
      mock.get("/x", () => {
        seq++;
        return {
          status: 200,
          body: { seq },
          headers: {
            "X-RateLimit-Limit": "2",
            "X-RateLimit-Remaining": seq === 1 ? "0" : "1",
            "X-RateLimit-Reset": String(resetAt),
          },
        };
      });
      const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test" });
      await client.get("/x");
      // A segunda chamada espera a janela renovar em vez de tomar 429.
      const promise = client.get("/x");
      const advanced = vi.advanceTimersByTimeAsync(1500);
      await Promise.all([promise, advanced]);
      expect(mock.callLog.length).toBeGreaterThanOrEqual(2);
      expect(client.bucketState("GET", "/x")?.remaining).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aplica teto global abaixo de 50/s", async () => {
    const mock = createMockRest();
    mock.get("/x", () => ok({}));
    const client = new RestClient({ token: TOKEN, fetchImpl: mock.fetch, baseURL: "https://mock.test", globalRequestsPerSecond: 5 });
    const start = Date.now();
    const requests = Array.from({ length: 10 }, () => client.get("/x"));
    await Promise.all(requests);
    // 10 requisições com teto de 5/s: precisa ter levado ~1s.
    expect(Date.now() - start).toBeGreaterThanOrEqual(900);
  });
});

describe("routeKeyOf", () => {
  it("substitui ids por marcadores", () => {
    expect(routeKeyOf("POST", "/channels/1300000000000000040/messages")).toBe(
      "POST /channels/{id}/messages",
    );
    expect(routeKeyOf("PUT", "/guilds/12345/bans/67890")).toBe("PUT /guilds/{id}/bans/{id}");
  });

  it("não troca @me", () => {
    expect(routeKeyOf("GET", "/bots/@me")).toBe("GET /bots/@me");
  });
});
