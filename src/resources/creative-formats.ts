import type { OptionsRegistry } from "../api/options-registry.js";
import { sortById } from "../utils/stable-sort.js";

const STATIC_CONTENT = `Creative Format Requirements by Campaign Type:

IMPORTANT: The API uses multipart/form-data with file uploads. Provide image URLs
and the MCP server will download and upload them automatically.

Push / In-Page Push:
  Required: title (max 30 chars), text (max 45 chars), url
  Required images: imageUrl (icon, min 192x192), mainImageUrl (min 492x328)
  Optional: bid, startDate, stopDate

Native (Teaser):
  Required: title (max 75 chars), url
  Required images: imageUrl (icon, min 500x500), mainImageUrl (min 492x328)
  Optional: bid, startDate, stopDate

Banner:
  Required: url, imageUrl (must match exact banner dimensions), sizeId
  Optional: bid, startDate, stopDate

Video:
  Required: title (max 30 chars), url, videoUrl (MP4 file, max 30MB)
  Optional: bid, startDate, stopDate

Popunder (Clickunder):
  Does NOT support separate creatives.
  The campaign URL itself serves as the ad.
  Creatives are auto-managed by the campaign.`;

export async function getCreativeFormatsContent(registry: OptionsRegistry | null): Promise<string> {
  let sizesSection = "";

  if (registry) {
    try {
      const opts = await registry.getMaterialOptions();
      const lines = ["\nBanner Sizes (sizeId values):"];
      for (const s of sortById(opts.sizes)) {
        if (s.width > 0 && s.height > 0) {
          lines.push(`  ${s.id} = ${s.label} (${s.width}x${s.height})`);
        } else {
          lines.push(`  ${s.id} = ${s.label}`);
        }
      }
      sizesSection = lines.join("\n");
    } catch {
      /* fallback to no sizes */
    }
  }

  return STATIC_CONTENT + sizesSection;
}
