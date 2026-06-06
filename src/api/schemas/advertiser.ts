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
    status: z.number().optional().default(0),
  })
  .passthrough();

export type FinanceRow = z.infer<typeof financeRowSchema>;

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
