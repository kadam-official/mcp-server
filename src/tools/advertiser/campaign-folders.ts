import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import type { FolderRow } from "../../api/schemas/advertiser.js";
import { formatEntityList, clampPerPage } from "../../output-formatter.js";
import { extractPagination } from "../../utils/pagination.js";

function formatFolderRow(row: FolderRow, index: number): string {
  const f = row.folder;
  return `${index + 1}. [ID: ${f.id}] "${f.name}" (${f.state?.label ?? f.state?.id}) — ${f.campaignsCount} campaigns (${f.activeCampaignsCount} active)`;
}

export const campaignFoldersModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_list_campaign_folders",
        description:
          "List advertiser campaign groups with pagination. Optional search by name. " +
          "A campaign group (called 'campaign group' / 'Группа кампаний' in the Kadam UI) is the same entity the API/tool calls a folder.",
        product: "advertiser",
        annotations: { title: "List campaign groups", readOnlyHint: true },
      },
      {
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        searchQuery: z.string().optional(),
      },
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);
        const params: Record<string, unknown> = {
          page: args.page,
          perPage,
          ...(args.searchQuery != null && { searchQuery: args.searchQuery }),
        };
        const res = await ctx.adv.listCampaignFolders(params);
        const items = res.rows ?? [];
        const pagination = extractPagination(res);
        return formatEntityList(items, formatFolderRow, "Campaign groups", pagination);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_campaign_folder",
        description:
          "Create a new campaign group (called 'campaign group' / 'Группа кампаний' in the Kadam UI; API term: folder).",
        product: "advertiser",
        annotations: { title: "Create campaign group", readOnlyHint: false },
      },
      {
        name: z
          .string()
          .min(1)
          .max(50)
          .describe("Campaign group name (1-50 characters, e.g. 'SA', 'US campaigns')"),
      },
      async (args, ctx) => {
        const result = await ctx.adv.createCampaignFolder(args.name);
        return `Campaign group created: [ID: ${result.id}] "${args.name}"`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_campaign_folder",
        description:
          "Update campaign group settings: budgets and distribution (campaign group = the UI term for a folder).",
        product: "advertiser",
        annotations: { title: "Update campaign group", readOnlyHint: false },
      },
      {
        id: z.number(),
        limitsEnabled: z.boolean().optional(),
        totalBudget: z.number().optional(),
        dailyBudget: z.number().optional(),
        evenDistribution: z.boolean().optional(),
      },
      async (args, ctx) => {
        const { id, ...rest } = args;
        const data: Record<string, unknown> = {};
        if (rest.totalBudget != null) data.groupTotalLimit = rest.totalBudget;
        if (rest.dailyBudget != null) data.groupDailyLimit = rest.dailyBudget;
        if (rest.evenDistribution != null) data.groupSpendingEvenly = rest.evenDistribution;
        data.limitsEnabled =
          rest.limitsEnabled ?? (rest.totalBudget != null || rest.dailyBudget != null);

        await ctx.adv.updateCampaignFolder(id, data);
        return `Campaign group #${id} updated successfully.`;
      },
    );
  },
};
