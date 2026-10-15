/**
 * Permissões do Squord.
 *
 * Permissões são bits de um número inteiro de 64 bits. Trafegam como
 * **string decimal** e devem ser calculadas com `BigInt`: os bits mais
 * altos passam de 2^53, e um `number` de JavaScript perde precisão.
 *
 * @see https://docs.squord.com.br/referencia/permissoes
 */

import type { APIChannelOverwrite, PermissionBits } from "./types/api";
import type { Snowflake } from "./types/common";

/** Flags de permissão. O bit 32 (`VIEW_AUDIT_LOG`) está na tabela oficial. */
export const Permissions = {
  VIEW_CHANNEL: 1n << 0n,
  MANAGE_CHANNELS: 1n << 1n,
  MANAGE_GUILD: 1n << 2n,
  MANAGE_ROLES: 1n << 3n,
  MANAGE_INVITES: 1n << 4n,
  VIEW_AUDIT_LOG: 1n << 5n,
  MANAGE_EMOJIS: 1n << 6n,
  MANAGE_WEBHOOKS: 1n << 7n,
  KICK_MEMBERS: 1n << 8n,
  BAN_MEMBERS: 1n << 9n,
  TIMEOUT_MEMBERS: 1n << 10n,
  CHANGE_NICKNAME: 1n << 11n,
  MANAGE_NICKNAMES: 1n << 12n,
  SEND_MESSAGES: 1n << 13n,
  READ_MESSAGE_HISTORY: 1n << 14n,
  MANAGE_MESSAGES: 1n << 15n,
  ATTACH_FILES: 1n << 16n,
  EMBED_LINKS: 1n << 17n,
  ADD_REACTIONS: 1n << 18n,
  MENTION_EVERYONE: 1n << 19n,
  USE_EXTERNAL_EMOJIS: 1n << 20n,
  PIN_MESSAGES: 1n << 21n,
  CONNECT: 1n << 22n,
  SPEAK: 1n << 23n,
  VIDEO: 1n << 24n,
  STREAM: 1n << 25n,
  MUTE_MEMBERS: 1n << 26n,
  DEAFEN_MEMBERS: 1n << 27n,
  MOVE_MEMBERS: 1n << 28n,
  PRIORITY_SPEAKER: 1n << 29n,
  ADMINISTRATOR: 1n << 30n,
  SEND_POLLS: 1n << 31n,
  /** O bit 32 foi aposentado e nunca é reutilizado. */
  CREATE_INVITE: 1n << 33n,
  APPROVE_JOIN_REQUESTS: 1n << 34n,
  FORWARD_MESSAGES: 1n << 35n,
  HANDLE_REPORTS: 1n << 36n,
  PUBLISH_ANNOUNCEMENTS: 1n << 37n,
  BYPASS_SLOWMODE: 1n << 38n,
  CREATE_THREADS: 1n << 39n,
  SEND_MESSAGES_IN_THREADS: 1n << 40n,
  MANAGE_THREADS: 1n << 41n,
  MANAGE_EVENTS: 1n << 42n,
} as const;

export type PermissionFlag = keyof typeof Permissions;

/** Todas as permissões, somadas. */
export const ALL_PERMISSIONS: bigint = Object.values(Permissions).reduce((a, b) => a | b, 0n);

/** Converte bits para string decimal (o formato aceito pela API). */
export function permissionsToString(bits: bigint): PermissionBits {
  return bits.toString();
}

/** Lê uma string decimal vinda da API como `BigInt`. */
export function parsePermissions(value: PermissionBits | string): bigint {
  return BigInt(value);
}

/** Testa se `bits` inclui todas as permissões em `flags`. */
export function hasPermissions(
  bits: bigint | PermissionBits,
  ...flags: bigint[]
): boolean {
  const b = typeof bits === "string" ? BigInt(bits) : bits;
  return flags.every((flag) => (b & flag) === flag);
}

/** Testa se `bits` inclui pelo menos uma das permissões em `flags`. */
export function hasAnyPermission(
  bits: bigint | PermissionBits,
  ...flags: bigint[]
): boolean {
  const b = typeof bits === "string" ? BigInt(bits) : bits;
  return flags.some((flag) => (b & flag) === flag);
}

/**
 * Resolve as permissões efetivas de um membro em um canal, seguindo o
 * algoritmo oficial: base do @everyone + OR dos cargos; `ADMINISTRATOR`
 * encerra a conta; overwrites (@everyone → cargos → membro); sem
 * `VIEW_CHANNEL`, o resultado é zero.
 *
 * O backend continua sendo a autoridade final: o resultado local é uma
 * conveniência para evitar chamadas, não uma garantia.
 */
export function resolveChannelPermissions(options: {
  /** Permissões do cargo @everyone (o id do cargo é o próprio id do Space). */
  everyonePermissions: bigint;
  /** Permissões dos cargos do membro (sem contar @everyone). */
  rolePermissions: bigint[];
  /** Overwrites do canal (e da categoria, se houver, aplicados antes). */
  overwrites: APIChannelOverwrite[];
  /** Id do membro. */
  memberId: Snowflake;
  /** Id do cargo @everyone (o mesmo id do Space). */
  everyoneRoleId: Snowflake;
  /** Ids dos cargos do membro, sem contar @everyone. */
  memberRoleIds: Snowflake[];
}): bigint {
  let base = options.everyonePermissions;
  for (const role of options.rolePermissions) base |= role;

  if ((base & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) {
    return ALL_PERMISSIONS;
  }

  const apply = (acc: bigint, overwrites: APIChannelOverwrite[]): bigint => {
    const everyone = overwrites.find((o) => o.targetId === options.everyoneRoleId);
    if (everyone) {
      acc &= ~BigInt(everyone.deny);
      acc |= BigInt(everyone.allow);
    }
    const roleOverwrites = overwrites.filter(
      (o) => o.targetType === "ROLE" && options.memberRoleIds.includes(o.targetId),
    );
    const deny = roleOverwrites.reduce((acc2, o) => acc2 | BigInt(o.deny), 0n);
    const allow = roleOverwrites.reduce((acc2, o) => acc2 | BigInt(o.allow), 0n);
    acc &= ~deny;
    acc |= allow;
    const member = overwrites.find((o) => o.targetType === "MEMBER" && o.targetId === options.memberId);
    if (member) {
      acc &= ~BigInt(member.deny);
      acc |= BigInt(member.allow);
    }
    return acc;
  };

  let result = apply(base, options.overwrites);
  if ((result & Permissions.VIEW_CHANNEL) !== Permissions.VIEW_CHANNEL) return 0n;
  return result;
}

/**
 * Escopo mínimo usual para um bot que lê e responde em canais.
 * Útil para gerar o valor do link de instalação.
 */
export const SUGGESTED_TEXT_BOT_PERMISSIONS: bigint =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.READ_MESSAGE_HISTORY |
  Permissions.EMBED_LINKS |
  Permissions.ATTACH_FILES |
  Permissions.ADD_REACTIONS;

/** Escopo de moderação usual (exige confirmação na instalação). */
export const SUGGESTED_MODERATION_PERMISSIONS: bigint =
  Permissions.KICK_MEMBERS |
  Permissions.BAN_MEMBERS |
  Permissions.TIMEOUT_MEMBERS |
  Permissions.MANAGE_MESSAGES;
