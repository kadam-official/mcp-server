import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatEntityList, clampPerPage } from "../../output-formatter.js";
import { CAMPAIGN_TYPE_MAP, PRICING_MODEL_MAP } from "../../types/advertiser.js";
import { extractPagination } from "../../utils/pagination.js";
import {
  ADV_STATUS_ACTION_MAP,
  CAMPAIGN_LIST_STATUS_FILTER,
  parseCommaSeparatedIds,
} from "../../utils/status-actions.js";
import type { CampaignRow } from "../../api/schemas/advertiser.js";
import { flattenCategoryIds } from "../../api/options-registry.js";
import type { OptionsRegistry, CampaignOptions } from "../../api/options-registry.js";

function formatCampaignRow(row: CampaignRow, index: number): string {
  const c = row.campaign;
  return `${index + 1}. [ID: ${c.id}] "${c.name}" (${c.type?.label ?? c.type?.id}, ${c.state?.label ?? c.state?.id}) Budget: ${row.dayMoneyLimit}/day | Model: ${c.model} | Creatives: ${c.active}/${c.total}`;
}

const CONNECTION_TYPE_MAP: Record<string, number> = {
  wifi: 1,
  cellular: 2,
  unknown: 3,
  all: 3,
};

/**
 * Writable campaign fields, mirroring the backend create/update form
 * (adv/modules/campaigns/forms/campaigns/CampaignCreateForm.php — CampaignUpdateForm
 * extends the same base form). The update endpoint is a full replace, so the
 * read-modify-write payload must carry every writable field and NOTHING else:
 * read-only view keys (id, status, state, ...) must be dropped, or they pollute
 * the form. subAges is part of this set, so it round-trips on unrelated edits.
 */
const CAMPAIGN_WRITABLE_FIELDS = new Set<string>([
  "type",
  "pushType",
  "isNeedSecondPush",
  "allowMultiAds",
  "folderId",
  "name",
  "cpType",
  "maxCpm",
  "isEasyStart",
  "url",
  "clickPostback",
  "hasCorrectPostback",
  "impTracker",
  "conversion",
  "bids",
  "cities",
  "isps",
  "platformVersions",
  "devices",
  "browsers",
  "languages",
  "connectionType",
  "categories",
  "gender",
  "age",
  "newAudiences",
  "audiences",
  "sites",
  "ips",
  "disableProxy",
  "proxies",
  "subAges",
  "macrosGroups",
  "videoFormats",
  "ssps",
  "commonMoneyLimit",
  "dayMoneyLimit",
  "isDirectTrafficPriority",
  "isEvenDistribution",
  "totalLossLimit",
  "materialViews",
  "campaignView",
  "minBlockViews",
  "maxBlockViews",
  "dayClickLimit",
  "dayConversionsLimit",
  "startDate",
  "stopDate",
  "timezone",
  "isPauseAfterModerate",
  "time",
  "isConversionFromPostback",
  "isApplyNewDomainToAds",
  "forecastMaxBid",
  "forecastMinBid",
  "autorules",
  "postConversion",
]);

/** Keep only writable fields from a GET campaign detail; drops read-only keys (id, status, state, ...). */
function pickWritable(current: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CAMPAIGN_WRITABLE_FIELDS) {
    if (current[key] !== undefined) out[key] = current[key];
  }
  return out;
}

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
      const geoIds =
        typeof countriesArg === "string" && countriesArg
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
      if (typeof value === "string")
        mapped.platformVersions = await registry.resolveIds("platform", value);
      break;
    case "browsers":
      if (typeof value === "string") mapped.browsers = await registry.resolveIds("browser", value);
      break;
    case "languages":
      if (typeof value === "string")
        mapped.languages = await registry.resolveIds("language", value);
      break;
    case "frequencyCapViews":
    case "frequencyCapDays":
    case "campaignCapViews":
    case "campaignCapDays":
    case "schedule":
      break; // handled after mapField loop
    case "postViewWindow":
    case "postClickWindow":
    case "countFirstConversionOnly":
    case "countLastCampaignOnly":
    case "postClickAttrPriority":
    case "postConversionAudienceIds":
      break; // handled in buildPostConversion
    case "conversionTemplateId":
    case "conversionApproved":
    case "conversionHold":
    case "conversionReject":
      break; // handled after loop
    case "countries":
    case "audienceIncludeIds":
    case "audienceExcludeIds":
    case "siteWhitelist":
    case "siteBlacklist":
    case "sspMode":
    case "sspIds":
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
  const { push, inpage_push, popunder } = CAMPAIGN_TYPE_MAP;

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

  if (
    pvWindow == null &&
    pcWindow == null &&
    firstOnly == null &&
    lastCampaign == null &&
    clickPriority == null &&
    audienceIdsStr == null
  ) {
    return undefined;
  }

  const audiences = audienceIdsStr
    ? audienceIdsStr.split(",").map((s) => parseInt(s.trim(), 10))
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

function parseSchedule(schedule: string): {
  mode: number;
  list: Array<{ day: number; hours: number[] }>;
} {
  const hours = schedule
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((h) => h >= 0 && h <= 23);
  return {
    mode: 1,
    list: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, hours })),
  };
}

function buildAudiences(fields: Record<string, unknown>): Record<string, unknown> {
  const includeIds = fields.audienceIncludeIds;
  const excludeIds = fields.audienceExcludeIds;
  return {
    mode: 20,
    include:
      typeof includeIds === "string"
        ? includeIds.split(",").map((s) => parseInt(s.trim(), 10))
        : [],
    exclude:
      typeof excludeIds === "string"
        ? excludeIds.split(",").map((s) => parseInt(s.trim(), 10))
        : [],
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
        throw new Error(
          `Bid ${bidVal} exceeds maximum ${maxBid} for this account. Reduce bid or contact support.`,
        );
      }
    }
  }

  mapped.audiences = buildAudiences(fields);

  if (typeof fields.siteWhitelist === "string") {
    mapped.sites = {
      mode: 1,
      list: fields.siteWhitelist.split(",").map((s) => parseInt(s.trim(), 10)),
    };
  } else if (typeof fields.siteBlacklist === "string") {
    mapped.sites = {
      mode: 0,
      list: fields.siteBlacklist.split(",").map((s) => parseInt(s.trim(), 10)),
    };
  }

  if (fields.sspIds != null) {
    mapped.ssps = {
      mode: fields.sspMode === "whitelist" || fields.sspMode == null,
      list: (fields.sspIds as string).split(",").map(Number),
    };
  }

  if (fields.conversionTemplateId != null || fields.conversionApproved != null) {
    mapped.conversion = {
      id: (fields.conversionTemplateId as number) ?? 0,
      approved: (fields.conversionApproved as string) ?? "",
      hold: (fields.conversionHold as string) ?? "",
      reject: (fields.conversionReject as string) ?? "",
    };
  }

  const customPostConversion = buildPostConversion(fields);
  if (customPostConversion) {
    mapped.postConversion = customPostConversion;
  }

  if (typeof fields.schedule === "string") {
    mapped.time = parseSchedule(fields.schedule);
  }

  if (fields.frequencyCapViews != null || fields.frequencyCapDays != null) {
    mapped.materialViews = {
      count: (fields.frequencyCapViews as number) ?? 0,
      days: (fields.frequencyCapDays as number) ?? 0,
    };
  }

  if (fields.campaignCapViews != null || fields.campaignCapDays != null) {
    mapped.campaignView = {
      count: (fields.campaignCapViews as number) ?? 0,
      days: (fields.campaignCapDays as number) ?? 0,
    };
  }

  applyDefaults(mapped);
  applyTypeDefaults(mapped, opts);

  return mapped;
}

const campaignTargetingFields = {
  countries: z.string().optional().describe("Comma-separated ISO country codes (e.g. 'US,DE,BR')"),
  devices: z
    .string()
    .optional()
    .describe("Comma-separated device names or IDs (e.g. 'Desktop,Smartphone' or '1,4')"),
  os: z
    .string()
    .optional()
    .describe("Comma-separated OS names or IDs (e.g. 'Android,iOS' or '10,20')"),
  browsers: z
    .string()
    .optional()
    .describe("Comma-separated browser names or IDs (e.g. 'Chrome,Firefox' or '8,16')"),
  languages: z.string().optional().describe("Comma-separated language names or IDs"),
  connectionType: z
    .enum(["wifi", "cellular", "all", "unknown"])
    .optional()
    .describe("Network connection type filter (all = no filter)"),
  audienceIncludeIds: z.string().optional().describe("Comma-separated audience IDs to include"),
  audienceExcludeIds: z.string().optional().describe("Comma-separated audience IDs to exclude"),
  siteWhitelist: z.string().optional().describe("Comma-separated site IDs for whitelist"),
  siteBlacklist: z.string().optional().describe("Comma-separated site IDs for blacklist"),
  sspMode: z
    .enum(["whitelist", "blacklist"])
    .optional()
    .describe("SSP list mode: whitelist (allow listed) or blacklist (block listed)"),
  sspIds: z.string().optional().describe("Comma-separated SSP IDs for the whitelist/blacklist"),
};

const campaignBudgetFields = {
  totalBudget: z.number().optional().describe("Total campaign budget in USD"),
  evenDistribution: z.boolean().optional().describe("Spread budget evenly across the day"),
  startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
  timezone: z.number().optional().describe("Timezone offset in hours (e.g. 3 for UTC+3)"),
  schedule: z
    .string()
    .optional()
    .describe("Comma-separated hours (0-23) to show ads, applied to all days (e.g. '9,10,11,17')"),
  frequencyCapViews: z
    .number()
    .optional()
    .describe("Creative-level cap: max views of ONE creative per user within frequencyCapDays"),
  frequencyCapDays: z.number().optional().describe("Window in days for frequencyCapViews"),
  campaignCapViews: z
    .number()
    .optional()
    .describe(
      "Campaign-level cap: max views of ANY creative from this campaign per user within campaignCapDays",
    ),
  campaignCapDays: z.number().optional().describe("Window in days for campaignCapViews"),
  impTracker: z.string().optional().describe("Third-party impression tracking pixel URL"),
  categories: z
    .string()
    .optional()
    .describe(
      "Comma-separated category IDs from kadam://reference/categories (or the 'mainstream'/'adult' keyword)",
    ),
  secondPush: z
    .boolean()
    .optional()
    .describe("Enable second push notification (push/inpage_push only)"),
  pauseAfterModeration: z
    .boolean()
    .optional()
    .describe("Pause campaign after creatives pass moderation"),
  conversionTemplateId: z
    .number()
    .optional()
    .describe(
      "Conversion template ID (from campaign options). Use 0 for custom mapping via conversionApproved/Hold/Reject",
    ),
  conversionApproved: z
    .string()
    .optional()
    .describe(
      "Postback status name for 'Approved' conversions (e.g. 'dep'); used with conversionTemplateId=0",
    ),
  conversionHold: z
    .string()
    .optional()
    .describe("Postback status name for 'Hold' conversions (e.g. 'reg')"),
  conversionReject: z
    .string()
    .optional()
    .describe("Postback status name for 'Rejected' conversions"),
};

const postConversionFields = {
  postViewWindow: z
    .number()
    .min(1)
    .max(168)
    .optional()
    .describe("Post-view attribution window in hours (1-168)"),
  postClickWindow: z
    .number()
    .min(1)
    .max(168)
    .optional()
    .describe("Post-click attribution window in hours (1-168)"),
  countFirstConversionOnly: z
    .boolean()
    .optional()
    .describe("Count only the first conversion per user (default: true)"),
  countLastCampaignOnly: z
    .boolean()
    .optional()
    .describe("Attribute conversion only to the last campaign impression (default: true)"),
  postClickAttrPriority: z
    .boolean()
    .optional()
    .describe("Post-click attribution takes priority over post-view (default: true)"),
  postConversionAudienceIds: z
    .string()
    .optional()
    .describe("Comma-separated audience IDs for post-conversion retargeting"),
};

export const campaignsModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_list_campaigns",
        description:
          "List advertiser campaigns with pagination. Filter by campaign group (folderId), status, type, date range, or search query.",
        product: "advertiser",
        annotations: { title: "List campaigns", readOnlyHint: true },
      },
      {
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        folderId: z.number().optional(),
        status: z.enum(["active", "paused", "archived", "moderation"]).optional(),
        type: z.enum(["push", "inpage_push", "native", "banner", "video", "popunder"]).optional(),
        searchQuery: z.string().min(2).optional().describe("Campaign name/domain or campaign ID"),
        dateFrom: z
          .string()
          .optional()
          .describe("Stats range start (YYYY-MM-DD); pass with dateTo"),
        dateTo: z.string().optional().describe("Stats range end (YYYY-MM-DD); pass with dateFrom"),
        sortField: z
          .string()
          .optional()
          .describe(
            "Sort column: campaign, dateCreation, views, clicks, moneyOut, CPC, CPM, CPA, CTR, CR, ROI, conversions, holds, rejects, profit",
          ),
        sortOrder: z.enum(["asc", "desc"]).optional(),
      },
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);

        // The API reads filters/sort only from nested `filters` and `sort` objects;
        // anything sent flat at the top level is silently ignored.
        const filters: Record<string, unknown> = {};
        if (args.folderId != null) filters.folderId = args.folderId;
        if (args.status != null) Object.assign(filters, CAMPAIGN_LIST_STATUS_FILTER[args.status]);
        if (args.type != null) filters.types = [CAMPAIGN_TYPE_MAP[args.type]];
        if (args.searchQuery != null) filters.searchQuery = args.searchQuery;
        if (args.dateFrom != null && args.dateTo != null) {
          filters.dateFrom = args.dateFrom;
          filters.dateTo = args.dateTo;
        }

        const params: Record<string, unknown> = { page: args.page, perPage };
        if (args.sortField != null) {
          params.sort = { [args.sortField]: args.sortOrder ?? "desc" };
        }
        if (Object.keys(filters).length > 0) params.filters = filters;

        const res = await ctx.adv.listCampaigns(params);
        const pagination = extractPagination(res);
        return formatEntityList(res.rows, formatCampaignRow, "Campaigns", pagination);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_campaign",
        description:
          "Create a new advertiser campaign. Required: type, name, url, folderId (campaign group ID), pricingModel, bid, dailyBudget.",
        product: "advertiser",
        annotations: { title: "Create campaign", readOnlyHint: false },
      },
      {
        type: z
          .enum(["push", "inpage_push", "native", "banner", "video", "popunder"])
          .describe("Ad format"),
        name: z.string().min(1).describe("Campaign name shown in dashboard"),
        url: z.string().url().describe("Landing page URL"),
        folderId: z.number().describe("Campaign group ID (API field: folderId)"),
        pricingModel: z
          .enum(["cpc", "cpm", "cpa_target"])
          .describe("Pricing model: cpc, cpm, or cpa_target"),
        bid: z
          .number()
          .positive()
          .describe("Bid amount in USD (e.g. 0.05). For cpa_target this is the target CPA cost"),
        dailyBudget: z.number().positive().describe("Daily spending limit in USD"),
        ...campaignTargetingFields,
        ...campaignBudgetFields,
        ...postConversionFields,
        countries: z
          .string()
          .describe(
            "Comma-separated ISO country codes for bid targeting (e.g. 'US,DE,BR'). Required.",
          ),
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
        return `Campaign created: [ID: ${result.id}] "${args.name}" in campaign group #${args.folderId}`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_campaign",
        description:
          "Update a campaign (read-modify-write): pass only the fields to change, same names as create. " +
          "Handles all targeting/budget/bid/schedule/conversion edits. For status changes use set_campaign_status.",
        product: "advertiser",
        annotations: { title: "Update campaign", readOnlyHint: false },
      },
      {
        id: z.number().describe("Campaign ID to update"),
        name: z.string().min(1).optional().describe("Campaign name shown in dashboard"),
        url: z.string().url().optional().describe("Landing page URL"),
        folderId: z.number().optional().describe("Campaign group ID (API field: folderId)"),
        dailyBudget: z.number().optional().describe("Daily spending limit in USD"),
        bid: z
          .number()
          .positive()
          .optional()
          .describe("Bid amount in USD. For cpa_target this is the target CPA cost"),
        disableProxy: z.boolean().optional().describe("Block proxy/VPN traffic"),
        subscriptionAges: z
          .string()
          .optional()
          .describe(
            "Comma-separated subscription-age IDs (push / in-page push only; see campaign options 'subAges'). " +
              "Replaces the current set. Example: '1' = newest only.",
          ),
        ...campaignTargetingFields,
        ...campaignBudgetFields,
        ...postConversionFields,
      },
      async (args, ctx) => {
        const { id, ...changes } = args;
        const current = await ctx.adv.getCampaign(id);
        const merged = pickWritable(current);

        const cpType = merged.cpType as number | undefined;
        const registry = ctx.adv.options;

        if (changes.name != null) merged.name = changes.name;
        if (changes.url != null) merged.url = changes.url;
        if (changes.folderId != null) merged.folderId = changes.folderId;
        if (changes.dailyBudget != null) merged.dayMoneyLimit = changes.dailyBudget;
        if (changes.totalBudget != null) merged.commonMoneyLimit = changes.totalBudget;
        if (changes.evenDistribution != null)
          merged.isEvenDistribution = changes.evenDistribution ? 1 : 0;
        if (changes.disableProxy != null) merged.disableProxy = changes.disableProxy ? 1 : 0;
        if (changes.subscriptionAges != null) {
          merged.subAges = changes.subscriptionAges
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n));
        }
        if (changes.startDate != null) merged.startDate = changes.startDate;
        if ((changes as Record<string, unknown>).endDate !== undefined)
          merged.stopDate = (changes as Record<string, unknown>).endDate;
        if (changes.timezone != null) merged.timezone = changes.timezone;
        if (changes.impTracker !== undefined) merged.impTracker = changes.impTracker;
        if (changes.secondPush != null) merged.isNeedSecondPush = changes.secondPush ? 1 : 0;
        if (changes.pauseAfterModeration != null)
          merged.isPauseAfterModerate = changes.pauseAfterModeration ? 1 : 0;

        if (changes.connectionType != null) {
          merged.connectionType =
            typeof changes.connectionType === "string"
              ? (CONNECTION_TYPE_MAP[changes.connectionType] ?? 3)
              : changes.connectionType;
        }

        if (changes.devices != null)
          merged.devices = await registry.resolveIds("device", changes.devices);
        if (changes.os != null)
          merged.platformVersions = await registry.resolveIds("platform", changes.os);
        if (changes.browsers != null)
          merged.browsers = await registry.resolveIds("browser", changes.browsers);
        if (changes.languages != null)
          merged.languages = await registry.resolveIds("language", changes.languages);

        if (changes.categories != null) {
          merged.categories = changes.categories.split(",").map((s: string) => {
            const n = parseInt(s.trim(), 10);
            return isNaN(n) ? s.trim() : n;
          });
        }

        if (changes.audienceIncludeIds != null || changes.audienceExcludeIds != null) {
          const currentAud = (merged.audiences ?? {}) as Record<string, unknown>;
          merged.audiences = {
            mode: currentAud.mode ?? 20,
            include: changes.audienceIncludeIds
              ? changes.audienceIncludeIds.split(",").map((s) => parseInt(s.trim(), 10))
              : (currentAud.include ?? []),
            exclude: changes.audienceExcludeIds
              ? changes.audienceExcludeIds.split(",").map((s) => parseInt(s.trim(), 10))
              : (currentAud.exclude ?? []),
          };
        }

        if (changes.siteWhitelist != null) {
          merged.sites = {
            mode: 1,
            list: changes.siteWhitelist.split(",").map((s) => parseInt(s.trim(), 10)),
          };
        } else if (changes.siteBlacklist != null) {
          merged.sites = {
            mode: 0,
            list: changes.siteBlacklist.split(",").map((s) => parseInt(s.trim(), 10)),
          };
        }

        if (changes.sspIds != null) {
          merged.ssps = {
            mode: changes.sspMode === "whitelist" || changes.sspMode == null,
            list: changes.sspIds.split(",").map((s) => parseInt(s.trim(), 10)),
          };
        }

        if (changes.schedule != null) {
          merged.time = parseSchedule(changes.schedule);
        }

        if (changes.frequencyCapViews != null || changes.frequencyCapDays != null) {
          const currentMv = (merged.materialViews ?? {}) as Record<string, unknown>;
          merged.materialViews = {
            count: changes.frequencyCapViews ?? currentMv.count ?? 0,
            days: changes.frequencyCapDays ?? currentMv.days ?? 0,
          };
        }

        if (changes.campaignCapViews != null || changes.campaignCapDays != null) {
          const currentCv = (merged.campaignView ?? {}) as Record<string, unknown>;
          merged.campaignView = {
            count: changes.campaignCapViews ?? currentCv.count ?? 0,
            days: changes.campaignCapDays ?? currentCv.days ?? 0,
          };
        }

        const currentPc = (merged.postConversion ?? {}) as Record<string, unknown>;
        const pcOverrides: Record<string, unknown> = {};
        if (changes.postViewWindow !== undefined)
          pcOverrides.windowLengthPostView = changes.postViewWindow;
        if (changes.postClickWindow !== undefined)
          pcOverrides.windowLengthPostClick = changes.postClickWindow;
        if (changes.countFirstConversionOnly !== undefined)
          pcOverrides.countFirstConversionOnly = changes.countFirstConversionOnly;
        if (changes.countLastCampaignOnly !== undefined)
          pcOverrides.countLastCampaignOnly = changes.countLastCampaignOnly;
        if (changes.postClickAttrPriority !== undefined)
          pcOverrides.postClickAttrPriority = changes.postClickAttrPriority;
        if (changes.postConversionAudienceIds !== undefined) {
          const raw = changes.postConversionAudienceIds;
          pcOverrides.audiences = raw
            ? raw
                .split(",")
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => !isNaN(n))
            : [];
        }
        if (Object.keys(pcOverrides).length > 0) {
          merged.postConversion = { ...currentPc, ...pcOverrides };
        }

        const currentBids = merged.bids as Array<Record<string, unknown>> | undefined;
        if (changes.bid != null) {
          const existingCountries = (currentBids?.[0]?.countries ?? []) as number[];
          const countries = changes.countries
            ? await registry.resolveCountryIds(changes.countries)
            : existingCountries;
          if (cpType === 4) {
            merged.bids = [{ leadCost: changes.bid, countries }];
          } else {
            merged.bids = [{ bid: changes.bid, leadCost: 0, countries }];
          }
        } else if (changes.countries != null) {
          const resolvedCountries = await registry.resolveCountryIds(changes.countries);
          if (currentBids?.[0]) {
            merged.bids = [{ ...currentBids[0], countries: resolvedCountries }];
          }
        }

        if (
          changes.conversionTemplateId != null ||
          changes.conversionApproved != null ||
          changes.conversionHold != null ||
          changes.conversionReject != null
        ) {
          const currentConv = (merged.conversion ?? {}) as Record<string, unknown>;
          merged.conversion = {
            id: changes.conversionTemplateId ?? currentConv.id ?? 0,
            approved: changes.conversionApproved ?? currentConv.approved ?? "",
            hold: changes.conversionHold ?? currentConv.hold ?? "",
            reject: changes.conversionReject ?? currentConv.reject ?? "",
          };
        }

        // id/status are read-only view keys; pickWritable already excludes them.
        merged.newAudiences ??= [];

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
        annotations: { title: "Set campaign status", idempotentHint: true },
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

    wrapper.register(
      {
        name: "kadam_adv_update_campaign_bid",
        description:
          "Change ONLY the bid for countries the campaign ALREADY targets (does NOT change geo). " +
          "To add or change countries use kadam_adv_update_campaign. " +
          "Unknown countries error out; omit countries to re-bid all current ones.",
        product: "advertiser",
        annotations: { title: "Update campaign bid", idempotentHint: true },
      },
      {
        id: z.number().describe("Campaign ID"),
        bid: z.number().positive().describe("Bid value in USD (e.g. 0.05)"),
        countries: z
          .string()
          .optional()
          .describe(
            "Which of the campaign's EXISTING countries to re-bid (e.g. 'US,DE') — not for adding countries. " +
              "If omitted, re-bids all current countries.",
          ),
      },
      async (args, ctx) => {
        const registry = ctx.adv.options;
        const current = await ctx.adv.getCampaign(args.id);
        const cpType = current.cpType as number | undefined;

        const currentBids = current.bids as Array<Record<string, unknown>> | undefined;

        if (args.countries) {
          const configured = new Set<number>(
            (currentBids ?? []).flatMap((b) => (b.countries as number[] | undefined) ?? []),
          );
          const countryMap = await registry.getCountryMap();
          const notTargeted = args.countries
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
            .filter((code) => {
              const geoId = countryMap.get(code);
              return geoId == null || !configured.has(geoId);
            });
          if (notTargeted.length > 0) {
            throw new Error(
              `Campaign #${args.id} does not target: ${notTargeted.join(", ")}. ` +
                `update_campaign_bid only adjusts bids for countries already on the campaign — ` +
                `use kadam_adv_update_campaign (countries=...) to change geo targeting.`,
            );
          }
        }

        const countries = args.countries
          ? await registry.resolveCountryIds(args.countries)
          : ((currentBids?.[0]?.countries as number[]) ?? []);

        const bidEntry =
          cpType === 4
            ? { leadCost: args.bid, countries }
            : { bid: args.bid, leadCost: 0, countries };

        await ctx.adv.updateCampaignBid(args.id, [bidEntry]);
        return `Bid for campaign #${args.id} updated to ${args.bid}.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_bulk_update_bids",
        description:
          "Set the same bid on multiple campaigns at once. " +
          "All campaigns in the batch must share one pricing model (mixing CPC/CPA errors out). " +
          "Countries are required (backend rejects an empty list).",
        product: "advertiser",
        annotations: { title: "Bulk update bids", idempotentHint: true },
      },
      {
        campaignIds: z
          .string()
          .min(1)
          .describe("Comma-separated campaign IDs (e.g. '100,200,300')"),
        bid: z
          .number()
          .positive()
          .describe("Bid value in USD (for CPA this is the target CPA cost)"),
        pricingModel: z
          .enum(["cpc", "cpm", "cpa_target"])
          .describe("Pricing model of the campaigns. All campaigns must share this model"),
        countries: z
          .string()
          .min(1)
          .describe(
            "Comma-separated ISO country codes (e.g. 'US,DE'). Required — backend rejects empty list",
          ),
      },
      async (args, ctx) => {
        const ids = parseCommaSeparatedIds(args.campaignIds);
        const registry = ctx.adv.options;
        const countries = await registry.resolveCountryIds(args.countries);
        const cpType = PRICING_MODEL_MAP[args.pricingModel];

        const bidEntry =
          cpType === 4
            ? { leadCost: args.bid, countries }
            : { bid: args.bid, leadCost: 0, countries };

        await ctx.adv.bulkUpdateCampaignBids(ids, [bidEntry]);
        const idList = ids.map((id) => `#${id}`).join(", ");
        return `Bids updated for ${ids.length} campaigns: ${idList}. Bid: ${args.bid}`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_site_bids",
        description:
          "Set per-site (zone) bids for campaigns. Bid is a number ('0.05'), a multiplier ('x1.5'), or '0' to remove.",
        product: "advertiser",
        annotations: { title: "Update site bids", idempotentHint: true },
      },
      {
        campaignIds: z.string().min(1).describe("Comma-separated campaign IDs"),
        zones: z.string().min(1).describe("Comma-separated site (zone) IDs to set bids for"),
        bid: z
          .string()
          .describe("Bid value: number ('0.05'), multiplier ('x1.5'), or '0' to remove"),
      },
      async (args, ctx) => {
        const campaignIds = parseCommaSeparatedIds(args.campaignIds);
        const zoneIds = parseCommaSeparatedIds(args.zones);

        await ctx.adv.updateSiteBids(campaignIds, [{ zones: zoneIds, bid: args.bid }]);
        return `Site bids updated for ${campaignIds.length} campaign(s). Zones: ${zoneIds.join(", ")} → bid: ${args.bid}`;
      },
    );
  },
};
