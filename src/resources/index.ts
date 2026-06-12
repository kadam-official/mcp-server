import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCampaignTypesResource } from "./campaign-types.js";
import { registerPricingModelsResource } from "./pricing-models.js";
import { getCreativeFormatsContent } from "./creative-formats.js";
import { SITE_STATES_CONTENT } from "./site-states.js";
import { AD_UNIT_TYPES_CONTENT } from "./ad-unit-types.js";
import { buildReportDimensions } from "./report-dimensions.js";
import { buildApiOverview } from "./api-overview.js";
import type { OptionsRegistry } from "../api/options-registry.js";
import type { ServerProducts } from "../types/products.js";

function registerStaticResource(server: McpServer, name: string, content: string): void {
  const uri = `kadam://reference/${name}`;
  server.resource(name, uri, async () => ({
    contents: [{ uri, mimeType: "text/plain", text: content }],
  }));
}

/**
 * Register reference resources scoped to the cabinet, mirroring tool registration:
 * advertiser sessions only see advertiser resources and vice versa. Mixed resources
 * (report-dimensions, api-overview) serve cabinet-specific content under the same URI
 * (HTTP uses a separate session server per cabinet, so there is no collision).
 */
export function registerResources(
  server: McpServer,
  registry: OptionsRegistry | null,
  products: ServerProducts,
): void {
  if (products.adv) {
    registerCampaignTypesResource(server, registry);
    registerPricingModelsResource(server, registry);

    const creativeFormatsUri = "kadam://reference/creative-formats";
    server.resource("creative-formats", creativeFormatsUri, async () => ({
      contents: [
        {
          uri: creativeFormatsUri,
          mimeType: "text/plain",
          text: await getCreativeFormatsContent(registry),
        },
      ],
    }));
  }

  if (products.pub) {
    registerStaticResource(server, "site-states", SITE_STATES_CONTENT);
    registerStaticResource(server, "ad-unit-types", AD_UNIT_TYPES_CONTENT);
  }

  // Mixed resources: register once with content for the active cabinet(s) (combined
  // only in the dual-key stdio case) to avoid double-registering the same URI.
  if (products.adv || products.pub) {
    registerStaticResource(server, "report-dimensions", buildReportDimensions(products));
    registerStaticResource(server, "api-overview", buildApiOverview(products));
  }
}
