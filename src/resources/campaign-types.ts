import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CAMPAIGN_TYPE_MAP, CAMPAIGN_TYPE_NAME } from "../types/advertiser.js";

const CAMPAIGN_DETAILS: Record<string, { features: string; pricing: string; creatives: string }> = {
  push: {
    features: "subAge targeting, secondPush option",
    pricing: "CPC, CPM, CPA Target",
    creatives: "title + text + icon + main image",
  },
  inpage_push: {
    features: "secondPush option",
    pricing: "CPC, CPM, CPA Target",
    creatives: "title + text + icon + main image",
  },
  native: {
    features: "gender/age targeting, impression tracker, multi-ads",
    pricing: "CPC, CPM, CPA Target",
    creatives: "title + description + thumbnail + main image",
  },
  banner: {
    features: "gender/age targeting, impression tracker, multi-ads, HTML5 support",
    pricing: "CPC, CPM, CPA Target",
    creatives: "banner image (or HTML5 ZIP) + size",
  },
  video: {
    features: "impression tracker",
    pricing: "CPC, CPM",
    creatives: "MP4 video file",
  },
  popunder: {
    features: "isPauseAfterModerate",
    pricing: "CPC, CPM",
    creatives: "URL only (no image/text needed)",
  },
};

function generateContent(): string {
  const lines = ["Campaign Types:"];
  for (const [key, id] of Object.entries(CAMPAIGN_TYPE_MAP)) {
    const name = CAMPAIGN_TYPE_NAME[id] ?? key;
    const details = CAMPAIGN_DETAILS[key];
    lines.push(`- ${name} (id: ${id}): ${key} format`);
    if (details) {
      lines.push(`  Features: ${details.features}`);
      lines.push(`  Pricing: ${details.pricing}`);
      lines.push(`  Creatives: ${details.creatives}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function registerCampaignTypesResource(server: McpServer): void {
  server.resource("campaign-types", "kadam://reference/campaign-types", async () => ({
    contents: [
      {
        uri: "kadam://reference/campaign-types",
        mimeType: "text/plain",
        text: generateContent(),
      },
    ],
  }));
}
