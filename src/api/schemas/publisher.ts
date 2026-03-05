import { z } from "zod";

export const sourceSchema = z.object({
  id: z.number(),
  name: z.string(),
  url: z.string(),
  status: z.string().optional().default("unknown"),
  state: z.string().optional().default("unknown"),
  impressions: z.number().optional().default(0),
  clicks: z.number().optional().default(0),
  revenue: z.number().optional().default(0),
  placesCount: z.number().optional().default(0),
}).passthrough();

export type Source = z.infer<typeof sourceSchema>;

export const adUnitSchema = z.object({
  id: z.number(),
  sourceId: z.number().optional().default(0),
  name: z.string(),
  type: z.number(),
  status: z.string().optional().default("unknown"),
  impressions: z.number().optional().default(0),
  clicks: z.number().optional().default(0),
  revenue: z.number().optional().default(0),
}).passthrough();

export type AdUnit = z.infer<typeof adUnitSchema>;

export const pubUserSchema = z.object({
  id: z.number().optional(),
  email: z.string().optional().default(""),
  balance: z.number().optional().default(0),
  name: z.string().optional().default(""),
  notificationsCount: z.number().optional().default(0),
}).passthrough();

export type PubUser = z.infer<typeof pubUserSchema>;
