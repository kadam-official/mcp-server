import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatTable, clampPerPage } from "../../output-formatter.js";
import { resolveMetricIds, resolveGroupIds } from "../../utils/dimension-mapper.js";

function extractCellValue(cell: unknown): string {
  if (cell == null) return "";
  if (typeof cell === "object" && cell !== null && "value" in cell) {
    return String((cell as { value: unknown }).value ?? "");
  }
  return String(cell);
}

export const pubStatsModule: ToolModule = {
  product: "publisher",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_pub_get_stats",
        description:
          "Fetches publisher statistics. Use human-readable names like 'revenue,impressions,clicks' for metrics and 'day,site,country' for groupBy.",
        product: "publisher",
        annotations: { readOnlyHint: true },
      },
      {
        groupBy: z.string(),
        metrics: z.string().optional().default("revenue,impressions,clicks"),
        period: z.enum(["7days", "30days", "today", "yesterday"]).optional().default("7days"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        siteIds: z.string().optional(),
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        sortBy: z.string().optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
      },
      async (args, ctx) => {
        const config = await ctx.pub!.getReportConfig();
        const groupIds = resolveGroupIds(args.groupBy, config);
        if (groupIds.length === 0) {
          return `Unknown groupBy "${args.groupBy}". Try: day, week, month, campaign, country, browser, os, device, site`;
        }

        const metricIds = resolveMetricIds(args.metrics, config);
        if (metricIds.length === 0) {
          return "No valid metrics. Try: spend, clicks, views, impressions, ctr, cpc, cpm, conversions, roi, income";
        }

        const perPage = clampPerPage(args.perPage);
        const params: Record<string, unknown> = {
          groups: groupIds,
          metrics: metricIds,
          period: args.period,
          page: args.page,
          perPage,
          ...(args.dateFrom != null && { dateFrom: args.dateFrom }),
          ...(args.dateTo != null && { dateTo: args.dateTo }),
          ...(args.siteIds != null && { siteIds: args.siteIds }),
          ...(args.sortBy != null && { sortBy: args.sortBy }),
          ...(args.sortOrder != null && { sortOrder: args.sortOrder }),
        };

        const res = await ctx.pub!.getReportData(params);
        const rows = res.rows ?? [];

        if (rows.length === 0) {
          return "No data found for the given filters.";
        }

        const allKeys = new Set<string>();
        for (const row of rows) {
          for (const k of Object.keys(row)) if (k !== "id") allKeys.add(k);
        }
        const headers = [...allKeys];
        const tableRows = rows.map((r) =>
          headers.map((h) => extractCellValue(r[h])),
        );

        const totalPages = res.perPage ? Math.ceil(res.totalRows / res.perPage) : 1;
        return formatTable(
          { headers, rows: tableRows },
          `Publisher Stats (${args.groupBy}, ${args.period}, page ${res.page ?? 1}/${totalPages})`,
        );
      },
    );
  },
};
