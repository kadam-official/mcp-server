import type { ServerProducts } from "../types/products.js";

const ADV_DIMENSIONS = `Advertiser Groupings (groupBy):
  Time: day, hour, week, month
  Entities: campaign, campaign_name, creative, campaign_group (a.k.a. folder), payment_model
  Status: campaign_status, creative_status
  Geo: country, region, subdivision, city
  Traffic: site, device, devicetype, os, os_version, browser, language, connection, format, push_type, isp, category

Advertiser Metrics:
  Basic: spend, impressions/views, clicks, ctr
  Cost/efficiency: cpc, cpm, cpa, cpl, epc, epl
  Revenue: income (a.k.a. earned/profit), roi
  Conversion: conversions, holds, rejects, cr
  Post-view/click: pv_conversions, pv_cpa, pc_conversions, pc_cpa, total_conversions, total_cpa
  Other: trafficback`;

const PUB_DIMENSIONS = `Publisher Groupings (groupBy):
  Time: day, hour, week, month
  Entities: site, ad_unit, format
  Geo: country, region

Publisher Metrics:
  Basic: revenue, impressions, clicks, ecpm
  Traffic: visits, blockViews, fillRate`;

const ADV_BLOCK = `Report Dimensions & Metrics for kadam_adv_get_stats:

${ADV_DIMENSIONS}`;

const PUB_BLOCK = `Report Dimensions & Metrics for kadam_pub_get_stats:

${PUB_DIMENSIONS}`;

/** Cabinet-scoped report-dimensions content (combined only when both products are active). */
export function buildReportDimensions(products: ServerProducts): string {
  const parts: string[] = [];
  if (products.adv) parts.push(ADV_BLOCK);
  if (products.pub) parts.push(PUB_BLOCK);
  return `\n${parts.join("\n\n")}\n`;
}
