import { z } from "zod";

export const campaignRowSchema = z
  .object({
    campaign: z
      .object({
        id: z.number(),
        name: z.string(),
        state: z.object({ id: z.string(), label: z.string().optional() }).passthrough(),
        type: z.object({ id: z.string(), label: z.string().optional() }).passthrough(),
        folder: z.object({ id: z.number(), name: z.string() }).passthrough(),
        model: z.string().optional(),
        active: z.number().optional().default(0),
        total: z.number().optional().default(0),
        reason: z.string().nullable().optional(),
        url: z.string().optional().default(""),
      })
      .passthrough(),
    dayMoneyLimit: z.string().optional().default("0"),
    views: z.string().optional().default("0"),
    clicks: z.string().optional().default("0"),
    moneyOut: z.string().optional().default("0"),
  })
  .passthrough();

export type CampaignRow = z.infer<typeof campaignRowSchema>;

export const folderRowSchema = z
  .object({
    folder: z
      .object({
        id: z.number(),
        name: z.string(),
        state: z.object({ id: z.string(), label: z.string().optional() }).passthrough(),
        campaignsCount: z.number().optional().default(0),
        activeCampaignsCount: z.number().optional().default(0),
      })
      .passthrough(),
    views: z.string().optional().default("0"),
    clicks: z.string().optional().default("0"),
    moneyOut: z.string().optional().default("0"),
  })
  .passthrough();

export type FolderRow = z.infer<typeof folderRowSchema>;

export const creativeRowSchema = z
  .object({
    ad: z
      .object({
        id: z.number(),
        title: z.string().optional(),
        text: z.string().optional(),
        status: z.object({ id: z.string(), label: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
    materialCampaign: z
      .object({
        id: z.number(),
        name: z.string(),
      })
      .passthrough()
      .optional(),
    views: z.string().optional().default("0"),
    clicks: z.string().optional().default("0"),
  })
  .passthrough();

export type CreativeRow = z.infer<typeof creativeRowSchema>;

export const audienceRowSchema_ = z
  .object({
    audienceId: z.number(),
    audienceName: z.string(),
    type: z.string(),
    fp: z.boolean().optional().default(false),
    dateCreated: z.string().optional().default(""),
    expireDays: z.number().optional().default(0),
    reachToday: z.number().optional().default(0),
    newToday: z.number().optional().default(0),
    reach7d: z.number().optional().default(0),
    new7d: z.number().optional().default(0),
  })
  .passthrough();

export type AudienceRow = z.infer<typeof audienceRowSchema_>;

export const audienceDetailSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    type: z.string(),
    expireDays: z.number().optional().default(0),
    audienceCode: z.string().nullable().optional(),
    linkedAudiencesIds: z.array(z.number()).optional().default([]),
    linkedAudiences: z.record(z.string()).optional(),
    usersIds: z.array(z.unknown()).nullable().optional().default(null),
    fp: z.union([z.object({ id: z.number(), name: z.string() }), z.boolean(), z.null()]).optional(),
    hasClicks: z.boolean().optional(),
    hasConversions: z.boolean().optional(),
    hasHolds: z.boolean().optional(),
    hasRejects: z.boolean().optional(),
    campaignsIds: z.array(z.union([z.number(), z.string().transform(Number)])).optional(),
    campaigns: z.record(z.string()).optional(),
    extAudienceId: z.number().nullable().optional(),
  })
  .passthrough();

export type AudienceDetail = z.infer<typeof audienceDetailSchema>;

export const financeRowSchema = z
  .object({
    date: z.string(),
    money: z.string(),
    type: z.string(),
    extType: z.string().optional().default(""),
    comment: z.string().optional().default(""),
    // adv/.../OperationsDataTable.php emits status as { id, label } (since
    // KPE-6131, 2023-06); keep number for back-compat. passthrough tolerates
    // extra keys.
    status: z
      .union([z.number(), z.object({ id: z.number(), label: z.string() }).passthrough()])
      .optional(),
  })
  .passthrough();

export type FinanceRow = z.infer<typeof financeRowSchema>;

export const accountProfileSchema = z
  .object({
    id: z.number(),
    balance: z.number(),
    currency: z.string(),
    registeredAt: z.string(),
    timezone: z.number().int().min(-12).max(12),
  })
  .passthrough();

export type AccountProfile = z.infer<typeof accountProfileSchema>;

export const accountBalanceSchema = z
  .object({
    balance: z.number(),
    currency: z.string(),
  })
  .passthrough();

export type AccountBalance = z.infer<typeof accountBalanceSchema>;

export const paymentSystemCurrencySchema = z
  .object({
    currency: z.string(),
    currencyId: z.number(),
    commission: z.number(),
    constCommission: z.number(),
    min: z.number(),
    // null means the system sets no upper bound on a deposit.
    max: z.number().nullable(),
    // null means the platform has no rate for this currency, so the credited
    // amount cannot be predicted client-side.
    exchangeRateToAccountCurrency: z.number().nullable(),
  })
  .passthrough();

export type PaymentSystemCurrency = z.infer<typeof paymentSystemCurrencySchema>;

export const paymentSystemSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    isManualThroughManager: z.boolean(),
    isPromocodeAvailable: z.boolean(),
    taxPercent: z.number(),
    currencies: z.array(paymentSystemCurrencySchema),
  })
  .passthrough();

export type PaymentSystem = z.infer<typeof paymentSystemSchema>;

export const paymentSystemsSchema = z
  .object({
    paymentSystems: z.array(paymentSystemSchema),
  })
  .passthrough();

export type PaymentSystems = z.infer<typeof paymentSystemsSchema>;

export const dayMoneyLimitSchema = z
  .object({
    // 0 means the account has no daily cap. Named `limit` because the endpoint
    // already scopes it — `dayMoneyLimit` is the per-campaign budget.
    limit: z.number(),
    // null means this account may not change the limit at all.
    minimum: z.number().nullable(),
    currency: z.string(),
  })
  .passthrough();

export type DayMoneyLimit = z.infer<typeof dayMoneyLimitSchema>;

export const creativeCreateResponseSchema = z
  .object({
    id: z.number(),
  })
  .passthrough();

export const campaignCreateResponseSchema = z
  .object({
    id: z.number(),
  })
  .passthrough();

export const folderCreateResponseSchema = z
  .object({
    id: z.number(),
  })
  .passthrough();

export const folderViewSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    isDefault: z.boolean().optional().default(false),
    isArchived: z.boolean().optional().default(false),
    limitsEnabled: z.boolean().optional().default(false),
    groupDailyLimit: z.number().optional().default(0),
    groupTotalLimit: z.number().optional().default(0),
    groupSpendingEvenly: z.boolean().optional().default(false),
    groupBlockStatus: z.number().optional().default(0),
  })
  .passthrough();

export type FolderView = z.infer<typeof folderViewSchema>;

export const folderBulkActionResultSchema = z
  .object({
    folders: z.array(
      z
        .object({
          id: z.number(),
          success: z.boolean(),
          campaignsTotal: z.number(),
          campaignsProcessed: z.number(),
        })
        .passthrough(),
    ),
    totalFolders: z.number(),
    processedFolders: z.number(),
  })
  .passthrough();

export type FolderBulkActionResult = z.infer<typeof folderBulkActionResultSchema>;

/**
 * Bulk campaign actions (activate/pause/archive/restore/delete/move) report each campaign separately:
 * a campaign the backend refused still arrives inside a 200 with `success: false`.
 */
export const campaignBulkActionSchema = z
  .object({
    campaigns: z.array(z.object({ id: z.number(), success: z.boolean() }).passthrough()),
    totalCampaigns: z.number(),
    processedCampaigns: z.number(),
  })
  .passthrough();

export type CampaignBulkAction = z.infer<typeof campaignBulkActionSchema>;

/**
 * Bulk material actions (activate/pause/archive/restore/delete) use the same per-id
 * envelope as campaigns, keyed on `materials` instead of `campaigns`.
 */
export const materialBulkActionSchema = z
  .object({
    materials: z.array(z.object({ id: z.number(), success: z.boolean() }).passthrough()),
    totalMaterials: z.number(),
    processedMaterials: z.number(),
  })
  .passthrough();

export type MaterialBulkAction = z.infer<typeof materialBulkActionSchema>;

/**
 * Campaign copy. The campaign is created even when creatives fail to come across, so
 * `failed`/`errors` describe a partial result, not a rejected request.
 */
export const campaignCopyResultSchema = z
  .object({
    id: z.number(),
    successful: z.number(),
    failed: z.number(),
    errors: z.array(z.string()).default([]),
    bidsJobId: z.string().nullable().default(null),
  })
  .passthrough();

export type CampaignCopyResult = z.infer<typeof campaignCopyResultSchema>;

/**
 * Bulk URL replace. Campaigns without a match are absent from `campaigns`, so the list is
 * the result, not an echo of the request.
 */
export const campaignUrlReplaceResultSchema = z
  .object({
    mode: z.string(),
    find: z.string(),
    replace: z.string(),
    campaigns: z.array(
      z
        .object({
          campaignId: z.number(),
          name: z.string(),
          creativesCount: z.number(),
          oldValue: z.string().nullable().default(null),
          newValue: z.string().nullable().default(null),
          source: z.string().nullable().default(null),
        })
        .passthrough(),
    ),
    totalCampaigns: z.number(),
    totalCreatives: z.number(),
  })
  .passthrough();

export type CampaignUrlReplaceResult = z.infer<typeof campaignUrlReplaceResultSchema>;

// --- Autorules (CPC campaign automation) ---
export const autoruleConditionSchema = z
  .object({
    metric: z.string(),
    match: z.string(),
    value: z.number(),
  })
  .passthrough();

export const autoruleSchema = z
  .object({
    id: z.number(),
    campaignId: z.number(),
    typeId: z.number(),
    period: z.number().optional(),
    conditions: z.array(autoruleConditionSchema).default([]),
    statBy: z.string().nullable().optional(),
    action: z.string(),
    position: z.number().nullable().optional(),
    isActive: z.union([z.boolean(), z.number()]).optional(),
    slices: z.array(z.number()).nullable().optional(),
    bidRate: z.number().nullable().optional(),
    bidMax: z.number().nullable().optional(),
    dayLimitValue: z.number().nullable().optional(),
    dayLimitType: z.string().nullable().optional(),
    createdAt: z.number().nullable().optional(),
  })
  .passthrough();

export type Autorule = z.infer<typeof autoruleSchema>;

/** GET /autorules and GET /campaigns/{id}/autorules — tolerate `{rules:[]}` or a bare array. */
export const autorulesResultSchema = z.union([
  z.object({ rules: z.array(autoruleSchema).default([]) }).passthrough(),
  z.array(autoruleSchema).transform((rules) => ({ rules })),
]);

/** Create/status/delete write responses — only `id` is reliably present. */
export const autoruleWriteResponseSchema = z.object({ id: z.number().optional() }).passthrough();

// --- Extended statistics / Bid Optimization ---
export const extendedBidSchema = z
  .object({
    pathIds: z.array(z.number()).default([]),
    bid: z.union([z.string(), z.number()]).optional(),
    mode: z.string().nullable().optional(),
    state: z.string().optional(),
  })
  .passthrough();

export type ExtendedBid = z.infer<typeof extendedBidSchema>;

export const extendedBidsResultSchema = z
  .object({ bids: z.record(z.array(extendedBidSchema)).default({}) })
  .passthrough();

export const extendedBidsUpdateResponseSchema = z
  .object({ affectedCampaigns: z.number().optional() })
  .passthrough();

// --- Dictionaries ---

/**
 * One reference entry from GET /dictionaries/{type}.
 * `id` is an integer everywhere except the pseudo category `mainstream`.
 * `slug` is campaign-types only; `countryId`/`countryLabel` are isps only;
 * `children` is present on the tree dictionaries (platforms, devices, categories).
 */
export interface DictionaryItem {
  id: number | string;
  label: string;
  slug?: string;
  countryId?: number;
  countryLabel?: string | null;
  children?: DictionaryItem[];
}

export const dictionaryItemSchema: z.ZodType<DictionaryItem> = z.lazy(() =>
  z
    .object({
      id: z.union([z.number(), z.string()]),
      label: z.string(),
      slug: z.string().optional(),
      countryId: z.number().optional(),
      countryLabel: z.string().nullable().optional(),
      children: z.array(dictionaryItemSchema).optional(),
    })
    .passthrough(),
);

/** `total` ignores pagination, so for `isps` it can exceed `items.length`. */
export const dictionaryResultSchema = z
  .object({
    type: z.string(),
    total: z.number().default(0),
    items: z.array(dictionaryItemSchema).default([]),
  })
  .passthrough();

export type DictionaryResult = z.infer<typeof dictionaryResultSchema>;
