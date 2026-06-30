import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatEntityList, extractCellValue, clampPerPage } from "../../output-formatter.js";
import { extractPagination } from "../../utils/pagination.js";
import { resolvePeriodToDates } from "../../utils/date-helpers.js";
import { parseCommaSeparatedIds } from "../../utils/status-actions.js";
import type { OptionsRegistry } from "../../api/options-registry.js";

const SLICE_LEGEND =
  "Slice IDs: 130 country, 140 platform, 150 browser, 180 source, 190 site, " +
  "200 platform version, 300 subscription age, 320 browser language, 380 CR-target.";

const DEFAULT_METRICS = ["views", "clicks", "cpc", "cr"];
// Keys that are not user-facing metrics (excluded from the "available columns" hint).
const NON_METRIC_KEYS = new Set(["id", "name", "bid", "bidMode", "hasBids", "checkbox"]);

const SLICE_COUNTRY = 130;

/** geoId -> ISO code, for labeling country-slice rows (reuse the cached country map). */
async function buildCountryLabels(options: OptionsRegistry): Promise<Map<number, string>> {
  const rev = new Map<number, string>();
  try {
    const map = await options.getCountryMap();
    for (const [code, geoId] of map) rev.set(geoId, code);
  } catch {
    /* labels are best-effort */
  }
  return rev;
}

export const bidOptimizationModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_get_extended_stats",
        description:
          "Bid Optimization: per-slice stats grid for drilling down and setting bids. Drill by appending a sliceId to pathIds; reuse each row's pathIds to set bids via kadam_adv_update_extended_bids. Use ONE campaign to see per-row bids.",
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
            "Comma-separated metric columns to show (default views,clicks,cpc,cr). The output lists all available columns.",
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
            "Sort column (e.g. views, clicks, cpc, cr); default views desc to surface high-traffic rows",
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

        // The slice being broken down by = last sliceId when the path is odd-length.
        const brokenSlice = basePath.length % 2 === 1 ? basePath[basePath.length - 1] : undefined;
        const countryLabels =
          brokenSlice === SLICE_COUNTRY ? await buildCountryLabels(ctx.adv.options) : null;

        const wanted = args.metrics
          ? args.metrics
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : DEFAULT_METRICS;

        const available =
          rows.length > 0 ? Object.keys(rows[0]!).filter((k) => !NON_METRIC_KEYS.has(k)) : [];

        const formatRow = (row: Record<string, unknown>, index: number): string => {
          const valId = (row.id ?? row.name) as number | string | undefined;
          const path = [...basePath, valId].filter((v) => v != null).join(",");
          const label =
            countryLabels && valId != null ? countryLabels.get(Number(valId)) : undefined;
          const metricsStr = wanted
            .filter((m) => m in row)
            .map((m) => `${m}=${extractCellValue(row[m])}`)
            .join(" ");
          const bid =
            row.bid != null && row.bid !== "" ? ` | bid=${extractCellValue(row.bid)}` : "";
          return `${index + 1}. pathIds=${path}${label ? ` "${label}"` : ""} | ${metricsStr}${bid}`;
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
              pathIds: z.array(z.number()).min(2).describe("Alternating [sliceId, valueId, ...]"),
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
