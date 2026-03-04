import { createToolClient, getTextFromResult } from "../../helpers/tool-client.js";
import { campaignsModule } from "../../../src/tools/advertiser/campaigns.js";
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

describe("campaigns tools", () => {
  it("list_campaigns returns formatted list with [ID: 1] and Test", async () => {
    vi.mocked(api.listCampaigns).mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Test",
          type: 30,
          status: "active",
          cpType: 0,
          bid: 0.5,
          url: "https://example.com",
          folderId: 1,
          dayMoneyLimit: 100,
          commonMoneyLimit: 0,
          isEvenDistribution: false,
          startDate: null,
          endDate: null,
          timezone: 0,
          clicks: 0,
          impressions: 0,
          moneyOut: 0,
          ctr: 0,
        },
      ],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });

    const client = await createToolClient(campaignsModule);
    const result = await client.callTool({ name: "kadam_adv_list_campaigns", arguments: { page: 1 } });
    const text = getTextFromResult(result);

    expect(text).toContain("[ID: 1]");
    expect(text).toContain("Test");
  });

  it("create_campaign calls api with type 30 (push) and cpType 0 (cpc)", async () => {
    vi.mocked(api.createCampaign).mockResolvedValue({
      id: 99,
      name: "New",
      type: 30,
      status: "active",
      cpType: 0,
      bid: 0.5,
      url: "https://example.com",
      folderId: 1,
      dayMoneyLimit: 100,
      commonMoneyLimit: 0,
      isEvenDistribution: false,
      startDate: null,
      endDate: null,
      timezone: 0,
      clicks: 0,
      impressions: 0,
      moneyOut: 0,
      ctr: 0,
    } as never);

    const client = await createToolClient(campaignsModule);
    await client.callTool({
      name: "kadam_adv_create_campaign",
      arguments: {
        type: "push",
        name: "New",
        url: "https://example.com",
        folderId: 1,
        pricingModel: "cpc",
        bid: 0.5,
        dailyBudget: 100,
      },
    });

    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 30,
        cpType: 0,
      }),
    );
  });

  it("update_campaign calls api.updateCampaign with correct id", async () => {
    vi.mocked(api.updateCampaign).mockResolvedValue({} as never);

    const client = await createToolClient(campaignsModule);
    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 42, name: "Updated Name" },
    });

    expect(api.updateCampaign).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ name: "Updated Name" }),
    );
  });

  it("set_campaign_status with ids 1,2,3 and active calls api with turn-on", async () => {
    vi.mocked(api.setCampaignStatus).mockResolvedValue(undefined as never);

    const client = await createToolClient(campaignsModule);
    const result = await client.callTool({
      name: "kadam_adv_set_campaign_status",
      arguments: { ids: "1,2,3", status: "active" },
    });
    const text = getTextFromResult(result);

    expect(api.setCampaignStatus).toHaveBeenCalledWith([1, 2, 3], "turn-on");
    expect(text).toContain("3 campaigns set to active");
  });

  it("list_campaigns with empty data handles gracefully", async () => {
    vi.mocked(api.listCampaigns).mockResolvedValue({
      data: [],
      meta: { current_page: 1, last_page: 1, total: 0 },
    });

    const client = await createToolClient(campaignsModule);
    const result = await client.callTool({ name: "kadam_adv_list_campaigns", arguments: { page: 1 } });
    const text = getTextFromResult(result);

    expect(text).toContain("Campaigns");
    expect(text).toContain("0");
  });
});
