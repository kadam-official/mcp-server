import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerAccountOverviewPrompt(server: McpServer): void {
  server.prompt(
    "kadam_account_overview",
    "Get a complete overview of the account: balance, active campaigns, top performers",
    {},
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Give me a complete overview of my Kadam advertising account.

Steps:
1. Get financial status:
   Call kadam_adv_list_finance_operations with perPage 5 to see recent transactions and current balance.

2. List active campaigns:
   Call kadam_adv_list_campaigns with status "active", sortField "moneyOut", sortOrder "desc" to see top spending campaigns.

3. Get 7-day performance summary:
   Call kadam_adv_get_stats with reportType "custom", groupBy "campaign", period "7days", metrics "spend,clicks,impressions,ctr,conversions,cpa", sortBy "spend"

4. Summarize:
   - Account balance and recent deposits/charges
   - Total active campaigns and total daily budget
   - Top 5 campaigns by spend with key metrics
   - Overall account performance: total spend, clicks, conversions, average CPA
   - Any campaigns that need attention (high CPA, low CTR, depleted budget)`,
          },
        },
      ],
    }),
  );
}
