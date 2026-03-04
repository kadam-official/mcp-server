import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import * as api from "../../api/pub-client.js";
import { formatTable, clampPerPage } from "../../output-formatter.js";
import type { ReportDataResponse } from "../../types/common.js";
import { cacheOnce } from "../../utils/cache-once.js";
import { findDimensionId, mapToDimensionIds } from "../../utils/dimension-mapper.js";

const getReportConfig = cacheOnce(() => api.getReportConfig());

export const pubStatsModule: ToolModule = {
  product: "publisher",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_pub_get_stats",
        description:
          "Fetches publisher statistics. Accepts human-readable names, server maps to API IDs internally.",
        product: "publisher",
        annotations: { readOnlyHint: true },
      },
      {
        groupBy: z.string(),
        metrics: z.string().optional().default("revenue,impressions,clicks,ecpm"),
        period: z.enum(["7days", "30days", "today", "yesterday"]).optional().default("7days"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        siteIds: z.string().optional(),
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        sortBy: z.string().optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
      },
      async (args) => {
        const config = await getReportConfig();
        const groupById = findDimensionId(config.groups, args.groupBy);
        if (!groupById) {
          const available = (config.groups ?? [])
            .map((g) => g.name ?? g.id)
            .join(", ");
          return `Unknown groupBy "${args.groupBy}". Available: ${available || "none"}`;
        }

        const metricIds = mapToDimensionIds(args.metrics, config.metrics);
        if (metricIds.length === 0) {
          const available = (config.metrics ?? [])
            .map((m) => m.name ?? m.id)
            .join(", ");
          return `No valid metrics. Available: ${available || "none"}`;
        }

        const perPage = clampPerPage(args.perPage);
        const params: Record<string, unknown> = {
          groupBy: groupById,
          metrics: metricIds.join(","),
          period: args.period,
          page: args.page,
          perPage,
          ...(args.dateFrom != null && { dateFrom: args.dateFrom }),
          ...(args.dateTo != null && { dateTo: args.dateTo }),
          ...(args.siteIds != null && { siteIds: args.siteIds }),
          ...(args.sortBy != null && { sortBy: args.sortBy }),
          ...(args.sortOrder != null && { sortOrder: args.sortOrder }),
        };

        const res = (await api.getReportData(params)) as ReportDataResponse;
        const rows = res.data ?? [];
        const totals = res.totals;

        if (rows.length === 0) {
          return "No data found for the given filters.";
        }

        const firstRow = rows[0] as Record<string, unknown>;
        const headers = Object.keys(firstRow) as string[];

        const formatCell = (v: unknown): string => {
          if (v == null) return "—";
          if (typeof v === "number") {
            if (Number.isInteger(v)) return v.toLocaleString("en-US");
            return v.toFixed(2);
          }
          return String(v);
        };

        const tableRows = rows.map((r) =>
          headers.map((h) => formatCell((r as Record<string, unknown>)[h])),
        );

        const tableTotals = totals
          ? headers.map((h) => formatCell((totals as Record<string, unknown>)[h]))
          : undefined;

        return formatTable(
          {
            headers,
            rows: tableRows,
            totals: tableTotals,
          },
          `Publisher Stats (${args.groupBy}, ${args.period})`,
        );
      },
    );
  },
};
