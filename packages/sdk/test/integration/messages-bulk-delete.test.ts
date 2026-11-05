import { describe, expect, it } from "vitest";
import { SquordClient } from "../../src/client/SquordClient";
import { SquordTypeError } from "../../src/errors";
import { createMockEnvironment } from "../../src/testing/index";

const CHANNEL = "1300000000000000040";

describe("client.messages.bulkDelete", () => {
  it("devolve os ids apagados pelo servidor e envia { messageIds }", async () => {
    const env = createMockEnvironment();
    const client = new SquordClient({
      token: "sqb_1300000000000000010.demo",
      ...env.options,
    });

    env.rest.post("/channels/:channelId/messages/bulk-delete", () => ({
      status: 200,
      body: { messageIds: ["1300000000000000101"] },
    }));

    const deleted = await client.messages.bulkDelete(CHANNEL, [
      "1300000000000000101",
      "1300000000000000102",
    ]);

    expect(deleted).toEqual(["1300000000000000101"]);
    const call = env.rest.lastCall!;
    expect(call.path).toBe(`/channels/${CHANNEL}/messages/bulk-delete`);
    expect(call.body).toEqual({ messageIds: ["1300000000000000101", "1300000000000000102"] });

    await client.destroy();
  });

  it("rejeita lista vazia e mais de 100 ids sem fazer requisição", async () => {
    const env = createMockEnvironment();
    const client = new SquordClient({
      token: "sqb_1300000000000000010.demo",
      ...env.options,
    });

    const before = env.rest.callLog.length;
    await expect(client.messages.bulkDelete(CHANNEL, [])).rejects.toBeInstanceOf(SquordTypeError);

    const tooMany = Array.from({ length: 101 }, (_, i) => `13000000000000${String(1000 + i)}`);
    await expect(client.messages.bulkDelete(CHANNEL, tooMany)).rejects.toBeInstanceOf(SquordTypeError);

    expect(env.rest.callLog.length).toBe(before);

    await client.destroy();
  });
});
