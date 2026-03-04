import { createToolClient, getTextFromResult } from "../../helpers/tool-client.js";
import { statsModule } from "../../../src/tools/advertiser/stats.js";
import * as api from "../../../src/api/partners-client.js";

vi.mock("../../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../../src/api/partners-client.js");

beforeEach(() => {
  process.env.KADAM_ADV_API_KEY = "test-adv-key";
});
afterEach(() => {
  delete process.env.KADAM_ADV_API_KEY;
});

describe("advertiser stats tools", () => {
  it("get_stats with reportType custom calls getReportConfig and getReportData", async () => {
    vi.mocked(api.getReportConfig).mockResolvedValue({
      groups: [
        { id: "time_day", name: "day", category: "time" },
      ],
      metrics: [
        { id: "finance_spend", name: "spend", category: "finance" },
      ],
    });
    vi.mocked(api.getReportData).mockResolvedValue({
      data: [{ time_day: "2025-03-01", finance_spend: 100 }],
      totals: {},
      meta: { page: 1, pages: 1, total: 1, perPage: 25 },
    });

    const client = await createToolClient(statsModule);
    await client.callTool({
      name: "kadam_adv_get_stats",
      arguments: { reportType: "custom", period: "7days" },
    });

    expect(api.getReportConfig).toHaveBeenCalled();
    expect(api.getReportData).toHaveBeenCalled();
  });

  it("get_stats with reportType sites calls getSiteStats", async () => {
    vi.mocked(api.getSiteStats).mockResolvedValue({
      data: [{ siteName: "example.com", impressions: 1000, clicks: 10, spend: 5 }],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });

    const client = await createToolClient(statsModule);
    const result = await client.callTool({
      name: "kadam_adv_get_stats",
      arguments: { reportType: "sites", period: "7days" },
    });
    const text = getTextFromResult(result);

    expect(api.getSiteStats).toHaveBeenCalled();
    expect(text).toContain("Site stats");
  });

  it("get_stats with reportType postbacks calls getPostbackStats", async () => {
    vi.mocked(api.getPostbackStats).mockResolvedValue({
      data: [{ campaign: "Test", conversions: 5 }],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });

    const client = await createToolClient(statsModule);
    const result = await client.callTool({
      name: "kadam_adv_get_stats",
      arguments: { reportType: "postbacks", period: "7days" },
    });
    const text = getTextFromResult(result);

    expect(api.getPostbackStats).toHaveBeenCalled();
    expect(text).toContain("Postback stats");
  });
});
