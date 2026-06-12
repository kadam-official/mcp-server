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
  return { getMaterialOptions: vi.fn().mockResolvedValue(SIZES) };
}

async function readCreativeFormats(cabinet: CabinetType, credentials: ToolCredentials) {
  const pool = new ClientPool({
    advBaseUrl: "https://partners.kadam.net/api/v1",
    pubBaseUrl: "https://pub.kadam.net/api",
  });
  // The advertiser registry is derived from pool.resolve(advKey).adv.options.
  vi.spyOn(pool, "resolve").mockReturnValue({
    adv: { options: mockRegistry() } as never,
    pub: null,
  });

  const server = createSessionServer(pool, cabinet, credentials);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.1" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const result = await client.readResource({ uri: "kadam://reference/creative-formats" });
  const textContent = result.contents.find((c) => "text" in c) as { text: string } | undefined;
  return textContent?.text ?? "";
}

describe("HTTP session resources", () => {
  it("advertiser session includes Banner Sizes from the session registry", async () => {
    const text = await readCreativeFormats("adv", { advKey: "session-bearer" });
    expect(text).toContain("Banner Sizes (sizeId values)");
    expect(text).toContain("5 = 300x250 (300x250)");
  });

  it("publisher session omits Banner Sizes (no advertiser registry)", async () => {
    const text = await readCreativeFormats("pub", { pubKey: "session-bearer" });
    expect(text).toContain("Banner:"); // static content still present
    expect(text).not.toContain("Banner Sizes (sizeId values)");
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
