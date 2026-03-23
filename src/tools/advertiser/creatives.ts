import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import {
  formatEntityList,
  clampPerPage,
} from "../../output-formatter.js";
import { extractPagination } from "../../utils/pagination.js";
import { ADV_STATUS_ACTION_MAP, parseCommaSeparatedIds } from "../../utils/status-actions.js";
import type { CreativeRow } from "../../api/schemas/advertiser.js";
import type { OptionsRegistry } from "../../api/options-registry.js";
import { logger } from "../../logger.js";

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
    logger.warn({ sizeId, err: e }, "Could not validate sizeId against options; falling back to API validation");
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

interface LoadedFile {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
}

function isLocalPath(source: string): boolean {
  return source.startsWith("/") || source.startsWith("~") || source.startsWith("file://");
}

async function loadFile(source: string): Promise<LoadedFile> {
  let buffer: ArrayBuffer;
  let filename: string;

  if (isLocalPath(source)) {
    const filePath = source.startsWith("file://")
      ? new URL(source).pathname
      : source.startsWith("~")
        ? source.replace("~", process.env.HOME || "")
        : source;
    const nodeBuffer = await readFile(filePath).catch(() => {
      throw new Error(`File not found or unreadable: ${filePath}`);
    });
    buffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
    filename = basename(filePath);
  } else {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to download file from ${source}: HTTP ${response.status}`);
    }
    buffer = await response.arrayBuffer();
    const urlPath = new URL(source).pathname;
    filename = urlPath.split("/").pop() || "file";
  }

  const blob = new Blob([buffer]);
  const { width, height } = parseImageDimensions(new Uint8Array(buffer));
  return { blob, filename, width, height };
}

export function parseImageDimensions(data: Uint8Array): { width: number; height: number } {
  if (data[0] === 0x89 && data[1] === 0x50) {
    const view = new DataView(data.buffer, data.byteOffset);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (data[0] === 0xFF && data[1] === 0xD8) {
    let offset = 2;
    while (offset < data.length - 9) {
      if (data[offset] !== 0xFF) { offset++; continue; }
      const marker = data[offset + 1]!;
      if (marker === 0xC0 || marker === 0xC2) {
        const view = new DataView(data.buffer, data.byteOffset);
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      const segLen = (data[offset + 2]! << 8) | data[offset + 3]!;
      offset += 2 + segLen;
    }
  }
  return { width: 0, height: 0 };
}

function buildCreativeFormData(args: Record<string, unknown>): FormData {
  const fd = new FormData();

  fd.set("url", String(args.url));
  fd.set("isPauseAfterModer", args.pauseAfterModeration ? "1" : "0");
  fd.set("bids", JSON.stringify(args.bids ?? []));

  if (args.title != null) fd.set("title", String(args.title));
  if (args.text != null) fd.set("name", String(args.text));
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
        annotations: { readOnlyHint: true },
      },
      {
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        campaignId: z.number().optional(),
        status: z.string().optional(),
        searchQuery: z.string().optional(),
      },
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);
        const params: Record<string, unknown> = {
          page: args.page,
          perPage,
          ...(args.campaignId != null && { filters: { campaignId: args.campaignId } }),
          ...(args.status != null && { status: args.status }),
          ...(args.searchQuery != null && { searchQuery: args.searchQuery }),
        };
        const res = await ctx.adv.listCreatives(params);
        const pagination = extractPagination(res);
        return formatEntityList(
          res.rows,
          formatCreativeRow,
          "Creatives",
          pagination,
        );
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_creative",
        description: `Create a new creative for a campaign. Accepts both URLs (http/https) and local file paths for images/video.

Campaign type determines required fields:
- Push / In-Page Push: title, text, url, imageUrl (icon 192x192+), mainImageUrl (492x328+)
- Native: title, url, imageUrl (icon 500x500+), mainImageUrl (492x328+)
- Banner: url, imageUrl (exact banner size), sizeId (use kadam://reference/creative-formats for valid sizes)
- Video: title, url, videoUrl (MP4 file)
- Popunder: does NOT support separate creatives (campaign URL = ad)

Image/video sources: URL (https://...) or local path (/Users/.../image.png, ~/Downloads/banner.jpg).`,
        product: "advertiser",
        annotations: { readOnlyHint: false },
      },
      {
        campaignId: z.number().describe("Campaign ID to add creative to"),
        url: z.string().url().describe("Landing page URL for the creative"),
        title: z.string().optional().describe("Creative title (required for push/inpage/native/video, max 30 chars for push, 75 for native)"),
        text: z.string().optional().describe("Creative text/description (required for push/inpage, max 45 chars)"),
        imageUrl: z.string().optional().describe("Icon/image source: URL or local file path (push: 192x192+, native: 500x500+, banner: exact size)"),
        mainImageUrl: z.string().optional().describe("Main/rectangle image source: URL or local path (push/inpage: 492x328+, native: 492x328+). Not needed for banner/video."),
        videoUrl: z.string().optional().describe("Video source: URL or local file path to MP4 (video campaigns only)"),
        sizeId: z.number().optional().describe("Banner size ID (required for banner). See kadam://reference/creative-formats for valid sizes."),
        pauseAfterModeration: z.boolean().optional().default(true).describe("Pause creative after it passes moderation (default: true for safety)"),
        bid: z.number().optional().describe("Custom bid for this creative (overrides campaign bid)"),
        bidCountries: z.string().optional().describe("Comma-separated country IDs for the bid"),
        startDate: z.string().optional().describe("Creative start date (YYYY-MM-DD HH:MM:SS)"),
        stopDate: z.string().optional().describe("Creative stop date (YYYY-MM-DD HH:MM:SS)"),
      },
      async (args, ctx) => {
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
          url: args.url,
          title: args.title,
          text: args.text,
          sizeId: args.sizeId,
          pauseAfterModeration: args.pauseAfterModeration,
          bids,
          startDate: args.startDate,
          stopDate: args.stopDate,
        });

        if (args.imageUrl) {
          const file = await loadFile(args.imageUrl);
          fd.set("image", file.blob, file.filename);
          if (file.width > 0) {
            fd.set("imageCrop", JSON.stringify({ x: 0, y: 0, width: file.width, height: file.height }));
          }
        }

        if (args.mainImageUrl) {
          const file = await loadFile(args.mainImageUrl);
          fd.set("rectangleImage", file.blob, file.filename);
          if (file.width > 0) {
            fd.set("rectangleImageCrop", JSON.stringify({ x: 0, y: 0, width: file.width, height: file.height }));
          }
        }

        if (args.videoUrl) {
          const file = await loadFile(args.videoUrl);
          fd.set("image", file.blob, file.filename);
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
        annotations: { readOnlyHint: false },
      },
      {
        creativeId: z.number().describe("Creative (material) ID to update"),
        url: z.string().url().optional().describe("Landing page URL"),
        title: z.string().optional().describe("Creative title"),
        text: z.string().optional().describe("Creative description/text"),
        bid: z.number().optional().describe("Custom bid for this creative"),
        bidCountries: z.string().optional().describe("Comma-separated GEO IDs for the bid"),
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD HH:MM:SS)"),
        stopDate: z.string().optional().describe("Stop date (YYYY-MM-DD HH:MM:SS or null to clear)"),
        pauseAfterModeration: z.boolean().optional().describe("Pause after moderation"),
      },
      async (args, ctx) => {
        const { creativeId, ...changes } = args;
        const current = await ctx.adv.getMaterial(creativeId);
        const campaignId = current.campaignId as number;

        const merged: Record<string, unknown> = {
          adId: creativeId,
          url: changes.url ?? current.url,
          isPauseAfterModer: changes.pauseAfterModeration != null
            ? (changes.pauseAfterModeration ? 1 : 0)
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
          "Set status for multiple creatives. Pass comma-separated IDs and status: active, paused, or archived.",
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
        await ctx.adv.setCreativeStatus(parsedIds, action);
        const idList = parsedIds.map((id) => `#${id}`).join(", ");
        return `${parsedIds.length} creatives set to ${args.status}: ${idList}`;
      },
    );
  },
};
