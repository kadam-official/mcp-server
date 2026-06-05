import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import {
  formatEntityList,
  clampPerPage,
  formatNumber,
  formatSingleEntity,
} from "../../output-formatter.js";
import type { SourceRow } from "../../api/schemas/publisher.js";
import type { SourceDetail } from "../../api/schemas/publisher.js";

const STATUS_ACTION_MAP = {
  active: "activate",
  paused: "deactivate",
  archived: "archive",
  unarchived: "un-archive",
} as const;

function formatSourceRow(s: SourceRow, index: number): string {
  return `${index + 1}. [ID: ${s.id}] "${s.name}" (${s.stage}) domain: ${s.domain ?? "—"} | Views: ${formatNumber(s.views)} | Clicks: ${formatNumber(s.clicks)} | Income: ${s.income}`;
}

function formatSourceDetail(source: SourceDetail): string {
  return formatSingleEntity(`Source #${source.id}`, [
    ["ID", String(source.id)],
    ["Name", source.name ?? "—"],
    ["URL", source.url],
    ["State", source.state],
    ["Archive", source.archive ? "Yes" : "No"],
    ["Direct Link", source.isDirectLink ? "Yes" : "No"],
    [
      "Created",
      source.createTime ? new Date(source.createTime * 1000).toISOString().slice(0, 10) : undefined,
    ],
    ["Script Tag", source.scriptTag && source.scriptTag.length > 0 ? source.scriptTag : undefined],
  ]);
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
        annotations: { title: "List publisher sites", readOnlyHint: true },
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
      async (args, ctx) => {
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
        const res = await ctx.pub.listSources(params);
        const totalPages = perPage > 0 ? Math.ceil(res.totalRows / perPage) : 1;
        return formatEntityList(res.rows, formatSourceRow, "Sources", {
          page: args.page,
          totalPages,
          totalRows: res.totalRows,
        });
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_create_source",
        description:
          "Creates a new publisher site. After creation, the publisher must verify domain ownership via the scriptTag meta tag. " +
          "Lifecycle: onconfirm → onstat → onmoderate → accepted/deny.",
        product: "publisher",
        annotations: { title: "Create publisher site", readOnlyHint: false },
      },
      {
        name: z.string().min(1).max(100),
        url: z.string().url().max(300),
      },
      async (args, ctx) => {
        const source = await ctx.pub.createSource({
          name: args.name,
          url: args.url,
        });
        const parts = [
          `Site created: [ID: ${source.id}] "${source.name ?? args.name}" (${source.url}).`,
          `State: ${source.state}.`,
        ];
        if (source.scriptTag) {
          parts.push(`Verification tag: ${source.scriptTag}`);
        }
        return parts.join(" ");
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_get_source",
        description: "Get a single publisher site by ID with detail info.",
        product: "publisher",
        annotations: { title: "Get site details", readOnlyHint: true },
      },
      {
        id: z.number(),
      },
      async (args, ctx) => {
        const source = await ctx.pub.getSource(args.id);
        return formatSourceDetail(source);
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_update_source",
        description: "Update an existing publisher site name.",
        product: "publisher",
        annotations: { title: "Update publisher site", readOnlyHint: false },
      },
      {
        id: z.number(),
        name: z.string().min(1).max(100),
      },
      async (args, ctx) => {
        const updated = await ctx.pub.updateSource(args.id, { name: args.name });
        return formatSourceDetail(updated);
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_set_source_status",
        description:
          "Changes site status. active=resume ads, paused=stop ads, archived=remove from list, unarchived=restore.",
        product: "publisher",
        annotations: { title: "Set site status", idempotentHint: true },
      },
      {
        id: z.number(),
        status: z.enum(["active", "paused", "archived", "unarchived"]),
      },
      async (args, ctx) => {
        const action = STATUS_ACTION_MAP[args.status];
        await ctx.pub.setSourceStatus(args.id, action);
        return `Site #${args.id} set to ${args.status}.`;
      },
    );
  },
};
