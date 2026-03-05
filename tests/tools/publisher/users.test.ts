import { createToolClient, getTextFromResult, type MockPubClient } from "../../helpers/tool-client.js";
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
  it("get_user_info returns formatted user details", async () => {
    const { client, mockApi } = await createToolClient(usersModule);
    const api = mockApi as MockPubClient;
    api.getUserInfo.mockResolvedValue({
      id: 1,
      email: "publisher@example.com",
      balance: 150.50,
      name: "John Doe",
      notificationsCount: 3,
    });

    const result = await client.callTool({
      name: "kadam_pub_get_user_info",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(text).toContain("Publisher User");
    expect(text).toContain("publisher@example.com");
    expect(text).toContain("John Doe");
    expect(text).toContain("150.50");
  });

  it("handles user with null balance gracefully", async () => {
    const { client, mockApi } = await createToolClient(usersModule);
    const api = mockApi as MockPubClient;
    api.getUserInfo.mockResolvedValue({
      id: 2,
      email: "test@example.com",
      balance: null as unknown as number,
      name: "Test User",
      notificationsCount: 0,
    });

    const result = await client.callTool({
      name: "kadam_pub_get_user_info",
      arguments: {},
    });
    const text = getTextFromResult(result);

    expect(text).toContain("test@example.com");
  });
});
