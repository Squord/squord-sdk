// Relatórios agendados sem gateway: só o cliente REST.
//
// Ideal para CI, cron e integrações que só publicam mensagens.
// Nenhuma conexão WebSocket é aberta (restOnly).
//
// export SQUORD_BOT_TOKEN="sqb_..."
// export SQUORD_CHANNEL_ID="1300000000000000040"

import { EmbedBuilder, SquordClient } from "@squord/bot";

const client = new SquordClient({
  token: process.env.SQUORD_BOT_TOKEN,
  restOnly: true, // valida o token e resolve; gateway não é aberto
});

await client.login();

const channelId = process.env.SQUORD_CHANNEL_ID;
const guildId = process.env.SQUORD_GUILD_ID; // do Space do canal (para uploads)

// Envia um relatório diário com embed e anexo (upload de 3 passos):
const reportPath = new URL("./relatorio.txt", import.meta.url);

const upload = await client.uploads.upload({
  guildId,
  path: reportPath.pathname,
  filename: "relatorio.txt",
  contentType: "text/plain",
});

const embed = new EmbedBuilder()
  .setTitle("Relatório diário")
  .setDescription("Todos os serviços operacionais.")
  .setColor(0x2ecc71)
  .addFields(
    { name: "API", value: "Online", inline: true },
    { name: "Gateway", value: "Online", inline: true },
  )
  .setTimestamp();

await client.messages.send(channelId, {
  content: "Atualização de infraestrutura",
  embeds: [embed],
  attachmentIds: [upload.id],
});

console.log("Relatório publicado.");

await client.destroy();
