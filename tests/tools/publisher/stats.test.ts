import { createToolClient, getTextFromResult } from "../../helpers/tool-client.js";
import { pubStatsModule } from "../../../src/tools/publisher/stats.js";
import * as api from "../../../src/api/pub-client.js";

vi.mock("../../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../../src/api/pub-client.js");

beforeEach(() => {
  process.env.KADAM_PUB_API_KEY = "test-pub-key";
});
afterEach(() => {
  delete process.env.KADAM_PUB_API_KEY;
});

describe("publisher stats tools", () => {
  it("get_stats calls getReportConfig and getReportData", async () => {
    vi.mocked(api.getReportConfig).mockResolvedValue({
      groups: [{ id: "time_day", name: "day", category: "time" }],
      metrics: [{ id: "finance_revenue", name: "revenue", category: "finance" }],
    });
    vi.mocked(api.getReportData).mockResolvedValue({
      data: [{ time_day: "2025-03-01", finance_revenue: 50 }],
      totals: { time_day: "", finance_revenue: 50 },
      meta: { page: 1, pages: 1, total: 1, perPage: 25 },
    });

    const client = await createToolClient(pubStatsModule);
    const result = await client.callTool({
      name: "kadam_pub_get_stats",
      arguments: { groupBy: "day", period: "7days" },
    });
    const text = getTextFromResult(result);

    expect(api.getReportConfig).toHaveBeenCalled();
    expect(api.getReportData).toHaveBeenCalled();
    expect(text).toContain("Publisher Stats");
  });

  it("config caching - call get_stats twice, getReportConfig called only once", async () => {
    vi.mocked(api.getReportConfig).mockResolvedValue({
      groups: [{ id: "time_day", name: "day", category: "time" }],
      metrics: [{ id: "finance_revenue", name: "revenue", category: "finance" }],
    });
    vi.mocked(api.getReportData).mockResolvedValue({
      data: [{ time_day: "2025-03-01", finance_revenue: 50 }],
      totals: { time_day: "", finance_revenue: 50 },
      meta: { page: 1, pages: 1, total: 1, perPage: 25 },
    });

    const client = await createToolClient(pubStatsModule);
    await client.callTool({
      name: "kadam_pub_get_stats",
      arguments: { groupBy: "day", period: "7days" },
    });
    await client.callTool({
      name: "kadam_pub_get_stats",
      arguments: { groupBy: "day", period: "7days" },
    });

    expect(api.getReportConfig).toHaveBeenCalledTimes(1);
  });
});
