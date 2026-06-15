import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ClientPool } from "../src/api/client-pool.js";
import { createSessionServer } from "../src/http-bootstrap.js";
import { getCreativeFormatsContent } from "../src/resources/creative-formats.js";
import type { CabinetType } from "../src/http-session.js";
import type { ToolCredentials } from "../src/middleware/tool-wrapper.js";

vi.mock("../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const SIZES = { sizes: [{ id: 5, label: "300x250", width: 300, height: 250 }] };

function mockRegistry() {
  return {
    getMaterialOptions: vi.fn().mockResolvedValue(SIZES),
    getCampaignOptions: vi.fn().mockResolvedValue({
      cpTypes: [],
      categories: [],
      subAges: [],
      options: { allowAgeSelection: false, allowGenderSelection: false },
    }),
  };
}

async function withSession<T>(
  cabinet: CabinetType,
  credentials: ToolCredentials,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const pool = new ClientPool({
    advBaseUrl: "https://partners.kadam.net/api/v1",
    pubBaseUrl: "https://pub.kadam.net/api",
  });
  vi.spyOn(pool, "resolve").mockReturnValue({
    adv: { options: mockRegistry() } as never,
    pub: null,
  });
  const server = createSessionServer(pool, cabinet, credentials);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.1" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return fn(client);
}

function listUris(cabinet: CabinetType, credentials: ToolCredentials): Promise<string[]> {
  return withSession(cabinet, credentials, async (client) => {
    const res = await client.listResources();
    return (res.resources ?? []).map((r) => r.uri).sort();
  });
}

function readText(
  cabinet: CabinetType,
  credentials: ToolCredentials,
  uri: string,
): Promise<string> {
  return withSession(cabinet, credentials, async (client) => {
    const result = await client.readResource({ uri });
    const textContent = result.contents.find((c) => "text" in c) as { text: string } | undefined;
    return textContent?.text ?? "";
  });
}

describe("HTTP session resources", () => {
  it("advertiser session includes Banner Sizes from the session registry", async () => {
    const text = await readText("adv", { advKey: "b" }, "kadam://reference/creative-formats");
    expect(text).toContain("Banner Sizes (sizeId values)");
    expect(text).toContain("5 = 300x250 (300x250)");
  });

  it("campaign-types points to the on-demand categories resource and omits the full tree", async () => {
    const text = await readText("adv", { advKey: "b" }, "kadam://reference/campaign-types");
    expect(text).toContain("kadam://reference/categories");
    expect(text).not.toContain("Categories:");
  });

  it("categories resource is served on demand", async () => {
    const text = await readText("adv", { advKey: "b" }, "kadam://reference/categories");
    expect(text).toContain("Category IDs per campaign type");
  });
});

describe("resource cabinet scoping", () => {
  it("adv session lists exactly the 6 advertiser resources", async () => {
    const uris = await listUris("adv", { advKey: "b" });
    expect(uris).toEqual([
      "kadam://reference/api-overview",
      "kadam://reference/campaign-types",
      "kadam://reference/categories",
      "kadam://reference/creative-formats",
      "kadam://reference/pricing-models",
      "kadam://reference/report-dimensions",
    ]);
  });

  it("pub session lists exactly the 4 publisher resources and no advertiser ones", async () => {
    const uris = await listUris("pub", { pubKey: "b" });
    expect(uris).toEqual([
      "kadam://reference/ad-unit-types",
      "kadam://reference/api-overview",
      "kadam://reference/report-dimensions",
      "kadam://reference/site-states",
    ]);
    expect(uris).not.toContain("kadam://reference/campaign-types");
    expect(uris).not.toContain("kadam://reference/categories");
    expect(uris).not.toContain("kadam://reference/pricing-models");
    expect(uris).not.toContain("kadam://reference/creative-formats");
  });

  it("adv mixed resources contain no publisher sections", async () => {
    const rd = await readText("adv", { advKey: "b" }, "kadam://reference/report-dimensions");
    const ov = await readText("adv", { advKey: "b" }, "kadam://reference/api-overview");
    expect(rd).toContain("kadam_adv_get_stats");
    expect(rd).not.toContain("Publisher");
    expect(ov).toContain("partners.kadam.net");
    expect(ov).not.toContain("pub.kadam.net");
    expect(ov).not.toContain("Publishers:");
  });

  it("pub mixed resources contain no advertiser sections", async () => {
    const rd = await readText("pub", { pubKey: "b" }, "kadam://reference/report-dimensions");
    const ov = await readText("pub", { pubKey: "b" }, "kadam://reference/api-overview");
    expect(rd).toContain("kadam_pub_get_stats");
    expect(rd).not.toContain("Advertiser");
    expect(ov).toContain("pub.kadam.net");
    expect(ov).not.toContain("partners.kadam.net");
    expect(ov).not.toContain("Advertisers:");
  });
});

describe("getCreativeFormatsContent", () => {
  it("appends sizes when a registry is provided", async () => {
    const text = await getCreativeFormatsContent(mockRegistry() as never);
    expect(text).toContain("Banner Sizes (sizeId values)");
    expect(text).toContain("5 = 300x250 (300x250)");
  });

  it("returns only static content when registry is null", async () => {
    const text = await getCreativeFormatsContent(null);
    expect(text).not.toContain("Banner Sizes (sizeId values)");
    expect(text).toContain("Banner:");
  });
});
