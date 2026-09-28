import {
  resolveMetricIds,
  resolveGroupIds,
  resolveMetrics,
  resolveGroups,
  resolveAlias,
  describeMetrics,
  describeGroups,
  METRIC_ALIASES,
} from "../../src/utils/dimension-mapper.js";
import type { ReportConfig } from "../../src/api/schemas/common.js";

const mockConfig: ReportConfig = {
  groups: {
    time: [{ id: "time_day" }, { id: "time_hour" }, { id: "time_week" }, { id: "time_month" }],
    advertiser: [
      { id: "advertiser_campaign" },
      { id: "advertiser_ad" },
      { id: "advertiser_campaignGroup" },
      { id: "advertiser_campaignName" },
    ],
    traffic: [
      { id: "traffic_region" },
      { id: "traffic_browser" },
      { id: "traffic_platform" },
      { id: "traffic_platformVersion" },
    ],
  },
  metrics: {
    finance: [{ id: "finance_moneyOut" }],
    traffic: [{ id: "traffic_clicks" }, { id: "traffic_views" }, { id: "traffic_visits" }],
    advertiser: [
      { id: "advertiser_ctr" },
      { id: "advertiser_cpc" },
      { id: "advertiser_cpm" },
      { id: "advertiser_cpl" },
      { id: "advertiser_epl" },
      { id: "advertiser_epc" },
      { id: "advertiser_income" },
      { id: "advertiser_unaliased" },
    ],
    conversion: [
      { id: "conversion_conversions" },
      { id: "conversion_cr" },
      { id: "conversion_pvConversions" },
    ],
  },
};

describe("resolveAlias", () => {
  it("resolves a known alias to its internal ID", () => {
    expect(resolveAlias("spend", METRIC_ALIASES)).toBe("finance_moneyOut");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveAlias("  Spend  ", METRIC_ALIASES)).toBe("finance_moneyOut");
    expect(resolveAlias("CLICKS", METRIC_ALIASES)).toBe("traffic_clicks");
  });

  it("returns the original name when no alias matches", () => {
    expect(resolveAlias("finance_moneyOut", METRIC_ALIASES)).toBe("finance_moneyOut");
    expect(resolveAlias("unknown_metric", METRIC_ALIASES)).toBe("unknown_metric");
  });

  it("works with a custom alias map", () => {
    const custom = { foo: "bar_baz" };
    expect(resolveAlias("foo", custom)).toBe("bar_baz");
    expect(resolveAlias("missing", custom)).toBe("missing");
  });
});

describe("resolveMetricIds", () => {
  it("resolves human-readable aliases to internal IDs", () => {
    expect(resolveMetricIds("spend,clicks,ctr", mockConfig)).toEqual([
      "finance_moneyOut",
      "traffic_clicks",
      "advertiser_ctr",
    ]);
  });

  it("passes through already-qualified IDs (case-sensitive match)", () => {
    expect(resolveMetricIds("traffic_clicks", mockConfig)).toEqual(["traffic_clicks"]);
  });

  it("filters out unknown metrics", () => {
    expect(resolveMetricIds("spend,unknown_metric,clicks", mockConfig)).toEqual([
      "finance_moneyOut",
      "traffic_clicks",
    ]);
  });

  it("returns empty array for empty/undefined input", () => {
    expect(resolveMetricIds(undefined, mockConfig)).toEqual([]);
    expect(resolveMetricIds("", mockConfig)).toEqual([]);
    expect(resolveMetricIds("  ", mockConfig)).toEqual([]);
  });

  it("handles case-insensitive aliases", () => {
    expect(resolveMetricIds("Spend,CLICKS", mockConfig)).toEqual([
      "finance_moneyOut",
      "traffic_clicks",
    ]);
  });
});

describe("resolveGroupIds", () => {
  it("resolves human-readable aliases to internal IDs", () => {
    expect(resolveGroupIds("day,campaign,country", mockConfig)).toEqual([
      "time_day",
      "advertiser_campaign",
      "traffic_region",
    ]);
  });

  it("passes through already-qualified IDs", () => {
    expect(resolveGroupIds("time_day", mockConfig)).toEqual(["time_day"]);
  });

  it("filters out unknown groups", () => {
    expect(resolveGroupIds("day,nonexistent", mockConfig)).toEqual(["time_day"]);
  });

  it("returns empty array for empty/undefined input", () => {
    expect(resolveGroupIds(undefined, mockConfig)).toEqual([]);
    expect(resolveGroupIds("", mockConfig)).toEqual([]);
  });
});

describe("resolveMetrics / resolveGroups (report unknowns)", () => {
  it("resolves the new advertiser metric aliases", () => {
    expect(resolveMetricIds("cpl,epl,epc", mockConfig)).toEqual([
      "advertiser_cpl",
      "advertiser_epl",
      "advertiser_epc",
    ]);
  });

  it("maps earned/profit to advertiser_income and pv_conversions to its id", () => {
    expect(resolveMetricIds("earned", mockConfig)).toEqual(["advertiser_income"]);
    expect(resolveMetricIds("profit", mockConfig)).toEqual(["advertiser_income"]);
    expect(resolveMetricIds("pv_conversions", mockConfig)).toEqual(["conversion_pvConversions"]);
  });

  it("resolveMetrics reports unknown names instead of silently dropping them", () => {
    const r = resolveMetrics("spend,earned,foo,bar", mockConfig);
    expect(r.ids).toEqual(["finance_moneyOut", "advertiser_income"]);
    expect(r.unknown).toEqual(["foo", "bar"]);
  });

  it("resolves campaign group aliases (campaign_group/group/folder) and other new groups", () => {
    expect(resolveGroupIds("campaign_group", mockConfig)).toEqual(["advertiser_campaignGroup"]);
    expect(resolveGroupIds("group", mockConfig)).toEqual(["advertiser_campaignGroup"]);
    expect(resolveGroupIds("folder", mockConfig)).toEqual(["advertiser_campaignGroup"]);
    expect(resolveGroupIds("campaign_name,os_version", mockConfig)).toEqual([
      "advertiser_campaignName",
      "traffic_platformVersion",
    ]);
  });

  it("resolveGroups reports unknown group names", () => {
    const r = resolveGroups("day,nope", mockConfig);
    expect(r.ids).toEqual(["time_day"]);
    expect(r.unknown).toEqual(["nope"]);
  });
});

describe("describeMetrics / describeGroups (config-derived)", () => {
  it("lists friendly aliases present in config and excludes aliases whose target is absent", () => {
    const s = describeMetrics(mockConfig);
    expect(s).toContain("cpl"); // advertiser_cpl present
    expect(s).toContain("income"); // advertiser_income present
    expect(s).not.toContain("revenue"); // finance_moneyIn (publisher) absent from this config
  });

  it("includes available ids that have no alias as raw names", () => {
    expect(describeMetrics(mockConfig)).toContain("advertiser_unaliased");
  });

  it("collapses synonyms to one canonical name per target id", () => {
    const s = describeMetrics(mockConfig);
    expect(s).toContain("spend"); // canonical for finance_moneyOut
    expect(s).not.toContain("spending"); // synonym deduped
    expect(s).not.toContain("earned"); // synonym of income deduped
    expect(s).not.toContain("profit");
  });

  it("describeGroups lists campaign_group and excludes absent-target aliases", () => {
    const s = describeGroups(mockConfig);
    expect(s).toContain("campaign_group");
    expect(s).not.toContain("source"); // webmaster_source (publisher) absent
  });
});

/**
 * Обе витрины делят одну карту алиасов, и «site» в них значит разное: у паба это его
 * сайт, у рекламодателя — площадка показа. Кандидатов перебирает resolveAlias, поэтому
 * проверяются оба кабинета, иначе починка одного молча ломает другой.
 */
describe("cabinet-specific aliases", () => {
  const advConfig: ReportConfig = {
    groups: { traffic: [{ id: "traffic_macros" }, { id: "traffic_region" }] },
    metrics: { finance: [{ id: "finance_moneyOut" }] },
  };

  const pubConfig: ReportConfig = {
    groups: {
      webmaster: [{ id: "webmaster_source" }, { id: "webmaster_block" }],
      traffic: [{ id: "traffic_macros" }],
      mediation: [{ id: "mediation_network" }, { id: "mediation_block" }],
    },
    metrics: {
      finance: [
        { id: "finance_moneyIn" },
        { id: "finance_moneyInKadam" },
        { id: "finance_moneyInMediation" },
      ],
    },
  };

  it('advertiser "site" stays the placement macros', () => {
    expect(resolveGroupIds("site", advConfig)).toEqual(["traffic_macros"]);
  });

  it('publisher "site" is their own website, not the macros', () => {
    expect(resolveGroupIds("site", pubConfig)).toEqual(["webmaster_source"]);
  });

  it('"ad_unit" resolves for a publisher, as the reference promises', () => {
    expect(resolveGroupIds("ad_unit", pubConfig)).toEqual(["webmaster_block"]);
  });

  it("external monetization groupings answer to both names", () => {
    expect(resolveGroupIds("network,external_placement", pubConfig)).toEqual([
      "mediation_network",
      "mediation_block",
    ]);
    expect(resolveGroupIds("mediation_network,mediation_placement", pubConfig)).toEqual([
      "mediation_network",
      "mediation_block",
    ]);
  });

  it("the income split has its own metrics", () => {
    expect(resolveMetricIds("kadam_revenue,external_revenue,revenue", pubConfig)).toEqual([
      "finance_moneyInKadam",
      "finance_moneyInMediation",
      "finance_moneyIn",
    ]);
  });

  it("a name whose candidates this cabinet lacks is reported, not guessed", () => {
    expect(resolveGroups("ad_unit", advConfig).unknown).toEqual(["ad_unit"]);
  });

  it("describeGroups names each id once, using this cabinet's candidate", () => {
    expect(describeGroups(pubConfig)).toContain("site");
    expect(describeGroups(advConfig)).toContain("site");
  });
});
