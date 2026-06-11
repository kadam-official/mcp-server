import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
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

    const result = await client.callTool({
      name: "kadam_adv_list_campaigns",
      arguments: { page: 1 },
    });
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
      postConversion: {
        audiences: [100],
        countFirstConversionOnly: true,
        countLastCampaignOnly: true,
        postClickAttrPriority: true,
        windowLengthPostView: null,
        windowLengthPostClick: null,
      },
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

    const result = await client.callTool({
      name: "kadam_adv_list_campaigns",
      arguments: { page: 1 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Campaigns");
    expect(text).toContain("0");
  });

  it("update_campaign_bid sends CPC bid with explicit (already-targeted) countries", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 50,
      cpType: 0,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34, 24] }],
    });
    api.updateCampaignBid.mockResolvedValue({} as never);

    const result = await client.callTool({
      name: "kadam_adv_update_campaign_bid",
      arguments: { id: 50, bid: 0.08, countries: "US,DE" },
    });
    const text = getTextFromResult(result);

    expect(api.getCampaign).toHaveBeenCalledWith(50);
    expect(api.updateCampaignBid).toHaveBeenCalledWith(50, [
      { bid: 0.08, leadCost: 0, countries: [34, 24] },
    ]);
    expect(text).toContain("campaign #50");
  });

  it("update_campaign_bid errors (no silent success) when a country is not targeted", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 51,
      cpType: 0,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }], // US only
    });
    api.updateCampaignBid.mockResolvedValue({} as never);

    const result = await client.callTool({
      name: "kadam_adv_update_campaign_bid",
      arguments: { id: 51, bid: 0.08, countries: "BR" },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    const text = getTextFromResult(result);
    expect(text).toContain("BR");
    expect(text).toContain("does not target");
    expect(api.updateCampaignBid).not.toHaveBeenCalled();
  });

  it("update_campaign_bid without countries falls back to campaign's current countries", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 55,
      cpType: 0,
      bids: [{ bid: 0.03, leadCost: 0, countries: [34, 24] }],
    });
    api.updateCampaignBid.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign_bid",
      arguments: { id: 55, bid: 0.1 },
    });

    expect(api.updateCampaignBid).toHaveBeenCalledWith(55, [
      { bid: 0.1, leadCost: 0, countries: [34, 24] },
    ]);
  });

  it("update_campaign_bid uses leadCost for CPA campaigns", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 60,
      cpType: 4,
      bids: [{ leadCost: 5, countries: [40] }],
    });
    api.updateCampaignBid.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign_bid",
      arguments: { id: 60, bid: 2.5 },
    });

    expect(api.updateCampaignBid).toHaveBeenCalledWith(60, [{ leadCost: 2.5, countries: [40] }]);
  });

  it("bulk_update_bids sends CPC bid for multiple campaigns", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.bulkUpdateCampaignBids.mockResolvedValue({} as never);

    const result = await client.callTool({
      name: "kadam_adv_bulk_update_bids",
      arguments: { campaignIds: "10,20,30", bid: 0.05, pricingModel: "cpc", countries: "US" },
    });
    const text = getTextFromResult(result);

    expect(api.bulkUpdateCampaignBids).toHaveBeenCalledWith(
      [10, 20, 30],
      [{ bid: 0.05, leadCost: 0, countries: [34] }],
    );
    expect(text).toContain("3 campaigns");
  });

  it("bulk_update_bids sends leadCost for CPA campaigns", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.bulkUpdateCampaignBids.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_bulk_update_bids",
      arguments: { campaignIds: "10,20", bid: 3.0, pricingModel: "cpa_target", countries: "DE" },
    });

    expect(api.bulkUpdateCampaignBids).toHaveBeenCalledWith(
      [10, 20],
      [{ leadCost: 3.0, countries: [24] }],
    );
  });

  it("create_campaign with sspIds sends ssps object to API", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.createCampaign.mockResolvedValue({ id: 101 } as never);

    await client.callTool({
      name: "kadam_adv_create_campaign",
      arguments: {
        type: "push",
        name: "SSP test",
        url: "https://example.com",
        folderId: 1,
        pricingModel: "cpc",
        bid: 0.05,
        dailyBudget: 50,
        countries: "US",
        sspMode: "whitelist",
        sspIds: "5,12",
      },
    });

    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        ssps: { mode: true, list: [5, 12] },
      }),
    );
  });

  it("create_campaign with sspMode=blacklist sends ssps.mode=false", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.createCampaign.mockResolvedValue({ id: 102 } as never);

    await client.callTool({
      name: "kadam_adv_create_campaign",
      arguments: {
        type: "push",
        name: "SSP blacklist",
        url: "https://example.com",
        folderId: 1,
        pricingModel: "cpc",
        bid: 0.05,
        dailyBudget: 50,
        countries: "US",
        sspMode: "blacklist",
        sspIds: "7,14",
      },
    });

    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        ssps: { mode: false, list: [7, 14] },
      }),
    );
  });

  it("update_campaign merges sspIds into existing campaign", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 70,
      type: 30,
      cpType: 0,
      name: "SSP update test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      ssps: { mode: true, list: [1, 2] },
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 70, sspMode: "blacklist", sspIds: "10,20,30" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.ssps).toEqual({ mode: false, list: [10, 20, 30] });
  });

  it("update_campaign merges conversion template into existing campaign", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 80,
      type: 30,
      cpType: 0,
      name: "Conv test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      conversion: { id: 3, approved: "old_dep", hold: "old_reg", reject: "" },
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: {
        id: 80,
        conversionTemplateId: 0,
        conversionApproved: "dep",
        conversionHold: "reg",
      },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.conversion).toEqual({ id: 0, approved: "dep", hold: "reg", reject: "" });
  });

  it("update_campaign preserves conversion.id when not changing conversion", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 81,
      type: 30,
      cpType: 0,
      name: "Conv preserve test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      conversion: { id: 5, approved: "dep", hold: "reg", reject: "" },
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 81, name: "Renamed" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    const conv = payload.conversion as Record<string, unknown>;
    expect(conv.id).toBe(5);
  });

  it("update_campaign sets subAges from subscriptionAges", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 90,
      type: 30,
      pushType: 2,
      cpType: 0,
      name: "Sub-age test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      subAges: [1, 2, 3, 4],
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 90, subscriptionAges: "1" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.subAges).toEqual([1]);
  });

  it("update_campaign preserves subAges and drops read-only keys on unrelated edits", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 91,
      status: 10,
      state: { id: "active", label: "Active" },
      type: 30,
      pushType: 2,
      cpType: 0,
      name: "Old",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      subAges: [1, 2, 3],
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 91, name: "New" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.subAges).toEqual([1, 2, 3]); // preserved untouched
    expect(payload.pushType).toBe(2); // writable field, preserved
    expect(payload.name).toBe("New");
    expect(payload.id).toBeUndefined(); // read-only, dropped
    expect(payload.status).toBeUndefined(); // read-only, dropped
    expect(payload.state).toBeUndefined(); // read-only, dropped
  });

  it("update_site_bids sends PUT /stats/sites/bids with zones and bid", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.updateSiteBids.mockResolvedValue({} as never);

    const result = await client.callTool({
      name: "kadam_adv_update_site_bids",
      arguments: { campaignIds: "100,200", zones: "500,600,700", bid: "x1.5" },
    });
    const text = getTextFromResult(result);

    expect(api.updateSiteBids).toHaveBeenCalledWith(
      [100, 200],
      [{ zones: [500, 600, 700], bid: "x1.5" }],
    );
    expect(text).toContain("2 campaign(s)");
    expect(text).toContain("x1.5");
  });
});
