import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import type { FolderRow, FolderView } from "../../api/schemas/advertiser.js";
import { formatEntityList, clampPerPage } from "../../output-formatter.js";
import { extractPagination } from "../../utils/pagination.js";
import { parseCommaSeparatedIds } from "../../utils/status-actions.js";

function formatFolderRow(row: FolderRow, index: number): string {
  const f = row.folder;
  return `${index + 1}. [ID: ${f.id}] "${f.name}" (${f.state?.label ?? f.state?.id}) — ${f.campaignsCount} campaigns (${f.activeCampaignsCount} active)`;
}

function formatFolderView(f: FolderView): string {
  const lines = [
    `Campaign group [ID: ${f.id}] "${f.name}"`,
    `Default: ${f.isDefault ? "yes" : "no"} | Archived: ${f.isArchived ? "yes" : "no"}`,
    `Limits: ${f.limitsEnabled ? "enabled" : "disabled"}`,
  ];
  if (f.limitsEnabled) {
    lines.push(
      `Daily budget: ${f.groupDailyLimit} | Total budget: ${f.groupTotalLimit} | Even distribution: ${f.groupSpendingEvenly ? "yes" : "no"}`,
    );
  }
  return lines.join("\n");
}

const FOLDER_STATUS_ACTION_MAP = {
  activate: "activate",
  pause: "pause",
  archive: "archive",
} as const;

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
        name: "kadam_adv_get_campaign_folder",
        description:
          "Get a single campaign group by ID: name, archived state, budgets and distribution " +
          "(campaign group = the UI term for a folder).",
        product: "advertiser",
        annotations: { title: "Get campaign group", readOnlyHint: true },
      },
      {
        id: z.number().describe("Campaign group ID"),
      },
      async (args, ctx) => {
        const folder = await ctx.adv.getCampaignFolder(args.id);
        return formatFolderView(folder);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_campaign_folder",
        description:
          "Partially update a campaign group: rename and/or change budgets and distribution. " +
          "Only the provided fields are changed (campaign group = the UI term for a folder).",
        product: "advertiser",
        annotations: { title: "Update campaign group", readOnlyHint: false },
      },
      {
        id: z.number(),
        name: z.string().min(1).max(50).optional().describe("New campaign group name"),
        limitsEnabled: z.boolean().optional(),
        totalBudget: z.number().optional(),
        dailyBudget: z.number().optional(),
        evenDistribution: z.boolean().optional(),
      },
      async (args, ctx) => {
        const { id, ...rest } = args;
        const data: Record<string, unknown> = {};
        if (rest.name != null) data.name = rest.name;
        if (rest.totalBudget != null) data.groupTotalLimit = rest.totalBudget;
        if (rest.dailyBudget != null) data.groupDailyLimit = rest.dailyBudget;
        if (rest.evenDistribution != null) data.groupSpendingEvenly = rest.evenDistribution;
        if (rest.limitsEnabled != null) {
          data.limitsEnabled = rest.limitsEnabled;
        } else if (rest.totalBudget != null || rest.dailyBudget != null) {
          data.limitsEnabled = true;
        }
        if (Object.keys(data).length === 0) {
          return `Nothing to update for campaign group #${id}: provide at least one field.`;
        }

        await ctx.adv.updateCampaignFolder(id, data);
        return `Campaign group #${id} updated successfully.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_set_campaign_folder_status",
        description:
          "Bulk action on campaign groups (comma-separated IDs): activate/pause all campaigns in the groups, " +
          "or archive the groups together with their campaigns (campaign group = the UI term for a folder).",
        product: "advertiser",
        annotations: { title: "Set campaign group status", idempotentHint: true },
      },
      {
        ids: z.string().min(1).describe("Comma-separated campaign group IDs, e.g. '15,16'"),
        action: z.enum(["activate", "pause", "archive"]),
      },
      async (args, ctx) => {
        const parsedIds = parseCommaSeparatedIds(args.ids);
        const action = FOLDER_STATUS_ACTION_MAP[args.action];
        const result = await ctx.adv.setCampaignFolderStatus(parsedIds, action);
        const lines = result.folders.map(
          (f) =>
            `#${f.id}: ${f.success ? "ok" : "FAILED"} (${f.campaignsProcessed}/${f.campaignsTotal} campaigns)`,
        );
        return [
          `${args.action}: ${result.processedFolders}/${result.totalFolders} campaign groups fully processed`,
          ...lines,
        ].join("\n");
      },
    );
  },
};
