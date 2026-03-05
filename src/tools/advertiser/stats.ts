import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import * as api from "../../api/partners-client.js";
import {
  formatTable,
  formatEntityList,
  clampPerPage,
} from "../../output-formatter.js";
import type { ReportDataResponse, ApiListResponse } from "../../types/common.js";
import { extractPagination } from "../../utils/pagination.js";
import { cacheOnce } from "../../utils/cache-once.js";
import { resolveMetricIds, resolveGroupIds } from "../../utils/dimension-mapper.js";

const getReportConfig = cacheOnce(() => api.getReportConfig());

function resolvePeriodToDates(
  period: string,
): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const toDate = (d: Date) => d.toISOString().slice(0, 10);

  switch (period) {
    case "today":
      return { dateFrom: toDate(now), dateTo: toDate(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = toDate(y);
      return { dateFrom: s, dateTo: s };
    }
    case "7days":
    case "week": {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { dateFrom: toDate(start), dateTo: toDate(end) };
    }
    case "month": {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { dateFrom: toDate(start), dateTo: toDate(end) };
    }
    default:
      return resolvePeriodToDates("7days");
  }
}

function extractCellValue(cell: unknown): string {
  if (cell == null) return "";
  if (typeof cell === "object" && cell !== null && "value" in cell) {
    return String((cell as { value: unknown }).value ?? "");
  }
  return String(cell);
}

export const statsModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_get_stats",
        description:
          "Unified advertiser statistics. Use reportType to select: 'custom' (default) for full report builder, 'sites' for per-site breakdown, 'postbacks' for conversion logs. For custom reports use human-readable names like 'spend,clicks,impressions,ctr' for metrics and 'day,campaign,country' for groupBy.",
        product: "advertiser",
        annotations: { readOnlyHint: true },
      },
      {
        reportType: z
          .enum(["custom", "sites", "postbacks"])
          .optional()
          .default("custom"),
        period: z
          .enum(["today", "yesterday", "7days", "week", "month"])
          .optional()
          .default("7days"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        sortBy: z.string().optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
        groupBy: z.string().optional(),
        metrics: z.string().optional().default("spend,clicks,impressions,ctr"),
        campaignIds: z.string().optional(),
        countries: z.string().optional(),
        creativeIds: z.string().optional(),
        view: z
          .enum(["all", "blacklist", "bids"])
          .optional()
          .default("all"),
        searchQuery: z.string().optional(),
      },
      async (args) => {
        const perPage = clampPerPage(args.perPage);
        const { dateFrom: df, dateTo: dt } =
          args.dateFrom != null && args.dateTo != null
            ? { dateFrom: args.dateFrom, dateTo: args.dateTo }
            : resolvePeriodToDates(args.period);

        if (args.reportType === "custom") {
          const config = await getReportConfig();
          const groupIds = resolveGroupIds(args.groupBy, config);
          const metricIds = resolveMetricIds(args.metrics, config);

          if (metricIds.length === 0) {
            return "No valid metrics found. Available: spend, clicks, views/impressions, ctr, cpc, cpm, cpa, conversions, holds, rejects, cr, roi, income";
          }

          const customFilters: unknown[] = [];
          if (args.campaignIds != null) {
            customFilters.push({ id: "advertiser_campaign", type: "list", list: args.campaignIds.split(",").map(Number) });
          }

          const params: Record<string, unknown> = {
            groups: groupIds.length > 0 ? groupIds : ["time_day"],
            metrics: metricIds,
            filters: {
              dateFrom: df,
              dateTo: dt,
              filters: customFilters,
            },
            page: args.page,
            perPage,
            ...(args.sortBy != null && { sortBy: args.sortBy }),
            ...(args.sortOrder != null && { sortOrder: args.sortOrder }),
          };
          const res = (await api.getReportData(params)) as ReportDataResponse;
          const rows = res.rows ?? [];
          if (rows.length === 0) {
            return `No data for ${df} to ${dt}.`;
          }
          const allKeys = new Set<string>();
          for (const row of rows) {
            for (const k of Object.keys(row)) if (k !== "id") allKeys.add(k);
          }
          const headers = [...allKeys];
          const tableRows = rows.map((row) =>
            headers.map((h) => extractCellValue(row[h])),
          );
          const totalPages = res.perPage ? Math.ceil(res.totalRows / res.perPage) : 1;
          const title = `Stats (${df} to ${dt}, page ${res.page ?? 1}/${totalPages})`;
          return formatTable({ headers, rows: tableRows }, title);
        }

        if (args.reportType === "sites") {
          const params: Record<string, unknown> = {
            dateFrom: df,
            dateTo: dt,
            page: args.page,
            perPage,
            view: args.view,
            ...(args.campaignIds != null && {
              campaignIds: args.campaignIds,
            }),
            ...(args.creativeIds != null && {
              creativeIds: args.creativeIds,
            }),
            ...(args.searchQuery != null && {
              searchQuery: args.searchQuery,
            }),
          };
          const res = (await api.getSiteStats(params)) as ApiListResponse;
          const items = (res.rows ?? []) as Record<string, unknown>[];
          const pagination = extractPagination(res);
          const formatSiteRow = (
            s: Record<string, unknown>,
            i: number,
          ): string => {
            const parts = Object.entries(s)
              .filter(([k]) => k !== "checkbox" && k !== "isInBlackList" && k !== "hasBid")
              .map(([k, v]) => `${k}: ${v}`)
              .join(" | ");
            return `${i + 1}. ${parts}`;
          };
          return formatEntityList(
            items,
            formatSiteRow,
            `Site stats (${df} to ${dt})`,
            pagination,
          );
        }

        if (args.reportType === "postbacks") {
          const params: Record<string, unknown> = {
            dateFrom: df,
            dateTo: dt,
            page: args.page,
            perPage,
            ...(args.campaignIds != null && {
              campaignIds: args.campaignIds,
            }),
          };
          const res = (await api.getPostbackStats(
            params,
          )) as ApiListResponse;
          const items = (res.rows ?? []) as Record<string, unknown>[];
          const pagination = extractPagination(res);
          const formatPostbackRow = (
            p: Record<string, unknown>,
            i: number,
          ): string => {
            const parts = Object.entries(p)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" | ");
            return `${i + 1}. ${parts}`;
          };
          return formatEntityList(
            items,
            formatPostbackRow,
            `Postback stats (${df} to ${dt})`,
            pagination,
          );
        }

        return "Unknown reportType.";
      },
    );
  },
};
