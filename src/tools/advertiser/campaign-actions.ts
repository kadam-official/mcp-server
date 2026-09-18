import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { CAMPAIGN_TYPE_MAP, PRICING_MODEL_MAP } from "../../types/advertiser.js";
import type {
  CampaignCopyResult,
  CampaignUrlReplaceResult,
} from "../../api/schemas/advertiser.js";
import { parseCommaSeparatedIds, requireUniqueIds } from "../../utils/status-actions.js";

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

function formatUrlReplaceResult(result: CampaignUrlReplaceResult, dryRun: boolean): string {
  const header = dryRun
    ? `Preview: ${result.totalCampaigns} campaigns and ${result.totalCreatives} creatives would change "${result.find}" -> "${result.replace}". Nothing was written.`
    : `Replaced "${result.find}" -> "${result.replace}" in ${result.totalCampaigns} campaigns and ${result.totalCreatives} creatives.`;

  const lines = [header];

  // A requested campaign with no match is simply absent from the list, so the per-campaign
  // breakdown is the only way to see which IDs the call actually touched.
  for (const campaign of result.campaigns) {
    const change = campaign.oldValue ? ` ${campaign.oldValue} -> ${campaign.newValue ?? ""}` : "";
    lines.push(
      `#${campaign.campaignId} "${campaign.name}": ${campaign.creativesCount} creatives${change}`,
    );
  }
  if (result.campaigns.length === 0) {
    lines.push("No campaign in the batch contains that fragment.");
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

    wrapper.register(
      {
        name: "kadam_adv_bulk_replace_urls",
        description:
          "Find and replace a fragment of the landing URL across several campaigns and their creatives at once. " +
          "Only available to a token that impersonates an administrator; a plain client token is refused with 403. " +
          "The replacement cannot be undone and sends the touched creatives back to moderation, so call it with " +
          "dryRun=true first and show the preview before writing.",
        product: "advertiser",
        annotations: { title: "Bulk replace campaign URLs", destructiveHint: true },
      },
      {
        campaignIds: z.string().min(1).describe("Comma-separated campaign IDs (max 100)"),
        find: z
          .string()
          .min(1)
          .describe("Fragment to look for, or the whole URL when mode is 'full'"),
        replace: z
          .string()
          .describe("Replacement. May be empty in 'substring' mode to cut the fragment out"),
        mode: z
          .enum(["substring", "full"])
          .optional()
          .describe(
            "'substring' replaces the matching fragment, 'full' replaces the whole URL. Default: substring",
          ),
        inCampaignSettings: z
          .boolean()
          .optional()
          .describe("Replace in the campaign's own landing URL. Default: true"),
        inCreatives: z
          .boolean()
          .optional()
          .describe(
            "Replace in the creatives' URLs, which re-moderates them. Default: true. At least one of the two scopes must stay on",
          ),
        creativesFilter: z
          .enum(["active", "all"])
          .optional()
          .describe("Which creatives to touch when inCreatives is on. Default: active"),
        dryRun: z
          .boolean()
          .describe("true reports what would change and writes nothing; false performs it"),
      },
      async (args, ctx) => {
        const ids = parseCommaSeparatedIds(args.campaignIds);
        if (ids.length === 0) {
          throw new Error("At least one valid campaign ID is required.");
        }
        if (ids.length > 100) {
          throw new Error("No more than 100 campaigns can be processed at once.");
        }
        requireUniqueIds(ids);
        if (args.inCampaignSettings === false && args.inCreatives === false) {
          throw new Error(
            "Nothing would be replaced: enable inCampaignSettings, inCreatives, or both.",
          );
        }

        const result = await ctx.adv.bulkReplaceCampaignUrls({
          campaignsIds: ids,
          find: args.find,
          replace: args.replace,
          mode: args.mode ?? "substring",
          inCampaignSettings: args.inCampaignSettings ?? true,
          inCreatives: args.inCreatives ?? true,
          creativesFilter: args.creativesFilter ?? "active",
          dryRun: args.dryRun,
        });

        return formatUrlReplaceResult(result, args.dryRun);
      },
    );
  },
};
