import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCampaignTypesResource } from "./campaign-types.js";
import { registerPricingModelsResource } from "./pricing-models.js";
import { getCreativeFormatsContent } from "./creative-formats.js";
import { SITE_STATES_CONTENT } from "./site-states.js";
import { AD_UNIT_TYPES_CONTENT } from "./ad-unit-types.js";
import { REPORT_DIMENSIONS_CONTENT } from "./report-dimensions.js";
import { API_OVERVIEW_CONTENT } from "./api-overview.js";
import type { OptionsRegistry } from "../api/options-registry.js";

function registerStaticResource(server: McpServer, name: string, content: string): void {
  const uri = `kadam://reference/${name}`;
  server.resource(name, uri, async () => ({
    contents: [{ uri, mimeType: "text/plain", text: content }],
  }));
}

export function registerResources(server: McpServer, registry: OptionsRegistry | null = null): void {
  registerCampaignTypesResource(server, registry);
  registerPricingModelsResource(server, registry);

  const creativeFormatsUri = "kadam://reference/creative-formats";
  server.resource("creative-formats", creativeFormatsUri, async () => ({
    contents: [{
      uri: creativeFormatsUri,
      mimeType: "text/plain",
      text: await getCreativeFormatsContent(registry),
    }],
  }));

  registerStaticResource(server, "site-states", SITE_STATES_CONTENT);
  registerStaticResource(server, "ad-unit-types", AD_UNIT_TYPES_CONTENT);
  registerStaticResource(server, "report-dimensions", REPORT_DIMENSIONS_CONTENT);
  registerStaticResource(server, "api-overview", API_OVERVIEW_CONTENT);
}
