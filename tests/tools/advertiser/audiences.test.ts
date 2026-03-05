import { createToolClient, getTextFromResult, type MockPartnersClient } from "../../helpers/tool-client.js";
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
  it("list_audiences returns formatted list", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.listAudiences.mockResolvedValue({
      rows: [
        {
          id: 1,
          name: "Test Audience",
          type: "audience",
          expireDays: 30,
          size: 1000,
          status: "active",
          campaignsIds: [],
          hasClicks: false,
          hasConversions: false,
          hasHolds: false,
          hasRejects: false,
          linkedAudiencesIds: [],
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

  it("get_audience returns single entity format", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.getAudience.mockResolvedValue({
      id: 5,
      name: "My Audience",
      type: "audience",
      expireDays: 30,
      size: 500,
      status: "active",
      campaignsIds: [1, 2],
      hasClicks: true,
      hasConversions: false,
      hasHolds: false,
      hasRejects: false,
      linkedAudiencesIds: [],
    });

    const result = await client.callTool({
      name: "kadam_adv_get_audience",
      arguments: { id: 5 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Audience #5");
    expect(text).toContain("My Audience");
  });

  it("create_audience returns Audience created: [ID: ...]", async () => {
    const { client, mockApi } = await createToolClient(audiencesModule);
    const api = mockApi as MockPartnersClient;
    api.createAudience.mockResolvedValue({
      id: 42,
      name: "New Audience",
      type: "audience",
      expireDays: 14,
      size: 0,
      status: "active",
      campaignsIds: [],
      hasClicks: false,
      hasConversions: false,
      hasHolds: false,
      hasRejects: false,
      linkedAudiencesIds: [],
    });

    const result = await client.callTool({
      name: "kadam_adv_create_audience",
      arguments: {
        type: "audience",
        name: "New Audience",
        expireDays: 14,
      },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Audience created: [ID: 42]");
    expect(text).toContain("New Audience");
  });

  it("delete_audience with confirm true works and calls api.deleteAudience", async () => {
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
});
