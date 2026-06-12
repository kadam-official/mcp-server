import { describe, it, expect } from "vitest";
import { campaignDetailModule } from "../../../src/tools/advertiser/campaign-detail.js";
import { ApiError } from "../../../src/api/http-client.js";
import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";

vi.mock("../../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const FULL_CAMPAIGN = {
  id: 906074,
  type: 30,
  cpType: 0,
  status: 10,
  name: "Retarget DE",
  url: "https://example.com/landing?utm_source=kadam",
  folderId: 178937,
  dayMoneyLimit: 150,
  commonMoneyLimit: 5000,
  isEvenDistribution: 1,
  bids: [{ bid: 0.05, leadCost: 0, countries: [34, 24] }],
  materialViews: { count: 3, days: 1 },
  campaignView: { count: 1, days: 1 },
  startDate: "2026-06-01",
  stopDate: null,
  timezone: 3,
  time: {
    mode: 1,
    list: Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      hours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
    })),
  },
  devices: [1],
  platformVersions: [10],
  browsers: [8],
  languages: [2],
  connectionType: 3,
  categories: ["mainstream"],
  audiences: { mode: 20, include: [555], exclude: [777] },
  sites: { mode: 1, list: [1001, 1002] },
  ssps: { mode: true, list: [42] },
  disableProxy: 1,
  conversion: { id: 0, approved: "dep", hold: "reg", reject: "" },
  postConversion: {
    audiences: [555],
    countFirstConversionOnly: true,
    countLastCampaignOnly: true,
    postClickAttrPriority: true,
    windowLengthPostView: 24,
    windowLengthPostClick: 168,
  },
  someNewApiField: { foo: 1 },
};

describe("kadam_adv_get_campaign", () => {
  it("returns full campaign info including the landing URL", async () => {
    const { client, mockApi } = await createToolClient(campaignDetailModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue(FULL_CAMPAIGN);

    const result = await client.callTool({
      name: "kadam_adv_get_campaign",
      arguments: { id: 906074 },
    });
    const text = getTextFromResult(result);

    expect(result.isError).toBeFalsy();
    expect(api.getCampaign).toHaveBeenCalledWith(906074);
    expect(text).toContain("https://example.com/landing?utm_source=kadam");
    expect(text).toContain('[ID: 906074] "Retarget DE"');
    expect(text).toContain("Type: Push");
    expect(text).toContain("Pricing model: CPC");
    expect(text).toContain("Campaign group: #178937");
    expect(text).toContain("Daily budget: 150");
    expect(text).toContain("Total budget: 5000");
  });

  it("resolves bid countries to ISO codes and targeting IDs to labels", async () => {
    const { client, mockApi } = await createToolClient(campaignDetailModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue(FULL_CAMPAIGN);

    const result = await client.callTool({
      name: "kadam_adv_get_campaign",
      arguments: { id: 906074 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("US (34), DE (24)");
    expect(text).toContain("Devices: Desktop (1)");
    expect(text).toContain("OS: Android (10)");
    expect(text).toContain("Browsers: Chrome (8)");
    expect(text).toContain("Languages: English (2)");
    expect(text).toContain("Sites whitelist: 1001, 1002");
    expect(text).toContain("Audiences include: 555");
    expect(text).toContain("Audiences exclude: 777");
  });

  it("summarizes schedule, caps, and conversion settings", async () => {
    const { client, mockApi } = await createToolClient(campaignDetailModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue(FULL_CAMPAIGN);

    const result = await client.callTool({
      name: "kadam_adv_get_campaign",
      arguments: { id: 906074 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("All week, hours: 9-17");
    expect(text).toContain("Creative frequency cap: 3 views per 1 day(s)");
    expect(text).toContain("Campaign frequency cap: 1 views per 1 day(s)");
    expect(text).toContain('approved: "dep"');
    expect(text).toContain("post-view window 24h");
  });

  it("includes unknown API fields in the raw tail section", async () => {
    const { client, mockApi } = await createToolClient(campaignDetailModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue(FULL_CAMPAIGN);

    const result = await client.callTool({
      name: "kadam_adv_get_campaign",
      arguments: { id: 906074 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Other fields");
    expect(text).toContain('someNewApiField: {"foo":1}');
  });

  it("renders CPA bids with target CPA cost", async () => {
    const { client, mockApi } = await createToolClient(campaignDetailModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockResolvedValue({
      id: 1,
      type: 40,
      cpType: 4,
      name: "CPA camp",
      url: "https://x.com",
      bids: [{ bid: 0, leadCost: 2.5, countries: [40] }],
    });

    const result = await client.callTool({
      name: "kadam_adv_get_campaign",
      arguments: { id: 1 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Pricing model: CPA Target");
    expect(text).toContain("target CPA 2.5");
    expect(text).toContain("BR (40)");
  });

  it("API 404 returns Resource not found", async () => {
    const { client, mockApi } = await createToolClient(campaignDetailModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaign.mockRejectedValue(new ApiError("Not found", 404));

    const result = await client.callTool({
      name: "kadam_adv_get_campaign",
      arguments: { id: 999999 },
    });

    expect(result.isError).toBe(true);
    expect(getTextFromResult(result)).toBe("Resource not found. Verify the ID is correct.");
  });
});
