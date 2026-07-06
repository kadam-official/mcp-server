import type { Config } from "./config.js";
import type { ToolCredentials } from "./middleware/tool-wrapper.js";

export type CabinetType = "adv" | "pub";

/**
 * Resolve which Kadam cabinet a request targets from its Host header.
 * `partners.*` -> advertiser tools, `pub.*` -> publisher tools. Unknown hosts
 * return null (request is rejected). Port is ignored.
 */
function hostname(url: string): string {
  return new URL(url).host.split(":")[0];
}

export function detectCabinet(host: string, config: Config): CabinetType | null {
  const requestHost = host.split(":")[0];

  const advHost = hostname(config.KADAM_ADV_DOMAIN);
  const pubHost = hostname(config.KADAM_PUB_DOMAIN);
  // The resource may be served on a dedicated subdomain; match it too. Unset
  // MCP domain falls back to the cabinet host (embedded mode), so this is a
  // no-op there.
  const advMcpHost = hostname(config.KADAM_ADV_MCP_DOMAIN ?? config.KADAM_ADV_DOMAIN);
  const pubMcpHost = hostname(config.KADAM_PUB_MCP_DOMAIN ?? config.KADAM_PUB_DOMAIN);

  if (requestHost === advHost || requestHost === advMcpHost) return "adv";
  if (requestHost === pubHost || requestHost === pubMcpHost) return "pub";
  return null;
}

/**
 * Map a session's Bearer + cabinet to the tool credentials the ToolWrapper
 * resolves clients with. The Bearer IS the Kadam API key for its cabinet —
 * advertiser sessions only carry an advKey, publisher sessions only a pubKey,
 * so a session can never reach across cabinets.
 */
export function sessionCredentials(bearer: string, cabinet: CabinetType): ToolCredentials {
  return cabinet === "adv" ? { advKey: bearer } : { pubKey: bearer };
}

export interface SessionIdentity {
  bearer: string;
  cabinet: CabinetType;
}

/**
 * Core multi-tenant isolation invariant: a session may only be used by the
 * exact (bearer, cabinet) that created it. One partner's token can never drive
 * another partner's session, and an advertiser session can never be reused on
 * the publisher cabinet (or vice versa).
 */
export function isSessionAuthorized(
  session: SessionIdentity,
  bearer: string,
  cabinet: CabinetType,
): boolean {
  return session.bearer === bearer && session.cabinet === cabinet;
}
