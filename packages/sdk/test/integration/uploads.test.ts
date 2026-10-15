import { describe, expect, it, vi } from "vitest";
import { SquordClient } from "../../src/client/SquordClient";
import { createMockRest, createMockGateway, fixtures } from "../../src/testing/index";

const TOKEN = "sqb_1300000000000000010.SEGREDO";

describe("fluxo completo de upload (reserva → bytes → confirmação → anexo)", () => {
  it("envia o arquivo e anexa à mensagem", async () => {
    const rest = createMockRest();
    const gateway = createMockGateway();
    const client = new SquordClient({
      token: TOKEN,
      apiBaseURL: "https://mock.test",
      fetchImpl: rest.fetch,
      ws: gateway.wsFactory,
      restOnly: true,
    });

    rest.get("/bots/@me", () => ({ status: 200, body: fixtures.bot() }));

    const bytes = Buffer.from("conteúdo do relatório");
    let confirmCalled = 0;
    let putBytes: { url: string; headers: Record<string, string>; size: number } | null = null;

    rest.post("/uploads", (m) => {
      const body = m.body as {
        scope: string;
        filename: string;
        contentType: string;
        size: number;
        guildId: string;
      };
      expect(body.scope).toBe("attachments");
      expect(body.guildId).toBe("1300000000000000001");
      expect(body.size).toBe(bytes.length);
      return {
        status: 201,
        body: {
          upload: {
            id: "1300000000000000300",
            scope: "attachments",
            filename: body.filename,
            contentType: body.contentType,
            size: body.size,
            status: "PENDING",
            url: null,
            thumbnailUrl: null,
            guildId: body.guildId,
            storageKey: "attachments/key",
            scanStatus: "NOT_REQUIRED",
            animated: false,
            animatedUrl: null,
            createdAt: "2026-10-05T12:00:00.000Z",
            expiresAt: "2026-10-05T13:15:00.000Z",
          },
          target: {
            uploadUrl: "https://media-mock.example/attachments/key",
            method: "PUT",
            headers: { "Content-Type": body.contentType },
            storageKey: "attachments/key",
            publicUrl: "https://media.squord.com.br/attachments/key",
            expiresAt: "2026-10-05T12:15:00.000Z",
          },
        },
      };
    });

    // O PUT dos bytes vai para a URL externa (mock também intercepta).
    rest.on("PUT", "/attachments/:key", (m) => {
      const body = m.call.body;
      putBytes = {
        url: m.path,
        headers: m.call.headers,
        size: body instanceof Uint8Array ? body.byteLength : 0,
      };
      return { status: 200, body: {} };
    });

    rest.post("/uploads/:id/confirm", () => {
      confirmCalled++;
      return {
        status: 200,
        body: {
          id: "1300000000000000300",
          scope: "attachments",
          filename: "relatorio.pdf",
          contentType: "application/pdf",
          size: bytes.length,
          status: "READY",
          url: "https://media.squord.com.br/attachments/key",
          thumbnailUrl: null,
          guildId: "1300000000000000001",
          storageKey: "attachments/key",
          scanStatus: "NOT_REQUIRED",
          animated: false,
          animatedUrl: null,
          createdAt: "2026-10-05T12:00:00.000Z",
          expiresAt: "2026-10-05T13:15:00.000Z",
        },
      };
    });

    let messageBody: Record<string, unknown> = {};
    rest.post("/channels/:channelId/messages", (m) => {
      messageBody = m.body as Record<string, unknown>;
      return { status: 201, body: fixtures.message() };
    });

    await client.login();
    const upload = await client.uploads.upload({
      guildId: "1300000000000000001",
      filename: "relatorio.pdf",
      contentType: "application/pdf",
      data: bytes,
    });
    expect(upload.status).toBe("READY");
    expect(confirmCalled).toBe(1);
    expect(putBytes!.headers["content-type"]).toBe("application/pdf");
    expect(putBytes!.headers.authorization).toBeUndefined(); // sem o token do bot
    expect(putBytes!.size).toBe(bytes.length);

    // Confirmação é idempotente: repetir devolve o mesmo resultado.
    await client.uploads.confirm("1300000000000000300");
    expect(confirmCalled).toBe(2);

    await client.messages.send("1300000000000000040", {
      content: "Segue o relatório.",
      attachmentIds: [upload.id],
    });
    expect(messageBody.attachmentIds).toEqual(["1300000000000000300"]);
    await client.destroy();
  });

  it("falha no PUT dos bytes não confirma o upload", async () => {
    const rest = createMockRest();
    const client = new SquordClient({ token: TOKEN, apiBaseURL: "https://mock.test", fetchImpl: rest.fetch, restOnly: true });
    rest.get("/bots/@me", () => ({ status: 200, body: fixtures.bot() }));
    rest.post("/uploads", () => ({
      status: 201,
      body: {
        upload: {
          id: "u1",
          scope: "attachments",
          filename: "a.txt",
          contentType: "text/plain",
          size: 3,
          status: "PENDING",
          url: null,
          thumbnailUrl: null,
          guildId: "g",
          storageKey: "k",
          scanStatus: "NOT_REQUIRED",
          animated: false,
          animatedUrl: null,
          createdAt: "2026-10-05T12:00:00.000Z",
          expiresAt: "2026-10-05T13:15:00.000Z",
        },
        target: {
          uploadUrl: "https://media-mock.example/attachments/key",
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          storageKey: "k",
          publicUrl: "https://media.squord.com.br/k",
          expiresAt: "2026-10-05T12:15:00.000Z",
        },
      },
    }));
    rest.on("PUT", "/attachments/:key", () => ({ status: 500, body: "boom" }));

    await client.login();
    const error = await client.uploads
      .upload({ guildId: "g", filename: "a.txt", contentType: "text/plain", data: Buffer.from("abc") })
      .catch((e: unknown) => e);
    expect((error as Error).name).toBe("NetworkError");
    expect((error as Error).message).toContain("500");
    await client.destroy();
  });

  it("valida tamanho e requer dados", async () => {
    const rest = createMockRest();
    const client = new SquordClient({ token: TOKEN, apiBaseURL: "https://mock.test", fetchImpl: rest.fetch, restOnly: true });
    rest.get("/bots/@me", () => ({ status: 200, body: fixtures.bot() }));
    await client.login();

    await expect(
      client.uploads.upload({ guildId: "g", filename: "a.txt" }),
    ).rejects.toThrow(/path ou data/);
    await expect(
      client.uploads.upload({ guildId: "g", data: Buffer.alloc(0) }),
    ).rejects.toThrow(/vazio/);
    await expect(
      client.uploads.upload({
        guildId: "g",
        data: Buffer.from("abc"),
        size: 524_288_001,
        contentType: "text/plain",
        filename: "big.bin",
      }),
    ).rejects.toThrow(/500 MB/);
    await expect(
      client.uploads.upload({ guildId: "g", size: 10, contentType: "text/plain" }),
    ).rejects.toThrow(/path ou data/);
    await client.destroy();
  });
});
