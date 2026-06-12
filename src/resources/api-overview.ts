import type { ServerProducts } from "../types/products.js";

const INTRO = `Kadam Ad Network Overview:

Kadam is an advertising network connecting advertisers with publishers.`;

const ADV_SECTION = `Advertisers:
  - Create campaigns (push, native, banner, video, popunder, in-page push)
  - Upload creatives (ads) with images, text, and destination URLs
  - Target by country, device, OS, browser, language, audience segments
  - Set budgets (daily/total), bids (CPC/CPM/CPA), and schedules
  - Monitor performance via custom reports and per-site statistics
  - Manage audience segments for retargeting`;

const PUB_SECTION = `Publishers:
  - Register websites (sources) and verify domain ownership
  - Create ad units (placements) for different ad formats
  - Monitor revenue, impressions, clicks via reports
  - Manage site status (active, paused, archived)`;

const ADV_AUTH = "  - Advertiser API key: partners.kadam.net -> Profile -> API";
const PUB_AUTH = "  - Publisher API key: pub.kadam.net -> Profile -> API";

/** Cabinet-scoped API overview (combined only when both products are active). */
export function buildApiOverview(products: ServerProducts): string {
  const parts: string[] = [INTRO];
  if (products.adv) parts.push(ADV_SECTION);
  if (products.pub) parts.push(PUB_SECTION);

  const auth: string[] = ["API Authentication:"];
  if (products.adv) auth.push(ADV_AUTH);
  if (products.pub) auth.push(PUB_AUTH);
  parts.push(auth.join("\n"));

  return `\n${parts.join("\n\n")}\n`;
}
