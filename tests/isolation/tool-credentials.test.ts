import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { ToolWrapper } from "../../src/middleware/tool-wrapper.js";
import { ClientPool } from "../../src/api/client-pool.js";
import { sessionCredentials } from "../../src/http-session.js";
import { resetConfig } from "../../src/config.js";

vi.mock("../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function createPool(): ClientPool {
  return new ClientPool({
    advBaseUrl: "https://partners.kadam.net/api/v1",
    pubBaseUrl: "https://pub.kadam.net/api",
  });
}

async function connect(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe("tool credential isolation (HTTP multi-tenant)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  // Regression for the v0.4.2 bug: resolveProductContext used getConfig() env
  // key instead of the per-request Bearer. With an env key set AND a different
  // session Bearer, a tool call must resolve the Bearer-seeded client and never
  // touch the env key.
  it("advertiser tool resolves the session Bearer, ignoring the env key", async () => {
    process.env.KADAM_ADV_API_KEY = "ENV_KEY";
    resetConfig();

    const pool = createPool();
    const resolveSpy = vi.spyOn(pool, "resolve").mockReturnValue({ adv: {} as never, pub: null });

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, pool, sessionCredentials("BEARER_KEY", "adv"));
    wrapper.register(
      { name: "kadam_adv_probe", description: "probe", product: "advertiser" },
      { input: z.string() },
      async (args) => `ok:${args.input}`,
    );
    const client = await connect(server);

    const result = await client.callTool({ name: "kadam_adv_probe", arguments: { input: "x" } });

    expect(result.isError).toBeFalsy();
    expect(resolveSpy).toHaveBeenCalledWith("BEARER_KEY", undefined);
    expect(resolveSpy).not.toHaveBeenCalledWith("ENV_KEY", undefined);
  });

  it("publisher tool resolves the session Bearer, ignoring the env key", async () => {
    process.env.KADAM_PUB_API_KEY = "ENV_PUB_KEY";
    resetConfig();

    const pool = createPool();
    const resolveSpy = vi.spyOn(pool, "resolve").mockReturnValue({ adv: null, pub: {} as never });

    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, pool, sessionCredentials("PUB_BEARER", "pub"));
    wrapper.register(
      { name: "kadam_pub_probe", description: "probe", product: "publisher" },
      { input: z.string() },
      async (args) => `ok:${args.input}`,
    );
    const client = await connect(server);

    const result = await client.callTool({ name: "kadam_pub_probe", arguments: { input: "x" } });

    expect(result.isError).toBeFalsy();
    expect(resolveSpy).toHaveBeenCalledWith(undefined, "PUB_BEARER");
    expect(resolveSpy).not.toHaveBeenCalledWith(undefined, "ENV_PUB_KEY");
  });

  describe("sessionCredentials", () => {
    it("maps an advertiser session Bearer to advKey only", () => {
      expect(sessionCredentials("tok", "adv")).toEqual({ advKey: "tok" });
    });

    it("maps a publisher session Bearer to pubKey only", () => {
      expect(sessionCredentials("tok", "pub")).toEqual({ pubKey: "tok" });
    });
  });
});
