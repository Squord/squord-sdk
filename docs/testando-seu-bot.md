# Testando seu bot

Como testar bots do Squord sem uma comunidade real — com o subpath
`@squord/sdk/testing`, que traz um gateway simulado (protocolo real em memória)
e um REST em memória.

## Setup

```ts
import { SquordClient } from "@squord/sdk";
import { createMockGateway, createMockRest, fixtures } from "@squord/sdk/testing";

function makeClient() {
  const rest = createMockRest();
  const gateway = createMockGateway({ heartbeatIntervalMs: 100 });

  // Rotas que o login e o bot usarem:
  rest.get("/bots/@me", () => ({ status: 200, body: fixtures.bot() }));
  rest.post("/channels/:id/messages", (m) => ({
    status: 201,
    body: fixtures.message({ content: (m.body as any).content }),
  }));

  const client = new SquordClient({
    token: "sqb_1.segredo",
    apiBaseURL: "https://mock.test", // para os padrões de rota baterem
    fetchImpl: rest.fetch,
    ws: gateway.wsFactory,
    gatewayReconnectBaseMs: 20,      // backoff curto para testes
  });
  return { client, rest, gateway };
}
```

> `apiBaseURL` importa: o mock casa o **pathname completo** da URL. Com o
> padrão oficial, os padrões teriam de incluir `/api/v1/...`.

## Simulando eventos

```ts
const { client, gateway } = makeClient();
await client.login();

gateway.emitEvent("message.created", { message: fixtures.message({ content: "!ping" }) });
gateway.emitEvent("member.joined", { guildId: "g", member: fixtures.member() });
gateway.emitEvent("interaction.created", fixtures.commandInteraction());
```

`fixtures` traz payloads no formato real da documentação: `user`, `botUser`,
`member`, `channel`, `role`, `guild`, `message`, `commandInteraction`,
`componentInteraction`, `command`, `bot` — todos aceitam overrides parciais.

## Treinando falhas do gateway

```ts
// Queda com sessão retomável (o SDK faz resume e recupera os eventos):
gateway.emitEvent("message.created", { message: fixtures.message() }); // s=1
gateway.closeAll(4009, "session timeout");
gateway.emitEvent("message.deleted", { messageId: "x", channelId: "c", guildId: "g" }); // perdido
// → o cliente reconecta, reenvia o perdido e emite "resumed"

// O servidor pedindo reconexão (frame reconnect + fechamento 4007):
gateway.requestReconnect("gateway shutting down");

// Resume recusado → invalid_session → identify na mesma conexão:
const gateway2 = createMockGateway({ refuseResumeOnce: true });

// Conexão zumbi (sem heartbeat.ack) → o SDK fecha e retoma:
const gateway3 = createMockGateway({ suppressHeartbeatAck: true });

// Token errado → 4004, sem reconexão:
const gateway4 = createMockGateway({ token: "sqb_certo.segredo" });
```

Opções do mock: `heartbeatIntervalMs`, `token`, `ready` (userId/guilds),
`refuseResumeOnce`, `suppressHeartbeatAck`. Diagnóstico: `connectionCount`,
`lastSequence`, `totalEvents`, `sendEventWithSequence` (para treinar
deduplicação com `s` repetido).

## Asserções no REST

```ts
expect(rest.callLog).toHaveLength(2);
const last = rest.lastCall!;
expect(last.path).toBe("/api/v1/channels/c1/messages");
expect(last.body).toEqual({ content: "Pong!", nonce: expect.any(String) });

// Simulando respostas da API:
rest.get("/x", () => ({ status: 403, body: { statusCode: 403, code: "MISSING_PERMISSION", message: "..." } }));
rest.get("/x", () => ({ status: 429, body: { statusCode: 429, code: "RATE_LIMITED", message: "...", details: { bucket: "DEFAULT", retryAfter: 1 } } }));
rest.failWith(() => { throw new TypeError("fetch failed"); }); // falha de rede total
```

O mock aplica as validações de protocolo do REST: header `Authorization`
(corrija com `expectedToken`), envelope de erro idêntico ao oficial e
`x-request-id` em toda resposta. Rotas não registradas respondem
`404 NOT_FOUND` — se seu teste pedir uma rota que não existe no Squord,
o erro aparece na hora.

## Testando handlers isoladamente

```ts
import { CommandRegistry } from "@squord/sdk";

it("comando de texto responde com os args certos", async () => {
  const { client, gateway } = makeClient();
  const commands = new CommandRegistry(client, { prefix: "!" });
  const vistos: string[][] = [];
  commands.text({
    name: "eco",
    execute: (context) => { vistos.push(context.args); },
  });
  await client.login();

  gateway.emitEvent("message.created", {
    message: fixtures.message({ content: '!eco "arg com espaço" fim' }),
  });
  await vi.waitFor(() => expect(vistos).toEqual([["arg com espaço", "fim"]]));
});
```

Como o `CommandRegistry` escuta os mesmos eventos do cliente, os testes de
comandos, componentes e mensagens rodam pelo mesmo caminho de produção —
só a rede é falsa.

## O que os próprios testes do SDK cobrem

A suíte do pacote (90 testes) exercita exatamente esses fluxos e serve de
receita: `packages/sdk/test/unit` (builders, parser, cache, permissões,
intents, backoff, política de retries do REST, rate limits locais) e
`packages/sdk/test/integration` (login, eventos hidratados, respostas com
nonce, interações, comandos com cooldown, upload completo, resume,
invalid_session, zumbi, reconnect do servidor).
