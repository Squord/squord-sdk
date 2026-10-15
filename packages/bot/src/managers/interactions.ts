/**
 * Manager de interações: callback da primeira resposta e follow-ups.
 *
 * As rotas são públicas: o token da interação vai no caminho e não se envia
 * o header `Authorization`. A janela é de **15 minutos**; a primeira resposta
 * é a única aceita como callback (`409 INTERACTION_ALREADY_ACKNOWLEDGED` na
 * segunda), e follow-up antes da primeira resposta dá
 * `409 INTERACTION_NOT_ACKNOWLEDGED`. O limite por interação é de
 * 5 respostas (callback + follow-ups) a cada 5 segundos.
 *
 * O padrão para trabalho demorado é `DEFERRED` + follow-up.
 */

import { resolveMessagePayload } from "../builders/message";
import type { RestClient } from "../rest/RestClient";
import type {
  APIInteractionCallbackBody,
  APIInteractionReplyData,
  InteractionCallbackType,
} from "../types/api";
import type { MessagePayloadLike } from "../builders/message";

export class InteractionsManager {
  constructor(private readonly rest: RestClient) {}

  /**
   * Primeira resposta a uma interação (`type`: `MESSAGE`, `DEFERRED`,
   * `UPDATE` ou `DEFERRED_UPDATE`). Resolve em `204` (sem corpo).
   *
   * Não é retentável automaticamente: uma repetição pode encontrar
   * `409 INTERACTION_ALREADY_ACKNOWLEDGED`. O SDK trata esse 409 como
   * "resposta já entregue" e resolve sem erro (veja `reply`).
   */
  callback(
    interactionId: string,
    interactionToken: string,
    body: APIInteractionCallbackBody,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.rest
      .post<null>(`/interactions/${interactionId}/${interactionToken}/callback`, body, {
        auth: false,
        signal,
        retryable: false,
      })
      .then(() => undefined);
  }

  /**
   * Follow-up depois da primeira resposta. Age como `MESSAGE`: cria uma
   * mensagem (ou resposta efêmera). Responde `204`.
   */
  followup(
    interactionId: string,
    interactionToken: string,
    data: APIInteractionReplyData,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.rest
      .post<null>(`/interactions/${interactionId}/${interactionToken}/followups`, data, {
        auth: false,
        signal,
        retryable: false,
      })
      .then(() => undefined);
  }

  /**
   * Resposta `MESSAGE` com payload conveniente (string ou objeto).
   * Um `409 INTERACTION_ALREADY_ACKNOWLEDGED` é tratado como sucesso:
   * significa que a resposta já foi entregue (por exemplo, após um timeout
   * de rede em que a primeira tentativa chegou ao servidor).
   */
  async reply(
    interactionId: string,
    interactionToken: string,
    payload: MessagePayloadLike,
    options: { ephemeral?: boolean; signal?: AbortSignal } = {},
  ): Promise<void> {
    const data = resolveMessagePayload(payload);
    if (options.ephemeral) data.ephemeral = true;
    try {
      await this.callback(interactionId, interactionToken, { type: "MESSAGE", data }, options.signal);
    } catch (err) {
      if (isAlreadyAcknowledged(err)) return;
      throw err;
    }
  }

  /** `DEFERRED`: avisa que o bot está processando ("pensando"). Depois, use follow-ups. */
  async defer(
    interactionId: string,
    interactionToken: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    try {
      await this.callback(
        interactionId,
        interactionToken,
        { type: "DEFERRED" },
        options.signal,
      );
    } catch (err) {
      if (isAlreadyAcknowledged(err)) return;
      throw err;
    }
  }

  /** `UPDATE` (só componente): edita a mensagem que tinha o componente clicado. */
  async update(
    interactionId: string,
    interactionToken: string,
    payload: MessagePayloadLike,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    const data = resolveMessagePayload(payload);
    try {
      await this.callback(
        interactionId,
        interactionToken,
        { type: "UPDATE", data },
        options.signal,
      );
    } catch (err) {
      if (isAlreadyAcknowledged(err)) return;
      throw err;
    }
  }

  /** `DEFERRED_UPDATE` (só componente): confirma o clique sem mudar nada. */
  async acknowledgeComponent(
    interactionId: string,
    interactionToken: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    try {
      await this.callback(
        interactionId,
        interactionToken,
        { type: "DEFERRED_UPDATE" },
        options.signal,
      );
    } catch (err) {
      if (isAlreadyAcknowledged(err)) return;
      throw err;
    }
  }
}

function isAlreadyAcknowledged(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { status?: number; code?: string }).status === 409 &&
    (err as { code?: string }).code === "INTERACTION_ALREADY_ACKNOWLEDGED"
  );
}

export type { InteractionCallbackType };
