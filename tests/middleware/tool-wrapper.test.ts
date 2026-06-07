import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { ToolWrapper, type ToolCredentials } from "../../src/middleware/tool-wrapper.js";
import { ApiError } from "../../src/api/http-client.js";
import { resetConfig } from "../../src/config.js";
import { ClientPool } from "../../src/api/client-pool.js";

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

async function createTestSetup(credentials: ToolCredentials = { advKey: "test-key" }) {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  const wrapper = new ToolWrapper(server, createPool(), credentials);

  wrapper.register(
    { name: "test_tool", description: "A test tool", product: "advertiser" },
    { input: z.string() },
    async (args) => `Result: ${args.input}`,
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { server, wrapper, client };
}

describe("ToolWrapper", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    resetConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  it("registered tool appears in client.listTools() result", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    const { client } = await createTestSetup();
    const result = await client.listTools();
    expect(result.tools).toBeDefined();
    const tool = result.tools!.find((t) => t.name === "test_tool");
    expect(tool).toBeDefined();
    expect(tool!.description).toBe("A test tool");
  });

  it("successful call returns content with text result", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    const { client } = await createTestSetup();
    const result = await client.callTool({
      name: "test_tool",
      arguments: { input: "hello" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content![0]).toMatchObject({ type: "text", text: "Result: hello" });
  });

  it("missing API key returns isError with message containing KADAM_ADV_API_KEY", async () => {
    const { client } = await createTestSetup({});
    const result = await client.callTool({
      name: "test_tool",
      arguments: { input: "hello" },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const textContent = result.content![0];
    expect(textContent).toMatchObject({ type: "text" });
    expect((textContent as { text: string }).text).toContain("KADAM_ADV_API_KEY");
  });

  it("handler that throws ApiError(404) returns Resource not found", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, createPool(), { advKey: "test-key" });
    wrapper.register(
      { name: "fail_404", description: "Fails with 404", product: "advertiser" },
      { input: z.string() },
      async () => {
        throw new ApiError("Not found", 404);
      },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await client.callTool({
      name: "fail_404",
      arguments: { input: "x" },
    });
    expect(result.isError).toBe(true);
    const textContent = result.content![0] as { text: string };
    expect(textContent.text).toBe("Resource not found. Verify the ID is correct.");
  });

  it("handler that throws ApiError(422, message) returns Validation error", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, createPool(), { advKey: "test-key" });
    wrapper.register(
      { name: "fail_422", description: "Fails with 422", product: "advertiser" },
      { input: z.string() },
      async () => {
        throw new ApiError("Bad field", 422);
      },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await client.callTool({
      name: "fail_422",
      arguments: { input: "x" },
    });
    expect(result.isError).toBe(true);
    const textContent = result.content![0] as { text: string };
    expect(textContent.text).toBe("Validation error: Bad field");
  });

  it("handler that throws generic Error returns Error: message", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, createPool(), { advKey: "test-key" });
    wrapper.register(
      { name: "fail_generic", description: "Fails with generic error", product: "advertiser" },
      { input: z.string() },
      async () => {
        throw new Error("Something went wrong");
      },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await client.callTool({
      name: "fail_generic",
      arguments: { input: "x" },
    });
    expect(result.isError).toBe(true);
    const textContent = result.content![0] as { text: string };
    expect(textContent.text).toBe("Error: Something went wrong");
  });

  it("tool with advertiser product works with ADV key set", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, createPool(), { advKey: "test-key" });
    wrapper.register(
      { name: "adv_tool", description: "Adv tool", product: "advertiser" },
      { input: z.string() },
      async (args) => `Result: ${args.input}`,
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await client.callTool({
      name: "adv_tool",
      arguments: { input: "works" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.content![0]).toMatchObject({ type: "text", text: "Result: works" });
  });

  it("tool with product publisher requires KADAM_PUB_API_KEY", async () => {
    process.env.KADAM_ADV_API_KEY = "adv-key";
    delete process.env.KADAM_PUB_API_KEY;
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, createPool(), { advKey: "test-key" });
    wrapper.register(
      { name: "pub_tool", description: "Publisher tool", product: "publisher" },
      { input: z.string() },
      async (args) => `Result: ${args.input}`,
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await client.callTool({
      name: "pub_tool",
      arguments: { input: "x" },
    });
    expect(result.isError).toBe(true);
    const textContent = result.content![0] as { text: string };
    expect(textContent.text).toContain("KADAM_PUB_API_KEY");
  });

  it("handler that throws ZodError returns formatted validation message", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, createPool(), { advKey: "test-key" });
    wrapper.register(
      { name: "fail_zod", description: "Fails with ZodError", product: "advertiser" },
      { input: z.string() },
      async () => {
        z.object({ id: z.number() }).parse({ id: "not-a-number" });
        return "unreachable";
      },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await client.callTool({
      name: "fail_zod",
      arguments: { input: "x" },
    });
    expect(result.isError).toBe(true);
    const textContent = result.content![0] as { text: string };
    expect(textContent.text).toContain("API response validation failed");
    expect(textContent.text).toContain("id");
  });

  it("handler that throws ApiError(401) returns invalid key message", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, createPool(), { advKey: "test-key" });
    wrapper.register(
      { name: "fail_401", description: "Fails with 401", product: "advertiser" },
      { input: z.string() },
      async () => {
        throw new ApiError("Unauthorized", 401);
      },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await client.callTool({
      name: "fail_401",
      arguments: { input: "x" },
    });
    expect(result.isError).toBe(true);
    const textContent = result.content![0] as { text: string };
    expect(textContent.text).toBe(
      "API key is invalid or expired. Check your API key configuration.",
    );
  });

  it("handler that throws ApiError(500) returns generic API error", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, createPool(), { advKey: "test-key" });
    wrapper.register(
      { name: "fail_500", description: "Fails with 500", product: "advertiser" },
      { input: z.string() },
      async () => {
        throw new ApiError("Internal Server Error", 500);
      },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await client.callTool({
      name: "fail_500",
      arguments: { input: "x" },
    });
    expect(result.isError).toBe(true);
    const textContent = result.content![0] as { text: string };
    expect(textContent.text).toBe("API error (500): Internal Server Error");
  });

  it("invalid input args are rejected by MCP SDK", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const wrapper = new ToolWrapper(server, createPool(), { advKey: "test-key" });
    wrapper.register(
      { name: "strict_tool", description: "Strict input", product: "advertiser" },
      { count: z.number().min(1) },
      async (args) => `Count: ${args.count}`,
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await client.callTool({ name: "strict_tool", arguments: { count: -1 } });
    expect(result.isError).toBe(true);
  });
});
