# @squord/sdk — o SDK oficial do Squord

[![CI](https://github.com/Squord/squord-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Squord/squord-sdk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@squord%2Fsdk.svg?label=%40squord%2Fsdk)](https://www.npmjs.com/package/@squord/sdk)
[![Node LTS](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org)
[![Testes](https://img.shields.io/badge/testes-90%2F90-passing-brightgreen)](packages/sdk/test)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)](./LICENSE)

O SDK para criar bots do [Squord](https://docs.squord.com.br) em JavaScript e TypeScript:
REST tipado, gateway em tempo real com reconexão e resume, comandos de texto e de barra,
botões e menus, uploads, moderação, permissões e testes — sem você implementar nenhum
WebSocket, retry ou rate limit à mão.

```bash
npm install @squord/sdk
```

```ts
import { SquordClient } from "@squord/sdk";

const client = new SquordClient({ token: process.env.SQUORD_BOT_TOKEN! });

client.on("message.created", async (message) => {
  if (message.author.isBot) return;
  if (message.content === "!ping") await message.reply("Pong! 🏓");
});

await client.login();
```

> **Pré-requisitos**: Node.js 20+ (o gateway usa o `WebSocket` global, estável no Node 22+;
> no Node 20, passe `ws` na opção `ws` do cliente). Crie o bot e o token em
> **Configurações → Desenvolvedor** do Squord e instale-o em um Space.
> Documentação da plataforma: <https://docs.squord.com.br>.

---

## Índice

1. [Começo rápido](#começo-rápido)
2. [Instalação e requisitos](#instalação-e-requisitos)
3. [Eventos](#eventos)
4. [Comandos](#comandos)
5. [Interações: botões e menus](#interações-botões-e-menus)
6. [Mensagens, embeds e anexos](#mensagens-embeds-e-anexos)
7. [Members, cargos e moderação](#members-cargos-e-moderação)
8. [Permissões](#permissões)
9. [Erros, rate limits e retentativas](#erros-rate-limits-e-retentativas)
10. [Gateway: reconexão e resume](#gateway-reconexão-e-resume)
11. [Modo REST-only](#modo-rest-only)
12. [Testando seu bot](#testando-seu-bot)
13. [Observabilidade](#observabilidade)
14. [Limites do backend refletidos no SDK](#limites-do-backend-refletidos-no-sdk)
15. [Estrutura do repositório](#estrutura-do-repositório)

---

## Começo rápido

```ts
import { SquordClient } from "@squord/sdk";

const client = new SquordClient({
  token: process.env.SQUORD_BOT_TOKEN!, // sqb_<id>.<segredo>
  gracefulShutdown: true,                 // encerra no SIGINT/SIGTERM
});

// Ciclo de vida
client.on("ready", (event) => {
  console.log(`Conectado como ${event.user.displayName}`);
  client.setPresence({ status: "IDLE", customStatus: "Tocando no Lounge" });
});

// Mensagens (intent GUILD_MESSAGES; conteúdo exige a intent MESSAGE_CONTENT)
client.on("message.created", (message) => {
  console.log(`${message.authorDisplayName}: ${message.content}`);
});

// Erros de handler nunca derrubam o processo: chegam aqui.
client.on("error", (error) => console.error(error));

await client.login();
```

O `login()` valida o token (`GET /bots/@me`), conecta ao gateway e resolve no `ready`.
Tudo o que vem depois — heartbeat, reconexão com backoff, resume da sessão,
deduplicação de eventos — é responsabilidade do SDK.

## Instalação e requisitos

```bash
npm install @squord/sdk        # ESM e CommonJS, tipos incluídos
```

- **Node.js 20+**. O gateway usa o `WebSocket` global (estável no 22+); no Node 20,
  instale `ws` e passe `new SquordClient({ ws })`.
- **Zero dependências em runtime** — só o que o Node já traz (`fetch`, `WebSocket`).
- ESM e CJS: `dist/index.js` e `dist/index.cjs`, com `.d.ts` completos.

```jsonc
// package.json consumer, se estiver no Node 20:
{ "dependencies": { "@squord/sdk": "^0.1.0", "ws": "^8" } }
```

```ts
import { SquordClient } from "@squord/sdk";
import WebSocket from "ws";

const client = new SquordClient({ token, ws: (url) => new WebSocket(url) });
```

## Eventos

Os eventos seguem os nomes reais do gateway do Squord. O payload chega hidratado
em estruturas (`Message`, `Member`, `Channel`, `Role`, `Thread`, `Guild`,
`Interaction`) quando o evento carrega uma entidade; nos demais casos, o payload
cru da documentação.

```ts
client.on("message.created", (message) => {});        // Message
client.on("message.updated", (message) => {});        // Message (já editada)
client.on("message.deleted", (data) => {});            // { messageId, channelId, guildId }
client.on("reaction.added", (data) => {});             // { messageId, userId, reaction }
client.on("member.joined", ({ guildId, member }) => {}); // Member
client.on("member.updated", ({ guildId, member }) => {});
client.on("member.left", (data) => {});                // { guildId, userId }
client.on("member.banned", (data) => {});              // { guildId, userId, reason }
client.on("guild.updated", (guild) => {});             // Guild (Space)
client.on("channel.created", (channel) => {});         // Channel
client.on("role.created", (role) => {});               // Role
client.on("thread.created", (thread) => {});           // Thread
client.on("interaction.created", (interaction) => {}); // Interaction
client.on("application_command.updated", (data) => {});
```

Ciclo de vida e diagnóstico: `ready`, `resumed`, `reconnecting`, `disconnect`,
`error`, `warn`, `commandError`, `raw` (frame cru), `unknownEvent`
(evento futuro ainda não mapeado — compatibilidade sem quebrar).

> **Intents** são configuradas por bot no app do Squord (ou `PATCH /bots/{id}`) e
> **não** vão no identify — o gateway lê as intents do bot ao conectar. Use
> `Intents`/`intentsValue` para calcular valores. Sem a intent privilegiada
> `MESSAGE_CONTENT`, o `content` chega vazio (exceto mensagens do próprio bot e
> menções a ele) — o SDK entrega o evento do mesmo jeito; a regra é da plataforma.

## Comandos

O `CommandRegistry` cuida dos três tipos. Ele é opcional: você também pode
tratar `message.created`/`interaction.created` na mão.

```ts
import { CommandRegistry, SquordClient, EmbedBuilder, userMention } from "@squord/sdk";

const client = new SquordClient({ token });
const commands = new CommandRegistry(client, { prefix: "!" });

// Comandos de texto: prefixo, aliases, args com aspas, cooldown e middleware.
commands.text({
  name: "banir",
  aliases: ["ban"],
  cooldownMs: 5_000,
  beforeExecute: async (context) => true, // middleware (permissões, logs...)
  async execute(context) {
    const [target, ...rest] = context.args; // args com aspas tratadas
    const motivo = rest.join(" ") || "sem motivo";
    await client.moderation.ban(context.message.guildId!, target, { reason: motivo });
    await context.reply(`${userMention(target)} foi banido.`);
  },
});

// Comandos de barra: definidos aqui e sincronizados no login (PUT em bloco).
commands.slash({
  name: "eco",
  description: "Repete o que você disse",
  options: [
    { type: "STRING", name: "texto", description: "O texto", required: true },
  ],
  async execute(interaction) {
    await interaction.reply(interaction.getString("texto", true));
  },
});

// Componentes: handler por customId (aceita prefixo com `*`).
commands.component({
  customId: "confirmar:*",
  async execute(interaction) {
    await interaction.update({ content: "Feito!", components: [] });
  },
});

await client.login(); // slash commands são publicados no ready
```

- **Registrar é sobrescrever**: o SDK faz o `PUT` da lista completa na partida,
  como recomendado pela plataforma (escopo global; para escopo por Space, use
  `scope: { kind: "guild", guildIds: [...] }` — útil para dev).
- Respostas de slash: `reply`, `replyEphemeral` (só a pessoa vê), `defer` +
  `followup` (padrão para trabalho demorado) e, em componentes, `update` /
  `acknowledge`.
- Acesso tipado às opções: `getString`, `getInteger`, `getBoolean`, `getId`.

## Interações: botões e menus

```ts
import { ActionRowBuilder, Buttons, SelectMenuBuilder } from "@squord/sdk";

const row = new ActionRowBuilder()
  .addButton(Buttons.primary("Confirmar").setCustomId("confirmar"))
  .addButton(Buttons.secondary("Cancelar").setCustomId("cancelar"))
  .addButton(Buttons.link("Documentação").setURL("https://docs.squord.com.br"));

const menuRow = new ActionRowBuilder().setSelectMenu(
  new SelectMenuBuilder("tema")
    .addOption({ label: "Claro", value: "claro" })
    .addOption({ label: "Escuro", value: "escuro", description: "O padrão" }),
);

await channel.send({ content: "Escolha:", components: [row, menuRow] });
```

Regras da plataforma, validadas localmente pelo builder: 5 linhas por mensagem,
5 botões por linha ou 1 menu sozinho, `customId` único, botão `link` exige `https`.
Efeitas (`ephemeral: true`) só aceitam botões de link.

## Mensagens, embeds e anexos

```ts
import { EmbedBuilder } from "@squord/sdk";

// Menções seguras por padrão: sem allowedMentions, o SDK envia
// { users: true, roles: false, everyone: false }.
await channel.send({
  content: "Atualização de infraestrutura",
  embeds: [
    new EmbedBuilder()
      .setTitle("Status do servidor")
      .setDescription("Todos os serviços operacionais.")
      .setColor(0xf5a623)
      .addFields(
        { name: "API", value: "Online", inline: true },
        { name: "Gateway", value: "Online", inline: true },
      )
      .setTimestamp(),
  ],
});

// Idempotência: cada envio ganha um nonce automático; falhas de rede podem ser
// repetidas com segurança pelo cliente REST sem duplicar a mensagem.
const sent = await channel.send("Relatório importante");
await sent.edit("Relatório importante (atualizado)");
await sent.react("👍");
await sent.pin();

// Histórico com paginação por cursor (sem carregar tudo em memória):
for await (const message of paginate(
  (params) => client.messages.list(channel.id, params),
)) {
  // processa cada mensagem
}
```

**Uploads** seguem o fluxo oficial de 3 passos (reserva → `PUT` dos bytes →
confirmação), abstraído em uma chamada:

```ts
const upload = await client.uploads.upload({
  guildId: spaceId,        // bots sempre informam o Space
  path: "./relatorios/daily.pdf",
  filename: "relatorio.pdf",
  contentType: "application/pdf",
});

await channel.send({ content: "Segue o relatório.", attachmentIds: [upload.id] });
```

O `PUT` dos bytes vai para a URL assinada do storage **sem** o header do bot,
repetindo os headers do alvo exatamente; a confirmação é idempotente.

## Members, cargos e moderação

```ts
const guild = await client.guilds.fetch(spaceId);         // Space, com self.permissions
const member = await client.members.fetch(spaceId, userId);
const page = await client.members.list(spaceId, { limit: 50, roleId }); // cursor
const roles = await client.roles.list(spaceId);

await member.addRole(roleId);
await member.setNickname("Novo apelido");
await member.timeout(new Date(Date.now() + 60_000)); // 1 min de castigo
await member.removeTimeout();
await member.kick("motivo");
await client.moderation.ban(spaceId, userId, { reason: "spam", deleteMessageSeconds: 3600 });
await client.moderation.unban(spaceId, userId);
```

A hierarquia é respeitada pelo backend (`HIERARCHY_BLOCKED`, `ROLE_ABOVE_ACTOR`,
`OWNER_PROTECTED`, `ROLE_MANAGED` chegam como `PermissionError`/`SquordAPIError`
com o `code` estável para você decidir).

## Permissões

Permissões são **strings decimais** de 64 bits: calcule com `BigInt`.

```ts
import { Permissions, permissionsToString } from "@squord/sdk";

const bits = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES | Permissions.EMBED_LINKS;
console.log(permissionsToString(bits)); // "139713"

// O que o bot pode neste Space (bloco self do GET /guilds/{id}):
const guild = await client.guilds.fetch(spaceId);
guild.botHas(Permissions.BAN_MEMBERS);

// Resolução local com overwrites de canal (backend é a autoridade final):
const mine = await client.myPermissionsIn(channelId);
const canPin = await client.hasPermissionsIn(channelId, Permissions.PIN_MESSAGES);
```

A utilidade `resolveChannelPermissions` implementa o algoritmo oficial
(@everyone → cargos → overwrites de cargo → overwrite de membro).

## Erros, rate limits e retentativas

O cliente REST aplica a política recomendada pela documentação:

| Situação | Comportamento |
|---|---|
| `429` | espera `details.retryAfter` e repete (até esgotar `maxRetries`) |
| `5xx`, falha de rede | backoff exponencial **só em operações idempotentes ou com `nonce`** |
| `409 COMMANDS_CONFLICT`/`THREAD_CHANGED` | nova tentativa (a doc manda repetir) |
| demais `4xx` | falha imediata, sem loop |
| timeout | `RequestTimeoutError` tipado |

**Regra de ouro respeitada**: o SDK nunca repete um POST cujo efeito é incerto.
Envio de mensagens usa `nonce` automático (idempotência da plataforma), então pode
repetir; callbacks de interação não são repetidos — um `409 INTERACTION_ALREADY_ACKNOWLEDGED`
após repetição manual é tratado como sucesso pela utilidade `reply`.

Além do 429 reativo, o SDK observa os headers `X-RateLimit-*` (bloqueia a rota até
a janela renovar) e aplica um teto global conservador de 45 req/s (o oficial é 50).

```ts
import { RateLimitError, PermissionError, SquordAPIError } from "@squord/sdk";

try {
  await channel.send("oi");
} catch (error) {
  if (error instanceof PermissionError) {
    console.log("Falta a permissão:", error.missingPermission);
  } else if (error instanceof SquordAPIError) {
    console.log("code:", error.code, "requestId:", error.requestId);
  }
}
```

Hierarquia: `SquordError` → `SquordAPIError` (`status`, `code`, `requestId`,
`details`) → `AuthenticationError`/`InvalidTokenError`, `PermissionError`,
`NotFoundError`, `ValidationError` (`issues`), `RateLimitError` (`retryAfter`,
`bucket`, `exhaustedRetries`), `NetworkError`, `RequestTimeoutError`,
`GatewayError` (`closeCode`, `reason`).

## Gateway: reconexão e resume

O SDK implementa o protocolo completo: `hello` → `identify` (15 s) → `ready`;
heartbeat no intervalo anunciado (com jitter no primeiro); `heartbeat.ack` com
medida de latência; conexão zumbi detectada e fechada; reconexão com backoff
exponencial e jitter (1 s → 60 s); `resume` com a última sequência (replay dos
eventos perdidos + `resumed`); `invalid_session` caindo para `identify` na mesma
conexão; deduplicação por `s`; códigos fatais (4004/4013/4014) sem retry.

```ts
client.on("reconnecting", ({ attempt, delayMs, closeCode }) => {});
client.on("resumed", ({ replayed, sequence }) => {
  console.log(`${replayed} eventos recuperados na retomada`);
});
client.on("disconnect", ({ code, reason, fatal }) => {});

client.ping;                 // latência do último heartbeat
client.gateway?.sequence;     // última sequência processada
client.gateway?.session;      // id da sessão atual
client.reconnect();           // força reconexão (tenta resume)
```

O que o backend não garante, o SDK não inventa: se o histórico de replay não
cobrir a sequência, o servidor recusa o resume (`invalid_session`) e uma nova
sessão começa do zero — eventos do período podem ter sido perdidos; para
reconciliar, use as consultas REST (histórico de mensagens, membros).

## Modo REST-only

Para tarefas agendadas, CI e integrações que só publicam:

```ts
const client = new SquordClient({ token, restOnly: true });
await client.login(); // valida o token; nenhum WebSocket é aberto
await client.messages.send(channelId, "deploy concluído ✅");
await client.destroy();
```

## Testando seu bot

O subpath `@squord/sdk/testing` traz um gateway simulado (que fala o protocolo
real) e um REST em memória:

```ts
import { SquordClient } from "@squord/sdk";
import { createMockGateway, createMockRest, fixtures } from "@squord/sdk/testing";

const rest = createMockRest();
rest.get("/bots/@me", () => ({ status: 200, body: fixtures.bot() }));
rest.post("/channels/:id/messages", () => ({
  status: 201,
  body: fixtures.message({ content: "Pong!" }),
}));

const gateway = createMockGateway({ heartbeatIntervalMs: 100 });
const client = new SquordClient({
  token: "sqb_1.segredo",
  apiBaseURL: "https://mock.test",
  fetchImpl: rest.fetch,
  ws: gateway.wsFactory,
});

client.on("message.created", (message) => {
  if (message.content === "!ping") void message.reply("Pong!");
});

await client.login();
gateway.emitEvent("message.created", { message: fixtures.message({ content: "!ping" }) });

// Treine queda e retomada sem rede:
gateway.closeAll(4009, "session timeout");        // o SDK resume a sessão
gateway.requestReconnect("gateway shutting down"); // frame reconnect + 4007
```

O `MockGateway` aceita `refuseResumeOnce` (treina `invalid_session`) e
`suppressHeartbeatAck` (treina detecção de zumbi); o `MockRest` registra todas as
chamadas para asserções (`callLog`, `lastCall`) e pode simular 429/5xx/timeout.

## Observabilidade

```ts
const client = new SquordClient({
  token,
  logLevel: "debug",       // ou export SQUORD_LOG=debug / SQUORD_DEBUG=1
  logger: customLogger,    // Logger customizável { debug, info, warn, error, child }
});
```

Logs são estruturados (JSON), com **redação automática de tokens** (`sqb_...`
e `Authorization` viram `[REDACTED]`) e sem conteúdo de mensagens por padrão —
só metadados operacionais (requestId, buckets, heartbeats, tentativas).

## Limites do backend refletidos no SDK

O SDK valida localmente os limites reais antes de gastar uma chamada:
embeds (10/mensagem, 25 campos, 6000 caracteres somados, títulos 256...),
componentes (5 linhas, 5 botões/linha, `customId` 100), `content` 4000,
`attachmentIds` 10, upload 500 MB, nonce 64, nome de comando 32/regex.
Erros de validação local chegam como `SquordTypeError`; os da API, como
`ValidationError` com a lista de `issues` (`path`, `code`, `params`).

Recursos que a API **não** expõe a bots não existem no SDK: DMs, presença de
outros membros, listagem de bans, voz (o fluxo E2EE de bots de voz fica fora
desta versão). Não há mecanismo para contornar permissões.

## Estrutura do repositório

```
squord-sdk/
├── packages/sdk/          # @squord/sdk (o único pacote publicado)
│   ├── src/
│   │   ├── client/        # SquordClient, opções, eventos tipados
│   │   ├── rest/          # REST, retry, rate limits, paginação
│   │   ├── gateway/       # WebSocket, heartbeat, resume, backoff
│   │   ├── managers/      # mensagens, canais, Spaces, membros, cargos,
│   │   │                 # moderação, uploads, interações, comandos, bot
│   │   ├── structures/    # Message, Channel, Member, Role, User, Guild...
│   │   ├── builders/     # EmbedBuilder, botões, menus, payload
│   │   ├── commands/      # CommandRegistry (texto, slash, componentes)
│   │   ├── cache/         # cache TTL opcional
│   │   ├── errors/        # hierarquia de erros
│   │   ├── types/         # tipos dos payloads reais (API + gateway)
│   │   └── testing/       # @squord/sdk/testing: mocks e fixtures
│   └── test/              # 90 testes (unit + integração)
├── examples/              # ping-bot, commands-bot, welcome-bot, reports
└── docs/                  # guias
```

## Desenvolvimento

```bash
pnpm install
pnpm build        # tsup: ESM + CJS + .d.ts
pnpm test         # vitest: 90 testes com gateway simulado
pnpm typecheck    # tsc --noEmit (strict)
pnpm pack         # gera o tarball (squord-sdk-<versão>.tgz) para instalar em outro projeto
```

O `usage-demo/` consome o pacote como um projeto externo (via `file:`) e roda
um smoke contra os mocks — útil para conferir o pacote distribuído:

```bash
pnpm build
cd usage-demo && npm install && npm start
```

## Publicar versões no npm

O pacote `@squord/sdk` é publicado **automaticamente pelo workflow
[Publicar no npm](.github/workflows/publish.yml)** quando um Release do GitHub
é criado — com typecheck, testes, build e *provenance*.

Configuração única (secret `NPM_TOKEN`): crie um token de automação no npmjs.com
(Access Tokens → **Automation**, com permissão de escrever no pacote
`@squord/sdk`) e:

```bash
gh secret set NPM_TOKEN --repo Squord/squord-sdk
```

Corte uma versão:

1. Atualize `packages/sdk/package.json` e o [CHANGELOG.md](./CHANGELOG.md)
2. `git tag v0.x.y && git push --tags`
3. Crie o Release do GitHub — o workflow publica no npm

Enquanto o pacote não está no npm, consuma pelo tarball (gerado a partir do
repositório):

```bash
git clone https://github.com/Squord/squord-sdk && cd squord-sdk
pnpm install && pnpm pack          # gera packages/sdk/squord-sdk-0.1.0.tgz
npm install /caminho/para/squord-sdk-0.1.0.tgz
```

---

**Documentação da plataforma**: <https://docs.squord.com.br> ·
**Referência REST (OpenAPI)**: <https://docs.squord.com.br/api> ·
**Protocolo do gateway**: <https://docs.squord.com.br/gateway/visao-geral> ·
**Issues**: <https://github.com/Squord/squord-sdk/issues>

MIT © Squord — veja [LICENSE](./LICENSE).
