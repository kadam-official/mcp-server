#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ToolWrapper } from "./middleware/tool-wrapper.js";
import { hasAdvKey, hasPubKey } from "./config.js";
import { logger } from "./logger.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";
import { advToolModules } from "./tools/advertiser/index.js";
import { pubToolModules } from "./tools/publisher/index.js";

const SERVER_INSTRUCTIONS = `\
Kadam MCP Server — Ad network management for advertisers and publishers.

## Key Capabilities
- Advertiser: campaigns, creatives, audiences, statistics, finances
- Publisher: sites, ad units, statistics

## Usage Patterns
- Always check kadam://reference/campaign-types before creating campaigns
- Use kadam_adv_get_stats with reportType for all analytics (custom reports, site breakdown, postbacks)
- Bulk status changes: pass comma-separated IDs to set_*_status tools
- Creatives require campaign context; create campaign first, then add creatives
- For common workflows, use prompts: kadam_launch_campaign, kadam_campaign_performance

## Constraints
- API rate limit: ~10 req/sec per key; server handles retry automatically
- Creatives go through moderation (1-24h) before serving
- Image uploads via URL or local file path; max 5MB
- All list/stats tools: max 100 rows per page; use pagination for large datasets
- Output hard limit: 50KB per response; use filters to narrow results
`;

async function main() {
  const server = new McpServer(
    {
      name: "@kadam/mcp-server",
      version: "0.1.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const wrapper = new ToolWrapper(server);

  registerResources(server);
  registerPrompts(server);

  const advRegistered = hasAdvKey();
  const pubRegistered = hasPubKey();

  for (const mod of advToolModules) {
    mod.register(wrapper);
  }

  for (const mod of pubToolModules) {
    mod.register(wrapper);
  }

  logger.info(
    {
      advertiserTools: advRegistered ? "enabled" : "keys listed but not configured",
      publisherTools: pubRegistered ? "enabled" : "keys listed but not configured",
    },
    "Kadam MCP Server starting",
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Server connected via stdio transport");
}

main().catch((error) => {
  logger.fatal({ error }, "Failed to start server");
  process.exit(1);
});
