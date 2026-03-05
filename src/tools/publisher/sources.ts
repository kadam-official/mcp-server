import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import * as api from "../../api/pub-client.js";
import {
  formatEntityList,
  clampPerPage,
  formatNumber,
  formatCurrency,
  formatSingleEntity,
} from "../../output-formatter.js";
import type { Source } from "../../types/publisher.js";
import type { ApiListResponse } from "../../types/common.js";
import { extractPagination } from "../../utils/pagination.js";

const STATUS_ACTION_MAP = {
  active: "activate",
  paused: "deactivate",
  archived: "archive",
  unarchived: "un-archive",
} as const;

function formatSourceRow(s: Source, index: number): string {
  const impressions = s.impressions ?? 0;
  const revenue = s.revenue ?? 0;
  return `${index + 1}. [ID: ${s.id}] "${s.name}" (${s.status}) URL: ${s.url} | Impressions: ${formatNumber(impressions)} | Revenue: ${formatCurrency(revenue)}`;
}

export const sourcesModule: ToolModule = {
  product: "publisher",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_pub_list_sources",
        description:
          "List publisher sites with pagination. Filter by search, dates, or archived status.",
        product: "publisher",
        annotations: { readOnlyHint: true },
      },
      {
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        searchQuery: z.string().min(2).optional(),
        showArchived: z.boolean().optional().default(false),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        timezone: z.number().optional(),
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
          ...(args.sortField != null && { sortField: args.sortField }),
          ...(args.sortOrder != null && { sortOrder: args.sortOrder }),
        };
        const res = (await api.listSources(params)) as ApiListResponse;
        const items = (res.rows ?? []) as Source[];
        const pagination = extractPagination(res);
        return formatEntityList(
          items,
          formatSourceRow,
          "Sources",
          pagination,
        );
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_create_source",
        description:
          "Creates a new publisher site. After creation, the publisher must verify domain ownership. Lifecycle: oninit -> onconfirm -> onstat -> onmoderate -> accepted/deny.",
        product: "publisher",
        annotations: { readOnlyHint: false },
      },
      {
        name: z.string().min(1).max(100),
        url: z.string().url().max(300),
      },
      async (args) => {
        const source = (await api.createSource({ name: args.name, url: args.url })) as Source;
        return `Site created: [ID: ${source.id}] "${source.name}" (${source.url}). Status: oninit. Next: verify domain ownership.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_get_source",
        description: "Get a single publisher site by ID.",
        product: "publisher",
        annotations: { readOnlyHint: true },
      },
      {
        id: z.number(),
      },
      async (args) => {
        const source = (await api.getSource(args.id)) as Source;
        return formatSingleEntity(`Source #${source.id}`, [
          ["ID", String(source.id)],
          ["Name", source.name],
          ["URL", source.url],
          ["Status", source.status],
          ["State", source.state],
          ["Impressions", String(source.impressions ?? 0)],
          ["Clicks", String(source.clicks ?? 0)],
          ["Revenue", source.revenue != null ? formatCurrency(source.revenue) : undefined],
          ["Places Count", source.placesCount != null ? String(source.placesCount) : undefined],
        ]);
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_update_source",
        description: "Update an existing publisher site. Pass id and optional name.",
        product: "publisher",
        annotations: { readOnlyHint: false },
      },
      {
        id: z.number(),
        name: z.string().optional(),
      },
      async (args) => {
        const { id, name } = args;
        await api.updateSource(id, name != null ? { name } : {});
        return `Site #${id} updated successfully.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_set_source_status",
        description:
          "Changes site status. active=resume ads, paused=stop ads, archived=remove from list, unarchived=restore.",
        product: "publisher",
        annotations: { idempotentHint: true },
      },
      {
        id: z.number(),
        status: z.enum(["active", "paused", "archived", "unarchived"]),
      },
      async (args) => {
        const action = STATUS_ACTION_MAP[args.status];
        await api.setSourceStatus(args.id, action);
        return `Site #${args.id} set to ${args.status}.`;
      },
    );
  },
};
