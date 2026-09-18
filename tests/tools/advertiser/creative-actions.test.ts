import { describe, it, expect } from "vitest";
import { creativeActionsModule } from "../../../src/tools/advertiser/creative-actions.js";
import { createToolClient, getTextFromResult } from "../../helpers/tool-client.js";
import type { MockPartnersClient } from "../../helpers/tool-client.js";

describe("creative actions", () => {
  it("copy_creatives reports the copy count and the source-to-copy mapping", async () => {
    const { client, mockApi } = await createToolClient(creativeActionsModule);
    const api = mockApi as MockPartnersClient;
    api.copyCreatives.mockResolvedValue({
      successful: 2,
      failed: 0,
      errors: [],
      ids: { "456": 981 },
    } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_copy_creatives",
        arguments: {
          creativeIds: "456,457",
          targets: [{ campaignId: 7, url: "https://example.com/landing" }],
        },
      }),
    );

    expect(api.copyCreatives).toHaveBeenCalledWith(
      [456, 457],
      [{ campaignId: 7, url: "https://example.com/landing" }],
      true,
    );
    expect(text).toContain("2 copies created");
    expect(text).toContain("#456 -> #981");
    expect(text).toContain("moderation");
  });

  it("copy_creatives surfaces the refused pairs instead of reporting a clean success", async () => {
    const { client, mockApi } = await createToolClient(creativeActionsModule);
    const api = mockApi as MockPartnersClient;
    api.copyCreatives.mockResolvedValue({
      successful: 1,
      failed: 1,
      errors: ["Creative 457 has no source files"],
      ids: { "456": 981 },
    } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_copy_creatives",
        arguments: {
          creativeIds: "456,457",
          targets: [{ campaignId: 7, url: "https://example.com/landing" }],
          pauseAfterModeration: false,
        },
      }),
    );

    expect(api.copyCreatives).toHaveBeenCalledWith(
      [456, 457],
      [{ campaignId: 7, url: "https://example.com/landing" }],
      false,
    );
    expect(text).toContain("1 refused");
    expect(text).toContain("has no source files");
  });

  it("copy_creatives warns that the mapping covers one target when there are several", async () => {
    const { client, mockApi } = await createToolClient(creativeActionsModule);
    const api = mockApi as MockPartnersClient;
    api.copyCreatives.mockResolvedValue({
      successful: 2,
      failed: 0,
      errors: [],
      ids: { "456": 981 },
    } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_copy_creatives",
        arguments: {
          creativeIds: "456",
          targets: [
            { campaignId: 7, url: "https://example.com/a" },
            { campaignId: 8, url: "https://example.com/b" },
          ],
        },
      }),
    );

    expect(text).toContain("2 campaign(s)");
    expect(text).toContain("use it as a sample");
  });

  it("copy_creatives rejects a repeated target campaign before calling the API", async () => {
    const { client, mockApi } = await createToolClient(creativeActionsModule);
    const api = mockApi as MockPartnersClient;

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_copy_creatives",
        arguments: {
          creativeIds: "456",
          targets: [
            { campaignId: 7, url: "https://example.com/a" },
            { campaignId: 7, url: "https://example.com/b" },
          ],
        },
      }),
    );

    expect(api.copyCreatives).not.toHaveBeenCalled();
    expect(text).toContain("must be unique");
  });

  it("move_creatives states what the move costs the creatives", async () => {
    const { client, mockApi } = await createToolClient(creativeActionsModule);
    const api = mockApi as MockPartnersClient;
    api.moveCreatives.mockResolvedValue({
      materials: [
        { id: 456, success: true },
        { id: 457, success: false },
      ],
      totalMaterials: 2,
      processedMaterials: 1,
    } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_move_creatives",
        arguments: { creativeIds: "456,457", campaignId: 9, url: "https://example.com/landing" },
      }),
    );

    expect(api.moveCreatives).toHaveBeenCalledWith([456, 457], 9, "https://example.com/landing");
    expect(text).toContain("1/2 creatives moved to campaign #9");
    expect(text).toContain("#457");
    expect(text).toContain("per-geo bids are gone");
  });

  it("move_creatives rejects duplicate creative ids", async () => {
    const { client, mockApi } = await createToolClient(creativeActionsModule);
    const api = mockApi as MockPartnersClient;

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_move_creatives",
        arguments: { creativeIds: "456,456", campaignId: 9, url: "https://example.com/landing" },
      }),
    );

    expect(api.moveCreatives).not.toHaveBeenCalled();
    expect(text).toContain("Creative identifiers must be unique");
  });

  it("set_creative_bids states that the list replaces the bids", async () => {
    const { client, mockApi } = await createToolClient(creativeActionsModule);
    const api = mockApi as MockPartnersClient;
    api.setCreativeBids.mockResolvedValue({
      materials: [
        { id: 456, success: true },
        { id: 457, success: true },
      ],
      totalMaterials: 2,
      processedMaterials: 2,
    } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_set_creative_bids",
        arguments: {
          creativeIds: "456,457",
          bids: [{ bid: 1.5, countries: [1, 2] }],
        },
      }),
    );

    expect(api.setCreativeBids).toHaveBeenCalledWith([456, 457], [{ bid: 1.5, countries: [1, 2] }]);
    expect(text).toContain("2/2 creatives re-priced");
    expect(text).toContain("fall back to the campaign bid");
  });

  it("set_creative_bids surfaces a creative the backend refused", async () => {
    const { client, mockApi } = await createToolClient(creativeActionsModule);
    const api = mockApi as MockPartnersClient;
    api.setCreativeBids.mockResolvedValue({
      materials: [
        { id: 456, success: true },
        { id: 457, success: false },
      ],
      totalMaterials: 2,
      processedMaterials: 1,
    } as never);

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_set_creative_bids",
        arguments: { creativeIds: "456,457", bids: [{ bid: 1.5, countries: [1] }] },
      }),
    );

    expect(text).toContain("1/2 creatives re-priced");
    expect(text).toContain("#457");
  });

  it("set_creative_bids rejects duplicate creative ids", async () => {
    const { client, mockApi } = await createToolClient(creativeActionsModule);
    const api = mockApi as MockPartnersClient;

    const text = getTextFromResult(
      await client.callTool({
        name: "kadam_adv_set_creative_bids",
        arguments: { creativeIds: "456,456", bids: [{ bid: 1.5, countries: [1] }] },
      }),
    );

    expect(api.setCreativeBids).not.toHaveBeenCalled();
    expect(text).toContain("Creative identifiers must be unique");
  });
});
