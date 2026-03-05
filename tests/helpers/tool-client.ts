import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolWrapper } from "../../src/middleware/tool-wrapper.js";
import type { ToolModule } from "../../src/types/tool-module.js";
import { ClientPool } from "../../src/api/client-pool.js";
import { vi } from "vitest";

export function createMockClientPool(): ClientPool {
  const pool = new ClientPool({
    advBaseUrl: "https://partners.kadam.net/api/v1",
    pubBaseUrl: "https://pub.kadam.net/api",
  });
  return pool;
}

export function createMockPartnersClient() {
  return {
    listCampaigns: vi.fn(),
    createCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    setCampaignStatus: vi.fn(),
    listCampaignFolders: vi.fn(),
    createCampaignFolder: vi.fn(),
    updateCampaignFolder: vi.fn(),
    listAudiences: vi.fn(),
    getAudience: vi.fn(),
    createAudience: vi.fn(),
    updateAudience: vi.fn(),
    deleteAudience: vi.fn(),
    listCreatives: vi.fn(),
    createCreative: vi.fn(),
    updateCreative: vi.fn(),
    setCreativeStatus: vi.fn(),
    listFinanceOperations: vi.fn(),
    getReportConfig: vi.fn(),
    getReportData: vi.fn(),
    getSiteStats: vi.fn(),
    getPostbackStats: vi.fn(),
  };
}

export function createMockPubClient() {
  return {
    listSources: vi.fn(),
    createSource: vi.fn(),
    getSource: vi.fn(),
    updateSource: vi.fn(),
    setSourceStatus: vi.fn(),
    listAdUnits: vi.fn(),
    setAdUnitStatus: vi.fn(),
    getUserInfo: vi.fn(),
    getReportConfig: vi.fn(),
    getReportData: vi.fn(),
  };
}

export type MockPartnersClient = ReturnType<typeof createMockPartnersClient>;
export type MockPubClient = ReturnType<typeof createMockPubClient>;

export async function createToolClient(
  module: ToolModule,
  mockApi?: MockPartnersClient | MockPubClient,
) {
  const pool = createMockClientPool();

  const mockAdv = module.product === "advertiser" ? (mockApi ?? createMockPartnersClient()) : createMockPartnersClient();
  const mockPub = module.product === "publisher" ? (mockApi ?? createMockPubClient()) : createMockPubClient();

  vi.spyOn(pool, "resolve").mockReturnValue({
    adv: mockAdv as never,
    pub: mockPub as never,
  });

  const server = new McpServer({ name: "test", version: "0.0.1" });
  const wrapper = new ToolWrapper(server, pool);
  module.register(wrapper);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return { client, mockApi: module.product === "advertiser" ? mockAdv : mockPub };
}

export function getTextFromResult(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text: string }> })?.content;
  return content?.[0]?.text ?? "";
}
