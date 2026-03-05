import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import {
  formatEntityList,
  clampPerPage,
  formatSingleEntity,
} from "../../output-formatter.js";
import type { Audience } from "../../api/schemas/advertiser.js";
import { extractPagination } from "../../utils/pagination.js";

function formatAudienceRow(a: Audience, index: number): string {
  return `${index + 1}. [ID: ${a.id}] "${a.name}" (type: ${a.type}, size: ${a.size}) Status: ${a.status} | Expire: ${a.expireDays} days`;
}

export const audiencesModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_list_audiences",
        description:
          "List advertiser audiences with pagination. Filter by search query, sort by field and order.",
        product: "advertiser",
        annotations: { readOnlyHint: true },
      },
      {
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        searchQuery: z.string().min(2).optional(),
        sortField: z.string().optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
      },
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);
        const params: Record<string, unknown> = {
          page: args.page,
          perPage,
          ...(args.searchQuery != null && { searchQuery: args.searchQuery }),
          ...(args.sortField != null && { sortField: args.sortField }),
          ...(args.sortOrder != null && { sortOrder: args.sortOrder }),
        };
        const res = await ctx.adv!.listAudiences(params);
        const items = res.rows ?? [];
        const pagination = extractPagination(res);
        return formatEntityList(
          items,
          formatAudienceRow,
          "Audiences",
          pagination,
        );
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_get_audience",
        description: "Get a single audience by ID.",
        product: "advertiser",
        annotations: { readOnlyHint: true },
      },
      {
        id: z.number(),
      },
      async (args, ctx) => {
        const a = await ctx.adv!.getAudience(args.id);
        return formatSingleEntity(`Audience #${a.id}`, [
          ["Name", a.name],
          ["Type", a.type],
          ["Expire Days", a.expireDays != null ? String(a.expireDays) : undefined],
          ["Size", a.size != null ? String(a.size) : undefined],
          ["Status", a.status],
          ["Campaigns", (a.campaignsIds ?? []).length > 0 ? (a.campaignsIds ?? []).join(", ") : undefined],
          ["hasClicks", a.hasClicks != null ? String(a.hasClicks) : undefined],
          ["hasConversions", a.hasConversions != null ? String(a.hasConversions) : undefined],
          ["hasHolds", a.hasHolds != null ? String(a.hasHolds) : undefined],
          ["hasRejects", a.hasRejects != null ? String(a.hasRejects) : undefined],
          ["Linked Audiences", (a.linkedAudiencesIds ?? []).length > 0 ? (a.linkedAudiencesIds ?? []).join(", ") : undefined],
        ]);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_audience",
        description:
          "Create a new audience. Required: type (audience|audience_code|fingerprint|s2s), name, expireDays.",
        product: "advertiser",
        annotations: { readOnlyHint: false },
      },
      {
        type: z.enum(["audience", "audience_code", "fingerprint", "s2s"]),
        name: z.string().min(1),
        expireDays: z.number(),
        campaignsIds: z.string().optional(),
        hasClicks: z.boolean().optional(),
        hasConversions: z.boolean().optional(),
        hasHolds: z.boolean().optional(),
        hasRejects: z.boolean().optional(),
        linkedAudiencesIds: z.string().optional(),
      },
      async (args, ctx) => {
        const data: Record<string, unknown> = {
          type: args.type,
          name: args.name,
          expireDays: args.expireDays,
          ...(args.campaignsIds != null && { campaignsIds: args.campaignsIds }),
          ...(args.hasClicks != null && { hasClicks: args.hasClicks }),
          ...(args.hasConversions != null && { hasConversions: args.hasConversions }),
          ...(args.hasHolds != null && { hasHolds: args.hasHolds }),
          ...(args.hasRejects != null && { hasRejects: args.hasRejects }),
          ...(args.linkedAudiencesIds != null && { linkedAudiencesIds: args.linkedAudiencesIds }),
        };
        const a = await ctx.adv!.createAudience(data);
        return `Audience created: [ID: ${a.id}] "${a.name}" (type: ${a.type})`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_audience",
        description: "Update an existing audience. Pass id and any fields to change.",
        product: "advertiser",
        annotations: { readOnlyHint: false },
      },
      {
        id: z.number(),
        type: z.enum(["audience", "audience_code", "fingerprint", "s2s"]).optional(),
        name: z.string().min(1).optional(),
        expireDays: z.number().optional(),
        campaignsIds: z.string().optional(),
        hasClicks: z.boolean().optional(),
        hasConversions: z.boolean().optional(),
        hasHolds: z.boolean().optional(),
        hasRejects: z.boolean().optional(),
        linkedAudiencesIds: z.string().optional(),
      },
      async (args, ctx) => {
        const { id, ...rest } = args;
        const data: Record<string, unknown> = {};
        if (rest.type != null) data.type = rest.type;
        if (rest.name != null) data.name = rest.name;
        if (rest.expireDays != null) data.expireDays = rest.expireDays;
        if (rest.campaignsIds != null) data.campaignsIds = rest.campaignsIds;
        if (rest.hasClicks != null) data.hasClicks = rest.hasClicks;
        if (rest.hasConversions != null) data.hasConversions = rest.hasConversions;
        if (rest.hasHolds != null) data.hasHolds = rest.hasHolds;
        if (rest.hasRejects != null) data.hasRejects = rest.hasRejects;
        if (rest.linkedAudiencesIds != null) data.linkedAudiencesIds = rest.linkedAudiencesIds;

        await ctx.adv!.updateAudience(id, data);
        return `Audience #${id} updated successfully.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_delete_audience",
        description:
          "Permanently delete an audience. Requires confirm=true for safety.",
        product: "advertiser",
        annotations: { destructiveHint: true },
      },
      {
        id: z.number(),
        confirm: z.literal(true),
      },
      async (args, ctx) => {
        await ctx.adv!.deleteAudience(args.id);
        return `Audience #${args.id} deleted permanently.`;
      },
    );
  },
};
