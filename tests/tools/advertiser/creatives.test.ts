import { createToolClient, getTextFromResult } from "../../helpers/tool-client.js";
import { creativesModule } from "../../../src/tools/advertiser/creatives.js";
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

describe("creatives tools", () => {
  it("list_creatives returns formatted list", async () => {
    vi.mocked(api.listCreatives).mockResolvedValue({
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

    const client = await createToolClient(creativesModule);
    const result = await client.callTool({
      name: "kadam_adv_list_creatives",
      arguments: { page: 1 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("[ID: 1]");
    expect(text).toContain("Creative One");
    expect(text).toContain("Creatives");
  });

  it("create_creative calls api.createCreative with campaignId and FormData", async () => {
    vi.mocked(api.createCreative).mockResolvedValue({
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

    const client = await createToolClient(creativesModule);
    await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 15,
        url: "https://example.com/landing",
      },
    });

    expect(api.createCreative).toHaveBeenCalledWith(
      15,
      expect.any(FormData),
    );
  });

  it("set_creative_status with ids 5,6 and status paused calls api with action pause", async () => {
    vi.mocked(api.setCreativeStatus).mockResolvedValue(undefined as never);

    const client = await createToolClient(creativesModule);
    const result = await client.callTool({
      name: "kadam_adv_set_creative_status",
      arguments: { ids: "5,6", status: "paused" },
    });
    const text = getTextFromResult(result);

    expect(api.setCreativeStatus).toHaveBeenCalledWith([5, 6], "pause");
    expect(text).toContain("2 creatives set to paused");
  });
});
