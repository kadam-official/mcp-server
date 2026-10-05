import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { creativeBulkModule } from "../../../src/tools/advertiser/creative-bulk.js";
import { createToolClient, getTextFromResult } from "../../helpers/tool-client.js";
import type { MockPartnersClient } from "../../helpers/tool-client.js";

const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
);

describe("bulk creative tools", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(PNG_1X1, { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("upload_bulk_images queues the staging and points at the job", async () => {
    const { client, mockApi } = await createToolClient(creativeBulkModule);
    const api = mockApi as MockPartnersClient;
    api.uploadBulkImages.mockResolvedValue({
      jobId: "job-1",
      total: 2,
      accepted: 2,
      skipped: 0,
      truncated: false,
    } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_upload_bulk_images",
        arguments: {
          campaignIds: [7, 8],
          images: ["https://example.com/a.png", "https://example.com/b.png"],
        },
      }),
    );

    expect(api.uploadBulkImages).toHaveBeenCalledTimes(1);
    const [campaignIds, files] = api.uploadBulkImages.mock.calls[0]!;
    expect(campaignIds).toEqual([7, 8]);
    expect(files).toHaveLength(2);
    expect(text).toContain("accepted: 2 of 2");
    expect(text).toContain("job-1");
    expect(text).toContain("kadam_adv_get_bulk_job");
  });

  /**
   * Дроп части пачки под лимит должен быть в тексте: иначе модель отчитается о полной
   * загрузке, а картинок будет меньше.
   */
  it("upload_bulk_images says when part of the batch was dropped", async () => {
    const { client, mockApi } = await createToolClient(creativeBulkModule);
    const api = mockApi as MockPartnersClient;
    api.uploadBulkImages.mockResolvedValue({
      jobId: "job-2",
      total: 60,
      accepted: 50,
      skipped: 10,
      truncated: true,
    } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_upload_bulk_images",
        arguments: { campaignIds: [7], images: ["https://example.com/a.png"] },
      }),
    );

    expect(text).toContain("10 unit(s) were dropped");
  });

  it("create_bulk_creatives sends the staged ids and the shared settings", async () => {
    const { client, mockApi } = await createToolClient(creativeBulkModule);
    const api = mockApi as MockPartnersClient;
    api.createBulkCreatives.mockResolvedValue({
      jobId: "job-3",
      total: 4,
      accepted: 4,
      skipped: 0,
      truncated: false,
    } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_create_bulk_creatives",
        arguments: {
          campaignIds: [7, 8],
          items: [
            { stagedId: "a1", title: "One" },
            { stagedId: "a2", title: "Two" },
          ],
          pauseAfterModeration: true,
        },
      }),
    );

    expect(api.createBulkCreatives).toHaveBeenCalledWith({
      campaignIds: [7, 8],
      items: [
        { stagedId: "a1", title: "One" },
        { stagedId: "a2", title: "Two" },
      ],
      common: { pauseAfterModer: true },
    });
    expect(text).toContain("accepted: 4 of 4");
    expect(text).toContain("job-3");
  });

  it("get_bulk_job lists the staged images an upload job produced", async () => {
    const { client, mockApi } = await createToolClient(creativeBulkModule);
    const api = mockApi as MockPartnersClient;
    api.getBulkJob.mockResolvedValue({
      kind: "upload",
      jobId: "job-1",
      status: "done",
      expectedTotal: 2,
      processedTotal: 2,
      successCount: 1,
      failedCount: 1,
      staged: [{ stagedId: "a1", originalName: "banner.jpg", width: 1200, height: 628 }],
      rejected: [
        { stagedId: "a2", originalName: "tiny.png", code: "image_too_small", message: "Too small" },
      ],
    } as never);

    const text = getTextFromResult(
      await client.callTool({ name: "kadam_adv_get_bulk_job", arguments: { jobId: "job-1" } }),
    );

    expect(text).toContain("1 succeeded, 1 failed");
    expect(text).toContain("a1 — banner.jpg (1200x628)");
    expect(text).toContain("tiny.png: Too small");
  });

  it("get_bulk_job surfaces the rows a create job could not build", async () => {
    const { client, mockApi } = await createToolClient(creativeBulkModule);
    const api = mockApi as MockPartnersClient;
    api.getBulkJob.mockResolvedValue({
      kind: "create",
      jobId: "job-3",
      status: "done",
      expectedTotal: 2,
      processedTotal: 2,
      successCount: 1,
      failedCount: 1,
      items: [
        { seq: 0, status: "success" },
        { seq: 1, status: "failed", code: "image_rejected", message: "Image is too small" },
      ],
    } as never);

    const text = getTextFromResult(
      await client.callTool({ name: "kadam_adv_get_bulk_job", arguments: { jobId: "job-3" } }),
    );

    expect(text).toContain("row 1: Image is too small");
    expect(text).not.toContain("row 0");
  });

  /**
   * `done` относится к воркеру, а не к строкам; пока джоба идёт, числа в ответе неполные,
   * и об этом должно быть сказано прямо.
   */
  it("get_bulk_job warns that a running job's counters are not final", async () => {
    const { client, mockApi } = await createToolClient(creativeBulkModule);
    const api = mockApi as MockPartnersClient;
    api.getBulkJob.mockResolvedValue({
      kind: "create",
      jobId: "job-4",
      status: "processing",
      expectedTotal: 10,
      processedTotal: 3,
      successCount: 3,
      failedCount: 0,
    } as never);

    const text = getTextFromResult(
      await client.callTool({ name: "kadam_adv_get_bulk_job", arguments: { jobId: "job-4" } }),
    );

    expect(text).toContain("Still running");
  });
});
