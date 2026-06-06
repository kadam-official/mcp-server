import {
  createToolClient,
  getTextFromResult,
  type MockPubClient,
} from "../../helpers/tool-client.js";
import { adUnitsModule } from "../../../src/tools/publisher/ad-units.js";
import { resetConfig } from "../../../src/config.js";

vi.mock("../../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

beforeEach(() => {
  process.env.KADAM_PUB_API_KEY = "test-pub-key";
});
afterEach(() => {
  delete process.env.KADAM_PUB_API_KEY;
  resetConfig();
});

describe("publisher ad-units tools", () => {
  it("list_ad_units with adFormat native includes type 0 (AD_UNIT_TYPE_MAP)", async () => {
    const { client, mockApi } = await createToolClient(adUnitsModule);
    const api = mockApi as MockPubClient;
    api.listAdUnits.mockResolvedValue({
      data: [
        {
          id: 1,
          sourceId: 10,
          name: "Native Unit",
          type: 0,
          status: "active",
          impressions: 1000,
          clicks: 20,
          revenue: 15,
        },
      ],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });

    await client.callTool({
      name: "kadam_pub_list_ad_units",
      arguments: { sourceId: 10, adFormat: "native" },
    });

    expect(api.listAdUnits).toHaveBeenCalledWith(10, expect.objectContaining({ type: 0 }));
  });

  it("set_ad_unit_status with status archived passes action delete to API", async () => {
    const { client, mockApi } = await createToolClient(adUnitsModule);
    const api = mockApi as MockPubClient;
    api.setAdUnitStatus.mockResolvedValue(undefined as never);

    const result = await client.callTool({
      name: "kadam_pub_set_ad_unit_status",
      arguments: { id: 7, status: "archived" },
    });
    const text = getTextFromResult(result);

    expect(api.setAdUnitStatus).toHaveBeenCalledWith(7, "delete");
    expect(text).toContain("set to archived");
  });

  it("set_ad_unit_status with status restored passes action restore", async () => {
    const { client, mockApi } = await createToolClient(adUnitsModule);
    const api = mockApi as MockPubClient;
    api.setAdUnitStatus.mockResolvedValue(undefined as never);

    const result = await client.callTool({
      name: "kadam_pub_set_ad_unit_status",
      arguments: { id: 8, status: "restored" },
    });
    const text = getTextFromResult(result);

    expect(api.setAdUnitStatus).toHaveBeenCalledWith(8, "restore");
    expect(text).toContain("set to restored");
  });
});
