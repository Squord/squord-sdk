/**
 * Tipos do protocolo do gateway do Squord.
 *
 * Referência: https://docs.squord.com.br/gateway/visao-geral
 *
 * Todo frame é um objeto JSON em texto UTF-8. Os frames enviados pelo bot têm
 * `{ op, d, requestId? }`; os recebidos têm `{ op, d, timestamp, ... }`.
 */

import type {
  APIChannel,
  APIGuild,
  APIInteraction,
  APIMember,
  APIMessage,
  APIRole,
  APIThread,
  APIUser,
} from "./api";
import type { Snowflake } from "./common";

/* ------------------------------------------------------------------ */
/* Opcodes                                                            */
/* ------------------------------------------------------------------ */

/** Opcodes que o bot pode enviar. */
export type ClientOpcode =
  | "identify"
  | "resume"
  | "heartbeat"
  | "presence.update"
  // Aceitos pelo protocolo, mas inúteis a bots (assina escopos que já vêm todos).
  | "subscribe"
  | "unsubscribe"
  // Ignorados pelo servidor quando enviados por bots.
  | "typing.start"
  | "voice.state.update";

/** Opcodes que o servidor envia. */
export type ServerOpcode =
  | "hello"
  | "ready"
  | "resumed"
  | "heartbeat.ack"
  | "invalid_session"
  | "reconnect"
  | "error"
  | "event";

/* ------------------------------------------------------------------ */
/* Frames                                                             */
/* ------------------------------------------------------------------ */

/** Base de um frame enviado pelo bot. */
export interface GatewayFrame {
  op: ClientOpcode;
  d: unknown;
  /** Até 64 caracteres; o servidor devolve no frame de resposta correspondente. */
  requestId?: string;
}

/** `hello`: o primeiro frame, assim que a conexão é aceita. */
export interface GatewayHello {
  heartbeatIntervalMs: number;
  sessionId: string;
  protocolVersion: number;
}

/** Corpo do `identify`. */
export interface GatewayIdentify {
  token: string;
  protocolVersion: number;
  /** Aceito e ignorado para bots. */
  guildIds?: string[];
  /** Aceito e ignorado para bots. */
  capabilities?: string[];
}

/** Corpo do `resume`. */
export interface GatewayResume {
  token: string;
  sessionId: string;
  lastSequence: number;
}

/** `ready`: resposta ao `identify`. */
export interface GatewayReady {
  sessionId: string;
  /** Id da conta do bot (igual ao id do bot). */
  userId: Snowflake;
  /** Spaces onde o bot está instalado: `id`, `name`, `iconUrl`. */
  guilds: Array<{ id: Snowflake; name: string; iconUrl: string | null }>;
  resumeGatewayUrl: string;
}

/** `resumed`: resposta ao `resume` (os eventos perdidos chegam antes dele). */
export interface GatewayResumed {
  sessionId: string;
  replayed: number;
  sequence: number;
}

/** `invalid_session`: o `resume` foi recusado; a conexão continua aberta. */
export interface GatewayInvalidSession {
  resumable: boolean;
}

/** `reconnect`: o servidor pediu reconexão; seguido do fechamento 4007. */
export interface GatewayReconnect {
  reason: string;
  resumable: boolean;
}

/** `error`: um frame foi recusado sem fechar a conexão. */
export interface GatewayError {
  code: string;
  message: string;
  details?: unknown;
}

export type PresenceStatus = "ONLINE" | "IDLE" | "DND" | "INVISIBLE";

/** Corpo do `presence.update`. */
export interface GatewayPresenceUpdate {
  status?: PresenceStatus;
  /** Até 128 caracteres; `null` apaga. */
  customStatus?: string | null;
  afk?: boolean;
}

/** Um frame `event` recebido do gateway. */
export interface GatewayEventFrame<T = unknown> {
  op: "event";
  type: string;
  d: T;
  /** Sequência da sessão; cresce de um em um. Só em eventos duráveis. */
  s?: number;
  timestamp: number;
}

/** Qualquer frame recebido do servidor. */
export type ServerFrame =
  | (GatewayEventFrame & { requestId?: string })
  | ({ op: "hello"; d: GatewayHello; timestamp: number; requestId?: string })
  | ({ op: "ready"; d: GatewayReady; timestamp: number; requestId?: string })
  | ({ op: "resumed"; d: GatewayResumed; timestamp: number; requestId?: string })
  | ({ op: "heartbeat.ack"; d: { sequence: number }; timestamp: number; requestId?: string })
  | ({ op: "invalid_session"; d: GatewayInvalidSession; timestamp: number; requestId?: string })
  | ({ op: "reconnect"; d: GatewayReconnect; timestamp: number; requestId?: string })
  | ({ op: "error"; d: GatewayError; timestamp: number; requestId?: string });

/* ------------------------------------------------------------------ */
/* Códigos de fechamento                                               */
/* ------------------------------------------------------------------ */

export const GatewayCloseCodes = {
  UnknownError: 4000,
  UnknownOpcode: 4001,
  DecodeError: 4002,
  NotAuthenticated: 4003,
  AuthenticationFailed: 4004,
  AlreadyAuthenticated: 4005,
  InvalidSequence: 4007,
  RateLimited: 4008,
  SessionTimeout: 4009,
  InvalidProtocolVersion: 4012,
  AccountSuspended: 4013,
  BotSessionLimit: 4014,
} as const;

export type GatewayCloseCode = (typeof GatewayCloseCodes)[keyof typeof GatewayCloseCodes];

/* ------------------------------------------------------------------ */
/* Nomes de eventos                                                    */
/* ------------------------------------------------------------------ */

/** Eventos duráveis entregues pelo gateway (campo `type` do frame `event`). */
export type GatewayEventName =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "message.bulk_deleted"
  | "poll.vote.cast"
  | "poll.vote.removed"
  | "reaction.added"
  | "reaction.removed"
  | "member.joined"
  | "member.updated"
  | "member.left"
  | "member.banned"
  | "member.unbanned"
  | "guild.updated"
  | "guild.deleted"
  | "guild.taken_down"
  | "guild.boost.added"
  | "guild.boost.removed"
  | "channel.created"
  | "channel.updated"
  | "channel.deleted"
  | "channel.tree.invalidated"
  | "role.created"
  | "role.updated"
  | "role.deleted"
  | "thread.created"
  | "thread.updated"
  | "thread.deleted"
  | "emoji.created"
  | "emoji.updated"
  | "emoji.deleted"
  | "sticker.created"
  | "sticker.updated"
  | "sticker.deleted"
  | "guild_event.created"
  | "guild_event.updated"
  | "guild_event.deleted"
  | "announcement.follow.created"
  | "announcement.follow.deleted"
  | "voice.state.updated"
  | "voice.room.updated"
  | "voice.member.moved"
  | "voice.e2ee.bot_key_requested"
  | "interaction.created"
  | "application_command.updated";

/* ------------------------------------------------------------------ */
/* Payloads dos eventos                                               */
/* ------------------------------------------------------------------ */

export interface PollResults {
  voterCount: number;
  answers: Array<{ answerId: Snowflake; count: number }>;
}

export interface PollVotePayload {
  messageId: Snowflake;
  channelId: Snowflake;
  guildId: Snowflake | null;
  userId: Snowflake;
  results: PollResults;
}

export interface ReactionAddedPayload {
  messageId: Snowflake;
  channelId: Snowflake;
  guildId: Snowflake | null;
  userId: Snowflake;
  /** A reação após a mudança. O `me` não é confiável num evento. */
  reaction: { emoji: string; count: number; userIds: Snowflake[]; me: boolean };
  /** Emoji customizado resolvido; `null` para emoji padrão. */
  customEmoji: { id: Snowflake; name: string; animated: boolean; url: string } | null;
}

export interface ReactionRemovedPayload {
  messageId: Snowflake;
  channelId: Snowflake;
  guildId: Snowflake | null;
  userId: Snowflake;
  emoji: string;
}

export interface MessageCreatedPayload {
  message: APIMessage;
}

export interface MessageUpdatedPayload {
  message: APIMessage;
}

export interface MessageDeletedPayload {
  messageId: Snowflake;
  channelId: Snowflake;
  guildId: Snowflake | null;
  /** Só quando o delete apagou a mensagem mais nova do canal. */
  lastMessageId?: Snowflake | null;
}

export interface MessageBulkDeletedPayload {
  messageIds: Snowflake[];
  channelId: Snowflake;
  guildId: Snowflake | null;
  lastMessageId?: Snowflake | null;
}

export interface MemberJoinedPayload {
  guildId: Snowflake;
  member: APIMember;
}

export interface MemberUpdatedPayload {
  guildId: Snowflake;
  member: APIMember;
}

export interface MemberLeftPayload {
  guildId: Snowflake;
  userId: Snowflake;
}

export interface MemberBannedPayload {
  guildId: Snowflake;
  userId: Snowflake;
  reason: string | null;
}

export interface MemberUnbannedPayload {
  guildId: Snowflake;
  userId: Snowflake;
}

export interface GuildUpdatedPayload {
  guild: APIGuild;
}

export interface GuildDeletedPayload {
  guildId: Snowflake;
}

export interface GuildTakenDownPayload {
  guildId: Snowflake;
  name: string;
}

export interface GuildBoostPayload {
  guildId: Snowflake;
  userId: Snowflake;
  boostIds: Snowflake[];
  boostCount: number;
  boostLevel: number;
  previousLevel: number;
  /** Só em `guild.boost.removed`. */
  reason?: "REMOVED" | "MOVED" | "LEFT" | "LAPSED" | "SPACE_GONE" | "OPERATOR";
}

export interface ChannelCreatedPayload {
  channel: APIChannel;
}

export interface ChannelUpdatedPayload {
  channel: APIChannel;
}

export interface ChannelDeletedPayload {
  channelId: Snowflake;
  guildId: Snowflake;
}

export interface ChannelTreeInvalidatedPayload {
  guildId: Snowflake;
}

export interface RoleCreatedPayload {
  role: APIRole;
}

export interface RoleUpdatedPayload {
  role: APIRole;
}

export interface RoleDeletedPayload {
  roleId: Snowflake;
  guildId: Snowflake;
}

export interface ThreadCreatedPayload {
  thread: APIThread;
}

export interface ThreadUpdatedPayload {
  thread: APIThread;
}

export interface ThreadDeletedPayload {
  threadId: Snowflake;
  parentId: Snowflake;
  guildId: Snowflake;
}

export interface EmojiPayload {
  emoji: {
    id: Snowflake;
    guildId: Snowflake;
    name: string;
    url: string;
    creatorId: Snowflake | null;
    animated: boolean;
    roleIds: Snowflake[];
    available: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

export interface EmojiDeletedPayload {
  emojiId: Snowflake;
  guildId: Snowflake;
}

export interface StickerPayload {
  sticker: {
    id: Snowflake;
    guildId: Snowflake;
    name: string;
    description: string | null;
    tags: string;
    url: string;
    format: string;
    animated: boolean;
    available: boolean;
    creatorId: Snowflake | null;
    createdAt: string;
    updatedAt: string;
  };
}

export interface StickerDeletedPayload {
  stickerId: Snowflake;
  guildId: Snowflake;
}

export interface GuildEventPayload {
  event: {
    id: Snowflake;
    guildId: Snowflake;
    name: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
    channelId: Snowflake | null;
    location: string | null;
    coverUrl: string | null;
    recurrence: Record<string, unknown> | null;
    earlyReminderMinutes: number | null;
    status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELED";
    creatorId: Snowflake | null;
    interestedCount: number;
    createdAt: string;
    updatedAt: string;
  };
}

export interface GuildEventDeletedPayload {
  eventId: Snowflake;
  guildId: Snowflake;
}

export interface AnnouncementFollowCreatedPayload {
  /** Na origem: o seguidor. No destino: o vínculo. Uma das formas chega. */
  follower?: {
    id: Snowflake;
    sourceChannelId: Snowflake;
    guild: { id: Snowflake; name: string; iconUrl: string | null };
    createdAt: string;
  };
  follow?: {
    id: Snowflake;
    targetChannelId: Snowflake;
    targetGuildId: Snowflake;
    source: { id: Snowflake; name: string; iconUrl: string | null };
    createdBy: Snowflake;
    createdAt: string;
  };
}

export interface AnnouncementFollowDeletedPayload {
  followId: Snowflake;
  sourceChannelId: Snowflake;
  targetChannelId?: Snowflake;
}

export interface VoiceState {
  userId: Snowflake;
  guildId: Snowflake | null;
  channelId: Snowflake;
  sessionId: string;
  serverMute: boolean;
  serverDeaf: boolean;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  selfScreenShare: boolean;
  watchingUserId: Snowflake | null;
  suppressed: boolean;
  joinedAt: string;
  connectedAt: string | null;
}

export interface VoiceStateUpdatedPayload {
  /** `null` quando a pessoa saiu da sala. */
  state: VoiceState | null;
  userId: Snowflake;
  channelId: Snowflake;
}

export interface VoiceRoomUpdatedPayload {
  room: {
    channelId: Snowflake;
    participants: Array<{ state: VoiceState; user: APIUser }>;
    hasScreenShare: boolean;
    hasVideo: boolean;
  };
}

export interface VoiceMemberMovedPayload {
  userId: Snowflake;
  guildId: Snowflake;
  fromChannelId: Snowflake;
  toChannelId: Snowflake;
  state: VoiceState;
}

export interface VoiceBotKeyRequestedPayload {
  channelId: Snowflake;
  recipients: Array<{ userId: Snowflake; publicKey: string }>;
}

export interface InteractionCreatedPayload extends APIInteraction {}

export interface ApplicationCommandUpdatedPayload {
  guildId: Snowflake;
  botId: Snowflake;
}
