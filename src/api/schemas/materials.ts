import { z } from "zod";

/**
 * Схемы ответов по материалам: массовые действия, копирование и пачечное создание.
 */

/**
 * Bulk material actions (activate/pause/archive/restore/delete) use the same per-id
 * envelope as campaigns, keyed on `materials` instead of `campaigns`.
 */
/**
 * Copy answers with counters, not per id: one creative copied into three campaigns is
 * three copies, so a per-id shape could not express the result.
 */
export const creativeCopyResultSchema = z.object({
  successful: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
  ids: z.record(z.string(), z.number()),
});
export type CreativeCopyResult = z.infer<typeof creativeCopyResultSchema>;

/**
 * Both steps of a bulk batch answer the same way: the work is queued, here is the job.
 */
export const materialBulkEnqueuedSchema = z.object({
  jobId: z.string(),
  total: z.number(),
  accepted: z.number(),
  skipped: z.number(),
  truncated: z.boolean(),
});
export type MaterialBulkEnqueued = z.infer<typeof materialBulkEnqueuedSchema>;

/**
 * One endpoint serves both job kinds, so the kind-specific parts are optional: `staged`
 * and `rejected` belong to an upload job, `items` to a create job.
 */
export const materialBulkJobSchema = z.object({
  kind: z.enum(["upload", "create"]),
  jobId: z.string(),
  status: z.string(),
  expectedTotal: z.number(),
  processedTotal: z.number(),
  successCount: z.number(),
  failedCount: z.number(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  finishedAt: z.string().nullable().optional(),
  staged: z
    .array(
      z.object({
        stagedId: z.string(),
        originalName: z.string(),
        width: z.number().nullable().optional(),
        height: z.number().nullable().optional(),
        mime: z.string().nullable().optional(),
      }),
    )
    .optional(),
  rejected: z
    .array(
      z.object({
        stagedId: z.string(),
        originalName: z.string(),
        code: z.string().nullable().optional(),
        message: z.string().nullable().optional(),
      }),
    )
    .optional(),
  items: z
    .array(
      z.object({
        seq: z.number(),
        status: z.string(),
        code: z.string().nullable().optional(),
        message: z.string().nullable().optional(),
      }),
    )
    .optional(),
});
export type MaterialBulkJob = z.infer<typeof materialBulkJobSchema>;

export const materialBulkActionSchema = z
  .object({
    materials: z.array(z.object({ id: z.number(), success: z.boolean() }).passthrough()),
    totalMaterials: z.number(),
    processedMaterials: z.number(),
  })
  .passthrough();

export type MaterialBulkAction = z.infer<typeof materialBulkActionSchema>;
