import type { ReportConfig } from "../api/schemas/common.js";
import type { ReportConfigGroup, ReportConfigMetric } from "../api/schemas/common.js";

const METRIC_ALIASES: Record<string, string> = {
  spend: "finance_moneyOut",
  spending: "finance_moneyOut",
  cost: "finance_moneyOut",
  money: "finance_moneyOut",
  clicks: "traffic_clicks",
  views: "traffic_views",
  impressions: "traffic_views",
  visits: "traffic_visits",
  ctr: "advertiser_ctr",
  cpc: "advertiser_cpc",
  cpm: "advertiser_cpm",
  cpa: "advertiser_cpa",
  conversions: "conversion_conversions",
  holds: "conversion_holds",
  rejects: "conversion_rejects",
  cr: "conversion_cr",
  roi: "advertiser_ROI",
  income: "advertiser_income",
  trafficback: "traffic_trafficback",
};

const GROUP_ALIASES: Record<string, string> = {
  day: "time_day",
  hour: "time_hour",
  week: "time_week",
  month: "time_month",
  campaign: "advertiser_campaign",
  creative: "advertiser_ad",
  country: "traffic_region",
  region: "traffic_region",
  browser: "traffic_browser",
  os: "traffic_platform",
  platform: "traffic_platform",
  device: "traffic_device",
  format: "traffic_format",
  site: "traffic_macros",
  isp: "traffic_isp",
  city: "traffic_city",
  connection: "traffic_connectionType",
  language: "traffic_browserLanguage",
};

function flattenConfig(
  config: Record<string, (ReportConfigGroup | ReportConfigMetric)[]>,
): Set<string> {
  const ids = new Set<string>();
  for (const items of Object.values(config)) {
    for (const item of items) ids.add(item.id);
  }
  return ids;
}

export function resolveMetricIds(
  names: string | undefined,
  config: ReportConfig,
): string[] {
  if (!names?.trim()) return [];
  const available = flattenConfig(config.metrics);
  return names
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .map((name) => METRIC_ALIASES[name] ?? name)
    .filter((id) => available.has(id));
}

export function resolveGroupIds(
  names: string | undefined,
  config: ReportConfig,
): string[] {
  if (!names?.trim()) return [];
  const available = flattenConfig(config.groups);
  return names
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .map((name) => GROUP_ALIASES[name] ?? name)
    .filter((id) => available.has(id));
}
