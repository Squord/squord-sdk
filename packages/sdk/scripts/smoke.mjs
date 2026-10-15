// Smoke test do bundle compilado (ESM): fluxo completo contra os mocks.
// Executado por `node scripts/smoke.mjs` após `pnpm build`.
import { SquordClient, EmbedBuilder, Permissions, Intents, routeKeyOf } from "../dist/index.js";
import { createMockGateway, createMockRest, fixtures } from "../dist/testing/index.js";

const rest = createMockRest();
rest.get("/bots/@me", () => ({ status: 200, body: fixtures.bot() }));
rest.post("/channels/:id/messages", (m) => ({
  status: 201,
  body: fixtures.message({ content: m.body?.content }),
}));
rest.put("/bots/@me/commands", () => ({ status: 200, body: [] }));

const gateway = createMockGateway({ heartbeatIntervalMs: 200 });
const client = new SquordClient({
  token: "sqb_1.segredo",
  apiBaseURL: "https://mock.test",
  fetchImpl: rest.fetch,
  ws: gateway.wsFactory,
  gatewayReconnectBaseMs: 20, // backoff curto para o smoke
});

let replied = null;
client.on("ready", (event) => console.log("ready:", event.user.username));
client.on("message.created", async (message) => {
  if (message.content === "!ping") {
    const reply = await message.reply("Pong!");
    replied = reply.content;
  }
});

await client.login();
gateway.emitEvent("message.created", { message: fixtures.message({ content: "!ping" }) });
await new Promise((resolve) => setTimeout(resolve, 100));
if (replied !== "Pong!") throw new Error(`resposta não chegou: ${replied}`);

// Builders, permissões, intents e utilidades.
const embed = new EmbedBuilder().setTitle("t").setColor("#ff0000").build();
if (embed.color !== 0xff0000) throw new Error("embed color");
if (Permissions.SEND_MESSAGES !== 8192n) throw new Error("permissions");
if (Intents.GUILD_MESSAGES !== 4) throw new Error("intents");
if (routeKeyOf("POST", "/channels/1300000000000000040/messages") !== "POST /channels/{id}/messages")
  throw new Error("routeKey");

// Queda com retomada (resume).
gateway.closeAll(4009, "smoke test");
await new Promise((resolve) => setTimeout(resolve, 500));
if (!client.isReady()) throw new Error("não retomou após 4009");

await client.destroy();
console.log("SMOKE ESM OK");
