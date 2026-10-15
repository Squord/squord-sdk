/**
 * Manager de Spaces (guilds), membros, cargos e moderação.
 *
 * A nomenclatura do SDK usa "Space" na documentação, mas a API chama o
 * recurso de `guild` (`/guilds/...`), o que o SDK preserva nos caminhos.
 */

import type { RestClient } from "../rest/RestClient";
import type {
  APIGuild,
  APIMember,
  APIMemberBan,
  APIMemberBanBody,
  APIMemberEditBody,
  APIMemberPage,
  APIRole,
} from "../types/api";
import type { CursorPaginationParams, ISODate, Snowflake } from "../types/common";

export class GuildsManager {
  constructor(private readonly rest: RestClient) {}

  /** Busca um Space pelo id, com o bloco `self` do bot nele. */
  fetch(guildId: Snowflake, signal?: AbortSignal): Promise<APIGuild> {
    return this.rest.get<APIGuild>(`/guilds/${guildId}`, { signal });
  }
}

export interface MemberListParams extends CursorPaginationParams {
  /** Só membros com este cargo. */
  roleId?: Snowflake;
  /** Prefixo do `username` ou parte do `displayName`. */
  search?: string;
  /** Só membros que enxergam este canal (threads valem pelo canal pai). */
  channelId?: Snowflake;
}

export class MembersManager {
  constructor(private readonly rest: RestClient) {}

  /** Busca um membro de um Space. */
  fetch(guildId: Snowflake, userId: Snowflake, signal?: AbortSignal): Promise<APIMember> {
    return this.rest.get<APIMember>(`/guilds/${guildId}/members/${userId}`, { signal });
  }

  /** Lista membros com paginação por cursor e filtros. */
  list(guildId: Snowflake, params: MemberListParams = {}, signal?: AbortSignal): Promise<APIMemberPage> {
    return this.rest.get<APIMemberPage>(`/guilds/${guildId}/members`, {
      query: {
        limit: params.limit,
        before: params.before,
        after: params.after,
        roleId: params.roleId,
        search: params.search,
        channelId: params.channelId,
      },
      signal,
    });
  }

  /**
   * Edita um membro: apelido, cargos (substituem o conjunto), timeout,
   * silenciamento. O bot precisa das permissões correspondentes.
   */
  edit(
    guildId: Snowflake,
    userId: Snowflake,
    body: APIMemberEditBody,
    options: { signal?: AbortSignal } = {},
  ): Promise<APIMember> {
    return this.rest.patch<APIMember>(`/guilds/${guildId}/members/${userId}`, body, {
      signal: options.signal,
      // PATCH de membro é substituição declarativa; seguro repetir.
      retryable: true,
    });
  }

  /** Aplica um timeout até a data informada (`TIMEOUT_MEMBERS`). */
  timeout(guildId: Snowflake, userId: Snowflake, until: ISODate, options?: { signal?: AbortSignal }): Promise<APIMember> {
    return this.edit(guildId, userId, { timeoutUntil: until }, options);
  }

  /** Remove o timeout de um membro. */
  removeTimeout(guildId: Snowflake, userId: Snowflake, options?: { signal?: AbortSignal }): Promise<APIMember> {
    return this.edit(guildId, userId, { timeoutUntil: null }, options);
  }

  /** Expulsa um membro (`KICK_MEMBERS`). Ele pode voltar com um novo convite. */
  kick(
    guildId: Snowflake,
    userId: Snowflake,
    reason?: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    return this.rest
      .delete<null>(`/guilds/${guildId}/members/${userId}`, {
        body: reason ? { reason } : {},
        signal: options.signal,
      })
      .then(() => undefined);
  }

  /** Dá um cargo a um membro (`MANAGE_ROLES`, hierarquia abaixo do bot). */
  addRole(guildId: Snowflake, userId: Snowflake, roleId: Snowflake, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.rest
      .put<null>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, undefined, {
        signal: options.signal,
      })
      .then(() => undefined);
  }

  /** Tira um cargo de um membro. */
  removeRole(guildId: Snowflake, userId: Snowflake, roleId: Snowflake, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.rest
      .delete<null>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
        signal: options.signal,
      })
      .then(() => undefined);
  }
}

export class RolesManager {
  constructor(private readonly rest: RestClient) {}

  /** Lista os cargos de um Space. */
  list(guildId: Snowflake, signal?: AbortSignal): Promise<APIRole[]> {
    return this.rest.get<APIRole[]>(`/guilds/${guildId}/roles`, { signal });
  }
}

/** Moderação: banimentos e desbanimentos (por enquanto o que a API expõe a bots). */
export class ModerationManager {
  constructor(private readonly rest: RestClient) {}

  /**
   * Ban um membro (`BAN_MEMBERS`). Pode apagar até 7 dias de histórico
   * recente com `deleteMessageSeconds`. Não é retentável por padrão.
   */
  ban(
    guildId: Snowflake,
    userId: Snowflake,
    body: APIMemberBanBody = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<APIMemberBan> {
    return this.rest.put<APIMemberBan>(`/guilds/${guildId}/bans/${userId}`, body, {
      signal: options.signal,
      retryable: false,
    });
  }

  /** Desbane (`BAN_MEMBERS`). Banimentos da plataforma não podem ser desfeitos. */
  unban(guildId: Snowflake, userId: Snowflake, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.rest
      .delete<null>(`/guilds/${guildId}/bans/${userId}`, { signal: options.signal })
      .then(() => undefined);
  }
}
