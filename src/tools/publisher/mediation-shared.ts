import { formatSingleEntity } from "../../output-formatter.js";
import type { PubClient } from "../../api/pub-client.js";
import type {
  MediationConnection,
  MediationNetwork,
  MediationAccount,
  MediationPlacement,
} from "../../api/schemas/publisher-mediation.js";

/** The product name, kept in every description so the model maps the domain. */
export const DOMAIN = "Kadam Smart Mediation";

/** The backend caps the forced share at 50%; say so before it rejects the call. */
export const MAX_TEST_SHARE = 50;
export const DEFAULT_RETEST_SHARE = 10;

/**
 * The backend names its credential fields in snake_case (`api_key`, `client_id`); the
 * tools take them camelCase, and zod strips anything else — so a hint must speak the
 * argument names, not the API's.
 */
const CREDENTIAL_ARGS: Record<string, string> = {
  api_key: "apiKey",
  client_id: "clientId",
  client_secret: "clientSecret",
};

export function credentialArgNames(fields: string[]): string {
  const named = fields.map((f) => CREDENTIAL_ARGS[f] ?? f);

  return named.length > 0 ? named.join(" + ") : "apiKey";
}

export function formatConnection(c: MediationConnection): string {
  const test =
    c.testShare > 0
      ? `${c.testShare}% (${c.testState}, ${c.testSlicesPending} of ${c.testSlicesTotal + c.testSlicesPending} slices pending)`
      : "off";

  return formatSingleEntity(`Connection #${c.id}`, [
    ["Ad unit", String(c.blockId)],
    ["Network", String(c.networkId)],
    ["Format", c.format],
    ["Placement", c.extBlockName ? `${c.extBlockId} (${c.extBlockName})` : c.extBlockId],
    ["Account", c.accountId ? String(c.accountId) : undefined],
    ["Active", c.active ? "Yes" : "No"],
    ["Test share", test],
    ["Geo", c.geo.length ? c.geo.join(", ") : "all countries"],
    ["Unique cap", c.uniqCap ? String(c.uniqCap) : "no cap"],
    ["Proxy traffic", c.allowProxy ? "allowed" : "blocked"],
    ["Tag warnings", c.tagWarnings.length ? c.tagWarnings.join(", ") : undefined],
  ]);
}

export function formatAccount(a: MediationAccount): string {
  return formatSingleEntity(`Account #${a.id}`, [
    ["Name", a.name],
    ["Network", String(a.networkId)],
    ["Key", a.mask ?? "—"],
    ["Active", a.active ? "Yes" : "No"],
    ["Verified", a.verifiedAt ? "Yes" : "No"],
    // Бэкенд присылает пустую строку, а не null, у аккаунта без ошибок.
    ["Last error", a.lastError || undefined],
    ["Connections using it", String(a.placementsInUse)],
  ]);
}

export function formatNetworkLine(
  n: MediationNetwork,
  account: MediationAccount | undefined,
): string {
  const credentials = account
    ? `account #${account.id} "${account.name}"${account.mask ? ` (${account.mask})` : ""}${account.verifiedAt ? "" : ", never verified"}`
    : `no account yet — pass the network API key to connect`;

  return `- ${n.name} (slug: ${n.slug}, id: ${n.id}): ${credentials}`;
}

export function formatPlacementLine(p: MediationPlacement): string {
  const marks = [p.matchesFormat ? "format ok" : null, p.matchesSite ? "same site" : null].filter(
    Boolean,
  );

  return `  - ${p.id}${p.name && p.name !== p.id ? ` "${p.name}"` : ""}${p.site ? ` @ ${p.site}` : ""}${
    marks.length ? ` [${marks.join(", ")}]` : ""
  }`;
}

export function listAccounts(accounts: MediationAccount[]): string {
  return accounts.map((a) => `#${a.id} "${a.name}"${a.active ? "" : " (disabled)"}`).join(", ");
}

/**
 * The API lists accounts, it has no "get one", and PUT replaces the row: `AccountForm`
 * requires networkId and name on update too, so a partial body is a 422 and a blank name
 * would wipe the row. Every edit therefore starts from the stored account.
 */
export async function findAccount(
  pub: PubClient,
  accountId: number,
): Promise<MediationAccount | string> {
  const accounts = await pub.listMediationAccounts();
  const found = accounts.find((a) => a.id === accountId);
  if (found) return found;

  return `No account #${accountId} on this publisher. Present: ${listAccounts(accounts) || "none"}.`;
}

/**
 * PUT replaces the row here as well, so an edit has to start from the current state or
 * every field the caller left alone is reset to its default. The API lists connections
 * per ad unit, which is why these tools take the ad unit too.
 */
export async function findConnection(
  pub: PubClient,
  adUnitId: number,
  connectionId: number,
): Promise<MediationConnection | string> {
  const connections = await pub.listMediationConnections(adUnitId);
  const found = connections.find((c) => c.id === connectionId);
  if (found) return found;

  return (
    `Ad unit #${adUnitId} has no connection #${connectionId}. ` +
    `Present: ${connections.map((c) => `#${c.id}`).join(", ") || "none"}.`
  );
}

export function connectionPayload(c: MediationConnection): Record<string, unknown> {
  return {
    blockId: c.blockId,
    networkId: c.networkId,
    accountId: c.accountId,
    extBlockId: c.extBlockId,
    extBlockName: c.extBlockName ?? "",
    tagTemplate: c.tagTemplate ?? "",
    uniqCap: c.uniqCap,
    allowProxy: c.allowProxy,
    geo: c.geo,
    active: c.active,
    testShare: c.testShare,
  };
}

/**
 * A network account can hold thousands of zones (TrafficStars caches ~1500), and the whole
 * catalog is neither readable nor under the 50KB output cap. A page is enough to choose
 * from; narrowing by name is the way to the rest.
 */
const CATALOG_PREVIEW = 30;

function previewLines(placements: MediationPlacement[]): string {
  const shown = placements.slice(0, CATALOG_PREVIEW).map(formatPlacementLine).join("\n");
  const hidden = placements.length - CATALOG_PREVIEW;

  return hidden > 0 ? `${shown}\n… and ${hidden} more — name the zone to skip the list.` : shown;
}

/**
 * The zone id, or its name as the catalog prints it. Storing a name as `extBlockID` gives
 * a connection the collector can never match, so a name is resolved, never passed through.
 */
export async function resolvePlacement(
  pub: PubClient,
  accountId: number,
  adUnitId: number,
  wanted: string | undefined,
  fresh: boolean,
): Promise<MediationPlacement | string> {
  const placements = await pub.listMediationPlacements(accountId, adUnitId, fresh);

  if (wanted != null) {
    const needle = wanted.trim().toLowerCase();
    const picked = placements.find(
      (p) => p.id.toLowerCase() === needle || p.name.toLowerCase() === needle,
    );

    return (
      picked ??
      `No placement "${wanted}" on account #${accountId}. Available:\n${previewLines(placements)}`
    );
  }

  // Format first, site second: the backend ranks them that way because the same site is
  // often registered at the network under another name (PlacementRelevance).
  const fitting = placements.filter((p) => p.matchesFormat);
  if (fitting.length === 1) return fitting[0]!;
  if (fitting.length === 0) {
    return (
      `Account #${accountId} has no placement of this ad unit's format. Create the zone at the ` +
      `network, then repeat with fresh=true. Seen:\n${previewLines(placements)}`
    );
  }

  return `Several placements fit — repeat with the placement id:\n${previewLines(fitting)}`;
}
