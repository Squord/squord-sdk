// Bot de boas-vindas: cumprimenta quem entra e registra quem sai.
//
// Requer a intent GUILD_MEMBERS (Configurações → Desenvolvedor → Meus bots)
// e SEND_MESSAGES no canal do sistema.
//
// export SQUORD_BOT_TOKEN="sqb_..."

import { EmbedBuilder, SquordClient, userMention } from "@squord/bot";

const client = new SquordClient({
  token: process.env.SQUORD_BOT_TOKEN,
  gracefulShutdown: true,
});

client.on("ready", (event) => {
  console.log(`Online em ${event.guilds.length} Space(s).`);
  client.setPresence({ status: "IDLE", customStatus: "Dando boas-vindas!" });
});

client.on("member.joined", async ({ guildId, member }) => {
  if (member.isBot) return; // não cumprimenta outros bots

  // Canal do sistema do Space: onde as mensagens de boas-vindas fazem sentido.
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild?.systemChannelId) return;

  const embed = new EmbedBuilder()
    .setTitle(`Bem-vindo(a), ${member.displayName}!`)
    .setDescription(
      [
        `Olá, ${userMention(member.userId)}! 👋`,
        "",
        `Você é a pessoa número **${guild.memberCount + 1}** do Space.`,
        "Dê uma olhada nas regras e sinta-se em casa.",
      ].join("\n"),
    )
    .setColor(0x5865f2)
    .setTimestamp();

  const avatar = member.avatarUrl ?? member.user.avatarUrl;
  if (avatar) embed.setThumbnail(avatar);

  await client.messages.send(guild.systemChannelId, {
    embeds: [embed],
  });
});

client.on("member.left", ({ guildId, userId }) => {
  console.log(`${userId} saiu do Space ${guildId}.`);
});

await client.login();
