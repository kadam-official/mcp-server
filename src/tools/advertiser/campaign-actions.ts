import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { CAMPAIGN_TYPE_MAP, PRICING_MODEL_MAP } from "../../types/advertiser.js";
import type { CampaignCopyResult } from "../../api/schemas/advertiser.js";

/**
 * Campaign operations that act on one campaign at a time and do not fit the
 * create/update/status trio in `campaigns.ts` (which is already over the file-size gate).
 */

function formatCopyResult(result: CampaignCopyResult, name: string): string {
  const lines = [`Campaign copied: [ID: ${result.id}] "${name}"`];

  if (result.successful || result.failed) {
    lines.push(`Creatives: ${result.successful} copied, ${result.failed} skipped`);
  }
  // The campaign exists regardless of what happened to the creatives, so the errors are
  // reported next to the new ID instead of being raised — the caller still needs the ID.
  if (result.failed && result.errors.length) {
    lines.push(`Skipped because: ${result.errors.join("; ")}`);
  }
  if (result.bidsJobId) {
    lines.push(
      `Site bids are being copied in the background (job ${result.bidsJobId}); the new campaign shows them once it finishes.`,
    );
  }

  return lines.join("\n");
}

export const campaignActionsModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_copy_campaign",
        description:
          "Copy a campaign. Targeting, limits and bids are cloned into a new campaign; statistics and spend are not. " +
          "The copy always starts paused and goes through moderation again, so it does not spend until activated. " +
          "Creatives are copied too (all of them by default) and are moderated as new ones.",
        product: "advertiser",
        annotations: { title: "Copy campaign", readOnlyHint: false },
      },
      {
        id: z.number().int().positive().describe("Campaign ID to copy"),
        name: z.string().min(1).max(255).describe("Name for the new campaign"),
        folderId: z.number().int().positive().describe("Campaign group the copy is created in"),
        creatives: z
          .enum(["all", "active", "none"])
          .optional()
          .describe(
            "Which creatives to copy: all of them, only the active ones, or none (campaign settings only). Default: all",
          ),
        pauseAfterModeration: z
          .boolean()
          .optional()
          .describe("Keep the copied creatives paused once moderation passes. Default: true"),
        copyAutorules: z
          .boolean()
          .optional()
          .describe(
            "Copy the campaign's autorules. Ignored for accounts without autorules access and for non-CPC campaigns",
          ),
        copySiteBids: z
          .boolean()
          .optional()
          .describe(
            "Copy per-site bids and multipliers in the background. Ignored without extended-stats access; rejected when the target group belongs to an account with another currency",
          ),
        pricingModel: z
          .enum(["cpc", "cpm", "cpa_target"])
          .optional()
          .describe(
            "Switch the copy to another pricing model. Requires bid + countries, because the new model prices geo differently and the source bids cannot be reused",
          ),
        bid: z
          .number()
          .positive()
          .optional()
          .describe("Bid for the new pricing model (target CPA cost for cpa_target)"),
        countries: z
          .string()
          .optional()
          .describe("Comma-separated ISO country codes the new bid applies to (e.g. 'US,DE')"),
        targetType: z
          .enum(["push", "inpage_push"])
          .optional()
          .describe(
            "Copy into another ad format. Only push <-> inpage_push is supported, and the source campaign must be one of the two",
          ),
      },
      async (args, ctx) => {
        if (args.pricingModel != null && (args.bid == null || args.countries == null)) {
          throw new Error(
            "Changing pricingModel requires bid and countries: the copy is re-priced from scratch, so the source bids are not reused.",
          );
        }
        if (args.pricingModel == null && (args.bid != null || args.countries != null)) {
          throw new Error(
            "bid/countries are only used together with pricingModel. Copy the campaign first, then adjust bids with kadam_adv_update_campaign_bid.",
          );
        }

        const payload: Record<string, unknown> = {
          name: args.name,
          folderId: args.folderId,
          isPauseAfterModer: args.pauseAfterModeration ?? true,
        };

        // The backend copies every creative unless `mode` narrows it down, and skips them
        // entirely when the field is absent — so "none" is the missing field, not a value.
        if (args.creatives !== "none") {
          payload.mode = args.creatives ?? "all";
        }
        if (args.copyAutorules != null) payload.copyAutorules = args.copyAutorules;
        if (args.copySiteBids != null) payload.copyBids = args.copySiteBids;
        if (args.targetType != null) payload.targetCampaignType = CAMPAIGN_TYPE_MAP[args.targetType];

        if (args.pricingModel != null) {
          const cpType = PRICING_MODEL_MAP[args.pricingModel];
          const countries = await ctx.adv.options.resolveCountryIds(args.countries as string);
          payload.paymentModel = cpType;
          payload.bids =
            cpType === 4
              ? [{ leadCost: args.bid, countries }]
              : [{ bid: args.bid, leadCost: 0, countries }];
        }

        const result = await ctx.adv.copyCampaign(args.id, payload);
        return formatCopyResult(result, args.name);
      },
    );
  },
};
