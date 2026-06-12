import { ClientPool } from "../../src/api/client-pool.js";

vi.mock("../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

describe("ClientPool", () => {
  const config = {
    advBaseUrl: "https://partners.kadam.net/api/v1",
    pubBaseUrl: "https://pub.kadam.net/api",
  };

  it("resolve with advKey returns non-null adv client", () => {
    const pool = new ClientPool(config);
    const ctx = pool.resolve("adv-key-1", undefined);
    expect(ctx.adv).not.toBeNull();
    expect(ctx.pub).toBeNull();
  });

  it("resolve with pubKey returns non-null pub client", () => {
    const pool = new ClientPool(config);
    const ctx = pool.resolve(undefined, "pub-key-1");
    expect(ctx.adv).toBeNull();
    expect(ctx.pub).not.toBeNull();
  });

  it("resolve with both keys returns both clients", () => {
    const pool = new ClientPool(config);
    const ctx = pool.resolve("adv-key", "pub-key");
    expect(ctx.adv).not.toBeNull();
    expect(ctx.pub).not.toBeNull();
  });

  it("same advKey returns same PartnersClient instance", () => {
    const pool = new ClientPool(config);
    const ctx1 = pool.resolve("same-key", undefined);
    const ctx2 = pool.resolve("same-key", undefined);
    expect(ctx1.adv).toBe(ctx2.adv);
  });

  it("different advKeys return different PartnersClient instances", () => {
    const pool = new ClientPool(config);
    const ctx1 = pool.resolve("key-a", undefined);
    const ctx2 = pool.resolve("key-b", undefined);
    expect(ctx1.adv).not.toBe(ctx2.adv);
  });

  it("same pubKey returns same PubClient instance", () => {
    const pool = new ClientPool(config);
    const ctx1 = pool.resolve(undefined, "pub-same");
    const ctx2 = pool.resolve(undefined, "pub-same");
    expect(ctx1.pub).toBe(ctx2.pub);
  });

  it("stats reflects number of created clients", () => {
    const pool = new ClientPool(config);
    expect(pool.stats).toEqual({ advClients: 0, pubClients: 0 });

    pool.resolve("adv-1", "pub-1");
    expect(pool.stats).toEqual({ advClients: 1, pubClients: 1 });

    pool.resolve("adv-2", "pub-1");
    expect(pool.stats).toEqual({ advClients: 2, pubClients: 1 });
  });

  it("resolve with no keys returns both null", () => {
    const pool = new ClientPool(config);
    const ctx = pool.resolve(undefined, undefined);
    expect(ctx.adv).toBeNull();
    expect(ctx.pub).toBeNull();
  });

  it("evicts the least-recently-used client when maxClients is exceeded", () => {
    const pool = new ClientPool({ ...config, maxClients: 1 });
    const a1 = pool.resolve("a", undefined).adv;
    pool.resolve("b", undefined); // exceeds cap -> evicts LRU "a"
    expect(pool.stats.advClients).toBe(1);
    const a2 = pool.resolve("a", undefined).adv; // "a" recreated (cold)
    expect(a2).not.toBe(a1);
  });

  it("evictIdle drops clients and forces re-creation", () => {
    const pool = new ClientPool(config);
    const a1 = pool.resolve("a", undefined).adv;
    expect(pool.evictIdle(-1)).toBe(1); // everything is older than -1ms
    expect(pool.stats.advClients).toBe(0);
    const a2 = pool.resolve("a", undefined).adv;
    expect(a2).not.toBe(a1);
  });
});
