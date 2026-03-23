import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CAMPAIGN_TYPE_MAP, PRICING_MODEL_MAP } from "../types/advertiser.js";
import type { OptionsRegistry } from "../api/options-registry.js";

const PRICING_DESCRIPTIONS: Record<number, string> = {
  0: "Cost Per Click. You pay for each click.",
  2: "Cost Per Mille. You pay per 1000 impressions.",
  4: "Cost Per Action. Auto-optimized for conversions. Requires conversion tracking setup (postback URL or pixel).",
};

function staticFallback(): string {
  const lines = ["Pricing Models (cpType):"];
  for (const [key, id] of Object.entries(PRICING_MODEL_MAP)) {
    const desc = PRICING_DESCRIPTIONS[id] ?? "";
    lines.push(`- ${key.toUpperCase()} (id: ${id}): ${desc}`);
  }
  return lines.join("\n");
}

async function generateContent(registry: OptionsRegistry | null): Promise<string> {
  if (!registry) return staticFallback();

  const allCpTypes = new Map<number, { label: string; types: string[] }>();

  for (const [key, typeId] of Object.entries(CAMPAIGN_TYPE_MAP)) {
    try {
      const opts = await registry.getCampaignOptions(typeId);
      for (const cp of opts.cpTypes) {
        const id = cp.id as number;
        const existing = allCpTypes.get(id);
        if (existing) {
          existing.types.push(key);
        } else {
          allCpTypes.set(id, { label: cp.label, types: [key] });
        }
      }
    } catch { /* skip */ }
  }

  if (allCpTypes.size === 0) return staticFallback();

  const lines = ["Pricing Models (cpType):"];
  for (const [id, { label, types }] of allCpTypes) {
    const desc = PRICING_DESCRIPTIONS[id] ?? "";
    lines.push(`- ${label} (id: ${id}): ${desc}`);
    lines.push(`  Available for: ${types.join(", ")}`);
  }
  return lines.join("\n");
}

export function registerPricingModelsResource(server: McpServer, registry: OptionsRegistry | null): void {
  server.resource("pricing-models", "kadam://reference/pricing-models", async () => ({
    contents: [
      {
        uri: "kadam://reference/pricing-models",
        mimeType: "text/plain",
        text: await generateContent(registry),
      },
    ],
  }));
}
