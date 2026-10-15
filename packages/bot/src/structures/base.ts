/**
 * Contrato que o `SquordClient` cumpre para as estruturas (evita ciclo de
 * import em tempo de execução: estruturas importam apenas **tipos** dos
 * managers; as instâncias vêm do cliente).
 */

import type { ApplicationCommandsManager } from "../managers/appCommands";
import type { BotManager, UsersManager } from "../managers/bots";
import type { ChannelsManager } from "../managers/channels";
import type { InteractionsManager } from "../managers/interactions";
import type {
  GuildsManager,
  MembersManager,
  ModerationManager,
  RolesManager,
} from "../managers/members";
import type { MessagesManager } from "../managers/messages";
import type { UploadsManager } from "../managers/uploads";
import type { RestClient } from "../rest/RestClient";

export interface ClientLike {
  readonly rest: RestClient;
  readonly messages: MessagesManager;
  readonly channels: ChannelsManager;
  readonly guilds: GuildsManager;
  readonly members: MembersManager;
  readonly roles: RolesManager;
  readonly moderation: ModerationManager;
  readonly uploads: UploadsManager;
  readonly interactions: InteractionsManager;
  readonly commands: ApplicationCommandsManager;
  readonly bot: BotManager;
  readonly users: UsersManager;
  /** Id da conta do bot (disponível após o login). */
  readonly userId: SnowflakeLike;
}

type SnowflakeLike = string | null;

/** Base das estruturas: guarda o payload cru e a referência ao cliente. */
export class Structure {
  constructor(
    protected readonly client: ClientLike,
    /** O payload cru devolvido pela API/gateway. */
    readonly raw: Record<string, unknown>,
  ) {}
}
