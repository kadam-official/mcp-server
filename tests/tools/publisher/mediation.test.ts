import {
  createToolClient,
  getTextFromResult,
  type MockPubClient,
} from "../../helpers/tool-client.js";
import { mediationModule } from "../../../src/tools/publisher/mediation.js";
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

async function withApi(module = mediationModule): Promise<{
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

describe("list_mediation_networks", () => {
  it("says which networks already have an account and which need a key", async () => {
    const { client, api } = await withApi();
    api.listMediationNetworks.mockResolvedValue([
      NETWORK,
      { ...NETWORK, id: 1, slug: "monetag", name: "Monetag" },
    ]);
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);

    const text = await call(client, "kadam_pub_list_mediation_networks", {});

    expect(text).toContain('TrafficStars (slug: trafficstars, id: 3): account #11 "Main"');
    expect(text).toContain("Monetag");
    expect(text).toMatch(/Monetag[^\n]*no account yet/);
  });

  it("scopes to one ad unit and shows what is already connected", async () => {
    const { client, api } = await withApi();
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationConnections.mockResolvedValue([
      { ...CONNECTION, testShare: 20, testState: "running" },
    ]);

    const text = await call(client, "kadam_pub_list_mediation_networks", { adUnitId: 4242 });

    expect(api.getMediationOptions).toHaveBeenCalledWith(4242);
    expect(text).toContain("connection #77");
    expect(text).toContain("test 20% (running)");
  });
});

describe("connect_mediation_network", () => {
  it("resolves network, account and placement, then creates the connection", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);
    api.listMediationPlacements.mockResolvedValue([PLACEMENT]);
    api.createMediationConnection.mockResolvedValue(CONNECTION);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(api.createMediationConnection).toHaveBeenCalledWith({
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
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([]);
    api.createMediationAccount.mockResolvedValue(ACCOUNT);
    api.listMediationPlacements.mockResolvedValue([PLACEMENT]);
    api.createMediationConnection.mockResolvedValue(CONNECTION);

    await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "TrafficStars",
      apiKey: "secret-key",
    });

    expect(api.createMediationAccount).toHaveBeenCalledWith({
      networkId: 3,
      name: "TrafficStars account",
      apiKey: "secret-key",
    });
    expect(api.createMediationConnection).toHaveBeenCalled();
  });

  it("points at key rotation instead of minting a duplicate account name", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
      apiKey: "another-key",
    });

    expect(text).toContain("already has an account");
    expect(text).toContain("kadam_pub_update_mediation_network_account");
    expect(api.createMediationAccount).not.toHaveBeenCalled();
  });

  it("still adds a second account when the publisher names it", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);
    api.createMediationAccount.mockResolvedValue({ ...ACCOUNT, id: 12, name: "Second" });
    api.listMediationPlacements.mockResolvedValue([PLACEMENT]);
    api.createMediationConnection.mockResolvedValue(CONNECTION);

    await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
      apiKey: "another-key",
      accountName: "Second",
    });

    expect(api.createMediationAccount).toHaveBeenCalledWith({
      networkId: 3,
      name: "Second",
      apiKey: "another-key",
    });
  });

  it("asks for the key instead of failing when there is no account", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([]);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(text).toContain("No account in TrafficStars yet");
    expect(text).toContain("apiKey");
    expect(api.createMediationConnection).not.toHaveBeenCalled();
  });

  it("lists the accounts to choose from when several are active", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([ACCOUNT, { ...ACCOUNT, id: 12, name: "Second" }]);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(text).toContain("repeat with accountId");
    expect(text).toContain('#12 "Second"');
    expect(api.createMediationConnection).not.toHaveBeenCalled();
  });

  it("lists the placements to choose from when several fit the format", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);
    api.listMediationPlacements.mockResolvedValue([
      PLACEMENT,
      { ...PLACEMENT, id: "deadbeef", name: "Popunder US" },
    ]);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(text).toContain("Several placements fit");
    expect(text).toContain("deadbeef");
    expect(api.createMediationConnection).not.toHaveBeenCalled();
  });

  it("names the networks that do serve the format when the wanted one does not", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "exoclick",
    });

    expect(text).toContain('No network "exoclick"');
    expect(text).toContain("TrafficStars (trafficstars)");
  });

  it("does not read an account as missing just because it is disabled", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([{ ...ACCOUNT, active: false }]);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(text).toContain("disabled");
    expect(text).toContain("active: true");
    expect(api.createMediationAccount).not.toHaveBeenCalled();
  });

  it("refuses a disabled account named explicitly instead of letting the API reject it", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([{ ...ACCOUNT, active: false }]);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
      accountId: 11,
    });

    expect(text).toContain("is disabled");
    expect(api.createMediationConnection).not.toHaveBeenCalled();
  });

  it("reports an accountId that belongs to another network", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
      accountId: 999,
    });

    expect(text).toContain("No account #999 in TrafficStars");
    expect(api.createMediationConnection).not.toHaveBeenCalled();
  });

  it("asks for the OAuth pair on a network that needs one", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({
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
    api.listMediationAccounts.mockResolvedValue([]);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "twinred",
    });

    expect(text).toContain("clientId + clientSecret");
    expect(text).not.toContain("client_id");
  });

  it("creates an OAuth account from the pair the publisher dictates", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({
      networks: [
        {
          ...NETWORK,
          id: 4,
          slug: "twinred",
          name: "TwinRed",
          authType: "oauth2_client_credentials",
          credentialFields: ["client_id", "client_secret"],
          defaultTag: "https://ad.twinrdengine.com/adraw?zone={ext_block_id}",
        },
      ],
      geo: [],
    });
    api.listMediationAccounts.mockResolvedValue([]);
    api.createMediationAccount.mockResolvedValue({ ...ACCOUNT, id: 20, networkId: 4 });
    api.listMediationPlacements.mockResolvedValue([{ ...PLACEMENT, tag: null }]);
    api.createMediationConnection.mockResolvedValue(CONNECTION);

    await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "TwinRed",
      clientId: "id-1",
      clientSecret: "secret-1",
    });

    expect(api.createMediationAccount).toHaveBeenCalledWith({
      networkId: 4,
      name: "TwinRed account",
      clientId: "id-1",
      clientSecret: "secret-1",
    });
    // Зона без своего кода — тег не передаём, подключение возьмёт дефолт сети.
    expect(api.createMediationConnection).toHaveBeenCalledWith(
      expect.not.objectContaining({ tagTemplate: expect.anything() }),
    );
  });

  it("warns when the only fitting zone belongs to another site", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);
    api.listMediationPlacements.mockResolvedValue([
      { ...PLACEMENT, matchesSite: false, site: "other.example" },
    ]);
    api.createMediationConnection.mockResolvedValue(CONNECTION);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });

    expect(text).toContain("other.example");
    expect(api.createMediationConnection).toHaveBeenCalled();
  });

  it("passes fresh through so a zone created a minute ago is visible", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);
    api.listMediationPlacements.mockResolvedValue([PLACEMENT]);
    api.createMediationConnection.mockResolvedValue(CONNECTION);

    await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
      fresh: true,
    });

    expect(api.listMediationPlacements).toHaveBeenCalledWith(11, 4242, true);
  });

  /**
   * У HilltopAds зона — число или пара desktop+mobile, а шаблона у сети нет. Каталог — только
   * список: код выбранной зоны берётся отдельным запросом. Составной id обязан доехать до
   * подключения как есть, вместе с этим кодом.
   */
  describe("a network whose catalog lists zones without their code", () => {
    const HILLTOP = { ...NETWORK, id: 7, slug: "hilltopads", name: "HilltopAds", defaultTag: "" };
    const ZONE = {
      ...PLACEMENT,
      id: "7438273-7438277",
      name: "up_kad_pop",
      site: "upornia.com",
      tag: null,
    };
    const CODE = "https://idlerelief.com/bU3.Vm0?sId={sub_id}";

    async function hilltopApi() {
      const { client, api } = await withApi();
      api.getMediationOptions.mockResolvedValue({ networks: [HILLTOP], geo: [] });
      api.listMediationAccounts.mockResolvedValue([{ ...ACCOUNT, networkId: 7 }]);
      api.listMediationPlacements.mockResolvedValue([
        { ...PLACEMENT, id: "7438273", name: "desktop half", tag: null },
        ZONE,
      ]);
      api.createMediationConnection.mockResolvedValue({
        ...CONNECTION,
        networkId: 7,
        extBlockId: ZONE.id,
      });

      return { client, api };
    }

    it("fetches the code of the picked zone once and connects with it", async () => {
      const { client, api } = await hilltopApi();
      api.getMediationPlacementTag.mockResolvedValue(CODE);

      await call(client, "kadam_pub_connect_mediation_network", {
        adUnitId: 4242,
        network: "hilltopads",
        placement: "7438273-7438277",
      });

      expect(api.getMediationPlacementTag).toHaveBeenCalledTimes(1);
      expect(api.getMediationPlacementTag).toHaveBeenCalledWith(11, "7438273-7438277");
      expect(api.createMediationConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          networkId: 7,
          extBlockId: "7438273-7438277",
          extBlockName: "up_kad_pop",
          tagTemplate: CODE,
        }),
      );
    });

    /** Подключение без кода ничего не отдаст, а сохранилось бы молча. */
    it("refuses clearly when the network has no code for the zone", async () => {
      const { client, api } = await hilltopApi();
      api.getMediationPlacementTag.mockResolvedValue(null);

      const text = await call(client, "kadam_pub_connect_mediation_network", {
        adUnitId: 4242,
        network: "hilltopads",
        placement: "7438273-7438277",
      });

      expect(api.createMediationConnection).not.toHaveBeenCalled();
      expect(text).toContain("HilltopAds returns no code for zone 7438273-7438277");
      expect(text).toContain("tagTemplate");
    });

    it("takes the publisher's own code without asking the network", async () => {
      const { client, api } = await hilltopApi();
      const own = '<script src="https://own.example/914.js?sId={sub_id}"></script>';

      await call(client, "kadam_pub_connect_mediation_network", {
        adUnitId: 4242,
        network: "hilltopads",
        placement: "7438273-7438277",
        tagTemplate: own,
      });

      expect(api.getMediationPlacementTag).not.toHaveBeenCalled();
      expect(api.createMediationConnection).toHaveBeenCalledWith(
        expect.objectContaining({ tagTemplate: own }),
      );
    });

    it("fetches the code of the new zone when an update moves the connection to it", async () => {
      const { client, api } = await hilltopApi();
      api.listMediationConnections.mockResolvedValue([{ ...CONNECTION, networkId: 7 }]);
      api.getMediationPlacementTag.mockResolvedValue(CODE);
      api.updateMediationConnection.mockResolvedValue({ ...CONNECTION, extBlockId: ZONE.id });

      await call(client, "kadam_pub_update_mediation_network", {
        adUnitId: 4242,
        connectionId: 77,
        placement: "7438273-7438277",
      });

      expect(api.getMediationPlacementTag).toHaveBeenCalledWith(11, "7438273-7438277");
      expect(api.updateMediationConnection).toHaveBeenCalledWith(
        77,
        expect.objectContaining({ extBlockId: "7438273-7438277", tagTemplate: CODE }),
      );
    });
  });

  it("never asks for a zone code where the row or the network default already has it", async () => {
    const { client, api } = await withApi();
    const monetag = {
      ...NETWORK,
      id: 1,
      slug: "monetag",
      name: "Monetag",
      defaultTag: "https://tbyh5.com/afu.php?zoneid={ext_block_id}&var={sub_id}",
    };
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK, monetag], geo: [] });
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);
    api.listMediationPlacements
      .mockResolvedValueOnce([PLACEMENT])
      .mockResolvedValueOnce([{ ...PLACEMENT, id: "11745046", tag: null }]);
    api.createMediationConnection.mockResolvedValue(CONNECTION);

    await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
    });
    await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "monetag",
    });

    expect(api.createMediationConnection).toHaveBeenCalledTimes(2);
    expect(api.createMediationConnection.mock.calls[0]![0]).toMatchObject({
      tagTemplate: "https://tsyndicate.com/x",
    });
    expect(api.createMediationConnection.mock.calls[1]![0]).not.toHaveProperty("tagTemplate");
    expect(api.getMediationPlacementTag).not.toHaveBeenCalled();
  });

  /**
   * Имена зон у сети не уникальны: у HilltopAds «Popunder desktop» стоит на десятках сайтов.
   * Первая попавшаяся по имени — это чужой сайт и чужие деньги, поэтому неоднозначное имя
   * возвращает кандидатов с их id, а не подключает.
   */
  it("lists the candidates instead of picking one when several zones share the name", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);
    api.listMediationPlacements.mockResolvedValue([
      { ...PLACEMENT, id: "906", name: "Popunder desktop", site: "voyeurhit.com" },
      { ...PLACEMENT, id: "932", name: "Popunder desktop", site: "hdzog.com" },
    ]);

    const text = await call(client, "kadam_pub_connect_mediation_network", {
      adUnitId: 4242,
      network: "trafficstars",
      placement: "popunder desktop",
    });

    expect(api.createMediationConnection).not.toHaveBeenCalled();
    expect(text).toContain("906");
    expect(text).toContain("932");
    expect(text).toContain("hdzog.com");
  });
});

describe("update_mediation_network", () => {
  it("keeps the fields the caller did not touch", async () => {
    const { client, api } = await withApi();
    api.listMediationConnections.mockResolvedValue([{ ...CONNECTION, uniqCap: 5, testShare: 30 }]);
    api.updateMediationConnection.mockResolvedValue({ ...CONNECTION, uniqCap: 5, geo: [34] });

    await call(client, "kadam_pub_update_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
      geo: [34],
    });

    expect(api.updateMediationConnection).toHaveBeenCalledWith(
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
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationConnections.mockResolvedValue([CONNECTION]);
    api.listMediationPlacements.mockResolvedValue([
      { ...PLACEMENT, id: "deadbeef", name: "Popunder US", tag: "https://tsyndicate.com/us" },
    ]);
    api.updateMediationConnection.mockResolvedValue({ ...CONNECTION, extBlockId: "deadbeef" });

    await call(client, "kadam_pub_update_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
      placement: "Popunder US",
    });

    expect(api.updateMediationConnection).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        extBlockId: "deadbeef",
        extBlockName: "Popunder US",
        tagTemplate: "https://tsyndicate.com/us",
      }),
    );
  });

  /**
   * Пустая строка на бэкенде означает «код сети по умолчанию». Пропуск поля оставил бы
   * код прежней зоны служить новой — подключение молча крутило бы чужой креатив.
   */
  it("drops the previous zone's tag when the new zone has none", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({
      networks: [{ ...NETWORK, defaultTag: "https://tsyndicate.com/{ext_block_id}" }],
      geo: [],
    });
    api.listMediationConnections.mockResolvedValue([CONNECTION]);
    api.listMediationPlacements.mockResolvedValue([
      { ...PLACEMENT, id: "no-tag-zone", name: "Bare zone", tag: null },
    ]);
    api.updateMediationConnection.mockResolvedValue({ ...CONNECTION, extBlockId: "no-tag-zone" });

    await call(client, "kadam_pub_update_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
      placement: "Bare zone",
    });

    expect(api.getMediationPlacementTag).not.toHaveBeenCalled();
    expect(api.updateMediationConnection).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ extBlockId: "no-tag-zone", tagTemplate: "" }),
    );
  });

  /** Зону только что завели в сети: без fresh её нет в закешированном на 120 с каталоге. */
  it("passes fresh through to the catalog when moving to a new zone", async () => {
    const { client, api } = await withApi();
    api.getMediationOptions.mockResolvedValue({ networks: [NETWORK], geo: [] });
    api.listMediationConnections.mockResolvedValue([CONNECTION]);
    api.listMediationPlacements.mockResolvedValue([{ ...PLACEMENT, id: "just-made" }]);
    api.updateMediationConnection.mockResolvedValue({ ...CONNECTION, extBlockId: "just-made" });

    await call(client, "kadam_pub_update_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
      placement: "just-made",
      fresh: true,
    });
    await call(client, "kadam_pub_update_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
      placement: "just-made",
    });

    expect(api.listMediationPlacements.mock.calls).toEqual([
      [11, 4242, true],
      [11, 4242, false],
    ]);
  });

  /** Зона принадлежит аккаунту: перенос без зоны оставил бы id, которого у нового нет. */
  it("refuses to move the connection to another account without a zone", async () => {
    const { client, api } = await withApi();
    api.listMediationConnections.mockResolvedValue([CONNECTION]);

    const text = await call(client, "kadam_pub_update_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
      accountId: 12,
    });

    expect(text).toContain("owns different zones");
    expect(api.updateMediationConnection).not.toHaveBeenCalled();
    expect(api.listMediationPlacements).not.toHaveBeenCalled();
  });

  /** Каталог TrafficStars это ~1500 зон: без предела ответ вылетает за лимит вывода. */
  it("caps the catalog it prints when the zone is not found", async () => {
    const { client, api } = await withApi();
    api.listMediationConnections.mockResolvedValue([CONNECTION]);
    api.listMediationPlacements.mockResolvedValue(
      Array.from({ length: 400 }, (_, i) => ({
        ...PLACEMENT,
        id: `zone-${i}`,
        name: `Zone ${i}`,
      })),
    );

    const text = await call(client, "kadam_pub_update_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
      placement: "no-such-zone",
    });

    expect(text).toContain("and 370 more");
    expect(text).not.toContain("zone-399");
    expect(new TextEncoder().encode(text).length).toBeLessThan(50_000);
  });

  it("names the candidates when the placement is not in the catalog", async () => {
    const { client, api } = await withApi();
    api.listMediationConnections.mockResolvedValue([CONNECTION]);
    api.listMediationPlacements.mockResolvedValue([PLACEMENT]);

    const text = await call(client, "kadam_pub_update_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
      placement: "no-such-zone",
    });

    expect(text).toContain('No placement "no-such-zone"');
    expect(api.updateMediationConnection).not.toHaveBeenCalled();
  });

  it("reports the ids that do exist when the connection is not on that ad unit", async () => {
    const { client, api } = await withApi();
    api.listMediationConnections.mockResolvedValue([CONNECTION]);

    const text = await call(client, "kadam_pub_update_mediation_network", {
      adUnitId: 4242,
      connectionId: 99,
      uniqCap: 1,
    });

    expect(text).toContain("has no connection #99");
    expect(text).toContain("#77");
    expect(api.updateMediationConnection).not.toHaveBeenCalled();
  });
});

describe("set_mediation_network_status", () => {
  it("pauses through an update that preserves the rest of the row", async () => {
    const { client, api } = await withApi();
    api.listMediationConnections.mockResolvedValue([CONNECTION]);
    api.updateMediationConnection.mockResolvedValue({ ...CONNECTION, active: false });

    const text = await call(client, "kadam_pub_set_mediation_network_status", {
      adUnitId: 4242,
      connectionId: 77,
      status: "paused",
    });

    expect(api.updateMediationConnection).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ active: false, extBlockId: "00fcc7f5" }),
    );
    expect(text).toContain("is now paused");
  });

  it("activates through an update that preserves the rest of the row", async () => {
    const { client, api } = await withApi();
    api.listMediationConnections.mockResolvedValue([{ ...CONNECTION, active: false, uniqCap: 7 }]);
    api.updateMediationConnection.mockResolvedValue({ ...CONNECTION, uniqCap: 7 });

    await call(client, "kadam_pub_set_mediation_network_status", {
      adUnitId: 4242,
      connectionId: 77,
      status: "active",
    });

    expect(api.updateMediationConnection).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ active: true, uniqCap: 7 }),
    );
  });

  it("retests through the dedicated endpoint, reusing the current share", async () => {
    const { client, api } = await withApi();
    api.listMediationConnections.mockResolvedValue([{ ...CONNECTION, testShare: 25 }]);
    api.retestMediationConnection.mockResolvedValue({
      ...CONNECTION,
      testShare: 25,
      testState: "running",
    });

    const text = await call(client, "kadam_pub_retest_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
    });

    expect(api.retestMediationConnection).toHaveBeenCalledWith(77, 25);
    expect(api.updateMediationConnection).not.toHaveBeenCalled();
    expect(text).toContain("Test restarted at 25%");
  });

  it("starts a test at a default share when the connection had none", async () => {
    const { client, api } = await withApi();
    api.listMediationConnections.mockResolvedValue([CONNECTION]);
    api.retestMediationConnection.mockResolvedValue({ ...CONNECTION, testShare: 10 });

    await call(client, "kadam_pub_retest_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
    });

    expect(api.retestMediationConnection).toHaveBeenCalledWith(77, 10);
  });

  it("refuses a share above the backend cap before calling the API", async () => {
    const { client, api } = await withApi();

    const text = await call(client, "kadam_pub_retest_mediation_network", {
      adUnitId: 4242,
      connectionId: 77,
      testShare: 80,
    });

    expect(text).toMatch(/50/);
    expect(api.retestMediationConnection).not.toHaveBeenCalled();
  });
});

describe("destructive tools", () => {
  it("disconnect requires confirm", async () => {
    const { client, api } = await withApi();

    const text = await call(client, "kadam_pub_disconnect_mediation_network", { connectionId: 77 });

    expect(text).toMatch(/confirm/i);
    expect(api.deleteMediationConnection).not.toHaveBeenCalled();
  });

  it("disconnect removes the connection once confirmed", async () => {
    const { client, api } = await withApi();
    api.deleteMediationConnection.mockResolvedValue({});

    const text = await call(client, "kadam_pub_disconnect_mediation_network", {
      connectionId: 77,
      confirm: true,
    });

    expect(api.deleteMediationConnection).toHaveBeenCalledWith(77);
    expect(text).toContain("removed");
  });
});

describe("tool surface", () => {
  it("keeps every tool under the publisher prefix", async () => {
    const { client } = await withApi();
    const { tools } = await client.listTools();

    expect(tools.length).toBe(6);
    for (const tool of tools) expect(tool.name).toMatch(/^kadam_pub_/);
  });
});
