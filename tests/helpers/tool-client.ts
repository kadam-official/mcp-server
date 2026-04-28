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

function createMockOptionsRegistry() {
  const defaultOpts = {
    cpTypes: [{ id: 0, label: "CPC" }, { id: 2, label: "CPM" }, { id: 4, label: "CPA Target" }],
    countries: [{ id: 34, code: "US", label: "United States", tier: 1 }, { id: 24, code: "DE", label: "Germany", tier: 1 }, { id: 40, code: "BR", label: "Brazil", tier: null }],
    countriesPresets: [],
    browsers: [{ id: 8, label: "Chrome" }],
    devices: [{ id: 1, label: "Desktop" }],
    platformVersions: [{ id: 10, label: "Android" }],
    languages: [{ id: 2, label: "English" }],
    categories: [
      { id: 1001, label: "Adult content (IAB25-3)" },
      { id: 122, label: "News (IAB12)", children: [{ id: 1567, label: "News general" }] },
      { id: "mainstream", label: "Mainstream" },
    ],
    ages: [],
    subAges: [{ id: 1, label: "Newest", period: "1 day" }, { id: 2, label: "New", period: "2-6 days" }, { id: 3, label: "Medium", period: "7-13 days" }, { id: 4, label: "Old", period: "14+ days" }],
    audiences: [],
    limits: { dayMoneyLimit: 300 },
    bidCoefficients: { maxWithoutStatCPC: 65 },
    options: { allowAgeSelection: true, allowGenderSelection: true, showInterests: false, postbackLink: "" },
    folders: [],
    conversionTemplates: [],
  };

  const countryMap = new Map<string, number>();
  for (const c of defaultOpts.countries) countryMap.set(c.code, c.id);

  return {
    getCampaignOptions: vi.fn().mockResolvedValue(defaultOpts),
    getMaterialOptions: vi.fn().mockResolvedValue({ sizes: [] }),
    resolveCountryIds: vi.fn().mockImplementation(async (codes: string) =>
      codes.split(",").map((s: string) => {
        const id = countryMap.get(s.trim().toUpperCase());
        if (id === undefined) throw new Error(`Unknown: ${s.trim()}`);
        return id;
      }),
    ),
    resolveIds: vi.fn().mockImplementation(async (_kind: string, input: string) =>
      input.split(",").map((s: string) => s.trim()),
    ),
    getCountryMap: vi.fn().mockResolvedValue(countryMap),
    getNameResolvers: vi.fn(),
    preload: vi.fn(),
  };
}

export function createMockPartnersClient() {
  return {
    options: createMockOptionsRegistry(),
    listCampaigns: vi.fn(),
    getCampaign: vi.fn(),
    createCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    setCampaignStatus: vi.fn(),
    updateCampaignBid: vi.fn(),
    bulkUpdateCampaignBids: vi.fn(),
    updateSiteBids: vi.fn(),
    listCampaignFolders: vi.fn(),
    createCampaignFolder: vi.fn(),
    updateCampaignFolder: vi.fn(),
    listAudiences: vi.fn(),
    getAudience: vi.fn(),
    createAudience: vi.fn(),
    updateAudience: vi.fn(),
    deleteAudience: vi.fn(),
    listCreatives: vi.fn(),
    getMaterial: vi.fn(),
    createCreative: vi.fn(),
    updateCreative: vi.fn(),
    setCreativeStatus: vi.fn(),
    listFinanceOperations: vi.fn(),
    getReportConfig: vi.fn(),
    getReportData: vi.fn(),
    getSiteStats: vi.fn(),
    getConversionDetails: vi.fn(),
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
