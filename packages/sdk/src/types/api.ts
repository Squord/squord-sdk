/**
 * Tipos dos payloads reais da API REST do Squord (v1).
 *
 * Espelham o contrato publicado em https://docs.squord.com.br (OpenAPI).
 * Todos os objetos trafegam em JSON UTF-8 com campos em `camelCase`.
 */

import type { AllowedMentions, CursorPaginationParams, ISODate, Nonce, Page, PermissionBits, Snowflake } from "./common";

// Re-exporta os primitivos usados nos payloads, para consumo direto.
export type { AllowedMentions, CursorPaginationParams, ISODate, Nonce, Page, PermissionBits, Snowflake } from "./common";

/* ------------------------------------------------------------------ */
/* Usuários                                                            */
/* ------------------------------------------------------------------ */

/** Flags de uma conta, somadas em `flags`. */
export const UserFlags = {
  STAFF: 1 << 0,
  EARLY_SUPPORTER: 1 << 1,
  VERIFIED_BOT: 1 << 2,
  SYSTEM: 1 << 3,
  VERIFIED: 1 << 4,
  BOT: 1 << 5,
} as const;

/** Estilo de nome de usuário (Squord Plus). */
export interface APIUserNameStyle {
  font: string;
  effect: string;
  colors: string[];
}

/** Perfil público de uma conta, embutido em mensagens, membros e interações. */
export interface APIUser {
  id: Snowflake;
  /** Handle único em minúsculas. O de um bot começa com `bot~`. */
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Só preenchido enquanto o usuário tem Squord Plus. */
  avatarAnimatedUrl: string | null;
  nameStyle: APIUserNameStyle | null;
  flags: number;
  deleted: boolean;
  suspended: boolean;
  premium: boolean;
}

/** Visão da própria conta (`GET /users/@me`). Em um bot, quase tudo é padrão. */
export interface APICurrentUser extends APIUser {
  email: string | null;
  // Campos privados adicionais existem, mas raramente interessam a bots.
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** O bot na visão do dono (`GET /bots/@me`). */
export interface APIBot {
  id: Snowflake;
  user: APIUser;
  description: string | null;
  ownerUsername: string;
  public: boolean;
  verified: boolean;
  installCount: number;
  termsUrl: string | null;
  privacyUrl: string | null;
  createdAt: ISODate;
  /** Soma de bits das intents configuradas (veja {@link Intents}). */
  intents?: number;
}

/* ------------------------------------------------------------------ */
/* Spaces (guilds)                                                     */
/* ------------------------------------------------------------------ */

/** Flags de um Space, somadas em `flags`. */
export const GuildFlags = {
  OFFICIAL: 1 << 0,
  PARTNER: 1 << 1,
  DISCOVERY_BLOCKED: 1 << 2,
  VERIFIED: 1 << 3,
  DISCOVERY_AGE_WAIVED: 1 << 4,
} as const;

/** Uma regra publicada do Space. */
export interface APIGuildRule {
  title: string;
  description: string;
}

/** O bot (ou quem chama) dentro de um Space. */
export interface APIGuildSelf {
  memberId: Snowflake;
  roleIds: Snowflake[];
  /** Permissões no nível do Space (overwrites de canal ainda se aplicam). */
  permissions: PermissionBits;
  isOwner: boolean;
}

/** Um Space: comunidade com membros, cargos, canais e regras próprias. */
export interface APIGuild {
  id: Snowflake;
  ownerId: Snowflake;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  iconAnimatedUrl: string | null;
  bannerUrl: string | null;
  bannerAnimatedUrl: string | null;
  bannerPlaceholder: string | null;
  defaultChannelId: Snowflake | null;
  systemChannelId: Snowflake | null;
  visibility: string;
  verificationLevel: string;
  accessMode: "INVITE_ONLY" | "LINK" | "REQUEST";
  requireVerifiedEmail: boolean;
  requireTwoFactor: boolean;
  moderationMfaRequired: boolean;
  joinRequestRoleIds: Snowflake[];
  requireJoinMessage: boolean;
  joinRequestRetryDays: number;
  /** Quantas pessoas são membros (não conta bots nem webhooks). */
  memberCount: number;
  flags: number;
  planId: string;
  vanityLapsesAt: ISODate | null;
  vanityInvite: boolean;
  boostCount: number;
  boostLevel: number;
  boostMessages: boolean;
  discoveryCategory: string | null;
  locale: string | null;
  rules: APIGuildRule[];
  rulesUpdatedAt: ISODate | null;
  discoverable: boolean;
  discoverableSince: ISODate | null;
  minAccountAgeDays: number;
  createdAt: ISODate;
  updatedAt: ISODate;
  self: APIGuildSelf;
}

/* ------------------------------------------------------------------ */
/* Canais e threads                                                    */
/* ------------------------------------------------------------------ */

export type ChannelType =
  | "TEXT"
  | "ANNOUNCEMENT"
  | "CATEGORY"
  | "FORUM"
  | "VOICE"
  | "STAGE"
  | "THREAD";

/** Exceção de permissão de um cargo ou membro em um canal. */
export interface APIChannelOverwrite {
  targetId: Snowflake;
  targetType: "ROLE" | "MEMBER";
  allow: PermissionBits;
  deny: PermissionBits;
}

/** Tag de um canal de fórum. */
export interface APIForumTag {
  id: Snowflake;
  name: string;
  emoji: string | null;
  moderated: boolean;
}

/** Um canal do Space (threads têm o formato próprio {@link APIThread}). */
export interface APIChannel {
  id: Snowflake;
  guildId: Snowflake;
  categoryId: Snowflake | null;
  name: string;
  type: ChannelType;
  position: number;
  topic: string | null;
  topicUpdatedAt: ISODate | null;
  topicUpdatedById: Snowflake | null;
  isPrivate: boolean;
  /** Modo lento: segundos entre mensagens. `0` desliga. */
  rateLimitPerUser: number;
  bitrate: number | null;
  userLimit: number | null;
  chatEnabled: boolean;
  lastMessageId: Snowflake | null;
  overwrites: APIChannelOverwrite[];
  availableTags: APIForumTag[];
  requireTag: boolean;
  defaultAutoArchiveMinutes: number | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** Um grupo da árvore de canais de um Space. */
export interface APIChannelTreeNode {
  category: APIChannel | null;
  channels: APIChannel[];
}

export type ThreadAutoArchiveMinutes = 60 | 1440 | 4320 | 10080;

/** A primeira mensagem de um post de fórum, como o card mostra. */
export interface APIThreadPostPreview {
  messageId: Snowflake;
  author: APIUser;
  content: string;
  hasAttachment: boolean;
  hasImage: boolean;
  hasSticker: boolean;
  deleted: boolean;
  moderated: boolean;
}

/** Uma thread ou post de fórum. Use o `id` como `channelId` nas rotas de mensagem. */
export interface APIThread {
  id: Snowflake;
  guildId: Snowflake;
  type: "THREAD";
  /** Canal de texto, de anúncios ou fórum de onde ela parte. */
  parentId: Snowflake;
  name: string;
  ownerId: Snowflake;
  starterMessageId: Snowflake | null;
  isForumPost: boolean;
  archived: boolean;
  archivedAt: ISODate | null;
  locked: boolean;
  autoArchiveMinutes: ThreadAutoArchiveMinutes;
  rateLimitPerUser: number;
  messageCount: number;
  lastMessageId: Snowflake | null;
  lastMessageAt: ISODate;
  appliedTagIds: Snowflake[];
  postPreview: APIThreadPostPreview | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface APIThreadPage extends Page<APIThread> {}

/** Corpo de criar thread em canal de texto/anúncios ou a partir de uma mensagem. */
export interface APIThreadCreateBody {
  name: string;
  autoArchiveMinutes?: ThreadAutoArchiveMinutes;
  rateLimitPerUser?: number;
}

/** Corpo de criar um post em fórum. */
export interface APIForumPostCreateBody {
  name: string;
  /** A primeira mensagem: corpo de criar mensagem, sem `replyToId`. */
  message: APIMessageCreateBody;
  appliedTagIds?: Snowflake[];
  autoArchiveMinutes?: ThreadAutoArchiveMinutes;
}

export interface APIThreadListParams extends CursorPaginationParams {
  /** `true` lista as arquivadas; `false` (padrão), as ativas. */
  archived?: "true" | "false";
  /** Só em fórum: posts com esta tag. */
  tagId?: Snowflake;
}

/* ------------------------------------------------------------------ */
/* Cargos                                                              */
/* ------------------------------------------------------------------ */

export type RoleManagedKind = "BOOSTER" | "BOT";

/** Um cargo agrupa permissões e uma aparência. Hierárquico por `position`. */
export interface APIRole {
  id: Snowflake;
  guildId: Snowflake;
  name: string;
  color: string | null;
  position: number;
  permissions: PermissionBits;
  hoist: boolean;
  mentionable: boolean;
  managed: boolean;
  managedKind: RoleManagedKind | null;
  botId: Snowflake | null;
  icon: string | null;
  selfAssignable: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Membros                                                             */
/* ------------------------------------------------------------------ */

export type MemberType = "INTERNAL" | "BOT" | "WEBHOOK";

export interface APIMemberNameStyle {
  font: string;
  effect: string;
  colors: string[];
}

/** Perfil de um usuário dentro de um Space, com o `user` embutido. */
export interface APIMember {
  id: Snowflake;
  guildId: Snowflake;
  userId: Snowflake;
  user: APIUser;
  type: MemberType;
  nickname: string | null;
  avatarUrl: string | null;
  avatarAnimatedUrl: string | null;
  bannerUrl: string | null;
  bannerAnimatedUrl: string | null;
  bio: string | null;
  bioEmojis: Array<{ id: Snowflake; name: string; animated: boolean; url: string }>;
  nameStyle: APIMemberNameStyle | null;
  profileFont: string | null;
  profileTheme: string[] | null;
  roleIds: Snowflake[];
  joinedAt: ISODate;
  timeoutUntil: ISODate | null;
  deaf: boolean;
  mute: boolean;
  pending: boolean;
  boostingSince: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface APIMemberPage extends Page<APIMember> {}

/** Corpo de `PATCH /guilds/{guildId}/members/{userId}` (todos os campos opcionais). */
export interface APIMemberEditBody {
  /** `null` limpa o apelido. */
  nickname?: string | null;
  /** **Substitui** o conjunto de cargos. */
  roleIds?: Snowflake[];
  /** Data futura aplica timeout; `null` retira. */
  timeoutUntil?: ISODate | null;
  deaf?: boolean;
  mute?: boolean;
}

export interface APIMemberKickBody {
  reason?: string | null;
}

export interface APIMemberBanBody {
  reason?: string | null;
  /** Quanto do histórico recente apagar, em segundos (até 7 dias). */
  deleteMessageSeconds?: number;
}

/** Um banimento. */
export interface APIMemberBan {
  id: Snowflake;
  guildId: Snowflake;
  userId: Snowflake;
  moderatorId: Snowflake;
  byPlatform: boolean;
  reason: string | null;
  createdAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Mensagens                                                           */
/* ------------------------------------------------------------------ */

export type MessageType =
  | "DEFAULT"
  | "REPLY"
  | "POLL"
  | "SYSTEM_MEMBER_JOIN"
  | "SYSTEM_MEMBER_LEAVE"
  | "SYSTEM_CHANNEL_PINNED"
  | "SYSTEM_CALL_STARTED"
  | "SYSTEM_GROUP_CREATED"
  | "SYSTEM_MEMBER_ADDED"
  | "SYSTEM_MEMBER_REMOVED"
  | "SYSTEM_GROUP_LEFT"
  | "SYSTEM_CHANNEL_FOLLOWED"
  | "SYSTEM_GUILD_BOOST"
  | "SYSTEM_THREAD_CREATED"
  | "SYSTEM_AUTOMOD_ALERT";

export type AttachmentScanStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "CLEAN"
  | "INFECTED"
  | "FAILED"
  | "EXPLICIT";

/** Arquivo anexado a uma mensagem. Para enviar, veja {@link APIUpload}. */
export interface APIAttachment {
  id: Snowflake;
  kind: string;
  source: "UPLOAD" | "KLIPY";
  providerId: string | null;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  placeholder: string | null;
  scanStatus: AttachmentScanStatus;
}

/** Embed como é **lido**. O que se envia usa {@link APIEmbedInput}. */
export interface APIEmbed {
  type: "RICH" | "LINK" | "IMAGE" | "VIDEO";
  url: string | null;
  title: string | null;
  description: string | null;
  siteName: string | null;
  thumbnailUrl: string | null;
  color: string | null;
  author: { name: string; url?: string | null; iconUrl?: string | null } | null;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  image: { url: string } | null;
  footer: { text: string; iconUrl?: string | null } | null;
  timestamp: ISODate | null;
  video: { url: string } | null;
}

/** Embed que se **envia** (formato aceito pelo Squord). */
export interface APIEmbedInput {
  title?: string | null;
  description?: string | null;
  /** Só `http://` ou `https://`. */
  url?: string | null;
  /** Inteiro de 0 a 16777215, ou `#rrggbb`. */
  color?: number | string | null;
  /** ISO 8601 com fuso. */
  timestamp?: string | null;
  author?: { name: string; url?: string | null; /** snake_case na API. */ icon_url?: string | null } | null;
  footer?: { text: string; icon_url?: string | null } | null;
  image?: { url: string } | null;
  thumbnail?: { url: string } | null;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface APIReaction {
  /** Emoji Unicode, ou `<:nome:id>` / `<a:nome:id>` para um personalizado. */
  emoji: string;
  count: number;
  userIds: Snowflake[];
  me: boolean;
}

export interface APIMessageEmoji {
  id: Snowflake;
  name: string;
  animated: boolean;
  url: string;
}

export interface APIMessageMentions {
  userIds: Snowflake[];
  roleIds: Snowflake[];
  channelIds: Snowflake[];
  everyone: boolean;
}

export interface APIMessageInteractionMeta {
  id: Snowflake;
  type: string;
  name: string | null;
  userId: Snowflake;
}

export interface APIStickerItem {
  id: Snowflake;
  guildId: Snowflake;
  name: string;
  format: string;
  url: string;
}

/** A mensagem citada em uma resposta. */
export interface APIMessageReplyTo {
  id: Snowflake;
  authorId: Snowflake;
  author: APIUser;
  content: string;
  deleted: boolean;
  moderated: boolean;
  preview?: Record<string, unknown>;
}

/** Uma mensagem com o autor. */
export interface APIMessage {
  id: Snowflake;
  /** `null` em mensagem direta (bots não acessam DMs). */
  guildId: Snowflake | null;
  channelId: Snowflake;
  authorId: Snowflake;
  type: MessageType;
  content: string;
  replyToId: Snowflake | null;
  attachments: APIAttachment[];
  embeds: APIEmbed[];
  components: APIComponentRow[];
  interaction: APIMessageInteractionMeta | null;
  mentions: APIMessageMentions;
  reactions: APIReaction[];
  pinned: boolean;
  editedAt: ISODate | null;
  deletedAt: ISODate | null;
  moderated: boolean;
  nonce: Nonce | null;
  call: Record<string, unknown> | null;
  poll: Record<string, unknown> | null;
  forward: Record<string, unknown> | null;
  relay: Record<string, unknown> | null;
  relayedCount: number | null;
  stickers: APIStickerItem[];
  emojis: APIMessageEmoji[];
  thread: Record<string, unknown> | null;
  automod: Record<string, unknown> | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  author: APIUser;
  memberNickname: string | null;
  memberAvatarUrl: string | null;
  memberNameStyle: APIMemberNameStyle | null;
  replyTo: APIMessageReplyTo | null;
}

export interface APIMessagePage extends Page<APIMessage> {}

/** Corpo de criar mensagem. Ao menos um entre `content`, `embeds`, `components` e `attachmentIds`. */
export interface APIMessageCreateBody {
  content?: string;
  embeds?: APIEmbedInput[];
  components?: APIComponentRow[];
  allowedMentions?: AllowedMentions;
  replyToId?: Snowflake | null;
  attachmentIds?: Snowflake[];
  /** Chave de idempotência (até 64 caracteres): repetir devolve a original. */
  nonce?: Nonce | null;
}

/** Corpo de editar mensagem. `embeds`/`components` substituem a lista inteira. */
export interface APIMessageEditBody {
  content?: string;
  embeds?: APIEmbedInput[];
  components?: APIComponentRow[];
  allowedMentions?: AllowedMentions;
}

export interface APIMessageListParams extends CursorPaginationParams {}

/* ------------------------------------------------------------------ */
/* Componentes (botões e menus)                                         */
/* ------------------------------------------------------------------ */

export type ButtonStyle = "primary" | "secondary" | "danger" | "link";

export interface APIButton {
  type: "button";
  style: ButtonStyle;
  label: string;
  customId?: string;
  url?: string;
  disabled?: boolean;
}

export interface APISelectOption {
  label: string;
  value: string;
  description?: string;
}

export interface APISelectMenu {
  type: "select";
  customId: string;
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
  options: APISelectOption[];
}

/** Uma linha de componentes: 1 a 5 botões **ou** exatamente 1 menu. */
export interface APIComponentRow {
  type: "row";
  components: Array<APIButton | APISelectMenu>;
}

/* ------------------------------------------------------------------ */
/* Comandos de aplicação (slash)                                       */
/* ------------------------------------------------------------------ */

export type CommandOptionType = "STRING" | "INTEGER" | "BOOLEAN" | "USER" | "CHANNEL" | "ROLE";

export interface APICommandOptionChoice {
  name: string;
  value: string | number;
}

/** Uma opção na **definição** de um comando. */
export interface APICommandOptionInput {
  type: CommandOptionType;
  /** Letras minúsculas, números, `_` e `-` (até 32 caracteres). */
  name: string;
  description: string;
  required?: boolean;
  choices?: APICommandOptionChoice[];
}

/** Uma opção no objeto comando devolvido pela API. */
export interface APICommandOption extends APICommandOptionInput {
  required: boolean;
}

/** Um comando de barra registrado por um bot. */
export interface APICommand {
  id: Snowflake;
  botId: Snowflake;
  guildId: Snowflake | null;
  name: string;
  description: string;
  options: APICommandOption[];
  updatedAt: ISODate;
}

/** Um comando no corpo do `PUT` em bloco. */
export interface APICommandInput {
  name: string;
  description: string;
  options?: APICommandOptionInput[];
}

/* ------------------------------------------------------------------ */
/* Interações                                                          */
/* ------------------------------------------------------------------ */

export type InteractionType = "COMMAND" | "COMPONENT";

export type InteractionCallbackType = "MESSAGE" | "DEFERRED" | "UPDATE" | "DEFERRED_UPDATE";

/** Dados de um comando invocado: as opções já validadas pelo Squord. */
export interface APIInteractionCommandData {
  id: Snowflake;
  name: string;
  options: Array<{
    name: string;
    type: CommandOptionType;
    value: string | number | boolean;
  }>;
}

/** Dados de um clique/uso de componente. */
export interface APIInteractionComponentData {
  messageId: Snowflake;
  customId: string;
  type: "button" | "select";
  /** Valores escolhidos em um menu; vazio em um botão. */
  values: string[];
}

/** O `d` do evento `interaction.created`. Nenhuma rota REST devolve este objeto. */
export interface APIInteraction {
  id: Snowflake;
  /** Credencial da interação, válida por 15 minutos. Trate como segredo. */
  token: string;
  type: InteractionType;
  guildId: Snowflake;
  channelId: Snowflake;
  user: APIUser;
  member: APIMember | null;
  command?: APIInteractionCommandData;
  component?: APIInteractionComponentData;
  createdAt: ISODate;
}

/** Dados da resposta de uma interação ou follow-up. */
export interface APIInteractionReplyData {
  content?: string;
  embeds?: APIEmbedInput[];
  components?: APIComponentRow[];
  allowedMentions?: AllowedMentions;
  /** Só a pessoa que invocou vê. Não é salva; só aceita botões de link. */
  ephemeral?: boolean;
}

export interface APIInteractionCallbackBody {
  type: InteractionCallbackType;
  data?: APIInteractionReplyData;
}

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

/** Estado de um upload. */
export type UploadStatus = "PENDING" | "READY" | "ATTACHED";

/** Um upload reservado/confirmado. */
export interface APIUpload {
  id: Snowflake;
  scope: string;
  filename: string;
  contentType: string;
  size: number;
  status: UploadStatus;
  url: string | null;
  thumbnailUrl: string | null;
  guildId: Snowflake | null;
  storageKey: string;
  scanStatus: AttachmentScanStatus;
  animated: boolean;
  animatedUrl: string | null;
  createdAt: ISODate;
  expiresAt: ISODate;
}

/** Alvo do `PUT` dos bytes, devolvido só na reserva. */
export interface APIUploadTarget {
  uploadUrl: string;
  method: "PUT";
  /** Cabeçalhos que o `PUT` precisa repetir exatamente. */
  headers: Record<string, string>;
  storageKey: string;
  publicUrl: string;
  expiresAt: ISODate;
}

export interface APIUploadReservation {
  upload: APIUpload;
  target: APIUploadTarget;
}

export interface APIUploadCreateBody {
  /** Para bots, sempre `attachments`. */
  scope: string;
  filename: string;
  contentType: string;
  size: number;
  guildId: Snowflake | null;
}

/** Corpo da confirmação de upload. Pode ser `{}`. */
export interface APIUploadConfirmBody {
  crop?: { left: number; top: number; width: number; height: number } | null;
  placeholder?: string | null;
}

/* ------------------------------------------------------------------ */
/* Erros                                                              */
/* ------------------------------------------------------------------ */

/** Envelope de todo erro da API. Decida pelo `code`, nunca pela `message`. */
export interface APIErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

/** Item de validação de um `422 VALIDATION_FAILED`. */
export interface APIValidationIssue {
  path: string;
  code: string;
  message: string;
  params?: Record<string, unknown>;
}

/** Detalhes de um `429 RATE_LIMITED`. */
export interface APIRateLimitDetails {
  bucket: string;
  /** Segundos de espera (mínimo 1). Existe em toda recusa. */
  retryAfter: number;
}

/* ------------------------------------------------------------------ */
/* Menções (formatação de conteúdo)                                    */
/* ------------------------------------------------------------------ */

/** Menção de pessoa: `<@ID>`. */
export function userMention(id: Snowflake): string {
  return `<@${id}>`;
}

/** Menção de cargo: `<@&ID>`. */
export function roleMention(id: Snowflake): string {
  return `<@&${id}>`;
}

/** Menção de canal: `<#ID>`. */
export function channelMention(id: Snowflake): string {
  return `<#${id}>`;
}
