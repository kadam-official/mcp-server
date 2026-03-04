import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCampaignPerformancePrompt(server: McpServer): void {
  server.prompt(
    "kadam_campaign_performance",
    "Get a formatted performance report for a campaign over a time period",
    {
      campaignId: z.string().describe("Campaign ID to analyze"),
      period: z
        .enum(["today", "yesterday", "7days", "week", "month"])
        .default("7days")
        .describe("Time period for the report"),
    },
    async ({ campaignId, period }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Generate a performance report for campaign #${campaignId} over the last ${period}.

Steps:
1. Get overall campaign stats:
   Call kadam_adv_get_stats with reportType "custom", groupBy "day", campaignIds "${campaignId}", period "${period}", metrics "spend,clicks,impressions,ctr,conversions,cpa"

2. Get per-creative breakdown:
   Call kadam_adv_get_stats with reportType "custom", groupBy "creative", campaignIds "${campaignId}", period "${period}", metrics "spend,clicks,impressions,ctr,conversions,cpa"

3. Get top performing sites:
   Call kadam_adv_get_stats with reportType "sites", campaignIds "${campaignId}", sortBy "spend", perPage 10

4. Summarize findings:
   - Daily trend: is spend/CTR/CPA improving or declining?
   - Best and worst performing creatives
   - Top 5 sites by spend, note any with unusually high CPA
   - Recommendations: pause underperforming creatives, blacklist bad sites`,
          },
        },
      ],
    }),
  );
}
