import { describe, it, expect, vi } from "vitest";
import { resolveStdioAccess } from "../src/stdio-bootstrap.js";
import { ApiError } from "../src/api/http-client.js";
import type { ClientPool } from "../src/api/client-pool.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function poolWith(getAccess: () => Promise<unknown>): ClientPool {
  return {
    resolve: (advKey?: string) => ({ adv: advKey ? { getAccess } : null, pub: null }),
  } as unknown as ClientPool;
}

describe("resolveStdioAccess", () => {
  it("is a client session when no advertiser key is configured", async () => {
    const getAccess = vi.fn();
    expect(await resolveStdioAccess(poolWith(getAccess), undefined)).toEqual({
      impersonation: false,
    });
    expect(getAccess).not.toHaveBeenCalled();
  });

  it("takes the role from GET /access", async () => {
    const getAccess = vi.fn().mockResolvedValue({ impersonation: true });
    expect(await resolveStdioAccess(poolWith(getAccess), "manager-jwt")).toEqual({
      impersonation: true,
    });
    expect(getAccess).toHaveBeenCalledTimes(1);
  });

  it("falls back to the client catalog when the API cannot answer", async () => {
    const down = vi.fn().mockRejectedValue(new ApiError("upstream", 503));
    expect(await resolveStdioAccess(poolWith(down), "k")).toEqual({ impersonation: false });

    const rejected = vi.fn().mockRejectedValue(new ApiError("invalid credentials", 0));
    expect(await resolveStdioAccess(poolWith(rejected), "k")).toEqual({ impersonation: false });
  });
});
