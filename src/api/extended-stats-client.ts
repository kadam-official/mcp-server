import { AutorulesApiClient } from "./autorules-client.js";
import { listResponseSchema } from "./schemas/common.js";
import type { ListResponse } from "./schemas/common.js";
import {
  extendedBidsResultSchema,
  extendedBidsUpdateResponseSchema,
} from "./schemas/advertiser.js";
import type { ExtendedBid } from "./schemas/advertiser.js";
import { z } from "zod";

/**
 * Extended-statistics (Bid Optimization) calls of the advertiser API. Split out of
 * {@link PartnersClient} only to keep that file under the size gate — it is the same client,
 * reachable through the same instance.
 */
export class ExtendedStatsApiClient extends AutorulesApiClient {
  async getExtendedStats(
    params: Record<string, unknown>,
  ): Promise<ListResponse<Record<string, unknown>>> {
    const raw = await this.http.post("/stats/extended", params);
    return listResponseSchema(z.record(z.unknown())).parse(raw);
  }

  async listExtendedBids(campaignIds: number[]): Promise<Record<string, ExtendedBid[]>> {
    const qs = campaignIds.map((id) => `campaignIds[]=${id}`).join("&");
    const raw = await this.http.get(`/stats/extended/bids?${qs}`);
    return extendedBidsResultSchema.parse(raw).bids;
  }

  async updateExtendedBids(data: Record<string, unknown>): Promise<{ affectedCampaigns?: number }> {
    const raw = await this.http.put("/stats/extended/bids", data);
    return extendedBidsUpdateResponseSchema.parse(raw);
  }

  async resetExtendedBids(campaignIds: number[]): Promise<{ affectedCampaigns?: number }> {
    const raw = await this.http.post("/stats/extended/bids/reset", { campaignIds });
    return extendedBidsUpdateResponseSchema.parse(raw);
  }

  async toggleAutoruleSliceBlock(campaignId: number, pathIds: number[]): Promise<boolean> {
    const raw = (await this.http.put("/stats/extended/slice-block", { campaignId, pathIds })) as {
      blocked: boolean;
    };

    return raw.blocked;
  }

  async getCampaignAutoruleSlices(campaignId: number): Promise<unknown[]> {
    const raw = (await this.http.get(`/stats/extended/autorule-slices/${campaignId}`)) as {
      slices?: unknown[];
    };

    return raw.slices ?? [];
  }

  async getCampaignBidRestrictions(campaignId: number): Promise<{
    maxBid: string;
    isCPATarget: boolean;
    maxCoefficient: number;
    baseBid: string | null;
  }> {
    return (await this.http.get(`/stats/extended/campaign-restrictions/${campaignId}`)) as {
      maxBid: string;
      isCPATarget: boolean;
      maxCoefficient: number;
      baseBid: string | null;
    };
  }
}
