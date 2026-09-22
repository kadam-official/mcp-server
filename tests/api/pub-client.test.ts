import { PubClient } from "../../src/api/pub-client.js";
import type { HttpClient } from "../../src/api/http-client.js";

/**
 * The cabinet and the key share one contour, `/api/mediation/*`. Nothing else in the
 * suite touches the transport — the tool tests mock PubClient itself — so a wrong prefix
 * here would 404 every mediation call with a green test run.
 */
describe("PubClient mediation paths", () => {
  const network = { id: 7, slug: "monetag", name: "Monetag" };
  const account = { id: 11, networkId: 7, name: "main" };
  const placement = { id: "00fcc7f5", name: "zone" };
  const connection = {
    id: 77,
    blockId: 5,
    networkId: 7,
    format: "popunder",
    extBlockId: "00fcc7f5",
  };

  let http: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let pub: PubClient;

  beforeEach(() => {
    http = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
    pub = new PubClient(http as unknown as HttpClient);
  });

  it("reads the catalog, options, accounts and placements under /mediation", async () => {
    http.get
      .mockResolvedValueOnce({ networks: [network] })
      .mockResolvedValueOnce({ networks: [network], geo: [] })
      .mockResolvedValueOnce([account])
      .mockResolvedValueOnce({ items: [placement] });

    expect(await pub.listMediationNetworks()).toHaveLength(1);
    expect(await pub.getMediationOptions(5)).toMatchObject({ geo: [] });
    expect(await pub.listMediationAccounts(7)).toHaveLength(1);
    expect(await pub.listMediationPlacements(11, 5, true)).toHaveLength(1);

    expect(http.get.mock.calls.map((c) => c[0])).toEqual([
      "/mediation/networks",
      "/mediation/options",
      "/mediation/accounts",
      "/mediation/accounts/11/placements",
    ]);
    expect(http.get.mock.calls[1][1]).toEqual({ blockId: "5" });
    expect(http.get.mock.calls[2][1]).toEqual({ networkId: "7" });
    expect(http.get.mock.calls[3][1]).toEqual({ blockId: "5", fresh: "1" });
  });

  it("writes accounts and connections under /mediation", async () => {
    http.post.mockResolvedValue(account);
    http.put.mockResolvedValue(account);
    http.delete.mockResolvedValue({ deleted: true });

    await pub.createMediationAccount({ name: "main" });
    await pub.updateMediationAccount(11, { name: "main" });
    await pub.deleteMediationAccount(11);

    expect(http.post.mock.calls[0][0]).toBe("/mediation/accounts");
    expect(http.put.mock.calls[0][0]).toBe("/mediation/accounts/11");
    expect(http.delete.mock.calls[0][0]).toBe("/mediation/accounts/11");

    http.post.mockResolvedValue(connection);
    http.put.mockResolvedValue(connection);

    await pub.createMediationConnection({ blockId: 5 });
    await pub.updateMediationConnection(77, { active: false });
    await pub.deleteMediationConnection(77);
    await pub.retestMediationConnection(77, 10);

    expect(http.post.mock.calls.map((c) => c[0])).toEqual([
      "/mediation/accounts",
      "/mediation/connections",
      "/mediation/connections/77/retest",
    ]);
    expect(http.post.mock.calls[2][1]).toEqual({ share: 10 });
    expect(http.put.mock.calls[1][0]).toBe("/mediation/connections/77");
    expect(http.delete.mock.calls[1][0]).toBe("/mediation/connections/77");
  });

  it("lists connections of one ad unit", async () => {
    http.get.mockResolvedValue({ items: [connection] });

    expect(await pub.listMediationConnections(5)).toHaveLength(1);
    expect(http.get.mock.calls[0]).toEqual(["/mediation/connections", { blockId: "5" }]);
  });
});
