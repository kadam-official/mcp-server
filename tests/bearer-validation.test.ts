import { describe, it, expect, vi } from "vitest";
import { BearerValidator } from "../src/bearer-validation.js";
import { ApiError } from "../src/api/http-client.js";
import type { ClientPool } from "../src/api/client-pool.js";

// Fake pool: both adv.options.getCampaignOptions and pub.getReportConfig delegate
// to the provided probe, so we can drive success/401/transient outcomes.
function fakePool(probe: () => Promise<unknown>): ClientPool {
  return {
    resolve: () => ({
      adv: { options: { getCampaignOptions: probe } },
      pub: { getReportConfig: probe },
    }),
  } as unknown as ClientPool;
}

describe("BearerValidator", () => {
  it("accepts a valid bearer and caches it (no re-probe within TTL)", async () => {
    const probe = vi.fn().mockResolvedValue({});
    const v = new BearerValidator(fakePool(probe));
    expect(await v.validate("k", "adv")).toBe(true);
    expect(await v.validate("k", "adv")).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1); // second call served from cache
    expect(v.size).toBe(1);
  });

  it("rejects on upstream 401/403 and does NOT cache the failure", async () => {
    const probe = vi.fn().mockRejectedValue(new ApiError("invalid", 401));
    const v = new BearerValidator(fakePool(probe));
    expect(await v.validate("k", "adv")).toBe(false);
    expect(await v.validate("k", "adv")).toBe(false);
    expect(probe).toHaveBeenCalledTimes(2); // re-probed (not cached)
    expect(v.size).toBe(0);
  });

  it("rejects Kadam's HTTP-200 invalid-credentials signal (ApiError status 0)", async () => {
    // Kadam returns 200 + {success:false, code:0, msg.exception:"...invalid credentials..."}
    // which http-client surfaces as ApiError(message, status=0).
    const probe = vi
      .fn()
      .mockRejectedValue(new ApiError("Your request was made with invalid credentials.", 0));
    const v = new BearerValidator(fakePool(probe));
    expect(await v.validate("k", "adv")).toBe(false);
    expect(v.size).toBe(0);
  });

  it("fails open on transient (non-auth) errors", async () => {
    expect(
      await new BearerValidator(
        fakePool(vi.fn().mockRejectedValue(new ApiError("oops", 500))),
      ).validate("k", "adv"),
    ).toBe(true);
    expect(
      await new BearerValidator(fakePool(vi.fn().mockRejectedValue(new Error("network")))).validate(
        "k",
        "adv",
      ),
    ).toBe(true);
  });

  it("validates publisher cabinet via getReportConfig", async () => {
    const probe = vi.fn().mockResolvedValue({});
    expect(await new BearerValidator(fakePool(probe)).validate("k", "pub")).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("bounds the cache size (FIFO cap)", async () => {
    const v = new BearerValidator(fakePool(vi.fn().mockResolvedValue({})), 60_000, 3);
    for (const b of ["a", "b", "c", "d", "e"]) await v.validate(b, "adv");
    expect(v.size).toBeLessThanOrEqual(3);
  });

  it("prune drops expired entries", async () => {
    const v = new BearerValidator(fakePool(vi.fn().mockResolvedValue({})), 1000);
    await v.validate("k", "adv");
    expect(v.size).toBe(1);
    v.prune(Date.now() + 2000); // past the 1s TTL
    expect(v.size).toBe(0);
  });
});
