import {
  createToolClient,
  getTextFromResult,
  type MockPubClient,
} from "../../helpers/tool-client.js";
import { externalMonetizationModule } from "../../../src/tools/publisher/external-monetization.js";
import { externalMonetizationAccountsModule } from "../../../src/tools/publisher/external-monetization-accounts.js";
import { resetConfig } from "../../../src/config.js";

vi.mock("../../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

beforeEach(() => {
  process.env.KADAM_PUB_API_KEY = "test-pub-key";
});
afterEach(() => {
  delete process.env.KADAM_PUB_API_KEY;
  resetConfig();
});

const NETWORK = {
  id: 3,
  slug: "trafficstars",
  name: "TrafficStars",
  helpUrl: null,
  zonePattern: null,
  defaultTag: null,
  allowProxyDefault: true,
  authType: "api_key",
  credentialFields: ["api_key"],
};

const ACCOUNT = {
  id: 11,
  networkId: 3,
  name: "Main",
  mask: "abc***xyz",
  active: true,
  createdAt: 1_700_000_000,
  verifiedAt: 1_700_000_100,
  lastError: null,
  placementsInUse: 1,
};

const PLACEMENT = {
  id: "00fcc7f5",
  name: "Popunder RU",
  site: "example.com",
  formatLabel: "popunder",
  tag: "https://tsyndicate.com/x",
  matchesFormat: true,
  matchesSite: true,
};

const CONNECTION = {
  id: 77,
  blockId: 4242,
  networkId: 3,
  format: "popunder",
  extBlockId: "00fcc7f5",
  extBlockName: "Popunder RU",
  tagTemplate: "https://tsyndicate.com/x",
  accountId: 11,
  uniqCap: 0,
  allowProxy: true,
  geo: [],
  active: true,
  tagWarnings: [],
  testShare: 0,
  testState: "off",
  testSlicesTotal: 0,
  testSlicesPending: 0,
};

async function withApi(module = externalMonetizationModule): Promise<{
  client: Awaited<ReturnType<typeof createToolClient>>["client"];
  api: MockPubClient;
}> {
  const { client, mockApi } = await createToolClient(module);
  return { client, api: mockApi as MockPubClient };
}

async function call(
  client: Awaited<ReturnType<typeof createToolClient>>["client"],
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  return getTextFromResult(await client.callTool({ name, arguments: args }));
}

describe("list_external_networks", () => {
  it("says which networks already have an account and which need a key", async () => {
    const { client, api } = await withApi();
    api.listExternalNetworks.mockResolvedValue([
      NETWORK,
      { ...NETWORK, id: 1, slug: "monetag", name: "Monetag" },
    ]);
    api.listExternalNetworkAccounts.mockResolvedValue([ACCOUNT]);

    const text = await call(client, "kadam_pub_list_external_networks", {});

    expect(text).toContain('TrafficStars (slug: trafficstars, id: 3): account #11 "Main"');
    expect(text).toContain("Monetag");
    expect(text).toMatch(/Monetag[^\n]*no account yet/);
  });

  it("scopes to one ad unit and shows what is already connected", async () => {
    const { client, api } = await withApi();
    api.listExternalNetworkAccounts.mockResolvedValue([ACCOUNT]);
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalConnections.mockResolvedValue([
      { ...CONNECTION, testShare: 20, testState: "running" },
    ]);

    const text = await call(client, "kadam_pub_list_external_networks", { adUnitId: 4242 });

    expect(api.getExternalMonetizationOptions).toHaveBeenCalledWith(4242);
    expect(text).toContain("connection #77");
    expect(text).toContain("test 20% (running)");
  });
});

describe("connect_external_network", () => {
  it("resolves network, account and placement, then creates the connection", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([ACCOUNT]);
    api.listExternalPlacements.mockResolvedValue([PLACEMENT]);
    api.createExternalConnection.mockResolvedValue(CONNECTION);

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(api.createExternalConnection).toHaveBeenCalledWith({
      blockId: 4242,
      networkId: 3,
      accountId: 11,
      extBlockId: "00fcc7f5",
      extBlockName: "Popunder RU",
      // Сети, которые выдают свой код зоны, обязаны донести его до подключения: пустой
      // тег означает «дефолт сети», а у зоны он свой.
      tagTemplate: "https://tsyndicate.com/x",
    });
    expect(text).toContain("TrafficStars connected to ad unit #4242");
    expect(text).toContain("Connection #77");
  });

  it("creates the account first when the publisher dictates a key", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([]);
    api.createExternalNetworkAccount.mockResolvedValue(ACCOUNT);
    api.listExternalPlacements.mockResolvedValue([PLACEMENT]);
    api.createExternalConnection.mockResolvedValue(CONNECTION);

    await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "TrafficStars",
      apiKey: "secret-key",
    });

    expect(api.createExternalNetworkAccount).toHaveBeenCalledWith({
      networkId: 3,
      name: "TrafficStars account",
      apiKey: "secret-key",
    });
    expect(api.createExternalConnection).toHaveBeenCalled();
  });

  it("points at key rotation instead of minting a duplicate account name", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([ACCOUNT]);

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
      apiKey: "another-key",
    });

    expect(text).toContain("already has an account");
    expect(text).toContain("kadam_pub_update_external_network_account");
    expect(api.createExternalNetworkAccount).not.toHaveBeenCalled();
  });

  it("still adds a second account when the publisher names it", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([ACCOUNT]);
    api.createExternalNetworkAccount.mockResolvedValue({ ...ACCOUNT, id: 12, name: "Second" });
    api.listExternalPlacements.mockResolvedValue([PLACEMENT]);
    api.createExternalConnection.mockResolvedValue(CONNECTION);

    await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
      apiKey: "another-key",
      accountName: "Second",
    });

    expect(api.createExternalNetworkAccount).toHaveBeenCalledWith({
      networkId: 3,
      name: "Second",
      apiKey: "another-key",
    });
  });

  it("asks for the key instead of failing when there is no account", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([]);

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(text).toContain("No account in TrafficStars yet");
    expect(text).toContain("apiKey");
    expect(api.createExternalConnection).not.toHaveBeenCalled();
  });

  it("lists the accounts to choose from when several are active", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([
      ACCOUNT,
      { ...ACCOUNT, id: 12, name: "Second" },
    ]);

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(text).toContain("repeat with accountId");
    expect(text).toContain('#12 "Second"');
    expect(api.createExternalConnection).not.toHaveBeenCalled();
  });

  it("lists the placements to choose from when several fit the format", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([ACCOUNT]);
    api.listExternalPlacements.mockResolvedValue([
      PLACEMENT,
      { ...PLACEMENT, id: "deadbeef", name: "Popunder US" },
    ]);

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(text).toContain("Several placements fit");
    expect(text).toContain("deadbeef");
    expect(api.createExternalConnection).not.toHaveBeenCalled();
  });

  it("names the networks that do serve the format when the wanted one does not", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "exoclick",
    });

    expect(text).toContain('No network "exoclick"');
    expect(text).toContain("TrafficStars (trafficstars)");
  });

  it("does not read an account as missing just because it is disabled", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([{ ...ACCOUNT, active: false }]);

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(text).toContain("disabled");
    expect(text).toContain("active: true");
    expect(api.createExternalNetworkAccount).not.toHaveBeenCalled();
  });

  it("refuses a disabled account named explicitly instead of letting the API reject it", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([{ ...ACCOUNT, active: false }]);

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
      accountId: 11,
    });

    expect(text).toContain("is disabled");
    expect(api.createExternalConnection).not.toHaveBeenCalled();
  });

  it("reports an accountId that belongs to another network", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([ACCOUNT]);

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
      accountId: 999,
    });

    expect(text).toContain("No account #999 in TrafficStars");
    expect(api.createExternalConnection).not.toHaveBeenCalled();
  });

  it("asks for the OAuth pair on a network that needs one", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({
      networks: [
        {
          ...NETWORK,
          id: 4,
          slug: "twinred",
          name: "TwinRed",
          authType: "oauth2_client_credentials",
          credentialFields: ["client_id", "client_secret"],
        },
      ],
      geo: [],
    });
    api.listExternalNetworkAccounts.mockResolvedValue([]);

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "twinred",
    });

    expect(text).toContain("clientId + clientSecret");
    expect(text).not.toContain("client_id");
  });

  it("creates an OAuth account from the pair the publisher dictates", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({
      networks: [
        {
          ...NETWORK,
          id: 4,
          slug: "twinred",
          name: "TwinRed",
          authType: "oauth2_client_credentials",
          credentialFields: ["client_id", "client_secret"],
        },
      ],
      geo: [],
    });
    api.listExternalNetworkAccounts.mockResolvedValue([]);
    api.createExternalNetworkAccount.mockResolvedValue({ ...ACCOUNT, id: 20, networkId: 4 });
    api.listExternalPlacements.mockResolvedValue([{ ...PLACEMENT, tag: null }]);
    api.createExternalConnection.mockResolvedValue(CONNECTION);

    await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "TwinRed",
      clientId: "id-1",
      clientSecret: "secret-1",
    });

    expect(api.createExternalNetworkAccount).toHaveBeenCalledWith({
      networkId: 4,
      name: "TwinRed account",
      clientId: "id-1",
      clientSecret: "secret-1",
    });
    // Зона без своего кода — тег не передаём, подключение возьмёт дефолт сети.
    expect(api.createExternalConnection).toHaveBeenCalledWith(
      expect.not.objectContaining({ tagTemplate: expect.anything() }),
    );
  });

  it("warns when the only fitting zone belongs to another site", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([ACCOUNT]);
    api.listExternalPlacements.mockResolvedValue([
      { ...PLACEMENT, matchesSite: false, site: "other.example" },
    ]);
    api.createExternalConnection.mockResolvedValue(CONNECTION);

    const text = await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(text).toContain("other.example");
    expect(api.createExternalConnection).toHaveBeenCalled();
  });

  it("passes fresh through so a zone created a minute ago is visible", async () => {
    const { client, api } = await withApi();
    api.getExternalMonetizationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listExternalNetworkAccounts.mockResolvedValue([ACCOUNT]);
    api.listExternalPlacements.mockResolvedValue([PLACEMENT]);
    api.createExternalConnection.mockResolvedValue(CONNECTION);

    await call(client, "kadam_pub_connect_external_network", {
      adUnitId: 4242,
      network: "trafficstars",
      fresh: true,
    });

    expect(api.listExternalPlacements).toHaveBeenCalledWith(11, 4242, true);
  });
});

describe("update_external_network", () => {
  it("keeps the fields the caller did not touch", async () => {
    const { client, api } = await withApi();
    api.listExternalConnections.mockResolvedValue([{ ...CONNECTION, uniqCap: 5, testShare: 30 }]);
    api.updateExternalConnection.mockResolvedValue({ ...CONNECTION, uniqCap: 5, geo: [34] });

    await call(client, "kadam_pub_update_external_network", {
      adUnitId: 4242,
      connectionId: 77,
      geo: [34],
    });

    expect(api.updateExternalConnection).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ geo: [34], uniqCap: 5, testShare: 30, extBlockId: "00fcc7f5" }),
    );
  });

  /**
   * Каталог печатает и id зоны, и её имя. Имя, записанное в extBlockID, даёт подключение,
   * которое коллектор никогда не сопоставит, поэтому оно разрешается так же, как на
   * подключении.
   */
  it("resolves a placement named by the publisher into its zone id", async () => {
    const { client, api } = await withApi();
    api.listExternalConnections.mockResolvedValue([CONNECTION]);
    api.listExternalPlacements.mockResolvedValue([
      { ...PLACEMENT, id: "deadbeef", name: "Popunder US", tag: "https://tsyndicate.com/us" },
    ]);
    api.updateExternalConnection.mockResolvedValue({ ...CONNECTION, extBlockId: "deadbeef" });

    await call(client, "kadam_pub_update_external_network", {
      adUnitId: 4242,
      connectionId: 77,
      placement: "Popunder US",
    });

    expect(api.updateExternalConnection).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        extBlockId: "deadbeef",
        extBlockName: "Popunder US",
        tagTemplate: "https://tsyndicate.com/us",
      }),
    );
  });

  it("names the candidates when the placement is not in the catalog", async () => {
    const { client, api } = await withApi();
    api.listExternalConnections.mockResolvedValue([CONNECTION]);
    api.listExternalPlacements.mockResolvedValue([PLACEMENT]);

    const text = await call(client, "kadam_pub_update_external_network", {
      adUnitId: 4242,
      connectionId: 77,
      placement: "no-such-zone",
    });

    expect(text).toContain('No placement "no-such-zone"');
    expect(api.updateExternalConnection).not.toHaveBeenCalled();
  });

  it("reports the ids that do exist when the connection is not on that ad unit", async () => {
    const { client, api } = await withApi();
    api.listExternalConnections.mockResolvedValue([CONNECTION]);

    const text = await call(client, "kadam_pub_update_external_network", {
      adUnitId: 4242,
      connectionId: 99,
      uniqCap: 1,
    });

    expect(text).toContain("has no connection #99");
    expect(text).toContain("#77");
    expect(api.updateExternalConnection).not.toHaveBeenCalled();
  });
});

describe("set_external_network_status", () => {
  it("pauses through an update that preserves the rest of the row", async () => {
    const { client, api } = await withApi();
    api.listExternalConnections.mockResolvedValue([CONNECTION]);
    api.updateExternalConnection.mockResolvedValue({ ...CONNECTION, active: false });

    const text = await call(client, "kadam_pub_set_external_network_status", {
      adUnitId: 4242,
      connectionId: 77,
      status: "paused",
    });

    expect(api.updateExternalConnection).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ active: false, extBlockId: "00fcc7f5" }),
    );
    expect(text).toContain("is now paused");
  });

  it("activates through an update that preserves the rest of the row", async () => {
    const { client, api } = await withApi();
    api.listExternalConnections.mockResolvedValue([{ ...CONNECTION, active: false, uniqCap: 7 }]);
    api.updateExternalConnection.mockResolvedValue({ ...CONNECTION, uniqCap: 7 });

    await call(client, "kadam_pub_set_external_network_status", {
      adUnitId: 4242,
      connectionId: 77,
      status: "active",
    });

    expect(api.updateExternalConnection).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ active: true, uniqCap: 7 }),
    );
  });

  it("retests through the dedicated endpoint, reusing the current share", async () => {
    const { client, api } = await withApi();
    api.listExternalConnections.mockResolvedValue([{ ...CONNECTION, testShare: 25 }]);
    api.retestExternalConnection.mockResolvedValue({
      ...CONNECTION,
      testShare: 25,
      testState: "running",
    });

    const text = await call(client, "kadam_pub_retest_external_network", {
      adUnitId: 4242,
      connectionId: 77,
    });

    expect(api.retestExternalConnection).toHaveBeenCalledWith(77, 25);
    expect(api.updateExternalConnection).not.toHaveBeenCalled();
    expect(text).toContain("Test restarted at 25%");
  });

  it("starts a test at a default share when the connection had none", async () => {
    const { client, api } = await withApi();
    api.listExternalConnections.mockResolvedValue([CONNECTION]);
    api.retestExternalConnection.mockResolvedValue({ ...CONNECTION, testShare: 10 });

    await call(client, "kadam_pub_retest_external_network", {
      adUnitId: 4242,
      connectionId: 77,
    });

    expect(api.retestExternalConnection).toHaveBeenCalledWith(77, 10);
  });

  it("refuses a share above the backend cap before calling the API", async () => {
    const { client, api } = await withApi();

    const text = await call(client, "kadam_pub_retest_external_network", {
      adUnitId: 4242,
      connectionId: 77,
      testShare: 80,
    });

    expect(text).toMatch(/50/);
    expect(api.retestExternalConnection).not.toHaveBeenCalled();
  });
});

describe("destructive tools", () => {
  it("disconnect requires confirm", async () => {
    const { client, api } = await withApi();

    const text = await call(client, "kadam_pub_disconnect_external_network", { connectionId: 77 });

    expect(text).toMatch(/confirm/i);
    expect(api.deleteExternalConnection).not.toHaveBeenCalled();
  });

  it("disconnect removes the connection once confirmed", async () => {
    const { client, api } = await withApi();
    api.deleteExternalConnection.mockResolvedValue({});

    const text = await call(client, "kadam_pub_disconnect_external_network", {
      connectionId: 77,
      confirm: true,
    });

    expect(api.deleteExternalConnection).toHaveBeenCalledWith(77);
    expect(text).toContain("removed");
  });

  it("account deletion requires confirm too", async () => {
    const { client, api } = await withApi(externalMonetizationAccountsModule);

    const text = await call(client, "kadam_pub_delete_external_network_account", { accountId: 11 });

    expect(text).toMatch(/confirm/i);
    expect(api.deleteExternalNetworkAccount).not.toHaveBeenCalled();
  });
});

describe("account key handling", () => {
  /**
   * AccountForm требует networkId и name и на обновлении, а name пишется в строку как
   * есть: частичный PUT — это 422, пустое имя стёрло бы аккаунт.
   */
  it("rotates the key on top of the stored row, never echoing the key back", async () => {
    const { client, api } = await withApi(externalMonetizationAccountsModule);
    api.listExternalNetworkAccounts.mockResolvedValue([ACCOUNT]);
    api.updateExternalNetworkAccount.mockResolvedValue({ ...ACCOUNT, mask: "new***key" });

    const text = await call(client, "kadam_pub_update_external_network_account", {
      accountId: 11,
      apiKey: "brand-new-secret",
    });

    expect(api.updateExternalNetworkAccount).toHaveBeenCalledWith(11, {
      networkId: 3,
      name: "Main",
      active: true,
      apiKey: "brand-new-secret",
    });
    expect(text).not.toContain("brand-new-secret");
    expect(text).toContain("new***key");
  });

  it("tells the model not to read an existing key back", async () => {
    const { client } = await withApi();
    const { tools } = await client.listTools();

    const keyTakers = tools.filter((t) =>
      Object.keys(
        (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {},
      ).includes("apiKey"),
    );

    expect(keyTakers.length).toBeGreaterThan(0);
    for (const tool of keyTakers) {
      expect(tool.description ?? "").toMatch(/never ask/i);
    }
  });

  it("keeps every tool under the publisher prefix", async () => {
    const { client } = await withApi();
    const { tools } = await client.listTools();

    expect(tools.length).toBe(6);
    for (const tool of tools) expect(tool.name).toMatch(/^kadam_pub_/);
  });
});
