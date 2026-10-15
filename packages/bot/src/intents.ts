/**
 * Intents do gateway.
 *
 * As intents são configuradas por bot (Configurações → Desenvolvedor, ou
 * `PATCH /bots/{bot.id}`) e **não** vão no `identify`: o gateway lê as
 * intents do bot no momento do identify. Este módulo serve para calcular,
 * exibir e comparar valores — por exemplo, ao gerenciar o bot pela API.
 *
 * O padrão de um bot novo é `GUILDS | GUILD_MESSAGES | GUILD_MESSAGE_REACTIONS`
 * (valor `13`).
 *
 * @see https://docs.squord.com.br/gateway/intents
 */

export const Intents = {
  /** Space, canais, cargos, threads, emojis, stickers, eventos do Space. */
  GUILDS: 1 << 0,
  /** Entrada, saída, edição e ban de membros. */
  GUILD_MEMBERS: 1 << 1,
  /** `message.*` e votos de enquete. */
  GUILD_MESSAGES: 1 << 2,
  /** Reações. */
  GUILD_MESSAGE_REACTIONS: 1 << 3,
  /** Estado e salas de voz. */
  GUILD_VOICE_STATES: 1 << 4,
  /**
   * **Privilegiada.** Não liga evento nenhum: devolve o conteúdo das
   * mensagens. Sem ela, `content`, `embeds`, `attachments`, `components`
   * e `poll` chegam esvaziados — exceto mensagens do próprio bot e as que
   * o mencionam.
   */
  MESSAGE_CONTENT: 1 << 5,
} as const;

export type IntentFlag = keyof typeof Intents;

/** Intents padrão de um bot novo. */
export const DEFAULT_INTENTS: number =
  Intents.GUILDS | Intents.GUILD_MESSAGES | Intents.GUILD_MESSAGE_REACTIONS; // 13

/** Soma flags de intent em um número (0 a 65535). */
export function intentsValue(...flags: number[]): number {
  const value = flags.reduce((a, b) => a | b, 0);
  if (value < 0 || value > 65_535) {
    throw new RangeError("As intents somam um inteiro de 0 a 65535");
  }
  return value;
}

/** Lista as flags conhecidas presentes em um valor de intents. */
export function listIntents(value: number): IntentFlag[] {
  const names: IntentFlag[] = [];
  for (const [name, flag] of Object.entries(Intents) as Array<[IntentFlag, number]>) {
    if ((value & flag) === flag) names.push(name);
  }
  return names;
}
