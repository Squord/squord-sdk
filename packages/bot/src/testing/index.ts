/**
 * @squord/bot/testing — ferramentas para testar bots sem uma comunidade real.
 *
 * - `createMockRest()`: servidor REST em memória (passe `fetchImpl` ao cliente).
 * - `createMockGateway()`: gateway simulado que fala o protocolo real
 *   (passe `wsFactory` ao cliente).
 * - `createMockEnvironment()`: REST + gateway já conectados, com a rota de
 *   login respondendo — espalhe `...env.options` no `SquordClient` e pronto.
 * - `fixtures`: payloads de exemplo no formato da API.
 */

export { MockRest, createMockRest } from "./MockRest";
export type { MockRestCall, MockRouteHandler, MockRouteMatch } from "./MockRest";
export { MockGatewayServer, createMockGateway } from "./MockGateway";
export type { MockGatewayOptions } from "./MockGateway";
export * as fixtures from "./fixtures";

import { createMockRest } from "./MockRest";
import type { MockRest } from "./MockRest";
import { createMockGateway } from "./MockGateway";
import type { MockGatewayServer } from "./MockGateway";
import * as fixtures from "./fixtures";

/** Opções aceitas por `createMockEnvironment`. */
export interface MockEnvironmentOptions {
  /** Token que o mock aceita no identify. Padrão: aceita qualquer. */
  token?: string;
  /** Intervalo de heartbeat anunciado. Padrão: 200 (testes rápidos). */
  heartbeatIntervalMs?: number;
  /** Backoff de reconexão curto para testes. Padrão: 20. */
  reconnectBaseMs?: number;
}

export interface MockEnvironment {
  /** Opções prontas para espalhar no `SquordClient`. */
  options: {
    apiBaseURL: string;
    fetchImpl: typeof fetch;
    ws: (url: string) => unknown;
    gatewayReconnectBaseMs: number;
  };
  /** O gateway simulado: use `emitEvent` para simular eventos do Squord. */
  gateway: MockGatewayServer;
  /** O REST em memória: registre rotas e inspecione `callLog`. */
  rest: MockRest;
}

/**
 * Monta o ambiente completo de teste: `createMockRest` com a rota de login
 * (`GET /bots/@me`) já respondendo com um bot de exemplo, e `createMockGateway`
 * falando o protocolo real.
 *
 * ```js
 * import { SquordClient } from "@squord/bot";
 * import { createMockEnvironment, fixtures } from "@squord/bot/testing";
 *
 * const env = createMockEnvironment();
 * const client = new SquordClient({ token: "sqb_1.demo", ...env.options });
 * client.on("message.created", (m) => { /* ... *\/ });
 * await client.login();
 * env.gateway.emitEvent("message.created", { message: fixtures.message() });
 * ```
 */
export function createMockEnvironment(
  options: MockEnvironmentOptions = {},
): MockEnvironment {
  const rest = createMockRest();

  // Rota de login (usada pelo SquordClient.login()).
  rest.get("/bots/@me", () => ({ status: 200, body: fixtures.bot() }));

  // Envio de mensagens: ecoa o corpo como uma Message real.
  rest.post("/channels/:channelId/messages", (match) => {
    const body = (match.body ?? {}) as {
      content?: string;
      replyToId?: string;
      nonce?: string;
    };
    return {
      status: 201,
      body: fixtures.message({
        channelId: match.params.channelId,
        content: body.content ?? "",
        replyToId: body.replyToId ?? null,
        nonce: body.nonce ?? null,
        author: fixtures.botUser(),
      }),
    };
  });

  // Sincronização de comandos (CommandRegistry.sync): lista vazia por padrão.
  rest.put("/bots/@me/commands", () => ({ status: 200, body: [] }));
  rest.put("/bots/@me/guilds/:guildId/commands", () => ({ status: 200, body: [] }));

  const gateway = createMockGateway({
    heartbeatIntervalMs: options.heartbeatIntervalMs ?? 200,
    token: options.token,
  });

  return {
    options: {
      apiBaseURL: "https://mock.test",
      fetchImpl: rest.fetch,
      ws: gateway.wsFactory,
      gatewayReconnectBaseMs: options.reconnectBaseMs ?? 20,
    },
    gateway,
    rest,
  };
}
