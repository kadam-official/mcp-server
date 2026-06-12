import type { ReportConfig } from "../api/schemas/common.js";
import type { ReportConfigGroup, ReportConfigMetric } from "../api/schemas/common.js";

export const METRIC_ALIASES: Record<string, string> = {
  // Advertiser metrics
  spend: "finance_moneyOut",
  spending: "finance_moneyOut",
  cost: "finance_moneyOut",
  clicks: "traffic_clicks",
  views: "traffic_views",
  impressions: "traffic_views",
  visits: "traffic_visits",
  ctr: "advertiser_ctr",
  cpc: "advertiser_cpc",
  cpm: "advertiser_cpm",
  cpa: "advertiser_cpa",
  cpl: "advertiser_cpl",
  epl: "advertiser_epl",
  epc: "advertiser_epc",
  conversions: "conversion_conversions",
  holds: "conversion_holds",
  rejects: "conversion_rejects",
  cr: "conversion_cr",
  roi: "advertiser_ROI",
  income: "advertiser_income",
  earned: "advertiser_income",
  profit: "advertiser_income",
  // Post-view / post-click conversion family
  pv_conversions: "conversion_pvConversions",
  pv_cpa: "conversion_pvConversionsCPA",
  pc_conversions: "conversion_pcConversions",
  pc_cpa: "conversion_pcConversionsCPA",
  total_conversions: "conversion_totalPvPc",
  total_cpa: "conversion_totalPvPcCPA",
  trafficback: "traffic_trafficback",
  // Publisher metrics
  revenue: "finance_moneyIn",
  money: "finance_moneyIn",
  earnings: "finance_moneyIn",
  block_ctr: "webmaster_blockCTR",
  block_cpm: "webmaster_blockCPM",
  pub_cpm: "webmaster_cpm",
  pub_cpc: "webmaster_cpc",
  subscriptions: "traffic_subscriptions",
  unsubscriptions: "traffic_unsubscriptions",
  block_views: "traffic_blockViews",
  viewrate: "traffic_viewRate",
};

const GROUP_ALIASES: Record<string, string> = {
  day: "time_day",
  hour: "time_hour",
  week: "time_week",
  month: "time_month",
  campaign: "advertiser_campaign",
  campaign_name: "advertiser_campaignName",
  creative: "advertiser_ad",
  // Campaign group (called "campaign group" / "Группа кампаний" in the Kadam UI;
  // the legacy API id is advertiser_campaignGroup, hence the "folder" synonym).
  campaign_group: "advertiser_campaignGroup",
  group: "advertiser_campaignGroup",
  folder: "advertiser_campaignGroup",
  campaign_status: "advertiser_campaignStatus",
  creative_status: "advertiser_adStatus",
  payment_model: "advertiser_paymentModel",
  country: "traffic_region",
  region: "traffic_region",
  subdivision: "traffic_subdivision",
  browser: "traffic_browser",
  os: "traffic_platform",
  platform: "traffic_platform",
  os_version: "traffic_platformVersion",
  push_type: "traffic_pushType",
  device: "traffic_device",
  devicetype: "traffic_deviceType",
  format: "traffic_format",
  block_format: "traffic_blockFormat",
  block_size: "traffic_blockSize",
  site: "traffic_macros",
  isp: "traffic_isp",
  city: "traffic_city",
  connection: "traffic_connectionType",
  language: "traffic_browserLanguage",
  // Publisher-specific groups
  source: "webmaster_source",
  block: "webmaster_block",
  subid: "webmaster_subId",
  domain: "traffic_domain",
  pid: "traffic_pid",
  sub_age: "traffic_subsAge",
  category: "traffic_pageCategory",
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

export function resolveAlias(name: string, aliases: Record<string, string>): string {
  return aliases[name.trim().toLowerCase()] ?? name;
}

export interface ResolvedDimensions {
  /** Valid dimension ids, in request order. */
  ids: string[];
  /** Input names that did not resolve to a valid id (reported back, never silently dropped). */
  unknown: string[];
}

function resolveDimensions(
  names: string | undefined,
  aliases: Record<string, string>,
  available: Set<string>,
): ResolvedDimensions {
  if (!names?.trim()) return { ids: [], unknown: [] };
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const raw of names.split(",")) {
    const name = raw.trim();
    if (!name) continue;
    const id = resolveAlias(name, aliases);
    if (available.has(id)) ids.push(id);
    else unknown.push(name);
  }
  return { ids, unknown };
}

export function resolveMetrics(
  names: string | undefined,
  config: ReportConfig,
): ResolvedDimensions {
  return resolveDimensions(names, METRIC_ALIASES, flattenConfig(config.metrics));
}

export function resolveGroups(names: string | undefined, config: ReportConfig): ResolvedDimensions {
  return resolveDimensions(names, GROUP_ALIASES, flattenConfig(config.groups));
}

export function resolveMetricIds(names: string | undefined, config: ReportConfig): string[] {
  return resolveMetrics(names, config).ids;
}

export function resolveGroupIds(names: string | undefined, config: ReportConfig): string[] {
  return resolveGroups(names, config).ids;
}

/**
 * Human-readable list of valid dimension names for THIS config, derived live from
 * the API (not a hardcoded string -> never drifts). One canonical friendly name
 * per target id (the first alias defined wins, so synonyms like spend/spending/cost
 * collapse to "spend"), followed by any available ids that have no alias.
 */
function describeDimensions(
  config: Record<string, (ReportConfigGroup | ReportConfigMetric)[]>,
  aliases: Record<string, string>,
): string {
  const available = flattenConfig(config);
  const aliasTargets = new Set(Object.values(aliases));
  const seenTargets = new Set<string>();
  const friendly: string[] = [];
  for (const [name, id] of Object.entries(aliases)) {
    if (!available.has(id) || seenTargets.has(id)) continue;
    seenTargets.add(id);
    friendly.push(name);
  }
  const rawUncovered = [...available].filter((id) => !aliasTargets.has(id));
  return [...friendly, ...rawUncovered].join(", ");
}

export function describeMetrics(config: ReportConfig): string {
  return describeDimensions(config.metrics, METRIC_ALIASES);
}

export function describeGroups(config: ReportConfig): string {
  return describeDimensions(config.groups, GROUP_ALIASES);
}
