import type { HttpClient } from "./http-client.js";
import {
  autoruleSchema,
  autorulesResultSchema,
  autoruleWriteResponseSchema,
} from "./schemas/advertiser.js";
import type { Autorule } from "./schemas/advertiser.js";

/**
 * Autorule calls of the advertiser API. Split out of {@link PartnersClient} only to keep that file
 * under the size gate — it is the same client, reachable through the same instance.
 */
export class AutorulesApiClient {
  constructor(protected readonly http: HttpClient) {}

  async listAutorules(): Promise<Autorule[]> {
    const raw = await this.http.get("/autorules");
    return autorulesResultSchema.parse(raw).rules;
  }

  async listCampaignAutorules(campaignId: number): Promise<Autorule[]> {
    const raw = await this.http.get(`/campaigns/${campaignId}/autorules`);
    return autorulesResultSchema.parse(raw).rules;
  }

  async getAutorule(id: number): Promise<Autorule> {
    const raw = await this.http.get(`/autorules/${id}`);
    return autoruleSchema.parse(raw);
  }

  async createAutorule(
    campaignId: number,
    data: Record<string, unknown>,
  ): Promise<{ id?: number }> {
    const raw = await this.http.post(`/campaigns/${campaignId}/autorules`, data);
    return autoruleWriteResponseSchema.parse(raw);
  }

  async updateAutorule(id: number, data: Record<string, unknown>): Promise<unknown> {
    return this.http.put(`/autorules/${id}`, data);
  }

  async setAutoruleStatus(id: number, isActive: boolean): Promise<unknown> {
    return this.http.put(`/autorules/${id}/status`, { isActive });
  }

  async deleteAutorule(id: number): Promise<unknown> {
    return this.http.delete(`/autorules/${id}`);
  }
}
