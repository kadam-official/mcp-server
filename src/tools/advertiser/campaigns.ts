import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import * as api from "../../api/partners-client.js";
import {
  formatEntityList,
  clampPerPage,
  formatNumber,
} from "../../output-formatter.js";
import {
  CAMPAIGN_TYPE_MAP,
  CAMPAIGN_TYPE_NAME,
  PRICING_MODEL_MAP,
} from "../../types/advertiser.js";
import type { Campaign } from "../../types/advertiser.js";
import type { CampaignCreateParams } from "../../api/partners-client.js";
import type { ApiListResponse } from "../../types/common.js";
import { extractPagination } from "../../utils/pagination.js";

const STATUS_ACTION_MAP = {
  active: "turn-on",
  paused: "turn-off",
  archived: "archive",
} as const;

function formatCampaignRow(c: Campaign, index: number): string {
  const typeName = CAMPAIGN_TYPE_NAME[c.type] ?? `Type ${c.type}`;
  const budget =
    c.dayMoneyLimit > 0
      ? `${formatNumber(c.dayMoneyLimit)}/day`
      : c.commonMoneyLimit > 0
        ? `${formatNumber(c.commonMoneyLimit)} total`
        : "—";
  return `${index + 1}. [ID: ${c.id}] "${c.name}" (${typeName}, ${c.status}) Budget: ${budget} | Bid: ${formatNumber(c.bid)}`;
}

function mapCampaignFields(fields: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    pricingModel: "cpType",
    dailyBudget: "dayMoneyLimit",
    totalBudget: "commonMoneyLimit",
    evenDistribution: "isEvenDistribution",
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (key === "type" && typeof value === "string") {
      mapped.type = CAMPAIGN_TYPE_MAP[value] ?? value;
    } else if (key === "pricingModel" && typeof value === "string") {
      mapped.cpType = PRICING_MODEL_MAP[value] ?? value;
    } else if (key in fieldMap) {
      mapped[fieldMap[key]!] = value;
    } else {
      mapped[key] = value;
    }
  }
  return mapped;
}

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
      async (args) => {
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
        const res = (await api.listCampaigns(params)) as ApiListResponse;
        const items = (res.data ?? []) as Campaign[];
        const pagination = extractPagination(res);
        return formatEntityList(
          items,
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
        pricingModel: z.enum(["cpc", "cpm", "cpv", "cpa_target"]).describe("Pricing model"),
        bid: z.number().positive().describe("Bid amount in USD (e.g. 0.05)"),
        bidCountry: z.string().optional().default("ALL").describe("Country for bid, 'ALL' for global"),
        dailyBudget: z.number().positive().describe("Daily spending limit in USD"),
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
        totalBudget: z.number().optional().describe("Total campaign budget in USD"),
        evenDistribution: z.boolean().optional().describe("Spread budget evenly across the day"),
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
        timezone: z.number().optional().describe("Timezone offset in hours (e.g. 3 for UTC+3)"),
        schedule: z.string().optional().describe("Hour schedule bitmask for targeting specific hours"),
        frequencyCapViews: z.number().optional().describe("Max ad views per user in the cap period"),
        frequencyCapHours: z.number().optional().describe("Frequency cap period in hours"),
        impTracker: z.string().optional().describe("Third-party impression tracking pixel URL"),
        secondPush: z.boolean().optional().describe("Enable second push notification (push/inpage_push only)"),
        pauseAfterModeration: z.boolean().optional().describe("Pause campaign after creatives pass moderation"),
      },
      async (args) => {
        const { type, pricingModel, ...rest } = args;
        const mappedData = mapCampaignFields({ type, pricingModel, ...rest }) as CampaignCreateParams;
        const campaign = (await api.createCampaign(mappedData)) as Campaign;
        const typeName = CAMPAIGN_TYPE_NAME[campaign.type] ?? `Type ${campaign.type}`;
        return `Campaign created: [ID: ${campaign.id}] "${campaign.name}" (${typeName}) in folder #${args.folderId}`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_campaign",
        description: "Update an existing campaign. Pass id and any fields to change.",
        product: "advertiser",
      },
      {
        id: z.number().describe("Campaign ID to update"),
        type: z.enum(["push", "inpage_push", "native", "banner", "video", "popunder"]).optional().describe("Ad format"),
        name: z.string().min(1).optional().describe("Campaign name shown in dashboard"),
        url: z.string().url().optional().describe("Landing page URL"),
        folderId: z.number().optional().describe("Campaign folder ID"),
        pricingModel: z.enum(["cpc", "cpm", "cpv", "cpa_target"]).optional().describe("Pricing model"),
        bid: z.number().positive().optional().describe("Bid amount in USD (e.g. 0.05)"),
        bidCountry: z.string().optional().describe("Country for bid, 'ALL' for global"),
        dailyBudget: z.number().positive().optional().describe("Daily spending limit in USD"),
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
        totalBudget: z.number().optional().describe("Total campaign budget in USD"),
        evenDistribution: z.boolean().optional().describe("Spread budget evenly across the day"),
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
        timezone: z.number().optional().describe("Timezone offset in hours (e.g. 3 for UTC+3)"),
        schedule: z.string().optional().describe("Hour schedule bitmask for targeting specific hours"),
        frequencyCapViews: z.number().optional().describe("Max ad views per user in the cap period"),
        frequencyCapHours: z.number().optional().describe("Frequency cap period in hours"),
        impTracker: z.string().optional().describe("Third-party impression tracking pixel URL"),
        secondPush: z.boolean().optional().describe("Enable second push notification (push/inpage_push only)"),
        pauseAfterModeration: z.boolean().optional().describe("Pause campaign after creatives pass moderation"),
      },
      async (args) => {
        const { id, ...rest } = args;
        const mappedData = mapCampaignFields(rest);
        await api.updateCampaign(id, mappedData);
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
      async (args) => {
        const parsedIds = args.ids
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n));
        const action = STATUS_ACTION_MAP[args.status];
        await api.setCampaignStatus(parsedIds, action);
        const idList = parsedIds.map((id) => `#${id}`).join(", ");
        return `${parsedIds.length} campaigns set to ${args.status}: ${idList}`;
      },
    );
  },
};
