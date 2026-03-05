import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import * as api from "../../api/partners-client.js";
import {
  formatEntityList,
  clampPerPage,
} from "../../output-formatter.js";
import type { ApiListResponse } from "../../types/common.js";
import { extractPagination } from "../../utils/pagination.js";

interface FolderRow {
  folder: {
    id: number;
    name: string;
    state: { id: string; label: string };
    campaignsCount: number;
    activeCampaignsCount: number;
  };
  views: string;
  clicks: string;
  moneyOut: string;
}

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
          "List advertiser campaign folders with pagination. Optional search by name.",
        product: "advertiser",
        annotations: { readOnlyHint: true },
      },
      {
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        searchQuery: z.string().optional(),
      },
      async (args) => {
        const perPage = clampPerPage(args.perPage);
        const params: Record<string, unknown> = {
          page: args.page,
          perPage,
          ...(args.searchQuery != null && { searchQuery: args.searchQuery }),
        };
        const res = (await api.listCampaignFolders(params)) as ApiListResponse;
        const items = (res.rows ?? []) as FolderRow[];
        const pagination = extractPagination(res);
        return formatEntityList(
          items,
          formatFolderRow,
          "Campaign Folders",
          pagination,
        );
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_campaign_folder",
        description: "Create a new campaign folder. Name must be at least 4 characters.",
        product: "advertiser",
      },
      {
        name: z.string().min(4),
      },
      async (args) => {
        const result = (await api.createCampaignFolder(args.name)) as { id: number };
        return `Folder created: [ID: ${result.id}] "${args.name}"`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_campaign_folder",
        description:
          "Update campaign folder settings: budgets and distribution.",
        product: "advertiser",
      },
      {
        id: z.number(),
        limitsEnabled: z.boolean().optional(),
        totalBudget: z.number().optional(),
        dailyBudget: z.number().optional(),
        evenDistribution: z.boolean().optional(),
      },
      async (args) => {
        const { id, ...rest } = args;
        const data: Record<string, unknown> = {};
        if (rest.totalBudget != null) data.groupTotalLimit = rest.totalBudget;
        if (rest.dailyBudget != null) data.groupDailyLimit = rest.dailyBudget;
        if (rest.evenDistribution != null)
          data.groupSpendingEvenly = rest.evenDistribution;
        data.limitsEnabled = rest.limitsEnabled ?? (rest.totalBudget != null || rest.dailyBudget != null);

        await api.updateCampaignFolder(id, data);
        return `Folder #${id} updated successfully.`;
      },
    );
  },
};
