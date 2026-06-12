import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CAMPAIGN_TYPE_MAP, CAMPAIGN_TYPE_NAME } from "../types/advertiser.js";
import type { OptionsRegistry, CampaignOptions, CategoryItem } from "../api/options-registry.js";
import { sortById } from "../utils/stable-sort.js";

const CREATIVE_INFO: Record<string, string> = {
  push: "title + text + icon + main image",
  inpage_push: "title + text + icon + main image",
  native: "title + description + thumbnail + main image",
  banner: "banner image (or HTML5 ZIP) + size",
  video: "MP4 video file",
  popunder: "URL only (no image/text needed)",
};

function formatCategoryTree(cats: CategoryItem[], indent: string): string[] {
  const lines: string[] = [];
  for (const cat of sortById(cats)) {
    lines.push(`${indent}${cat.id}: ${cat.label}`);
    if (cat.children && cat.children.length > 0) {
      lines.push(...formatCategoryTree(cat.children, indent + "  "));
    }
  }
  return lines;
}

function formatOptions(opts: CampaignOptions): string {
  const parts: string[] = [];
  const pricing = sortById(opts.cpTypes)
    .map((c) => c.label)
    .join(", ");
  parts.push(`Pricing: ${pricing}`);

  if (opts.options.allowAgeSelection) parts.push("age targeting");
  if (opts.options.allowGenderSelection) parts.push("gender targeting");
  if (opts.subAges.length > 0) parts.push("subAge targeting");
  if (opts.categories.length > 0) {
    const topLabels = sortById(opts.categories)
      .map((c) => c.label)
      .join(", ");
    parts.push(`categories: ${topLabels}`);
  }
  return parts.join(" | ");
}

export async function buildCampaignTypesContent(registry: OptionsRegistry | null): Promise<string> {
  const lines = ["Campaign Types:"];
  for (const [key, id] of Object.entries(CAMPAIGN_TYPE_MAP).sort((a, b) => a[1] - b[1])) {
    const name = CAMPAIGN_TYPE_NAME[id] ?? key;
    lines.push(`- ${name} (id: ${id}): ${key} format`);

    if (registry) {
      try {
        const opts = await registry.getCampaignOptions(id);
        lines.push(`  ${formatOptions(opts)}`);
        if (opts.categories.length > 0) {
          lines.push("  Categories:");
          lines.push(...formatCategoryTree(opts.categories, "    "));
        }
      } catch {
        /* options unavailable — skip dynamic info */
      }
    }

    const creatives = CREATIVE_INFO[key];
    if (creatives) lines.push(`  Creatives: ${creatives}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function registerCampaignTypesResource(
  server: McpServer,
  registry: OptionsRegistry | null,
): void {
  server.resource("campaign-types", "kadam://reference/campaign-types", async () => ({
    contents: [
      {
        uri: "kadam://reference/campaign-types",
        mimeType: "text/plain",
        text: await buildCampaignTypesContent(registry),
      },
    ],
  }));
}
