import { createToolClient, getTextFromResult, type MockPartnersClient } from "../../helpers/tool-client.js";
import { campaignsModule } from "../../../src/tools/advertiser/campaigns.js";
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

describe("campaigns tools", () => {
  it("list_campaigns returns formatted list with [ID: 1] and Test", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.listCampaigns.mockResolvedValue({
      rows: [
        {
          campaign: {
            id: 1,
            name: "Test",
            state: { id: "active", label: "Active" },
            type: { id: "30", label: "Push" },
            folder: { id: 1, name: "Default" },
            model: "CPC",
            active: 2,
            total: 3,
            url: "https://example.com",
          },
          dayMoneyLimit: "100",
          views: "0",
          clicks: "0",
          moneyOut: "0",
        },
      ],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({ name: "kadam_adv_list_campaigns", arguments: { page: 1 } });
    const text = getTextFromResult(result);

    expect(text).toContain("[ID: 1]");
    expect(text).toContain("Test");
  });

  it("create_campaign calls api with type 30 (push) and cpType 0 (cpc)", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.createCampaign.mockResolvedValue({
      id: 99,
      name: "New",
    } as never);

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
        countries: "US",
      },
    });

    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 30,
        cpType: 0,
        bids: [{ bid: 0.5, leadCost: 0, countries: [34] }],
      }),
    );
  });

  it("update_campaign does read-modify-write, merging changes with current state", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 42,
      type: 30,
      cpType: 0,
      name: "Old Name",
      url: "https://old.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: [],
      status: 10,
      audiences: { mode: 20, include: [], exclude: [] },
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 42, name: "Updated Name", dailyBudget: 200 },
    });

    expect(api.getCampaign).toHaveBeenCalledWith(42);
    expect(api.updateCampaign).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        type: 30,
        name: "Updated Name",
        url: "https://old.com",
        dayMoneyLimit: 200,
        newAudiences: [],
        categories: ["mainstream"],
      }),
    );
    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.id).toBeUndefined();
    expect(payload.status).toBeUndefined();
  });

  it("update_campaign resolves ISO country codes for bids", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 10,
      type: 30,
      cpType: 0,
      name: "Geo test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 10, bid: 0.05, countries: "US" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    const bids = payload.bids as Array<Record<string, unknown>>;
    expect(bids[0]!.bid).toBe(0.05);
    expect(bids[0]!.countries).toEqual([34]);
    expect(bids[0]!.leadCost).toBe(0);
  });

  it("update_campaign uses leadCost for CPA campaigns", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 20,
      type: 30,
      cpType: 4,
      name: "CPA campaign",
      url: "https://example.com",
      dayMoneyLimit: 100,
      bids: [{ leadCost: 5, countries: [34] }],
      categories: ["mainstream"],
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 20, bid: 3.5 },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    const bids = payload.bids as Array<Record<string, unknown>>;
    expect(bids[0]!.leadCost).toBe(3.5);
    expect(bids[0]!.bid).toBeUndefined();
  });

  it("update_campaign handles connectionType as string enum", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 30,
      type: 30,
      cpType: 0,
      name: "Conn test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      connectionType: 3,
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 30, connectionType: "wifi" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.connectionType).toBe(2);
  });

  it("update_campaign filters NaN from postConversionAudienceIds", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 40,
      type: 30,
      cpType: 0,
      name: "PC test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      postConversion: { audiences: [100], countFirstConversionOnly: true, countLastCampaignOnly: true, postClickAttrPriority: true, windowLengthPostView: null, windowLengthPostClick: null },
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 40, postConversionAudienceIds: "" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    const pc = payload.postConversion as Record<string, unknown>;
    expect(pc.audiences).toEqual([]);
  });

  it("set_campaign_status with ids 1,2,3 and active calls api with activate", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.setCampaignStatus.mockResolvedValue(undefined as never);

    const result = await client.callTool({
      name: "kadam_adv_set_campaign_status",
      arguments: { ids: "1,2,3", status: "active" },
    });
    const text = getTextFromResult(result);

    expect(api.setCampaignStatus).toHaveBeenCalledWith([1, 2, 3], "activate");
    expect(text).toContain("3 campaigns set to active");
  });

  it("list_campaigns with empty data handles gracefully", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.listCampaigns.mockResolvedValue({
      rows: [],
      totalRows: 0,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({ name: "kadam_adv_list_campaigns", arguments: { page: 1 } });
    const text = getTextFromResult(result);

    expect(text).toContain("Campaigns");
    expect(text).toContain("0");
  });
});
