import {
  createToolClient,
  getTextFromResult,
  type MockPubClient,
} from "../../helpers/tool-client.js";
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
          domain: "mysite.com",
          stage: "accepted",
          archive: 0,
          views: 1000,
          clicks: 50,
          income: "₽25",
          blockCounts: { native: "1", push: "2" },
        },
      ],
      totalRows: 1,
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
      state: "onconfirm",
      archive: 0,
      scriptTag: '<meta name="kadam-verification" content="abc123" />',
    });

    const result = await client.callTool({
      name: "kadam_pub_create_source",
      arguments: { name: "New Site", url: "https://newsite.com" },
    });
    const text = getTextFromResult(result);

    expect(api.createSource).toHaveBeenCalledWith({
      name: "New Site",
      url: "https://newsite.com",
    });
    expect(text).toContain("created");
    expect(text).toContain("onconfirm");
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
      state: "accepted",
      archive: 0,
      isDirectLink: false,
      createTime: 1581426528,
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

  it("update_source calls updateSource and returns detail", async () => {
    const { client, mockApi } = await createToolClient(sourcesModule);
    const api = mockApi as MockPubClient;
    api.updateSource.mockResolvedValue({
      id: 10,
      name: "New Name",
      url: "https://example.com",
      state: "accepted",
      archive: 0,
    });

    const result = await client.callTool({
      name: "kadam_pub_update_source",
      arguments: { id: 10, name: "New Name" },
    });
    const text = getTextFromResult(result);

    expect(api.updateSource).toHaveBeenCalledWith(10, { name: "New Name" });
    expect(text).toContain("New Name");
    expect(text).toContain("10");
  });
});
