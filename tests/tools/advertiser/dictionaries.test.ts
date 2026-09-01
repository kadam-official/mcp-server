import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
import { dictionariesModule } from "../../../src/tools/advertiser/dictionaries.js";
import { resetConfig } from "../../../src/config.js";

vi.mock("../../../src/logger.js", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  createToolLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

beforeEach(() => {
  process.env.KADAM_ADV_API_KEY = "test-adv-key";
});
afterEach(() => {
  delete process.env.KADAM_ADV_API_KEY;
  resetConfig();
});

describe("get_dictionary tool", () => {
  it("renders a flat dictionary and asks the API for that type", async () => {
    const { client, mockApi } = await createToolClient(dictionariesModule);
    const api = mockApi as MockPartnersClient;
    api.getDictionary.mockResolvedValue({
      type: "connection-types",
      total: 2,
      items: [
        { id: 3, label: "All" },
        { id: 1, label: "Wi-Fi" },
      ],
    });

    const res = await client.callTool({
      name: "kadam_adv_get_dictionary",
      arguments: { type: "connection-types" },
    });
    const text = getTextFromResult(res);

    expect(api.getDictionary).toHaveBeenCalledWith("connection-types", {});
    expect(text).toContain('Dictionary "connection-types" (2)');
    expect(text).toContain("[ID: 3] All");
    expect(text).toContain("[ID: 1] Wi-Fi");
  });

  it("shows the campaign type slug so the id can be reused in other tools", async () => {
    const { client, mockApi } = await createToolClient(dictionariesModule);
    const api = mockApi as MockPartnersClient;
    api.getDictionary.mockResolvedValue({
      type: "campaign-types",
      total: 1,
      items: [{ id: 10, label: "Native", slug: "teaser" }],
    });

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_get_dictionary",
        arguments: { type: "campaign-types" },
      }),
    );

    expect(text).toContain("[ID: 10] Native | slug: teaser");
  });

  it("indents tree dictionaries under their parent", async () => {
    const { client, mockApi } = await createToolClient(dictionariesModule);
    const api = mockApi as MockPartnersClient;
    api.getDictionary.mockResolvedValue({
      type: "devices",
      total: 1,
      items: [
        {
          id: 2,
          label: "Mobile",
          children: [{ id: 3, label: "Apple", children: [{ id: 4, label: "iPhone 15" }] }],
        },
      ],
    });

    const text = getTextFromResult(
      await client.callTool({ name: "kadam_adv_get_dictionary", arguments: { type: "devices" } }),
    );

    expect(text).toContain("1. [ID: 2] Mobile");
    expect(text).toContain("  - [ID: 3] Apple");
    expect(text).toContain("    - [ID: 4] iPhone 15");
  });

  it("translates the friendly campaign type name into the numeric id the API expects", async () => {
    const { client, mockApi } = await createToolClient(dictionariesModule);
    const api = mockApi as MockPartnersClient;
    api.getDictionary.mockResolvedValue({ type: "categories", total: 0, items: [] });

    await client.callTool({
      name: "kadam_adv_get_dictionary",
      arguments: { type: "categories", campaignType: "inpage_push" },
    });

    expect(api.getDictionary).toHaveBeenCalledWith("categories", { campaignType: "100" });
  });

  it("refuses categories without a campaign type instead of calling the API", async () => {
    const { client, mockApi } = await createToolClient(dictionariesModule);
    const api = mockApi as MockPartnersClient;

    const res = await client.callTool({
      name: "kadam_adv_get_dictionary",
      arguments: { type: "categories" },
    });

    expect(res.isError).toBe(true);
    expect(getTextFromResult(res)).toContain("campaignType is required");
    expect(api.getDictionary).not.toHaveBeenCalled();
  });

  it("refuses isps without a country instead of calling the API", async () => {
    const { client, mockApi } = await createToolClient(dictionariesModule);
    const api = mockApi as MockPartnersClient;

    const res = await client.callTool({
      name: "kadam_adv_get_dictionary",
      arguments: { type: "isps" },
    });

    expect(res.isError).toBe(true);
    expect(getTextFromResult(res)).toContain("countryId is required");
    expect(api.getDictionary).not.toHaveBeenCalled();
  });

  it("passes the country, search and page window through for isps", async () => {
    const { client, mockApi } = await createToolClient(dictionariesModule);
    const api = mockApi as MockPartnersClient;
    api.getDictionary.mockResolvedValue({
      type: "isps",
      total: 1,
      items: [{ id: 11, label: "Beeline", countryId: 1, countryLabel: "Russia" }],
    });

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_get_dictionary",
        arguments: { type: "isps", countryId: 1, search: "beel", page: 2, perPage: 10 },
      }),
    );

    expect(api.getDictionary).toHaveBeenCalledWith("isps", {
      countryId: "1",
      page: "2",
      perPage: "10",
      search: "beel",
    });
    expect(text).toContain("[ID: 11] Beeline | Russia");
  });

  it("reports the remaining isp pages so the caller knows to continue", async () => {
    const { client, mockApi } = await createToolClient(dictionariesModule);
    const api = mockApi as MockPartnersClient;
    api.getDictionary.mockResolvedValue({
      type: "isps",
      total: 4200,
      items: [{ id: 11, label: "Beeline", countryId: 1 }],
    });

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_get_dictionary",
        arguments: { type: "isps", countryId: 1, perPage: 50 },
      }),
    );

    expect(text).toContain("Showing 1 of 4200 items (page 1/84)");
    expect(text).toContain("Use page=2 to see more.");
  });

  it("caps the isp page size so one call cannot blow the output budget", async () => {
    const { client, mockApi } = await createToolClient(dictionariesModule);
    const api = mockApi as MockPartnersClient;
    api.getDictionary.mockResolvedValue({ type: "isps", total: 0, items: [] });

    await client.callTool({
      name: "kadam_adv_get_dictionary",
      arguments: { type: "isps", countryId: 1, perPage: 5000 },
    });

    expect(api.getDictionary).toHaveBeenCalledWith(
      "isps",
      expect.objectContaining({ perPage: "200" }),
    );
  });

  // The API rejects page < 1, so passing a model's 0 straight through would turn "give me the
  // first page" into a validation error.
  it.each([
    ["zero", 0, "1"],
    ["negative", -3, "1"],
    ["fractional", 2.7, "2"],
  ])(
    "normalizes a %s page instead of letting the API reject it",
    async (_label, page, expected) => {
      const { client, mockApi } = await createToolClient(dictionariesModule);
      const api = mockApi as MockPartnersClient;
      api.getDictionary.mockResolvedValue({ type: "isps", total: 0, items: [] });

      await client.callTool({
        name: "kadam_adv_get_dictionary",
        arguments: { type: "isps", countryId: 1, page },
      });

      const sent = api.getDictionary.mock.calls[0]![1] as Record<string, string>;
      expect(sent.page).toBe(expected);
    },
  );

  it("rejects a dictionary type the API does not serve", async () => {
    const { client, mockApi } = await createToolClient(dictionariesModule);
    const api = mockApi as MockPartnersClient;

    const res = await client.callTool({
      name: "kadam_adv_get_dictionary",
      arguments: { type: "not-a-dictionary" },
    });

    expect(res.isError).toBe(true);
    expect(api.getDictionary).not.toHaveBeenCalled();
  });
});
