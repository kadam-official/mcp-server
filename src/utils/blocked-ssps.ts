import type { CampaignBlockedSsps } from "../api/schemas/advertiser.js";

/**
 * The campaign and the creative endpoints answer with the same envelope: the campaign one
 * counts it over the campaign's clickunder creative, the creative one over that creative.
 * Only the wording of the first line differs, so the formatter is shared.
 */
export function formatBlockedSsps(
  result: CampaignBlockedSsps,
  subject: "campaign" | "creative",
): string {
  const lines: string[] = [];
  const unit = result.payModel === "cpm" ? "views" : "clicks";
  const total = result.payModel === "cpm" ? result.totalViews : result.totalClicks;
  const categoryOwner = subject === "campaign" ? "the campaign's creative" : "the creative";

  lines.push(`Category of ${categoryOwner}: ${result.category ?? "unknown"}.`);
  lines.push(`Traffic locked behind the blocks below: ${total ?? 0} ${unit}/day.`);

  if (result.byCategory.length === 0 && result.byTags.length === 0) {
    return `No traffic source blocks this ${subject} over its category or moderation tags.`;
  }

  if (result.byCategory.length > 0) {
    lines.push("", "Blocked by category (cannot be lifted without changing the category):");
    for (const ssp of result.byCategory) {
      lines.push(`- ${ssp.name} (id ${ssp.id}): ${ssp.clicks} clicks, ${ssp.views} views`);
    }
  }

  for (const tag of result.byTags) {
    lines.push("", `Blocked by moderation tag "${tag.name}" (id ${tag.id}):`);
    if (tag.description) lines.push(`  ${tag.description}`);
    for (const ssp of tag.ssps) {
      lines.push(`- ${ssp.name} (id ${ssp.id}): ${ssp.clicks} clicks, ${ssp.views} views`);
    }
    lines.push("  Removing the tag from the creative unblocks these sources.");
  }

  return lines.join("\n");
}
