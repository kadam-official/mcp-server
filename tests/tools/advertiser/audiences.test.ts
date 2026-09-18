import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
import { audiencesModule } from "../../../src/tools/advertiser/audiences.js";
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

describe("audiences tools", () => {
  it("list_audiences returns formatted list with audienceId/audienceName", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.listAudiences.mockResolvedValue({
      rows: [
        {
          audienceId: 1,
          audienceName: "Test Audience",
          type: "audience",
          fp: false,
          dateCreated: "01.03.2026",
          expireDays: 30,
          reachToday: 100,
          newToday: 10,
          reach7d: 500,
          new7d: 50,
        },
      ],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_list_audiences",
      arguments: { page: 1 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("[ID: 1]");
    expect(text).toContain("Test Audience");
    expect(text).toContain("Audiences");
  });

  it("list_audiences nests searchQuery under filters and sort as an object (KTS-1590)", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.listAudiences.mockResolvedValue({ rows: [], totalRows: 0, page: 1, perPage: 25 });

    await client.callTool({
      name: "kadam_adv_list_audiences",
      arguments: { page: 1, searchQuery: "retarget", sortField: "reachToday", sortOrder: "desc" },
    });

    expect(api.listAudiences).toHaveBeenCalledWith({
      page: 1,
      perPage: 25,
      filters: { searchQuery: "retarget" },
      sort: { reachToday: "desc" },
    });
  });

  it("get_audience returns type-specific detail for s2s", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.getAudience.mockResolvedValue({
      id: 5,
      name: "S2S Audience",
      type: "s2s",
      expireDays: 30,
      audienceCode: "https://example.com/match_s2s/5/",
      linkedAudiencesIds: [1, 2],
      linkedAudiences: { "1": "Pixel [audience_code]", "2": "FP [fingerprint]" },
      usersIds: null,
      fp: null,
    });

    const result = await client.callTool({
      name: "kadam_adv_get_audience",
      arguments: { id: 5 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Audience #5");
    expect(text).toContain("S2S Audience");
    expect(text).toContain("Linked Audiences");
    expect(text).toContain("Pixel [audience_code]");
  });

  it("get_audience shows tracking flags for stat type", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.getAudience.mockResolvedValue({
      id: 10,
      name: "Stat Audience",
      type: "audience",
      expireDays: 14,
      hasClicks: true,
      hasConversions: true,
      hasHolds: false,
      hasRejects: false,
      campaignsIds: [100],
      campaigns: { "100": "Campaign A" },
      usersIds: null,
      fp: { id: 11, name: "Stat Audience - FP" },
    });

    const result = await client.callTool({
      name: "kadam_adv_get_audience",
      arguments: { id: 10 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("clicks, conversions");
    expect(text).toContain("Campaign A");
    expect(text).toContain("Fingerprint Audience");
  });

  it("create_audience sends correct payload for s2s", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.createAudience.mockResolvedValue({
      id: 42,
      name: "New S2S",
      type: "s2s",
      expireDays: 14,
      audienceCode: "https://example.com/match_s2s/42/",
      linkedAudiencesIds: [1, 2],
      linkedAudiences: { "1": "px [audience_code]", "2": "fp [fingerprint]" },
      usersIds: null,
      fp: null,
    });

    const result = await client.callTool({
      name: "kadam_adv_create_audience",
      arguments: {
        type: "s2s",
        name: "New S2S",
        expireDays: 14,
        linkedAudienceIds: "1,2",
      },
    });
    const text = getTextFromResult(result);

    expect(api.createAudience).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "s2s",
        linkedAudiencesIds: [1, 2],
      }),
    );
    expect(text).toContain("Audience #42");
    expect(text).toContain("New S2S");
  });

  it("create_audience sends correct payload for stat with campaigns", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.createAudience.mockResolvedValue({
      id: 50,
      name: "Stat Aud",
      type: "audience",
      expireDays: 30,
      hasClicks: true,
      hasConversions: false,
      hasHolds: false,
      hasRejects: false,
      campaignsIds: [100, 200],
      campaigns: { "100": "C1", "200": "C2" },
      usersIds: null,
      fp: null,
    });

    await client.callTool({
      name: "kadam_adv_create_audience",
      arguments: {
        type: "audience",
        name: "Stat Aud",
        expireDays: 30,
        campaignIds: "100,200",
        hasClicks: true,
      },
    });

    expect(api.createAudience).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "audience",
        campaignsIds: [100, 200],
        hasClicks: true,
      }),
    );
  });

  it("delete_audience with confirm true works", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.deleteAudience.mockResolvedValue(undefined as never);

    const result = await client.callTool({
      name: "kadam_adv_delete_audience",
      arguments: { id: 10, confirm: true },
    });
    const text = getTextFromResult(result);

    expect(api.deleteAudience).toHaveBeenCalledWith(10);
    expect(text).toContain("deleted permanently");
  });

  it("update_audience does read-modify-write with correct merge", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.getAudience.mockResolvedValue({
      id: 5,
      name: "Old Name",
      type: "s2s",
      expireDays: 10,
      audienceCode: "https://example.com/match_s2s/5/",
      linkedAudiencesIds: [1, 2],
      linkedAudiences: { "1": "a1", "2": "a2" },
      usersIds: null,
      fp: null,
    });
    api.updateAudience.mockResolvedValue(undefined as never);

    const result = await client.callTool({
      name: "kadam_adv_update_audience",
      arguments: { id: 5, name: "Updated Name", expireDays: 14, linkedAudienceIds: "1,3" },
    });
    const text = getTextFromResult(result);

    expect(api.getAudience).toHaveBeenCalledWith(5);
    expect(api.updateAudience).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        type: "s2s",
        name: "Updated Name",
        expireDays: 14,
        linkedAudiencesIds: [1, 3],
      }),
    );
    expect(text).toContain("updated");
  });
});

describe("audience params", () => {
  it("get_audience_params reports only the slots that are set", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.getAudienceParams.mockResolvedValue({
      event: "deposit",
      paramStr: "campaign_42",
      paramStr2: null,
      paramInt: 500,
      paramInt2: null,
    } as never);

    const text = getTextFromResult(
      await client.callTool({ name: "kadam_adv_get_audience_params", arguments: { id: 27 } }),
    );

    expect(text).toContain("event: deposit");
    expect(text).toContain("paramInt: 500");
    expect(text).not.toContain("paramStr2");
  });

  /**
   * Запись заменяет набор целиком, поэтому не переданные аргументы должны уйти на бэкенд
   * явными null — иначе «оставил как было» и «стёр» стали бы неразличимы.
   */
  it("set_audience_params sends every slot, clearing the ones left out", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.setAudienceParams.mockResolvedValue({
      event: "registration",
      paramStr: null,
      paramStr2: null,
      paramInt: null,
      paramInt2: null,
    } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_set_audience_params",
        arguments: { id: 27, event: "registration" },
      }),
    );

    expect(api.setAudienceParams).toHaveBeenCalledWith(27, {
      event: "registration",
      paramStr: null,
      paramStr2: null,
      paramInt: null,
      paramInt2: null,
    });
    expect(text).toContain("Parameters saved for audience #27");
    expect(text).toContain("event: registration");
  });

  it("set_audience_params says when the audience was left with no parameters", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.setAudienceParams.mockResolvedValue({
      event: null,
      paramStr: null,
      paramStr2: null,
      paramInt: null,
      paramInt2: null,
    } as never);

    const text = getTextFromResult(
      await client.callTool({ name: "kadam_adv_set_audience_params", arguments: { id: 27 } }),
    );

    expect(text).toContain("No parameters left for audience #27");
  });
});

describe("filtered audience sources and dry run", () => {
  it("get_filtered_audience_sources lists what a filter can be built on", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.getFilteredAudienceSources.mockResolvedValue([
      { id: 100, name: "Pixel" },
      { id: 101, name: "Stat" },
    ] as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_get_filtered_audience_sources",
        arguments: {},
      }),
    );

    expect(text).toContain("[ID: 100] Pixel");
    expect(text).toContain("[ID: 101] Stat");
  });

  it("create_audience with dryRun validates and creates nothing", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.validateAudience.mockResolvedValue({ valid: true } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_create_audience",
        arguments: {
          type: "audience_code",
          name: "Pixel to be",
          expireDays: 30,
          dryRun: true,
        },
      }),
    );

    expect(api.validateAudience).toHaveBeenCalledTimes(1);
    expect(api.createAudience).not.toHaveBeenCalled();
    expect(text).toContain("Nothing was created");
  });
});
