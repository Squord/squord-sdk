/**
 * Normalização de payloads de mensagem: aceita strings, objetos crus e
 * builders, e devolve o corpo aceito pela API.
 *
 * Menções são seguras por padrão: quando `allowedMentions` não é informado,
 * o SDK envia `{ users: true, roles: false, everyone: false }` — o padrão
 * da plataforma — evitando menções acidentais em massa.
 */

import { SquordTypeError } from "../errors";
import { ActionRowBuilder } from "./components";
import { EmbedBuilder } from "./embed";
import type {
  APIComponentRow,
  APIEmbedInput,
  APIMessageCreateBody,
  APIMessageEditBody,
} from "../types/api";
import type { AllowedMentions, Snowflake } from "../types/common";

/** Payload de envio/edição aceito pelos métodos `send`/`reply`/`edit`. */
export interface MessagePayload {
  content?: string;
  embeds?: Array<APIEmbedInput | EmbedBuilder>;
  components?: Array<APIComponentRow | ActionRowBuilder>;
  allowedMentions?: AllowedMentions;
  replyToId?: Snowflake;
  attachmentIds?: Snowflake[];
  nonce?: string;
  ephemeral?: boolean;
}

/** Uma mensagem pode ser passada como string (só `content`) ou como payload. */
export type MessagePayloadLike = string | MessagePayload;

const SAFE_ALLOWED_MENTIONS: AllowedMentions = { users: true, roles: false, everyone: false };

/** Converte builders e valores crus no formato da API. */
export function resolveMessagePayload(
  payload: MessagePayloadLike,
): APIMessageCreateBody & { ephemeral?: boolean } {
  const source: MessagePayload =
    typeof payload === "string" ? { content: payload } : payload;

  const body: APIMessageCreateBody & { ephemeral?: boolean } = {};
  let hasVisibleContent = false;

  if (source.content !== undefined) {
    if (typeof source.content !== "string") {
      throw new SquordTypeError("content precisa ser string");
    }
    if (source.content.length > 4000) {
      throw new SquordTypeError(`content excede 4000 caracteres (${source.content.length})`);
    }
    body.content = source.content;
    if (source.content.length > 0) hasVisibleContent = true;
  }

  if (source.embeds !== undefined) {
    if (!Array.isArray(source.embeds) || source.embeds.length > 10) {
      throw new SquordTypeError("embeds aceita até 10 itens");
    }
    body.embeds = source.embeds.map((embed) =>
      embed instanceof EmbedBuilder ? embed.build() : (embed as APIEmbedInput),
    );
    if (body.embeds.length > 0) hasVisibleContent = true;
  }

  if (source.components !== undefined) {
    if (!Array.isArray(source.components) || source.components.length > 5) {
      throw new SquordTypeError("components aceita até 5 linhas");
    }
    body.components = source.components.map((row) =>
      row instanceof ActionRowBuilder ? row.build() : (row as APIComponentRow),
    );
    if (body.components.length > 0) hasVisibleContent = true;
  }

  // Menções seguras por padrão: sem allowedMentions explícito, o SDK envia
  // o padrão da plataforma (pessoas sim; cargos e @everyone não), tornando
  // a proteção contra menções em massa explícita no payload.
  body.allowedMentions = source.allowedMentions ?? SAFE_ALLOWED_MENTIONS;

  if (source.replyToId !== undefined) {
    body.replyToId = source.replyToId;
  }

  if (source.attachmentIds !== undefined) {
    if (!Array.isArray(source.attachmentIds) || source.attachmentIds.length > 10) {
      throw new SquordTypeError("attachmentIds aceita até 10 itens");
    }
    body.attachmentIds = source.attachmentIds;
    if (body.attachmentIds.length > 0) hasVisibleContent = true;
  }

  if (source.nonce !== undefined) {
    if (typeof source.nonce !== "string" || source.nonce.length > 64) {
      throw new SquordTypeError("nonce precisa ser string de até 64 caracteres");
    }
    body.nonce = source.nonce;
  }

  if (source.ephemeral !== undefined) {
    body.ephemeral = source.ephemeral;
  }

  if (!hasVisibleContent) {
    throw new SquordTypeError(
      "A mensagem precisa de ao menos um entre content (não vazio), embeds, components e attachmentIds",
    );
  }

  return body;
}

/** Corpo de edição: o que não for informado continua como estava. */
export function resolveMessageEditPayload(payload: MessagePayloadLike): APIMessageEditBody {
  const source: MessagePayload =
    typeof payload === "string" ? { content: payload } : payload;
  const body: APIMessageEditBody = {};
  let hasField = false;

  if (source.content !== undefined) {
    if (source.content.length > 4000) {
      throw new SquordTypeError(`content excede 4000 caracteres (${source.content.length})`);
    }
    body.content = source.content;
    hasField = true;
  }
  if (source.embeds !== undefined) {
    body.embeds = source.embeds.map((embed) =>
      embed instanceof EmbedBuilder ? embed.build() : (embed as APIEmbedInput),
    );
    hasField = true;
  }
  if (source.components !== undefined) {
    body.components = source.components.map((row) =>
      row instanceof ActionRowBuilder ? row.build() : (row as APIComponentRow),
    );
    hasField = true;
  }
  if (source.allowedMentions !== undefined) {
    body.allowedMentions = source.allowedMentions;
  }
  if (!hasField) {
    throw new SquordTypeError(
      "Edição precisa de ao menos um entre content, embeds e components (EMPTY_UPDATE)",
    );
  }
  return body;
}

/** Menções seguras quando o payload não especifica. */
export function safeAllowedMentions(allowed?: AllowedMentions): AllowedMentions {
  return allowed ?? SAFE_ALLOWED_MENTIONS;
}
