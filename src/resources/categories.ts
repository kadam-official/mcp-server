import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CAMPAIGN_TYPE_MAP, CAMPAIGN_TYPE_NAME } from "../types/advertiser.js";
import type { OptionsRegistry, CategoryItem } from "../api/options-registry.js";
import { sortById } from "../utils/stable-sort.js";

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

/**
 * On-demand resource: the full nested category tree per campaign type. Kept out of the
 * always-loaded prefix (campaign-types only carries top-level labels) because the tree is
 * large; read this only when you need a specific category ID for create/update_campaign.
 */
export async function buildCategoriesContent(registry: OptionsRegistry | null): Promise<string> {
  if (!registry) {
    return "Category tree unavailable (static mode). Pass category names to create/update_campaign; they resolve server-side.";
  }
  const lines = [
    "Category IDs per campaign type (for the `categories` parameter of create/update_campaign).",
    "Top-level labels are also summarized in kadam://reference/campaign-types.",
    "",
  ];
  for (const [key, id] of Object.entries(CAMPAIGN_TYPE_MAP).sort((a, b) => a[1] - b[1])) {
    const name = CAMPAIGN_TYPE_NAME[id] ?? key;
    try {
      const opts = await registry.getCampaignOptions(id);
      if (opts.categories.length === 0) continue;
      lines.push(`${name} (id: ${id}):`);
      lines.push(...formatCategoryTree(opts.categories, "  "));
      lines.push("");
    } catch {
      /* options unavailable — skip this type */
    }
  }
  return lines.join("\n");
}

export function registerCategoriesResource(
  server: McpServer,
  registry: OptionsRegistry | null,
): void {
  server.resource("categories", "kadam://reference/categories", async () => ({
    contents: [
      {
        uri: "kadam://reference/categories",
        mimeType: "text/plain",
        text: await buildCategoriesContent(registry),
      },
    ],
  }));
}
