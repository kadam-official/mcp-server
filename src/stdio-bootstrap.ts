import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ClientPool } from "./api/client-pool.js";
import { getConfig } from "./config.js";
import { createMcpServer } from "./server-factory.js";
import { logger } from "./logger.js";
import { CLIENT_ACCESS, type SessionAccess } from "./types/access.js";

/**
 * stdio has one bearer for the whole process, so the role is asked once, before
 * the catalog is registered. Only the advertiser key carries a role (the
 * publisher API has no impersonation). Any failure — no key, rejected key,
 * API down — falls back to the client catalog; the first real tool call will
 * surface the actual error to the user.
 */
export async function resolveStdioAccess(
  pool: ClientPool,
  advKey: string | undefined,
): Promise<SessionAccess> {
  if (!advKey) return CLIENT_ACCESS;
  const adv = pool.resolve(advKey, undefined).adv;
  if (!adv) return CLIENT_ACCESS;
  try {
    const access = await adv.getAccess();
    return { impersonation: access.impersonation };
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Could not resolve the key's role from GET /access; using the client catalog",
    );
    return CLIENT_ACCESS;
  }
}

export async function bootstrapStdio(): Promise<void> {
  const config = getConfig();

  const clientPool = new ClientPool({
    advBaseUrl: config.KADAM_ADV_API_BASE,
    pubBaseUrl: config.KADAM_PUB_API_BASE,
  });

  const access = await resolveStdioAccess(clientPool, config.KADAM_ADV_API_KEY);
  const server = createMcpServer(clientPool, access);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Server connected via stdio transport");
}
