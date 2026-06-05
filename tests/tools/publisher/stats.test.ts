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
});
