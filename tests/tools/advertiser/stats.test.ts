import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
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

  it("custom report resolves sortBy alias 'spend' to 'finance_moneyOut'", async () => {
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
      arguments: { reportType: "custom", period: "7days", sortBy: "spend", sortOrder: "desc" },
    });

    const params = api.getReportData.mock.calls[0][0];
    expect(params.sort).toEqual({ finance_moneyOut: "desc" });
  });

  it("custom report wires countries and creativeIds into filters", async () => {
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
      arguments: {
        reportType: "custom",
        period: "7days",
        countries: "US, DE",
        creativeIds: "101,202",
      },
    });

    const params = api.getReportData.mock.calls[0][0] as Record<string, unknown>;
    const filters = (params.filters as Record<string, unknown>).filters as Array<
      Record<string, unknown>
    >;
    expect(filters).toContainEqual({ id: "traffic_region", type: "list", include: ["US", "DE"] });
    expect(filters).toContainEqual({ id: "advertiser_ad", type: "list", include: [101, 202] });
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

  it("sites report nests params under filters and uses sort object", async () => {
    const { client, mockApi } = await createToolClient(statsModule);
    const api = mockApi as MockPartnersClient;
    api.getSiteStats.mockResolvedValue({
      rows: [{ siteName: "example.com", spend: 5 }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    await client.callTool({
      name: "kadam_adv_get_stats",
      arguments: {
        reportType: "sites",
        period: "7days",
        sortBy: "spend",
        sortOrder: "desc",
        campaignIds: "863067",
      },
    });

    const params = api.getSiteStats.mock.calls[0][0] as Record<string, unknown>;
    expect(params.sort).toEqual({ spend: "desc" });
    const filters = params.filters as Record<string, unknown>;
    expect(filters.campaignIds).toEqual([863067]);
    expect(filters.view).toBe("all");
    expect(filters.dateFrom).toBeDefined();
  });

  it("get_stats with reportType conversions calls getConversionDetails", async () => {
    const { client, mockApi } = await createToolClient(statsModule);
    const api = mockApi as MockPartnersClient;
    api.getConversionDetails.mockResolvedValue({
      rows: [
        {
          conversionType: "Approve",
          campaign: "Test (123)",
          adId: 100,
          conversionTime: "01.03.2026 12:00:00",
        },
      ],
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

  it("conversions report resolves sortBy alias in sort key", async () => {
    const { client, mockApi } = await createToolClient(statsModule);
    const api = mockApi as MockPartnersClient;
    api.getConversionDetails.mockResolvedValue({
      rows: [
        { conversionType: "Approve", campaign: "Test", adId: 1, conversionTime: "01.03.2026" },
      ],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    await client.callTool({
      name: "kadam_adv_get_stats",
      arguments: { reportType: "conversions", period: "7days", sortBy: "spend", sortOrder: "asc" },
    });

    const params = api.getConversionDetails.mock.calls[0][0];
    expect(params.sort).toEqual({ finance_moneyOut: "asc" });
  });
});
