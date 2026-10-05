import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import type { MaterialBulkEnqueued, MaterialBulkJob } from "../../api/schemas/advertiser.js";
import { loadFile } from "../../utils/files.js";

/**
 * Batch creative creation. It is a two-step, asynchronous flow — stage the images, then
 * build the creatives from them — so every tool here answers with a job to poll rather
 * than with a result.
 */

const POLL_HINT = "Poll kadam_adv_get_bulk_job with this jobId until status is done.";

function formatEnqueued(result: MaterialBulkEnqueued, what: string): string {
  const lines = [`${what} accepted: ${result.accepted} of ${result.total} unit(s).`];

  if (result.truncated) {
    lines.push(
      `${result.skipped} unit(s) were dropped to fit the per-batch cap; the rest still runs.`,
    );
  }
  lines.push(`Job: ${result.jobId}`, POLL_HINT);

  return lines.join("\n");
}

function formatJob(job: MaterialBulkJob): string {
  const lines = [
    `Job ${job.jobId} (${job.kind}): ${job.status}, ${job.processedTotal}/${job.expectedTotal} processed, ` +
      `${job.successCount} succeeded, ${job.failedCount} failed.`,
  ];

  if (job.status !== "done" && job.status !== "error") {
    lines.push("Still running — poll again before acting on the numbers above.");
  }
  if (job.errorMessage) {
    lines.push(`The job itself failed: ${job.errorMessage}`);
  }

  const staged = job.staged ?? [];
  if (staged.length > 0) {
    lines.push(
      "",
      "Staged images (pass these stagedId values to kadam_adv_create_bulk_creatives):",
      ...staged.map(
        (item) =>
          `- ${item.stagedId} — ${item.originalName} (${item.width ?? "?"}x${item.height ?? "?"})`,
      ),
    );
  }

  const rejected = job.rejected ?? [];
  if (rejected.length > 0) {
    lines.push(
      "",
      "Images staging refused:",
      ...rejected.map(
        (item) => `- ${item.originalName}: ${item.message ?? item.code ?? "no reason given"}`,
      ),
    );
  }

  const failedRows = (job.items ?? []).filter((item) => item.status === "failed");
  if (failedRows.length > 0) {
    lines.push(
      "",
      "Rows that did not produce a creative:",
      ...failedRows.map(
        (item) => `- row ${item.seq}: ${item.message ?? item.code ?? "no reason given"}`,
      ),
    );
  }

  return lines.join("\n");
}

export const creativeBulkModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_upload_bulk_images",
        description:
          "First step of a bulk creative batch: stage images so they can be turned into creatives. " +
          "Each image is checked against the formats of the target campaigns, which must be compatible " +
          "with each other. Staging is asynchronous — this call only queues the work and returns a job; " +
          "read the stagedId values from kadam_adv_get_bulk_job once it is done. Staged images count " +
          "against the account's daily creative limit, and a batch that would exceed it is rejected.",
        product: "advertiser",
        annotations: { title: "Stage bulk images", readOnlyHint: false },
      },
      {
        campaignIds: z
          .array(z.number().int().positive())
          .min(1)
          .describe("Campaigns the creatives will be created in"),
        images: z
          .array(z.string())
          .min(1)
          .max(50)
          .describe("Image URLs or local file paths to stage"),
        idempotencyKey: z
          .string()
          .optional()
          .describe(
            "Repeat an upload with the same key to get the same job instead of staging twice",
          ),
      },
      async (args, ctx) => {
        const files = await Promise.all(args.images.map((source) => loadFile(source)));

        const result = await ctx.adv.uploadBulkImages(
          args.campaignIds,
          files.map((file) => ({ blob: file.blob, filename: file.filename })),
          args.idempotencyKey,
        );

        return formatEnqueued(result, "Image staging");
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_bulk_creatives",
        description:
          "Second step of a bulk creative batch: turn staged images into creatives. Every item is created " +
          "in every listed campaign, so the batch size is items × campaigns. Each item needs a stagedId " +
          "from kadam_adv_upload_bulk_images. Creation is asynchronous — this call queues the work and " +
          "returns a job; read the per-row result from kadam_adv_get_bulk_job. Sending the same payload " +
          "again returns the same job instead of creating the creatives twice.",
        product: "advertiser",
        annotations: { title: "Create bulk creatives", readOnlyHint: false },
      },
      {
        campaignIds: z
          .array(z.number().int().positive())
          .min(1)
          .describe("Campaigns to create the creatives in"),
        items: z
          .array(
            z.object({
              stagedId: z.string().describe("Staged image from kadam_adv_upload_bulk_images"),
              iconStagedId: z
                .string()
                .optional()
                .describe("Staged square icon, for the formats that show one"),
              title: z.string().optional(),
              text: z.string().optional(),
              name: z.string().optional().describe("Internal name of the creative"),
              path: z
                .string()
                .optional()
                .describe("Landing URL path appended to the campaign URL for this row"),
            }),
          )
          .min(1)
          .max(50)
          .describe("Rows of the batch, one creative per campaign each"),
        pauseAfterModeration: z
          .boolean()
          .default(false)
          .describe("Keep the creatives paused after they pass moderation"),
      },
      async (args, ctx) => {
        const result = await ctx.adv.createBulkCreatives({
          campaignIds: args.campaignIds,
          items: args.items,
          common: { pauseAfterModer: args.pauseAfterModeration },
        });

        return formatEnqueued(result, "Creative creation");
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_get_bulk_job",
        description:
          "State of a bulk creative batch, for both steps: staged images and what staging refused for " +
          "an upload job, the per-row outcome for a creation job. Status done only means the worker " +
          "finished — individual rows can still have failed, so read the counters before reporting success.",
        product: "advertiser",
        annotations: { title: "Bulk job state", readOnlyHint: true },
      },
      {
        jobId: z.string().describe("Job ID returned by the upload or create call"),
      },
      async (args, ctx) => {
        const job = await ctx.adv.getBulkJob(args.jobId);
        return formatJob(job);
      },
    );
  },
};
