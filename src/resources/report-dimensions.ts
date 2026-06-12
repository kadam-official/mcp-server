export const REPORT_DIMENSIONS_CONTENT = `
Report Dimensions & Metrics for kadam_adv_get_stats / kadam_pub_get_stats:

Advertiser Groupings (groupBy):
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
  Other: trafficback

Publisher Groupings (groupBy):
  Time: day, hour, week, month
  Entities: site, ad_unit, format
  Geo: country, region

Publisher Metrics:
  Basic: revenue, impressions, clicks, ecpm
  Traffic: visits, blockViews, fillRate
`;
