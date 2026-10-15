/**
 * Estruturas de usuário, membro, cargo e Space.
 */

import type {
  APIMember,
  APIRole,
  APIUser,
  APIGuild,
} from "../types/api";
import type { ISODate, Snowflake } from "../types/common";
import { hasPermissions, parsePermissions } from "../permissions";
import { UserFlags } from "../types/api";
import { Structure } from "./base";
import type { ClientLike } from "./base";
import { Channel } from "./Channel";

/** Conta de usuário (pessoa ou bot). */
export class User extends Structure {
  constructor(client: ClientLike, raw: APIUser) {
    super(client, raw as unknown as Record<string, unknown>);
  }

  get data(): APIUser {
    return this.raw as unknown as APIUser;
  }

  get id(): Snowflake {
    return this.data.id;
  }
  get username(): string {
    return this.data.username;
  }
  get displayName(): string {
    return this.data.displayName;
  }
  get avatarUrl(): string | null {
    return this.data.avatarUrl;
  }
  /** `true` para contas de bot (flag `BOT`). */
  get isBot(): boolean {
    return (this.data.flags & UserFlags.BOT) !== 0;
  }
  /** `true` para bots verificados pelo Squord. */
  get isVerifiedBot(): boolean {
    return (this.data.flags & UserFlags.VERIFIED_BOT) !== 0;
  }
  get deleted(): boolean {
    return this.data.deleted;
  }
  get suspended(): boolean {
    return this.data.suspended;
  }

  /** Menção `<@id>` para usar no conteúdo de mensagens. */
  get mention(): string {
    return `<@${this.id}>`;
  }

  /** Busca o membro correspondente em um Space. */
  member(guildId: Snowflake): Promise<Member | null> {
    return this.client.members
      .fetch(guildId, this.id)
      .then((m) => new Member(this.client, m))
      .catch(() => null);
  }
}

/** Perfil de um usuário dentro de um Space. */
export class Member extends Structure {
  constructor(client: ClientLike, raw: APIMember) {
    super(client, raw as unknown as Record<string, unknown>);
  }

  get data(): APIMember {
    return this.raw as unknown as APIMember;
  }

  /** Id da participação (não confundir com o id da conta). */
  get id(): Snowflake {
    return this.data.id;
  }
  get guildId(): Snowflake {
    return this.data.guildId;
  }
  get userId(): Snowflake {
    return this.data.userId;
  }
  get user(): User {
    return new User(this.client, this.data.user);
  }
  get nickname(): string | null {
    return this.data.nickname;
  }
  /** Nome de exibição efetivo: apelido no Space ou `displayName`. */
  get displayName(): string {
    return this.data.nickname ?? this.data.user.displayName;
  }
  get roleIds(): Snowflake[] {
    return this.data.roleIds;
  }
  get joinedAt(): ISODate {
    return this.data.joinedAt;
  }
  /** `null` ou data futura: enquanto futura, o membro está de castigo. */
  get timeoutUntil(): ISODate | null {
    return this.data.timeoutUntil;
  }
  get isTimedOut(): boolean {
    return this.timeoutUntil !== null && Date.parse(this.timeoutUntil) > Date.now();
  }
  get isBot(): boolean {
    return this.data.type === "BOT";
  }
  get mention(): string {
    return `<@${this.userId}>`;
  }

  /** Menciona o cargo do membro? Cargos não mencionáveis não notificam. */
  get mentionNicknameOnly(): string {
    return `<@!${this.userId}>`;
  }

  /** Recarrega o membro da API. */
  fetch(): Promise<Member> {
    return this.client.members
      .fetch(this.guildId, this.userId)
      .then((m) => new Member(this.client, m));
  }

  /** Lista os cargos do membro no Space. */
  fetchRoles(): Promise<Role[]> {
    return this.client.roles
      .list(this.guildId)
      .then((roles) =>
        roles
          .filter((r) => this.roleIds.includes(r.id) || r.id === this.guildId)
          .map((r) => new Role(this.client, r)),
      );
  }

  /** Dá um cargo ao membro (respeita hierarquia; cargos gerenciados dão `400 ROLE_MANAGED`). */
  addRole(roleId: Snowflake): Promise<void> {
    return this.client.members.addRole(this.guildId, this.userId, roleId);
  }

  /** Tira um cargo do membro. */
  removeRole(roleId: Snowflake): Promise<void> {
    return this.client.members.removeRole(this.guildId, this.userId, roleId);
  }

  /** Muda o apelido (`MANAGE_NICKNAMES`, ou `CHANGE_NICKNAME` em si mesmo). */
  setNickname(nickname: string | null): Promise<Member> {
    return this.client.members
      .edit(this.guildId, this.userId, { nickname })
      .then((m) => new Member(this.client, m));
  }

  /** Aplica timeout até uma data (`TIMEOUT_MEMBERS`). */
  timeout(until: ISODate | Date): Promise<Member> {
    const iso = until instanceof Date ? until.toISOString() : until;
    return this.client.members
      .edit(this.guildId, this.userId, { timeoutUntil: iso })
      .then((m) => new Member(this.client, m));
  }

  /** Remove o timeout. */
  removeTimeout(): Promise<Member> {
    return this.client.members
      .edit(this.guildId, this.userId, { timeoutUntil: null })
      .then((m) => new Member(this.client, m));
  }

  /** Expulsa o membro (`KICK_MEMBERS`). Ele pode voltar com novo convite. */
  kick(reason?: string): Promise<void> {
    return this.client.members.kick(this.guildId, this.userId, reason);
  }

  /** Bane o membro (`BAN_MEMBERS`). */
  ban(options: { reason?: string; deleteMessageSeconds?: number } = {}): Promise<void> {
    return this.client.moderation
      .ban(this.guildId, this.userId, options)
      .then(() => undefined);
  }
}

/** Um cargo do Space. */
export class Role extends Structure {
  constructor(client: ClientLike, raw: APIRole) {
    super(client, raw as unknown as Record<string, unknown>);
  }

  get data(): APIRole {
    return this.raw as unknown as APIRole;
  }

  get id(): Snowflake {
    return this.data.id;
  }
  get guildId(): Snowflake {
    return this.data.guildId;
  }
  get name(): string {
    return this.data.name;
  }
  get color(): string | null {
    return this.data.color;
  }
  get position(): number {
    return this.data.position;
  }
  /** Bits como `BigInt` (permissões trafegam como string decimal). */
  get permissions(): bigint {
    return parsePermissions(this.data.permissions);
  }
  /** Testa se o cargo concede um conjunto de permissões. */
  has(...flags: bigint[]): boolean {
    return hasPermissions(this.permissions, ...flags);
  }
  get managed(): boolean {
    return this.data.managed;
  }
  get managedKind(): string | null {
    return this.data.managedKind;
  }
  get mentionable(): boolean {
    return this.data.mentionable;
  }
  /** Menção `<@&id>`; só notifica se o cargo for mencionável. */
  get mention(): string {
    return `<@&${this.id}>`;
  }
  /** `true` para o cargo @everyone (o id é o próprio id do Space). */
  get isEveryone(): boolean {
    return this.id === this.guildId;
  }
}

/** Um Space (comunidade). */
export class Guild extends Structure {
  constructor(client: ClientLike, raw: APIGuild) {
    super(client, raw as unknown as Record<string, unknown>);
  }

  get data(): APIGuild {
    return this.raw as unknown as APIGuild;
  }

  get id(): Snowflake {
    return this.data.id;
  }
  get name(): string {
    return this.data.name;
  }
  get slug(): string {
    return this.data.slug;
  }
  get ownerId(): Snowflake {
    return this.data.ownerId;
  }
  get memberCount(): number {
    return this.data.memberCount;
  }
  get iconUrl(): string | null {
    return this.data.iconUrl;
  }
  get boostCount(): number {
    return this.data.boostCount;
  }

  /** O bot neste Space: id de participação, cargos e permissões no nível do Space. */
  get self(): { memberId: Snowflake; roleIds: Snowflake[]; permissions: bigint; isOwner: boolean } {
    const self = this.data.self;
    return {
      memberId: self.memberId,
      roleIds: self.roleIds,
      permissions: parsePermissions(self.permissions),
      isOwner: self.isOwner,
    };
  }

  /** Testa permissões do bot no nível do Space (overwrites de canal à parte). */
  botHas(...flags: bigint[]): boolean {
    return hasPermissions(this.self.permissions, ...flags);
  }

  /** Recarrega o Space. */
  fetch(): Promise<Guild> {
    return this.client.guilds
      .fetch(this.id)
      .then((g) => new Guild(this.client, g));
  }

  /** Árvore de canais do Space, agrupada por categorias. */
  fetchChannelTree(): Promise<ChannelTreeGroup[]> {
    return this.client.channels
      .fetchTree(this.id)
      .then((nodes) =>
        nodes.map((node) => ({
          category: node.category ? new Channel(this.client, node.category) : null,
          channels: node.channels.map((c) => new Channel(this.client, c)),
        })),
      );
  }

  /** Lista os cargos do Space. */
  fetchRoles(): Promise<Role[]> {
    return this.client.roles
      .list(this.id)
      .then((roles) => roles.map((r) => new Role(this.client, r)));
  }

  /** Busca um membro pelo id da conta. */
  fetchMember(userId: Snowflake): Promise<Member> {
    return this.client.members
      .fetch(this.id, userId)
      .then((m) => new Member(this.client, m));
  }
}

/** Grupo da árvore de canais (categoria e seus canais). */
export interface ChannelTreeGroup {
  category: Channel | null;
  channels: Channel[];
}
