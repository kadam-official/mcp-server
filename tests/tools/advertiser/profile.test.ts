import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
import { profileModule } from "../../../src/tools/advertiser/profile.js";
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

describe("advertiser profile tools", () => {
  it("get_account returns id, balance, currency, registeredAt, timezone and dayLimit", async () => {
    const { client, mockApi } = await createToolClient(profileModule);
    const api = mockApi as MockPartnersClient;
    api.getAccountProfile.mockResolvedValue({
      id: 127296,
      balance: 3698.99,
      currency: "usd",
      registeredAt: "2021-01-01T00:00:00Z",
      timezone: "+03:00",
      dayLimit: 500,
      email: "should-not-appear@example.com",
      name: "Dmitry",
    });

    const result = await client.callTool({
      name: "kadam_adv_get_account",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Advertiser Account");
    expect(text).toContain("127296");
    expect(text).toContain("$3698.99");
    expect(text).toContain("usd");
    expect(text).toContain("2021-01-01T00:00:00Z");
    expect(text).toContain("+03:00");
    expect(text).toContain("$500");
    expect(text).not.toContain("should-not-appear@example.com");
    expect(text).not.toContain("Dmitry");
  });

  it("renders dayLimit 0 as unlimited", async () => {
    const { client, mockApi } = await createToolClient(profileModule);
    const api = mockApi as MockPartnersClient;
    api.getAccountProfile.mockResolvedValue({
      id: 1,
      balance: 0,
      currency: "rub",
      registeredAt: "1970-01-01T00:00:00Z",
      timezone: "+00:00",
      dayLimit: 0,
    });

    const result = await client.callTool({
      name: "kadam_adv_get_account",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(text).toContain("₽0");
    expect(text).toContain("unlimited");
    expect(api.getAccountProfile).toHaveBeenCalledTimes(1);
  });

  it("get_balance returns only balance and currency", async () => {
    const { client, mockApi } = await createToolClient(profileModule);
    const api = mockApi as MockPartnersClient;
    api.getAccountBalance.mockResolvedValue({
      balance: 3698.99,
      currency: "usd",
      email: "should-not-appear@example.com",
    });

    const result = await client.callTool({
      name: "kadam_adv_get_balance",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Advertiser Balance");
    expect(text).toContain("$3698.99");
    expect(text).toContain("usd");
    expect(text).not.toContain("should-not-appear@example.com");
    expect(text).not.toContain("Id");
    expect(api.getAccountBalance).toHaveBeenCalledTimes(1);
    expect(api.getAccountProfile).not.toHaveBeenCalled();
  });
});
