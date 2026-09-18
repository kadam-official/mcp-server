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
    expect(text).toContain("Campaign groups");
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
    expect(text).toContain("Campaign group created: [ID: 42]");
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

  it("get_campaign_folder returns formatted folder details", async () => {
    const { client, mockApi } = await createToolClient(campaignFoldersModule);
    const api = mockApi as MockPartnersClient;
    api.getCampaignFolder.mockResolvedValue({
      id: 15,
      name: "US campaigns",
      isDefault: false,
      isArchived: false,
      limitsEnabled: true,
      groupDailyLimit: 5.05,
      groupTotalLimit: 100,
      groupSpendingEvenly: true,
      groupBlockStatus: 0,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_get_campaign_folder",
      arguments: { id: 15 },
    });
    const text = getTextFromResult(result);

    expect(api.getCampaignFolder).toHaveBeenCalledWith(15);
    expect(text).toContain("[ID: 15]");
    expect(text).toContain("US campaigns");
    expect(text).toContain("Daily budget: 5.05");
    expect(text).toContain("Archived: no");
  });

  it("update_campaign_folder renames without touching limits", async () => {
    const { client, mockApi } = await createToolClient(campaignFoldersModule);
    const api = mockApi as MockPartnersClient;
    api.updateCampaignFolder.mockResolvedValue(undefined as never);

    const result = await client.callTool({
      name: "kadam_adv_update_campaign_folder",
      arguments: { id: 7, name: "Renamed" },
    });
    const text = getTextFromResult(result);

    expect(api.updateCampaignFolder).toHaveBeenCalledWith(7, { name: "Renamed" });
    expect(text).toContain("updated successfully");
  });

  it("update_campaign_folder with no fields does not call the API", async () => {
    const { client, mockApi } = await createToolClient(campaignFoldersModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_update_campaign_folder",
      arguments: { id: 7 },
    });
    const text = getTextFromResult(result);

    expect(api.updateCampaignFolder).not.toHaveBeenCalled();
    expect(text).toContain("Nothing to update");
  });

  it("set_campaign_folder_status reports per-folder results", async () => {
    const { client, mockApi } = await createToolClient(campaignFoldersModule);
    const api = mockApi as MockPartnersClient;
    api.setCampaignFolderStatus.mockResolvedValue({
      folders: [
        { id: 15, success: true, campaignsTotal: 3, campaignsProcessed: 3 },
        { id: 16, success: false, campaignsTotal: 2, campaignsProcessed: 0 },
      ],
      totalFolders: 2,
      processedFolders: 1,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_set_campaign_folder_status",
      arguments: { ids: "15, 16", action: "activate" },
    });
    const text = getTextFromResult(result);

    expect(api.setCampaignFolderStatus).toHaveBeenCalledWith([15, 16], "activate");
    expect(text).toContain("1/2 campaign groups fully processed");
    expect(text).toContain("#15: ok (3/3 campaigns)");
    expect(text).toContain("#16: FAILED (0/2 campaigns)");
  });

  it("set_campaign_folder_status rejects unsupported action", async () => {
    const { client, mockApi } = await createToolClient(campaignFoldersModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_set_campaign_folder_status",
      arguments: { ids: "6", action: "restore" },
    });
    const text = getTextFromResult(result);

    expect(api.setCampaignFolderStatus).not.toHaveBeenCalled();
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(text).toContain("Invalid arguments");
  });
});
