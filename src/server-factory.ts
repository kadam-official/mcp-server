import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { hasAdvKey, hasPubKey, getConfig } from "./config.js";
import { logger } from "./logger.js";
import { assembleServer } from "./server-assembly.js";
import type { ClientPool } from "./api/client-pool.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require("../package.json") as { version: string };

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

export function createMcpServer(clientPool: ClientPool): McpServer {
  const server = new McpServer(
    {
      name: "@kadam/mcp-server",
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const config = getConfig();
  const advEnabled = hasAdvKey();
  const pubEnabled = hasPubKey();

  // stdio is single-tenant: the env-configured keys are this process's
  // credentials for every tool call. Same assembler as the HTTP transport.
  assembleServer(
    server,
    clientPool,
    { advKey: config.KADAM_ADV_API_KEY, pubKey: config.KADAM_PUB_API_KEY },
    { adv: advEnabled, pub: pubEnabled },
  );

  logger.info(
    {
      advertiserTools: advEnabled ? "enabled" : "no KADAM_ADV_API_KEY",
      publisherTools: pubEnabled ? "enabled" : "no KADAM_PUB_API_KEY",
    },
    "Kadam MCP Server starting",
  );

  return server;
}
