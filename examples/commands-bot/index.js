// Bot com os dois tipos de comando:
// - comandos de texto com prefixo (!ping, !avatar, !banir)
// - comandos de barra (/eco, /avatar), sincronizados no login
// - botões e menus com handlers por customId
//
// export SQUORD_BOT_TOKEN="sqb_..."

import {
  ActionRowBuilder,
  Buttons,
  CommandRegistry,
  EmbedBuilder,
  SquordClient,
  Permissions,
  userMention,
} from "@squord/sdk";

const client = new SquordClient({
  token: process.env.SQUORD_BOT_TOKEN,
  gracefulShutdown: true,
  cache: { enabled: true }, // cache opcional de Spaces, canais, membros e cargos
});

const commands = new CommandRegistry(client, {
  prefix: "!",
  onError: (error, context) => {
    console.error(`Erro no comando ${context.command ?? "?"}:`, error);
  },
});

// ---------------------------------------------------------------------
// Comandos de texto
// ---------------------------------------------------------------------

commands.text({
  name: "ping",
  description: "Verifica a latência do bot",
  async execute(context) {
    await context.reply(`Pong! Gateway: ${client.ping ?? "?"} ms`);
  },
});

commands.text({
  name: "avatar",
  description: "Exibe o avatar de um membro",
  async execute(context) {
    const { message } = context;
    const guildId = message.guildId;
    const targetId = message.mentionedUserIds[0] ?? message.authorId;
    // Busca o membro no Space (o cache, quando habilitado, evita repetir).
    const member = guildId
      ? await client.members.fetch(guildId, targetId).catch(() => null)
      : null;
    const displayName = member?.nickname ?? member?.user.displayName ?? message.authorDisplayName;
    const avatarUrl = member?.avatarUrl ?? member?.user.avatarUrl ?? message.author.avatarUrl;
    const embed = new EmbedBuilder()
      .setTitle(`Avatar de ${displayName}`)
      .setColor(0xf5a623)
      .setImage(avatarUrl ?? "https://cdn.squord.com.br/embed.png");
    await context.reply({ embeds: [embed] });
  },
});

commands.text({
  name: "banir",
  description: "Bane um membro (exige BAN_MEMBERS)",
  cooldownMs: 5_000,
  async beforeExecute(context) {
    // Verificação local: o backend continua sendo a autoridade final.
    const canBan = await client
      .hasPermissionsIn(context.message.channelId, Permissions.BAN_MEMBERS)
      .catch(() => false);
    if (!canBan) {
      await context.reply("Falta `BAN_MEMBERS` para mim neste canal.");
      return false;
    }
    return true;
  },
  async execute(context) {
    const guildId = context.message.guildId;
    const target = context.message.mentionedUserIds[0];
    if (!guildId || !target) {
      await context.reply("Use assim: `!banir <@pessoa> [motivo]`");
      return;
    }
    const reason = context.rawArgs.replace(/^<@\d+>\s*/, "") || "sem motivo";
    await client.moderation.ban(guildId, target, { reason });
    await context.reply(`${userMention(target)} foi banido. Motivo: ${reason}`);
  },
});

// ---------------------------------------------------------------------
// Comandos de barra (sincronizados com PUT em bloco no login)
// ---------------------------------------------------------------------

commands.slash({
  name: "eco",
  description: "Repete o que você disse",
  options: [
    { type: "STRING", name: "texto", description: "O texto a repetir", required: true },
  ],
  async execute(interaction) {
    await interaction.reply(interaction.getString("texto", true));
  },
});

commands.slash({
  name: "confirmar",
  description: "Mostra botões e menus",
  async execute(interaction) {
    const row = new ActionRowBuilder()
      .addButton(Buttons.primary("Confirmar").setCustomId("confirmar:sim"))
      .addButton(Buttons.secondary("Cancelar").setCustomId("confirmar:nao"))
      .addButton(Buttons.link("Docs").setURL("https://docs.squord.com.br"));
    await interaction.reply({ content: "Escolha uma opção:", components: [row] });
  },
});

// ---------------------------------------------------------------------
// Componentes (customId aceita prefixo com *)
// ---------------------------------------------------------------------

commands.component({
  customId: "confirmar:*",
  async execute(interaction) {
    const escolha = interaction.customId.split(":")[1];
    // UPDATE edita a própria mensagem do componente.
    await interaction.update({
      content: `Você escolheu: **${escolha}**`,
      components: [],
    });
  },
});

// ---------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------

client.on("ready", (event) => {
  console.log(`Conectado como ${event.user.username}`);
});

client.on("member.joined", async ({ guildId, member }) => {
  console.log(`${member.displayName} entrou no Space ${guildId}`);
});

await client.login();
