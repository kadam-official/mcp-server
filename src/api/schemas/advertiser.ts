import { z } from "zod";

export const campaignRowSchema = z.object({
  campaign: z.object({
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
  }).passthrough(),
  dayMoneyLimit: z.string().optional().default("0"),
  views: z.string().optional().default("0"),
  clicks: z.string().optional().default("0"),
  moneyOut: z.string().optional().default("0"),
}).passthrough();

export type CampaignRow = z.infer<typeof campaignRowSchema>;

export const folderRowSchema = z.object({
  folder: z.object({
    id: z.number(),
    name: z.string(),
    state: z.object({ id: z.string(), label: z.string().optional() }).passthrough(),
    campaignsCount: z.number().optional().default(0),
    activeCampaignsCount: z.number().optional().default(0),
  }).passthrough(),
  views: z.string().optional().default("0"),
  clicks: z.string().optional().default("0"),
  moneyOut: z.string().optional().default("0"),
}).passthrough();

export type FolderRow = z.infer<typeof folderRowSchema>;

export const creativeRowSchema = z.object({
  ad: z.object({
    id: z.number(),
    title: z.string().optional(),
    text: z.string().optional(),
    status: z.object({ id: z.string(), label: z.string().optional() }).passthrough().optional(),
  }).passthrough().optional(),
  materialCampaign: z.object({
    id: z.number(),
    name: z.string(),
  }).passthrough().optional(),
  views: z.string().optional().default("0"),
  clicks: z.string().optional().default("0"),
}).passthrough();

export type CreativeRow = z.infer<typeof creativeRowSchema>;

export const audienceSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  expireDays: z.number().optional().default(0),
  size: z.number().optional().default(0),
  status: z.string().optional().default("unknown"),
  campaignsIds: z.array(z.number()).optional().default([]),
  hasClicks: z.boolean().optional(),
  hasConversions: z.boolean().optional(),
  hasHolds: z.boolean().optional(),
  hasRejects: z.boolean().optional(),
  linkedAudiencesIds: z.array(z.number()).optional().default([]),
  code: z.string().optional(),
}).passthrough();

export type Audience = z.infer<typeof audienceSchema>;

export const financeRowSchema = z.object({
  date: z.string(),
  money: z.string(),
  type: z.string(),
  extType: z.string().optional().default(""),
  comment: z.string().optional().default(""),
  status: z.number().optional().default(0),
}).passthrough();

export type FinanceRow = z.infer<typeof financeRowSchema>;

export const creativeCreateResponseSchema = z.object({
  id: z.number(),
}).passthrough();

export const campaignCreateResponseSchema = z.object({
  id: z.number(),
}).passthrough();
