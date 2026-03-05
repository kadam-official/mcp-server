import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import * as api from "../../api/partners-client.js";
import {
  formatEntityList,
  clampPerPage,
} from "../../output-formatter.js";
import type { ApiListResponse } from "../../types/common.js";
import { extractPagination } from "../../utils/pagination.js";

const STATUS_ACTION_MAP = {
  active: "activate",
  paused: "pause",
  archived: "archive",
} as const;

interface CreativeRow {
  ad?: { id: number; title?: string; text?: string; status?: { id: string; label: string } };
  materialCampaign?: { id: number; name: string };
  views: string;
  clicks: string;
}

function formatCreativeRow(row: CreativeRow, index: number): string {
  const ad = row.ad;
  const campaign = row.materialCampaign;
  const id = ad?.id ?? "?";
  const title = ad?.title ?? "(no title)";
  const status = ad?.status?.label ?? ad?.status?.id ?? "—";
  const campaignInfo = campaign ? `Campaign: "${campaign.name}" (#${campaign.id})` : "";
  return `${index + 1}. [ID: ${id}] "${title}" | ${campaignInfo} | Status: ${status} | Views: ${row.views} | Clicks: ${row.clicks}`;
}

export const creativesModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_list_creatives",
        description:
          "List advertiser creatives with pagination. Filter by campaign, status, or search query.",
        product: "advertiser",
        annotations: { readOnlyHint: true },
      },
      {
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        campaignId: z.number().optional(),
        status: z.string().optional(),
        searchQuery: z.string().optional(),
      },
      async (args) => {
        const perPage = clampPerPage(args.perPage);
        const params: Record<string, unknown> = {
          page: args.page,
          perPage,
          ...(args.campaignId != null && { campaignId: args.campaignId }),
          ...(args.status != null && { status: args.status }),
          ...(args.searchQuery != null && { searchQuery: args.searchQuery }),
        };
        const res = (await api.listCreatives(params)) as ApiListResponse;
        const items = (res.rows ?? []) as CreativeRow[];
        const pagination = extractPagination(res);
        return formatEntityList(
          items,
          formatCreativeRow,
          "Creatives",
          pagination,
        );
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_creative",
        description:
          "Create a new creative for a campaign. Required: campaignId, url.",
        product: "advertiser",
        annotations: { readOnlyHint: false },
      },
      {
        campaignId: z.number(),
        url: z.string().url(),
        title: z.string().optional(),
        text: z.string().optional(),
        name: z.string().optional(),
        imageUrl: z.string().optional(),
        iconUrl: z.string().optional(),
        bannerSizeId: z.number().optional(),
        isHtml5: z.boolean().optional(),
        bid: z.number().optional(),
        bidCountry: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        pauseAfterModeration: z.boolean().optional().default(false),
      },
      async (args) => {
        const { campaignId, ...rest } = args;
        const data: Record<string, unknown> = {
          url: rest.url,
          ...(rest.title != null && { title: rest.title }),
          ...(rest.text != null && { text: rest.text }),
          ...(rest.name != null && { name: rest.name }),
          ...(rest.imageUrl != null && { imageUrl: rest.imageUrl }),
          ...(rest.iconUrl != null && { iconUrl: rest.iconUrl }),
          ...(rest.bannerSizeId != null && { bannerSizeId: rest.bannerSizeId }),
          ...(rest.isHtml5 != null && { isHtml5: rest.isHtml5 }),
          ...(rest.bid != null && { bid: rest.bid }),
          ...(rest.bidCountry != null && { bidCountry: rest.bidCountry }),
          ...(rest.startDate != null && { startDate: rest.startDate }),
          ...(rest.endDate != null && { endDate: rest.endDate }),
          ...(rest.pauseAfterModeration != null && { pauseAfterModeration: rest.pauseAfterModeration }),
        };
        const c = await api.createCreative(campaignId, data);
        return `Creative created: [ID: ${c.id}] for campaign #${campaignId}. Status: pending moderation.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_creative",
        description: "Update an existing creative. Pass campaignId, creativeId and any fields to change.",
        product: "advertiser",
        annotations: { readOnlyHint: false },
      },
      {
        campaignId: z.number(),
        creativeId: z.number(),
        url: z.string().url().optional(),
        title: z.string().optional(),
        text: z.string().optional(),
        name: z.string().optional(),
        imageUrl: z.string().optional(),
        iconUrl: z.string().optional(),
        bannerSizeId: z.number().optional(),
        isHtml5: z.boolean().optional(),
        bid: z.number().optional(),
        bidCountry: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        pauseAfterModeration: z.boolean().optional(),
      },
      async (args) => {
        const { campaignId, creativeId, ...rest } = args;
        const data: Record<string, unknown> = { id: creativeId };
        if (rest.url != null) data.url = rest.url;
        if (rest.title != null) data.title = rest.title;
        if (rest.text != null) data.text = rest.text;
        if (rest.name != null) data.name = rest.name;
        if (rest.imageUrl != null) data.imageUrl = rest.imageUrl;
        if (rest.iconUrl != null) data.iconUrl = rest.iconUrl;
        if (rest.bannerSizeId != null) data.bannerSizeId = rest.bannerSizeId;
        if (rest.isHtml5 != null) data.isHtml5 = rest.isHtml5;
        if (rest.bid != null) data.bid = rest.bid;
        if (rest.bidCountry != null) data.bidCountry = rest.bidCountry;
        if (rest.startDate != null) data.startDate = rest.startDate;
        if (rest.endDate != null) data.endDate = rest.endDate;
        if (rest.pauseAfterModeration != null) data.pauseAfterModeration = rest.pauseAfterModeration;

        await api.updateCreative(campaignId, data);
        return `Creative #${creativeId} updated successfully.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_set_creative_status",
        description:
          "Set status for multiple creatives. Pass comma-separated IDs and status: active, paused, or archived.",
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
        const action = STATUS_ACTION_MAP[args.status] as "activate" | "pause" | "archive";
        await api.setCreativeStatus(parsedIds, action);
        const idList = parsedIds.map((id) => `#${id}`).join(", ");
        return `${parsedIds.length} creatives set to ${args.status}: ${idList}`;
      },
    );
  },
};
