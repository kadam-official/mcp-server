import { z } from "zod";

// ---------------------------------------------------------------------------
// GET /sources/{id}  |  PUT /sources (create)  |  PUT /sources/{id} (update)
// ---------------------------------------------------------------------------

export const sourceDetailSchema = z
  .object({
    id: z.number(),
    userID: z.number().optional(),
    name: z.string().nullable().transform((v) => v ?? ""),
    url: z.string(),
    createTime: z.number().optional(),
    state: z.string(),
    archive: z.number().optional().default(0),
    isDirectLink: z.boolean().optional().default(false),
    scriptTag: z.string().optional(),
    scriptDownloadLink: z.string().optional(),
    scriptUserSiteLink: z.string().optional(),
    extStatsLink: z.string().optional(),
    extStatsLogin: z.string().optional(),
  })
  .passthrough();

export type SourceDetail = z.infer<typeof sourceDetailSchema>;

// ---------------------------------------------------------------------------
// POST /sources/sources-table  (DataTable format)
// ---------------------------------------------------------------------------

const sourceNestedObjSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: z.number(),
  stage: z.string(),
  comment: z.string().optional(),
  archive: z.number().optional().default(0),
  isDirectLink: z.boolean().optional().default(false),
});

export const sourceTableRowSchema = z
  .object({
    source: z.union([sourceNestedObjSchema, z.literal("fullResult")]),
    domain: z.string().nullable().optional(),
    blockCounts: z.record(z.string()).nullable().optional(),
    views: z.string().default("0"),
    clicks: z.string().default("0"),
    ctr: z.string().default("0%"),
    income: z.string().default("0"),
    subscriptions: z.string().optional().default("0"),
    unsubscriptions: z.string().optional().default("0"),
  })
  .passthrough();

export type SourceTableRow = z.infer<typeof sourceTableRowSchema>;

/** Flattened source row for tool display */
export interface SourceRow {
  id: number;
  name: string;
  domain: string | null;
  stage: string;
  archive: number;
  views: number;
  clicks: number;
  income: string;
  blockCounts: Record<string, string> | null;
}

// ---------------------------------------------------------------------------
// POST /places/places-table/{sourceId}  (DataTable format)
// ---------------------------------------------------------------------------

const blockNestedObjSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: z.number(),
  archive: z.number().optional().default(0),
});

export const adUnitTableRowSchema = z
  .object({
    block: z.union([blockNestedObjSchema, z.literal("fullResult")]),
    type: z.string().nullable().optional(),
    queries: z.string().default("0"),
    views: z.string().default("0"),
    viewRate: z.union([z.string(), z.number()]).default("0"),
    clicks: z.string().default("0"),
    ctr: z.string().default("0%"),
    income: z.string().default("0"),
    ecpm: z.string().default("0"),
  })
  .passthrough();

export type AdUnitTableRow = z.infer<typeof adUnitTableRowSchema>;

/** Flattened ad unit row for tool display */
export interface AdUnitRow {
  id: number;
  name: string;
  type: string;
  state: number;
  archive: number;
  views: number;
  clicks: number;
  income: string;
  queries: number;
}

// ---------------------------------------------------------------------------
// POST /users/check-upd
// ---------------------------------------------------------------------------

export const pubUserSchema = z
  .object({
    balance: z.number().default(0),
    currency: z.string().optional().default("usd"),
    notifications: z
      .object({
        items: z.array(z.unknown()).optional().default([]),
        totalItems: z.number().optional().default(0),
        unreadItems: z.number().optional().default(0),
      })
      .optional(),
  })
  .passthrough();

export type PubUser = z.infer<typeof pubUserSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseNumericString(s: string): number {
  const cleaned = s.replace(/[^\d.\-]/g, "");
  return cleaned ? parseFloat(cleaned) : 0;
}
