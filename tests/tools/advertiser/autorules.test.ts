import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
import { autorulesModule } from "../../../src/tools/advertiser/autorules.js";
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

const SAMPLE_RULE = {
  id: 16637,
  campaignId: 915308,
  typeId: 4,
  period: 2,
  conditions: [
    { match: "more", value: 1.1, metric: "spend" },
    { match: "equals", value: 0, metric: "conversions" },
  ],
  statBy: "campaign",
  action: "bidChange",
  position: 1,
  isActive: 1,
  slices: [180, 190],
  bidRate: 0.5,
  bidMax: 0.0015,
  dayLimitValue: null,
  dayLimitType: null,
  createdAt: 1782828266,
};

describe("autorules tools", () => {
  it("list_autorules (by campaign) formats rules with conditions and bid params", async () => {
    const { client, mockApi } = await createToolClient(autorulesModule);
    const api = mockApi as MockPartnersClient;
    api.listCampaignAutorules.mockResolvedValue([SAMPLE_RULE]);

    const result = await client.callTool({
      name: "kadam_adv_list_autorules",
      arguments: { campaignId: 915308 },
    });
    const text = getTextFromResult(result);

    expect(api.listCampaignAutorules).toHaveBeenCalledWith(915308);
    expect(text).toContain("[ID: 16637]");
    expect(text).toContain("bid -> bidChange");
    expect(text).toContain("spend more 1.1 AND conversions equals 0");
    expect(text).toContain("slices 180,190");
  });

  it("list_autorules (no campaign) calls the account-wide endpoint", async () => {
    const { client, mockApi } = await createToolClient(autorulesModule);
    const api = mockApi as MockPartnersClient;
    api.listAutorules.mockResolvedValue([]);

    await client.callTool({ name: "kadam_adv_list_autorules", arguments: {} });
    expect(api.listAutorules).toHaveBeenCalled();
  });

  it("create_autorule maps type->typeId and forwards rule body", async () => {
    const { client, mockApi } = await createToolClient(autorulesModule);
    const api = mockApi as MockPartnersClient;
    api.createAutorule.mockResolvedValue({ id: 999 });

    const result = await client.callTool({
      name: "kadam_adv_create_autorule",
      arguments: {
        campaignId: 100,
        type: "bid",
        period: 7,
        conditions: [{ metric: "spend", match: "more", value: 1 }],
        action: "bidChange",
        slices: [180, 190],
        bidRate: 0.9,
        bidMax: 0.007,
      },
    });

    expect(api.createAutorule).toHaveBeenCalledWith(100, {
      typeId: 4,
      period: 7,
      conditions: [{ metric: "spend", match: "more", value: 1 }],
      action: "bidChange",
      slices: [180, 190],
      bidRate: 0.9,
      bidMax: 0.007,
    });
    expect(getTextFromResult(result)).toContain("[ID: 999]");
  });

  it("update_autorule does read-modify-write (fetch, merge, full PUT)", async () => {
    const { client, mockApi } = await createToolClient(autorulesModule);
    const api = mockApi as MockPartnersClient;
    api.getAutorule.mockResolvedValue(SAMPLE_RULE);
    api.updateAutorule.mockResolvedValue({});

    await client.callTool({
      name: "kadam_adv_update_autorule",
      arguments: { id: 16637, bidRate: 0.7 },
    });

    expect(api.getAutorule).toHaveBeenCalledWith(16637);
    const [, payload] = api.updateAutorule.mock.calls[0]!;
    expect(payload).toMatchObject({
      typeId: 4,
      action: "bidChange",
      bidRate: 0.7, // changed
      bidMax: 0.0015, // preserved
    });
  });

  it("set_autorule_status toggles isActive", async () => {
    const { client, mockApi } = await createToolClient(autorulesModule);
    const api = mockApi as MockPartnersClient;
    api.setAutoruleStatus.mockResolvedValue({});

    const result = await client.callTool({
      name: "kadam_adv_set_autorule_status",
      arguments: { id: 5, isActive: false },
    });

    expect(api.setAutoruleStatus).toHaveBeenCalledWith(5, false);
    expect(getTextFromResult(result)).toContain("disabled");
  });

  it("delete_autorule requires confirm", async () => {
    const { client, mockApi } = await createToolClient(autorulesModule);
    const api = mockApi as MockPartnersClient;
    api.deleteAutorule.mockResolvedValue({});

    await client.callTool({
      name: "kadam_adv_delete_autorule",
      arguments: { id: 7, confirm: true },
    });
    expect(api.deleteAutorule).toHaveBeenCalledWith(7);
  });
});
