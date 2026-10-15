/**
 * Tipos primitivos usados em toda a API do Squord.
 *
 * Convenções da plataforma (https://docs.squord.com.br/referencia/convencoes):
 * - Todo id é uma **string** opaca (Snowflake decimal de até 20 dígitos, ou o
 *   formato antigo de 24 caracteres hexadecimais). Nunca converta para número.
 * - Datas em ISO 8601, UTC.
 * - Permissões trafegam como **string decimal** e devem ser calculadas com
 *   `BigInt` (veja {@link Permissions}).
 */

/** Id opaco de qualquer entidade do Squord. Trate como string. */
export type Snowflake = string;

/** Data no formato ISO 8601 em UTC, ex.: `"2026-10-05T14:30:00.000Z"`. */
export type ISODate = string;

/** Conjunto de permissões como string decimal. Calcule com `BigInt`. */
export type PermissionBits = string;

/** Cursor opaco de paginação gerado pela API. */
export type Cursor = string;

/** Menções permitidas em uma mensagem. Seguras por padrão. */
export interface AllowedMentions {
  /** Menções de pessoas (`<@id>`) notificam. Padrão: `true`. */
  users?: boolean;
  /** Menções de cargos (`<@&id>`) notificam. Padrão: `false` (removidas do texto). */
  roles?: boolean;
  /** `@everyone` notifica. Padrão: `false` (vira texto simples). */
  everyone?: boolean;
}

/** Formato de página devolvido pelas rotas paginadas por cursor. */
export interface Page<T> {
  /** Itens da página. */
  items: T[];
  /** Passe como `before` para a página anterior (mais antiga). `null` no início. */
  prevCursor: Cursor | null;
  /** Passe como `after` para a página seguinte (mais nova). `null` no fim. */
  nextCursor: Cursor | null;
  /** Se há mais itens na direção consultada. */
  hasMore: boolean;
}

/** Parâmetros de listagem com paginação por cursor. */
export interface CursorPaginationParams {
  /** Tamanho da página (padrão e máximo dependem da rota). */
  limit?: number;
  /** Cursor da resposta anterior: devolve a página mais antiga. */
  before?: Cursor;
  /** Cursor da resposta anterior: devolve a página mais nova. */
  after?: Cursor;
}

/** Chave de idempotência de mensagens: repetir o envio com o mesmo `nonce` devolve a mensagem original. */
export type Nonce = string;
