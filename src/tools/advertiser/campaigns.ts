import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import {
  formatEntityList,
  clampPerPage,
} from "../../output-formatter.js";
import { CAMPAIGN_TYPE_MAP, PRICING_MODEL_MAP } from "../../types/advertiser.js";
import { extractPagination } from "../../utils/pagination.js";
import { ADV_STATUS_ACTION_MAP, parseCommaSeparatedIds } from "../../utils/status-actions.js";
import type { CampaignRow } from "../../api/schemas/advertiser.js";

function formatCampaignRow(row: CampaignRow, index: number): string {
  const c = row.campaign;
  return `${index + 1}. [ID: ${c.id}] "${c.name}" (${c.type?.label ?? c.type?.id}, ${c.state?.label ?? c.state?.id}) Budget: ${row.dayMoneyLimit}/day | Model: ${c.model} | Creatives: ${c.active}/${c.total}`;
}

const CONNECTION_TYPE_MAP: Record<string, number> = {
  cellular: 1,
  wifi: 2,
  all: 3,
};

function mapField(
  key: string,
  value: unknown,
  mapped: Record<string, unknown>,
  fields: Record<string, unknown>,
): void {
  switch (key) {
    case "type":
      mapped.type = typeof value === "string" ? (CAMPAIGN_TYPE_MAP[value] ?? value) : value;
      break;
    case "pricingModel":
      mapped.cpType = typeof value === "string" ? (PRICING_MODEL_MAP[value] ?? value) : value;
      break;
    case "dailyBudget":
      mapped.dayMoneyLimit = value;
      break;
    case "totalBudget":
      mapped.commonMoneyLimit = value;
      break;
    case "evenDistribution":
      mapped.isEvenDistribution = value;
      break;
    case "bid": {
      const bidVal = value as number;
      const cpType = mapped.cpType ?? fields.pricingModel;
      if (cpType === 4 || cpType === "cpa_target") {
        mapped.bids = [{ leadCost: bidVal, countries: [] }];
      } else {
        mapped.bids = [{ bid: bidVal, leadCost: 0, countries: [] }];
      }
      break;
    }
    case "connectionType":
      mapped.connectionType = typeof value === "string" ? (CONNECTION_TYPE_MAP[value] ?? 3) : value;
      break;
    case "devices":
      if (typeof value === "string") mapped.devices = value.split(",").map(s => s.trim());
      break;
    case "os":
      if (typeof value === "string") mapped.platforms = value.split(",").map(s => s.trim());
      break;
    case "browsers":
      if (typeof value === "string") mapped.browsers = value.split(",").map(s => s.trim());
      break;
    case "countries":
      if (typeof value === "string") mapped.countries = value.split(",").map(s => s.trim());
      break;
    case "bidCountry":
    case "audienceIncludeIds":
    case "audienceExcludeIds":
      break;
    default:
      mapped[key] = value;
  }
}

const FULL_WEEK_SCHEDULE = {
  mode: 1,
  list: Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    hours: Array.from({ length: 24 }, (_, h) => h),
  })),
};

const CAMPAIGN_DEFAULTS: Record<string, unknown> = {
  connectionType: 3,
  categories: [1001],
  browsers: [2, 4],
  disableProxy: 1,
  sites: { mode: 0, list: [] },
  ips: { mode: 0, list: [] },
  newAudiences: [],
  cities: { mode: 0, list: [] },
  isps: { mode: 0, list: [] },
  materialViews: { count: 0, days: 0 },
  campaignView: { count: 0, days: 0 },
  postConversion: { audiences: [], windowLength: null, countFirstConversionOnly: false, countLastCampaignOnly: false },
  commonMoneyLimit: 0,
  isEvenDistribution: 0,
  totalLossLimit: 0,
  minBlockViews: 0,
  maxBlockViews: 0,
  dayClickLimit: 0,
  dayConversionsLimit: 0,
  isConversionFromPostback: 0,
  allowMultiAds: 0,
  time: FULL_WEEK_SCHEDULE,
  timezone: 0,
  startDate: null,
  stopDate: null,
  autorules: [],
  proxies: [],
  conversion: null,
  platformVersions: null,
  devices: null,
  languages: null,
};

function applyDefaults(mapped: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(CAMPAIGN_DEFAULTS)) {
    if (mapped[k] === undefined) mapped[k] = v;
  }
}

function applyTypeDefaults(mapped: Record<string, unknown>): void {
  const typeId = mapped.type as number;

  if ([30, 100].includes(typeId)) {
    if (mapped.subAges === undefined) mapped.subAges = [1, 2, 3, 4];
    if (mapped.isNeedSecondPush === undefined) mapped.isNeedSecondPush = 0;
  }

  if ([10, 20].includes(typeId)) {
    if (mapped.gender === undefined) mapped.gender = 3;
    if (mapped.age === undefined) mapped.age = null;
  }

  if (typeId === 40) {
    if (mapped.isPauseAfterModerate === undefined) mapped.isPauseAfterModerate = 0;
  }
}

function buildAudiences(fields: Record<string, unknown>): Record<string, unknown> {
  const includeIds = fields.audienceIncludeIds;
  const excludeIds = fields.audienceExcludeIds;
  return {
    mode: 20,
    include: typeof includeIds === "string" ? includeIds.split(",").map(s => parseInt(s.trim(), 10)) : [],
    exclude: typeof excludeIds === "string" ? excludeIds.split(",").map(s => parseInt(s.trim(), 10)) : [],
  };
}

export function mapCampaignFields(fields: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    mapField(key, value, mapped, fields);
  }

  mapped.audiences = buildAudiences(fields);
  applyDefaults(mapped);
  applyTypeDefaults(mapped);

  return mapped;
}

const campaignTargetingFields = {
  countries: z.string().optional().describe("Comma-separated ISO country codes (e.g. 'US,DE,BR')"),
  devices: z.string().optional().describe("Comma-separated device types (e.g. 'desktop,mobile,tablet')"),
  os: z.string().optional().describe("Comma-separated OS filters (e.g. 'windows,android,ios')"),
  browsers: z.string().optional().describe("Comma-separated browser filters"),
  languages: z.string().optional().describe("Comma-separated language codes"),
  connectionType: z.enum(["wifi", "cellular", "unknown"]).optional().describe("Network connection type filter"),
  gender: z.enum(["male", "female", "unknown"]).optional().describe("Target gender"),
  ageRanges: z.string().optional().describe("Target age ranges (e.g. '18-24,25-34')"),
  audienceIncludeIds: z.string().optional().describe("Comma-separated audience IDs to include"),
  audienceExcludeIds: z.string().optional().describe("Comma-separated audience IDs to exclude"),
  siteWhitelist: z.string().optional().describe("Comma-separated site IDs for whitelist"),
  siteBlacklist: z.string().optional().describe("Comma-separated site IDs for blacklist"),
};

const campaignBudgetFields = {
  totalBudget: z.number().optional().describe("Total campaign budget in USD"),
  evenDistribution: z.boolean().optional().describe("Spread budget evenly across the day"),
  startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
  timezone: z.number().optional().describe("Timezone offset in hours (e.g. 3 for UTC+3)"),
  schedule: z.string().optional().describe("Hour schedule bitmask for targeting specific hours"),
  frequencyCapViews: z.number().optional().describe("Max ad views per user in the cap period"),
  frequencyCapHours: z.number().optional().describe("Frequency cap period in hours"),
  impTracker: z.string().optional().describe("Third-party impression tracking pixel URL"),
  categories: z.string().optional().describe("Comma-separated category IDs (default: 1001=General)"),
  secondPush: z.boolean().optional().describe("Enable second push notification (push/inpage_push only)"),
  pauseAfterModeration: z.boolean().optional().describe("Pause campaign after creatives pass moderation"),
};

export const campaignsModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_list_campaigns",
        description:
          "List advertiser campaigns with pagination. Filter by folder, status, type, date range, or search query.",
        product: "advertiser",
        annotations: { readOnlyHint: true },
      },
      {
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        folderId: z.number().optional(),
        status: z
          .enum(["active", "paused", "archived", "moderation"])
          .optional(),
        type: z
          .enum(["push", "inpage_push", "native", "banner", "video", "popunder"])
          .optional(),
        searchQuery: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        sortField: z.string().optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
      },
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);
        const params: Record<string, unknown> = {
          page: args.page,
          perPage,
          ...(args.folderId != null && { folderId: args.folderId }),
          ...(args.status != null && { status: args.status }),
          ...(args.type != null && {
            type: CAMPAIGN_TYPE_MAP[args.type] ?? args.type,
          }),
          ...(args.searchQuery != null && { searchQuery: args.searchQuery }),
          ...(args.dateFrom != null && { dateFrom: args.dateFrom }),
          ...(args.dateTo != null && { dateTo: args.dateTo }),
          ...(args.sortField != null && { sortField: args.sortField }),
          ...(args.sortOrder != null && { sortOrder: args.sortOrder }),
        };
        const res = await ctx.adv!.listCampaigns(params);
        const pagination = extractPagination(res);
        return formatEntityList(
          res.rows,
          formatCampaignRow,
          "Campaigns",
          pagination,
        );
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_campaign",
        description:
          "Create a new advertiser campaign. Required: type, name, url, folderId, pricingModel, bid, dailyBudget.",
        product: "advertiser",
      },
      {
        type: z.enum(["push", "inpage_push", "native", "banner", "video", "popunder"]).describe("Ad format"),
        name: z.string().min(1).describe("Campaign name shown in dashboard"),
        url: z.string().url().describe("Landing page URL"),
        folderId: z.number().describe("Campaign folder ID"),
        pricingModel: z.enum(["cpc", "cpm", "cpa_target"]).describe("Pricing model: cpc, cpm, or cpa_target"),
        bid: z.number().positive().describe("Bid amount in USD (e.g. 0.05). For cpa_target this is the target CPA cost"),
        bidCountry: z.string().optional().default("ALL").describe("Country for bid, 'ALL' for global"),
        dailyBudget: z.number().positive().describe("Daily spending limit in USD"),
        ...campaignTargetingFields,
        ...campaignBudgetFields,
      },
      async (args, ctx) => {
        const mappedArgs = { ...args } as Record<string, unknown>;
        if (args.categories) {
          mappedArgs.categories = args.categories.split(",").map((s: string) => parseInt(s.trim(), 10));
        }
        const mappedData = mapCampaignFields(mappedArgs);
        const result = await ctx.adv!.createCampaign(mappedData);
        return `Campaign created: [ID: ${result.id}] "${args.name}" in folder #${args.folderId}`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_campaign",
        description: "Update an existing campaign. WARNING: the Kadam API requires ALL campaign fields for updates (no partial update). This tool may fail if only some fields are provided. Use set_campaign_status for status changes instead.",
        product: "advertiser",
      },
      {
        id: z.number().describe("Campaign ID to update"),
        type: z.enum(["push", "inpage_push", "native", "banner", "video", "popunder"]).optional().describe("Ad format"),
        name: z.string().min(1).optional().describe("Campaign name shown in dashboard"),
        url: z.string().url().optional().describe("Landing page URL"),
        folderId: z.number().optional().describe("Campaign folder ID"),
        pricingModel: z.enum(["cpc", "cpm", "cpa_target"]).optional().describe("Pricing model"),
        bid: z.number().positive().optional().describe("Bid amount in USD (e.g. 0.05)"),
        bidCountry: z.string().optional().describe("Country for bid, 'ALL' for global"),
        dailyBudget: z.number().positive().optional().describe("Daily spending limit in USD"),
        ...campaignTargetingFields,
        ...campaignBudgetFields,
      },
      async (args, ctx) => {
        const { id, ...rest } = args;
        const mappedData = mapCampaignFields(rest as Record<string, unknown>);
        await ctx.adv!.updateCampaign(id, mappedData);
        return `Campaign #${id} updated successfully.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_set_campaign_status",
        description:
          "Set status for multiple campaigns. Pass comma-separated IDs and status: active, paused, or archived.",
        product: "advertiser",
        annotations: { idempotentHint: true },
      },
      {
        ids: z.string().min(1),
        status: z.enum(["active", "paused", "archived"]),
      },
      async (args, ctx) => {
        const parsedIds = parseCommaSeparatedIds(args.ids);
        const action = ADV_STATUS_ACTION_MAP[args.status];
        await ctx.adv!.setCampaignStatus(parsedIds, action);
        const idList = parsedIds.map((id) => `#${id}`).join(", ");
        return `${parsedIds.length} campaigns set to ${args.status}: ${idList}`;
      },
    );
  },
};
