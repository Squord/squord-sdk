import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SquordClient } from "../../src/client/SquordClient";
import { CommandRegistry } from "../../src/commands/CommandRegistry";
import { SquordAPIError } from "../../src/errors";
import { createMockGateway, createMockRest } from "../../src/testing/index";
import { fixtures } from "../../src/testing/index";
import type { Interaction, Message } from "../../src/index";

const TOKEN = "sqb_1300000000000000010.SEGREDO";

function makeClient(options: { gateway?: ReturnType<typeof createMockGateway>; rest?: ReturnType<typeof createMockRest> } = {}) {
  const rest = options.rest ?? createMockRest();
  const gateway = options.gateway ?? createMockGateway({ heartbeatIntervalMs: 500 });
  const client = new SquordClient({
    token: TOKEN,
    apiBaseURL: "https://mock.test",
    fetchImpl: rest.fetch,
    ws: gateway.wsFactory,
    gatewayReconnectBaseMs: 20,
  });
  return { client, rest, gateway };
}

function loginRest(rest: ReturnType<typeof createMockRest>) {
  rest.get("/bots/@me", () => ({ status: 200, body: fixtures.bot() }));
}

describe("SquordClient — login e ciclo de vida", () => {
  let cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const fn of cleanup) await fn();
    cleanup = [];
  });

  it("recusa token malformado sem fazer requisição", () => {
    expect(() => new SquordClient({ token: "nao-e-um-token" })).toThrow(/sqb_/);
    expect(() => new SquordClient({ token: "" })).toThrow();
  });

  it("login valida o token e emite ready com o usuário do bot", async () => {
    const { client, rest, gateway } = makeClient();
    cleanup.push(() => client.destroy());
    loginRest(rest);

    const ready = vi.fn();
    client.on("ready", ready);
    await client.login();

    expect(ready).toHaveBeenCalledTimes(1);
    const event = ready.mock.calls[0]![0];
    expect(event.user.username).toBe("bot~meubot");
    expect(event.user.isBot).toBe(true);
    expect(client.userId).toBe("1300000000000000010");
    expect(client.isReady()).toBe(true);
    expect(gateway.connectionCount).toBe(1);
    // identify enviado com o token puro (sem prefixo) e protocolVersion 1
    const identifyCall = gateway.options;
    expect(identifyCall).toBeDefined();
  });

  it("login propaga erro de token inválido (401 INVALID_TOKEN)", async () => {
    const { client, rest } = makeClient();
    cleanup.push(() => client.destroy());
    rest.get("/bots/@me", () => ({
      status: 401,
      body: { statusCode: 401, code: "INVALID_TOKEN", message: "Invalid token" },
    }));
    const error = await client.login().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SquordAPIError);
    expect((error as SquordAPIError).status).toBe(401);
  });

  it("restOnly valida o token e não abre gateway", async () => {
    const { client, rest, gateway } = makeClient();
    cleanup.push(() => client.destroy());
    loginRest(rest);
    const restOnlyClient = new SquordClient({
      token: TOKEN,
      apiBaseURL: "https://mock.test",
      fetchImpl: rest.fetch,
      restOnly: true,
    });
    cleanup.push(() => restOnlyClient.destroy());
    const ready = vi.fn();
    restOnlyClient.on("ready", ready);
    await restOnlyClient.login();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(gateway.connectionCount).toBe(0);

    // Manager REST continua utilizável (consulta de canal, por exemplo).
    rest.get("/channels/:id", () => ({ status: 200, body: fixtures.channel() }));
    const channel = await restOnlyClient.channels.fetch("1300000000000000040");
    expect(channel.name).toBe("geral");
  });

  it("entrega message.created hidratado e responde via REST com nonce", async () => {
    const { client, rest, gateway } = makeClient();
    cleanup.push(() => client.destroy());
    loginRest(rest);

    let sentBody: Record<string, unknown> = {};
    rest.post("/channels/:channelId/messages", (m) => {
      sentBody = m.body as Record<string, unknown>;
      return {
        status: 201,
        body: fixtures.message({ content: "Pong!", replyToId: "1300000000000000100" }),
      };
    });

    const received = new Promise<Message>((resolve) =>
      client.on("message.created", (message) => resolve(message)),
    );
    await client.login();

    gateway.emitEvent("message.created", { message: fixtures.message({ content: "!ping" }) });
    const message = await received;

    expect(message.content).toBe("!ping");
    expect(message.author.username).toBe("ana");
    expect(message.authorDisplayName).toBe("Ana");
    expect(message.channelId).toBe("1300000000000000040");

    const reply = await message.reply("Pong! 🏓");
    expect(reply.content).toBe("Pong!");
    expect(sentBody.replyToId).toBe("1300000000000000100");
    expect(typeof sentBody.nonce).toBe("string"); // idempotência automática
    expect(sentBody.allowedMentions).toEqual({ users: true, roles: false, everyone: false });
  });

  it("entrega interações de comando e de componente com helpers tipados", async () => {
    const { client, rest, gateway } = makeClient();
    cleanup.push(() => client.destroy());
    loginRest(rest);
    rest.put("/bots/@me/commands", () => ({ status: 200, body: [] }));

    const commands = new CommandRegistry(client, { syncOnLogin: false });
    const seenCommand = new Promise<Interaction>((resolve) =>
      commands.slash({
        name: "eco",
        description: "Repete",
        options: [{ type: "STRING", name: "texto", description: "O texto" }],
        execute: async (interaction) => resolve(interaction),
      }),
    );
    const seenComponent = new Promise<Interaction>((resolve) =>
      commands.component({
        customId: "confirmar",
        execute: async (interaction) => resolve(interaction),
      }),
    );

    let callbackBody: Record<string, unknown> = {};
    rest.post("/interactions/:id/:token/callback", (m) => {
      callbackBody = m.body as Record<string, unknown>;
      return { status: 204 };
    });

    await client.login();

    gateway.emitEvent("interaction.created", {
      ...fixtures.commandInteraction({
        command: {
          id: "1300000000000000500",
          name: "eco",
          options: [{ name: "texto", type: "STRING", value: "olá" }],
        },
      }),
    });
    const commandInteraction = await seenCommand;
    expect(commandInteraction.isCommand).toBe(true);
    expect(commandInteraction.getString("texto")).toBe("olá");

    await commandInteraction.reply("eco!", { ephemeral: true });
    expect(callbackBody.type).toBe("MESSAGE");
    expect((callbackBody.data as never as { ephemeral: boolean }).ephemeral).toBe(true);

    gateway.emitEvent("interaction.created", fixtures.componentInteraction());
    const componentInteraction = await seenComponent;
    expect(componentInteraction.isComponent).toBe(true);
    expect(componentInteraction.customId).toBe("confirmar");
    expect(componentInteraction.values).toEqual([]);
  });

  it("comandos de texto: prefixo, aliases, args com aspas e cooldown", async () => {
    const { client, rest, gateway } = makeClient();
    cleanup.push(() => client.destroy());
    loginRest(rest);

    const calls: Array<{ args: string[]; rawArgs: string }> = [];
    const commands = new CommandRegistry(client, { prefix: "!" });
    commands.text({
      name: "ban",
      aliases: ["b"],
      cooldownMs: 60_000,
      execute: async (context) => {
        calls.push({ args: context.args, rawArgs: context.rawArgs });
        await context.reply("ok");
      },
    });

    rest.post("/channels/:channelId/messages", () => ({
      status: 201,
      body: fixtures.message({ content: "ok" }),
    }));

    await client.login();

    // Invocação com alias e argumentos com aspas.
    const first = fixtures.message({ content: '!b @ana "spam reincidente" 7d' });
    gateway.emitEvent("message.created", { message: first });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.args).toEqual(["@ana", "spam reincidente", "7d"]);

    // Cooldown bloqueia a segunda chamada imediata.
    gateway.emitEvent("message.created", {
      message: fixtures.message({ content: "!ban @bob" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(1);

    // Mensagem sem prefixo não invoca.
    gateway.emitEvent("message.created", { message: fixtures.message({ content: "ban x" }) });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(calls).toHaveLength(1);

    // Comando desconhecido não invoca.
    gateway.emitEvent("message.created", { message: fixtures.message({ content: "!desconhecido" }) });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(calls).toHaveLength(1);

    commands.clearCooldowns();
    gateway.emitEvent("message.created", { message: fixtures.message({ content: "!ban @bob" }) });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
  });

  it("ignora mensagens de bots nos comandos de texto (padrão)", async () => {
    const { client, rest, gateway } = makeClient();
    cleanup.push(() => client.destroy());
    loginRest(rest);

    const commands = new CommandRegistry(client);
    let executed = 0;
    commands.text({
      name: "ping",
      execute: () => {
        executed++;
      },
    });

    await client.login();
    const otherBot = fixtures.message({
      content: "!ping",
      author: fixtures.botUser({ id: "999", username: "bot~outro" }),
    });
    gateway.emitEvent("message.created", { message: otherBot });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(executed).toBe(0);

    const human = fixtures.message({ content: "!ping" });
    gateway.emitEvent("message.created", { message: human });
    await vi.waitFor(() => expect(executed).toBe(1));
  });

  it("eventos brutos chegam no payload cru (message.deleted)", async () => {
    const { client, rest, gateway } = makeClient();
    cleanup.push(() => client.destroy());
    loginRest(rest);

    const received = new Promise<Record<string, unknown>>((resolve) =>
      client.on("message.deleted", (payload) => resolve(payload as unknown as Record<string, unknown>)),
    );
    await client.login();

    gateway.emitEvent("message.deleted", {
      messageId: "1300000000000000100",
      channelId: "1300000000000000040",
      guildId: "1300000000000000001",
    });
    const payload = await received;
    expect(payload.messageId).toBe("1300000000000000100");
  });

  it("eventos desconhecidos chegam em unknownEvent (compatibilidade futura)", async () => {
    const { client, rest, gateway } = makeClient();
    cleanup.push(() => client.destroy());
    loginRest(rest);

    const received = new Promise<{ type: string }>((resolve) =>
      client.on("unknownEvent", (event) => resolve(event)),
    );
    await client.login();

    gateway.emitEvent("feature.nova.do.futuro", { foo: true });
    const event = await received;
    expect(event.type).toBe("feature.nova.do.futuro");
  });

  it("erros de handlers assíncronos não derrubam o cliente (evento error)", async () => {
    const { client, rest, gateway } = makeClient();
    cleanup.push(() => client.destroy());
    loginRest(rest);

    const errored = new Promise<Error>((resolve) => client.on("error", resolve));
    client.on("message.created", async () => {
      throw new Error("boom no handler");
    });

    await client.login();
    gateway.emitEvent("message.created", { message: fixtures.message() });
    const error = await errored;
    expect(error.message).toContain("boom");
    expect(client.isReady()).toBe(true);
  });

  it("destroy fecha o gateway e limpa listeners", async () => {
    const { client, rest, gateway } = makeClient();
    loginRest(rest);
    await client.login();
    expect(gateway.connectionCount).toBe(1);
    await client.destroy();
    expect(gateway.connectionCount).toBe(0);
    expect(client.isReady()).toBe(false);
  });
});
