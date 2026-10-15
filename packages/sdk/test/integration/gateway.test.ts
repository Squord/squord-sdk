import { describe, expect, it, vi } from "vitest";
import { Gateway } from "../../src/gateway/Gateway";
import { GatewayError } from "../../src/errors";
import { createMockGateway } from "../../src/testing/MockGateway";

const TOKEN = "sqb_1300000000000000010.SEGREDO";

describe("Gateway — ciclo de vida com o protocolo real", () => {
  it("hello → identify → ready", async () => {
    const server = createMockGateway({ token: TOKEN });
    const gateway = new Gateway({ token: TOKEN, ws: server.wsFactory });

    const ready = vi.fn();
    gateway.on("ready", ready);
    const result = await gateway.connect();

    expect(ready).toHaveBeenCalledTimes(1);
    expect(result.sessionId).toBeTruthy();
    expect(result.userId).toBe("1300000000000000010");
    expect(gateway.status).toBe("ready");
    expect(gateway.isReady).toBe(true);
    await gateway.destroy();
  });

  it("recusa token errado com 4004 e não reconecta", async () => {
    const server = createMockGateway({ token: TOKEN });
    const gateway = new Gateway({ token: "sqb_errado.outro", ws: server.wsFactory });

    const error = await gateway.connect().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatewayError);
    expect((error as GatewayError).closeCode).toBe(4004);
    expect(gateway.status).toBe("disconnected");
    // Nenhuma reconexão: continua desconectado.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(gateway.status).toBe("disconnected");
  });

  it("heartbeat recebe ack e mede latência", async () => {
    const server = createMockGateway({ token: TOKEN, heartbeatIntervalMs: 40 });
    const gateway = new Gateway({ token: TOKEN, ws: server.wsFactory });
    await gateway.connect();

    await vi.waitFor(() => expect(gateway.heartbeatLatencyMs).not.toBeNull(), { timeout: 2_000 });
    expect(gateway.heartbeatLatencyMs!).toBeGreaterThanOrEqual(0);
    await gateway.destroy();
  });

  it("conexão zumbi (sem ack) fecha e retoma com resume", async () => {
    const server = createMockGateway({
      token: TOKEN,
      heartbeatIntervalMs: 40,
      suppressHeartbeatAck: true,
    });
    const gateway = new Gateway({ token: TOKEN, ws: server.wsFactory, reconnectBaseMs: 10 });
    await gateway.connect();
    const firstSessionId = gateway.session;

    const resumed = vi.fn();
    gateway.on("resumed", resumed);
    // O watchdog fecha a conexão zumbi; o loop reconecta com resume.
    await vi.waitFor(() => expect(resumed).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    expect(gateway.session).toBe(firstSessionId);
    expect(gateway.status).toBe("ready");
    await gateway.destroy();
  });

  it("queda 4009 reconecta com resume e reenvia os eventos perdidos", async () => {
    const server = createMockGateway({ token: TOKEN, heartbeatIntervalMs: 500 });
    const gateway = new Gateway({ token: TOKEN, ws: server.wsFactory, reconnectBaseMs: 10 });
    await gateway.connect();

    // Eventos enquanto conectado.
    const receivedWhileOnline: string[] = [];
    gateway.on("event", (event) => receivedWhileOnline.push(event.type));
    server.emitEvent("message.created", { message: { id: "1" } });
    server.emitEvent("message.updated", { message: { id: "1" } });
    await vi.waitFor(() => expect(receivedWhileOnline).toHaveLength(2));
    const lastSequence = gateway.sequence!;

    // Queda (4009) e eventos durante a queda.
    server.closeAll(4009, "session timeout");
    server.emitEvent("message.deleted", { messageId: "1", channelId: "c", guildId: "g" });
    server.emitEvent("reaction.added", {
      messageId: "1",
      channelId: "c",
      guildId: "g",
      userId: "u",
      reaction: { emoji: "👍", count: 1, userIds: ["u"], me: false },
      customEmoji: null,
    });

    const resumed = vi.fn();
    gateway.on("resumed", resumed);
    const replayed: string[] = [];
    gateway.on("event", (event) => {
      if (event.s !== undefined && event.s > lastSequence) replayed.push(event.type);
    });

    await vi.waitFor(() => expect(resumed).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    expect(gateway.session).toBeTruthy();
    // Os dois eventos da queda chegaram na retomada, sem duplicar os antigos.
    expect(replayed).toEqual(["message.deleted", "reaction.added"]);
    expect(gateway.status).toBe("ready");
    await gateway.destroy();
  });

  it("invalid_session cai para identify na mesma conexão", async () => {
    const server = createMockGateway({
      token: TOKEN,
      heartbeatIntervalMs: 500,
      refuseResumeOnce: true,
    });
    const gateway = new Gateway({ token: TOKEN, ws: server.wsFactory, reconnectBaseMs: 10 });
    await gateway.connect();
    const ready = vi.fn();
    gateway.on("ready", ready);

    server.closeAll(4009, "session timeout"); // primeira queda
    // O resume é recusado uma vez → invalid_session → identify → ready novo.
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    expect(gateway.status).toBe("ready");
    await gateway.destroy();
  });

  it("evento duplicado (mesma sequência) é descartado", async () => {
    const server = createMockGateway({ token: TOKEN, heartbeatIntervalMs: 500 });
    const gateway = new Gateway({ token: TOKEN, ws: server.wsFactory });
    await gateway.connect();

    const events: Array<{ type: string; s?: number }> = [];
    gateway.on("event", (event) => events.push({ type: event.type, s: event.s }));

    server.emitEvent("message.created", { message: { id: "1" } });
    await vi.waitFor(() => expect(events).toHaveLength(1));
    const s = events[0]!.s!;

    // Replay com a mesma sequência (e uma anterior): descartado pelo cliente.
    server.sendEventWithSequence("message.created", { message: { id: "1" } }, s);
    server.sendEventWithSequence("message.created", { message: { id: "1" } }, s - 1);

    expect(gateway.eventsReceived).toBe(3); // contagem inclui duplicados
    expect(gateway.eventsDropped).toBe(2);
    expect(events).toHaveLength(1); // nenhum entregue duas vezes
    expect(gateway.sequence).toBe(s);
    await gateway.destroy();
  });

  it("reconnect pedido pelo servidor (4007) retoma a sessão", async () => {
    const server = createMockGateway({ token: TOKEN, heartbeatIntervalMs: 500 });
    const gateway = new Gateway({ token: TOKEN, ws: server.wsFactory, reconnectBaseMs: 10 });
    await gateway.connect();
    const sessionId = gateway.session;

    const resumed = vi.fn();
    gateway.on("resumed", resumed);
    server.requestReconnect("gateway shutting down");

    await vi.waitFor(() => expect(resumed).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    expect(gateway.session).toBe(sessionId);
    expect(gateway.status).toBe("ready");
    await gateway.destroy();
  });

  it("conta reconexões e eventos para diagnóstico", async () => {
    const server = createMockGateway({ token: TOKEN, heartbeatIntervalMs: 500 });
    const gateway = new Gateway({ token: TOKEN, ws: server.wsFactory, reconnectBaseMs: 10 });
    await gateway.connect();
    server.emitEvent("message.created", { message: { id: "1" } });
    expect(gateway.eventsReceived).toBe(1);
    expect(gateway.reconnectCount).toBe(0);

    server.closeAll(4009, "session timeout");
    await vi.waitFor(() => expect(gateway.reconnectCount).toBeGreaterThanOrEqual(1), {
      timeout: 3_000,
    });
    await gateway.destroy();
  });
});
