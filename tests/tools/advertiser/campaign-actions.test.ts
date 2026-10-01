import {
  createToolClient,
  getTextFromResult,
  IMPERSONATION,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
import { campaignActionsModule } from "../../../src/tools/advertiser/campaign-actions.js";
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

describe("campaign-actions tools", () => {
  it("copy_campaign copies every creative by default and reports the new ID", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;
    api.copyCampaign.mockResolvedValue({
      id: 318,
      successful: 4,
      failed: 0,
      errors: [],
      bidsJobId: null,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_copy_campaign",
      arguments: { id: 31, name: "Push RU — copy", folderId: 100 },
    });
    const text = getTextFromResult(result);

    expect(api.copyCampaign).toHaveBeenCalledWith(31, {
      name: "Push RU — copy",
      folderId: 100,
      isPauseAfterModer: true,
      mode: "all",
    });
    expect(text).toContain("[ID: 318]");
    expect(text).toContain("4 copied");
  });

  it("copy_campaign with creatives=none omits mode so the campaign is copied alone", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;
    api.copyCampaign.mockResolvedValue({
      id: 319,
      successful: 0,
      failed: 0,
      errors: [],
      bidsJobId: null,
    } as never);

    await client.callTool({
      name: "kadam_adv_copy_campaign",
      arguments: { id: 31, name: "Settings only", folderId: 100, creatives: "none" },
    });

    expect(api.copyCampaign).toHaveBeenCalledWith(31, {
      name: "Settings only",
      folderId: 100,
      isPauseAfterModer: true,
    });
  });

  it("copy_campaign surfaces skipped creatives instead of reporting a clean copy", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;
    api.copyCampaign.mockResolvedValue({
      id: 320,
      successful: 2,
      failed: 1,
      errors: ["Creative #7: image is no longer available"],
      bidsJobId: null,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_copy_campaign",
      arguments: { id: 31, name: "Partial", folderId: 100 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("1 skipped");
    expect(text).toContain("image is no longer available");
  });

  it("copy_campaign reports the background job when site bids are copied", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;
    api.copyCampaign.mockResolvedValue({
      id: 321,
      successful: 1,
      failed: 0,
      errors: [],
      bidsJobId: "job-7",
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_copy_campaign",
      arguments: { id: 31, name: "With bids", folderId: 100, copySiteBids: true },
    });
    const text = getTextFromResult(result);

    expect(api.copyCampaign).toHaveBeenCalledWith(31, expect.objectContaining({ copyBids: true }));
    expect(text).toContain("job-7");
  });

  it("copy_campaign maps a pricing-model switch into paymentModel and bids", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;
    api.copyCampaign.mockResolvedValue({
      id: 322,
      successful: 0,
      failed: 0,
      errors: [],
      bidsJobId: null,
    } as never);

    await client.callTool({
      name: "kadam_adv_copy_campaign",
      arguments: {
        id: 31,
        name: "Now CPM",
        folderId: 100,
        pricingModel: "cpm",
        bid: 0.4,
        countries: "US",
      },
    });

    const payload = api.copyCampaign.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.paymentModel).toBe(2);
    expect(payload.bids).toEqual([{ bid: 0.4, leadCost: 0, countries: [34] }]);
  });

  it("copy_campaign rejects a pricing-model switch without bid and countries", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_copy_campaign",
      arguments: { id: 31, name: "Broken", folderId: 100, pricingModel: "cpm" },
    });

    expect(getTextFromResult(result)).toContain("requires bid and countries");
    expect(api.copyCampaign).not.toHaveBeenCalled();
  });

  it("copy_campaign rejects bids sent without a pricing-model switch", async () => {
    // The backend would keep the source pricing model and drop the bids on the floor.
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_copy_campaign",
      arguments: { id: 31, name: "Stray bid", folderId: 100, bid: 0.1, countries: "US" },
    });

    expect(getTextFromResult(result)).toContain("only used together with pricingModel");
    expect(api.copyCampaign).not.toHaveBeenCalled();
  });

  /**
   * These three answer 403 to a plain client token, so a client session must not list
   * them at all; only an impersonation session gets them.
   */
  it("manager-only tools exist only in an impersonation session", async () => {
    const managerOnly = [
      "kadam_adv_bulk_replace_urls",
      "kadam_adv_set_easy_start",
      "kadam_adv_get_blocked_traffic_sources",
    ];

    const client = await createToolClient(campaignActionsModule);
    const clientNames = (await client.client.listTools()).tools.map((t) => t.name);
    expect(clientNames).toContain("kadam_adv_copy_campaign");
    for (const name of managerOnly) expect(clientNames).not.toContain(name);

    const manager = await createToolClient(campaignActionsModule, undefined, IMPERSONATION);
    const managerNames = (await manager.client.listTools()).tools.map((t) => t.name);
    for (const name of managerOnly) expect(managerNames).toContain(name);
    expect(managerNames.length).toBe(clientNames.length + managerOnly.length);
  });

  it("bulk_replace_urls sends the defaults the backend expects and previews on dryRun", async () => {
    const { client, mockApi } = await createToolClient(
      campaignActionsModule,
      undefined,
      IMPERSONATION,
    );
    const api = mockApi as MockPartnersClient;
    api.bulkReplaceCampaignUrls.mockResolvedValue({
      mode: "substring",
      find: "old.com",
      replace: "new.com",
      campaigns: [
        {
          campaignId: 31,
          name: "Push RU",
          creativesCount: 4,
          oldValue: "https://old.com/lp",
          newValue: "https://new.com/lp",
          source: "campaign",
        },
      ],
      totalCampaigns: 1,
      totalCreatives: 4,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_bulk_replace_urls",
      arguments: { campaignIds: "31", find: "old.com", replace: "new.com", dryRun: true },
    });
    const text = getTextFromResult(result);

    expect(api.bulkReplaceCampaignUrls).toHaveBeenCalledWith({
      campaignsIds: [31],
      find: "old.com",
      replace: "new.com",
      mode: "substring",
      inCampaignSettings: true,
      inCreatives: true,
      creativesFilter: "active",
      dryRun: true,
    });
    expect(text).toContain("Preview");
    expect(text).toContain("Nothing was written");
    expect(text).toContain('#31 "Push RU"');
  });

  it("bulk_replace_urls reports a real run as applied", async () => {
    const { client, mockApi } = await createToolClient(
      campaignActionsModule,
      undefined,
      IMPERSONATION,
    );
    const api = mockApi as MockPartnersClient;
    api.bulkReplaceCampaignUrls.mockResolvedValue({
      mode: "substring",
      find: "old.com",
      replace: "new.com",
      campaigns: [],
      totalCampaigns: 0,
      totalCreatives: 0,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_bulk_replace_urls",
      arguments: { campaignIds: "31", find: "old.com", replace: "new.com", dryRun: false },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Replaced");
    expect(text).toContain("No campaign in the batch contains that fragment");
  });

  it("bulk_replace_urls refuses a request that would replace nothing", async () => {
    const { client, mockApi } = await createToolClient(
      campaignActionsModule,
      undefined,
      IMPERSONATION,
    );
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_bulk_replace_urls",
      arguments: {
        campaignIds: "31",
        find: "old.com",
        replace: "new.com",
        inCampaignSettings: false,
        inCreatives: false,
        dryRun: true,
      },
    });

    expect(getTextFromResult(result)).toContain("Nothing would be replaced");
    expect(api.bulkReplaceCampaignUrls).not.toHaveBeenCalled();
  });

  it("bulk_replace_urls rejects duplicate campaign IDs", async () => {
    const { client, mockApi } = await createToolClient(
      campaignActionsModule,
      undefined,
      IMPERSONATION,
    );
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_bulk_replace_urls",
      arguments: { campaignIds: "31,31", find: "old.com", replace: "new.com", dryRun: true },
    });

    expect(getTextFromResult(result)).toContain("unique");
    expect(api.bulkReplaceCampaignUrls).not.toHaveBeenCalled();
  });

  it("get_traffic_forecast resolves targeting names into the IDs the API expects", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaignForecast.mockResolvedValue({
      forecast: [
        { bid: 0.011, traffic: 9764 },
        { bid: 0.015, traffic: 19528 },
      ],
      hasEnoughData: true,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_get_traffic_forecast",
      arguments: { pricingModel: "cpc", type: "push", countries: "US" },
    });
    const text = getTextFromResult(result);

    expect(api.getCampaignForecast).toHaveBeenCalledWith({
      cpType: 0,
      type: 30,
      regions: [34],
    });
    expect(text).toContain("0.011 -> 9764");
  });

  it("get_traffic_forecast explains an empty curve instead of reporting zero traffic", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaignForecast.mockResolvedValue({
      forecast: [],
      hasEnoughData: false,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_get_traffic_forecast",
      arguments: { pricingModel: "cpm" },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("No forecast available");
    expect(text).toContain("not a zero-traffic verdict");
  });

  it("get_traffic_forecast refuses a device filter the forecast cannot apply", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_get_traffic_forecast",
      arguments: { pricingModel: "cpc", devices: "Smartphone" },
    });

    expect(getTextFromResult(result)).toContain("not broken down by device");
    expect(api.getCampaignForecast).not.toHaveBeenCalled();
  });

  it("set_campaign_rss saves the feed and warns the creatives are not there yet", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;
    api.setCampaignRss.mockResolvedValue({} as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_set_campaign_rss",
        arguments: { campaignId: 31, link: "https://example.com/feed.xml" },
      }),
    );

    expect(api.setCampaignRss).toHaveBeenCalledWith(31, {
      link: "https://example.com/feed.xml",
      notRemove: true,
      isPauseAfterModer: false,
    });
    expect(text).toContain("not there yet");
  });

  it("set_campaign_rss treats an empty link as stopping the import", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;
    api.setCampaignRss.mockResolvedValue({} as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_set_campaign_rss",
        arguments: { campaignId: 31, link: "", keepRemovedCreatives: false },
      }),
    );

    expect(api.setCampaignRss).toHaveBeenCalledWith(31, {
      link: "",
      notRemove: false,
      isPauseAfterModer: false,
    });
    expect(text).toContain("no longer imports");
    expect(text).toContain("imported earlier are untouched");
  });

  it("set_easy_start reports which inventory the campaign can buy after the change", async () => {
    const { client, mockApi } = await createToolClient(
      campaignActionsModule,
      undefined,
      IMPERSONATION,
    );
    const api = mockApi as MockPartnersClient;
    api.setCampaignEasyStart.mockResolvedValue({ id: 31, isEasyStart: true } as never);

    const on = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_set_easy_start",
        arguments: { campaignId: 31, enabled: true },
      }),
    );

    expect(api.setCampaignEasyStart).toHaveBeenCalledWith(31, true);
    expect(on).toContain("curated site set");

    const off = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_set_easy_start",
        arguments: { campaignId: 31, enabled: false },
      }),
    );

    expect(api.setCampaignEasyStart).toHaveBeenLastCalledWith(31, false);
    expect(off).toContain("whole inventory");
  });

  it("get_blocked_traffic_sources separates category blocks from tag blocks", async () => {
    const { client, mockApi } = await createToolClient(
      campaignActionsModule,
      undefined,
      IMPERSONATION,
    );
    const api = mockApi as MockPartnersClient;
    api.getCampaignBlockedSsps.mockResolvedValue({
      category: "Dating",
      payModel: "cpc",
      totalClicks: 18402,
      totalViews: 0,
      byCategory: [{ id: 4, name: "Some SSP", visits: 100, clicks: 12000, views: 300000 }],
      byTags: [
        {
          id: 17,
          name: "Shock content",
          description: "Blood or injuries",
          ssps: [{ id: 9, name: "Other SSP", visits: 50, clicks: 6402, views: 120000 }],
        },
      ],
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_get_blocked_traffic_sources",
      arguments: { campaignId: 31 },
    });
    const text = getTextFromResult(result);

    expect(api.getCampaignBlockedSsps).toHaveBeenCalledWith(31);
    expect(text).toContain("Dating");
    expect(text).toContain("18402 clicks/day");
    expect(text).toContain("Some SSP");
    expect(text).toContain('Blocked by moderation tag "Shock content"');
    expect(text).toContain("Removing the tag");
  });

  it("get_blocked_traffic_sources says so when nothing blocks the campaign", async () => {
    const { client, mockApi } = await createToolClient(
      campaignActionsModule,
      undefined,
      IMPERSONATION,
    );
    const api = mockApi as MockPartnersClient;
    api.getCampaignBlockedSsps.mockResolvedValue({
      category: "Dating",
      payModel: "cpc",
      totalClicks: 0,
      totalViews: 0,
      byCategory: [],
      byTags: [],
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_get_blocked_traffic_sources",
      arguments: { campaignId: 31 },
    });

    expect(getTextFromResult(result)).toContain("No traffic source blocks this campaign");
  });

  it("copy_campaign maps a cross-format copy to the target campaign type", async () => {
    const { client, mockApi } = await createToolClient(campaignActionsModule);
    const api = mockApi as MockPartnersClient;
    api.copyCampaign.mockResolvedValue({
      id: 323,
      successful: 0,
      failed: 0,
      errors: [],
      bidsJobId: null,
    } as never);

    await client.callTool({
      name: "kadam_adv_copy_campaign",
      arguments: { id: 31, name: "As in-page", folderId: 100, targetType: "inpage_push" },
    });

    expect(api.copyCampaign).toHaveBeenCalledWith(
      31,
      expect.objectContaining({ targetCampaignType: 100 }),
    );
  });
});
