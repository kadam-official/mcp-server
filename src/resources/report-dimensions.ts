import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerReportDimensionsResource(server: McpServer): void {
  server.resource("report-dimensions", "kadam://reference/report-dimensions", async () => ({
    contents: [
      {
        uri: "kadam://reference/report-dimensions",
        mimeType: "text/plain",
        text: CONTENT,
      },
    ],
  }));
}

const CONTENT = `
Report Dimensions & Metrics for kadam_adv_get_stats / kadam_pub_get_stats:

Advertiser Groupings (groupBy):
  Time: day, hour, week, month
  Entities: campaign, creative, folder
  Geo: country, region, city
  Traffic: site, device, os, browser, ssp

Advertiser Metrics:
  Basic: spend, impressions, clicks, ctr
  Conversion: conversions, cpa, cpl, roi
  Postback: holds, rejects

Publisher Groupings (groupBy):
  Time: day, hour, week, month
  Entities: site, ad_unit, format
  Geo: country, region
  Traffic: device, os, browser

Publisher Metrics:
  Basic: revenue, impressions, clicks, ecpm
  Traffic: visits, blockViews, fillRate
`;
