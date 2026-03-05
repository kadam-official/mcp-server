import { createToolClient, getTextFromResult, type MockPartnersClient } from "../../helpers/tool-client.js";
import { statsModule } from "../../../src/tools/advertiser/stats.js";
import { resetConfig } from "../../../src/config.js";

vi.mock("../../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

beforeEach(() => {
  process.env.KADAM_ADV_API_KEY = "test-adv-key";
});
afterEach(() => {
  delete process.env.KADAM_ADV_API_KEY;
  resetConfig();
});

describe("advertiser stats tools", () => {
  it("get_stats with reportType custom calls getReportConfig and getReportData", async () => {
    const { client, mockApi } = await createToolClient(statsModule);
    const api = mockApi as MockPartnersClient;
    api.getReportConfig.mockResolvedValue({
      groups: { time: [{ id: "time_day" }] },
      metrics: { finance: [{ id: "finance_moneyOut" }] },
    });
    api.getReportData.mockResolvedValue({
      rows: [{ time_day: "2025-03-01", finance_moneyOut: 100 }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    await client.callTool({
      name: "kadam_adv_get_stats",
      arguments: { reportType: "custom", period: "7days" },
    });

    expect(api.getReportConfig).toHaveBeenCalled();
    expect(api.getReportData).toHaveBeenCalled();
  });

  it("get_stats with reportType sites calls getSiteStats", async () => {
    const { client, mockApi } = await createToolClient(statsModule);
    const api = mockApi as MockPartnersClient;
    api.getSiteStats.mockResolvedValue({
      rows: [{ siteName: "example.com", impressions: 1000, clicks: 10, spend: 5 }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_get_stats",
      arguments: { reportType: "sites", period: "7days" },
    });
    const text = getTextFromResult(result);

    expect(api.getSiteStats).toHaveBeenCalled();
    expect(text).toContain("Site stats");
  });

  it("get_stats with reportType postbacks calls getPostbackStats", async () => {
    const { client, mockApi } = await createToolClient(statsModule);
    const api = mockApi as MockPartnersClient;
    api.getPostbackStats.mockResolvedValue({
      rows: [{ campaign: "Test", conversions: 5 }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_get_stats",
      arguments: { reportType: "postbacks", period: "7days" },
    });
    const text = getTextFromResult(result);

    expect(api.getPostbackStats).toHaveBeenCalled();
    expect(text).toContain("Postback stats");
  });
});
