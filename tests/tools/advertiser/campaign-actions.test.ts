import {
  createToolClient,
  getTextFromResult,
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

    expect(api.copyCampaign).toHaveBeenCalledWith(
      31,
      expect.objectContaining({ copyBids: true }),
    );
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
