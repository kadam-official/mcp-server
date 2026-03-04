import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLaunchCampaignPrompt } from "./launch-campaign.js";
import { registerCampaignPerformancePrompt } from "./campaign-performance.js";
import { registerOptimizeSitesPrompt } from "./optimize-sites.js";
import { registerAccountOverviewPrompt } from "./account-overview.js";

export function registerPrompts(server: McpServer): void {
  registerLaunchCampaignPrompt(server);
  registerCampaignPerformancePrompt(server);
  registerOptimizeSitesPrompt(server);
  registerAccountOverviewPrompt(server);
}
