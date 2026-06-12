import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatTable, extractCellValue, clampPerPage } from "../../output-formatter.js";
import {
  resolveMetrics,
  resolveGroups,
  describeMetrics,
  describeGroups,
} from "../../utils/dimension-mapper.js";

function resolveDateRange(
  period: string,
  dateFrom?: string,
  dateTo?: string,
): { dateFrom: string; dateTo: string } {
  if (dateFrom && dateTo) return { dateFrom, dateTo };

  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const dt = dateTo ?? fmt(now);

  const daysMap: Record<string, number> = {
    "7days": 7,
    "30days": 30,
    today: 0,
    yesterday: 1,
  };

  const days = daysMap[period] ?? 7;
  if (period === "today") {
    return { dateFrom: fmt(now), dateTo: fmt(now) };
  }
  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { dateFrom: fmt(y), dateTo: fmt(y) };
  }

  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { dateFrom: dateFrom ?? fmt(from), dateTo: dt };
}

export const pubStatsModule: ToolModule = {
  product: "publisher",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_pub_get_stats",
        description:
          "Fetches publisher statistics. Use human-readable names like 'revenue,impressions,clicks' for metrics and 'day,site,country' for groupBy. " +
          "Unknown names are reported back (not silently ignored); see the report-dimensions resource for the full list.",
        product: "publisher",
        annotations: { title: "Get publisher statistics", readOnlyHint: true },
      },
      {
        groupBy: z.string(),
        metrics: z.string().optional().default("revenue,views,clicks"),
        period: z.enum(["7days", "30days", "today", "yesterday"]).optional().default("7days"),
        dateFrom: z.string().optional().describe("YYYY-MM-DD, overrides period"),
        dateTo: z.string().optional().describe("YYYY-MM-DD, overrides period"),
        siteIds: z.string().optional(),
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        sortBy: z.string().optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
      },
      async (args, ctx) => {
        const config = await ctx.pub.getReportConfig();
        const { ids: groupIds, unknown: unknownGroups } = resolveGroups(args.groupBy, config);
        if (groupIds.length === 0) {
          return `No valid groupBy found. Valid groups: ${describeGroups(config)}`;
        }

        const { ids: metricIds, unknown: unknownMetrics } = resolveMetrics(args.metrics, config);
        if (metricIds.length === 0) {
          return `No valid metrics found. Valid metrics: ${describeMetrics(config)}`;
        }

        // sortBy may be a metric OR a group; resolve through both, warn if neither.
        let resolvedSort: string | undefined;
        let unknownSort: string | undefined;
        if (args.sortBy != null) {
          const sortMetric = resolveMetrics(args.sortBy, config).ids[0];
          const sortGroup = sortMetric ? undefined : resolveGroups(args.sortBy, config).ids[0];
          resolvedSort = sortMetric ?? sortGroup;
          if (resolvedSort == null) unknownSort = args.sortBy;
        }

        const perPage = clampPerPage(args.perPage);
        const { dateFrom, dateTo } = resolveDateRange(args.period, args.dateFrom, args.dateTo);

        const params: Record<string, unknown> = {
          groups: groupIds,
          metrics: metricIds,
          filters: {
            dateFrom,
            dateTo,
            filters: [],
            ...(args.siteIds != null && { siteIds: args.siteIds }),
          },
          page: args.page,
          perPage,
          ...(resolvedSort != null && { sort: { [resolvedSort]: args.sortOrder ?? "desc" } }),
        };

        const res = await ctx.pub.getReportData(params);
        const rows = res.rows ?? [];

        const warnings: string[] = [];
        if (unknownMetrics.length > 0)
          warnings.push(
            `ignored unknown metric(s): ${unknownMetrics.join(", ")}. Valid metrics: ${describeMetrics(config)}.`,
          );
        if (unknownGroups.length > 0)
          warnings.push(
            `ignored unknown groupBy: ${unknownGroups.join(", ")}. Valid groups: ${describeGroups(config)}.`,
          );
        if (unknownSort != null)
          warnings.push(`ignored unknown sortBy: ${unknownSort} (not a valid metric or group).`);
        const notice = warnings.length > 0 ? `Note: ${warnings.join(" ")}\n\n` : "";

        if (rows.length === 0) {
          return `${notice}No data found for ${dateFrom} to ${dateTo}.`;
        }

        const allKeys = new Set<string>();
        for (const row of rows) {
          for (const k of Object.keys(row)) if (k !== "id") allKeys.add(k);
        }
        const headers = [...allKeys];
        const tableRows = rows.map((r) => headers.map((h) => extractCellValue(r[h])));

        const totalPages = res.perPage ? Math.ceil(res.totalRows / res.perPage) : 1;
        return (
          notice +
          formatTable(
            { headers, rows: tableRows },
            `Publisher Stats (${args.groupBy}, ${dateFrom}–${dateTo}, page ${res.page ?? 1}/${totalPages})`,
          )
        );
      },
    );
  },
};
