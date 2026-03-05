import { createToolClient, getTextFromResult, type MockPubClient } from "../../helpers/tool-client.js";
import { sourcesModule } from "../../../src/tools/publisher/sources.js";
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

describe("publisher sources tools", () => {
  it("list_sources returns formatted list", async () => {
    const { client, mockApi } = await createToolClient(sourcesModule);
    const api = mockApi as MockPubClient;
    api.listSources.mockResolvedValue({
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
    const { client, mockApi } = await createToolClient(sourcesModule);
    const api = mockApi as MockPubClient;
    api.createSource.mockResolvedValue({
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
    const { client, mockApi } = await createToolClient(sourcesModule);
    const api = mockApi as MockPubClient;
    api.setSourceStatus.mockResolvedValue(undefined as never);

    const result = await client.callTool({
      name: "kadam_pub_set_source_status",
      arguments: { id: 5, status: "archived" },
    });
    const text = getTextFromResult(result);

    expect(api.setSourceStatus).toHaveBeenCalledWith(5, "archive");
    expect(text).toContain("set to archived");
  });

  it("get_source returns formatted source details", async () => {
    const { client, mockApi } = await createToolClient(sourcesModule);
    const api = mockApi as MockPubClient;
    api.getSource.mockResolvedValue({
      id: 42,
      name: "My Site",
      url: "https://example.com",
      status: "accepted",
      state: "accepted",
      impressions: 5000,
      clicks: 100,
      revenue: 12.50,
      placesCount: 3,
    });

    const result = await client.callTool({
      name: "kadam_pub_get_source",
      arguments: { id: 42 },
    });
    const text = getTextFromResult(result);

    expect(api.getSource).toHaveBeenCalledWith(42);
    expect(text).toContain("42");
    expect(text).toContain("My Site");
    expect(text).toContain("accepted");
  });

  it("update_source calls updateSource with correct args", async () => {
    const { client, mockApi } = await createToolClient(sourcesModule);
    const api = mockApi as MockPubClient;
    api.updateSource.mockResolvedValue(undefined as never);

    const result = await client.callTool({
      name: "kadam_pub_update_source",
      arguments: { id: 10, name: "New Name" },
    });
    const text = getTextFromResult(result);

    expect(api.updateSource).toHaveBeenCalledWith(10, { name: "New Name" });
    expect(text).toContain("updated");
  });
});
