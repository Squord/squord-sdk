// Bot mínimo do Squord: escuta mensagens e responde !ping.
//
// 1. Crie um bot em Configurações → Desenvolvedor (https://docs.squord.com.br)
// 2. Instale-o em um Space e copie o token.
// 3. export SQUORD_BOT_TOKEN="sqb_..."
// 4. node index.js

import { SquordClient } from "@squord/sdk";

const client = new SquordClient({
  token: process.env.SQUORD_BOT_TOKEN,
  // Encerra com SIGINT/SIGTERM sem deixar sessões abertas:
  gracefulShutdown: true,
});

client.on("ready", (event) => {
  console.log(`Bot conectado: ${event.user.displayName}`);
  console.log(`Spaces: ${event.guilds.map((g) => g.name).join(", ") || "nenhum"}`);
});

client.on("message.created", async (message) => {
  // Ignora mensagens de bots (incluindo a si mesmo).
  if (message.author.isBot) return;

  if (message.content === "!ping") {
    const started = Date.now();
    await message.reply("Pong! 🏓");
    console.log(`Respondido em ${Date.now() - started} ms (gateway: ${client.ping} ms)`);
  }
});

client.on("error", (error) => {
  console.error("Erro no cliente:", error.message);
});

await client.login();
