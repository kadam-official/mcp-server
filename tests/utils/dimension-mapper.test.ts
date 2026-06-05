import {
  resolveMetricIds,
  resolveGroupIds,
  resolveAlias,
  METRIC_ALIASES,
} from "../../src/utils/dimension-mapper.js";
import type { ReportConfig } from "../../src/api/schemas/common.js";

const mockConfig: ReportConfig = {
  groups: {
    time: [{ id: "time_day" }, { id: "time_hour" }, { id: "time_week" }, { id: "time_month" }],
    advertiser: [{ id: "advertiser_campaign" }, { id: "advertiser_ad" }],
    traffic: [{ id: "traffic_region" }, { id: "traffic_browser" }, { id: "traffic_platform" }],
  },
  metrics: {
    finance: [{ id: "finance_moneyOut" }],
    traffic: [{ id: "traffic_clicks" }, { id: "traffic_views" }, { id: "traffic_visits" }],
    advertiser: [{ id: "advertiser_ctr" }, { id: "advertiser_cpc" }, { id: "advertiser_cpm" }],
    conversion: [{ id: "conversion_conversions" }, { id: "conversion_cr" }],
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
