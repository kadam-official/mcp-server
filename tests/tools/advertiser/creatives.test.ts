import {
  createToolClient,
  getTextFromResult,
  type MockPartnersClient,
} from "../../helpers/tool-client.js";
import { creativesModule } from "../../../src/tools/advertiser/creatives.js";
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

describe("creatives tools", () => {
  it("list_creatives returns formatted list", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.listCreatives.mockResolvedValue({
      rows: [
        {
          ad: { id: 1, title: "Creative One", text: "", status: { id: "active", label: "Active" } },
          materialCampaign: { id: 10, name: "Test Campaign" },
          views: "0",
          clicks: "0",
        },
      ],
      totalRows: 1,
      page: 1,
      perPage: 25,
    });

    const result = await client.callTool({
      name: "kadam_adv_list_creatives",
      arguments: { page: 1 },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("[ID: 1]");
    expect(text).toContain("Creative One");
    expect(text).toContain("Creatives");
  });

  it("list_creatives nests campaignId/searchQuery into filters and maps status to statuses (KTS-1590)", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.listCreatives.mockResolvedValue({ rows: [], totalRows: 0, page: 1, perPage: 25 });

    await client.callTool({
      name: "kadam_adv_list_creatives",
      arguments: { page: 1, campaignId: 10, status: "paused", searchQuery: "banner" },
    });

    expect(api.listCreatives).toHaveBeenCalledWith({
      page: 1,
      perPage: 25,
      filters: { campaignId: 10, statuses: [80], searchQuery: "banner" },
    });
  });

  it("list_creatives maps status=moderation to statuses [0,5]", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.listCreatives.mockResolvedValue({ rows: [], totalRows: 0, page: 1, perPage: 25 });

    await client.callTool({
      name: "kadam_adv_list_creatives",
      arguments: { page: 1, status: "moderation" },
    });

    expect(api.listCreatives).toHaveBeenCalledWith({
      page: 1,
      perPage: 25,
      filters: { statuses: [0, 5] },
    });
  });

  it("create_creative calls api.createCreative with campaignId and FormData", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.createCreative.mockResolvedValue({
      id: 99,
      campaignId: 15,
      title: "",
      text: "",
      url: "https://example.com/landing",
      imageUrl: "",
      iconUrl: "",
      status: "pending",
      moderationStatus: "pending",
      bid: 0.5,
      clicks: 0,
      impressions: 0,
      ctr: 0,
    });

    await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 15,
        url: "https://example.com/landing",
      },
    });

    expect(api.createCreative).toHaveBeenCalledWith(15, expect.any(FormData));
  });

  /**
   * Без флага формата бэкенд сохранит загруженный файл как обычный баннер, а VAST-тег —
   * как ссылку на лендинг: формат теряется молча, поэтому он проверяется отдельно.
   */
  it("create_creative marks an uploaded video as a video creative", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.createCreative.mockResolvedValue({ id: 100 } as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Buffer.from("fake-mp4"), { status: 200 })),
    );

    await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 16,
        url: "https://example.com/landing",
        title: "Video",
        videoUrl: "https://example.com/clip.mp4",
      },
    });

    const fd = api.createCreative.mock.calls[0]![1] as FormData;
    expect(fd.get("isVideo")).toBe("1");
    expect(fd.get("image")).toBeInstanceOf(Blob);
    vi.unstubAllGlobals();
  });

  it("create_creative sends a VAST tag as the creative URL without uploading anything", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.createCreative.mockResolvedValue({ id: 101 } as never);

    await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 16,
        url: "https://example.com/landing",
        title: "VAST",
        vastTagUrl: "https://ads.example.com/vast",
      },
    });

    const fd = api.createCreative.mock.calls[0]![1] as FormData;
    expect(fd.get("isVast")).toBe("1");
    expect(fd.get("url")).toBe("https://ads.example.com/vast");
    expect(fd.get("image")).toBeNull();
  });

  function allowBannerSize(api: MockPartnersClient, sizeId: number): void {
    api.options.getMaterialOptions.mockResolvedValue({
      sizes: [{ id: sizeId, label: "300x250", width: 300, height: 250 }],
    });
  }

  it("create_creative sends an iframe banner as a frame url without uploading a file", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.createCreative.mockResolvedValue({ id: 102 } as never);
    allowBannerSize(api, 20);

    await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 17,
        isIframe: true,
        url: "https://ads.example.com/frame?geo={country}",
        sizeId: 20,
        name: "Grid white",
        text: "ignored when name is set",
      },
    });

    const fd = api.createCreative.mock.calls[0]![1] as FormData;
    expect(fd.get("isIframe")).toBe("1");
    expect(fd.get("url")).toBe("https://ads.example.com/frame?geo={country}");
    expect(fd.get("sizeId")).toBe("20");
    expect(fd.get("name")).toBe("Grid white");
    expect(fd.get("image")).toBeNull();
    expect(fd.get("isHtmlTag")).toBeNull();
    expect(fd.get("htmlTagCode")).toBeNull();
  });

  it("create_creative sends an HTML-tag banner without a landing url or a file", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.createCreative.mockResolvedValue({ id: 103 } as never);
    allowBannerSize(api, 20);

    const markup = '<a href="{click_url}"><img src="https://cdn.example.com/b.gif"></a>';
    await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 17,
        isHtmlTag: true,
        htmlTagCode: markup,
        sizeId: 20,
        name: "Mosaic",
      },
    });

    const fd = api.createCreative.mock.calls[0]![1] as FormData;
    expect(fd.get("isHtmlTag")).toBe("1");
    expect(fd.get("htmlTagCode")).toBe(markup);
    expect(fd.get("sizeId")).toBe("20");
    expect(fd.get("name")).toBe("Mosaic");
    expect(fd.get("url")).toBeNull();
    expect(fd.get("image")).toBeNull();
    expect(fd.get("isIframe")).toBeNull();
  });

  it("create_creative refuses an HTML-tag banner without htmlTagCode before calling the api", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    allowBannerSize(api, 20);

    const result = await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 17,
        isHtmlTag: true,
        sizeId: 20,
      },
    });

    expect(api.createCreative).not.toHaveBeenCalled();
    expect(getTextFromResult(result)).toContain("htmlTagCode");
  });

  it("create_creative refuses an iframe banner whose url is not https", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    allowBannerSize(api, 20);

    const result = await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 17,
        isIframe: true,
        url: "http://ads.example.com/frame",
        sizeId: 20,
      },
    });

    expect(api.createCreative).not.toHaveBeenCalled();
    expect(getTextFromResult(result)).toContain("https");
  });

  it("create_creative refuses an iframe banner combined with an HTML5 archive", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    allowBannerSize(api, 20);

    const result = await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 17,
        isIframe: true,
        url: "https://ads.example.com/frame",
        sizeId: 20,
        html5ArchiveUrl: "https://cdn.example.com/banner.zip",
      },
    });

    expect(api.createCreative).not.toHaveBeenCalled();
    expect(getTextFromResult(result)).toContain("only one creative format");
  });

  it("create_creative does not mark an uploaded image as iframe or HTML tag", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.createCreative.mockResolvedValue({ id: 104 } as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Buffer.from("fake-png"), { status: 200 })),
    );

    await client.callTool({
      name: "kadam_adv_create_creative",
      arguments: {
        campaignId: 18,
        url: "https://example.com/landing",
        imageUrl: "https://cdn.example.com/banner.png",
      },
    });

    const fd = api.createCreative.mock.calls[0]![1] as FormData;
    expect(fd.get("image")).toBeInstanceOf(Blob);
    expect(fd.get("isIframe")).toBeNull();
    expect(fd.get("isHtmlTag")).toBeNull();
    expect(fd.get("url")).toBe("https://example.com/landing");
    vi.unstubAllGlobals();
  });

  it("set_creative_status with ids 5,6 and status paused calls api with action pause", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.setCreativeStatus.mockResolvedValue({
      materials: [
        { id: 5, success: true },
        { id: 6, success: true },
      ],
      totalMaterials: 2,
      processedMaterials: 2,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_set_creative_status",
      arguments: { ids: "5,6", status: "paused" },
    });
    const text = getTextFromResult(result);

    expect(api.setCreativeStatus).toHaveBeenCalledWith([5, 6], "pause");
    expect(text).toContain("2/2 creatives set to paused");
    expect(text).toContain("Applied: #5, #6");
  });

  it("set_creative_status with status restored calls the restore endpoint", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.setCreativeStatus.mockResolvedValue({
      materials: [{ id: 42, success: true }],
      totalMaterials: 1,
      processedMaterials: 1,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_set_creative_status",
      arguments: { ids: "42", status: "restored" },
    });
    const text = getTextFromResult(result);

    expect(api.setCreativeStatus).toHaveBeenCalledWith([42], "restore");
    expect(text).toContain("1/1 creatives set to restored");
  });

  /**
   * The refused IDs are the whole point of the envelope: without them the model would
   * report five archived creatives when the backend only archived four.
   */
  it("set_creative_status surfaces creatives the backend refused", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.setCreativeStatus.mockResolvedValue({
      materials: [
        { id: 5, success: true },
        { id: 6, success: false },
      ],
      totalMaterials: 2,
      processedMaterials: 1,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_set_creative_status",
      arguments: { ids: "5,6", status: "archived" },
    });
    const text = getTextFromResult(result);

    expect(text).toContain("1/2 creatives set to archived");
    expect(text).toContain("Applied: #5");
    expect(text).toContain("#6");
  });

  it("set_creative_status rejects duplicate ids before calling the api", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_set_creative_status",
      arguments: { ids: "5,5", status: "paused" },
    });
    const text = getTextFromResult(result);

    expect(api.setCreativeStatus).not.toHaveBeenCalled();
    expect(text).toContain("Creative identifiers must be unique.");
  });

  it("delete_creatives requires confirm=true", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;

    const result = await client.callTool({
      name: "kadam_adv_delete_creatives",
      arguments: { ids: "42" },
    });
    const text = getTextFromResult(result);

    expect(api.deleteCreatives).not.toHaveBeenCalled();
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(text).toContain("Invalid arguments");
  });

  it("delete_creatives with confirm=true deletes the archived creatives", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.deleteCreatives.mockResolvedValue({
      materials: [{ id: 42, success: true }],
      totalMaterials: 1,
      processedMaterials: 1,
    } as never);

    const result = await client.callTool({
      name: "kadam_adv_delete_creatives",
      arguments: { ids: "42", confirm: true },
    });
    const text = getTextFromResult(result);

    expect(api.deleteCreatives).toHaveBeenCalledWith([42]);
    expect(text).toContain("1/1 creatives deleted");
  });

  it("update_creative does read-modify-write, merging changes with current state", async () => {
    const { client, mockApi } = await createToolClient(creativesModule);
    const api = mockApi as MockPartnersClient;
    api.getMaterial.mockResolvedValue({
      id: 42,
      campaignId: 10,
      type: 20,
      title: "Old Title",
      name: "Old Text",
      url: "https://old.com",
      isPauseAfterModer: 0,
      startDate: null,
      stopDate: null,
      sizeId: 0,
      bids: [],
      status: 10,
    });
    api.updateCreative.mockResolvedValue({} as never);

    const result = await client.callTool({
      name: "kadam_adv_update_creative",
      arguments: {
        creativeId: 42,
        url: "https://new-landing.com",
        bid: 0.15,
      },
    });
    const text = getTextFromResult(result);

    expect(api.getMaterial).toHaveBeenCalledWith(42);
    expect(api.updateCreative).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        adId: 42,
        url: "https://new-landing.com",
        title: "Old Title",
        name: "Old Text",
        bids: [{ bid: 0.15, leadCost: 0, countries: [] }],
      }),
    );
    expect(text).toContain("Creative #42 in campaign #10 updated successfully");
  });
});
