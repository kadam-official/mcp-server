import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerOptimizeSitesPrompt(server: McpServer): void {
  server.prompt(
    "kadam_optimize_sites",
    "Analyze site performance and suggest blacklisting underperforming sites",
    {
      campaignId: z.string().describe("Campaign ID to optimize"),
      minClicks: z.string().default("100").describe("Minimum clicks for a site to be evaluated"),
      maxCPA: z.string().describe("Maximum acceptable CPA in dollars"),
    },
    async ({ campaignId, minClicks, maxCPA }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Analyze site performance for campaign #${campaignId} and suggest optimization.

Criteria:
- Only evaluate sites with at least ${minClicks} clicks (statistically significant)
- Flag sites with CPA > $${maxCPA} as underperforming
- Flag sites with 0 conversions but significant spend as wasteful

Steps:
1. Get site statistics:
   Call kadam_adv_get_stats with reportType "sites", campaignIds "${campaignId}", sortBy "spend", perPage 100

2. Analyze the data:
   - Separate sites into: good (CPA < $${maxCPA}), borderline (CPA near $${maxCPA}), bad (CPA > $${maxCPA} or 0 conversions with spend)
   - Calculate total wasted spend on bad sites

3. Present findings:
   Show three categories:
   - TOP PERFORMERS: sites with best CPA (suggest increasing bids)
   - BORDERLINE: sites near the CPA threshold (monitor)
   - BLACKLIST CANDIDATES: sites exceeding CPA or wasting budget

4. Ask for confirmation before taking action.`,
          },
        },
      ],
    }),
  );
}
