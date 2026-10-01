import { describe, expect, it, vi } from "vitest";
import { PartnersClient } from "../../src/api/partners-client.js";
import type { HttpClient } from "../../src/api/http-client.js";

function createClient(http: Pick<HttpClient, "get">): PartnersClient {
  return new PartnersClient(http as HttpClient);
}

describe("PartnersClient account endpoints", () => {
  it("getAccountProfile calls GET /me", async () => {
    const get = vi.fn().mockResolvedValue({
      id: 127296,
      balance: 3698.99,
      currency: "usd",
      registeredAt: "2021-01-01T00:00:00Z",
      timezone: 3,
    });
    const client = createClient({ get });

    const profile = await client.getAccountProfile();

    expect(get).toHaveBeenCalledWith("/me");
    expect(profile.timezone).toBe(3);
    expect(profile).not.toHaveProperty("dayLimit");
  });

  it("getAccess calls GET /access and keeps only the flag the API promises", async () => {
    const get = vi.fn().mockResolvedValue({ impersonation: true });
    const client = createClient({ get });

    const access = await client.getAccess();

    expect(get).toHaveBeenCalledWith("/access");
    expect(access.impersonation).toBe(true);
  });

  it("getAccess rejects a payload without the flag instead of guessing a role", async () => {
    const get = vi.fn().mockResolvedValue({});
    const client = createClient({ get });

    await expect(client.getAccess()).rejects.toThrow();
  });

  it("getAccountBalance calls GET /finances/balance", async () => {
    const get = vi.fn().mockResolvedValue({
      balance: 3698.99,
      currency: "usd",
    });
    const client = createClient({ get });

    const balance = await client.getAccountBalance();

    expect(get).toHaveBeenCalledWith("/finances/balance");
    expect(balance).toEqual({ balance: 3698.99, currency: "usd" });
  });
});
