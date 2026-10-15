/**
 * Mapa de eventos do `SquordClient`.
 *
 * Os eventos seguem os nomes reais do gateway do Squord (`message.created`,
 * `member.joined`, ...) — a documentação da plataforma é a referência de
 * quando cada um chega e qual intent ele exige. Eventos desconhecidos do
 * protocolo chegam em `unknownEvent`, garantindo compatibilidade futura.
 */

import type { Channel } from "../structures/Channel";
import type { Guild } from "../structures/User";
import type { Interaction } from "../structures/Interaction";
import type { Member } from "../structures/User";
import type { Message } from "../structures/Message";
import type { Role } from "../structures/User";
import type { Thread } from "../structures/Channel";
import type { User } from "../structures/User";
import type { Snowflake } from "../types/common";
import type * as GatewayPayloads from "../types/gateway";
import type { ServerFrame } from "../types/gateway";

/** Payload do evento `ready` do cliente. */
export interface ReadyEvent {
  /** A conta do bot. */
  user: User;
  /** Id da sessão do gateway (guarde para retomar). */
  sessionId: string;
  /** Spaces onde o bot está instalado no momento do ready. */
  guilds: Array<{ id: Snowflake; name: string; iconUrl: string | null }>;
  /** Latência já medida, se houver. */
  ping: number | null;
}

export interface ClientEvents extends Record<string, unknown> {
  /** Sessão pronta: o bot autenticou e está online. */
  ready: ReadyEvent;
  /** Sessão retomada após queda: os eventos perdidos já chegaram antes. */
  resumed: GatewayPayloads.GatewayResumed;
  /** Vai reconectar (backoff com jitter). */
  reconnecting: { attempt: number; delayMs: number; closeCode: number | null; reason: string };
  /** Conexão caiu (com `fatal: true` quando não há retomada). */
  disconnect: { code: number | null; reason: string; fatal: boolean };
  /** Erro de handler, de rede ou de protocolo. */
  error: Error;
  /** Avisos não fatais. */
  warn: string;
  /** Erro em um handler de comando registrado via `CommandRegistry`. */
  commandError: {
    error: unknown;
    command?: string;
    message?: Message;
    interaction?: Interaction;
  };
  /** Qualquer frame recebido do gateway (payload cru). */
  raw: ServerFrame;
  /** Evento do gateway com payload já hidratado em estruturas. */
  "message.created": Message;
  "message.updated": Message;
  "message.deleted": GatewayPayloads.MessageDeletedPayload;
  "message.bulk_deleted": GatewayPayloads.MessageBulkDeletedPayload;
  "poll.vote.cast": GatewayPayloads.PollVotePayload;
  "poll.vote.removed": GatewayPayloads.PollVotePayload;
  "reaction.added": GatewayPayloads.ReactionAddedPayload;
  "reaction.removed": GatewayPayloads.ReactionRemovedPayload;
  "member.joined": { guildId: Snowflake; member: Member };
  "member.updated": { guildId: Snowflake; member: Member };
  "member.left": GatewayPayloads.MemberLeftPayload;
  "member.banned": GatewayPayloads.MemberBannedPayload;
  "member.unbanned": GatewayPayloads.MemberUnbannedPayload;
  "guild.updated": Guild;
  "guild.deleted": GatewayPayloads.GuildDeletedPayload;
  "guild.taken_down": GatewayPayloads.GuildTakenDownPayload;
  "guild.boost.added": GatewayPayloads.GuildBoostPayload;
  "guild.boost.removed": GatewayPayloads.GuildBoostPayload;
  "channel.created": Channel;
  "channel.updated": Channel;
  "channel.deleted": GatewayPayloads.ChannelDeletedPayload;
  "channel.tree.invalidated": GatewayPayloads.ChannelTreeInvalidatedPayload;
  "role.created": Role;
  "role.updated": Role;
  "role.deleted": GatewayPayloads.RoleDeletedPayload;
  "thread.created": Thread;
  "thread.updated": Thread;
  "thread.deleted": GatewayPayloads.ThreadDeletedPayload;
  "emoji.created": GatewayPayloads.EmojiPayload;
  "emoji.updated": GatewayPayloads.EmojiPayload;
  "emoji.deleted": GatewayPayloads.EmojiDeletedPayload;
  "sticker.created": GatewayPayloads.StickerPayload;
  "sticker.updated": GatewayPayloads.StickerPayload;
  "sticker.deleted": GatewayPayloads.StickerDeletedPayload;
  "guild_event.created": GatewayPayloads.GuildEventPayload;
  "guild_event.updated": GatewayPayloads.GuildEventPayload;
  "guild_event.deleted": GatewayPayloads.GuildEventDeletedPayload;
  "announcement.follow.created": GatewayPayloads.AnnouncementFollowCreatedPayload;
  "announcement.follow.deleted": GatewayPayloads.AnnouncementFollowDeletedPayload;
  "voice.state.updated": GatewayPayloads.VoiceStateUpdatedPayload;
  "voice.room.updated": GatewayPayloads.VoiceRoomUpdatedPayload;
  "voice.member.moved": GatewayPayloads.VoiceMemberMovedPayload;
  "voice.e2ee.bot_key_requested": GatewayPayloads.VoiceBotKeyRequestedPayload;
  "interaction.created": Interaction;
  "application_command.updated": GatewayPayloads.ApplicationCommandUpdatedPayload;
  /** Evento conhecido sem estrutura dedicada, com payload cru. */
  unknownEvent: { type: string; d: unknown; s?: number; timestamp: number };
}
