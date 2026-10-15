# Comandos e interações

Como usar o `CommandRegistry` para os três tipos de comando suportados pelo
Squord: texto com prefixo, comandos de barra e componentes (botões e menus).

## Comandos de texto

São processados pelo SDK a partir de `message.created`. Requerem a intent
`GUILD_MESSAGES`; o **conteúdo** só chega com a intent privilegiada
`MESSAGE_CONTENT` (exceto mensagens do próprio bot e as que o mencionam).

```ts
commands.text({
  name: "timeout",
  aliases: ["silenciar"],
  description: "Silencia um membro por N minutos",
  cooldownMs: 3_000,
  guildIds: [spaceId],             // opcional: vale só em Spaces específicos
  beforeExecute: async (context) => {
    const pode = await client.hasPermissionsIn(
      context.message.channelId,
      Permissions.TIMEOUT_MEMBERS,
    );
    if (!pode) {
      await context.reply("Falta `TIMEOUT_MEMBERS` para mim aqui.");
      return false;
    }
    return true;
  },
  async execute(context) {
    const [target, minutos] = context.args;       // aspas já tratadas
    const member = await client.members.fetch(context.message.guildId!, target);
    await member.timeout(new Date(Date.now() + Number(minutos) * 60_000));
    await context.replyWithMention(`silenciado por ${minutos} min.`);
  },
});
```

O parse: o prefixo (string ou função por mensagem) é removido, o primeiro
token vira o nome (case-insensitive, aliases incluídos) e o resto vira
`context.args` — aspas simples e duplas agrupam argumentos com espaços
(`!banir @ana "spam reincidente" 7d` → 3 argumentos).

Cooldown é por usuário+comando. Mensagens de bots são ignoradas por padrão
(`ignoreBots` no registro).

## Comandos de barra

São comandos de aplicação: registrados no Squord e invocados com `/`.
O bot precisa de sessão aberta no gateway — sem isso, quem invoca recebe
`409 BOT_OFFLINE`.

**Registrar é sobrescrever.** O `PUT` envia a lista completa do escopo e o
Squord substitui a anterior (comandos fora da lista somem; o mesmo nome mantém
o `id`). O padrão é registrar a lista inteira **na partida do bot** — o
`CommandRegistry` faz isso automaticamente no `ready` (`syncOnLogin`).

```ts
commands.slash({
  name: "novidades",
  description: "Mostra as últimas novidades",
  options: [
    { type: "BOOLEAN", name: "completo", description: "Lista completa" },
    {
      type: "STRING",
      name: "tema",
      description: "Filtrar por tema",
      choices: [
        { name: "Voz", value: "voz" },
        { name: "Bots", value: "bots" },
      ],
    },
  ],
  // escopo global por padrão; em desenvolvimento, prefira um Space:
  // scope: { kind: "guild", guildIds: [spaceDeDev] },
  async execute(interaction) {
    const completo = interaction.getBoolean("completo") ?? false;
    await interaction.reply(completo ? "Tudo..." : "Resumo...");
  },
});
```

Limites da plataforma (validados pelo SDK): 100 comandos por escopo, nome até
32 caracteres (`[a-z0-9_-]`), descrição 100, 25 opções por comando, 25 `choices`
por opção (só `STRING` e `INTEGER` têm choices), tipos `STRING`, `INTEGER`,
`BOOLEAN`, `USER`, `CHANNEL`, `ROLE` (estes três últimos chegam como **id**).
O limite de sobrescritas é `COMMANDS_UPDATE`: 10 por minuto.

Ao invocar, o Squord já validou tudo (canal visível, opções corretas, ids do
Space) — o `interaction.created` chega com `command.options` prontos, tipados
por `getString/getInteger/getBoolean/getId`.

## Responder interações

A primeira resposta é a única aceita como callback; a janela total é de
**15 minutos**, e o limite é 5 respostas (callback + follow-ups) por 5 s.

| Método | Tipo | Serve para |
|---|---|---|
| `interaction.reply(payload)` | `MESSAGE` | postar a resposta (com marca de comando) |
| `interaction.replyEphemeral(payload)` | `MESSAGE` + `ephemeral` | só quem invocou vê; não é salva; só botões de link |
| `interaction.defer()` | `DEFERRED` | "bot pensando"; resultado vem depois, por follow-up |
| `interaction.update(payload)` | `UPDATE` | componente: edita a mensagem clicada |
| `interaction.acknowledge()` | `DEFERRED_UPDATE` | componente: confirma o clique sem mudar nada |
| `interaction.followup(payload)` | — | mensagem extra depois da primeira resposta |

O padrão para trabalho demorado: `defer()` logo (o app avisa "não respondeu"
após ~10 s) e `followup()` quando terminar.

## Componentes

```ts
const row = new ActionRowBuilder()
  .addButton(Buttons.primary("Confirmar").setCustomId("confirmar"))
  .addButton(Buttons.danger("Excluir").setCustomId("excluir"))
  .addButton(Buttons.link("Abrir").setURL("https://..."));

commands.component({
  customId: "excluir",          // ou "acao:*" para casar por prefixo
  async execute(interaction) {
    // Confira o user e as permissões para ações sensíveis: o customId é
    // só um texto seu, não uma autorização.
    await interaction.update({ content: "Excluído.", components: [] });
  },
});
```

Regras da plataforma (o builder valida antes de enviar): até 5 linhas por
mensagem; cada linha tem 1–5 botões **ou** exatamente 1 menu; `customId` único
na mensagem (até 100 caracteres); botão de link tem `url` e não gera interação;
menus têm 1–25 opções, `minValues`/`maxValues` padrão 1.

O clique chega em `interaction.created` com `type: "COMPONENT"`, o `customId`,
os `values` do menu (vazio em botão) e o `messageId` — use
`interaction.fetchComponentMessage()` para ler a mensagem origem quando precisar.
