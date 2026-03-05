import { createToolClient, getTextFromResult } from "../../helpers/tool-client.js";
import { sourcesModule } from "../../../src/tools/publisher/sources.js";
import * as api from "../../../src/api/pub-client.js";

vi.mock("../../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../../src/api/pub-client.js");

beforeEach(() => {
  process.env.KADAM_PUB_API_KEY = "test-pub-key";
});
afterEach(() => {
  delete process.env.KADAM_PUB_API_KEY;
});

describe("publisher sources tools", () => {
  it("list_sources returns formatted list", async () => {
    vi.mocked(api.listSources).mockResolvedValue({
      rows: [
        {
          id: 1,
          name: "My Site",
          url: "https://mysite.com",
          status: "active",
          state: "accepted",
          impressions: 1000,
          clicks: 50,
          revenue: 25,
          placesCount: 3,
        },
      ],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const client = await createToolClient(sourcesModule);
    const result = await client.callTool({
      name: "kadam_pub_list_sources",
      arguments: { page: 1 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("[ID: 1]");
    expect(text).toContain("My Site");
    expect(text).toContain("Sources");
  });

  it("create_source calls api.createSource with name and url", async () => {
    vi.mocked(api.createSource).mockResolvedValue({
      id: 10,
      name: "New Site",
      url: "https://newsite.com",
      status: "oninit",
      state: "oninit",
      impressions: 0,
      clicks: 0,
      revenue: 0,
      placesCount: 0,
    });

    const client = await createToolClient(sourcesModule);
    await client.callTool({
      name: "kadam_pub_create_source",
      arguments: { name: "New Site", url: "https://newsite.com" },
    });

    expect(api.createSource).toHaveBeenCalledWith({
      name: "New Site",
      url: "https://newsite.com",
    });
  });

  it("set_source_status with status archived calls api with action archive", async () => {
    vi.mocked(api.setSourceStatus).mockResolvedValue(undefined as never);

    const client = await createToolClient(sourcesModule);
    const result = await client.callTool({
      name: "kadam_pub_set_source_status",
      arguments: { id: 5, status: "archived" },
    });
    const text = getTextFromResult(result);

    expect(api.setSourceStatus).toHaveBeenCalledWith(5, "archive");
    expect(text).toContain("set to archived");
  });
});
