describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("getConfig returns defaults when no keys set", async () => {
    delete process.env.KADAM_ADV_API_KEY;
    delete process.env.KADAM_PUB_API_KEY;
    delete process.env.KADAM_ADV_API_BASE;
    delete process.env.KADAM_PUB_API_BASE;
    delete process.env.LOG_LEVEL;
    const { getConfig } = await import("../src/config.js");
    const config = getConfig();
    expect(config.KADAM_ADV_API_BASE).toBe("https://partners.kadam.net/api/v1");
    expect(config.KADAM_PUB_API_BASE).toBe("https://pub.kadam.net/api");
    expect(config.LOG_LEVEL).toBe("info");
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

  it("hasAdvKey returns false when not set", async () => {
    delete process.env.KADAM_ADV_API_KEY;
    const { hasAdvKey } = await import("../src/config.js");
    expect(hasAdvKey()).toBe(false);
  });

  it("hasPubKey returns true when set, false when not", async () => {
    process.env.KADAM_PUB_API_KEY = "pubkey";
    const { hasPubKey } = await import("../src/config.js");
    expect(hasPubKey()).toBe(true);

    vi.resetModules();
    delete process.env.KADAM_PUB_API_KEY;
    const { hasPubKey: hasPubKey2 } = await import("../src/config.js");
    expect(hasPubKey2()).toBe(false);
  });

  it("requireAdvKey returns key when set", async () => {
    process.env.KADAM_ADV_API_KEY = "adv-secret";
    const { requireAdvKey } = await import("../src/config.js");
    expect(requireAdvKey()).toBe("adv-secret");
  });

  it("requireAdvKey throws AuthError when not set, message contains partners.kadam.net", async () => {
    delete process.env.KADAM_ADV_API_KEY;
    const { requireAdvKey, AuthError } = await import("../src/config.js");
    expect(() => requireAdvKey()).toThrow(AuthError);
    expect(() => requireAdvKey()).toThrow(/partners\.kadam\.net/);
  });

  it("requirePubKey throws AuthError when not set, message contains pub.kadam.net", async () => {
    delete process.env.KADAM_PUB_API_KEY;
    const { requirePubKey, AuthError } = await import("../src/config.js");
    expect(() => requirePubKey()).toThrow(AuthError);
    expect(() => requirePubKey()).toThrow(/pub\.kadam\.net/);
  });
});
