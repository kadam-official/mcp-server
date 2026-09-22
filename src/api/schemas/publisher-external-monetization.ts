import { z } from "zod";

/**
 * External monetization (the cabinet calls it "mediation"): the publisher's own
 * accounts in outside ad networks, attached to their ad units.
 *
 * Endpoints live under /external-monetization/* and mirror /mediation/* one to one.
 */

// ---------------------------------------------------------------------------
// GET /external-monetization/networks, .../options
// ---------------------------------------------------------------------------

export const externalNetworkSchema = z
  .object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
    helpUrl: z.string().nullish(),
    zonePattern: z.string().nullish(),
    defaultTag: z.string().nullish(),
    allowProxyDefault: z.boolean().default(true),
    authType: z.string().default("api_key"),
    credentialFields: z.array(z.string()).default([]),
  })
  .passthrough();

export type ExternalNetwork = z.infer<typeof externalNetworkSchema>;

export const externalNetworkListSchema = z.object({
  networks: z.array(externalNetworkSchema).default([]),
});

/** Geo ids come from `geo.geoID`, a different space than /api/countries. */
export const externalMonetizationOptionsSchema = z.object({
  networks: z.array(externalNetworkSchema).default([]),
  geo: z
    .array(
      z.object({ id: z.number(), label: z.string(), tier: z.number().nullish() }).passthrough(),
    )
    .default([]),
});

export type ExternalMonetizationOptions = z.infer<typeof externalMonetizationOptionsSchema>;

// ---------------------------------------------------------------------------
// GET/POST/PUT/DELETE /external-monetization/accounts
// ---------------------------------------------------------------------------

/** Credentials never come back — only a mask of what was stored. */
export const externalNetworkAccountSchema = z
  .object({
    id: z.number(),
    networkId: z.number(),
    name: z.string(),
    mask: z.string().nullish(),
    active: z.boolean().default(true),
    createdAt: z.number().default(0),
    verifiedAt: z.number().default(0),
    lastError: z.string().nullish(),
    placementsInUse: z.number().default(0),
  })
  .passthrough();

export type ExternalNetworkAccount = z.infer<typeof externalNetworkAccountSchema>;

export const externalNetworkAccountListSchema = z.array(externalNetworkAccountSchema);

// ---------------------------------------------------------------------------
// GET /external-monetization/accounts/{id}/placements
// ---------------------------------------------------------------------------

/** The zone id at the network: a codename as often as a number, so always a string. */
export const externalPlacementSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    site: z.string().nullish(),
    formatLabel: z.string().nullish(),
    tag: z.string().nullish(),
    matchesFormat: z.boolean().default(false),
    matchesSite: z.boolean().default(false),
  })
  .passthrough();

export type ExternalPlacement = z.infer<typeof externalPlacementSchema>;

export const externalPlacementListSchema = z.object({
  items: z.array(externalPlacementSchema).default([]),
});

// ---------------------------------------------------------------------------
// /external-monetization/connections
// ---------------------------------------------------------------------------

export const externalConnectionSchema = z
  .object({
    id: z.number(),
    blockId: z.number(),
    networkId: z.number(),
    format: z.string(),
    extBlockId: z.string(),
    extBlockName: z.string().nullish(),
    tagTemplate: z.string().nullish(),
    accountId: z.number().default(0),
    uniqCap: z.number().default(0),
    allowProxy: z.boolean().default(true),
    geo: z.array(z.number()).default([]),
    active: z.boolean().default(true),
    tagWarnings: z.array(z.string()).default([]),
    testShare: z.number().default(0),
    testState: z.string().default("off"),
    testSlicesTotal: z.number().default(0),
    testSlicesPending: z.number().default(0),
  })
  .passthrough();

export type ExternalConnection = z.infer<typeof externalConnectionSchema>;

export const externalConnectionListSchema = z.object({
  items: z.array(externalConnectionSchema).default([]),
});
