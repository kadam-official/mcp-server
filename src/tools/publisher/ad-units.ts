import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import * as api from "../../api/pub-client.js";
import {
  formatEntityList,
  clampPerPage,
  formatNumber,
  formatCurrency,
} from "../../output-formatter.js";
import { AD_UNIT_TYPE_MAP, AD_UNIT_TYPE_NAME } from "../../types/publisher.js";
import type { AdUnit } from "../../types/publisher.js";
import type { ApiListResponse } from "../../types/common.js";
import { extractPagination } from "../../utils/pagination.js";

const AD_UNIT_STATUS_ACTION_MAP = {
  active: "activate",
  paused: "deactivate",
  archived: "delete",
  restored: "restore",
} as const;

function formatAdUnitRow(u: AdUnit, index: number): string {
  const typeName = AD_UNIT_TYPE_NAME[u.type] ?? `Type ${u.type}`;
  const impressions = u.impressions ?? 0;
  const clicks = u.clicks ?? 0;
  const revenue = u.revenue ?? 0;
  return `${index + 1}. [ID: ${u.id}] "${u.name}" (${typeName}, ${u.status}) | Impressions: ${formatNumber(impressions)} | Clicks: ${formatNumber(clicks)} | Revenue: ${formatCurrency(revenue)}`;
}

export const adUnitsModule: ToolModule = {
  product: "publisher",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_pub_list_ad_units",
        description:
          "Lists ad units for a site. Filter by format: native, banner, push, popunder, inpagepush.",
        product: "publisher",
        annotations: { readOnlyHint: true },
      },
      {
        sourceId: z.number(),
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        showArchived: z.boolean().optional().default(false),
        searchQuery: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        timezone: z.number().optional(),
        adFormat: z
          .enum(["native", "banner", "push", "popunder", "inpagepush"])
          .optional(),
        sortField: z.string().optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
      },
      async (args) => {
        const perPage = clampPerPage(args.perPage);
        const params: Record<string, unknown> = {
          page: args.page,
          perPage,
          showArchived: args.showArchived,
          ...(args.searchQuery != null && { searchQuery: args.searchQuery }),
          ...(args.dateFrom != null && { dateFrom: args.dateFrom }),
          ...(args.dateTo != null && { dateTo: args.dateTo }),
          ...(args.timezone != null && { timezone: args.timezone }),
          ...(args.adFormat != null && {
            type: AD_UNIT_TYPE_MAP[args.adFormat] ?? args.adFormat,
          }),
          ...(args.sortField != null && { sortField: args.sortField }),
          ...(args.sortOrder != null && { sortOrder: args.sortOrder }),
        };
        const res = (await api.listAdUnits(args.sourceId, params)) as ApiListResponse;
        const items = (res.data ?? []) as AdUnit[];
        const pagination = extractPagination(res);
        return formatEntityList(
          items,
          formatAdUnitRow,
          "Ad Units",
          pagination,
        );
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_set_ad_unit_status",
        description:
          "Changes ad unit status. active=resume, paused=stop, archived=delete, restored=restore.",
        product: "publisher",
        annotations: { idempotentHint: true },
      },
      {
        id: z.number(),
        status: z.enum(["active", "paused", "archived", "restored"]),
      },
      async (args) => {
        const action = AD_UNIT_STATUS_ACTION_MAP[args.status];
        await api.setAdUnitStatus(args.id, action);
        return `Ad unit #${args.id} set to ${args.status}.`;
      },
    );
  },
};
