import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import {
  formatMaterialBulkResult,
  parseCommaSeparatedIds,
  requireUniqueIds,
} from "../../utils/status-actions.js";
import type { CreativeCopyResult } from "../../api/schemas/advertiser.js";

function formatCopyResult(result: CreativeCopyResult, targetCount: number): string {
  const lines = [
    `${result.successful} copies created across ${targetCount} campaign(s), ${result.failed} refused.`,
  ];

  const pairs = Object.entries(result.ids);
  if (pairs.length > 0) {
    lines.push(
      `Source -> copy: ${pairs.map(([from, to]) => `#${from} -> #${to}`).join(", ")}` +
        (targetCount > 1 ? " (one target campaign only — use it as a sample)" : ""),
    );
  }
  if (result.errors.length > 0) {
    lines.push(`Refused: ${result.errors.join("; ")}`);
  }
  lines.push("Copies start paused and go through moderation before they can spend.");

  return lines.join("\n");
}

export const creativeActionsModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_copy_creatives",
        description:
          "Copy creatives into other campaigns. Every creative is copied into every target campaign, " +
          "so 2 creatives and 2 targets produce 4 copies. Target campaigns must have the same ad format " +
          "as the source, and each landing URL must stay on its target campaign's domain. " +
          "Originals are untouched; copies start paused and go through moderation.",
        product: "advertiser",
        annotations: { title: "Copy creatives", readOnlyHint: false },
      },
      {
        creativeIds: z
          .string()
          .describe("Comma-separated creative IDs. All must be the same format"),
        targets: z
          .array(
            z.object({
              campaignId: z.number().int().positive(),
              url: z
                .string()
                .describe("Landing URL for the copies; must be on the target campaign's domain"),
            }),
          )
          .min(1)
          .max(50)
          .describe("Campaigns to copy into, each with the landing URL its copies will use"),
        pauseAfterModeration: z
          .boolean()
          .default(true)
          .describe("Keep the copies paused after they pass moderation so they can be reviewed"),
      },
      async (args, ctx) => {
        const ids = parseCommaSeparatedIds(args.creativeIds);
        requireUniqueIds(ids, "Creative");

        const targetIds = args.targets.map((t) => t.campaignId);
        requireUniqueIds(targetIds, "Target campaign");

        const result = await ctx.adv.copyCreatives(ids, args.targets, args.pauseAfterModeration);

        return formatCopyResult(result, args.targets.length);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_move_creatives",
        description:
          "Move creatives to another campaign of the same ad format and the same pricing model. " +
          "This is not a silent reparenting: the moved creatives lose their creative-level geo bids, " +
          "are paused and go back to moderation. If any creative or the target campaign fails the checks, " +
          "nothing moves. To keep the originals in place, copy instead.",
        product: "advertiser",
        annotations: { title: "Move creatives", readOnlyHint: false },
      },
      {
        creativeIds: z.string().describe("Comma-separated creative IDs to move"),
        campaignId: z
          .number()
          .int()
          .positive()
          .describe("Target campaign: same ad format and same pricing model as the current one"),
        url: z
          .string()
          .describe(
            "Landing URL the moved creatives will use; must be on the target campaign's domain",
          ),
      },
      async (args, ctx) => {
        const ids = parseCommaSeparatedIds(args.creativeIds);
        requireUniqueIds(ids, "Creative");

        const result = await ctx.adv.moveCreatives(ids, args.campaignId, args.url);

        return [
          formatMaterialBulkResult(result, `moved to campaign #${args.campaignId}`),
          "Moved creatives are paused and back on moderation, and their per-geo bids are gone.",
        ].join("\n");
      },
    );
  },
};
