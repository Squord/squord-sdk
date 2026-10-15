/**
 * Fixtures: payloads de exemplo no formato real da API, para testes de bots
 * e de handlers sem uma comunidade de verdade.
 */

import type {
  APIChannel,
  APIGuild,
  APIInteraction,
  APIMember,
  APIMessage,
  APIRole,
  APIUser,
  APICommand,
} from "../types/api";

/** Um usuário (Ana, dos exemplos da documentação). */
export function user(overrides: Partial<APIUser> = {}): APIUser {
  return {
    id: "1300000000000000020",
    username: "ana",
    displayName: "Ana",
    avatarUrl: null,
    avatarAnimatedUrl: null,
    nameStyle: null,
    flags: 0,
    deleted: false,
    suspended: false,
    premium: false,
    ...overrides,
  };
}

/** A conta do bot. */
export function botUser(overrides: Partial<APIUser> = {}): APIUser {
  return user({
    id: "1300000000000000010",
    username: "bot~meubot",
    displayName: "Meu Bot",
    flags: 32, // BOT
    ...overrides,
  });
}

/** Um membro de um Space. */
export function member(overrides: Partial<APIMember> = {}): APIMember {
  return {
    id: "1300000000000000011",
    guildId: "1300000000000000001",
    userId: "1300000000000000020",
    user: user(),
    type: "INTERNAL",
    nickname: null,
    avatarUrl: null,
    avatarAnimatedUrl: null,
    bannerUrl: null,
    bannerAnimatedUrl: null,
    bio: null,
    bioEmojis: [],
    nameStyle: null,
    profileFont: null,
    profileTheme: null,
    roleIds: [],
    joinedAt: "2026-10-01T10:00:00.000Z",
    timeoutUntil: null,
    deaf: false,
    mute: false,
    pending: false,
    boostingSince: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

/** Um canal de texto. */
export function channel(overrides: Partial<APIChannel> = {}): APIChannel {
  return {
    id: "1300000000000000040",
    guildId: "1300000000000000001",
    categoryId: null,
    name: "geral",
    type: "TEXT",
    position: 0,
    topic: null,
    topicUpdatedAt: null,
    topicUpdatedById: null,
    isPrivate: false,
    rateLimitPerUser: 0,
    bitrate: null,
    userLimit: null,
    chatEnabled: true,
    lastMessageId: null,
    overwrites: [],
    availableTags: [],
    requireTag: false,
    defaultAutoArchiveMinutes: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

/** Um cargo. */
export function role(overrides: Partial<APIRole> = {}): APIRole {
  return {
    id: "1300000000000000001",
    guildId: "1300000000000000001",
    name: "@everyone",
    color: null,
    position: 0,
    permissions: "1685839112193",
    hoist: false,
    mentionable: false,
    managed: false,
    managedKind: null,
    botId: null,
    icon: null,
    selfAssignable: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

/** Um Space com o bloco `self` do bot. */
export function guild(overrides: Partial<APIGuild> = {}): APIGuild {
  return {
    id: "1300000000000000001",
    ownerId: "1300000000000000009",
    name: "Meu Space",
    slug: "meu-space",
    description: null,
    iconUrl: null,
    iconAnimatedUrl: null,
    bannerUrl: null,
    bannerAnimatedUrl: null,
    bannerPlaceholder: null,
    defaultChannelId: "1300000000000000040",
    systemChannelId: null,
    visibility: "PUBLIC",
    verificationLevel: "NONE",
    accessMode: "LINK",
    requireVerifiedEmail: false,
    requireTwoFactor: false,
    moderationMfaRequired: false,
    joinRequestRoleIds: [],
    requireJoinMessage: false,
    joinRequestRetryDays: 0,
    memberCount: 2,
    flags: 0,
    planId: "free",
    vanityLapsesAt: null,
    vanityInvite: false,
    boostCount: 0,
    boostLevel: 0,
    boostMessages: false,
    discoveryCategory: null,
    locale: null,
    rules: [],
    rulesUpdatedAt: null,
    discoverable: false,
    discoverableSince: null,
    minAccountAgeDays: 0,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    self: {
      memberId: "1300000000000000012",
      roleIds: ["1300000000000000031"],
      permissions: "155649",
      isOwner: false,
    },
    ...overrides,
  };
}

/** Uma mensagem. */
export function message(overrides: Partial<APIMessage> = {}): APIMessage {
  return {
    id: "1300000000000000100",
    guildId: "1300000000000000001",
    channelId: "1300000000000000040",
    authorId: "1300000000000000020",
    type: "DEFAULT",
    content: "Olá!",
    replyToId: null,
    attachments: [],
    embeds: [],
    components: [],
    interaction: null,
    mentions: { userIds: [], roleIds: [], channelIds: [], everyone: false },
    reactions: [],
    pinned: false,
    editedAt: null,
    deletedAt: null,
    moderated: false,
    nonce: null,
    call: null,
    poll: null,
    forward: null,
    relay: null,
    relayedCount: null,
    stickers: [],
    emojis: [],
    thread: null,
    automod: null,
    createdAt: "2026-10-05T14:30:00.000Z",
    updatedAt: "2026-10-05T14:30:00.000Z",
    author: user(),
    memberNickname: null,
    memberAvatarUrl: null,
    memberNameStyle: null,
    replyTo: null,
    ...overrides,
  };
}

/** Uma interação de comando (`interaction.created` com `type: "COMMAND"`). */
export function commandInteraction(overrides: Partial<APIInteraction> = {}): APIInteraction {
  return {
    id: "1300000000000000400",
    token: "tk_9f2c1d7e8a4b",
    type: "COMMAND",
    guildId: "1300000000000000001",
    channelId: "1300000000000000040",
    user: user(),
    member: member(),
    command: {
      id: "1300000000000000500",
      name: "ping",
      options: [],
    },
    createdAt: "2026-10-05T14:40:00.000Z",
    ...overrides,
  };
}

/** Uma interação de componente (`type: "COMPONENT"`). */
export function componentInteraction(overrides: Partial<APIInteraction> = {}): APIInteraction {
  return {
    id: "1300000000000000401",
    token: "tk_1b3d5f7a9c2e",
    type: "COMPONENT",
    guildId: "1300000000000000001",
    channelId: "1300000000000000040",
    user: user(),
    member: member(),
    component: {
      messageId: "1300000000000000100",
      customId: "confirmar",
      type: "button",
      values: [],
    },
    createdAt: "2026-10-05T14:41:00.000Z",
    ...overrides,
  };
}

/** Um comando de aplicação registrado. */
export function command(overrides: Partial<APICommand> = {}): APICommand {
  return {
    id: "1300000000000000500",
    botId: "1300000000000000010",
    guildId: null,
    name: "ping",
    description: "Verifica a latência do bot",
    options: [],
    updatedAt: "2026-10-05T14:00:00.000Z",
    ...overrides,
  };
}

/** Um bot (visão do dono, `GET /bots/@me`). */
export function bot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "1300000000000000010",
    user: botUser(),
    description: "Bot de exemplo",
    ownerUsername: "ana",
    public: false,
    verified: false,
    installCount: 1,
    termsUrl: null,
    privacyUrl: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    intents: 13,
    ...overrides,
  };
}
