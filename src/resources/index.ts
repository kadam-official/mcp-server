import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCampaignTypesResource } from "./campaign-types.js";
import { registerPricingModelsResource } from "./pricing-models.js";
import { registerCreativeFormatsResource } from "./creative-formats.js";
import { registerSiteStatesResource } from "./site-states.js";
import { registerAdUnitTypesResource } from "./ad-unit-types.js";
import { registerReportDimensionsResource } from "./report-dimensions.js";
import { registerApiOverviewResource } from "./api-overview.js";

export function registerResources(server: McpServer): void {
  registerCampaignTypesResource(server);
  registerPricingModelsResource(server);
  registerCreativeFormatsResource(server);
  registerSiteStatesResource(server);
  registerAdUnitTypesResource(server);
  registerReportDimensionsResource(server);
  registerApiOverviewResource(server);
}
