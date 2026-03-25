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
import { flattenCategoryIds } from "../../api/options-registry.js";
import type { OptionsRegistry, CampaignOptions } from "../../api/options-registry.js";

function formatCampaignRow(row: CampaignRow, index: number): string {
  const c = row.campaign;
  return `${index + 1}. [ID: ${c.id}] "${c.name}" (${c.type?.label ?? c.type?.id}, ${c.state?.label ?? c.state?.id}) Budget: ${row.dayMoneyLimit}/day | Model: ${c.model} | Creatives: ${c.active}/${c.total}`;
}

const CONNECTION_TYPE_MAP: Record<string, number> = {
  cellular: 1,
  wifi: 2,
  unknown: 3,
  all: 3,
};

async function mapField(
  key: string,
  value: unknown,
  mapped: Record<string, unknown>,
  fields: Record<string, unknown>,
  registry: OptionsRegistry,
): Promise<void> {
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
      const rawPm = fields.pricingModel;
      const cpType = typeof rawPm === "string" ? (PRICING_MODEL_MAP[rawPm] ?? rawPm) : rawPm;
      const countriesArg = fields.countries;
      const geoIds = typeof countriesArg === "string" && countriesArg
        ? await registry.resolveCountryIds(countriesArg)
        : [];
      if (cpType === 4) {
        mapped.bids = [{ leadCost: bidVal, countries: geoIds }];
      } else {
        mapped.bids = [{ bid: bidVal, leadCost: 0, countries: geoIds }];
      }
      break;
    }
    case "connectionType":
      mapped.connectionType = typeof value === "string" ? (CONNECTION_TYPE_MAP[value] ?? 3) : value;
      break;
    case "devices":
      if (typeof value === "string") mapped.devices = await registry.resolveIds("device", value);
      break;
    case "os":
      if (typeof value === "string") mapped.platformVersions = await registry.resolveIds("platform", value);
      break;
    case "browsers":
      if (typeof value === "string") mapped.browsers = await registry.resolveIds("browser", value);
      break;
    case "languages":
      if (typeof value === "string") mapped.languages = await registry.resolveIds("language", value);
      break;
    case "postViewWindow":
    case "postClickWindow":
    case "countFirstConversionOnly":
    case "countLastCampaignOnly":
    case "postClickAttrPriority":
    case "postConversionAudienceIds":
      break; // handled in buildPostConversion
    case "countries":
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
  disableProxy: 1,
  sites: { mode: 0, list: [] },
  ips: { mode: 0, list: [] },
  newAudiences: [],
  cities: { mode: 0, list: [] },
  isps: { mode: 0, list: [] },
  materialViews: { count: 0, days: 0 },
  campaignView: { count: 0, days: 0 },
  postConversion: {
    audiences: [],
    countFirstConversionOnly: true,
    countLastCampaignOnly: true,
    postClickAttrPriority: true,
    windowLengthPostView: null,
    windowLengthPostClick: null,
  },
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
};

function applyDefaults(mapped: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(CAMPAIGN_DEFAULTS)) {
    if (mapped[k] === undefined) mapped[k] = v;
  }
}

function applyTypeDefaults(mapped: Record<string, unknown>, opts: CampaignOptions): void {
  const typeId = mapped.type as number;
  const { push, inpage_push, native, banner, popunder } = CAMPAIGN_TYPE_MAP;

  if (opts.categories.length > 0 && mapped.categories === undefined) {
    mapped.categories = flattenCategoryIds(opts.categories);
  }

  if (mapped.browsers === undefined && opts.browsers.length > 0) {
    mapped.browsers = opts.browsers.map((b) => b.id as number);
  }

  if ([push, inpage_push].includes(typeId)) {
    if (mapped.subAges === undefined && opts.subAges.length > 0) {
      mapped.subAges = opts.subAges.map((s) => s.id);
    }
    if (mapped.isNeedSecondPush === undefined) mapped.isNeedSecondPush = 0;
  }

  if ([native, banner].includes(typeId)) {
    if (mapped.gender === undefined) mapped.gender = 3;
    if (mapped.age === undefined) mapped.age = null;
  }

  if (typeId === popunder) {
    if (mapped.isPauseAfterModerate === undefined) mapped.isPauseAfterModerate = 0;
  }
}

function validateCpType(typeId: number, cpTypeId: number, opts: CampaignOptions): void {
  const validIds = opts.cpTypes.map((c) => Number(c.id));
  if (!validIds.includes(cpTypeId)) {
    const available = opts.cpTypes.map((c) => `${c.label} (${c.id})`).join(", ");
    throw new Error(
      `Pricing model ${cpTypeId} is not available for this campaign type. Available: ${available}`,
    );
  }
}

function buildPostConversion(fields: Record<string, unknown>): Record<string, unknown> | undefined {
  const pvWindow = fields.postViewWindow as number | undefined;
  const pcWindow = fields.postClickWindow as number | undefined;
  const firstOnly = fields.countFirstConversionOnly as boolean | undefined;
  const lastCampaign = fields.countLastCampaignOnly as boolean | undefined;
  const clickPriority = fields.postClickAttrPriority as boolean | undefined;
  const audienceIdsStr = fields.postConversionAudienceIds as string | undefined;

  if (pvWindow == null && pcWindow == null && firstOnly == null &&
      lastCampaign == null && clickPriority == null && audienceIdsStr == null) {
    return undefined;
  }

  const audiences = audienceIdsStr
    ? audienceIdsStr.split(",").map(s => parseInt(s.trim(), 10))
    : [];

  return {
    audiences,
    countFirstConversionOnly: firstOnly ?? true,
    countLastCampaignOnly: lastCampaign ?? true,
    postClickAttrPriority: clickPriority ?? true,
    windowLengthPostView: pvWindow ?? null,
    windowLengthPostClick: pcWindow ?? null,
  };
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

export async function mapCampaignFields(
  fields: Record<string, unknown>,
  registry: OptionsRegistry,
): Promise<Record<string, unknown>> {
  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    await mapField(key, value, mapped, fields, registry);
  }

  const typeId = mapped.type as number;
  const opts = await registry.getCampaignOptions(typeId);

  if (mapped.cpType != null) {
    validateCpType(typeId, mapped.cpType as number, opts);
  }

  const bids = mapped.bids as Array<Record<string, unknown>> | undefined;
  if (bids?.[0]) {
    const bidVal = (bids[0].bid ?? bids[0].leadCost) as number | undefined;
    if (bidVal != null && opts.bidCoefficients) {
      const cpType = mapped.cpType as number;
      const maxKey = cpType === 2 ? "maxWithoutStatCPM" : "maxWithoutStatCPC";
      const maxBid = opts.bidCoefficients[maxKey];
      if (maxBid != null && bidVal > maxBid) {
        throw new Error(`Bid ${bidVal} exceeds maximum ${maxBid} for this account. Reduce bid or contact support.`);
      }
    }
  }

  mapped.audiences = buildAudiences(fields);

  const customPostConversion = buildPostConversion(fields);
  if (customPostConversion) {
    mapped.postConversion = customPostConversion;
  }

  applyDefaults(mapped);
  applyTypeDefaults(mapped, opts);

  return mapped;
}

const campaignTargetingFields = {
  countries: z.string().optional().describe("Comma-separated ISO country codes (e.g. 'US,DE,BR')"),
  devices: z.string().optional().describe("Comma-separated device names or IDs (e.g. 'Desktop,Smartphone' or '1,4')"),
  os: z.string().optional().describe("Comma-separated OS names or IDs (e.g. 'Android,iOS' or '10,20')"),
  browsers: z.string().optional().describe("Comma-separated browser names or IDs (e.g. 'Chrome,Firefox' or '8,16')"),
  languages: z.string().optional().describe("Comma-separated language names or IDs"),
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
  categories: z.string().optional().describe("Comma-separated category IDs or 'mainstream'"),
  secondPush: z.boolean().optional().describe("Enable second push notification (push/inpage_push only)"),
  pauseAfterModeration: z.boolean().optional().describe("Pause campaign after creatives pass moderation"),
};

const postConversionFields = {
  postViewWindow: z.number().min(1).max(168).optional()
    .describe("Post-view attribution window in hours (1-168). Time after ad impression to count a conversion"),
  postClickWindow: z.number().min(1).max(168).optional()
    .describe("Post-click attribution window in hours (1-168). Time after ad click to count a conversion"),
  countFirstConversionOnly: z.boolean().optional()
    .describe("Only count the first conversion per user (default: true). Set false to allow multiple conversions per view/click"),
  countLastCampaignOnly: z.boolean().optional()
    .describe("Attribute conversion only to the last campaign impression (default: true)"),
  postClickAttrPriority: z.boolean().optional()
    .describe("Post-click attribution takes priority over post-view (default: true)"),
  postConversionAudienceIds: z.string().optional()
    .describe("Comma-separated audience IDs for post-conversion retargeting"),
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
        const res = await ctx.adv.listCampaigns(params);
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
        dailyBudget: z.number().positive().describe("Daily spending limit in USD"),
        ...campaignTargetingFields,
        ...campaignBudgetFields,
        ...postConversionFields,
        countries: z.string().describe("Comma-separated ISO country codes for bid targeting (e.g. 'US,DE,BR'). Required."),
      },
      async (args, ctx) => {
        const mappedArgs = { ...args } as Record<string, unknown>;
        if (args.categories) {
          mappedArgs.categories = args.categories.split(",").map((s: string) => {
            const n = parseInt(s.trim(), 10);
            return isNaN(n) ? s.trim() : n;
          });
        }
        const mappedData = await mapCampaignFields(mappedArgs, ctx.adv.options);
        const result = await ctx.adv.createCampaign(mappedData);
        return `Campaign created: [ID: ${result.id}] "${args.name}" in folder #${args.folderId}`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_campaign",
        description:
          "Update an existing campaign (read-modify-write). Fetches current state from API, merges your changes, sends full payload. " +
          "Pass only the fields you want to change. For status changes use set_campaign_status instead.",
        product: "advertiser",
      },
      {
        id: z.number().describe("Campaign ID to update"),
        name: z.string().min(1).optional().describe("Campaign name"),
        url: z.string().url().optional().describe("Landing page URL"),
        folderId: z.number().optional().describe("Campaign folder ID"),
        dailyBudget: z.number().optional().describe("Daily spending limit"),
        totalBudget: z.number().optional().describe("Total campaign budget"),
        evenDistribution: z.boolean().optional().describe("Spread budget evenly across the day"),
        bid: z.number().positive().optional().describe("Bid amount"),
        bidCountries: z.string().optional().describe("Comma-separated GEO IDs for bids"),
        connectionType: z.number().optional().describe("1=cellular, 2=wifi, 3=all"),
        disableProxy: z.boolean().optional(),
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD HH:MM:SS)"),
        stopDate: z.string().optional().describe("End date (YYYY-MM-DD HH:MM:SS or null to clear)"),
        timezone: z.number().optional().describe("Timezone offset in hours (e.g. 3 for UTC+3, -5 for UTC-5)"),
        ...postConversionFields,
      },
      async (args, ctx) => {
        const { id, ...changes } = args;
        const current = await ctx.adv.getCampaign(id);

        const merged = { ...current };

        if (changes.name != null) merged.name = changes.name;
        if (changes.url != null) merged.url = changes.url;
        if (changes.folderId != null) merged.folderId = changes.folderId;
        if (changes.dailyBudget != null) merged.dayMoneyLimit = changes.dailyBudget;
        if (changes.totalBudget != null) merged.commonMoneyLimit = changes.totalBudget;
        if (changes.evenDistribution != null) merged.isEvenDistribution = changes.evenDistribution ? 1 : 0;
        if (changes.connectionType != null) merged.connectionType = changes.connectionType;
        if (changes.disableProxy != null) merged.disableProxy = changes.disableProxy ? 1 : 0;
        if (changes.startDate != null) merged.startDate = changes.startDate;
        if (changes.stopDate !== undefined) merged.stopDate = changes.stopDate;
        if (changes.timezone != null) merged.timezone = changes.timezone;

        const currentPc = (current.postConversion ?? {}) as Record<string, unknown>;
        const pcOverrides: Record<string, unknown> = {};
        if (changes.postViewWindow !== undefined) pcOverrides.windowLengthPostView = changes.postViewWindow;
        if (changes.postClickWindow !== undefined) pcOverrides.windowLengthPostClick = changes.postClickWindow;
        if (changes.countFirstConversionOnly !== undefined) pcOverrides.countFirstConversionOnly = changes.countFirstConversionOnly;
        if (changes.countLastCampaignOnly !== undefined) pcOverrides.countLastCampaignOnly = changes.countLastCampaignOnly;
        if (changes.postClickAttrPriority !== undefined) pcOverrides.postClickAttrPriority = changes.postClickAttrPriority;
        if (changes.postConversionAudienceIds !== undefined) {
          pcOverrides.audiences = changes.postConversionAudienceIds
            ? changes.postConversionAudienceIds.split(",").map(s => parseInt(s.trim(), 10))
            : [];
        }
        if (Object.keys(pcOverrides).length > 0) {
          merged.postConversion = { ...currentPc, ...pcOverrides };
        }

        // GET now returns bids as array [{bid, leadCost, countries}] matching PUT format
        const currentBids = current.bids as Array<Record<string, unknown>> | undefined;
        if (changes.bid != null) {
          const existingCountries = (currentBids?.[0]?.countries ?? []) as number[];
          const countries = changes.bidCountries
            ? changes.bidCountries.split(",").map(Number)
            : existingCountries;
          merged.bids = [{ bid: changes.bid, leadCost: 0, countries }];
        }

        delete merged.id;
        delete merged.status;

        // Backend PUT rejects empty categories array; "mainstream" = all non-adult (safe default)
        if (Array.isArray(merged.categories) && (merged.categories as unknown[]).length === 0) {
          merged.categories = ["mainstream"];
        }

        await ctx.adv.updateCampaign(id, merged);
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
        await ctx.adv.setCampaignStatus(parsedIds, action);
        const idList = parsedIds.map((id) => `#${id}`).join(", ");
        return `${parsedIds.length} campaigns set to ${args.status}: ${idList}`;
      },
    );
  },
};
