import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolWrapper } from "../../src/middleware/tool-wrapper.js";
import { resetConfig } from "../../src/config.js";
import { registerResources } from "../../src/resources/index.js";
import { registerPrompts } from "../../src/prompts/index.js";
import { advToolModules } from "../../src/tools/advertiser/index.js";
import { pubToolModules } from "../../src/tools/publisher/index.js";

vi.mock("../../src/api/partners-client.js");
vi.mock("../../src/api/pub-client.js");

vi.mock("../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

async function createFullServer() {
  const server = new McpServer(
    { name: "@kadam/mcp-server", version: "0.1.0" },
    { instructions: "Test instructions" },
  );
  const wrapper = new ToolWrapper(server);

  registerResources(server);
  registerPrompts(server);

  for (const mod of advToolModules) {
    mod.register(wrapper);
  }
  for (const mod of pubToolModules) {
    mod.register(wrapper);
  }

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  return { server, client };
}

describe("Tool listing integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.KADAM_ADV_API_KEY = "test-key";
    process.env.KADAM_PUB_API_KEY = "test-key";
    resetConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  it("all 27 tools are listed", async () => {
    const { client } = await createFullServer();
    const result = await client.listTools();
    expect(result.tools).toBeDefined();
    expect(result.tools!.length).toBe(27);
  });

  it("all advertiser tools have names starting with kadam_adv_", async () => {
    const { client } = await createFullServer();
    const result = await client.listTools();
    const advTools = result.tools!.filter((t) => t.name!.startsWith("kadam_adv_"));
    const nonAdvAdvertiserTools = result.tools!.filter(
      (t) => !t.name!.startsWith("kadam_adv_") && !t.name!.startsWith("kadam_pub_"),
    );
    expect(nonAdvAdvertiserTools).toHaveLength(0);
    expect(advTools.length).toBeGreaterThan(0);
    advTools.forEach((t) => expect(t.name).toMatch(/^kadam_adv_/));
  });

  it("all publisher tools have names starting with kadam_pub_", async () => {
    const { client } = await createFullServer();
    const result = await client.listTools();
    const pubTools = result.tools!.filter((t) => t.name!.startsWith("kadam_pub_"));
    expect(pubTools.length).toBeGreaterThan(0);
    pubTools.forEach((t) => expect(t.name).toMatch(/^kadam_pub_/));
  });

  it("every tool has a non-empty description", async () => {
    const { client } = await createFullServer();
    const result = await client.listTools();
    result.tools!.forEach((t) => {
      expect(t.description).toBeDefined();
      expect(typeof t.description).toBe("string");
      expect(t.description!.trim().length).toBeGreaterThan(0);
    });
  });

  it("every tool has an inputSchema", async () => {
    const { client } = await createFullServer();
    const result = await client.listTools();
    result.tools!.forEach((t) => {
      expect(t.inputSchema).toBeDefined();
      expect(typeof t.inputSchema).toBe("object");
    });
  });

  it("7 resources listed", async () => {
    const { client } = await createFullServer();
    const result = await client.listResources();
    expect(result.resources).toBeDefined();
    expect(result.resources!.length).toBe(7);
  });

  it("resource kadam://reference/campaign-types content contains Push (id: 30)", async () => {
    const { client } = await createFullServer();
    const result = await client.readResource({ uri: "kadam://reference/campaign-types" });
    expect(result.contents).toBeDefined();
    expect(result.contents!.length).toBeGreaterThan(0);
    const textContent = result.contents!.find((c) => "text" in c) as { text: string } | undefined;
    expect(textContent).toBeDefined();
    expect(textContent!.text).toContain("Push (id: 30)");
  });

  it("resource kadam://reference/pricing-models content contains CPC", async () => {
    const { client } = await createFullServer();
    const result = await client.readResource({ uri: "kadam://reference/pricing-models" });
    expect(result.contents).toBeDefined();
    expect(result.contents!.length).toBeGreaterThan(0);
    const textContent = result.contents!.find((c) => "text" in c) as { text: string } | undefined;
    expect(textContent).toBeDefined();
    expect(textContent!.text).toContain("CPC");
  });

  it("4 prompts listed", async () => {
    const { client } = await createFullServer();
    const result = await client.listPrompts();
    expect(result.prompts).toBeDefined();
    expect(result.prompts!.length).toBe(4);
  });

  it("prompt kadam_launch_campaign exists", async () => {
    const { client } = await createFullServer();
    const result = await client.listPrompts();
    const prompt = result.prompts!.find((p) => p.name === "kadam_launch_campaign");
    expect(prompt).toBeDefined();
  });

  it("prompt kadam_campaign_performance exists", async () => {
    const { client } = await createFullServer();
    const result = await client.listPrompts();
    const prompt = result.prompts!.find((p) => p.name === "kadam_campaign_performance");
    expect(prompt).toBeDefined();
  });

  it("tool kadam_adv_list_campaigns has readOnlyHint annotation", async () => {
    const { client } = await createFullServer();
    const result = await client.listTools();
    const tool = result.tools!.find((t) => t.name === "kadam_adv_list_campaigns");
    expect(tool).toBeDefined();
    expect(tool!.annotations).toBeDefined();
    expect(tool!.annotations!.readOnlyHint).toBe(true);
  });
});
