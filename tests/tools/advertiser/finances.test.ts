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
          status: { id: 2, label: "Paid" },
        },
        {
          date: "2025-01-16",
          money: "-50.00",
          type: "charge",
          extType: "campaign",
          comment: "",
          status: { id: 1, label: "Approved" },
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
    // status object label surfaced in output
    expect(text).toContain("Paid");
    expect(text).toContain("Approved");
  });

  it("formats rows without status cleanly (no trailing undefined)", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.listFinanceOperations.mockResolvedValue({
      rows: [{ date: "2025-02-01", money: "10.00", type: "deposit", status: 1 }],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_list_finance_operations",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(text).toContain("2025-02-01");
    expect(text).not.toContain("undefined");
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

  it("drops a half-open date range (only one date) instead of sending an invalid pair", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.listFinanceOperations.mockResolvedValue({ rows: [], totalRows: 0, page: 1, perPage: 25 });

    const result = await client.callTool({
      name: "kadam_adv_list_finance_operations",
      arguments: { dateFrom: "2025-01-01" },
    });

    // The API rejects a half-open range, so a lone date must not be sent at all.
    expect(api.listFinanceOperations).toHaveBeenCalledWith({ page: 1, perPage: 25 });
    expect(getTextFromResult(result)).toContain("all time");
  });

  it("nests dates under filters and maps activityType to filters.type int (KTS-1590)", async () => {
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
      arguments: { dateFrom: "2025-01-01", dateTo: "2025-01-31", activityType: "deposit" },
    });

    expect(api.listFinanceOperations).toHaveBeenCalledWith({
      page: 1,
      perPage: 25,
      filters: { dateFrom: "2025-01-01", dateTo: "2025-01-31", type: 2 },
    });
  });
});

describe("payment systems tool", () => {
  it("lists each system with its per-currency deposit conditions", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.listPaymentSystems.mockResolvedValue({
      paymentSystems: [
        {
          id: 38,
          name: "paypal",
          isManualThroughManager: false,
          isPromocodeAvailable: true,
          taxPercent: 5,
          currencies: [
            {
              currency: "usd",
              currencyId: 20,
              commission: 3,
              constCommission: 0.5,
              min: 50,
              max: 10000,
              exchangeRateToAccountCurrency: 1,
            },
          ],
        },
      ],
    });

    const result = await client.callTool({
      name: "kadam_adv_list_payment_systems",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(result.isError).toBeFalsy();
    expect(text).toContain("Payment systems (1)");
    expect(text).toContain("[ID: 38] paypal");
    expect(text).toContain("promo code accepted");
    expect(text).toContain("tax 5%");
    expect(text).toContain("usd");
    expect(text).toContain("commission 3%");
    expect(text).toContain("+0.5 fixed");
    expect(text).toContain("min 50");
    expect(text).toContain("max 10000");
    expect(text).toContain("rate to account currency 1");
  });

  it("says no max when the system is unbounded and hides a zero fixed fee", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.listPaymentSystems.mockResolvedValue({
      paymentSystems: [
        {
          id: 12,
          name: "wire",
          isManualThroughManager: true,
          isPromocodeAvailable: false,
          taxPercent: 0,
          currencies: [
            {
              currency: "eur",
              currencyId: 30,
              commission: 0,
              constCommission: 0,
              min: 100,
              max: null,
              exchangeRateToAccountCurrency: null,
            },
          ],
        },
      ],
    });

    const result = await client.callTool({
      name: "kadam_adv_list_payment_systems",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(result.isError).toBeFalsy();
    expect(text).toContain("arranged through a manager");
    expect(text).toContain("no max");
    expect(text).not.toContain("fixed");
    expect(text).not.toContain("tax 0%");
    // A missing rate must be omitted rather than rendered as an empty value.
    expect(text).not.toContain("rate to account currency");
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
  });

  it("reports an empty list as zero systems rather than an empty answer", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.listPaymentSystems.mockResolvedValue({ paymentSystems: [] });

    const result = await client.callTool({
      name: "kadam_adv_list_payment_systems",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(getTextFromResult(result)).toContain("Payment systems (0)");
  });
});

describe("account daily limit tools", () => {
  it("reports the current limit together with the minimum it may be set to", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.getDayMoneyLimit.mockResolvedValue({
      limit: 500,
      minimum: 50,
      currency: "usd",
    });

    const result = await client.callTool({
      name: "kadam_adv_get_day_money_limit",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(result.isError).toBeFalsy();
    expect(text).toContain("Account Daily Spending Limit");
    expect(text).toContain("500 usd");
    expect(text).toMatch(/Minimum\s+: 50/);
    expect(api.getDayMoneyLimit).toHaveBeenCalledTimes(1);
  });

  it("spells out that a zero limit means no cap", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.getDayMoneyLimit.mockResolvedValue({ limit: 0, minimum: 50, currency: "usd" });

    const text = getTextFromResult(
      await client.callTool({ name: "kadam_adv_get_day_money_limit", arguments: {} }),
    );

    expect(text).toContain("no daily limit set");
  });

  it("says the limit is not changeable when the account currency has no minimum", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.getDayMoneyLimit.mockResolvedValue({ limit: 0, minimum: null, currency: "rub" });

    const text = getTextFromResult(
      await client.callTool({ name: "kadam_adv_get_day_money_limit", arguments: {} }),
    );

    expect(text).toContain("not changeable on a rub account");
    expect(text).not.toContain("null");
  });

  it("sets the limit and reports the value the API saved", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.setDayMoneyLimit.mockResolvedValue({
      limit: 300,
      minimum: 50,
      currency: "usd",
    });

    const result = await client.callTool({
      name: "kadam_adv_set_day_money_limit",
      arguments: { limit: 300 },
    });
    const text = getTextFromResult(result);

    expect(result.isError).toBeFalsy();
    expect(api.setDayMoneyLimit).toHaveBeenCalledWith(300);
    expect(text).toContain("300 usd");
    expect(api.getDayMoneyLimit).not.toHaveBeenCalled();
  });

  it("forwards a zero limit so the cap can be removed", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;
    api.setDayMoneyLimit.mockResolvedValue({ limit: 0, minimum: 50, currency: "usd" });

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_set_day_money_limit",
        arguments: { limit: 0 },
      }),
    );

    // 0 is the documented way to remove the limit, so it must not be dropped as falsy.
    expect(api.setDayMoneyLimit).toHaveBeenCalledWith(0);
    expect(text).toContain("no daily limit set");
  });

  it("rejects a negative limit without calling the API", async () => {
    const { client, mockApi } = await createToolClient(financesModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_set_day_money_limit",
      arguments: { limit: -1 },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(api.setDayMoneyLimit).not.toHaveBeenCalled();
  });
});
