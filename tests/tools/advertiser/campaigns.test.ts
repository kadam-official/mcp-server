import {
  createToolClient,
  getTextFromResult,
  IMPERSONATION,
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

function bulkActionResult(applied: number[], refused: number[] = []) {
  return {
    campaigns: [
      ...applied.map((id) => ({ id, success: true })),
      ...refused.map((id) => ({ id, success: false })),
    ],
    totalCampaigns: applied.length + refused.length,
    processedCampaigns: applied.length,
  };
}

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

  it("list_campaigns nests every filter under `filters` and sort as an object (KTS-1590)", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.listCampaigns.mockResolvedValue({ rows: [], totalRows: 0, page: 1, perPage: 25 });

    await client.callTool({
      name: "kadam_adv_list_campaigns",
      arguments: {
        page: 1,
        perPage: 5,
        folderId: 180180,
        status: "active",
        type: "push",
        searchQuery: "promo",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-18",
        sortField: "moneyOut",
        sortOrder: "desc",
      },
    });

    expect(api.listCampaigns).toHaveBeenCalledWith({
      page: 1,
      perPage: 5,
      sort: { moneyOut: "desc" },
      filters: {
        folderId: 180180,
        statuses: [10],
        types: [30],
        searchQuery: "promo",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-18",
      },
    });
  });

  it("list_campaigns maps status=archived to filters.archive (not statuses)", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.listCampaigns.mockResolvedValue({ rows: [], totalRows: 0, page: 1, perPage: 25 });

    await client.callTool({
      name: "kadam_adv_list_campaigns",
      arguments: { page: 2, status: "archived" },
    });

    expect(api.listCampaigns).toHaveBeenCalledWith({
      page: 2,
      perPage: 25,
      filters: { archive: 1 },
    });
  });

  it("list_campaigns sends only pagination when no filters/sort are given", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.listCampaigns.mockResolvedValue({ rows: [], totalRows: 0, page: 1, perPage: 25 });

    await client.callTool({ name: "kadam_adv_list_campaigns", arguments: { page: 1 } });

    expect(api.listCampaigns).toHaveBeenCalledWith({ page: 1, perPage: 25 });
  });

  it("create_campaign with dryRun validates and creates nothing", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.validateCampaign.mockResolvedValue({} as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_create_campaign",
        arguments: {
          type: "push",
          name: "Draft",
          url: "https://example.com",
          folderId: 1,
          pricingModel: "cpc",
          bid: 0.5,
          dailyBudget: 100,
          countries: "US",
          dryRun: true,
        },
      }),
    );

    expect(api.createCampaign).not.toHaveBeenCalled();
    expect(api.validateCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ type: 30, cpType: 0 }),
    );
    expect(api.validateCampaign).toHaveBeenCalledWith(
      expect.not.objectContaining({ dryRun: expect.anything() }),
    );
    expect(text).toContain("Nothing was created");
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
        categories: [1001, "mainstream"],
      }),
    );
  });

  it("create_campaign maps the adult keyword to parent 1001", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.createCampaign.mockResolvedValue({
      id: 99,
      name: "Adult only",
    } as never);

    await client.callTool({
      name: "kadam_adv_create_campaign",
      arguments: {
        type: "push",
        name: "Adult only",
        url: "https://example.com",
        folderId: 1,
        pricingModel: "cpc",
        bid: 0.5,
        dailyBudget: 100,
        countries: "US",
        categories: "adult",
      },
    });

    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: [1001],
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

  /**
   * A client token reads manager-only fields as null and the API accepts that null back
   * as "not provided" (CampaignManagerFieldsBearerCest on the backend proves it), so the
   * read-modify-write echoes the card as is — no special-casing by field name.
   */
  it("update_campaign echoes the null manager-only fields a client token reads", async () => {
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
      categories: ["mainstream"],
      status: 10,
      proxies: null,
      hasCorrectPostback: null,
      isDirectTrafficPriority: null,
      allowMultiAds: null,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 42, name: "Updated Name" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.name).toBe("Updated Name");
    for (const field of [
      "proxies",
      "hasCorrectPostback",
      "isDirectTrafficPriority",
      "allowMultiAds",
    ]) {
      expect(payload[field]).toBeNull();
    }
  });

  it("client session cannot set manager-only flags: they are not in the schema", async () => {
    const { client } = await createToolClient(campaignsModule);

    const { tools } = await client.listTools();
    for (const name of ["kadam_adv_create_campaign", "kadam_adv_update_campaign"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool).toBeDefined();
      const properties = tool!.inputSchema.properties as Record<string, unknown>;
      expect(Object.keys(properties).length).toBeGreaterThan(5);
      expect(properties).not.toHaveProperty("hasCorrectPostback");
      expect(properties).not.toHaveProperty("isDirectTrafficPriority");
      expect(properties).not.toHaveProperty("allowMultiAds");
    }
  });

  it("impersonation session gets the manager-only flags and writes them as 0/1", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule, undefined, IMPERSONATION);
    const api = mockApi as MockPartnersClient;

    const { tools } = await client.listTools();
    const update = tools.find((t) => t.name === "kadam_adv_update_campaign")!;
    const properties = update.inputSchema.properties as Record<string, unknown>;
    expect(properties).toHaveProperty("hasCorrectPostback");
    expect(properties).toHaveProperty("isDirectTrafficPriority");
    expect(properties).toHaveProperty("allowMultiAds");

    api.getCampaign.mockResolvedValue({
      id: 42,
      type: 30,
      cpType: 0,
      name: "Old Name",
      url: "https://old.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      status: 10,
      hasCorrectPostback: false,
      isDirectTrafficPriority: false,
      allowMultiAds: true,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    const result = await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 42, hasCorrectPostback: true, allowMultiAds: false },
    });

    expect(result.isError).toBeFalsy();
    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.hasCorrectPostback).toBe(1);
    expect(payload.allowMultiAds).toBe(0);
    expect(payload.isDirectTrafficPriority).toBe(false); // untouched → echoed from the card
  });

  it("impersonation session passes manager-only flags on create as 0/1", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule, undefined, IMPERSONATION);
    const api = mockApi as MockPartnersClient;
    api.createCampaign.mockResolvedValue({ id: 7 } as never);

    const result = await client.callTool({
      name: "kadam_adv_create_campaign",
      arguments: {
        type: "push",
        name: "Managed",
        url: "https://example.com",
        folderId: 1,
        pricingModel: "cpc",
        bid: 0.05,
        dailyBudget: 10,
        countries: "US",
        isDirectTrafficPriority: true,
      },
    });

    expect(result.isError).toBeFalsy();
    const payload = api.createCampaign.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.isDirectTrafficPriority).toBe(1);
    // Nobody confirmed the postback, so the new campaign is explicitly "not verified":
    // the API column is NOT NULL and a missing flag used to fail the insert.
    expect(payload.hasCorrectPostback).toBe(0);
    expect(payload).not.toHaveProperty("allowMultiAds");
  });

  it("impersonation create keeps an explicit hasCorrectPostback=true", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule, undefined, IMPERSONATION);
    const api = mockApi as MockPartnersClient;
    api.createCampaign.mockResolvedValue({ id: 8 } as never);

    await client.callTool({
      name: "kadam_adv_create_campaign",
      arguments: {
        type: "push",
        name: "Verified",
        url: "https://example.com",
        folderId: 1,
        pricingModel: "cpc",
        bid: 0.05,
        dailyBudget: 10,
        countries: "US",
        hasCorrectPostback: true,
      },
    });

    const payload = api.createCampaign.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.hasCorrectPostback).toBe(1);
  });

  it("client create never sends hasCorrectPostback, even as a default", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.createCampaign.mockResolvedValue({ id: 9 } as never);
    api.validateCampaign.mockResolvedValue({} as never);

    const args = {
      type: "push",
      name: "Client",
      url: "https://example.com",
      folderId: 1,
      pricingModel: "cpc",
      bid: 0.05,
      dailyBudget: 10,
      countries: "US",
    };
    await client.callTool({ name: "kadam_adv_create_campaign", arguments: args });
    await client.callTool({
      name: "kadam_adv_create_campaign",
      arguments: { ...args, dryRun: true },
    });

    // A client token is answered 422 "unknown field" for any manager flag, so the
    // default must stay impersonation-only — on create and on dryRun alike.
    expect(api.createCampaign.mock.calls[0]![0]).not.toHaveProperty("hasCorrectPostback");
    expect(api.validateCampaign.mock.calls[0]![0]).not.toHaveProperty("hasCorrectPostback");
  });

  it("update_campaign keeps manager-only fields an impersonating token does see", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule, undefined, IMPERSONATION);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 42,
      type: 30,
      cpType: 0,
      name: "Old Name",
      url: "https://old.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      status: 10,
      proxies: [1, 4],
      hasCorrectPostback: true,
      isDirectTrafficPriority: false,
      allowMultiAds: true,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 42, name: "Updated Name" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.proxies).toEqual([1, 4]);
    expect(payload.hasCorrectPostback).toBe(true);
    expect(payload.isDirectTrafficPriority).toBe(false);
    expect(payload.allowMultiAds).toBe(true);
  });

  it("update_campaign does not echo autorule ids back as rule definitions", async () => {
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
      categories: ["mainstream"],
      status: 10,
      autorules: [7, 9],
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 42, name: "Updated Name" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("autorules");
    expect(payload.name).toBe("Updated Name");
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
    expect(payload.connectionType).toBe(1); // backend: 1 = Wi-Fi
  });

  it("update_campaign maps connectionType cellular to 2 (3G/LTE)", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 31,
      type: 30,
      cpType: 0,
      name: "Conn cellular test",
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
      arguments: { id: 31, connectionType: "cellular" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.connectionType).toBe(2); // backend: 2 = 3G/LTE
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
    api.setCampaignStatus.mockResolvedValue(bulkActionResult([1, 2, 3]) as never);

    const result = await client.callTool({
      name: "kadam_adv_set_campaign_status",
      arguments: { ids: "1,2,3", status: "active" },
    });
    const text = getTextFromResult(result);

    expect(api.setCampaignStatus).toHaveBeenCalledWith([1, 2, 3], "activate");
    expect(text).toContain("3/3 campaigns set to active");
    expect(text).toContain("#1, #2, #3");
  });

  it.each([
    ["paused", "pause"],
    ["archived", "archive"],
    ["restored", "restore"],
  ])("set_campaign_status with %s calls api with %s", async (status, action) => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.setCampaignStatus.mockResolvedValue(bulkActionResult([7]) as never);

    const result = await client.callTool({
      name: "kadam_adv_set_campaign_status",
      arguments: { ids: "7", status },
    });

    expect(api.setCampaignStatus).toHaveBeenCalledWith([7], action);
    expect(getTextFromResult(result)).toContain(`1/1 campaigns set to ${status}`);
  });

  it("set_campaign_status reports campaigns the backend refused", async () => {
    // Partial failures arrive with HTTP 200, so the refused IDs must reach the model.
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.setCampaignStatus.mockResolvedValue(bulkActionResult([1], [2]) as never);

    const result = await client.callTool({
      name: "kadam_adv_set_campaign_status",
      arguments: { ids: "1,2", status: "archived" },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("1/2 campaigns set to archived");
    expect(text).toContain("Applied: #1");
    expect(text).toContain("#2");
  });

  it("delete_campaigns requires confirm", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_delete_campaigns",
      arguments: { ids: "1" },
    });

    expect(result.isError).toBe(true);
    expect(api.deleteCampaigns).not.toHaveBeenCalled();
  });

  it("delete_campaigns with confirm deletes the listed campaigns", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.deleteCampaigns.mockResolvedValue(bulkActionResult([1, 2]) as never);

    const result = await client.callTool({
      name: "kadam_adv_delete_campaigns",
      arguments: { ids: "1, 2", confirm: true },
    });

    expect(api.deleteCampaigns).toHaveBeenCalledWith([1, 2]);
    expect(getTextFromResult(result)).toContain("2/2 campaigns deleted");
  });

  it("move_campaigns calls API with campaign IDs and target folder", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.moveCampaigns.mockResolvedValue(bulkActionResult([1, 2]) as never);

    const result = await client.callTool({
      name: "kadam_adv_move_campaigns",
      arguments: { ids: "1, 2", folderId: 7 },
    });
    const text = getTextFromResult(result);

    expect(api.moveCampaigns).toHaveBeenCalledWith([1, 2], 7);
    expect(text).toContain("2/2 campaigns moved to campaign group #7");
    expect(text).toContain("Applied: #1, #2");
  });

  it("move_campaigns does not blame the campaign state for a refused move", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.moveCampaigns.mockResolvedValue(bulkActionResult([1], [2]) as never);

    const result = await client.callTool({
      name: "kadam_adv_move_campaigns",
      arguments: { ids: "1, 2", folderId: 7 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("the backend refused the move");
    expect(text).not.toContain("current campaign state does not allow it");
  });

  it("move_campaigns rejects input without a valid campaign ID", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_move_campaigns",
      arguments: { ids: "not-an-id", folderId: 7 },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(getTextFromResult(result)).toContain("At least one valid campaign ID");
    expect(api.moveCampaigns).not.toHaveBeenCalled();
  });

  it("move_campaigns rejects more than 100 campaign IDs", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_move_campaigns",
      arguments: {
        ids: Array.from({ length: 101 }, (_, index) => index + 1).join(","),
        folderId: 7,
      },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(getTextFromResult(result)).toContain("No more than 100 campaigns");
    expect(api.moveCampaigns).not.toHaveBeenCalled();
  });

  it("move_campaigns rejects duplicate campaign IDs", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_move_campaigns",
      arguments: { ids: "1,1", folderId: 7 },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(getTextFromResult(result)).toContain("must be unique");
    expect(api.moveCampaigns).not.toHaveBeenCalled();
  });

  it("set_campaign_status rejects duplicate campaign IDs", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_set_campaign_status",
      arguments: { ids: "1,1", status: "paused" },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(getTextFromResult(result)).toContain("must be unique");
    expect(api.setCampaignStatus).not.toHaveBeenCalled();
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
    expect(payload.conversion).toEqual({ approved: "dep", hold: "reg", reject: "" });
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

  it("create_campaign sends trafficSources and parsed audienceEngagementLevels", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.createCampaign.mockResolvedValue({ id: 103 } as never);

    await client.callTool({
      name: "kadam_adv_create_campaign",
      arguments: {
        type: "popunder",
        name: "AE create",
        url: "https://example.com",
        folderId: 1,
        pricingModel: "cpc",
        bid: 0.05,
        dailyBudget: 50,
        countries: "US",
        trafficSources: "all",
        audienceEngagementLevels: "high,very_high",
      },
    });

    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        trafficSources: "all",
        audienceEngagementLevels: ["very_high", "high"],
      }),
    );
  });

  it("update_campaign overrides round-tripped trafficSources and audienceEngagementLevels", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 100,
      type: 40,
      cpType: 0,
      name: "AE override test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      trafficSources: "all",
      audienceEngagementLevels: ["very_high"],
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 100, trafficSources: "proven", audienceEngagementLevels: "medium,high" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.trafficSources).toBe("proven");
    expect(payload.audienceEngagementLevels).toEqual(["high", "medium"]);
  });

  it("update_campaign round-trips current trafficSources/levels on unrelated edits", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 101,
      type: 40,
      cpType: 0,
      name: "AE round-trip test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      trafficSources: "all",
      audienceEngagementLevels: ["very_high", "low"],
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 101, name: "Renamed" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.trafficSources).toBe("all");
    expect(payload.audienceEngagementLevels).toEqual(["very_high", "low"]);
  });

  it("update_campaign drops a round-tripped empty audienceEngagementLevels array", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 102,
      type: 40,
      cpType: 0,
      name: "AE all-banned test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      trafficSources: "all",
      audienceEngagementLevels: [],
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 102, name: "Renamed" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.trafficSources).toBe("all");
    expect(payload.audienceEngagementLevels).toBeUndefined();
  });

  it("update_campaign sends neither key when the API omits them (unsupported format)", async () => {
    const { client, mockApi } = await createToolClient(campaignsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 104,
      type: 30,
      cpType: 0,
      name: "No AE test",
      url: "https://example.com",
      dayMoneyLimit: 50,
      bids: [{ bid: 0.01, leadCost: 0, countries: [34] }],
      categories: ["mainstream"],
      status: 10,
    });
    api.updateCampaign.mockResolvedValue({} as never);

    await client.callTool({
      name: "kadam_adv_update_campaign",
      arguments: { id: 104, name: "Renamed" },
    });

    const payload = api.updateCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("trafficSources");
    expect(payload).not.toHaveProperty("audienceEngagementLevels");
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
