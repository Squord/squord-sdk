/**
 * MockGateway: um gateway do Squord simulado em memória.
 *
 * Fala o protocolo real — `hello`, `identify`, `ready`, `heartbeat`,
 * `heartbeat.ack`, `resume`, `resumed`, `invalid_session`, `reconnect` —
 * para testar o ciclo de vida do cliente (login, reconexão, resume,
 * deduplicação) sem rede. Passe `wsFactory` em `new SquordClient({ ws })`.
 *
 * Os eventos emitidos são guardados num buffer global com sequência `s`
 * crescente, como o histórico do gateway real (até 500 eventos), e o
 * `resume` reenvia tudo que veio depois do `lastSequence` informado.
 *
 * ```ts
 * const gateway = createMockGateway();
 * const client = new SquordClient({ token: "sqb_1.segredo", ws: gateway.wsFactory });
 * await client.login();
 * gateway.emitEvent("message.created", { message: fixtures.message() });
 * ```
 */

export interface MockGatewayOptions {
  /** Intervalo de heartbeat anunciado no hello. Padrão: 30000. */
  heartbeatIntervalMs?: number;
  /** Token aceito no identify. Aceita qualquer token por padrão. */
  token?: string;
  /** Payload do ready (userId e guilds). */
  ready?: { userId: string; guilds?: Array<{ id: string; name: string; iconUrl: string | null }> };
  /** `true` para recusar o próximo resume (treinar o fluxo `invalid_session`). */
  refuseResumeOnce?: boolean;
  /** `true` para nunca responder heartbeat.ack (treinar detecção de zumbi). */
  suppressHeartbeatAck?: boolean;
}

interface StoredEvent {
  type: string;
  d: unknown;
  s: number;
}

/** WebSocket simulado (lado cliente). */
class MockWebSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = 0; // CONNECTING
  private listeners = new Map<string, Array<(event: Record<string, unknown>) => void>>();

  constructor(readonly server: MockGatewayServer) {
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.dispatch("open", {});
      this.server.handleClientOpen(this);
    });
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener as (event: Record<string, unknown>) => void);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: (event: never) => void): void {
    const list = this.listeners.get(type) ?? [];
    const index = list.indexOf(listener as (event: Record<string, unknown>) => void);
    if (index >= 0) list.splice(index, 1);
  }

  dispatch(type: string, event: Record<string, unknown>): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }

  /** Frame do cliente: entrega ao servidor. */
  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) return;
    if (Buffer.byteLength(data, "utf8") > 65_536) {
      this.serverClose(1009, "frame too large");
      return;
    }
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(data) as Record<string, unknown>;
    } catch {
      this.serverClose(4002, "decode error");
      return;
    }
    this.server.handleClientFrame(this, frame);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.server.handleClientClose(this, code, reason);
    this.dispatch("close", { code, reason, wasClean: true });
  }

  /** Servidor fecha a conexão. */
  serverClose(code: number, reason: string): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.server.handleClientClose(this, code, reason, true);
    this.dispatch("close", { code, reason, wasClean: true });
  }

  /** Servidor envia frame. */
  receive(frame: Record<string, unknown>): void {
    this.dispatch("message", { data: JSON.stringify(frame) });
  }
}

interface ClientSession {
  authenticated: boolean;
  sessionId: string;
}

interface SocketState {
  session?: ClientSession;
}

export class MockGatewayServer {
  readonly options: MockGatewayOptions;
  private sockets = new Set<MockWebSocket>();
  private eventBuffer: StoredEvent[] = [];
  private globalSequence = 0;
  private refuseResumePending: boolean;
  private knownSessionIds = new Set<string>();

  constructor(options: MockGatewayOptions = {}) {
    this.options = options;
    this.refuseResumePending = options.refuseResumeOnce ?? false;
  }

  /** Fábrica de WebSocket para passar ao cliente. */
  readonly wsFactory = (url: string): MockWebSocket => {
    const pathname = (() => {
      try {
        return new URL(url.replace(/^wss/, "https")).pathname;
      } catch {
        return url;
      }
    })();
    if (!/\/gateway$/.test(pathname)) {
      throw new Error(`MockGateway: caminho inválido ${url} (use wss://.../gateway)`);
    }
    return new MockWebSocket(this);
  };

  /** Conexões abertas no momento. */
  get connectionCount(): number {
    return this.sockets.size;
  }

  /** Última sequência emitida. */
  get lastSequence(): number {
    return this.eventBuffer.length > 0 ? this.eventBuffer[this.eventBuffer.length - 1]!.s : 0;
  }

  /** Total de eventos já emitidos. */
  get totalEvents(): number {
    return this.globalSequence;
  }

  /**
   * Emite um evento durável: guarda no buffer (sequência crescente) e
   * entrega às conexões autenticadas.
   */
  emitEvent(type: string, d: unknown): void {
    const s = ++this.globalSequence;
    this.eventBuffer.push({ type, d, s });
    if (this.eventBuffer.length > 500) this.eventBuffer.shift();
    for (const socket of this.sockets) {
      const state = socket as unknown as SocketState;
      if (state.session?.authenticated) {
        socket.receive({ op: "event", type, d, s, timestamp: Date.now() });
      }
    }
  }

  /** Envia um frame cru às conexões autenticadas (sem `s`). */
  sendFrame(frame: Record<string, unknown>): void {
    for (const socket of this.sockets) {
      const state = socket as unknown as SocketState;
      if (state.session?.authenticated) socket.receive({ ...frame, timestamp: Date.now() });
    }
  }

  /**
   * Envia um evento com sequência arbitrária (para treinar a deduplicação
   * do cliente: `s` repetido ou antigo deve ser descartado).
   */
  sendEventWithSequence(type: string, d: unknown, s: number): void {
    for (const socket of this.sockets) {
      const state = socket as unknown as SocketState;
      if (state.session?.authenticated) {
        socket.receive({ op: "event", type, d, s, timestamp: Date.now() });
      }
    }
  }

  /** Fecha as conexões com um código (ex.: 4009 para treinar resume). */
  closeAll(code: number, reason: string): void {
    for (const socket of [...this.sockets]) {
      socket.serverClose(code, reason);
    }
  }

  /** Pede reconexão (frame `reconnect` + fechamento 4007, como o real). */
  requestReconnect(reason = "gateway shutting down"): void {
    for (const socket of [...this.sockets]) {
      socket.receive({
        op: "reconnect",
        d: { reason, resumable: true },
        timestamp: Date.now(),
      });
    }
    this.closeAll(4007, reason);
  }

  /** Descarta o histórico de eventos (o próximo resume falha com `invalid_session`). */
  expireHistory(): void {
    this.eventBuffer = [];
  }

  /** Reinicia o estado do mock. */
  reset(): void {
    this.sockets.clear();
    this.eventBuffer = [];
    this.globalSequence = 0;
    this.knownSessionIds.clear();
    this.refuseResumePending = this.options.refuseResumeOnce ?? false;
  }

  // ------------------------------------------------------------------
  // "Servidor": handlers chamados pelo MockWebSocket
  // ------------------------------------------------------------------

  handleClientOpen(socket: MockWebSocket): void {
    this.sockets.add(socket);
    socket.receive({
      op: "hello",
      d: {
        heartbeatIntervalMs: this.options.heartbeatIntervalMs ?? 30_000,
        sessionId: `mock-${Math.random().toString(36).slice(2, 12)}`,
        protocolVersion: 1,
      },
      timestamp: Date.now(),
    });
  }

  handleClientFrame(socket: MockWebSocket, frame: Record<string, unknown>): void {
    const op = frame.op as string;
    const d = (frame.d ?? {}) as Record<string, unknown>;
    const state = socket as unknown as SocketState;

    switch (op) {
      case "identify": {
        if (state.session?.authenticated) {
          socket.serverClose(4005, "already authenticated");
          return;
        }
        if (this.options.token && d.token !== this.options.token) {
          socket.serverClose(4004, "invalid token");
          return;
        }
        const sessionId = `mock-${Math.random().toString(36).slice(2, 12)}`;
        this.knownSessionIds.add(sessionId);
        state.session = { authenticated: true, sessionId };
        socket.receive({
          op: "ready",
          d: {
            sessionId,
            userId: this.options.ready?.userId ?? "1300000000000000010",
            guilds: this.options.ready?.guilds ?? [],
            resumeGatewayUrl: "wss://gateway.squord.com.br/gateway",
          },
          timestamp: Date.now(),
        });
        return;
      }
      case "resume": {
        const sessionId = d.sessionId as string;
        const lastSequence = (d.lastSequence as number) ?? 0;
        if (this.refuseResumePending) {
          this.refuseResumePending = false;
          socket.receive({
            op: "invalid_session",
            d: { resumable: false },
            timestamp: Date.now(),
          });
          return;
        }
        if (!this.knownSessionIds.has(sessionId)) {
          socket.receive({
            op: "invalid_session",
            d: { resumable: false },
            timestamp: Date.now(),
          });
          return;
        }
        state.session = { authenticated: true, sessionId };
        const replay = this.eventBuffer.filter((event) => event.s > lastSequence);
        for (const event of replay) {
          socket.receive({
            op: "event",
            type: event.type,
            d: event.d,
            s: event.s,
            timestamp: Date.now(),
          });
        }
        const sequence = replay.length > 0 ? replay[replay.length - 1]!.s : lastSequence;
        socket.receive({
          op: "resumed",
          d: { sessionId, replayed: replay.length, sequence },
          timestamp: Date.now(),
        });
        return;
      }
      case "heartbeat": {
        if (!state.session?.authenticated) {
          socket.serverClose(4003, "not authenticated");
          return;
        }
        if (this.options.suppressHeartbeatAck) return;
        socket.receive({
          op: "heartbeat.ack",
          d: { sequence: this.lastSequence },
          timestamp: Date.now(),
        });
        return;
      }
      case "presence.update":
      case "subscribe":
      case "unsubscribe":
      case "typing.start":
      case "voice.state.update":
        return; // aceitos e ignorados, como o real
      default:
        socket.serverClose(4001, "unknown opcode");
    }
  }

  handleClientClose(socket: MockWebSocket, code: number, reason: string, byServer = false): void {
    this.sockets.delete(socket);
    (socket as unknown as SocketState).session = undefined;
    void code;
    void reason;
    void byServer;
  }
}

/** Cria o mock do gateway. Use `ws: gateway.wsFactory` no `SquordClient`. */
export function createMockGateway(options: MockGatewayOptions = {}): MockGatewayServer {
  return new MockGatewayServer(options);
}
