/**
 * Estrutura de interação: um comando de barra usado ou um clique em
 * componente de mensagem do bot.
 *
 * O bot responde em até ~10 segundos (o app avisa "não respondeu" depois
 * disso); use `defer()` e follow-ups para trabalho demorado. A janela total
 * de resposta é de 15 minutos, e o limite é de 5 respostas a cada 5 segundos
 * por interação.
 */

import type {
  APIInteraction,
  APIInteractionCommandData,
  APIInteractionComponentData,
  CommandOptionType,
  Snowflake,
} from "../types/api";
import type { MessagePayloadLike } from "../builders/message";
import { Structure } from "./base";
import type { ClientLike } from "./base";
import { Member, User } from "./User";
import { Message } from "./Message";

export class Interaction extends Structure {
  constructor(client: ClientLike, raw: APIInteraction) {
    super(client, raw as unknown as Record<string, unknown>);
  }

  get data(): APIInteraction {
    return this.raw as unknown as APIInteraction;
  }

  get id(): string {
    return this.data.id;
  }
  /** Credencial da interação (15 minutos de validade). Trate como segredo. */
  get token(): string {
    return this.data.token;
  }
  get type(): "COMMAND" | "COMPONENT" {
    return this.data.type;
  }
  get guildId(): Snowflake {
    return this.data.guildId;
  }
  get channelId(): Snowflake {
    return this.data.channelId;
  }
  /** Quem invocou o comando ou clicou no componente. */
  get user(): User {
    return new User(this.client, this.data.user);
  }

  /** O membro que invocou (com cargos do Space), quando disponível. */
  get member(): Member | null {
    return this.data.member ? new Member(this.client, this.data.member) : null;
  }

  get createdAt(): string {
    return this.data.createdAt;
  }

  get isCommand(): boolean {
    return this.data.type === "COMMAND" && this.data.command !== undefined;
  }
  get isComponent(): boolean {
    return this.data.type === "COMPONENT" && this.data.component !== undefined;
  }

  /** Dados do comando (presentes quando `isCommand`). */
  get command(): APIInteractionCommandData | null {
    return this.data.command ?? null;
  }

  /** Dados do componente (presentes quando `isComponent`). */
  get component(): APIInteractionComponentData | null {
    return this.data.component ?? null;
  }

  /** O `customId` do componente clicado (ou `null`). */
  get customId(): string | null {
    return this.component?.customId ?? null;
  }

  /** Os valores escolhidos em um menu (vazio em botões). */
  get values(): string[] {
    return this.component?.values ?? [];
  }

  // ------------------------------------------------------------------
  // Acesso às opções do comando
  // ------------------------------------------------------------------

  /** Lista as opções preenchidas da invocação (já validadas pelo Squord). */
  get options(): Array<{ name: string; type: CommandOptionType; value: string | number | boolean }> {
    return this.command?.options ?? [];
  }

  /** Valor bruto de uma opção pelo nome. */
  getOption(name: string): string | number | boolean | undefined {
    return this.options.find((option) => option.name === name)?.value;
  }

  /** Opção `STRING`. */
  getString(name: string, required = false): string | undefined {
    const value = this.getOption(name);
    if (typeof value === "string") return value;
    if (required) throw new Error(`A opção obrigatória "${name}" não veio como STRING`);
    return undefined;
  }

  /** Opção `INTEGER`. */
  getInteger(name: string, required = false): number | undefined {
    const value = this.getOption(name);
    if (typeof value === "number") return value;
    if (required) throw new Error(`A opção obrigatória "${name}" não veio como INTEGER`);
    return undefined;
  }

  /** Opção `BOOLEAN`. */
  getBoolean(name: string, required = false): boolean | undefined {
    const value = this.getOption(name);
    if (typeof value === "boolean") return value;
    if (required) throw new Error(`A opção obrigatória "${name}" não veio como BOOLEAN`);
    return undefined;
  }

  /** Opção `USER`/`CHANNEL`/`ROLE`: o valor é o id (string). */
  getId(name: string, required = false): Snowflake | undefined {
    const value = this.getOption(name);
    if (typeof value === "string") return value;
    if (required) throw new Error(`A opção obrigatória "${name}" não veio como USER/CHANNEL/ROLE`);
    return undefined;
  }

  // ------------------------------------------------------------------
  // Respostas
  // ------------------------------------------------------------------

  /** Primeira resposta como mensagem. `ephemeral: true` mostra só para quem invocou. */
  reply(
    payload: MessagePayloadLike,
    options: { ephemeral?: boolean; signal?: AbortSignal } = {},
  ): Promise<void> {
    return this.client.interactions.reply(this.id, this.token, payload, options);
  }

  /** Resposta efêmera: só quem invocou vê; não é salva; só botões de link. */
  replyEphemeral(payload: MessagePayloadLike, options?: { signal?: AbortSignal }): Promise<void> {
    return this.client.interactions.reply(this.id, this.token, payload, {
      ...options,
      ephemeral: true,
    });
  }

  /** `DEFERRED`: mostra o bot "pensando" enquanto o trabalho roda. */
  defer(options?: { signal?: AbortSignal }): Promise<void> {
    return this.client.interactions.defer(this.id, this.token, options);
  }

  /**
   * `UPDATE` (só componente): edita a mensagem que tinha o componente.
   * O caso típico: marcar a escolha, mudar de página.
   */
  update(payload: MessagePayloadLike, options?: { signal?: AbortSignal }): Promise<void> {
    return this.client.interactions.update(this.id, this.token, payload, options);
  }

  /** `DEFERRED_UPDATE` (só componente): confirma o clique sem mudar nada. */
  acknowledge(options?: { signal?: AbortSignal }): Promise<void> {
    return this.client.interactions.acknowledgeComponent(this.id, this.token, options);
  }

  /**
   * Follow-up: mensagem extra depois da primeira resposta
   * (o padrão para trabalho demorado é `defer()` + follow-up).
   */
  followup(
    payload: MessagePayloadLike,
    options: { ephemeral?: boolean; signal?: AbortSignal } = {},
  ): Promise<void> {
    const source = typeof payload === "string" ? { content: payload } : payload;
    if (options.ephemeral) (source as { ephemeral?: boolean }).ephemeral = true;
    return this.client.interactions.followup(
      this.id,
      this.token,
      source as never,
      options.signal,
    );
  }

  /** Busca a mensagem do componente clicado (quando `isComponent`). */
  fetchComponentMessage(): Promise<Message | null> {
    const messageId = this.component?.messageId;
    if (!messageId) return Promise.resolve(null);
    return this.client.messages
      .fetch(this.channelId, messageId)
      .then((m) => new Message(this.client, m))
      .catch(() => null);
  }
}
