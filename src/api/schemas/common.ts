import { z } from "zod";

export function listResponseSchema<T extends z.ZodTypeAny>(rowSchema: T) {
  return z.object({
    rows: z.array(rowSchema).default([]),
    totalRows: z.number().default(0),
    page: z.number().default(1),
    perPage: z.number().default(25),
    total: z.record(z.unknown()).optional(),
    columns: z.array(z.unknown()).optional(),
    isHasNextPage: z.boolean().optional(),
  });
}

export type ListResponse<T> = {
  rows: T[];
  totalRows: number;
  page: number;
  perPage: number;
  total?: Record<string, unknown>;
  columns?: unknown[];
  isHasNextPage?: boolean;
};

export const reportConfigGroupSchema = z.object({
  id: z.string(),
  icon: z.string().optional(),
  sources: z.array(z.number()).optional(),
  filterType: z.string().optional(),
  filterSync: z.boolean().optional(),
}).passthrough();

export const reportConfigMetricSchema = z.object({
  id: z.string(),
  unit: z.string().nullable().optional(),
  sources: z.array(z.number()).optional(),
}).passthrough();

export const reportConfigSchema = z.object({
  groups: z.record(z.array(reportConfigGroupSchema)),
  metrics: z.record(z.array(reportConfigMetricSchema)),
}).passthrough();

export const reportDataResponseSchema = z.object({
  rows: z.array(z.record(z.unknown())).default([]),
  totalRows: z.number().default(0),
  total: z.record(z.unknown()).optional(),
  page: z.number().optional(),
  perPage: z.number().optional(),
  columns: z.array(z.unknown()).optional(),
});

export type ReportConfigGroup = z.infer<typeof reportConfigGroupSchema>;
export type ReportConfigMetric = z.infer<typeof reportConfigMetricSchema>;
export type ReportConfig = z.infer<typeof reportConfigSchema>;
export type ReportDataResponse = z.infer<typeof reportDataResponseSchema>;
