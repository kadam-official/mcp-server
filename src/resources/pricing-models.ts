import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PRICING_MODEL_MAP, PRICING_MODEL_NAME } from "../types/advertiser.js";

const PRICING_DESCRIPTIONS: Record<string, string> = {
  cpc: "Cost Per Click. You pay for each click.",
  cpm: "Cost Per Mille. You pay per 1000 impressions.",
  cpa_target: "Cost Per Action. Auto-optimized for conversions. Requires conversion tracking setup (postback URL or pixel).",
};

function generateContent(): string {
  const lines = ["Pricing Models (cpType):"];
  for (const [key, id] of Object.entries(PRICING_MODEL_MAP)) {
    const name = PRICING_MODEL_NAME[id] ?? key.toUpperCase();
    const desc = PRICING_DESCRIPTIONS[key] ?? "";
    lines.push(`- ${name} (id: ${id}): ${desc}`);
  }
  return lines.join("\n");
}

export function registerPricingModelsResource(server: McpServer): void {
  server.resource("pricing-models", "kadam://reference/pricing-models", async () => ({
    contents: [
      {
        uri: "kadam://reference/pricing-models",
        mimeType: "text/plain",
        text: generateContent(),
      },
    ],
  }));
}
