/**
 * Estrutura de mensagem: leitura e ações de alto nível
 * (responder, editar, apagar, reagir, fixar, abrir thread).
 */

import type {
  APIMessage,
  APIReaction,
  MessageType,
  Snowflake,
  ThreadAutoArchiveMinutes,
} from "../types/api";
import type { ISODate } from "../types/common";
import type { MessagePayloadLike } from "../builders/message";
import { Structure } from "./base";
import type { ClientLike } from "./base";
import { Channel, Thread } from "./Channel";
import { User } from "./User";

export class Message extends Structure {
  constructor(client: ClientLike, raw: APIMessage) {
    super(client, raw as unknown as Record<string, unknown>);
  }

  get data(): APIMessage {
    return this.raw as unknown as APIMessage;
  }

  get id(): Snowflake {
    return this.data.id;
  }
  get guildId(): Snowflake | null {
    return this.data.guildId;
  }
  get channelId(): Snowflake {
    return this.data.channelId;
  }
  get authorId(): Snowflake {
    return this.data.authorId;
  }
  get author(): User {
    return new User(this.client, this.data.author);
  }
  get type(): MessageType {
    return this.data.type;
  }
  get content(): string {
    return this.data.content;
  }
  get replyToId(): Snowflake | null {
    return this.data.replyToId;
  }
  get pinned(): boolean {
    return this.data.pinned;
  }
  get editedAt(): ISODate | null {
    return this.data.editedAt;
  }
  get moderated(): boolean {
    return this.data.moderated;
  }
  get attachments(): APIMessage["attachments"] {
    return this.data.attachments;
  }
  get embeds(): APIMessage["embeds"] {
    return this.data.embeds;
  }
  get components(): APIMessage["components"] {
    return this.data.components;
  }
  get reactions(): APIReaction[] {
    return this.data.reactions;
  }
  get createdAt(): ISODate {
    return this.data.createdAt;
  }
  /** Apelido do autor no Space (quando houver). */
  get memberNickname(): string | null {
    return this.data.memberNickname;
  }
  /** Nome de exibição efetivo do autor (apelido ou displayName). */
  get authorDisplayName(): string {
    return this.data.memberNickname ?? this.data.author.displayName;
  }

  /** `true` se a mensagem veio do próprio bot. */
  get fromMe(): boolean {
    return this.client.userId !== null && this.authorId === this.client.userId;
  }

  /** `true` se o bot foi mencionado (`<@id>` no conteúdo). */
  get mentionsMe(): boolean {
    return this.client.userId !== null && this.data.mentions.userIds.includes(this.client.userId);
  }

  /** Ids mencionados na mensagem (só as menções que valeram). */
  get mentionedUserIds(): Snowflake[] {
    return this.data.mentions.userIds;
  }
  get mentionedRoleIds(): Snowflake[] {
    return this.data.mentions.roleIds;
  }
  get mentionsEveryone(): boolean {
    return this.data.mentions.everyone;
  }

  /** Recarrega a mensagem (ela pode ter sido apagada; isso lança 404). */
  fetch(): Promise<Message> {
    return this.client.messages
      .fetch(this.channelId, this.id)
      .then((m) => new Message(this.client, m));
  }

  /** Busca o canal da mensagem (uma thread também é canal). */
  fetchChannel(): Promise<Channel | Thread | null> {
    return this.client.channels
      .fetch(this.channelId)
      .then((channel) =>
        channel.type === "THREAD"
          ? new Thread(this.client, channel as never)
          : new Channel(this.client, channel),
      )
      .catch(() => null);
  }

  /** Responde a mensagem (usa `replyToId`). Idempotente por `nonce`. */
  reply(payload: MessagePayloadLike, options?: { signal?: AbortSignal; nonce?: string }): Promise<Message> {
    const source = typeof payload === "string" ? { content: payload } : payload;
    return this.client.messages
      .send(this.channelId, { ...source, replyToId: this.id }, options)
      .then((m) => new Message(this.client, m));
  }

  /** Edita a mensagem (só mensagens do próprio bot). */
  edit(payload: MessagePayloadLike, options?: { signal?: AbortSignal }): Promise<Message> {
    return this.client.messages
      .edit(this.channelId, this.id, payload, options)
      .then((m) => new Message(this.client, m));
  }

  /** Apaga a mensagem (a do bot sempre; de outros, com `MANAGE_MESSAGES`). */
  delete(options?: { signal?: AbortSignal }): Promise<void> {
    return this.client.messages.delete(this.channelId, this.id, options);
  }

  /** Reage com um emoji Unicode ou `<:nome:id>`. */
  react(emoji: string, options?: { signal?: AbortSignal }): Promise<void> {
    return this.client.messages.react(this.channelId, this.id, emoji, options);
  }

  /** Remove a reação do bot. */
  removeReaction(emoji: string, options?: { signal?: AbortSignal }): Promise<void> {
    return this.client.messages.removeReaction(this.channelId, this.id, emoji, options);
  }

  /** Fixa a mensagem no canal (`PIN_MESSAGES`). */
  pin(options?: { signal?: AbortSignal }): Promise<void> {
    return this.client.messages.pin(this.channelId, this.id, options);
  }

  /** Desafixa a mensagem. */
  unpin(options?: { signal?: AbortSignal }): Promise<void> {
    return this.client.messages.unpin(this.channelId, this.id, options);
  }

  /** Cria uma thread a partir desta mensagem (canais de texto e anúncios). */
  startThread(body: { name: string; autoArchiveMinutes?: ThreadAutoArchiveMinutes }): Promise<Thread> {
    return this.client.channels
      .createThreadFromMessage(this.channelId, this.id, body)
      .then((t) => new Thread(this.client, t));
  }
}
