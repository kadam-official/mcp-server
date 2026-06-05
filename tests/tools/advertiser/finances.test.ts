import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
import { financesModule } from "../../../src/tools/advertiser/finances.js";
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

describe("finances tools", () => {
  it("list_finance_operations returns formatted list with date range", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.listFinanceOperations.mockResolvedValue({
      rows: [
        {
          date: "2025-01-15",
          money: "100.00",
          type: "deposit",
          extType: "bank",
          comment: "Top up",
          status: 1,
        },
        {
          date: "2025-01-16",
          money: "-50.00",
          type: "charge",
          extType: "campaign",
          comment: "",
          status: 1,
        },
      ],
      totalRows: 2,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_list_finance_operations",
      arguments: { dateFrom: "2025-01-01", dateTo: "2025-01-31" },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Finance operations");
    expect(text).toContain("2025-01-15");
    expect(text).toContain("deposit");
    expect(text).toContain("2025-01-01 to 2025-01-31");
  });

  it("list_finance_operations with no date shows all time", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.listFinanceOperations.mockResolvedValue({
      rows: [],
      totalRows: 0,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_list_finance_operations",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(text).toContain("all time");
  });

  it("passes activityType filter to API", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.listFinanceOperations.mockResolvedValue({
      rows: [],
      totalRows: 0,
      page: 1,
      perPage: 25,
    });

    await client.callTool({
      name: "kadam_adv_list_finance_operations",
      arguments: { activityType: "deposit" },
    });

    expect(api.listFinanceOperations).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: "deposit" }),
    );
  });
});
