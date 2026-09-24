import { z } from "zod";

/**
 * Kadam Smart Mediation (plain "mediation" in the API): the publisher's own accounts
 * in outside ad networks, attached to their ad units. Endpoints live under /mediation/*.
 */

// ---------------------------------------------------------------------------
// GET /mediation/networks, .../options
// ---------------------------------------------------------------------------

export const mediationNetworkSchema = z
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

export type MediationNetwork = z.infer<typeof mediationNetworkSchema>;

export const mediationNetworkListSchema = z.object({
  networks: z.array(mediationNetworkSchema).default([]),
});

/** Geo ids come from `geo.geoID`, a different space than /api/countries. */
export const mediationOptionsSchema = z.object({
  networks: z.array(mediationNetworkSchema).default([]),
  geo: z
    .array(
      z.object({ id: z.number(), label: z.string(), tier: z.number().nullish() }).passthrough(),
    )
    .default([]),
});

export type MediationOptions = z.infer<typeof mediationOptionsSchema>;

// ---------------------------------------------------------------------------
// GET/POST/PUT/DELETE /mediation/accounts
// ---------------------------------------------------------------------------

/** Credentials never come back — only a mask of what was stored. */
export const mediationAccountSchema = z
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

export type MediationAccount = z.infer<typeof mediationAccountSchema>;

export const mediationAccountListSchema = z.array(mediationAccountSchema);

// ---------------------------------------------------------------------------
// GET /mediation/accounts/{id}/placements
// ---------------------------------------------------------------------------

/** The zone id at the network: a codename as often as a number, so always a string. */
export const mediationPlacementSchema = z
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

export type MediationPlacement = z.infer<typeof mediationPlacementSchema>;

export const mediationPlacementListSchema = z.object({
  items: z.array(mediationPlacementSchema).default([]),
});

/** GET .../placements/{zone}/tag: null when the network has no code for the zone. */
export const mediationPlacementTagSchema = z.object({
  tag: z.string().nullish(),
});

// ---------------------------------------------------------------------------
// /mediation/connections
// ---------------------------------------------------------------------------

export const mediationConnectionSchema = z
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

export type MediationConnection = z.infer<typeof mediationConnectionSchema>;

export const mediationConnectionListSchema = z.object({
  items: z.array(mediationConnectionSchema).default([]),
});
