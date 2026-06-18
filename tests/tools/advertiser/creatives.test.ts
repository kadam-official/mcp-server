import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
import { creativesModule } from "../../../src/tools/advertiser/creatives.js";
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

describe("creatives tools", () => {
  it("list_creatives returns formatted list", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.listCreatives.mockResolvedValue({
      rows: [
        {
          ad: { id: 1, title: "Creative One", text: "", status: { id: "active", label: "Active" } },
          materialCampaign: { id: 10, name: "Test Campaign" },
          views: "0",
          clicks: "0",
        },
      ],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_list_creatives",
      arguments: { page: 1 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("[ID: 1]");
    expect(text).toContain("Creative One");
    expect(text).toContain("Creatives");
  });

  it("list_creatives nests campaignId/searchQuery into filters and maps status to statuses (KTS-1590)", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.listCreatives.mockResolvedValue({ rows: [], totalRows: 0, page: 1, perPage: 25 });

    await client.callTool({
      name: "kadam_adv_list_creatives",
      arguments: { page: 1, campaignId: 10, status: "paused", searchQuery: "banner" },
    });

    expect(api.listCreatives).toHaveBeenCalledWith({
      page: 1,
      perPage: 25,
      filters: { campaignId: 10, statuses: [80], searchQuery: "banner" },
    });
  });

  it("list_creatives maps status=moderation to statuses [0,5]", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.listCreatives.mockResolvedValue({ rows: [], totalRows: 0, page: 1, perPage: 25 });

    await client.callTool({
      name: "kadam_adv_list_creatives",
      arguments: { page: 1, status: "moderation" },
    });

    expect(api.listCreatives).toHaveBeenCalledWith({
      page: 1,
      perPage: 25,
      filters: { statuses: [0, 5] },
    });
  });

  it("create_creative calls api.createCreative with campaignId and FormData", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.createCreative.mockResolvedValue({
      id: 99,
      campaignId: 15,
      title: "",
      text: "",
      url: "https://example.com/landing",
      imageUrl: "",
      iconUrl: "",
      status: "pending",
      moderationStatus: "pending",
      bid: 0.5,
      clicks: 0,
      impressions: 0,
      ctr: 0,
    });

    await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 15,
        url: "https://example.com/landing",
      },
    });

    expect(api.createCreative).toHaveBeenCalledWith(15, expect.any(FormData));
  });

  it("set_creative_status with ids 5,6 and status paused calls api with action pause", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.setCreativeStatus.mockResolvedValue(undefined as never);

    const result = await client.callTool({
      name: "kadam_adv_set_creative_status",
      arguments: { ids: "5,6", status: "paused" },
    });
    const text = getTextFromResult(result);

    expect(api.setCreativeStatus).toHaveBeenCalledWith([5, 6], "pause");
    expect(text).toContain("2 creatives set to paused");
  });

  it("update_creative does read-modify-write, merging changes with current state", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.getMaterial.mockResolvedValue({
      id: 42,
      campaignId: 10,
      type: 20,
      title: "Old Title",
      name: "Old Text",
      url: "https://old.com",
      isPauseAfterModer: 0,
      startDate: null,
      stopDate: null,
      sizeId: 0,
      bids: [],
      status: 10,
    });
    api.updateCreative.mockResolvedValue({} as never);

    const result = await client.callTool({
      name: "kadam_adv_update_creative",
      arguments: {
        creativeId: 42,
        url: "https://new-landing.com",
        bid: 0.15,
      },
    });
    const text = getTextFromResult(result);

    expect(api.getMaterial).toHaveBeenCalledWith(42);
    expect(api.updateCreative).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        adId: 42,
        url: "https://new-landing.com",
        title: "Old Title",
        name: "Old Text",
        bids: [{ bid: 0.15, leadCost: 0, countries: [] }],
      }),
    );
    expect(text).toContain("Creative #42 in campaign #10 updated successfully");
  });
});
