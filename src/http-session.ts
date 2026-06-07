import type { Config } from "./config.js";
import type { ToolCredentials } from "./middleware/tool-wrapper.js";

export type CabinetType = "adv" | "pub";

/**
 * Resolve which Kadam cabinet a request targets from its Host header.
 * `partners.*` -> advertiser tools, `pub.*` -> publisher tools. Unknown hosts
 * return null (request is rejected). Port is ignored.
 */
export function detectCabinet(host: string, config: Config): CabinetType | null {
  const advHost = new URL(config.KADAM_ADV_DOMAIN).host.split(":")[0];
  const pubHost = new URL(config.KADAM_PUB_DOMAIN).host.split(":")[0];
  const requestHost = host.split(":")[0];

  if (requestHost === advHost) return "adv";
  if (requestHost === pubHost) return "pub";
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
