import { describe, expect, it, vi } from "vitest";
import { Cache } from "../../src/cache/Cache";
import { splitArguments } from "../../src/utils/misc";
import { compareSnowflakes, isValidSnowflake } from "../../src/utils/snowflake";
import { backoffDelay } from "../../src/utils/backoff";
import {
  DEFAULT_INTENTS,
  Intents,
  intentsValue,
  listIntents,
} from "../../src/intents";
import {
  Permissions,
  hasPermissions,
  parsePermissions,
  permissionsToString,
  resolveChannelPermissions,
} from "../../src/permissions";

describe("Cache", () => {
  it("guarda e recupera", () => {
    const cache = new Cache<string, number>();
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("expira pelo TTL", () => {
    let now = 1000;
    const cache = new Cache<string, number>({ ttlMs: 500, now: () => now });
    cache.set("a", 1);
    now += 400;
    expect(cache.get("a")).toBe(1);
    now += 200;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("descarta os mais antigos acima do maxSize", () => {
    const cache = new Cache<number, number>({ maxSize: 3 });
    cache.set(1, 1);
    cache.set(2, 2);
    cache.set(3, 3);
    cache.set(4, 4); // excede: remove o 1
    expect(cache.size).toBe(3);
    expect(cache.has(1)).toBe(false);
    expect(cache.has(4)).toBe(true);
  });

  it("promove item acessado (LRU-ish)", () => {
    const cache = new Cache<string, number>({ maxSize: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // promove a
    cache.set("c", 3); // remove o mais antigo (b)
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("delete e clear funcionam", () => {
    const cache = new Cache<string, number>();
    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("itera apenas itens vivos", () => {
    const cache = new Cache<string, number>();
    cache.set("a", 1);
    cache.set("b", 2);
    expect([...cache.entries()]).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("splitArguments", () => {
  it("divide respeitando aspas", () => {
    expect(splitArguments('ban @ana "motivo longo" 7d')).toEqual([
      "ban",
      "@ana",
      "motivo longo",
      "7d",
    ]);
  });

  it("aspas simples também funcionam", () => {
    expect(splitArguments("say 'oi gente' fim")).toEqual(["say", "oi gente", "fim"]);
  });

  it("colapsa espaços extras", () => {
    expect(splitArguments("  a   b  ")).toEqual(["a", "b"]);
  });

  it("fecha aspas não terminadas sem erro", () => {
    expect(splitArguments('x "abc')).toEqual(["x", "abc"]);
  });
});

describe("snowflakes", () => {
  it("valida formatos", () => {
    expect(isValidSnowflake("1300000000000000020")).toBe(true);
    expect(isValidSnowflake("6687f7a1c2d3e4f5a6b7c8d9")).toBe(true); // hex 24
    expect(isValidSnowflake("abc")).toBe(false);
    expect(isValidSnowflake("")).toBe(false);
  });

  it("compara por valor numérico, inclusive além de 2^53", () => {
    expect(compareSnowflakes("100", "200")).toBeLessThan(0);
    expect(compareSnowflakes("200", "100")).toBeGreaterThan(0);
    expect(compareSnowflakes("1300000000000000020", "1300000000000000020")).toBe(0);
    expect(compareSnowflakes("9007199254740993", "9007199254740992")).toBeGreaterThan(0);
  });
});

describe("backoff", () => {
  it("cresce exponencialmente até o teto", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // jitter neutro
    expect(backoffDelay(0)).toBe(1000);
    expect(backoffDelay(1)).toBe(2000);
    expect(backoffDelay(2)).toBe(4000);
    expect(backoffDelay(6)).toBe(60_000);
    expect(backoffDelay(20)).toBe(60_000);
  });

  it("aplica jitter dentro dos limites", () => {
    for (let i = 0; i < 50; i++) {
      const delay = backoffDelay(3, { baseMs: 1000, jitter: 0.5 });
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThanOrEqual(12_000);
    }
  });
});

describe("permissões", () => {
  it("converte entre string decimal e BigInt (valor da doc: 155649)", () => {
    const bits =
      Permissions.VIEW_CHANNEL |
      Permissions.SEND_MESSAGES |
      Permissions.READ_MESSAGE_HISTORY |
      Permissions.EMBED_LINKS;
    expect(permissionsToString(bits)).toBe("155649");
    expect(parsePermissions("155649")).toBe(bits);
  });

  it("a soma de todas as permissões mantém precisão via BigInt", () => {
    const bits = Permissions.MANAGE_EVENTS; // 1 << 42, o bit mais alto da tabela
    expect(permissionsToString(bits)).toBe("4398046511104");
    // Round-trip: string decimal → BigInt → string, sem perda.
    const all = Object.values(Permissions).reduce((acc, flag) => acc | flag, 0n);
    expect(parsePermissions(permissionsToString(all))).toBe(all);
  });

  it("testa permissões", () => {
    const bits = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;
    expect(hasPermissions(bits, Permissions.VIEW_CHANNEL, Permissions.SEND_MESSAGES)).toBe(true);
    expect(hasPermissions(bits, Permissions.BAN_MEMBERS)).toBe(false);
  });

  it("resolve overwrites na ordem oficial (everyone → cargos → membro)", () => {
    const result = resolveChannelPermissions({
      everyonePermissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES,
      rolePermissions: [],
      overwrites: [
        { targetId: "role1", targetType: "ROLE", allow: "8192", deny: "0" },
        { targetId: "user1", targetType: "MEMBER", allow: "0", deny: "8192" },
      ],
      memberId: "user1",
      everyoneRoleId: "g1",
      memberRoleIds: ["role1"],
    });
    expect(hasPermissions(result, Permissions.VIEW_CHANNEL)).toBe(true);
    expect(hasPermissions(result, Permissions.SEND_MESSAGES)).toBe(false);
  });

  it("sem VIEW_CHANNEL o resultado é zero", () => {
    const result = resolveChannelPermissions({
      everyonePermissions: Permissions.SEND_MESSAGES,
      rolePermissions: [],
      overwrites: [{ targetId: "g1", targetType: "ROLE", allow: "0", deny: "1" }],
      memberId: "user1",
      everyoneRoleId: "g1",
      memberRoleIds: ["g1"],
    });
    expect(result).toBe(0n);
  });

  it("ADMINISTRATOR concede tudo", () => {
    const result = resolveChannelPermissions({
      everyonePermissions: Permissions.ADMINISTRATOR,
      rolePermissions: [],
      overwrites: [],
      memberId: "u",
      everyoneRoleId: "g",
      memberRoleIds: [],
    });
    expect(hasPermissions(result, Permissions.BAN_MEMBERS, Permissions.MANAGE_GUILD)).toBe(true);
  });
});

describe("intents", () => {
  it("valor padrão do bot novo é 13 (doc oficial)", () => {
    expect(DEFAULT_INTENTS).toBe(13);
  });

  it("soma bits", () => {
    expect(intentsValue(Intents.GUILDS, Intents.GUILD_MEMBERS, Intents.GUILD_MESSAGES)).toBe(7);
    expect(intentsValue(Intents.GUILDS, Intents.GUILD_MESSAGES, Intents.MESSAGE_CONTENT)).toBe(37);
  });

  it("lista flags", () => {
    expect(listIntents(13)).toEqual(["GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS"]);
  });
});
