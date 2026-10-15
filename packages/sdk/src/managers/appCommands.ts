/**
 * Manager de comandos de aplicação (slash).
 *
 * Registrar é uma **sobrescrita em bloco** (`PUT`): a lista enviada substitui
 * a anterior — comandos fora da lista são apagados; um comando cujo nome
 * continua mantém o `id`. O padrão é registrar a lista inteira na partida
 * do bot, sempre a mesma.
 *
 * Escopos: global (`PUT /bots/@me/commands`, vale em todos os Spaces do bot)
 * ou por Space (`PUT /bots/@me/guilds/{guild.id}/commands`). O limite é
 * `COMMANDS_UPDATE`: 10 sobrescritas por minuto.
 */

import type { RestClient } from "../rest/RestClient";
import type { APICommand, APICommandInput } from "../types/api";
import type { Snowflake } from "../types/common";

export class ApplicationCommandsManager {
  constructor(private readonly rest: RestClient) {}

  /** Lista os comandos globais do bot. */
  listGlobal(signal?: AbortSignal): Promise<APICommand[]> {
    return this.rest.get<APICommand[]>("/bots/@me/commands", { signal });
  }

  /** Sobrescreve os comandos globais (idempotente por ser PUT). */
  setGlobal(commands: APICommandInput[], signal?: AbortSignal): Promise<APICommand[]> {
    return this.rest.put<APICommand[]>("/bots/@me/commands", commands, { signal });
  }

  /** Lista os comandos de um Space. */
  listGuild(guildId: Snowflake, signal?: AbortSignal): Promise<APICommand[]> {
    return this.rest.get<APICommand[]>(`/bots/@me/guilds/${guildId}/commands`, { signal });
  }

  /** Sobrescreve os comandos de um Space (o bot precisa estar instalado nele). */
  setGuild(guildId: Snowflake, commands: APICommandInput[], signal?: AbortSignal): Promise<APICommand[]> {
    return this.rest.put<APICommand[]>(`/bots/@me/guilds/${guildId}/commands`, commands, {
      signal,
    });
  }
}
