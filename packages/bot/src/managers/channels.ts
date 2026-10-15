/**
 * Manager de canais e threads: consultar, listar a árvore do Space e
 * criar threads e posts de fórum.
 */

import type { RestClient } from "../rest/RestClient";
import type {
  APIChannel,
  APIChannelTreeNode,
  APIForumPostCreateBody,
  APIThread,
  APIThreadCreateBody,
  APIThreadListParams,
  APIThreadPage,
} from "../types/api";
import type { Snowflake } from "../types/common";

export class ChannelsManager {
  constructor(private readonly rest: RestClient) {}

  /** Busca um canal (ou uma thread, que também é canal) pelo id. */
  fetch(channelId: Snowflake, signal?: AbortSignal): Promise<APIChannel> {
    return this.rest.get<APIChannel>(`/channels/${channelId}`, { signal });
  }

  /**
   * Lista a árvore de canais do Space: grupos por categoria.
   * Requer que o bot veja os canais (`VIEW_CHANNEL` do cargo dele).
   */
  fetchTree(guildId: Snowflake, signal?: AbortSignal): Promise<APIChannelTreeNode[]> {
    return this.rest.get<APIChannelTreeNode[]>(`/guilds/${guildId}/channels`, { signal });
  }

  /** Cria uma thread em um canal de texto ou de anúncios. */
  createThread(
    channelId: Snowflake,
    body: APIThreadCreateBody,
    options: { signal?: AbortSignal } = {},
  ): Promise<APIThread> {
    return this.rest.post<APIThread>(`/channels/${channelId}/threads`, body, {
      signal: options.signal,
      retryable: false,
    });
  }

  /** Cria um post em um canal de fórum (a primeira mensagem vai no corpo). */
  createForumPost(
    channelId: Snowflake,
    body: APIForumPostCreateBody,
    options: { signal?: AbortSignal } = {},
  ): Promise<APIThread> {
    return this.rest.post<APIThread>(`/channels/${channelId}/threads`, body, {
      signal: options.signal,
      retryable: false,
    });
  }

  /** Cria uma thread a partir de uma mensagem de um canal de texto/anúncios. */
  createThreadFromMessage(
    channelId: Snowflake,
    messageId: Snowflake,
    body: APIThreadCreateBody,
    options: { signal?: AbortSignal } = {},
  ): Promise<APIThread> {
    return this.rest.post<APIThread>(
      `/channels/${channelId}/messages/${messageId}/threads`,
      body,
      { signal: options.signal, retryable: false },
    );
  }

  /** Lista uma página de threads do canal (`cursor` = `nextCursor` anterior). */
  listThreads(
    channelId: Snowflake,
    params: APIThreadListParams = {},
    signal?: AbortSignal,
  ): Promise<APIThreadPage> {
    return this.rest.get<APIThreadPage>(`/channels/${channelId}/threads`, {
      query: {
        limit: params.limit,
        cursor: params.after ?? params.before,
        archived: params.archived,
        tagId: params.tagId,
      },
      signal,
    });
  }
}
