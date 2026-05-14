import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import {
  formatEntityList,
  clampPerPage,
  formatNumber,
} from "../../output-formatter.js";
import type { AdUnitRow } from "../../api/schemas/publisher.js";

const AD_UNIT_STATUS_ACTION_MAP = {
  active: "activate",
  paused: "deactivate",
  archived: "delete",
  restored: "restore",
} as const;

const STATE_LABEL: Record<number, string> = {
  0: "inactive",
  1: "active",
};

function formatAdUnitRow(u: AdUnitRow, index: number): string {
  const stateLabel = STATE_LABEL[u.state] ?? `state:${u.state}`;
  return `${index + 1}. [ID: ${u.id}] "${u.name}" (${u.type}, ${stateLabel}) | Views: ${formatNumber(u.views)} | Clicks: ${formatNumber(u.clicks)} | Income: ${u.income}`;
}

export const adUnitsModule: ToolModule = {
  product: "publisher",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_pub_list_ad_units",
        description:
          "Lists ad units for a site. Optionally filter by format: native, banner, push, popunder, inpagepush.",
        product: "publisher",
        annotations: { title: "List ad units", readOnlyHint: true },
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
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);
        const AD_UNIT_TYPE_MAP: Record<string, number> = {
          native: 0,
          banner: 10,
          push: 20,
          popunder: 30,
          inpagepush: 100,
        };
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
        const res = await ctx.pub.listAdUnits(args.sourceId, params);
        const totalPages = perPage > 0 ? Math.ceil(res.totalRows / perPage) : 1;
        return formatEntityList(
          res.rows,
          formatAdUnitRow,
          "Ad Units",
          { page: args.page, totalPages, totalRows: res.totalRows },
        );
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_set_ad_unit_status",
        description:
          "Changes ad unit status. active=resume, paused=stop, archived=delete, restored=restore.",
        product: "publisher",
        annotations: { title: "Set ad unit status", idempotentHint: true },
      },
      {
        id: z.number(),
        status: z.enum(["active", "paused", "archived", "restored"]),
      },
      async (args, ctx) => {
        const action = AD_UNIT_STATUS_ACTION_MAP[args.status];
        await ctx.pub.setAdUnitStatus(args.id, action);
        return `Ad unit #${args.id} set to ${args.status}.`;
      },
    );
  },
};
