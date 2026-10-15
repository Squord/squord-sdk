// Demonstração standalone do consumo do @squord/sdk instalado via `file:`.
//
// Passos:
//   pnpm build     (na raiz do monorepo, para gerar packages/sdk/dist)
//   npm install    (aqui no usage-demo)
//   npm start
//
// Sem SQUORD_BOT_TOKEN no ambiente, o script roda contra os mocks oficiais
// (@squord/sdk/testing) e valida a instalação de ponta a ponta, sem rede.
// COM um token real, ele conecta ao Squord de verdade e responde !ping.

import { SquordClient } from "@squord/sdk";

const realToken = process.env.SQUORD_BOT_TOKEN;

// Modo demo (sem token): ambiente mockado completo em uma chamada.
const mockEnv = realToken
  ? null
  : (await import("@squord/sdk/testing")).createMockEnvironment();

const client = new SquordClient({
  token: realToken ?? "sqb_1300000000000000010.demo",
  gracefulShutdown: true,
  ...(mockEnv?.options ?? {}),
});

let pong = false;
client.on("ready", (event) => {
  console.log(`✅ conectado como ${event.user.displayName} (${realToken ? "real" : "demo"})`);
});

client.on("message.created", async (message) => {
  if (message.author.isBot) return;
  if (message.content === "!ping") {
    await message.reply("Pong! 🏓");
    pong = true;
    console.log("↩️  respondeu !ping");
  }
});

await client.login();

if (mockEnv) {
  const { fixtures } = await import("@squord/sdk/testing");
  mockEnv.gateway.emitEvent("message.created", {
    message: fixtures.message({ content: "!ping" }),
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!pong) throw new Error("a resposta não chegou — algo errado na instalação");
  console.log("smoke de demonstração concluído: o pacote instalado funciona.");
  await client.destroy();
} else {
  console.log("Bot rodando de verdade. Ctrl+C para encerrar.");
}
