describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("getConfig returns defaults when no keys set (keys optional in all modes)", async () => {
    delete process.env.KADAM_ADV_API_KEY;
    delete process.env.KADAM_PUB_API_KEY;
    delete process.env.KADAM_ADV_API_BASE;
    delete process.env.KADAM_PUB_API_BASE;
    delete process.env.LOG_LEVEL;
    delete process.env.MCP_TRANSPORT;
    const { getConfig } = await import("../src/config.js");
    const config = getConfig();
    expect(config.KADAM_ADV_API_BASE).toBe("https://partners.kadam.net/api/v1");
    expect(config.KADAM_PUB_API_BASE).toBe("https://pub.kadam.net/api");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.MCP_TRANSPORT).toBe("stdio");
  });

  it("getConfig reads http transport + domains from env", async () => {
    delete process.env.KADAM_ADV_API_KEY;
    delete process.env.KADAM_PUB_API_KEY;
    process.env.MCP_TRANSPORT = "http";
    const { getConfig } = await import("../src/config.js");
    const config = getConfig();
    expect(config.MCP_TRANSPORT).toBe("http");
    expect(config.KADAM_ADV_DOMAIN).toBe("https://partners.kadam.net");
    expect(config.KADAM_PUB_DOMAIN).toBe("https://pub.kadam.net");
  });

  it("getConfig with custom env reads KADAM_ADV_API_KEY, LOG_LEVEL from env", async () => {
    process.env.KADAM_ADV_API_KEY = "test-key";
    process.env.LOG_LEVEL = "debug";
    const { getConfig } = await import("../src/config.js");
    const config = getConfig();
    expect(config.KADAM_ADV_API_KEY).toBe("test-key");
    expect(config.LOG_LEVEL).toBe("debug");
  });

  it("getConfig with invalid KADAM_ADV_API_BASE (not a URL) throws", async () => {
    process.env.KADAM_ADV_API_BASE = "not-a-valid-url";
    const { getConfig } = await import("../src/config.js");
    expect(() => getConfig()).toThrow(/Invalid environment configuration/);
  });

  it("hasAdvKey returns true when KADAM_ADV_API_KEY set", async () => {
    process.env.KADAM_ADV_API_KEY = "key123";
    const { hasAdvKey } = await import("../src/config.js");
    expect(hasAdvKey()).toBe(true);
  });

  it("hasAdvKey returns false when not set (http mode)", async () => {
    delete process.env.KADAM_ADV_API_KEY;
    process.env.MCP_TRANSPORT = "http";
    const { hasAdvKey } = await import("../src/config.js");
    expect(hasAdvKey()).toBe(false);
  });

  it("hasPubKey returns true when set, false when not (http mode)", async () => {
    process.env.KADAM_PUB_API_KEY = "pubkey";
    process.env.MCP_TRANSPORT = "http";
    const { hasPubKey } = await import("../src/config.js");
    expect(hasPubKey()).toBe(true);

    vi.resetModules();
    delete process.env.KADAM_PUB_API_KEY;
    process.env.MCP_TRANSPORT = "http";
    const { hasPubKey: hasPubKey2 } = await import("../src/config.js");
    expect(hasPubKey2()).toBe(false);
  });

  it("resetConfig clears cache", async () => {
    process.env.KADAM_ADV_API_KEY = "first-key";
    const { getConfig, resetConfig } = await import("../src/config.js");
    const config1 = getConfig();
    expect(config1.KADAM_ADV_API_KEY).toBe("first-key");

    process.env.KADAM_ADV_API_KEY = "second-key";
    resetConfig();
    const config2 = getConfig();
    expect(config2.KADAM_ADV_API_KEY).toBe("second-key");
  });
});
