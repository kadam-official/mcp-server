import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import {
  formatTable,
  formatEntityList,
  extractCellValue,
  clampPerPage,
} from "../../output-formatter.js";
import { extractPagination } from "../../utils/pagination.js";
import { resolveMetricIds, resolveGroupIds } from "../../utils/dimension-mapper.js";
import { resolvePeriodToDates } from "../../utils/date-helpers.js";


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
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);
        const { dateFrom: df, dateTo: dt } =
          args.dateFrom != null && args.dateTo != null
            ? { dateFrom: args.dateFrom, dateTo: args.dateTo }
            : resolvePeriodToDates(args.period);

        if (args.reportType === "custom") {
          const config = await ctx.adv.getReportConfig();
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
          const res = await ctx.adv.getReportData(params);
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
          const res = await ctx.adv.getSiteStats(params);
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
            res.rows,
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
          const res = await ctx.adv.getPostbackStats(params);
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
            res.rows,
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
