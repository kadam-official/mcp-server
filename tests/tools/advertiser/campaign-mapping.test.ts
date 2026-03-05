import { mapCampaignFields } from "../../../src/tools/advertiser/campaigns.js";

describe("mapCampaignFields", () => {
  it("maps type string to numeric id", () => {
    const result = mapCampaignFields({ type: "push", name: "Test" });
    expect(result.type).toBe(30);
  });

  it("maps pricingModel to cpType", () => {
    const result = mapCampaignFields({ type: "push", pricingModel: "cpm" });
    expect(result.cpType).toBe(2);
  });

  it("maps dailyBudget to dayMoneyLimit", () => {
    const result = mapCampaignFields({ type: "push", dailyBudget: 100 });
    expect(result.dayMoneyLimit).toBe(100);
  });

  it("maps bid for CPC with leadCost:0", () => {
    const result = mapCampaignFields({ type: "push", pricingModel: "cpc", bid: 0.5 });
    expect(result.bids).toEqual([{ bid: 0.5, leadCost: 0, countries: [] }]);
  });

  it("maps bid for CPA target with leadCost only", () => {
    const result = mapCampaignFields({ type: "push", pricingModel: "cpa_target", bid: 2.0 });
    expect(result.bids).toEqual([{ leadCost: 2.0, countries: [] }]);
  });

  it("splits comma-separated countries", () => {
    const result = mapCampaignFields({ type: "push", countries: "US, DE, BR" });
    expect(result.countries).toEqual(["US", "DE", "BR"]);
  });

  it("splits comma-separated devices", () => {
    const result = mapCampaignFields({ type: "push", devices: "desktop,mobile" });
    expect(result.devices).toEqual(["desktop", "mobile"]);
  });

  it("maps os to platforms", () => {
    const result = mapCampaignFields({ type: "push", os: "windows,android" });
    expect(result.platforms).toEqual(["windows", "android"]);
  });

  it("builds audiences from include/exclude IDs", () => {
    const result = mapCampaignFields({
      type: "push",
      audienceIncludeIds: "1,2,3",
      audienceExcludeIds: "4",
    });
    expect(result.audiences).toEqual({
      mode: 20,
      include: [1, 2, 3],
      exclude: [4],
    });
  });

  it("builds empty audiences when no IDs provided", () => {
    const result = mapCampaignFields({ type: "push" });
    expect(result.audiences).toEqual({ mode: 20, include: [], exclude: [] });
  });

  it("applies defaults for missing fields", () => {
    const result = mapCampaignFields({ type: "push" });
    expect(result.connectionType).toBe(3);
    expect(result.categories).toEqual([1001]);
    expect(result.time).toBeDefined();
    expect(result.timezone).toBe(0);
  });

  it("does not override explicitly set fields with defaults", () => {
    const result = mapCampaignFields({ type: "push", timezone: 5 });
    expect(result.timezone).toBe(5);
  });

  it("applies push-specific defaults (subAges, isNeedSecondPush)", () => {
    const result = mapCampaignFields({ type: "push" });
    expect(result.subAges).toEqual([1, 2, 3, 4]);
    expect(result.isNeedSecondPush).toBe(0);
  });

  it("applies inpage_push-specific defaults", () => {
    const result = mapCampaignFields({ type: "inpage_push" });
    expect(result.subAges).toEqual([1, 2, 3, 4]);
  });

  it("applies native-specific defaults (gender, age)", () => {
    const result = mapCampaignFields({ type: "native" });
    expect(result.gender).toBe(3);
    expect(result.age).toBeNull();
  });

  it("applies banner-specific defaults (gender, age)", () => {
    const result = mapCampaignFields({ type: "banner" });
    expect(result.gender).toBe(3);
  });

  it("applies popunder-specific defaults (isPauseAfterModerate)", () => {
    const result = mapCampaignFields({ type: "popunder" });
    expect(result.isPauseAfterModerate).toBe(0);
  });

  it("does not apply push defaults to native type", () => {
    const result = mapCampaignFields({ type: "native" });
    expect(result.subAges).toBeUndefined();
    expect(result.isNeedSecondPush).toBeUndefined();
  });

  it("passes through unknown fields", () => {
    const result = mapCampaignFields({ type: "push", customField: "value" });
    expect(result.customField).toBe("value");
  });

  it("skips null values", () => {
    const result = mapCampaignFields({ type: "push", name: null });
    expect(result).not.toHaveProperty("name");
  });
});
