import { describe, expect, it, vi } from "vitest";
import { SquordClient } from "../../src/client/SquordClient";
import { createMockEnvironment, fixtures } from "../../src/testing/index";
import type { Message } from "../../src/index";

describe("createMockEnvironment — ambiente completo pronto para uso", () => {
  it("login, evento e resposta funcionam sem registrar rotas", async () => {
    const env = createMockEnvironment();
    const client = new SquordClient({
      token: "sqb_1300000000000000010.demo",
      ...env.options,
    });

    const ready = vi.fn();
    client.on("ready", ready);

    const received = new Promise<Message>((resolve) =>
      client.on("message.created", (message) => resolve(message)),
    );

    await client.login();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(client.user?.username).toBe("bot~meubot");

    env.gateway.emitEvent("message.created", {
      message: fixtures.message({ content: "!ping" }),
    });
    const message = await received;
    expect(message.content).toBe("!ping");

    // A rota padrão de envio ecoa a mensagem (com nonce e replyToId).
    const reply = await message.reply("Pong!");
    expect(reply.content).toBe("Pong!");
    expect(reply.replyToId).toBe(message.id);

    // E a chamada foi registrada no histórico do mock.
    const last = env.rest.lastCall!;
    expect(last.path).toBe("/channels/1300000000000000040/messages");
    expect((last.body as { replyToId?: string }).replyToId).toBe(message.id);

    await client.destroy();
  });

  it("CommandRegistry sincroniza contra a rota padrão de comandos", async () => {
    const env = createMockEnvironment();
    const client = new SquordClient({
      token: "sqb_1300000000000000010.demo",
      ...env.options,
    });

    const { CommandRegistry } = await import("../../src/commands/CommandRegistry");
    const commands = new CommandRegistry(client, { prefix: "!", syncOnLogin: false });
    commands.slash({ name: "ping", description: "ping", execute: () => {} });
    await client.login();
    await commands.sync();

    const put = env.rest.callLog.find(
      (call) => call.method === "PUT" && call.path.endsWith("/bots/@me/commands"),
    );
    expect(put?.body).toEqual([
      { name: "ping", description: "ping", options: [] },
    ]);

    await client.destroy();
  });

  it("honra o token configurado no identify", async () => {
    const env = createMockEnvironment({ token: "sqb_certo.segredo" });
    const client = new SquordClient({
      token: "sqb_errado.outro",
      ...env.options,
    });
    await expect(client.login()).rejects.toThrow(/token/i);
    expect(env.gateway.connectionCount).toBe(0);
  });
});
