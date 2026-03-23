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

  it("get_stats with reportType conversions calls getConversionDetails", async () => {
    const { client, mockApi } = await createToolClient(statsModule);
    const api = mockApi as MockPartnersClient;
    api.getConversionDetails.mockResolvedValue({
      rows: [{ conversionType: "Approve", campaign: "Test (123)", adId: 100, conversionTime: "01.03.2026 12:00:00" }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_get_stats",
      arguments: { reportType: "conversions", period: "7days" },
    });
    const text = getTextFromResult(result);

    expect(api.getConversionDetails).toHaveBeenCalled();
    expect(text).toContain("Conversion Details");
  });
});
