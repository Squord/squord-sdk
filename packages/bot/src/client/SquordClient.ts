/**
 * `SquordClient`: o ponto central do SDK.
 *
 * Valida o token contra a API (`GET /bots/@me`), conecta ao gateway, entrega
 * eventos tipados e expõe os managers REST. O ciclo de vida completo —
 * reconexão, heartbeat, resume e deduplicação — fica a cargo do SDK.
 */

import { TypedEmitter } from "../utils/TypedEmitter";
import type { ClientEvents } from "./events";
import { ApplicationCommandsManager } from "../managers/appCommands";
import { BotManager, UsersManager } from "../managers/bots";
import { ChannelsManager } from "../managers/channels";
import { InteractionsManager } from "../managers/interactions";
import {
  GuildsManager,
  MembersManager,
  ModerationManager,
  RolesManager,
} from "../managers/members";
import { MessagesManager } from "../managers/messages";
import { UploadsManager } from "../managers/uploads";
import { RestClient } from "../rest/RestClient";
import { Gateway } from "../gateway/Gateway";
import type { WebSocketFactory } from "../gateway/WebSocketLike";
import type { Logger } from "../logger";
import { createConsoleLogger, loggerFromEnv, noopLogger } from "../logger";
import { Channel, Thread } from "../structures/Channel";
import { Guild, Member, Role, User } from "../structures/User";
import { Message } from "../structures/Message";
import { Interaction } from "../structures/Interaction";
import { SquordTypeError } from "../errors";
import { assertSnowflake } from "../utils/snowflake";
import { isBotToken, stripTokenPrefix } from "../utils/misc";
import type {
  APIBot,
  APIChannel,
  APIGuild,
  APIMember,
  APIMessage,
  APIRole,
  APIThread,
} from "../types/api";
import type { Snowflake } from "../types/common";
import type { GatewayPresenceUpdate, PresenceStatus, ServerFrame } from "../types/gateway";
import { resolveChannelPermissions, Permissions } from "../permissions";
import { Cache } from "../cache/Cache";

export interface ClientOptions {
  /** Token do bot (`sqb_<id>.<segredo>`), de preferência vindo do ambiente. */
  token: string;
  /** URL base da API REST. Padrão: `https://api.squord.com.br/api/v1`. */
  apiBaseURL?: string;
  /** URL do gateway. Padrão: `wss://gateway.squord.com.br/gateway`. */
  gatewayURL?: string;
  /** Timeout por requisição REST, em ms. Padrão: 15000. */
  restTimeoutMs?: number;
  /** Base do backoff de reconexão do gateway, em ms. Padrão: 1000. */
  gatewayReconnectBaseMs?: number;
  /** Retentativas REST para falhas transitórias. Padrão: 3. */
  restMaxRetries?: number;
  /** Teto global de requisições/segundo (o oficial é 50). Padrão: 45. */
  restGlobalPerSecond?: number;
  /** Implementação de fetch para testes. Padrão: `fetch` global. */
  fetchImpl?: typeof fetch;
  /** Fábrica de WebSocket para testes. Padrão: `WebSocket` global (Node 22+). */
  ws?: WebSocketFactory;
  /**
   * `true` para usar apenas o cliente REST (tarefas agendadas, CI), sem
   * gateway. Use `login()` normalmente; ele só valida o token.
   */
  restOnly?: boolean;
  /** `true` para encerrar com SIGINT/SIGTERM automaticamente. Padrão: `false`. */
  gracefulShutdown?: boolean;
  /** Logger do SDK (`debug`, `info`, `warn`, `error`); `null` silencia. */
  logger?: Logger | null;
  /** Nível do logger automático (ignorado se `logger` for informado). */
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
  /**
   * Cache em memória opcional (TTL e limite configuráveis). Desativado por
   * padrão: o cliente busca os dados sob demanda.
   */
  cache?: {
    enabled: boolean;
    /** TTL por item, em ms. Padrão: 300000 (5 min). */
    ttlMs?: number;
    /** Máximo de itens por cache. Padrão: 500. */
    maxEntries?: number;
  };
}

export class SquordClient extends TypedEmitter<ClientEvents> {
  readonly rest: RestClient;
  readonly messages: MessagesManager;
  readonly channels: ChannelsManager;
  readonly guilds: GuildsManager;
  readonly members: MembersManager;
  readonly roles: RolesManager;
  readonly moderation: ModerationManager;
  readonly uploads: UploadsManager;
  readonly interactions: InteractionsManager;
  readonly commands: ApplicationCommandsManager;
  readonly bot: BotManager;
  readonly users: UsersManager;
  readonly logger: Logger;

  /** Caches opcionais, desativados por padrão (`cache.enabled`). */
  readonly caches: {
    guilds: Cache<Snowflake, APIGuild>;
    channels: Cache<Snowflake, APIChannel>;
    members: Cache<string, APIMember>;
    roles: Cache<Snowflake, APIRole[]>;
  } | null;

  private readonly options: ClientOptions;
  private gatewayInstance: Gateway | null = null;
  private botInfo: APIBot | null = null;
  private userIdValue: Snowflake | null = null;
  private shutdownSignalsBound = false;
  private destroyed = false;

  constructor(options: ClientOptions) {
    super();
    if (!options?.token || typeof options.token !== "string") {
      throw new SquordTypeError("Informe o token do bot: new SquordClient({ token: process.env.SQUORD_BOT_TOKEN })");
    }
    const token = stripTokenPrefix(options.token);
    if (!isBotToken(token)) {
      throw new SquordTypeError(
        "O token do bot deve começar com sqb_ (formato sqb_<id>.<segredo>), obtido em Configurações → Desenvolvedor",
      );
    }
    this.options = { ...options, token };

    this.logger =
      options.logger !== undefined && options.logger !== null
        ? options.logger
        : options.logger === null
          ? noopLogger
          : options.logLevel
            ? createConsoleLogger({ level: options.logLevel })
            : loggerFromEnv();

    this.rest = new RestClient({
      baseURL: options.apiBaseURL,
      token,
      timeoutMs: options.restTimeoutMs,
      maxRetries: options.restMaxRetries,
      globalRequestsPerSecond: options.restGlobalPerSecond,
      fetchImpl: options.fetchImpl,
      logger: this.logger,
    });

    this.messages = new MessagesManager(this.rest);
    this.channels = new ChannelsManager(this.rest);
    this.guilds = new GuildsManager(this.rest);
    this.members = new MembersManager(this.rest);
    this.roles = new RolesManager(this.rest);
    this.moderation = new ModerationManager(this.rest);
    this.uploads = new UploadsManager(this.rest, this.logger);
    this.interactions = new InteractionsManager(this.rest);
    this.commands = new ApplicationCommandsManager(this.rest);
    this.bot = new BotManager(this.rest);
    this.users = new UsersManager(this.rest);

    const cacheOptions = options.cache?.enabled
      ? { ttlMs: options.cache.ttlMs, maxSize: options.cache.maxEntries }
      : null;
    this.caches = cacheOptions
      ? {
          guilds: new Cache<Snowflake, APIGuild>(cacheOptions),
          channels: new Cache<Snowflake, APIChannel>(cacheOptions),
          members: new Cache<string, APIMember>(cacheOptions),
          roles: new Cache<Snowflake, APIRole[]>(cacheOptions),
        }
      : null;
  }

  /** Opções com que o cliente foi criado (sem o token). */
  get optionsSafe(): Omit<ClientOptions, "token"> {
    const { token: _token, ...rest } = this.options;
    return rest;
  }

  /** Id da conta do bot (disponível após `login()`). */
  get userId(): Snowflake | null {
    return this.userIdValue;
  }

  /** A conta do bot como `User` (após `login()`). */
  get user(): User | null {
    return this.botInfo ? new User(this, this.botInfo.user) : null;
  }

  /** O bot na visão do dono (após `login()`). */
  get application(): APIBot | null {
    return this.botInfo;
  }

  /** O gateway, se conectado (ou em conexão). */
  get gateway(): Gateway | null {
    return this.gatewayInstance;
  }

  /** `true` quando o gateway está autenticado e recebendo eventos. */
  isReady(): boolean {
    return this.gatewayInstance?.isReady ?? false;
  }

  /** Latência do gateway (último heartbeat → ack), em ms. */
  get ping(): number | null {
    return this.gatewayInstance?.heartbeatLatencyMs ?? null;
  }

  /**
   * Autentica e conecta. Valida o token (`GET /bots/@me`), conecta ao
   * gateway (a menos que `restOnly`) e resolve no `ready`.
   */
  async login(): Promise<void> {
    if (this.destroyed) throw new SquordTypeError("O cliente foi destruído");
    if (this.userIdValue) return; // já logado

    this.logger.info("validando token do bot");
    this.botInfo = await this.bot.fetchCurrent();
    this.userIdValue = this.botInfo.user.id;
    this.logger.info("token validado", { botId: this.botInfo.id, username: this.botInfo.user.username });

    if (this.options.restOnly) {
      this.logger.info("modo REST-only: sem gateway");
      this.emit("ready", {
        user: new User(this, this.botInfo.user),
        sessionId: "",
        guilds: [],
        ping: null,
      });
      return;
    }

    if (this.options.gracefulShutdown && !this.shutdownSignalsBound) {
      this.shutdownSignalsBound = true;
      const shutdown = () => {
        void this.destroy().then(() => process.exit(0));
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    }

    const gateway = this.ensureGateway();
    const ready = await gateway.connect();

    this.userIdValue = ready.userId || this.userIdValue;
    this.emit("ready", {
      user: this.user ?? new User(this, this.botInfo!.user),
      sessionId: ready.sessionId,
      guilds: ready.guilds,
      ping: this.ping,
    });
  }

  /**
   * Encerra o cliente: fecha o gateway, cancela requisições pendentes e
   * remove listeners. Seguro chamar mais de uma vez.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.gatewayInstance) {
      await this.gatewayInstance.destroy();
      this.gatewayInstance = null;
    }
    this.rest.destroy();
    this.removeAllListeners();
  }

  /** Presença do bot: `ONLINE`, `IDLE`, `DND` ou `INVISIBLE`, com status personalizado. */
  setPresence(presence: { status?: PresenceStatus; customStatus?: string | null; afk?: boolean }): void {
    if (!this.gatewayInstance) {
      throw new SquordTypeError("Conecte o gateway antes de mudar a presença (login())");
    }
    const update: GatewayPresenceUpdate = {
      status: presence.status,
      customStatus: presence.customStatus === undefined ? undefined : presence.customStatus,
      afk: presence.afk,
    };
    this.gatewayInstance.setPresence(update);
  }

  /** Força reconexão do gateway (tenta `resume`). */
  reconnect(): void {
    this.gatewayInstance?.reconnectNow();
  }

  /**
   * Permissões efetivas do bot em um canal, resolvidas localmente a partir
   * dos cargos e overwrites (com o cache, quando habilitado). O backend
   * continua sendo a autoridade final.
   */
  async myPermissionsIn(channelId: Snowflake): Promise<bigint> {
    assertSnowflake(channelId, "channelId");
    const channel = this.caches?.channels.get(channelId) ?? (await this.channels.fetch(channelId));
    this.caches?.channels.set(channelId, channel);
    const guildId = channel.guildId;
    const guild = this.caches?.guilds.get(guildId) ?? (await this.guilds.fetch(guildId));
    this.caches?.guilds.set(guildId, guild);

    const roles = this.caches?.roles.get(guildId) ?? (await this.roles.list(guildId));
    this.caches?.roles.set(guildId, roles);

    const memberKey = `${guildId}:${this.userIdValue}`;
    const me =
      this.caches?.members.get(memberKey) ??
      (await this.members.fetch(guildId, this.userIdValue!));
    this.caches?.members.set(memberKey, me);

    const roleById = new Map(roles.map((role) => [role.id, role]));
    const everyonePermissions = BigInt(
      (roleById.get(guildId) ?? roles.find((r) => r.id === guildId))?.permissions ?? "0",
    );
    return resolveChannelPermissions({
      everyonePermissions,
      rolePermissions: me.roleIds
        .map((roleId) => roleById.get(roleId))
        .filter((role): role is APIRole => role !== undefined)
        .map((role) => BigInt(role.permissions)),
      overwrites: channel.overwrites,
      memberId: me.id,
      everyoneRoleId: guildId,
      memberRoleIds: me.roleIds,
    });
  }

  /** Testa se o bot tem um conjunto de permissões em um canal. */
  async hasPermissionsIn(channelId: Snowflake, ...flags: bigint[]): Promise<boolean> {
    const bits = await this.myPermissionsIn(channelId);
    return flags.every((flag) => (bits & flag) === flag);
  }

  /** Atalho para `Permissions` (evita import extra em código de bot). */
  get Permissions(): typeof Permissions {
    return Permissions;
  }

  // ------------------------------------------------------------------

  private ensureGateway(): Gateway {
    if (this.gatewayInstance) return this.gatewayInstance;

    const gateway = new Gateway({
      url: this.options.gatewayURL,
      token: this.options.token,
      ws: this.options.ws,
      logger: this.logger,
      reconnectBaseMs: this.options.gatewayReconnectBaseMs,
    });

    gateway.on("resumed", (resumed) => {
      this.emit("resumed", resumed);
      this.logger.info("sessão retomada", { replayed: resumed.replayed });
    });

    gateway.on("reconnecting", (info) => {
      this.emit("reconnecting", info);
      this.logger.warn("reconectando ao gateway", info);
    });

    gateway.on("disconnect", (info) => {
      this.emit("disconnect", info);
      if (!info.fatal) this.emit("warn", `Conexão do gateway caiu (código ${info.code})`);
    });

    gateway.on("error", (error) => {
      this.emit("error", error);
    });

    gateway.on("invalidSession", () => {
      this.emit("warn", "Sessão do gateway não pôde ser retomada; refazendo identify");
    });

    gateway.on("raw", (frame: ServerFrame) => {
      this.emit("raw", frame);
    });

    gateway.on("event", (event) => {
      this.dispatchGatewayEvent(event);
    });

    this.gatewayInstance = gateway;
    return gateway;
  }

  private dispatchGatewayEvent(event: {
    type: string;
    d: unknown;
    s?: number;
    timestamp: number;
  }): void {
    const { type, d } = event;
    const data = d as Record<string, unknown>;

    try {
      switch (type) {
        case "message.created":
        case "message.updated":
          this.emit(type, new Message(this, data.message as APIMessage));
          break;
        case "member.joined":
        case "member.updated":
          this.emit(type, {
            guildId: data.guildId as Snowflake,
            member: new Member(this, data.member as APIMember),
          });
          break;
        case "guild.updated":
          this.emit(type, new Guild(this, data.guild as APIGuild));
          break;
        case "channel.created":
        case "channel.updated":
          this.emit(type, new Channel(this, data.channel as APIChannel));
          break;
        case "role.created":
        case "role.updated":
          this.emit(type, new Role(this, data.role as APIRole));
          break;
        case "thread.created":
        case "thread.updated":
          this.emit(type, new Thread(this, data.thread as APIThread));
          break;
        case "interaction.created":
          this.emit(type, new Interaction(this, d as never));
          break;
        default:
          if (this.listenerCount(type as keyof ClientEvents) > 0) {
            // Evento com listener registrado: entrega o payload cru.
            this.emit(type as keyof ClientEvents, d);
          } else if (isKnownEventType(type)) {
            this.emit(type as keyof ClientEvents, d);
          } else {
            this.emit("unknownEvent", event);
          }
      }
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }
}

const KNOWN_EVENT_TYPES = new Set<string>([
  "message.deleted",
  "message.bulk_deleted",
  "poll.vote.cast",
  "poll.vote.removed",
  "reaction.added",
  "reaction.removed",
  "member.left",
  "member.banned",
  "member.unbanned",
  "guild.deleted",
  "guild.taken_down",
  "guild.boost.added",
  "guild.boost.removed",
  "channel.deleted",
  "channel.tree.invalidated",
  "role.deleted",
  "thread.deleted",
  "emoji.created",
  "emoji.updated",
  "emoji.deleted",
  "sticker.created",
  "sticker.updated",
  "sticker.deleted",
  "guild_event.created",
  "guild_event.updated",
  "guild_event.deleted",
  "announcement.follow.created",
  "announcement.follow.deleted",
  "voice.state.updated",
  "voice.room.updated",
  "voice.member.moved",
  "voice.e2ee.bot_key_requested",
  "application_command.updated",
]);

function isKnownEventType(type: string): boolean {
  return KNOWN_EVENT_TYPES.has(type);
}
