import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import * as api from "../../api/partners-client.js";
import {
  formatTable,
  formatEntityList,
  clampPerPage,
  formatNumber,
  formatPercent,
} from "../../output-formatter.js";
import type { ReportDataResponse } from "../../types/common.js";
import type { ApiListResponse } from "../../types/common.js";
import { extractPagination } from "../../utils/pagination.js";
import { cacheOnce } from "../../utils/cache-once.js";
import { mapToDimensionIds } from "../../utils/dimension-mapper.js";

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

export const statsModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_get_stats",
        description:
          "Unified advertiser statistics. Use reportType to select: 'custom' (default) for full report builder, 'sites' for per-site breakdown, 'postbacks' for conversion logs. For custom reports, the server maps human-readable dimension/metric names to API IDs internally.",
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
          const groupIds = mapToDimensionIds(args.groupBy, config.groups);
          const metricIds = mapToDimensionIds(args.metrics, config.metrics);
          const params: Record<string, unknown> = {
            groups: groupIds.length > 0 ? groupIds : undefined,
            metrics: metricIds.length > 0 ? metricIds : undefined,
            dateFrom: df,
            dateTo: dt,
            page: args.page,
            perPage,
            ...(args.sortBy != null && { sortBy: args.sortBy }),
            ...(args.sortOrder != null && { sortOrder: args.sortOrder }),
            ...(args.campaignIds != null && {
              campaignIds: args.campaignIds,
            }),
            ...(args.countries != null && { countries: args.countries }),
          };
          const res = (await api.getReportData(
            params,
          )) as ReportDataResponse;
          const rows = res.data ?? [];
          const allKeys = new Set<string>();
          for (const row of rows) {
            for (const k of Object.keys(row)) allKeys.add(k);
          }
          const headers = [...allKeys];
          const tableRows = rows.map((row) =>
            headers.map((h) => String(row[h] ?? "")),
          );
          const title = `Stats (${df} to ${dt}, page ${(res.meta?.page ?? 1)}/${res.meta?.pages ?? 1})`;
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
          const items = (res.data ?? []) as Array<{
            siteName?: string;
            site?: string;
            impressions?: number;
            clicks?: number;
            ctr?: number;
            spend?: number;
            moneyOut?: number;
          }>;
          const pagination = extractPagination(res);
          const formatSiteRow = (
            s: (typeof items)[0],
            i: number,
          ): string => {
            const name = s.siteName ?? s.site ?? "—";
            const imp = s.impressions ?? 0;
            const clk = s.clicks ?? 0;
            const ctrVal = s.ctr ?? (imp > 0 ? (clk / imp) * 100 : 0);
            const spend = s.spend ?? s.moneyOut ?? 0;
            return `${i + 1}. ${name} | imp: ${formatNumber(imp)} | clk: ${formatNumber(clk)} | CTR: ${formatPercent(ctrVal)} | spend: ${formatNumber(spend)}`;
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
          const items = (res.data ?? []) as Record<string, unknown>[];
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
