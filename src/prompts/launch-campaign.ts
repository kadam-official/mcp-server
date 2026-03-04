import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerLaunchCampaignPrompt(server: McpServer): void {
  server.prompt(
    "kadam_launch_campaign",
    "Step-by-step guide to create a complete advertising campaign with creatives",
    {
      campaignType: z
        .enum(["push", "inpage_push", "native", "banner", "video", "popunder"])
        .describe("Campaign type to create"),
      targetCountry: z.string().describe("Target country code (e.g. US, DE, RU)"),
      dailyBudget: z.string().describe("Daily budget in dollars (e.g. 50)"),
    },
    async ({ campaignType, targetCountry, dailyBudget }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Create a ${campaignType} campaign targeting ${targetCountry} with $${dailyBudget}/day budget.

Follow these steps in order:

1. Check available campaign folders:
   Call kadam_adv_list_campaign_folders to see existing folders, or create one with kadam_adv_create_campaign_folder if needed.

2. Create the campaign:
   Call kadam_adv_create_campaign with:
   - type: "${campaignType}"
   - countries: "${targetCountry}"
   - dailyBudget: ${dailyBudget}
   - Choose an appropriate pricingModel and bid based on the campaign type.
   Refer to kadam://reference/campaign-types and kadam://reference/pricing-models for guidance.

3. Add creatives:
   Ask me for the creative content (titles, texts, images) appropriate for ${campaignType} campaigns.
   Refer to kadam://reference/creative-formats for required fields.
   Call kadam_adv_create_creative for each creative.

4. Review and activate:
   Once creatives are added, ask me if I want to activate the campaign.
   If yes, call kadam_adv_set_campaign_status with status "active".
   Note: creatives go through moderation (1-24h) before serving.`,
          },
        },
      ],
    }),
  );
}
