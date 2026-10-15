/**
 * @squord/bot — SDK oficial de bots do Squord para JavaScript e TypeScript.
 *
 * Documentação da plataforma: https://docs.squord.com.br
 *
 * ```ts
 * import { SquordClient } from "@squord/bot";
 *
 * const client = new SquordClient({ token: process.env.SQUORD_BOT_TOKEN! });
 *
 * client.on("message.created", async (message) => {
 *   if (message.content === "!ping") await message.reply("Pong! 🏓");
 * });
 *
 * await client.login();
 * ```
 */

// Cliente e ciclo de vida
export { SquordClient } from "./client/SquordClient";
export type { ClientOptions } from "./client/SquordClient";
export type { ClientEvents, ReadyEvent } from "./client/events";

// Comandos e componentes
export { CommandRegistry } from "./commands/CommandRegistry";
export type {
  CommandRegistryOptions,
  ComponentHandlerDefinition,
  SlashCommandDefinition,
  TextCommandContext,
  TextCommandDefinition,
} from "./commands/CommandRegistry";

// Builders
export { EmbedBuilder, EmbedLimits, normalizeEmbedColor } from "./builders/embed";
export {
  ActionRowBuilder,
  ButtonBuilder,
  Buttons,
  ComponentLimits,
  SelectMenuBuilder,
} from "./builders/components";
export { resolveMessagePayload } from "./builders/message";
export type { MessagePayload } from "./builders/message";

// Estruturas
export { Message } from "./structures/Message";
export { Channel, Thread } from "./structures/Channel";
export { Guild, Member, Role, User } from "./structures/User";
export { Interaction } from "./structures/Interaction";
export type { ChannelTreeGroup } from "./structures/User";

// Gateway
export { Gateway } from "./gateway/Gateway";
export type { GatewayEvents, GatewayOptions, GatewayStatus } from "./gateway/Gateway";
export type { WebSocketFactory, WebSocketLike } from "./gateway/WebSocketLike";
export { attachWebSocket } from "./gateway/WebSocketLike";

// REST
export { RestClient, routeKeyOf } from "./rest/RestClient";
export type {
  HttpMethod,
  RequestOptions,
  RestResponse,
  RestClientOptions,
} from "./rest/RestClient";
export { paginate, collectPagination } from "./rest/pagination";
export type { PageFetcher } from "./rest/pagination";

// Managers
export { MessagesManager } from "./managers/messages";
export type { SendOptions } from "./managers/messages";
export { ChannelsManager } from "./managers/channels";
export {
  GuildsManager,
  MembersManager,
  ModerationManager,
  RolesManager,
} from "./managers/members";
export type { MemberListParams } from "./managers/members";
export { UploadsManager } from "./managers/uploads";
export type { UploadOptions, UploadSource } from "./managers/uploads";
export { InteractionsManager } from "./managers/interactions";
export { ApplicationCommandsManager } from "./managers/appCommands";
export { BotManager, UsersManager } from "./managers/bots";

// Erros
export {
  AuthenticationError,
  GatewayError,
  InvalidTokenError,
  makeAPIError,
  NetworkError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  RequestTimeoutError,
  SquordAPIError,
  SquordError,
  SquordTypeError,
  ValidationError,
} from "./errors";

// Permissões e intents
export {
  ALL_PERMISSIONS,
  hasAnyPermission,
  hasPermissions,
  parsePermissions,
  Permissions,
  permissionsToString,
  resolveChannelPermissions,
  SUGGESTED_MODERATION_PERMISSIONS,
  SUGGESTED_TEXT_BOT_PERMISSIONS,
} from "./permissions";
export type { PermissionFlag } from "./permissions";
export {
  DEFAULT_INTENTS,
  Intents,
  intentsValue,
  listIntents,
} from "./intents";
export type { IntentFlag } from "./intents";

// Cache, logger e utilidades
export { Cache } from "./cache/Cache";
export type { CacheOptions } from "./cache/Cache";
export {
  createConsoleLogger,
  loggerFromEnv,
  noopLogger,
  redact,
} from "./logger";
export type { Logger, LogLevel } from "./logger";
export { backoffDelay, sleep } from "./utils/backoff";
export { splitArguments } from "./utils/misc";
export {
  assertSnowflake,
  compareSnowflakes,
  isValidSnowflake,
} from "./utils/snowflake";

// Tipos públicos
export type {
  AllowedMentions,
  Cursor,
  CursorPaginationParams,
  ISODate,
  Nonce,
  Page,
  PermissionBits,
  Snowflake,
} from "./types/common";
export type {
  APIAttachment,
  APIBot,
  APIChannel,
  APIChannelOverwrite,
  APIChannelTreeNode,
  APICommand,
  APICommandInput,
  APICommandOption,
  APICommandOptionChoice,
  APICommandOptionInput,
  APIComponentRow,
  APIEmbed,
  APIEmbedInput,
  APIForumTag,
  APIForumPostCreateBody,
  APIGuild,
  APIGuildRule,
  APIGuildSelf,
  APIInteraction,
  APIInteractionCallbackBody,
  InteractionCallbackType,
  APIInteractionCommandData,
  APIInteractionComponentData,
  APIInteractionReplyData,
  APIMember,
  APIMemberBan,
  APIMemberBanBody,
  APIMemberEditBody,
  APIMemberPage,
  APIMessage,
  APIMessageCreateBody,
  APIMessageEditBody,
  APIMessagePage,
  APIMessageReplyTo,
  APIReaction,
  APIRole,
  APISelectMenu,
  APISelectOption,
  APIThread,
  APIThreadCreateBody,
  APIThreadListParams,
  APIThreadPage,
  APIUpload,
  APIUploadReservation,
  APIUploadTarget,
  APIUser,
  AttachmentScanStatus,
  ButtonStyle,
  ChannelType,
  CommandOptionType,
  InteractionType,
  MemberType,
  MessageType,
  RoleManagedKind,
  UploadStatus,
  UserFlags,
  GuildFlags,
} from "./types/api";
export { channelMention, roleMention, userMention } from "./types/api";
export type {
  GatewayCloseCode,
  GatewayCloseCodes,
  GatewayEventName,
  PresenceStatus,
  ServerFrame,
  ClientOpcode,
  ServerOpcode,
} from "./types/gateway";
