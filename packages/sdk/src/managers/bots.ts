/**
 * Manager do próprio bot e de usuários.
 */

import type { RestClient } from "../rest/RestClient";
import type { APIBot, APICurrentUser } from "../types/api";
import type { Snowflake } from "../types/common";

export class BotManager {
  constructor(private readonly rest: RestClient) {}

  /** `GET /bots/@me`: o bot na visão do dono (inclui as intents configuradas). */
  fetchCurrent(signal?: AbortSignal): Promise<APIBot> {
    return this.rest.get<APIBot>("/bots/@me", { signal });
  }

  /** `GET /bots/{botId}`: o cartão público de um bot. */
  fetch(botId: Snowflake, signal?: AbortSignal): Promise<APIBot> {
    return this.rest.get<APIBot>(`/bots/${botId}`, { signal });
  }
}

export class UsersManager {
  constructor(private readonly rest: RestClient) {}

  /** `GET /users/@me`: a própria conta (em um bot, campos privados são padrão). */
  fetchMe(signal?: AbortSignal): Promise<APICurrentUser> {
    return this.rest.get<APICurrentUser>("/users/@me", { signal });
  }
}
