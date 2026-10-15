// Smoke test do bundle compilado (CJS): require clássico.
// Executado por `node scripts/smoke.cjs` após `pnpm build`.
const { SquordClient, EmbedBuilder } = require("../dist/index.cjs");
const { createMockRest, createMockGateway, fixtures } = require("../dist/testing/index.cjs");

(async () => {
  const rest = createMockRest();
  rest.get("/bots/@me", () => ({ status: 200, body: fixtures.bot() }));
  const gateway = createMockGateway();
  const client = new SquordClient({
    token: "sqb_1.segredo",
    apiBaseURL: "https://mock.test",
    fetchImpl: rest.fetch,
    ws: gateway.wsFactory,
    restOnly: true,
  });
  await client.login();
  if (!client.user) throw new Error("sem user");
  const embed = new EmbedBuilder().setTitle("ok").build();
  if (!embed.title) throw new Error("embed CJS");
  await client.destroy();
  console.log("SMOKE CJS OK");
})();
