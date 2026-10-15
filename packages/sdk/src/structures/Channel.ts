/**
 * Estruturas de canal e thread.
 *
 * Uma thread também é canal: use o `id` dela como `channelId` nas rotas
 * de mensagem. Threads não têm overwrites: vale o canal pai.
 */

import type {
  APIChannel,
  APIThread,
  ChannelType,
  Snowflake,
  ThreadAutoArchiveMinutes,
} from "../types/api";
import type { ISODate } from "../types/common";
import type { MessagePayloadLike } from "../builders/message";
import { Structure } from "./base";
import type { ClientLike } from "./base";
import { Message } from "./Message";
import type { APIMessage } from "../types/api";
import type { APIThreadCreateBody } from "../types/api";

/** Um canal de texto, anúncios, categoria, fórum, voz ou palco. */
export class Channel extends Structure {
  constructor(client: ClientLike, raw: APIChannel) {
    super(client, raw as unknown as Record<string, unknown>);
  }

  get data(): APIChannel {
    return this.raw as unknown as APIChannel;
  }

  get id(): Snowflake {
    return this.data.id;
  }
  get guildId(): Snowflake {
    return this.data.guildId;
  }
  get name(): string {
    return this.data.name;
  }
  get type(): ChannelType {
    return this.data.type;
  }
  get topic(): string | null {
    return this.data.topic;
  }
  get categoryId(): Snowflake | null {
    return this.data.categoryId;
  }
  get isPrivate(): boolean {
    return this.data.isPrivate;
  }
  /** Modo lento em segundos (0 desligado). */
  get rateLimitPerUser(): number {
    return this.data.rateLimitPerUser;
  }
  get chatEnabled(): boolean {
    return this.data.chatEnabled;
  }
  get lastMessageId(): Snowflake | null {
    return this.data.lastMessageId;
  }
  /** Menção `<#id>`. */
  get mention(): string {
    return `<#${this.id}>`;
  }

  get isText(): boolean {
    return this.data.type === "TEXT" || this.data.type === "ANNOUNCEMENT";
  }
  get isVoice(): boolean {
    return this.data.type === "VOICE" || this.data.type === "STAGE";
  }
  get isForum(): boolean {
    return this.data.type === "FORUM";
  }

  /** Recarrega o canal. */
  fetch(): Promise<Channel> {
    return this.client.channels
      .fetch(this.id)
      .then((c) => new Channel(this.client, c));
  }

  /** Envia uma mensagem no canal (idempotente por `nonce`). */
  send(payload: MessagePayloadLike, options?: { signal?: AbortSignal; nonce?: string }): Promise<Message> {
    return this.client.messages
      .send(this.id, payload, options)
      .then((m) => new Message(this.client, m));
  }

  /** Envia um arquivo como anexo do canal (fluxo completo de upload). */
  sendFile(
    options: { path?: string; data?: Buffer | Uint8Array; filename?: string; contentType?: string },
    content?: string,
  ): Promise<Message> {
    return this.client.uploads
      .uploadForAttachment({ guildId: this.guildId, ...options })
      .then((attachmentId) =>
        this.send({
          content: content || undefined,
          attachmentIds: [attachmentId],
        }),
      );
  }

  /** Busca uma mensagem do canal pelo id. */
  fetchMessage(messageId: Snowflake): Promise<Message> {
    return this.client.messages
      .fetch(this.id, messageId)
      .then((m) => new Message(this.client, m));
  }

  /** Lista uma página do histórico (use `client.paginate` para iterar tudo). */
  fetchMessages(params?: { limit?: number; before?: string; after?: string }): Promise<{ items: Message[]; hasMore: boolean; prevCursor: string | null; nextCursor: string | null }> {
    return this.client.messages
      .list(this.id, params ?? {})
      .then((page) => ({
        ...page,
        items: page.items.map((m) => new Message(this.client, m)),
      }));
  }

  /** Mensagens fixadas do canal. */
  fetchPins(): Promise<Message[]> {
    return this.client.messages
      .listPins(this.id)
      .then((msgs) => msgs.map((m) => new Message(this.client, m)));
  }

  /** Cria uma thread neste canal (texto/anúncios) ou um post (fórum). */
  createThread(body: APIThreadCreateBody): Promise<Thread> {
    return this.client.channels
      .createThread(this.id, body)
      .then((t) => new Thread(this.client, t));
  }

  /** Lista as threads do canal (`cursor` = `nextCursor` da página anterior). */
  fetchThreads(params?: { limit?: number; cursor?: string; archived?: "true" | "false"; tagId?: Snowflake }): Promise<{ items: Thread[]; hasMore: boolean; nextCursor: string | null }> {
    return this.client.channels
      .listThreads(this.id, { limit: params?.limit, after: params?.cursor, archived: params?.archived, tagId: params?.tagId })
      .then((page) => ({
        ...page,
        items: page.items.map((t) => new Thread(this.client, t)),
      }));
  }
}

/** Uma thread ou post de fórum. */
export class Thread extends Structure {
  constructor(client: ClientLike, raw: APIThread) {
    super(client, raw as unknown as Record<string, unknown>);
  }

  get data(): APIThread {
    return this.raw as unknown as APIThread;
  }

  get id(): Snowflake {
    return this.data.id;
  }
  get guildId(): Snowflake {
    return this.data.guildId;
  }
  get parentId(): Snowflake {
    return this.data.parentId;
  }
  get name(): string {
    return this.data.name;
  }
  get ownerId(): Snowflake {
    return this.data.ownerId;
  }
  get isForumPost(): boolean {
    return this.data.isForumPost;
  }
  get archived(): boolean {
    return this.data.archived;
  }
  get locked(): boolean {
    return this.data.locked;
  }
  get autoArchiveMinutes(): ThreadAutoArchiveMinutes {
    return this.data.autoArchiveMinutes;
  }
  get messageCount(): number {
    return this.data.messageCount;
  }
  get lastMessageId(): Snowflake | null {
    return this.data.lastMessageId;
  }
  get lastMessageAt(): ISODate {
    return this.data.lastMessageAt;
  }
  get appliedTagIds(): Snowflake[] {
    return this.data.appliedTagIds;
  }
  get mention(): string {
    return `<#${this.id}>`;
  }

  /** Envia uma mensagem na thread (usa o id dela como channelId). */
  send(payload: MessagePayloadLike, options?: { signal?: AbortSignal; nonce?: string }): Promise<Message> {
    return this.client.messages
      .send(this.id, payload, options)
      .then((m) => new Message(this.client, m));
  }

  /** Busca uma mensagem da thread. */
  fetchMessage(messageId: Snowflake): Promise<Message> {
    return this.client.messages
      .fetch(this.id, messageId)
      .then((m: APIMessage) => new Message(this.client, m));
  }
}
