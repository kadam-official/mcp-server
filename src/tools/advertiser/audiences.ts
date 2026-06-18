import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatEntityList, clampPerPage, formatSingleEntity } from "../../output-formatter.js";
import type { AudienceRow, AudienceDetail } from "../../api/schemas/advertiser.js";
import { extractPagination } from "../../utils/pagination.js";

function formatAudienceRow(a: AudienceRow, index: number): string {
  return `${index + 1}. [ID: ${a.audienceId}] "${a.audienceName}" (type: ${a.type}) Expire: ${a.expireDays}d | Reach today: ${a.reachToday} | New 7d: ${a.new7d}`;
}

function formatAudienceDetail(a: AudienceDetail): string {
  const pairs: [string, string | undefined][] = [
    ["Name", a.name],
    ["Type", a.type],
    ["Expire Days", String(a.expireDays)],
  ];

  if (a.audienceCode) pairs.push(["Audience Code", a.audienceCode]);

  if (a.type === "audience") {
    const flags = [
      a.hasClicks && "clicks",
      a.hasConversions && "conversions",
      a.hasHolds && "holds",
      a.hasRejects && "rejects",
    ]
      .filter(Boolean)
      .join(", ");
    if (flags) pairs.push(["Tracking", flags]);
    if (a.campaigns) {
      const cmpList = Object.entries(a.campaigns)
        .map(([id, name]) => `${name} (#${id})`)
        .join("; ");
      pairs.push(["Campaigns", cmpList]);
    }
  }

  if (a.type === "s2s" && a.linkedAudiences) {
    const linked = Object.entries(a.linkedAudiences)
      .map(([id, name]) => `${name} (#${id})`)
      .join("; ");
    pairs.push(["Linked Audiences", linked]);
  }

  if (a.type === "audience_code" && a.extAudienceId) {
    pairs.push(["Ext Audience ID", String(a.extAudienceId)]);
  }

  if (a.fp && typeof a.fp === "object" && "id" in a.fp) {
    pairs.push(["Fingerprint Audience", `${a.fp.name} (#${a.fp.id})`]);
  }

  return formatSingleEntity(`Audience #${a.id}`, pairs);
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
        annotations: { title: "List audiences", readOnlyHint: true },
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

        // searchQuery/sort must be nested; flat top-level keys are ignored by the API.
        const params: Record<string, unknown> = { page: args.page, perPage };
        if (args.searchQuery != null) params.filters = { searchQuery: args.searchQuery };
        if (args.sortField != null) {
          params.sort = { [args.sortField]: args.sortOrder ?? "desc" };
        }

        const res = await ctx.adv.listAudiences(params);
        const items = res.rows ?? [];
        const pagination = extractPagination(res);
        return formatEntityList(items, formatAudienceRow, "Audiences", pagination);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_get_audience",
        description:
          "Get a single audience by ID. Returns type-specific details: tracking code for pixel/s2s, campaign links for stat, linked audiences for s2s.",
        product: "advertiser",
        annotations: { title: "Get audience details", readOnlyHint: true },
      },
      {
        id: z.number(),
      },
      async (args, ctx) => {
        const a = await ctx.adv.getAudience(args.id);
        return formatAudienceDetail(a);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_audience",
        description: [
          "Create an audience. Required fields by type:",
          "• audience_code (pixel) — name, expireDays; optional createFingerprint.",
          "• audience (stat) — name, expireDays, campaignIds, plus >=1 of hasClicks/hasConversions/hasHolds/hasRejects.",
          "• s2s — name, expireDays, linkedAudienceIds (pixel/fingerprint IDs).",
          "• fingerprint — not created directly; set createFingerprint=true on a pixel/stat audience.",
        ].join("\n"),
        product: "advertiser",
        annotations: { title: "Create audience", readOnlyHint: false },
      },
      {
        type: z.enum(["audience", "audience_code", "s2s"]),
        name: z.string().min(1),
        expireDays: z.number().min(1).max(365),
        campaignIds: z
          .string()
          .optional()
          .describe("Comma-separated campaign IDs (required for type=audience)"),
        hasClicks: z.boolean().optional().describe("Track clicks (type=audience)"),
        hasConversions: z.boolean().optional().describe("Track conversions (type=audience)"),
        hasHolds: z.boolean().optional().describe("Track holds (type=audience)"),
        hasRejects: z.boolean().optional().describe("Track rejects (type=audience)"),
        linkedAudienceIds: z
          .string()
          .optional()
          .describe("Comma-separated pixel/fingerprint audience IDs (required for type=s2s)"),
        createFingerprint: z
          .boolean()
          .optional()
          .describe("Also create a linked fingerprint audience (type=audience_code or audience)"),
      },
      async (args, ctx) => {
        const data: Record<string, unknown> = {
          type: args.type,
          name: args.name,
          expireDays: args.expireDays,
        };

        if (args.type === "audience") {
          if (args.campaignIds) data.campaignsIds = args.campaignIds.split(",").map(Number);
          if (args.hasClicks != null) data.hasClicks = args.hasClicks;
          if (args.hasConversions != null) data.hasConversions = args.hasConversions;
          if (args.hasHolds != null) data.hasHolds = args.hasHolds;
          if (args.hasRejects != null) data.hasRejects = args.hasRejects;
        }

        if (args.type === "s2s" && args.linkedAudienceIds) {
          data.linkedAudiencesIds = args.linkedAudienceIds.split(",").map(Number);
        }

        if (args.createFingerprint != null) data.fp = args.createFingerprint;

        const a = await ctx.adv.createAudience(data);
        return formatAudienceDetail(a);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_audience",
        description:
          "Update an existing audience (read-modify-write). Fetches current state, merges your changes, sends full payload. Type cannot be changed. Pass only the fields you want to change.",
        product: "advertiser",
        annotations: { title: "Update audience", readOnlyHint: false },
      },
      {
        id: z.number(),
        name: z.string().min(1).optional(),
        expireDays: z.number().min(1).max(365).optional(),
        campaignIds: z.string().optional().describe("Comma-separated campaign IDs (type=audience)"),
        hasClicks: z.boolean().optional(),
        hasConversions: z.boolean().optional(),
        hasHolds: z.boolean().optional(),
        hasRejects: z.boolean().optional(),
        linkedAudienceIds: z
          .string()
          .optional()
          .describe("Comma-separated pixel/fingerprint audience IDs (type=s2s)"),
      },
      async (args, ctx) => {
        const { id, ...rest } = args;
        const current = await ctx.adv.getAudience(id);

        const data: Record<string, unknown> = {
          type: current.type,
          name: rest.name ?? current.name,
          expireDays: rest.expireDays ?? current.expireDays,
        };

        if (current.type === "audience") {
          data.hasClicks = rest.hasClicks ?? current.hasClicks ?? false;
          data.hasConversions = rest.hasConversions ?? current.hasConversions ?? false;
          data.hasHolds = rest.hasHolds ?? current.hasHolds ?? false;
          data.hasRejects = rest.hasRejects ?? current.hasRejects ?? false;
          data.campaignsIds = rest.campaignIds
            ? rest.campaignIds.split(",").map(Number)
            : (current.campaignsIds ?? []);
        }

        if (current.type === "s2s") {
          data.linkedAudiencesIds = rest.linkedAudienceIds
            ? rest.linkedAudienceIds.split(",").map(Number)
            : (current.linkedAudiencesIds ?? []);
        }

        await ctx.adv.updateAudience(id, data);
        return `Audience #${id} updated successfully.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_delete_audience",
        description: "Permanently delete an audience. Requires confirm=true for safety.",
        product: "advertiser",
        annotations: { title: "Delete audience", destructiveHint: true },
      },
      {
        id: z.number(),
        confirm: z.literal(true),
      },
      async (args, ctx) => {
        await ctx.adv.deleteAudience(args.id);
        return `Audience #${args.id} deleted permanently.`;
      },
    );
  },
};
