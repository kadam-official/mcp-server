import {
  createToolClient,
  getTextFromResult,
  type MockPubClient,
} from "../../helpers/tool-client.js";
import { usersModule } from "../../../src/tools/publisher/users.js";
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

describe("publisher users tools", () => {
  it("get_user_info returns formatted account details", async () => {
    const { client, mockApi } = await createToolClient(usersModule);
    const api = mockApi as MockPubClient;
    api.getUserInfo.mockResolvedValue({
      balance: 150.5,
      currency: "usd",
      notifications: { items: [], totalItems: 5, unreadItems: 2 },
    });

    const result = await client.callTool({
      name: "kadam_pub_get_user_info",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Publisher Account");
    expect(text).toContain("$150.5");
    expect(text).toContain("2");
  });

  it("handles zero balance gracefully", async () => {
    const { client, mockApi } = await createToolClient(usersModule);
    const api = mockApi as MockPubClient;
    api.getUserInfo.mockResolvedValue({
      balance: 0,
      currency: "rub",
      notifications: { items: [], totalItems: 0, unreadItems: 0 },
    });

    const result = await client.callTool({
      name: "kadam_pub_get_user_info",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(text).toContain("₽0");
    expect(text).toContain("rub");
  });
});
