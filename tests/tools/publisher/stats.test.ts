import {
  createToolClient,
  getTextFromResult,
  type MockPubClient,
} from "../../helpers/tool-client.js";
import { pubStatsModule } from "../../../src/tools/publisher/stats.js";
import { resetConfig } from "../../../src/config.js";

vi.mock("../../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

beforeEach(() => {
  process.env.KADAM_PUB_API_KEY = "test-pub-key";
});
afterEach(() => {
  delete process.env.KADAM_PUB_API_KEY;
  resetConfig();
});

describe("publisher stats tools", () => {
  it("get_stats calls getReportConfig and getReportData", async () => {
    const { client, mockApi } = await createToolClient(pubStatsModule);
    const api = mockApi as MockPubClient;
    api.getReportConfig.mockResolvedValue({
      groups: { time: [{ id: "time_day" }] },
      metrics: {
        finance: [{ id: "finance_revenue" }],
        traffic: [{ id: "traffic_views" }, { id: "traffic_clicks" }],
      },
    });
    api.getReportData.mockResolvedValue({
      rows: [{ time_day: "2025-03-01", finance_revenue: 50 }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_pub_get_stats",
      arguments: { groupBy: "day", period: "7days" },
    });
    const text = getTextFromResult(result);

    expect(api.getReportConfig).toHaveBeenCalled();
    expect(api.getReportData).toHaveBeenCalled();
    expect(text).toContain("Publisher Stats");
  });

  it("resolves sortBy alias 'revenue' to 'finance_moneyIn'", async () => {
    const { client, mockApi } = await createToolClient(pubStatsModule);
    const api = mockApi as MockPubClient;
    api.getReportConfig.mockResolvedValue({
      groups: { time: [{ id: "time_day" }] },
      metrics: {
        finance: [{ id: "finance_moneyIn" }],
        traffic: [{ id: "traffic_views" }, { id: "traffic_clicks" }],
      },
    });
    api.getReportData.mockResolvedValue({
      rows: [{ time_day: "2025-03-01", finance_moneyIn: 50 }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    await client.callTool({
      name: "kadam_pub_get_stats",
      arguments: { groupBy: "day", period: "7days", sortBy: "revenue", sortOrder: "desc" },
    });

    const params = api.getReportData.mock.calls[0][0];
    expect(params.sort).toEqual({ finance_moneyIn: "desc" });
  });

  it("config caching - call get_stats twice, getReportConfig called expected times", async () => {
    const { client, mockApi } = await createToolClient(pubStatsModule);
    const api = mockApi as MockPubClient;
    api.getReportConfig.mockResolvedValue({
      groups: { time: [{ id: "time_day" }] },
      metrics: {
        finance: [{ id: "finance_revenue" }],
        traffic: [{ id: "traffic_views" }, { id: "traffic_clicks" }],
      },
    });
    api.getReportData.mockResolvedValue({
      rows: [{ time_day: "2025-03-01", finance_revenue: 50 }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    await client.callTool({
      name: "kadam_pub_get_stats",
      arguments: { groupBy: "day", period: "7days" },
    });
    await client.callTool({
      name: "kadam_pub_get_stats",
      arguments: { groupBy: "day", period: "7days" },
    });

    expect(api.getReportConfig).toHaveBeenCalledTimes(2);
  });

  it("warns about unknown metrics and still resolves the valid ones", async () => {
    const { client, mockApi } = await createToolClient(pubStatsModule);
    const api = mockApi as MockPubClient;
    api.getReportConfig.mockResolvedValue({
      groups: { time: [{ id: "time_day" }] },
      metrics: { finance: [{ id: "finance_moneyIn" }], traffic: [{ id: "traffic_clicks" }] },
    });
    api.getReportData.mockResolvedValue({
      rows: [{ time_day: "2025-03-01", finance_moneyIn: 50 }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_pub_get_stats",
      arguments: { groupBy: "day", period: "7days", metrics: "revenue,clicks,foo" },
    });
    const text = getTextFromResult(result);

    const params = api.getReportData.mock.calls[0][0] as Record<string, unknown>;
    expect(params.metrics).toEqual(["finance_moneyIn", "traffic_clicks"]); // revenue -> moneyIn
    expect(text).toContain("ignored unknown metric(s): foo");
  });

  it("returns a config-derived hint when groupBy does not resolve", async () => {
    const { client, mockApi } = await createToolClient(pubStatsModule);
    const api = mockApi as MockPubClient;
    api.getReportConfig.mockResolvedValue({
      groups: { time: [{ id: "time_day" }] },
      metrics: { finance: [{ id: "finance_moneyIn" }] },
    });

    const result = await client.callTool({
      name: "kadam_pub_get_stats",
      arguments: { groupBy: "nonexistent", period: "7days" },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("No valid groupBy found");
    expect(text).toContain("day"); // time_day -> friendly "day"
    expect(api.getReportData).not.toHaveBeenCalled();
  });

  it("resolves a GROUP sortBy to its id (not just metrics)", async () => {
    const { client, mockApi } = await createToolClient(pubStatsModule);
    const api = mockApi as MockPubClient;
    api.getReportConfig.mockResolvedValue({
      groups: { webmaster: [{ id: "webmaster_source" }], time: [{ id: "time_day" }] },
      metrics: { finance: [{ id: "finance_moneyIn" }] },
    });
    api.getReportData.mockResolvedValue({
      rows: [{ webmaster_source: "X", finance_moneyIn: 1 }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    await client.callTool({
      name: "kadam_pub_get_stats",
      arguments: {
        groupBy: "source",
        period: "7days",
        metrics: "revenue",
        sortBy: "source",
        sortOrder: "asc",
      },
    });

    const params = api.getReportData.mock.calls[0][0] as Record<string, unknown>;
    expect(params.sort).toEqual({ webmaster_source: "asc" });
  });
});
