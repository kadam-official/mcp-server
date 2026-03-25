import { mapCampaignFields } from "../../../src/tools/advertiser/campaigns.js";
import type { OptionsRegistry, CampaignOptions } from "../../../src/api/options-registry.js";

function createMockRegistry(overrides: Partial<CampaignOptions> = {}): OptionsRegistry {
  const defaultOptions: CampaignOptions = {
    cpTypes: [{ id: 0, label: "CPC" }, { id: 2, label: "CPM" }, { id: 4, label: "CPA Target" }],
    countries: [
      { id: 34, code: "US", label: "United States", tier: 1 },
      { id: 24, code: "DE", label: "Germany", tier: 1 },
      { id: 40, code: "BR", label: "Brazil", tier: null },
    ],
    countriesPresets: [],
    browsers: [{ id: 2, label: "Opera" }, { id: 4, label: "Safari" }, { id: 8, label: "Chrome" }],
    devices: [
      { id: 1, label: "Desktop" },
      { id: 4, label: "Smartphone", children: [{ id: 3, label: "iPhone" }] },
    ],
    platformVersions: [{ id: 3, label: "Windows" }, { id: 10, label: "Android" }],
    languages: [{ id: 2, label: "English" }],
    categories: [
      { id: 1001, label: "Adult content (IAB25-3)" },
      { id: 122, label: "News (IAB12)", children: [
        { id: 1567, label: "News general" },
        { id: 1488, label: "Technology news" },
      ] },
      { id: "mainstream", label: "Mainstream" },
    ],
    ages: [],
    subAges: [{ id: 1, label: "Newest", period: "1 day" }, { id: 2, label: "New", period: "2-6 days" }, { id: 3, label: "Medium", period: "7-13 days" }, { id: 4, label: "Old", period: "14+ days" }],
    audiences: [],
    limits: { dayMoneyLimit: 300, commonMoneyLimit: 1000 },
    bidCoefficients: { maxWithoutStatCPC: 65 },
    options: { allowAgeSelection: true, allowGenderSelection: true, showInterests: false, postbackLink: "" },
    folders: [],
    conversionTemplates: [],
    ...overrides,
  };

  const countryMap = new Map<string, number>();
  for (const c of defaultOptions.countries) countryMap.set(c.code.toUpperCase(), c.id);

  return {
    getCampaignOptions: vi.fn().mockResolvedValue(defaultOptions),
    getMaterialOptions: vi.fn().mockResolvedValue({ sizes: [] }),
    resolveCountryIds: vi.fn().mockImplementation(async (codes: string) =>
      codes.split(",").map((s: string) => {
        const id = countryMap.get(s.trim().toUpperCase());
        if (id === undefined) throw new Error(`Unknown country code: ${s.trim()}`);
        return id;
      }),
    ),
    resolveIds: vi.fn().mockImplementation(async (_kind: string, input: string) =>
      input.split(",").map((s: string) => s.trim()),
    ),
    getCountryMap: vi.fn().mockResolvedValue(countryMap),
    getNameResolvers: vi.fn(),
    preload: vi.fn(),
  } as unknown as OptionsRegistry;
}

describe("mapCampaignFields", () => {
  it("maps type string to numeric id", async () => {
    const result = await mapCampaignFields({ type: "push", name: "Test" }, createMockRegistry());
    expect(result.type).toBe(30);
  });

  it("maps pricingModel to cpType", async () => {
    const result = await mapCampaignFields({ type: "push", pricingModel: "cpm" }, createMockRegistry());
    expect(result.cpType).toBe(2);
  });

  it("maps dailyBudget to dayMoneyLimit", async () => {
    const result = await mapCampaignFields({ type: "push", dailyBudget: 100 }, createMockRegistry());
    expect(result.dayMoneyLimit).toBe(100);
  });

  it("maps bid for CPC with leadCost:0", async () => {
    const result = await mapCampaignFields({ type: "push", pricingModel: "cpc", bid: 0.5 }, createMockRegistry());
    expect(result.bids).toEqual([{ bid: 0.5, leadCost: 0, countries: [] }]);
  });

  it("maps bid for CPA target with leadCost only", async () => {
    const result = await mapCampaignFields({ type: "push", pricingModel: "cpa_target", bid: 2.0 }, createMockRegistry());
    expect(result.bids).toEqual([{ leadCost: 2.0, countries: [] }]);
  });

  it("resolves country ISO codes to geoIDs in bids", async () => {
    const result = await mapCampaignFields({ type: "push", bid: 0.01, countries: "US, DE, BR" }, createMockRegistry());
    const bids = result.bids as Array<{ countries: number[] }>;
    expect(bids[0].countries).toEqual([34, 24, 40]);
    expect(result.countries).toBeUndefined();
  });

  it("resolves device names to IDs", async () => {
    const registry = createMockRegistry();
    (registry.resolveIds as ReturnType<typeof vi.fn>).mockResolvedValue([1, 4]);
    const result = await mapCampaignFields({ type: "push", devices: "Desktop,Smartphone" }, registry);
    expect(result.devices).toEqual([1, 4]);
  });

  it("resolves os names to platformVersions IDs", async () => {
    const registry = createMockRegistry();
    (registry.resolveIds as ReturnType<typeof vi.fn>).mockResolvedValue([3, 10]);
    const result = await mapCampaignFields({ type: "push", os: "Windows,Android" }, registry);
    expect(result.platformVersions).toEqual([3, 10]);
  });

  it("builds audiences from include/exclude IDs", async () => {
    const result = await mapCampaignFields({
      type: "push",
      audienceIncludeIds: "1,2,3",
      audienceExcludeIds: "4",
    }, createMockRegistry());
    expect(result.audiences).toEqual({
      mode: 20,
      include: [1, 2, 3],
      exclude: [4],
    });
  });

  it("builds empty audiences when no IDs provided", async () => {
    const result = await mapCampaignFields({ type: "push" }, createMockRegistry());
    expect(result.audiences).toEqual({ mode: 20, include: [], exclude: [] });
  });

  it("applies defaults for missing fields", async () => {
    const result = await mapCampaignFields({ type: "push" }, createMockRegistry());
    expect(result.connectionType).toBe(3);
    expect(result.time).toBeDefined();
    expect(result.timezone).toBe(0);
  });

  it("flattens category tree from options (push-like with mainstream)", async () => {
    const result = await mapCampaignFields({ type: "push" }, createMockRegistry());
    expect(result.categories).toEqual([1001, 122, 1567, 1488, "mainstream"]);
  });

  it("flattens category tree for native-like types (no mainstream alias)", async () => {
    const registry = createMockRegistry({
      categories: [
        { id: 1001, label: "Adult" },
        { id: 128, label: "Health", children: [
          { id: 1564, label: "Medicine general" },
          { id: 1112, label: "Healthcare Goods" },
        ] },
        { id: 132, label: "Cars", children: [
          { id: 1506, label: "Selling a car" },
        ] },
      ],
    });
    const result = await mapCampaignFields({ type: "native" }, registry);
    expect(result.categories).toEqual([1001, 128, 1564, 1112, 132, 1506]);
  });

  it("does not set categories when options returns empty array", async () => {
    const registry = createMockRegistry({ categories: [] });
    const result = await mapCampaignFields({ type: "native" }, registry);
    expect(result.categories).toBeUndefined();
  });

  it("sets all browsers from options as default", async () => {
    const result = await mapCampaignFields({ type: "push" }, createMockRegistry());
    expect(result.browsers).toEqual([2, 4, 8]);
  });

  it("does not override explicitly set fields with defaults", async () => {
    const result = await mapCampaignFields({ type: "push", timezone: 5 }, createMockRegistry());
    expect(result.timezone).toBe(5);
  });

  it("applies push-specific defaults (subAges from options, isNeedSecondPush)", async () => {
    const result = await mapCampaignFields({ type: "push" }, createMockRegistry());
    expect(result.subAges).toEqual([1, 2, 3, 4]);
    expect(result.isNeedSecondPush).toBe(0);
  });

  it("applies inpage_push-specific defaults", async () => {
    const result = await mapCampaignFields({ type: "inpage_push" }, createMockRegistry());
    expect(result.subAges).toEqual([1, 2, 3, 4]);
  });

  it("applies native-specific defaults (gender, age)", async () => {
    const registry = createMockRegistry({ categories: [], ages: [{ id: 1, label: "under 17" }] });
    const result = await mapCampaignFields({ type: "native" }, registry);
    expect(result.gender).toBe(3);
    expect(result.age).toBeNull();
  });

  it("applies banner-specific defaults (gender, age)", async () => {
    const registry = createMockRegistry({ categories: [], ages: [{ id: 1, label: "under 17" }] });
    const result = await mapCampaignFields({ type: "banner" }, registry);
    expect(result.gender).toBe(3);
  });

  it("applies popunder-specific defaults (isPauseAfterModerate)", async () => {
    const result = await mapCampaignFields({ type: "popunder" }, createMockRegistry());
    expect(result.isPauseAfterModerate).toBe(0);
  });

  it("does not apply push defaults to native type", async () => {
    const registry = createMockRegistry({ categories: [], subAges: [] });
    const result = await mapCampaignFields({ type: "native" }, registry);
    expect(result.subAges).toBeUndefined();
    expect(result.isNeedSecondPush).toBeUndefined();
  });

  it("passes through unknown fields", async () => {
    const result = await mapCampaignFields({ type: "push", customField: "value" }, createMockRegistry());
    expect(result.customField).toBe("value");
  });

  it("skips null values", async () => {
    const result = await mapCampaignFields({ type: "push", name: null }, createMockRegistry());
    expect(result).not.toHaveProperty("name");
  });

  it("validates cpType availability and rejects invalid", async () => {
    const registry = createMockRegistry({
      cpTypes: [{ id: 0, label: "CPC" }, { id: 4, label: "CPA Target" }],
    });
    await expect(
      mapCampaignFields({ type: "popunder", pricingModel: "cpm" }, registry),
    ).rejects.toThrow("Pricing model 2 is not available");
  });

  it("uses default postConversion when no postConversion fields provided", async () => {
    const result = await mapCampaignFields({ type: "push" }, createMockRegistry());
    expect(result.postConversion).toEqual({
      audiences: [],
      countFirstConversionOnly: true,
      countLastCampaignOnly: true,
      postClickAttrPriority: true,
      windowLengthPostView: null,
      windowLengthPostClick: null,
    });
  });

  it("builds custom postConversion when any field is provided", async () => {
    const result = await mapCampaignFields({
      type: "push",
      postViewWindow: 24,
      postClickWindow: 48,
      countFirstConversionOnly: false,
      postConversionAudienceIds: "1,3",
    }, createMockRegistry());
    expect(result.postConversion).toEqual({
      audiences: [1, 3],
      countFirstConversionOnly: false,
      countLastCampaignOnly: true,
      postClickAttrPriority: true,
      windowLengthPostView: 24,
      windowLengthPostClick: 48,
    });
  });

  it("does not leak postConversion fields to top-level mapped", async () => {
    const result = await mapCampaignFields({
      type: "push",
      postViewWindow: 12,
      countFirstConversionOnly: true,
    }, createMockRegistry());
    expect(result.postViewWindow).toBeUndefined();
    expect(result.countFirstConversionOnly).toBeUndefined();
    expect(result.postConversionAudienceIds).toBeUndefined();
  });
});
