import { describe, expect, it, vi } from "vitest";
import { PartnersClient } from "../../src/api/partners-client.js";
import type { HttpClient } from "../../src/api/http-client.js";

function createClient(http: Partial<Pick<HttpClient, "get" | "put">>): PartnersClient {
  return new PartnersClient(http as HttpClient);
}

const usdCurrency = {
  currency: "usd",
  currencyId: 20,
  commission: 3,
  constCommission: 0.5,
  min: 50,
  max: 10000,
  exchangeRateToAccountCurrency: 1,
};

describe("PartnersClient payment systems", () => {
  it("listPaymentSystems calls GET /finances/payment-systems", async () => {
    const get = vi.fn().mockResolvedValue({
      paymentSystems: [
        {
          id: 38,
          name: "paypal",
          isManualThroughManager: false,
          isPromocodeAvailable: true,
          taxPercent: 0,
          currencies: [usdCurrency],
        },
      ],
    });
    const client = createClient({ get });

    const { paymentSystems } = await client.listPaymentSystems();

    expect(get).toHaveBeenCalledWith("/finances/payment-systems");
    expect(paymentSystems).toHaveLength(1);
    expect(paymentSystems[0]!.currencies[0]!.currencyId).toBe(20);
  });

  it("surfaces a malformed payload instead of passing it to the tool layer", async () => {
    const get = vi.fn().mockResolvedValue({ paymentSystems: [{ id: 38 }] });
    const client = createClient({ get });

    await expect(client.listPaymentSystems()).rejects.toThrow();
  });
});

describe("PartnersClient account daily limit", () => {
  it("getDayMoneyLimit calls GET /finances/day-money-limit", async () => {
    const get = vi.fn().mockResolvedValue({ limit: 500, minimum: 50, currency: "usd" });
    const client = createClient({ get });

    const limit = await client.getDayMoneyLimit();

    expect(get).toHaveBeenCalledWith("/finances/day-money-limit");
    expect(limit).toEqual({ limit: 500, minimum: 50, currency: "usd" });
  });

  it("setDayMoneyLimit PUTs the amount under the limit key", async () => {
    const put = vi.fn().mockResolvedValue({ limit: 300, minimum: 50, currency: "usd" });
    const client = createClient({ put });

    const limit = await client.setDayMoneyLimit(300);

    expect(put).toHaveBeenCalledWith("/finances/day-money-limit", { limit: 300 });
    expect(limit.limit).toBe(300);
  });

  it("sends a zero limit, which is how the cap is removed", async () => {
    const put = vi.fn().mockResolvedValue({ limit: 0, minimum: 50, currency: "usd" });
    const client = createClient({ put });

    await client.setDayMoneyLimit(0);

    expect(put).toHaveBeenCalledWith("/finances/day-money-limit", { limit: 0 });
  });
});
