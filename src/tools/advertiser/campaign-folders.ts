import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import * as api from "../../api/partners-client.js";
import {
  formatEntityList,
  clampPerPage,
  formatNumber,
} from "../../output-formatter.js";
import type { CampaignFolder } from "../../types/advertiser.js";
import type { ApiListResponse } from "../../types/common.js";
import { extractPagination } from "../../utils/pagination.js";

function formatFolderRow(f: CampaignFolder, index: number): string {
  const parts: string[] = [];
  if (f.limitsEnabled) {
    if (f.dailyBudget > 0) parts.push(`${formatNumber(f.dailyBudget)}/day`);
    if (f.totalBudget > 0) parts.push(`${formatNumber(f.totalBudget)} total`);
  }
  const limits = parts.length > 0 ? ` | Budget: ${parts.join(" ")}` : "";
  return `${index + 1}. [ID: ${f.id}] "${f.name}" — ${f.campaignsCount} campaigns${limits}`;
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
        const items = (res.data ?? []) as CampaignFolder[];
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
        const folder = (await api.createCampaignFolder(args.name)) as CampaignFolder;
        return `Folder created: [ID: ${folder.id}] "${folder.name}"`;
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
        if (rest.limitsEnabled != null) data.limitsEnabled = rest.limitsEnabled;
        if (rest.totalBudget != null) data.totalBudget = rest.totalBudget;
        if (rest.dailyBudget != null) data.dailyBudget = rest.dailyBudget;
        if (rest.evenDistribution != null)
          data.isEvenDistribution = rest.evenDistribution;

        await api.updateCampaignFolder(id, data);
        return `Folder #${id} updated successfully.`;
      },
    );
  },
};
