/**
 * Gateway do Squord: WebSocket que entrega eventos em tempo real.
 *
 * Ciclo de vida (https://docs.squord.com.br/gateway/visao-geral):
 * 1. Abre a conexão; o servidor envia `hello` (intervalo de heartbeat).
 * 2. O bot envia `identify` com o token em até 15 segundos.
 * 3. O servidor responde `ready`; os eventos passam a chegar.
 * 4. O bot envia `heartbeat` a cada `heartbeatIntervalMs`; o servidor responde
 *    `heartbeat.ack`. Sem ack dentro de um intervalo, a conexão é considerada
 *    zumbi e é refeita com `resume`.
 * 5. Após uma queda, o bot reconecta e envia `resume` com a última sequência;
 *    o servidor reenvia os eventos perdidos e depois envia `resumed`. Se não
 *    puder retomar, responde `invalid_session` na mesma conexão, e o bot faz
 *    `identify` de novo.
 *
 * Códigos de fechamento seguem a tabela oficial: 4004/4013/4014 não são
 * retomáveis; 4001/4002/4005/4012 são erros do bot; os demais reconectam com
 * backoff exponencial e jitter, tentando `resume`.
 */

import type { Logger } from "../logger";
import { noopLogger } from "../logger";
import { GatewayError } from "../errors";
import { TypedEmitter } from "../utils/TypedEmitter";
import { backoffDelay, sleep } from "../utils/backoff";
import { attachWebSocket, globalWebSocketFactory } from "./WebSocketLike";
import type { WebSocketFactory, WebSocketLike } from "./WebSocketLike";
import { newRequestId } from "../utils/misc";
import { GatewayCloseCodes } from "../types/gateway";
import type {
  ClientOpcode,
  GatewayError as GatewayErrorFrame,
  GatewayEventFrame,
  GatewayHello,
  GatewayInvalidSession,
  GatewayPresenceUpdate,
  GatewayReady,
  GatewayReconnect,
  GatewayResumed,
  ServerFrame,
} from "../types/gateway";

export type GatewayStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "reconnecting"
  | "disconnected"
  | "destroyed";

export interface GatewayEvents extends Record<string, unknown> {
  ready: GatewayReady;
  resumed: GatewayResumed;
  reconnecting: { attempt: number; delayMs: number; closeCode: number | null; reason: string };
  disconnect: { code: number | null; reason: string; fatal: boolean };
  invalidSession: GatewayInvalidSession;
  serverError: GatewayErrorFrame;
  raw: ServerFrame;
  event: { type: string; d: unknown; s?: number; timestamp: number };
  error: Error;
  statusChange: GatewayStatus;
}

export interface GatewayOptions {
  /** URL do gateway. Padrão: `wss://gateway.squord.com.br/gateway`. */
  url?: string;
  /** Token do bot (`sqb_...`), sem prefixo. */
  token: string;
  /** Fábrica de WebSocket (injetável para testes). Padrão: `WebSocket` global. */
  ws?: WebSocketFactory;
  /** Tempo máximo esperando `ready`/`resumed` após o `identify`/`resume`. Padrão: 20000 ms. */
  handshakeTimeoutMs?: number;
  /** `false` para não reconectar automaticamente. */
  autoReconnect?: boolean;
  /** Base do backoff de reconexão, em ms. Padrão: 1000 (dobra até 60000). */
  reconnectBaseMs?: number;
  /** Logger. */
  logger?: Logger;
}

const DEFAULT_URL = "wss://gateway.squord.com.br/gateway";
const PROTOCOL_VERSION = 1;

/** Códigos que encerram sem tentar reconectar com o mesmo token. */
const FATAL_CLOSE_CODES = new Set<number>([
  GatewayCloseCodes.AuthenticationFailed, // 4004
  GatewayCloseCodes.AccountSuspended, // 4013
  GatewayCloseCodes.BotSessionLimit, // 4014
]);

/** Códigos que indicam erro do próprio bot: corrigir antes de reconectar. */
const BOT_BUG_CLOSE_CODES = new Set<number>([
  GatewayCloseCodes.UnknownOpcode, // 4001
  GatewayCloseCodes.DecodeError, // 4002
  GatewayCloseCodes.AlreadyAuthenticated, // 4005
  GatewayCloseCodes.InvalidProtocolVersion, // 4012
]);

interface HandshakeWaiters {
  resolve: (ready: GatewayReady) => void;
  reject: (error: Error) => void;
}

export class Gateway extends TypedEmitter<GatewayEvents> {
  readonly url: string;
  private readonly token: string;
  private readonly wsFactory: WebSocketFactory;
  private readonly handshakeTimeoutMs: number;
  private readonly autoReconnect: boolean;
  private readonly reconnectBaseMs: number;
  private readonly logger: Logger;

  private ws: WebSocketLike | null = null;
  private statusValue: GatewayStatus = "idle";
  private reconnectAttempts = 0;
  private connectLoop: Promise<GatewayReady> | null = null;

  // Estado de sessão (para resume)
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private lastSequence: number | null = null;
  private established = false;

  // Handshake em curso
  private handshake: HandshakeWaiters | null = null;
  private handshakeTimer: NodeJS.Timeout | null = null;

  // Heartbeat
  private heartbeatIntervalMs: number | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private awaitingAck = false;
  private lastHeartbeatSentAt: number | null = null;

  private destroyed = false;
  private closingByClient = false;
  private reconnectRequested = false;

  /** Latência do gateway: último heartbeat até o ack, em ms. */
  heartbeatLatencyMs: number | null = null;
  /** Quantas reconexões ocorreram desde a criação. */
  reconnectCount = 0;
  /** Quantos frames de evento foram recebidos (incluindo duplicados). */
  eventsReceived = 0;
  /** Quantos eventos foram descartados como duplicados. */
  eventsDropped = 0;

  get sequence(): number | null {
    return this.lastSequence;
  }
  get session(): string | null {
    return this.sessionId;
  }
  get status(): GatewayStatus {
    return this.statusValue;
  }
  get isReady(): boolean {
    return this.statusValue === "ready";
  }

  constructor(options: GatewayOptions) {
    super();
    this.url = options.url ?? DEFAULT_URL;
    this.token = options.token;
    this.wsFactory = options.ws ?? globalWebSocketFactory;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 20_000;
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1_000;
    this.logger = (options.logger ?? noopLogger).child("gateway");
  }

  // ------------------------------------------------------------------
  // API pública
  // ------------------------------------------------------------------

  /**
   * Conecta ao gateway e resolve quando a sessão está pronta
   * (`ready` ou `resumed`). Em quedas transitórias, segue tentando com
   * backoff — a promise só é rejeitada em erros não retomáveis
   * (token inválido/revogado, conta suspensa, sessões demais, erro de
   * protocolo) ou se o gateway for destruído.
   */
  async connect(): Promise<GatewayReady> {
    if (this.destroyed) throw new GatewayError(null, null, "O gateway foi destruído");
    if (this.isReady) {
      throw new GatewayError(null, null, "O gateway já está conectado");
    }
    if (this.connectLoop) return this.connectLoop;

    this.closingByClient = false;
    this.connectLoop = this.runConnectLoop().finally(() => {
      this.connectLoop = null;
    });
    return this.connectLoop;
  }

  /** Envia `presence.update`. O status escolhido vale também nas próximas conexões. */
  setPresence(presence: GatewayPresenceUpdate): void {
    if (!this.ws) {
      this.emit("error", new GatewayError(null, null, "Sem conexão para atualizar a presença"));
      return;
    }
    this.sendFrame("presence.update", presence);
  }

  /** Fecha a conexão, encerra as reconexões e descarta o estado de sessão. */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.closingByClient = true;
    this.stopHeartbeat();
    this.failHandshake(new GatewayError(null, null, "Gateway destruído"));
    this.setStatus("destroyed");
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= 1) {
      try {
        ws.close(1000, "client shutdown");
      } catch {
        // ignora
      }
    }
  }

  /** Descarta o estado de sessão: a próxima conexão fará `identify` limpo. */
  invalidateSession(): void {
    this.sessionId = null;
    this.resumeUrl = null;
    this.lastSequence = null;
  }

  /** Força uma reconexão imediata (que tentará `resume`). */
  reconnectNow(): void {
    if (!this.ws) return;
    this.reconnectRequested = true;
    try {
      this.ws.close(4000, "manual reconnect");
    } catch {
      // ignora
    }
  }

  // ------------------------------------------------------------------
  // Loop de conexão
  // ------------------------------------------------------------------

  private async runConnectLoop(): Promise<GatewayReady> {
    this.setStatus(this.sessionId ? "reconnecting" : "connecting");
    for (;;) {
      try {
        const ready = await this.openSocketOnce(this.resumeUrl ?? this.url);
        this.reconnectAttempts = 0;
        return ready;
      } catch (err) {
        if (this.destroyed) throw err;
        const gatewayErr = err as GatewayError;
        const code = gatewayErr?.closeCode ?? null;
        if (
          code !== null &&
          (FATAL_CLOSE_CODES.has(code) || BOT_BUG_CLOSE_CODES.has(code))
        ) {
          this.setStatus("disconnected");
          this.emit("error", gatewayErr);
          throw gatewayErr;
        }

        if (!this.autoReconnect) {
          this.setStatus("disconnected");
          throw err;
        }

        const attempt = this.reconnectAttempts++;
        const delayMs = backoffDelay(attempt, { baseMs: this.reconnectBaseMs });
        this.reconnectCount++;
        this.setStatus("reconnecting");
        this.emit("reconnecting", {
          attempt,
          delayMs,
          closeCode: code,
          reason: gatewayErr?.reason ?? String((err as Error)?.message ?? err),
        });
        this.logger.info("reconectando", { attempt, delayMs });
        await sleep(delayMs);
        this.setStatus(this.sessionId ? "reconnecting" : "connecting");
      }
    }
  }

  /** Abre um socket e resolve no `ready`/`resumed` (handshake completo). */
  private openSocketOnce(url: string): Promise<GatewayReady> {
    return new Promise<GatewayReady>((resolve, reject) => {
      let socket: unknown;
      try {
        socket = this.wsFactory(url);
      } catch (err) {
        reject(
          new GatewayError(
            null,
            null,
            `Não foi possível criar o WebSocket para ${url}: ${String((err as Error)?.message ?? err)}`,
          ),
        );
        return;
      }

      this.handshake = { resolve, reject };
      this.established = false;

      this.handshakeTimer = setTimeout(() => {
        this.failHandshake(
          new GatewayError(
            null,
            null,
            `Handshake do gateway excedeu ${this.handshakeTimeoutMs} ms sem ready/resumed`,
          ),
        );
      }, this.handshakeTimeoutMs);

      this.ws = attachWebSocket(socket, {
        open: () => this.logger.debug("socket aberto, aguardando hello"),
        message: (data) => this.handleMessage(data),
        close: (event) => this.handleClose(event.code, event.reason),
        error: (err) =>
          this.logger.debug("erro de socket", {
            err: String((err as Error)?.message ?? err),
          }),
      });
    });
  }

  private resolveHandshake(ready: GatewayReady): void {
    const handshake = this.handshake;
    if (!handshake) return;
    this.clearHandshakeTimer();
    this.handshake = null;
    handshake.resolve(ready);
  }

  private failHandshake(error: Error): void {
    const handshake = this.handshake;
    this.clearHandshakeTimer();
    if (!handshake) return;
    this.handshake = null;
    handshake.reject(error);
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  // ------------------------------------------------------------------
  // Entrada de frames
  // ------------------------------------------------------------------

  private handleMessage(data: string): void {
    let frame: ServerFrame;
    try {
      frame = JSON.parse(data) as ServerFrame;
    } catch {
      this.logger.warn("frame não-JSON recebido; ignorado");
      return;
    }

    this.emit("raw", frame);

    switch (frame.op) {
      case "hello":
        this.handleHello(frame.d as GatewayHello);
        break;
      case "ready":
        this.handleReady(frame.d as GatewayReady);
        break;
      case "resumed":
        this.handleResumed(frame.d as GatewayResumed);
        break;
      case "heartbeat.ack":
        this.handleHeartbeatAck(frame.d as { sequence: number });
        break;
      case "invalid_session":
        this.handleInvalidSession(frame.d as GatewayInvalidSession);
        break;
      case "reconnect":
        this.handleReconnectRequest(frame.d as GatewayReconnect);
        break;
      case "error":
        this.handleServerError(frame.d as GatewayErrorFrame);
        break;
      case "event":
        this.handleEvent(frame as GatewayEventFrame);
        break;
      default:
        this.logger.debug("opcode desconhecido", {
          op: (frame as { op?: string }).op,
        });
    }
  }

  private handleHello(hello: GatewayHello): void {
    this.heartbeatIntervalMs = hello.heartbeatIntervalMs;
    this.logger.debug("hello", { heartbeatIntervalMs: hello.heartbeatIntervalMs });

    if (this.sessionId !== null) {
      // Temos sessão: retomar. `lastSequence` 0 é válido quando nenhum
      // evento foi visto ainda; se o servidor não puder retomar, ele
      // responde invalid_session e o identify acontece na mesma conexão.
      this.sendFrame("resume", {
        token: this.token,
        sessionId: this.sessionId,
        lastSequence: this.lastSequence ?? 0,
      });
    } else {
      this.sendFrame("identify", {
        token: this.token,
        protocolVersion: PROTOCOL_VERSION,
      });
    }
    this.startHeartbeat();
  }

  private handleReady(ready: GatewayReady): void {
    this.sessionId = ready.sessionId;
    this.resumeUrl = ready.resumeGatewayUrl || this.url;
    this.lastSequence = null;
    this.established = true;
    this.setStatus("ready");
    this.logger.info("sessão pronta", {
      sessionId: ready.sessionId,
      guilds: ready.guilds.length,
    });
    this.emit("ready", ready);
    this.resolveHandshake(ready);
  }

  private handleResumed(resumed: GatewayResumed): void {
    this.sessionId = resumed.sessionId;
    this.established = true;
    this.setStatus("ready");
    this.logger.info("sessão retomada", {
      replayed: resumed.replayed,
      sequence: resumed.sequence,
    });
    this.emit("resumed", resumed);
    this.resolveHandshake({
      sessionId: resumed.sessionId,
      userId: "",
      guilds: [],
      resumeGatewayUrl: this.resumeUrl ?? this.url,
    });
  }

  private handleHeartbeatAck(ack: { sequence: number }): void {
    this.awaitingAck = false;
    if (this.lastHeartbeatSentAt !== null) {
      this.heartbeatLatencyMs = Date.now() - this.lastHeartbeatSentAt;
    }
    this.logger.debug("heartbeat.ack", { sequence: ack.sequence });
  }

  private handleInvalidSession(payload: GatewayInvalidSession): void {
    this.logger.warn("resume recusado; fazendo identify", { payload });
    this.emit("invalidSession", payload);
    this.invalidateSession();
    // A conexão continua aberta: identify imediato (o prazo de 15 s reinicia).
    this.sendFrame("identify", {
      token: this.token,
      protocolVersion: PROTOCOL_VERSION,
    });
  }

  private handleReconnectRequest(payload: GatewayReconnect): void {
    this.logger.warn("servidor pediu reconexão", { payload });
    // O fechamento 4007 chega em seguida e dispara a reconexão com resume.
    const watchdog = setTimeout(() => {
      if (!this.destroyed && this.ws) {
        this.logger.warn("watchdog: fechando para reconectar");
        try {
          this.ws.close(4000, "reconnect watchdog");
        } catch {
          // ignora
        }
      }
    }, 5_000);
    watchdog.unref?.();
  }

  private handleServerError(errorFrame: GatewayErrorFrame): void {
    // Frame `error` não fecha a conexão.
    this.emit("serverError", errorFrame);
    this.logger.warn("frame error do servidor", { frame: errorFrame as unknown as Record<string, unknown> });
  }

  private handleEvent(frame: GatewayEventFrame): void {
    this.eventsReceived++;
    if (typeof frame.s === "number") {
      if (this.lastSequence !== null && frame.s <= this.lastSequence) {
        this.eventsDropped++;
        this.logger.debug("evento duplicado descartado", {
          type: frame.type,
          s: frame.s,
        });
        return;
      }
      this.lastSequence = frame.s;
    }
    this.emit("event", {
      type: frame.type,
      d: frame.d,
      s: frame.s,
      timestamp: frame.timestamp,
    });
  }

  // ------------------------------------------------------------------
  // Fechamento
  // ------------------------------------------------------------------

  private handleClose(code: number, reason: string): void {
    this.stopHeartbeat();
    this.ws = null;
    const wasEstablished = this.established;
    this.established = false;

    if (this.reconnectRequested) {
      this.reconnectRequested = false;
      this.emit("disconnect", { code, reason, fatal: false });
      void this.kickReconnectAfterDrop(code, reason);
      return;
    }

    if (this.destroyed || this.closingByClient) {
      this.closingByClient = false;
      this.emit("disconnect", { code, reason, fatal: false });
      this.failHandshake(new GatewayError(code, reason, "Conexão encerrada"));
      return;
    }

    const fatal = FATAL_CLOSE_CODES.has(code);
    const botBug = BOT_BUG_CLOSE_CODES.has(code);

    const error = new GatewayError(
      code,
      reason,
      describeClose(code, reason, fatal, botBug),
    );

    this.emit("disconnect", { code, reason, fatal: fatal || botBug });

    if (fatal || botBug) {
      this.logger.error("conexão encerrada sem retomada", { code, reason });
      this.setStatus("disconnected");
      this.failHandshake(error);
      return;
    }

    if (wasEstablished) {
      // Queda com sessão aberta: o loop externo não está mais ativo;
      // retoma a reconexão agora.
      this.emit("error", error);
      void this.kickReconnectAfterDrop(code, reason);
    } else {
      // Durante o handshake: apenas rejeita; o loop de conexão decide.
      this.failHandshake(error);
    }
  }

  private async kickReconnectAfterDrop(code: number, reason: string): Promise<void> {
    if (!this.autoReconnect || this.destroyed) {
      this.setStatus("disconnected");
      return;
    }
    const attempt = this.reconnectAttempts++;
    const delayMs = backoffDelay(attempt, { baseMs: this.reconnectBaseMs });
    this.reconnectCount++;
    this.setStatus("reconnecting");
    this.emit("reconnecting", { attempt, delayMs, closeCode: code, reason });
    this.logger.info("reconectando após queda", { attempt, delayMs, code });
    await sleep(delayMs);
    if (this.destroyed) return;
    this.setStatus(this.sessionId ? "reconnecting" : "connecting");
    try {
      await this.openSocketOnce(this.resumeUrl ?? this.url);
      this.reconnectAttempts = 0;
    } catch {
      // openSocketOnce só falha o handshake em códigos fatais (tratados
      // via evento error/disconnect) ou timeout, que cai aqui e continua.
      if (!this.destroyed) void this.kickReconnectAfterDrop(code, reason);
    }
  }

  // ------------------------------------------------------------------
  // Heartbeat
  // ------------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (!this.heartbeatIntervalMs) return;

    // Espalha o primeiro heartbeat por uma fração aleatória do intervalo,
    // para que uma reconexão em massa não chegue toda junta.
    const firstDelay = Math.max(250, Math.random() * this.heartbeatIntervalMs);
    this.heartbeatTimer = setTimeout(() => {
      this.sendHeartbeat();
      if (this.heartbeatIntervalMs) {
        this.heartbeatTimer = setInterval(
          () => this.sendHeartbeat(),
          this.heartbeatIntervalMs,
        );
      }
    }, firstDelay);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.awaitingAck = false;
  }

  private sendHeartbeat(): void {
    if (this.destroyed || !this.ws) return;

    // Zumbi: o heartbeat anterior ainda não foi confirmado dentro de um
    // intervalo — a recomendação da documentação é assumir conexão zumbi,
    // fechá-la e retomar com `resume`.
    if (this.awaitingAck) {
      this.logger.warn("sem heartbeat.ack desde o último heartbeat; conexão zumbi, reconectando");
      try {
        this.ws.close(4000, "zombie connection");
      } catch {
        // ignora
      }
      return;
    }

    this.lastHeartbeatSentAt = Date.now();
    this.sendFrame("heartbeat", { s: this.lastSequence ?? undefined });
    this.awaitingAck = true;
  }

  // ------------------------------------------------------------------

  private sendFrame(op: ClientOpcode, d: unknown): void {
    const ws = this.ws;
    if (!ws) {
      this.logger.debug("frame descartado: sem socket", { op });
      return;
    }
    const payload = JSON.stringify({ op, d, requestId: newRequestId() });
    if (Buffer.byteLength(payload, "utf8") > 65_536) {
      this.emit(
        "error",
        new GatewayError(null, null, `Frame ${op} excede 65536 bytes e não foi enviado`),
      );
      return;
    }
    try {
      ws.send(payload);
    } catch (err) {
      this.emit(
        "error",
        new GatewayError(null, null, `Falha ao enviar frame ${op}: ${String((err as Error)?.message ?? err)}`),
      );
    }
  }

  private setStatus(status: GatewayStatus): void {
    if (this.statusValue === status) return;
    this.statusValue = status;
    this.emit("statusChange", status);
  }
}

function describeClose(code: number, reason: string, fatal: boolean, botBug: boolean): string {
  if (fatal) {
    if (code === GatewayCloseCodes.AuthenticationFailed) {
      return `O token foi recusado (4004${reason ? `: ${reason}` : ""}). Ele foi trocado, revogado, ou o bot/dono foi excluído ou suspenso. Não reconecte com o mesmo token.`;
    }
    if (code === GatewayCloseCodes.BotSessionLimit) {
      return `O bot já tem 2 sessões simultâneas (4014). Feche uma das sessões antes de reconectar.`;
    }
    return `A conta do bot está suspensa (4013). Não reconecte.`;
  }
  if (botBug) {
    return `Erro de protocolo do bot (código ${code}${reason ? `: ${reason}` : ""}). Corrija o código antes de tentar de novo.`;
  }
  return `Conexão do gateway fechou (código ${code}${reason ? `: ${reason}` : ""}).`;
}
