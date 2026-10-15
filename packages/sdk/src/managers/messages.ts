/**
 * Manager de mensagens: enviar, editar, apagar, reagir, fixar e consultar.
 */

import { resolveMessageEditPayload, resolveMessagePayload, safeAllowedMentions } from "../builders/message";
import type { RestClient } from "../rest/RestClient";
import type {
  APIMessage,
  APIMessageCreateBody,
  APIMessageEditBody,
  APIMessageListParams,
  APIMessagePage,
  APIReaction,
} from "../types/api";
import type { MessagePayloadLike } from "../builders/message";
import type { Snowflake } from "../types/common";
import { newNonce } from "../utils/misc";

export interface SendOptions {
  /** Anula a requisição. */
  signal?: AbortSignal;
  /**
   * Chave de idempotência da mensagem. Se omitida, o SDK gera uma — o que
   * torna seguro repetir o envio após falha de rede sem duplicar a mensagem.
   */
  nonce?: string;
}

export class MessagesManager {
  constructor(private readonly rest: RestClient) {}

  /** Busca uma mensagem pelo id. */
  fetch(channelId: Snowflake, messageId: Snowflake): Promise<APIMessage> {
    return this.rest.get<APIMessage>(
      `/channels/${channelId}/messages/${messageId}`,
    );
  }

  /** Lista uma página do histórico do canal (padrão: 50, máximo 100). */
  list(
    channelId: Snowflake,
    params: APIMessageListParams = {},
    signal?: AbortSignal,
  ): Promise<APIMessagePage> {
    return this.rest.get<APIMessagePage>(`/channels/${channelId}/messages`, {
      query: { limit: params.limit, before: params.before, after: params.after },
      signal,
    });
  }

  /**
   * Envia uma mensagem. O SDK anexa um `nonce` automático (idempotência),
   * então a operação pode ser repetida com segurança pelo cliente REST em
   * falhas transitórias.
   */
  send(
    channelId: Snowflake,
    payload: MessagePayloadLike,
    options: SendOptions = {},
  ): Promise<APIMessage> {
    const body = resolveMessagePayload(payload);
    const nonce = body.nonce ?? options.nonce ?? newNonce();
    const createBody: APIMessageCreateBody = {
      ...body,
      nonce,
      allowedMentions: safeAllowedMentions(body.allowedMentions),
    };
    return this.rest.post<APIMessage>(`/channels/${channelId}/messages`, createBody, {
      signal: options.signal,
      // Protegido por nonce: seguro repetir.
      retryable: true,
    });
  }

  /** Edita uma mensagem (do próprio bot). `embeds`/`components` substituem a lista inteira. */
  edit(
    channelId: Snowflake,
    messageId: Snowflake,
    payload: MessagePayloadLike,
    options: { signal?: AbortSignal } = {},
  ): Promise<APIMessage> {
    const body: APIMessageEditBody = resolveMessageEditPayload(payload);
    return this.rest.patch<APIMessage>(
      `/channels/${channelId}/messages/${messageId}`,
      body,
      { signal: options.signal },
    );
  }

  /** Apaga uma mensagem (própria ou de outros, com `MANAGE_MESSAGES`). Responde 204. */
  delete(channelId: Snowflake, messageId: Snowflake, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.rest
      .delete<null>(`/channels/${channelId}/messages/${messageId}`, { signal: options.signal })
      .then(() => undefined);
  }

  /** Reage a uma mensagem (`ADD_REACTIONS`). `emoji` é o caractere ou `<:nome:id>`. */
  react(channelId: Snowflake, messageId: Snowflake, emoji: string, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.rest
      .put<null>(
        `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        undefined,
        { signal: options.signal },
      )
      .then(() => undefined);
  }

  /** Remove a reação do bot. */
  removeReaction(channelId: Snowflake, messageId: Snowflake, emoji: string, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.rest
      .delete<null>(
        `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        { signal: options.signal },
      )
      .then(() => undefined);
  }

  /** Lista as reações de uma mensagem. */
  listReactions(channelId: Snowflake, messageId: Snowflake, signal?: AbortSignal): Promise<APIReaction[]> {
    return this.rest.get<APIReaction[]>(
      `/channels/${channelId}/messages/${messageId}/reactions`,
      { signal },
    );
  }

  /** Fixa uma mensagem no canal (`PIN_MESSAGES`). */
  pin(channelId: Snowflake, messageId: Snowflake, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.rest
      .put<null>(`/channels/${channelId}/pins/${messageId}`, undefined, { signal: options.signal })
      .then(() => undefined);
  }

  /** Desafixa uma mensagem. */
  unpin(channelId: Snowflake, messageId: Snowflake, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.rest
      .delete<null>(`/channels/${channelId}/pins/${messageId}`, { signal: options.signal })
      .then(() => undefined);
  }

  /** Lista as mensagens fixadas do canal. */
  listPins(channelId: Snowflake, signal?: AbortSignal): Promise<APIMessage[]> {
    return this.rest.get<APIMessage[]>(`/channels/${channelId}/pins`, { signal });
  }
}
