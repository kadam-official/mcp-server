import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatEntityList, clampPerPage } from "../../output-formatter.js";
import { extractPagination } from "../../utils/pagination.js";
import {
  formatMaterialBulkResult,
  ADV_STATUS_ACTION_MAP,
  MATERIAL_LIST_STATUS_FILTER,
  parseCommaSeparatedIds,
  requireUniqueIds,
} from "../../utils/status-actions.js";
import type { CreativeRow } from "../../api/schemas/advertiser.js";
import type { OptionsRegistry } from "../../api/options-registry.js";
import { logger } from "../../logger.js";
import { loadFile } from "../../utils/files.js";

async function validateSizeId(sizeId: number, registry: OptionsRegistry): Promise<void> {
  try {
    const opts = await registry.getMaterialOptions();
    const valid = opts.sizes.find((s) => s.id === sizeId);
    if (!valid) {
      const popular = opts.sizes
        .filter((s) => s.width > 0)
        .slice(0, 20)
        .map((s) => `${s.id}=${s.label}`)
        .join(", ");
      throw new Error(`Invalid sizeId ${sizeId}. Available sizes: ${popular}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Invalid sizeId")) throw e;
    logger.warn(
      { sizeId, err: e },
      "Could not validate sizeId against options; falling back to API validation",
    );
  }
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

const HTML_TAG_CODE_MAX_LENGTH = 32_768;

interface CreateCreativeFormat {
  url?: string;
  isIframe?: boolean;
  isHtmlTag?: boolean;
  htmlTagCode?: string;
  html5ArchiveUrl?: string;
  videoUrl?: string;
  vastTagUrl?: string;
  imageUrl?: string;
  mainImageUrl?: string;
  sizeId?: number;
}

/**
 * Один креатив — один формат. Иначе более поздняя ветка затирает флаг
 * (isVast переписывает url, isHtml5 переписывает файл) и subtype теряется.
 */
function assertSingleCreativeFormat(args: CreateCreativeFormat): void {
  const chosen: string[] = [];
  if (args.isIframe) chosen.push("isIframe");
  if (args.isHtmlTag) chosen.push("isHtmlTag");
  if (args.html5ArchiveUrl) chosen.push("html5ArchiveUrl");
  if (args.videoUrl) chosen.push("videoUrl");
  if (args.vastTagUrl) chosen.push("vastTagUrl");

  if (chosen.length > 1) {
    throw new Error(`Use only one creative format at a time: ${chosen.join(", ")}.`);
  }

  if ((args.isIframe || args.isHtmlTag) && (args.imageUrl || args.mainImageUrl)) {
    throw new Error("An iframe or HTML-tag banner does not take an image.");
  }

  if (args.isIframe) {
    if (args.sizeId == null) {
      throw new Error("An iframe banner requires sizeId.");
    }
    if (!args.url || !isHttpsFrameUrl(args.url)) {
      throw new Error("An iframe banner requires an https url.");
    }
    return;
  }

  if (args.isHtmlTag) {
    if (args.sizeId == null) {
      throw new Error("An HTML-tag banner requires sizeId.");
    }
    if (!args.htmlTagCode || args.htmlTagCode.trim() === "") {
      throw new Error("An HTML-tag banner requires htmlTagCode.");
    }
    return;
  }

  if (!args.url) {
    throw new Error("url is required.");
  }
}

function isHttpsFrameUrl(url: string): boolean {
  // Макрос вроде {country} ломает разбор URL; бэкенд подставляет заглушку так же.
  const urlForParse = url.replace(/\{[a-z_]+\}/gi, "MACROSTUB");
  try {
    const parsed = new URL(urlForParse);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function buildCreativeFormData(args: Record<string, unknown>): FormData {
  const fd = new FormData();

  if (typeof args.url === "string" && args.url.length > 0) {
    fd.set("url", args.url);
  }
  fd.set("isPauseAfterModer", args.pauseAfterModeration ? "1" : "0");
  fd.set("bids", JSON.stringify(args.bids ?? []));

  if (args.title != null) fd.set("title", String(args.title));
  // text — описание push; name — имя креатива. Если заданы оба, в API уходит name.
  if (args.name != null) fd.set("name", String(args.name));
  else if (args.text != null) fd.set("name", String(args.text));
  if (args.sizeId != null) fd.set("sizeId", String(args.sizeId));
  if (args.startDate != null) fd.set("startDate", String(args.startDate));
  if (args.stopDate != null) fd.set("stopDate", String(args.stopDate));

  return fd;
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
        annotations: { title: "List creatives", readOnlyHint: true },
      },
      {
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        campaignId: z.number().optional(),
        status: z.enum(["active", "paused", "moderation", "blocked", "archived"]).optional(),
        searchQuery: z.string().min(2).optional().describe("Creative title/name or creative ID"),
      },
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);

        // Filters must be nested under `filters`; flat top-level keys are ignored by the API.
        const filters: Record<string, unknown> = {};
        if (args.campaignId != null) filters.campaignId = args.campaignId;
        if (args.status != null) Object.assign(filters, MATERIAL_LIST_STATUS_FILTER[args.status]);
        if (args.searchQuery != null) filters.searchQuery = args.searchQuery;

        const params: Record<string, unknown> = { page: args.page, perPage };
        if (Object.keys(filters).length > 0) params.filters = filters;

        const res = await ctx.adv.listCreatives(params);
        const pagination = extractPagination(res);
        return formatEntityList(res.rows, formatCreativeRow, "Creatives", pagination);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_creative",
        description: `Create a creative. Accepts image/video as a URL or local file path. Required fields by type:
- Push / In-Page Push: title, text, url, imageUrl (icon), mainImageUrl
- Native: title, url, imageUrl (icon), mainImageUrl
- Banner: url, imageUrl, sizeId
- Banner as an HTML5 archive: url, html5ArchiveUrl (.zip), sizeId — needs the HTML5 grant
- Banner as an iframe: isIframe, url (https frame src), sizeId — needs the HTML5 grant, nothing is uploaded
- Banner as an HTML tag: isHtmlTag, htmlTagCode, sizeId — needs the HTML5 grant, no landing url; put {click_url} where the click should go
- Video: title, url, videoUrl (MP4) — uploading a video file is an internal grant; advertisers deliver video as a VAST tag
- Video as a VAST tag: title, vastTagUrl (https) in a video campaign — needs the VAST grant, nothing is uploaded
- Popunder: none (campaign URL is the ad)
Use only one format per call. See kadam://reference/creative-formats for sizes and exact dimensions.`,
        product: "advertiser",
        annotations: { title: "Create creative", readOnlyHint: false },
      },
      {
        campaignId: z.number().describe("Campaign ID to add creative to"),
        url: z
          .string()
          .url()
          .optional()
          .describe(
            "Landing page URL. Required except for an HTML-tag banner. For an iframe banner this is the https frame src (macros such as {country} are allowed).",
          ),
        isIframe: z
          .boolean()
          .optional()
          .describe(
            "Banner iframe creative: render url in a sandboxed frame. Needs the HTML5 grant. Mutually exclusive with other formats.",
          ),
        isHtmlTag: z
          .boolean()
          .optional()
          .describe(
            "Banner HTML-tag creative: the markup is htmlTagCode and there is no landing url. Needs the HTML5 grant. Put {click_url} where the click should go.",
          ),
        htmlTagCode: z
          .string()
          .max(HTML_TAG_CODE_MAX_LENGTH)
          .optional()
          .describe(
            "Ad markup for an HTML-tag banner (required when isHtmlTag is true, max 32768 characters). Sent as-is, without a wrapper.",
          ),
        name: z
          .string()
          .optional()
          .describe(
            "Creative name shown in the cabinet. Optional for an iframe or HTML-tag banner. When both name and text are set, name is sent.",
          ),
        title: z
          .string()
          .optional()
          .describe(
            "Creative title (required for push/inpage/native/video, max 30 chars for push, 75 for native)",
          ),
        text: z
          .string()
          .optional()
          .describe("Creative text/description (required for push/inpage, max 45 chars)"),
        imageUrl: z
          .string()
          .optional()
          .describe(
            "Icon/image source: URL or local file path (push: 192x192+, native: 500x500+, banner: exact size)",
          ),
        mainImageUrl: z
          .string()
          .optional()
          .describe(
            "Main/rectangle image source: URL or local path (push/inpage: 492x328+, native: 492x328+). Not needed for banner/video.",
          ),
        videoUrl: z
          .string()
          .optional()
          .describe("Video source: URL or local file path to MP4 (video campaigns only)"),
        vastTagUrl: z
          .string()
          .optional()
          .describe(
            "https VAST tag URL (video campaigns only). The tag is fetched and parsed on save, so a tag that does not answer with a usable VAST document is refused right away.",
          ),
        html5ArchiveUrl: z
          .string()
          .optional()
          .describe("HTML5 archive (.zip): URL or local file path (banner campaigns only)"),
        sizeId: z
          .number()
          .optional()
          .describe(
            "Banner size ID (required for banner). See kadam://reference/creative-formats for valid sizes.",
          ),
        pauseAfterModeration: z
          .boolean()
          .optional()
          .default(true)
          .describe("Pause creative after it passes moderation (default: true for safety)"),
        bid: z
          .number()
          .optional()
          .describe("Custom bid for this creative (overrides campaign bid)"),
        bidCountries: z.string().optional().describe("Comma-separated country IDs for the bid"),
        startDate: z.string().optional().describe("Creative start date (YYYY-MM-DD HH:MM:SS)"),
        stopDate: z.string().optional().describe("Creative stop date (YYYY-MM-DD HH:MM:SS)"),
      },
      async (args, ctx) => {
        assertSingleCreativeFormat(args);

        if (args.sizeId != null) {
          await validateSizeId(args.sizeId, ctx.adv.options);
        }

        const bids: Array<Record<string, unknown>> = [];
        if (args.bid != null) {
          const countries = args.bidCountries
            ? args.bidCountries.split(",").map((s) => parseInt(s.trim(), 10))
            : [];
          bids.push({ bid: args.bid, countries });
        }

        const fd = buildCreativeFormData({
          url: args.isHtmlTag ? undefined : args.url,
          title: args.title,
          text: args.text,
          name: args.name,
          sizeId: args.sizeId,
          pauseAfterModeration: args.pauseAfterModeration,
          bids,
          startDate: args.startDate,
          stopDate: args.stopDate,
        });

        if (args.isIframe) {
          fd.set("isIframe", "1");
        } else if (args.isHtmlTag) {
          if (!args.htmlTagCode) {
            throw new Error("An HTML-tag banner requires htmlTagCode.");
          }
          fd.set("isHtmlTag", "1");
          fd.set("htmlTagCode", args.htmlTagCode);
        } else {
          if (args.imageUrl) {
            const file = await loadFile(args.imageUrl);
            fd.set("image", file.blob, file.filename);
            if (file.width > 0) {
              fd.set(
                "imageCrop",
                JSON.stringify({ x: 0, y: 0, width: file.width, height: file.height }),
              );
            }
          }

          if (args.mainImageUrl) {
            const file = await loadFile(args.mainImageUrl);
            fd.set("rectangleImage", file.blob, file.filename);
            if (file.width > 0) {
              fd.set(
                "rectangleImageCrop",
                JSON.stringify({ x: 0, y: 0, width: file.width, height: file.height }),
              );
            }
          }

          if (args.videoUrl) {
            const file = await loadFile(args.videoUrl);
            fd.set("image", file.blob, file.filename);
            // Без этого флага бэкенд сохранит загруженный файл как обычный баннер.
            fd.set("isVideo", "1");
          }

          if (args.html5ArchiveUrl) {
            const file = await loadFile(args.html5ArchiveUrl);
            fd.set("image", file.blob, file.filename);
            fd.set("isHtml5", "1");
          }

          if (args.vastTagUrl) {
            fd.set("url", args.vastTagUrl);
            fd.set("isVast", "1");
          }
        }

        const c = await ctx.adv.createCreative(args.campaignId, fd);
        return `Creative created: [ID: ${c.id}] for campaign #${args.campaignId}. Status: pending moderation.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_creative",
        description:
          "Update an existing creative (read-modify-write). Fetches current state, merges your changes, sends full payload. " +
          "Pass only the fields you want to change. For image changes, create a new creative instead.",
        product: "advertiser",
        annotations: { title: "Update creative", readOnlyHint: false },
      },
      {
        creativeId: z.number().describe("Creative (material) ID to update"),
        url: z.string().url().optional().describe("Landing page URL"),
        title: z.string().optional().describe("Creative title"),
        text: z.string().optional().describe("Creative description/text"),
        bid: z.number().optional().describe("Custom bid for this creative"),
        bidCountries: z.string().optional().describe("Comma-separated GEO IDs for the bid"),
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD HH:MM:SS)"),
        stopDate: z
          .string()
          .optional()
          .describe("Stop date (YYYY-MM-DD HH:MM:SS or null to clear)"),
        pauseAfterModeration: z.boolean().optional().describe("Pause after moderation"),
      },
      async (args, ctx) => {
        const { creativeId, ...changes } = args;
        const current = await ctx.adv.getMaterial(creativeId);
        const campaignId = current.campaignId as number;

        const merged: Record<string, unknown> = {
          adId: creativeId,
          url: changes.url ?? current.url,
          isPauseAfterModer:
            changes.pauseAfterModeration != null
              ? changes.pauseAfterModeration
                ? 1
                : 0
              : current.isPauseAfterModer,
          startDate: changes.startDate !== undefined ? changes.startDate : current.startDate,
          stopDate: changes.stopDate !== undefined ? changes.stopDate : current.stopDate,
        };

        if (current.title !== undefined) merged.title = changes.title ?? current.title;
        if (current.name !== undefined) merged.name = changes.text ?? current.name;
        if (current.sizeId !== undefined) merged.sizeId = current.sizeId;

        // GET now returns bids as array [{bid, leadCost, countries}] matching PUT format
        const currentBids = current.bids as Array<Record<string, unknown>> | undefined;
        if (changes.bid != null) {
          const existingCountries = (currentBids?.[0]?.countries ?? []) as number[];
          const countries = changes.bidCountries
            ? changes.bidCountries.split(",").map(Number)
            : existingCountries;
          merged.bids = [{ bid: changes.bid, leadCost: 0, countries }];
        } else {
          merged.bids = current.bids;
        }

        await ctx.adv.updateCreative(campaignId, merged);
        return `Creative #${creativeId} in campaign #${campaignId} updated successfully.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_set_creative_status",
        description:
          "Set status for multiple creatives. Pass comma-separated IDs and status: active, paused, archived, " +
          "or restored (take out of the archive). The API answers per creative, so some IDs can be refused " +
          "while others succeed. restored is rejected for the whole call if the creative's campaign is itself " +
          "archived — restore the campaign first.",
        product: "advertiser",
        annotations: { title: "Set creative status", idempotentHint: true },
      },
      {
        ids: z.string().min(1),
        status: z.enum(["active", "paused", "archived", "restored"]),
      },
      async (args, ctx) => {
        const parsedIds = parseCommaSeparatedIds(args.ids);
        requireUniqueIds(parsedIds, "Creative");
        const action = ADV_STATUS_ACTION_MAP[args.status];
        const result = await ctx.adv.setCreativeStatus(parsedIds, action);

        return formatMaterialBulkResult(result, `set to ${args.status}`);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_delete_creatives",
        description:
          "Permanently delete creatives. Requires confirm=true. A creative must be archived first " +
          "(use set_creative_status with status=archived), otherwise the whole call is rejected. " +
          "Retrying a call that already deleted the creatives is rejected too, since deleted creatives " +
          "are no longer addressable.",
        product: "advertiser",
        annotations: { title: "Delete creatives", destructiveHint: true },
      },
      {
        ids: z.string().min(1).describe("Comma-separated creative IDs"),
        confirm: z.literal(true),
      },
      async (args, ctx) => {
        const parsedIds = parseCommaSeparatedIds(args.ids);
        requireUniqueIds(parsedIds, "Creative");
        const result = await ctx.adv.deleteCreatives(parsedIds);

        return formatMaterialBulkResult(result, "deleted");
      },
    );
  },
};
