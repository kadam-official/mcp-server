import type { HttpClient } from "../../src/api/http-client.js";
import { PartnersClient } from "../../src/api/partners-client.js";

describe("PartnersClient", () => {
  it("moves campaigns through the v1 bulk endpoint and parses the response", async () => {
    const response = {
      campaigns: [
        { id: 1, success: true },
        { id: 2, success: true },
      ],
      totalCampaigns: 2,
      processedCampaigns: 2,
    };
    const http = {
      post: vi.fn().mockResolvedValue(response),
    } as unknown as HttpClient;
    const client = new PartnersClient(http);

    const result = await client.moveCampaigns([1, 2], 7);

    expect(http.post).toHaveBeenCalledWith("/campaigns/move", {
      campaignIds: [1, 2],
      folderId: 7,
    });
    expect(result).toEqual(response);
  });

  it("rejects a legacy bare success response for a bulk move", async () => {
    const http = {
      post: vi.fn().mockResolvedValue(true),
    } as unknown as HttpClient;
    const client = new PartnersClient(http);

    await expect(client.moveCampaigns([1], 7)).rejects.toThrow();
  });
});
