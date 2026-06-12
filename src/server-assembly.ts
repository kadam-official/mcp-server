import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientPool } from "./api/client-pool.js";
import { ToolWrapper, type ToolCredentials } from "./middleware/tool-wrapper.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";
import { advToolModules } from "./tools/advertiser/index.js";
import { pubToolModules } from "./tools/publisher/index.js";
import { getConfig } from "./config.js";
import type { ServerProducts } from "./types/products.js";

export type { ServerProducts } from "./types/products.js";

/**
 * Single source of truth for wiring an McpServer's contents — resources,
 * prompts, and tool modules — shared by BOTH transports:
 *   - stdio (server-factory): credentials = env keys, products from env presence.
 *   - HTTP  (http-bootstrap): credentials = the request Bearer, products by cabinet.
 *
 * Keeping this in one place prevents the stdio/HTTP drift that has bitten us
 * twice (tenant-credential bug, and the resource registry passed as null).
 *
 * The advertiser OptionsRegistry is derived from the same pooled client the
 * tools use (resolve is cached by key) and is bound to the caller's
 * credentials, so resource reads stay per-tenant and lazy.
 */
export function assembleServer(
  server: McpServer,
  pool: ClientPool,
  credentials: ToolCredentials,
  products: ServerProducts,
): void {
  const wrapper = new ToolWrapper(server, pool, credentials);

  // Static-only mode: skip live API enrichment so reference resources are served
  // from the static reference text (fast, no upstream calls).
  const staticOnly = getConfig().KADAM_STATIC_RESOURCES_ONLY;
  const advRegistry =
    !staticOnly && credentials.advKey
      ? (pool.resolve(credentials.advKey, undefined).adv?.options ?? null)
      : null;

  registerResources(server, advRegistry, products);
  registerPrompts(server);

  if (products.adv) {
    for (const mod of advToolModules) mod.register(wrapper);
  }
  if (products.pub) {
    for (const mod of pubToolModules) mod.register(wrapper);
  }
}
