import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
import { campaignFoldersModule } from "../../../src/tools/advertiser/campaign-folders.js";
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

describe("campaign-folders tools", () => {
  it("list_campaign_folders returns formatted list", async () => {
    const { client, mockApi } = await createToolClient(campaignFoldersModule);
    const api = mockApi as MockPartnersClient;
    api.listCampaignFolders.mockResolvedValue({
      rows: [
        {
          folder: {
            id: 1,
            name: "My Folder",
            state: { id: "active", label: "Active" },
            campaignsCount: 5,
            activeCampaignsCount: 3,
          },
          views: "1000",
          clicks: "50",
          moneyOut: "25.00",
        },
      ],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_list_campaign_folders",
      arguments: { page: 1 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("[ID: 1]");
    expect(text).toContain("My Folder");
    expect(text).toContain("Campaign Folders");
  });

  it("create_campaign_folder calls api and returns ID", async () => {
    const { client, mockApi } = await createToolClient(campaignFoldersModule);
    const api = mockApi as MockPartnersClient;
    api.createCampaignFolder.mockResolvedValue({ id: 42 } as never);

    const result = await client.callTool({
      name: "kadam_adv_create_campaign_folder",
      arguments: { name: "Test Folder" },
    });
    const text = getTextFromResult(result);

    expect(api.createCampaignFolder).toHaveBeenCalledWith("Test Folder");
    expect(text).toContain("Folder created: [ID: 42]");
  });

  it("update_campaign_folder auto-sets limitsEnabled when budget is provided", async () => {
    const { client, mockApi } = await createToolClient(campaignFoldersModule);
    const api = mockApi as MockPartnersClient;
    api.updateCampaignFolder.mockResolvedValue(undefined as never);

    const result = await client.callTool({
      name: "kadam_adv_update_campaign_folder",
      arguments: { id: 1, dailyBudget: 500 },
    });
    const text = getTextFromResult(result);

    expect(api.updateCampaignFolder).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        groupDailyLimit: 500,
        limitsEnabled: true,
      }),
    );
    expect(text).toContain("updated successfully");
  });

  it("update_campaign_folder respects explicit limitsEnabled=false", async () => {
    const { client, mockApi } = await createToolClient(campaignFoldersModule);
    const api = mockApi as MockPartnersClient;
    api.updateCampaignFolder.mockResolvedValue(undefined as never);

    await client.callTool({
      name: "kadam_adv_update_campaign_folder",
      arguments: { id: 2, limitsEnabled: false },
    });

    expect(api.updateCampaignFolder).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        limitsEnabled: false,
      }),
    );
  });

  it("create_campaign_folder accepts short names (1-3 chars)", async () => {
    const { client, mockApi } = await createToolClient(campaignFoldersModule);
    const api = mockApi as MockPartnersClient;
    api.createCampaignFolder.mockResolvedValue({ id: 99 } as never);

    const result = await client.callTool({
      name: "kadam_adv_create_campaign_folder",
      arguments: { name: "SA" },
    });
    const text = getTextFromResult(result);

    expect(api.createCampaignFolder).toHaveBeenCalledWith("SA");
    expect(text).toContain("[ID: 99]");
  });
});
