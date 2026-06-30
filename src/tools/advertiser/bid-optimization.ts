import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatEntityList, extractCellValue, clampPerPage } from "../../output-formatter.js";
import { extractPagination } from "../../utils/pagination.js";
import { resolvePeriodToDates } from "../../utils/date-helpers.js";
import { parseCommaSeparatedIds } from "../../utils/status-actions.js";

const SLICE_LEGEND =
  "Slice IDs: 130 country, 140 platform, 150 browser, 180 source, 190 site, " +
  "200 platform version, 300 subscription age, 320 browser language, 380 CR-target.";

// Metric column keys are display-cased and identical to the sortField keys.
const DEFAULT_METRICS = ["views", "clicks", "CPC", "CR"];
// Structural / non-metric keys excluded from the "available columns" hint.
const NON_METRIC_KEYS = new Set([
  "id",
  "name",
  "bid",
  "bidMode",
  "hasBids",
  "isExcludedFromAutorules",
  "checkbox",
  "WR",
  "auction",
]);

export const bidOptimizationModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_get_extended_stats",
        description:
          "Bid Optimization: per-slice stats grid for drilling down and setting bids (requires Bid Optimization access on the account). Drill by appending a sliceId to pathIds; reuse each row's pathIds to set bids via kadam_adv_update_extended_bids. Use ONE campaign to see per-row bids.",
        product: "advertiser",
        annotations: { title: "Get extended (bid-optimization) stats", readOnlyHint: true },
      },
      {
        campaignIds: z
          .string()
          .min(1)
          .describe("Comma-separated campaign IDs (use one for per-row bids)"),
        pathIds: z
          .string()
          .optional()
          .describe(
            `Drill path: comma-separated alternating sliceId,valueId,... ending with a sliceId to break down by it. ${SLICE_LEGEND} e.g. '130' = by country; '130,34,180' = sources within country 34`,
          ),
        metrics: z
          .string()
          .optional()
          .describe(
            "Comma-separated metric column keys (display-cased, the SAME keys as sortField and the output's 'Available metric columns' line): views,clicks,CTR,conversions,holds,rejections,spending,earning,profit,ROI,CR,CPM,EPL,EPC,CPC,CPA,CPL (default views,clicks,CPC,CR).",
          ),
        period: z
          .enum(["today", "yesterday", "7days", "week", "month"])
          .optional()
          .default("7days"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        searchQuery: z.string().min(2).optional(),
        sortField: z
          .string()
          .optional()
          .describe(
            "Sort column key (same display-cased keys as metrics): views, clicks, CTR, conversions, holds, rejections, spending, earning, profit, ROI, CR, CPC, CPM, CPA, EPC, EPL, CPL. Default: views desc (high-traffic first).",
          ),
        sortOrder: z.enum(["asc", "desc"]).optional(),
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
      },
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);
        const { dateFrom, dateTo } =
          args.dateFrom != null && args.dateTo != null
            ? { dateFrom: args.dateFrom, dateTo: args.dateTo }
            : resolvePeriodToDates(args.period);

        const campaignIds = parseCommaSeparatedIds(args.campaignIds);
        const basePath = args.pathIds ? parseCommaSeparatedIds(args.pathIds) : [];

        const params: Record<string, unknown> = {
          campaignIds,
          ...(basePath.length > 0 && { pathIds: basePath }),
          filters: {
            dateFrom,
            dateTo,
            ...(args.searchQuery != null && { searchQuery: args.searchQuery }),
          },
          page: args.page,
          perPage,
          ...(args.sortField != null
            ? { sort: { [args.sortField]: args.sortOrder ?? "desc" } }
            : { sort: { views: "desc" } }),
        };

        const res = await ctx.adv.getExtendedStats(params);
        const rows = res.rows ?? [];
        const pagination = extractPagination(res);

        const wanted = args.metrics
          ? args.metrics
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : DEFAULT_METRICS;

        const available =
          rows.length > 0 ? Object.keys(rows[0]!).filter((k) => !NON_METRIC_KEYS.has(k)) : [];

        const formatRow = (row: Record<string, unknown>, index: number): string => {
          // Every grid row carries its value in `name`: live data uses an object
          // {id,title,...} (scalar only on legacy/empty rows). `id` is the slice value
          // id that goes into pathIds; `title` is the human label (country, source, ...).
          const nameVal = row.name;
          let valId: number | string | undefined;
          let label: string | undefined;
          if (nameVal != null && typeof nameVal === "object") {
            const n = nameVal as { id?: number | string; title?: string };
            valId = n.id;
            label = n.title;
          } else {
            valId = nameVal as number | string | undefined;
          }

          const path = [...basePath, valId].filter((v) => v != null).join(",");
          const metricsStr = wanted
            .filter((m) => m in row)
            .map((m) => `${m}=${extractCellValue(row[m])}`)
            .join(" ");
          const bid =
            row.bid != null && row.bid !== "" ? ` | bid=${extractCellValue(row.bid)}` : "";
          const excluded = row.isExcludedFromAutorules === true ? " [autorule-excluded]" : "";
          return `${index + 1}. pathIds=${path}${label ? ` "${label}"` : ""} | ${metricsStr}${bid}${excluded}`;
        };

        const header =
          `Extended stats (campaigns ${campaignIds.join(",")}, ${dateFrom} to ${dateTo})` +
          (available.length ? `\nAvailable metric columns: ${available.join(", ")}` : "");

        return formatEntityList(rows, formatRow, header, pagination);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_list_extended_bids",
        description:
          "List the per-slice bid overrides currently set on campaign(s) (Bid Optimization). Paginated.",
        product: "advertiser",
        annotations: { title: "List extended bids", readOnlyHint: true },
      },
      {
        campaignIds: z.string().min(1).describe("Comma-separated campaign IDs"),
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
      },
      async (args, ctx) => {
        const ids = parseCommaSeparatedIds(args.campaignIds);
        const bidsByCampaign = await ctx.adv.listExtendedBids(ids);

        const all: string[] = [];
        for (const [cid, bids] of Object.entries(bidsByCampaign)) {
          for (const b of bids) {
            const mode = b.mode ? ` ${b.mode}` : "";
            const state = b.state ? ` (${b.state})` : "";
            all.push(
              `pathIds=${b.pathIds.join(",")} | bid=${extractCellValue(b.bid)}${mode}${state} | campaign #${cid}`,
            );
          }
        }

        const perPage = clampPerPage(args.perPage);
        const page = args.page ?? 1;
        const totalRows = all.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / perPage));
        const slice = all.slice((page - 1) * perPage, page * perPage);

        return formatEntityList(
          slice,
          (line) => line,
          `Extended bids (campaigns ${ids.join(",")})`,
          { page, totalPages, totalRows },
        );
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_extended_bids",
        description:
          "Set / multiply / blacklist / remove per-slice bids (Bid Optimization). Bulk: every bid op applies to all listed campaigns. action: set (needs mode+bid), off (blacklist), on (un-blacklist), remove (delete). Get pathIds from kadam_adv_get_extended_stats.",
        product: "advertiser",
        annotations: { title: "Update extended bids", readOnlyHint: false },
      },
      {
        campaignIds: z.string().min(1).describe("Comma-separated campaign IDs (CPC/CPM)"),
        bids: z
          .array(
            z.object({
              pathIds: z
                .array(z.number())
                .min(2)
                .describe(
                  "Alternating [sliceId, valueId, ...] as shown in a get_extended_stats row's pathIds",
                ),
              action: z.enum(["set", "off", "on", "remove"]),
              mode: z.enum(["fixed", "multiplier"]).optional().describe("Required for action=set"),
              bid: z.string().optional().describe("Required for action=set"),
            }),
          )
          .min(1),
      },
      async (args, ctx) => {
        const ids = parseCommaSeparatedIds(args.campaignIds);
        const res = await ctx.adv.updateExtendedBids({ campaignIds: ids, bids: args.bids });
        const affected = res.affectedCampaigns ?? ids.length;
        return `Extended bids updated: ${args.bids.length} op(s) across ${affected} campaign(s).`;
      },
    );
  },
};
