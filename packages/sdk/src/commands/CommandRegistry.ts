/**
 * Registro de comandos: texto (com prefixo), slash (comandos de aplicação)
 * e componentes (botões e menus).
 *
 * - **Texto**: o SDK ouve `message.created`, faz o parse do prefixo e dos
 *   argumentos e chama o handler. Suporta aliases, cooldowns e middleware.
 * - **Slash**: handlers para `interaction.created` de comandos. O registro
 *   pode sincronizar as definições com o Squord (`PUT` em bloco) na partida
 *   do bot — registrar é sobrescrever, então a lista deve ser a mesma sempre.
 * - **Componentes**: handlers para cliques em botões e escolhas em menus,
 *   identificados pelo `customId` (aceito prefixo com `*` no final).
 */

import { SquordTypeError } from "../errors";
import type { SquordClient } from "../client/SquordClient";
import type { Interaction } from "../structures/Interaction";
import type { Message } from "../structures/Message";
import type { APICommandInput, APICommandOptionInput, Snowflake } from "../types/api";
import { splitArguments } from "../utils/misc";

// ---------------------------------------------------------------------
// Comandos de texto
// ---------------------------------------------------------------------

export interface TextCommandDefinition {
  /** Nome principal (sem o prefixo). Letras minúsculas recomendadas. */
  name: string;
  /** Nomes alternativos. */
  aliases?: string[];
  /** Descrição usada em mensagens de erro e ajuda. */
  description?: string;
  /** Deixa o comando oculto em listagens de ajuda. */
  hidden?: boolean;
  /** Cooldown por usuário, em ms. Padrão: sem cooldown. */
  cooldownMs?: number;
  /** Caso a mensagem deve ignorar bots (padrão `true`). */
  ignoreBots?: boolean;
  /** Onde o comando vale: em qualquer Space ou em Spaces específicos. */
  guildIds?: Snowflake[];
  /** Middleware antes da execução; devolve `false` para abortar. */
  beforeExecute?: (context: TextCommandContext) => boolean | Promise<boolean>;
  execute: (context: TextCommandContext) => unknown | Promise<unknown>;
}

export interface TextCommandContext {
  /** O cliente do bot. */
  client: SquordClient;
  /** A mensagem que invocou o comando. */
  message: Message;
  /** Nome invocado (pode ser um alias). */
  name: string;
  /** Definição do comando. */
  command: TextCommandDefinition;
  /** Argumentos crus, já com aspas tratadas. */
  args: string[];
  /** A linha de argumentos como veio (sem o nome do comando). */
  rawArgs: string;
  /** Responde no canal (sem citar). */
  reply(payload: string | Parameters<Message["reply"]>[0]): ReturnType<Message["reply"]>;
  /** Responde citando a mensagem original. */
  replyWithMention(payload: string | Parameters<Message["reply"]>[0]): ReturnType<Message["reply"]>;
  /** Reage à mensagem que invocou. */
  react(emoji: string): Promise<void>;
}

// ---------------------------------------------------------------------
// Comandos de aplicação (slash)
// ---------------------------------------------------------------------

export interface SlashCommandDefinition {
  /** Letras minúsculas, números, `_` e `-` (até 32 caracteres). */
  name: string;
  /** Até 100 caracteres. */
  description: string;
  /** Até 25 opções; as obrigatórias vêm antes das opcionais. */
  options?: APICommandOptionInput[];
  /** Onde publicar: `"global"` (padrão) ou Spaces específicos. */
  scope?: { kind: "global" } | { kind: "guild"; guildIds: Snowflake[] };
  execute: (interaction: Interaction) => unknown | Promise<unknown>;
}

// ---------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------

export interface ComponentHandlerDefinition {
  /** `customId` do componente. Terminando em `*`, casa por prefixo. */
  customId: string;
  execute: (interaction: Interaction) => unknown | Promise<unknown>;
}

// ---------------------------------------------------------------------
// Opções do registro
// ---------------------------------------------------------------------

export interface CommandRegistryOptions {
  /** Prefixo dos comandos de texto: string ou função (padrão `"!"`). */
  prefix?: string | ((message: Message) => string | null);
  /**
   * Sincronizar os slash commands com o Squord no login (PUT em bloco,
   * sobrescrevendo o que existir). Padrão: `true` quando houver comandos.
   */
  syncOnLogin?: boolean;
  /** Se `true`, ignora mensagens de bots nos comandos de texto (padrão). */
  ignoreBots?: boolean;
  /** Handler para erros dos comandos (texto e slash). */
  onError?: (error: unknown, context: { command?: string; message?: Message; interaction?: Interaction }) => void;
}

export class CommandRegistry {
  private readonly textCommands = new Map<string, TextCommandDefinition>();
  private readonly slashCommands = new Map<string, SlashCommandDefinition>();
  private readonly componentHandlers = new Map<string, ComponentHandlerDefinition>();
  private readonly cooldowns = new Map<string, number>();
  private readonly prefixResolver: NonNullable<CommandRegistryOptions["prefix"]>;
  private attached = false;

  constructor(
    private readonly client: SquordClient,
    private readonly options: CommandRegistryOptions = {},
  ) {
    this.prefixResolver = options.prefix ?? "!";
  }

  /** Registra um comando de texto. */
  text(definition: TextCommandDefinition): this {
    validateTextDefinition(definition);
    const names = [definition.name, ...(definition.aliases ?? [])];
    for (const name of names) {
      const key = name.toLowerCase();
      if (this.textCommands.has(key)) {
        throw new SquordTypeError(`Comando de texto duplicado: ${name}`);
      }
      this.textCommands.set(key, definition);
    }
    this.ensureAttached();
    return this;
  }

  /** Registra um comando slash. */
  slash(definition: SlashCommandDefinition): this {
    if (!/^[a-z0-9_-]{1,32}$/.test(definition.name)) {
      throw new SquordTypeError(
        `Nome de comando inválido: ${definition.name} (use letras minúsculas, números, _ e -, até 32 caracteres)`,
      );
    }
    if (this.slashCommands.has(definition.name)) {
      throw new SquordTypeError(`Comando slash duplicado: ${definition.name}`);
    }
    this.slashCommands.set(definition.name, definition);
    this.ensureAttached();
    return this;
  }

  /** Registra um handler de componente (botão ou menu). */
  component(definition: ComponentHandlerDefinition): this {
    if (!definition.customId) throw new SquordTypeError("customId é obrigatório");
    if (this.componentHandlers.has(definition.customId)) {
      throw new SquordTypeError(`Handler de componente duplicado: ${definition.customId}`);
    }
    this.componentHandlers.set(definition.customId, definition);
    this.ensureAttached();
    return this;
  }

  /** Remove um handler de componente. */
  removeComponent(customId: string): this {
    this.componentHandlers.delete(customId);
    return this;
  }

  /** Definições slash prontas para o `PUT` em bloco. */
  toCommandsInput(): APICommandInput[] {
    return [...this.slashCommands.values()].map((command) => ({
      name: command.name,
      description: command.description,
      options: command.options ?? [],
    }));
  }

  /**
   * Sincroniza os slash commands com o Squord (PUT em bloco, sobrescrevendo
   * o que existir em cada escopo). Chame após `client.login()` — ou deixe o
   * registro fazer automaticamente no `ready` (`syncOnLogin`, o padrão).
   */
  async sync(): Promise<void> {
    const global: APICommandInput[] = [];
    const guildScope = new Map<Snowflake, APICommandInput[]>();

    for (const command of this.slashCommands.values()) {
      const input: APICommandInput = {
        name: command.name,
        description: command.description,
        options: command.options ?? [],
      };
      const scope = command.scope ?? { kind: "global" as const };
      if (scope.kind === "global") {
        global.push(input);
      } else {
        for (const guildId of scope.guildIds) {
          const list = guildScope.get(guildId) ?? [];
          list.push(input);
          guildScope.set(guildId, list);
        }
      }
    }

    if (global.length > 0) {
      await this.client.commands.setGlobal(global);
    }
    for (const [guildId, commands] of guildScope) {
      await this.client.commands.setGuild(guildId, commands);
    }
  }

  /** Limpa os cooldowns (útil em testes). */
  clearCooldowns(): void {
    this.cooldowns.clear();
  }

  /** Processa manualmente uma mensagem como possível comando de texto (para testes). */
  async handleTextMessage(message: Message): Promise<boolean> {
    const prefix = this.resolvePrefix(message);
    if (prefix === null) return false;

    const content = message.content;
    if (!content.startsWith(prefix)) return false;

    const line = content.slice(prefix.length).trim();
    if (!line) return false;

    const spaceIndex = line.search(/\s/);
    const invokedName = (spaceIndex === -1 ? line : line.slice(0, spaceIndex)).toLowerCase();
    const rawArgs = spaceIndex === -1 ? "" : line.slice(spaceIndex).trim();

    const definition = this.textCommands.get(invokedName);
    if (!definition) return false;

    if (definition.guildIds && !definition.guildIds.includes(message.guildId ?? "")) {
      return false;
    }
    if ((definition.ignoreBots ?? this.options.ignoreBots ?? true) && message.author.isBot) {
      return false;
    }

    // Cooldown
    if (definition.cooldownMs && definition.cooldownMs > 0) {
      const key = `${message.authorId}:${definition.name}`;
      const until = this.cooldowns.get(key) ?? 0;
      const now = Date.now();
      if (until > now) return false;
      this.cooldowns.set(key, now + definition.cooldownMs);
    }

    const args = splitArguments(rawArgs);
    const context: TextCommandContext = {
      client: this.client,
      message,
      name: invokedName,
      command: definition,
      args,
      rawArgs,
      reply: (payload) => message.reply(payload),
      replyWithMention: (payload) => {
        const mention = `<@${message.authorId}>`;
        const body =
          typeof payload === "string" ? { content: `${mention} ${payload}` } : { ...payload };
        if (typeof payload !== "string" && body.content) {
          body.content = `${mention} ${body.content}`;
        }
        return message.reply(body);
      },
      react: (emoji) => message.react(emoji),
    };

    try {
      if (definition.beforeExecute) {
        const allowed = await definition.beforeExecute(context);
        if (allowed === false) return false;
      }
      await definition.execute(context);
    } catch (error) {
      this.reportError(error, { command: definition.name, message });
    }
    return true;
  }

  /** Processa manualmente uma interação (para testes). */
  async handleInteraction(interaction: Interaction): Promise<boolean> {
    try {
      if (interaction.isCommand) {
        const definition = this.slashCommands.get(interaction.command?.name ?? "");
        if (!definition) return false;
        await definition.execute(interaction);
        return true;
      }
      if (interaction.isComponent) {
        const handler = this.matchComponent(interaction.customId ?? "");
        if (!handler) return false;
        await handler.execute(interaction);
        return true;
      }
    } catch (error) {
      this.reportError(error, { interaction, command: interaction.command?.name });
    }
    return false;
  }

  private matchComponent(customId: string): ComponentHandlerDefinition | undefined {
    const exact = this.componentHandlers.get(customId);
    if (exact) return exact;
    for (const [pattern, handler] of this.componentHandlers) {
      if (pattern.endsWith("*") && customId.startsWith(pattern.slice(0, -1))) {
        return handler;
      }
    }
    return undefined;
  }

  private resolvePrefix(message: Message): string | null {
    if (typeof this.prefixResolver === "function") {
      return this.prefixResolver(message);
    }
    return this.prefixResolver;
  }

  private ensureAttached(): void {
    if (this.attached) return;
    this.attached = true;

    this.client.on("message.created", (message) => {
      void this.handleTextMessage(message);
    });

    this.client.on("interaction.created", (interaction) => {
      void this.handleInteraction(interaction);
    });

    if (this.options.syncOnLogin !== false) {
      const runSync = () => {
        void this.sync().catch((error: unknown) => {
          this.reportError(error, {});
        });
      };
      if (this.client.isReady()) {
        // Comandos registrados depois do login: sincroniza na hora.
        runSync();
      } else {
        this.client.once("ready", runSync);
      }
    }
  }

  private reportError(
    error: unknown,
    context: { command?: string; message?: Message; interaction?: Interaction },
  ): void {
    if (this.options.onError) {
      this.options.onError(error, context);
      return;
    }
    this.client.emit("commandError", { error, ...context });
  }
}

function validateTextDefinition(definition: TextCommandDefinition): void {
  if (!definition.name || typeof definition.name !== "string") {
    throw new SquordTypeError("Comando de texto precisa de name");
  }
  if (/\s/.test(definition.name)) {
    throw new SquordTypeError(`Nome de comando não pode ter espaços: ${definition.name}`);
  }
  if (typeof definition.execute !== "function") {
    throw new SquordTypeError(`Comando ${definition.name} precisa de execute()`);
  }
}
