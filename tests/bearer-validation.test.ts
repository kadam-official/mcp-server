import { describe, it, expect, vi } from "vitest";
import { BearerValidator } from "../src/bearer-validation.js";
import { ApiError } from "../src/api/http-client.js";
import type { ClientPool } from "../src/api/client-pool.js";

// Fake pool: adv.getAccess and pub.getReportConfig both delegate to the provided
// probe, so we can drive success/401/transient outcomes from one place.
function fakePool(probe: () => Promise<unknown>): ClientPool {
  return {
    resolve: () => ({
      adv: { getAccess: probe },
      pub: { getReportConfig: probe },
    }),
  } as unknown as ClientPool;
}

const clientAccess = () => Promise.resolve({ impersonation: false });
const managerAccess = () => Promise.resolve({ impersonation: true });

describe("BearerValidator", () => {
  it("accepts a valid bearer and caches it (no re-probe within TTL)", async () => {
    const probe = vi.fn().mockImplementation(clientAccess);
    const v = new BearerValidator(fakePool(probe));
    expect(await v.validate("k", "adv")).toEqual({
      accepted: true,
      access: { impersonation: false },
    });
    expect((await v.validate("k", "adv")).accepted).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1); // second call served from cache
    expect(v.size).toBe(1);
  });

  it("learns the role from GET /access and keeps it in the cache", async () => {
    const probe = vi.fn().mockImplementation(managerAccess);
    const v = new BearerValidator(fakePool(probe));

    const first = await v.validate("manager-jwt", "adv");
    const cached = await v.validate("manager-jwt", "adv");

    expect(first.access.impersonation).toBe(true);
    expect(cached.access.impersonation).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("keeps roles apart per bearer — a client key next to a manager key stays a client", async () => {
    const probe = vi.fn().mockImplementation(() => Promise.resolve({ impersonation: false }));
    const pool = {
      resolve: (advKey?: string) => ({
        adv: {
          getAccess: advKey === "manager-jwt" ? managerAccess : probe,
        },
        pub: null,
      }),
    } as unknown as ClientPool;
    const v = new BearerValidator(pool);

    expect((await v.validate("manager-jwt", "adv")).access.impersonation).toBe(true);
    expect((await v.validate("client-key", "adv")).access.impersonation).toBe(false);
    expect((await v.validate("manager-jwt", "adv")).access.impersonation).toBe(true);
  });

  it("rejects on upstream 401/403 and does NOT cache the failure", async () => {
    const probe = vi.fn().mockRejectedValue(new ApiError("invalid", 401));
    const v = new BearerValidator(fakePool(probe));
    expect((await v.validate("k", "adv")).accepted).toBe(false);
    expect((await v.validate("k", "adv")).accepted).toBe(false);
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
    expect((await v.validate("k", "adv")).accepted).toBe(false);
    expect(v.size).toBe(0);
  });

  it("fails open on transient (non-auth) errors with the client catalog, uncached", async () => {
    const probe = vi.fn().mockRejectedValue(new ApiError("oops", 500));
    const v = new BearerValidator(fakePool(probe));

    expect(await v.validate("k", "adv")).toEqual({
      accepted: true,
      access: { impersonation: false },
    });
    expect(v.size).toBe(0); // the role is unknown, so nothing is remembered

    const network = new BearerValidator(fakePool(vi.fn().mockRejectedValue(new Error("network"))));
    expect((await network.validate("k", "adv")).accepted).toBe(true);
  });

  it("validates publisher cabinet via getReportConfig and never grants impersonation", async () => {
    const probe = vi.fn().mockResolvedValue({});
    expect(await new BearerValidator(fakePool(probe)).validate("k", "pub")).toEqual({
      accepted: true,
      access: { impersonation: false },
    });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("bounds the cache size (FIFO cap)", async () => {
    const v = new BearerValidator(fakePool(vi.fn().mockImplementation(clientAccess)), 60_000, 3);
    for (const b of ["a", "b", "c", "d", "e"]) await v.validate(b, "adv");
    expect(v.size).toBeLessThanOrEqual(3);
  });

  it("prune drops expired entries", async () => {
    const v = new BearerValidator(fakePool(vi.fn().mockImplementation(clientAccess)), 1000);
    await v.validate("k", "adv");
    expect(v.size).toBe(1);
    v.prune(Date.now() + 2000); // past the 1s TTL
    expect(v.size).toBe(0);
  });
});
