import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { resetConfig } from "../src/config.js";
import { ClientPool } from "../src/api/client-pool.js";
import { createMcpServer } from "../src/server-factory.js";

vi.mock("../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    debug: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

async function connectServer(envOverrides: Record<string, string | undefined>) {
  const originalEnv = { ...process.env };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetConfig();

  const pool = new ClientPool({
    advBaseUrl: "https://partners.kadam.net/api/v1",
    pubBaseUrl: "https://pub.kadam.net/api",
  });

  const server = createMcpServer(pool);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return {
    client,
    cleanup: () => {
      process.env = originalEnv;
      resetConfig();
    },
  };
}

describe("createMcpServer", () => {
  afterEach(() => {
    resetConfig();
  });

  it("registers only advertiser tools when only ADV key set", async () => {
    const { client, cleanup } = await connectServer({
      KADAM_ADV_API_KEY: "test-adv",
      KADAM_PUB_API_KEY: undefined,
    });
    try {
      const result = await client.listTools();
      const advTools = result.tools!.filter((t) => t.name!.startsWith("kadam_adv_"));
      const pubTools = result.tools!.filter((t) => t.name!.startsWith("kadam_pub_"));
      expect(advTools.length).toBeGreaterThan(0);
      expect(pubTools).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("registers only publisher tools when only PUB key set", async () => {
    const { client, cleanup } = await connectServer({
      KADAM_ADV_API_KEY: undefined,
      KADAM_PUB_API_KEY: "test-pub",
    });
    try {
      const result = await client.listTools();
      const advTools = result.tools!.filter((t) => t.name!.startsWith("kadam_adv_"));
      const pubTools = result.tools!.filter((t) => t.name!.startsWith("kadam_pub_"));
      expect(advTools).toHaveLength(0);
      expect(pubTools.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("registers both tool sets when both keys set", async () => {
    const { client, cleanup } = await connectServer({
      KADAM_ADV_API_KEY: "test-adv",
      KADAM_PUB_API_KEY: "test-pub",
    });
    try {
      const result = await client.listTools();
      const advTools = result.tools!.filter((t) => t.name!.startsWith("kadam_adv_"));
      const pubTools = result.tools!.filter((t) => t.name!.startsWith("kadam_pub_"));
      expect(advTools.length).toBeGreaterThan(0);
      expect(pubTools.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("registers prompts regardless of keys", async () => {
    const { client, cleanup } = await connectServer({
      KADAM_ADV_API_KEY: undefined,
      KADAM_PUB_API_KEY: undefined,
    });
    try {
      const prompts = await client.listPrompts();
      expect(prompts.prompts!.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("scopes resources to the active cabinet (advertiser key -> advertiser resources)", async () => {
    const { client, cleanup } = await connectServer({
      KADAM_ADV_API_KEY: "test-adv",
      KADAM_PUB_API_KEY: undefined,
    });
    try {
      const resources = await client.listResources();
      const uris = (resources.resources ?? []).map((r) => r.uri);
      expect(uris).toContain("kadam://reference/campaign-types");
      expect(uris).not.toContain("kadam://reference/site-states");
    } finally {
      cleanup();
    }
  });
});
