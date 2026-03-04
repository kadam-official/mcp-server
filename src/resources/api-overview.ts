import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerApiOverviewResource(server: McpServer): void {
  server.resource("api-overview", "kadam://reference/api-overview", async () => ({
    contents: [
      {
        uri: "kadam://reference/api-overview",
        mimeType: "text/plain",
        text: CONTENT,
      },
    ],
  }));
}

const CONTENT = `
Kadam Ad Network Overview:

Kadam is an advertising network connecting advertisers with publishers.

Advertisers:
  - Create campaigns (push, native, banner, video, popunder, in-page push)
  - Upload creatives (ads) with images, text, and destination URLs
  - Target by country, device, OS, browser, language, audience segments
  - Set budgets (daily/total), bids (CPC/CPM/CPV/CPA), and schedules
  - Monitor performance via custom reports and per-site statistics
  - Manage audience segments for retargeting

Publishers:
  - Register websites (sources) and verify domain ownership
  - Create ad units (placements) for different ad formats
  - Monitor revenue, impressions, clicks via reports
  - Manage site status (active, paused, archived)

API Authentication:
  - Advertiser API key: partners.kadam.net -> Profile -> API
  - Publisher API key: pub.kadam.net -> Profile -> API
`;
