import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
import { bidOptimizationModule } from "../../../src/tools/advertiser/bid-optimization.js";
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

describe("bid-optimization tools", () => {
  it("get_extended_stats nests filters/sort and echoes per-row pathIds with title labels", async () => {
    const { client, mockApi } = await createToolClient(bidOptimizationModule);
    const api = mockApi as MockPartnersClient;
    api.getExtendedStats.mockResolvedValue({
      rows: [
        {
          name: { id: 34, title: "United States", type: "slice_value" },
          views: "1000",
          clicks: "50",
          CPC: "0.02",
          CR: "4",
          bid: "0.05",
          hasBids: true,
          isExcludedFromAutorules: false,
        },
        {
          name: { id: 24, title: "Germany", type: "slice_value" },
          views: "500",
          clicks: "10",
          CPC: "0.03",
          CR: "2",
          bid: "",
          hasBids: false,
          isExcludedFromAutorules: true,
        },
      ],
      totalRows: 2,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_get_extended_stats",
      arguments: { campaignIds: "100", pathIds: "130", metrics: "views,clicks,CPC,CR" },
    });
    const text = getTextFromResult(result);

    const [params] = api.getExtendedStats.mock.calls[0]!;
    expect(params).toMatchObject({
      campaignIds: [100],
      pathIds: [130],
      sort: { views: "desc" },
    });
    expect((params as { filters: { dateFrom: string } }).filters.dateFrom).toBeTruthy();
    // per-row pathIds echoed (base path + name.id) and labeled with name.title
    expect(text).toContain('pathIds=130,34 "United States"');
    expect(text).toContain('pathIds=130,24 "Germany"');
    expect(text).toContain("views=1000");
    expect(text).toContain("CPC=0.02");
    expect(text).toContain("bid=0.05");
    // empty bid is skipped; an autorule-excluded slice is flagged
    expect(text).toContain("[autorule-excluded]");
    // the available-columns hint omits structural keys
    expect(text).toContain("Available metric columns");
    expect(text).not.toContain("isExcludedFromAutorules");
  });

  it("get_extended_stats renders scalar pathIds + title at deeper levels (no [object Object])", async () => {
    const { client, mockApi } = await createToolClient(bidOptimizationModule);
    const api = mockApi as MockPartnersClient;
    api.getExtendedStats.mockResolvedValue({
      rows: [
        {
          name: { id: 1, title: "Linux", type: "slice_value" },
          views: "10",
          clicks: "2",
          CPC: "0.01",
          CR: "1",
        },
      ],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_get_extended_stats",
      arguments: { campaignIds: "100", pathIds: "130,34,140" },
    });
    const text = getTextFromResult(result);

    expect(text).toContain('pathIds=130,34,140,1 "Linux"');
    expect(text).not.toContain("[object Object]");
  });

  it("get_extended_stats respects explicit sort and metric subset", async () => {
    const { client, mockApi } = await createToolClient(bidOptimizationModule);
    const api = mockApi as MockPartnersClient;
    api.getExtendedStats.mockResolvedValue({ rows: [], totalRows: 0, page: 1, perPage: 25 });

    await client.callTool({
      name: "kadam_adv_get_extended_stats",
      arguments: { campaignIds: "100,101", sortField: "clicks", sortOrder: "asc" },
    });

    const [params] = api.getExtendedStats.mock.calls[0]!;
    expect(params).toMatchObject({ campaignIds: [100, 101], sort: { clicks: "asc" } });
  });

  it("list_extended_bids flattens and paginates the per-campaign bid map", async () => {
    const { client, mockApi } = await createToolClient(bidOptimizationModule);
    const api = mockApi as MockPartnersClient;
    api.listExtendedBids.mockResolvedValue({
      "100": [
        { pathIds: [180, 827, 300, 408], bid: "0.175", mode: "fixed", state: "active" },
        { pathIds: [130, 34], bid: "-1", mode: null, state: "disabled" },
      ],
    });

    const result = await client.callTool({
      name: "kadam_adv_list_extended_bids",
      arguments: { campaignIds: "100" },
    });
    const text = getTextFromResult(result);

    expect(api.listExtendedBids).toHaveBeenCalledWith([100]);
    expect(text).toContain("pathIds=180,827,300,408 | bid=0.175 fixed (active)");
    expect(text).toContain("campaign #100");
  });

  it("update_extended_bids forwards campaignIds + bids ops", async () => {
    const { client, mockApi } = await createToolClient(bidOptimizationModule);
    const api = mockApi as MockPartnersClient;
    api.updateExtendedBids.mockResolvedValue({ affectedCampaigns: 1 });

    const result = await client.callTool({
      name: "kadam_adv_update_extended_bids",
      arguments: {
        campaignIds: "100",
        bids: [
          { pathIds: [130, 34], action: "set", mode: "fixed", bid: "0.05" },
          { pathIds: [180, 5], action: "off" },
        ],
      },
    });

    expect(api.updateExtendedBids).toHaveBeenCalledWith({
      campaignIds: [100],
      bids: [
        { pathIds: [130, 34], action: "set", mode: "fixed", bid: "0.05" },
        { pathIds: [180, 5], action: "off" },
      ],
    });
    expect(getTextFromResult(result)).toContain("2 op(s) across 1 campaign(s)");
  });
});
