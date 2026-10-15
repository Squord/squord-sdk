import { describe, expect, it } from "vitest";
import {
  ActionRowBuilder,
  ButtonBuilder,
  Buttons,
  EmbedBuilder,
  SelectMenuBuilder,
  resolveMessagePayload,
  SquordTypeError,
} from "../../src/index";

describe("EmbedBuilder", () => {
  it("monta um embed válido", () => {
    const embed = new EmbedBuilder()
      .setTitle("Status do servidor")
      .setDescription("Todos os serviços estão operacionais.")
      .setColor(0xf5a623)
      .addFields(
        { name: "API", value: "Online", inline: true },
        { name: "Gateway", value: "Online", inline: true },
      )
      .setTimestamp();

    const built = embed.build();
    expect(built.title).toBe("Status do servidor");
    expect(built.color).toBe(0xf5a623);
    expect(built.fields).toHaveLength(2);
    expect(built.timestamp).toBeTruthy();
  });

  it("aceita cor em #rrggbb", () => {
    const embed = new EmbedBuilder().setTitle("x").setColor("#ff579a");
    expect(embed.build().color).toBe(0xff579a);
  });

  it("recusa cor inválida", () => {
    expect(() => new EmbedBuilder().setColor("#ff579")).toThrow(SquordTypeError);
    expect(() => new EmbedBuilder().setColor(16_777_216)).toThrow(SquordTypeError);
  });

  it("valida limites reais da plataforma", () => {
    expect(() => new EmbedBuilder().setTitle("a".repeat(257))).toThrow(/256/);
    expect(() => new EmbedBuilder().setDescription("a".repeat(4097))).toThrow(/4096/);
    expect(() =>
      new EmbedBuilder().addFields(
        ...Array.from({ length: 26 }, (_, i) => ({ name: `f${i}`, value: "v" })),
      ),
    ).toThrow(/25/);
  });

  it("recusa embed sem nada visível (BLANK)", () => {
    expect(() => new EmbedBuilder().build()).toThrow(SquordTypeError);
  });

  it("exige https em url", () => {
    expect(() => new EmbedBuilder().setURL("ftp://example.com")).toThrow(SquordTypeError);
  });

  it("conta o texto do embed (limite de 6000 por mensagem)", () => {
    const embed = new EmbedBuilder()
      .setTitle("t".repeat(256))
      .setDescription("d".repeat(4096));
    expect(embed.textLength).toBe(256 + 4096);
  });
});

describe("Componentes", () => {
  it("botão de ação exige customId", () => {
    expect(() => Buttons.primary("Confirmar").build()).toThrow(SquordTypeError);
    expect(Buttons.primary("Confirmar").setCustomId("ok").build().customId).toBe("ok");
  });

  it("botão de link exige url https e não tem customId", () => {
    expect(() => Buttons.link("Site").build()).toThrow(SquordTypeError);
    expect(() => Buttons.link("Site").setURL("http://x.com")).toThrow(SquordTypeError);
    const button = Buttons.link("Site").setURL("https://x.com").build();
    expect(button.url).toBe("https://x.com");
    expect(button.customId).toBeUndefined();
  });

  it("linha aceita até 5 botões", () => {
    const row = new ActionRowBuilder();
    for (let i = 0; i < 5; i++) row.addButton(Buttons.primary(`b${i}`).setCustomId(`c${i}`));
    expect(row.build().components).toHaveLength(5);
    expect(() => row.addButton(Buttons.primary("b6").setCustomId("c6"))).toThrow(/5/);
  });

  it("menu ocupa a linha sozinho", () => {
    const menu = new SelectMenuBuilder("tema").addOption({ label: "Claro", value: "claro" });
    const row = new ActionRowBuilder();
    row.addButton(Buttons.primary("x").setCustomId("x"));
    expect(() => row.setSelectMenu(menu)).toThrow(SquordTypeError);
  });

  it("menu valida min/max e opções", () => {
    const menu = new SelectMenuBuilder("tema");
    expect(() => menu.build()).toThrow(SquordTypeError);
    menu.addOption({ label: "A", value: "a" }).addOption({ label: "B", value: "b" });
    menu.setMinValues(5).setMaxValues(1);
    expect(() => menu.build()).toThrow(/minValues/);
  });
});

describe("resolveMessagePayload", () => {
  it("aceita string como content", () => {
    expect(resolveMessagePayload("olá").content).toBe("olá");
  });

  it("converte builders e aplica menções seguras", () => {
    const embed = new EmbedBuilder().setTitle("t");
    const payload = resolveMessagePayload({
      content: "Atualização",
      embeds: [embed],
      components: [new ActionRowBuilder().addButton(Buttons.primary("ok").setCustomId("ok"))],
    });
    expect(payload.embeds).toEqual([{ title: "t" }]);
    expect(payload.components).toEqual([
      { type: "row", components: [{ type: "button", style: "primary", label: "ok", customId: "ok" }] },
    ]);
    expect(payload.allowedMentions).toEqual({ users: true, roles: false, everyone: false });
  });

  it("recusa payload sem conteúdo visível", () => {
    expect(() => resolveMessagePayload({ content: "" })).toThrow(SquordTypeError);
    expect(() => resolveMessagePayload({} as never)).toThrow(SquordTypeError);
  });

  it("valida limites de content e attachmentIds", () => {
    expect(() => resolveMessagePayload({ content: "a".repeat(4001) })).toThrow(/4000/);
    expect(() =>
      resolveMessagePayload({ content: "x", attachmentIds: Array.from({ length: 11 }, () => "1") }),
    ).toThrow(/10/);
  });

  it("preserva nonce e replyToId", () => {
    const payload = resolveMessagePayload({
      content: "r",
      replyToId: "1300000000000000100",
      nonce: "chave",
    });
    expect(payload.replyToId).toBe("1300000000000000100");
    expect(payload.nonce).toBe("chave");
  });
});
