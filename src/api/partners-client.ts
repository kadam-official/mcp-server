import type { HttpClient } from "./http-client.js";
import {
  listResponseSchema,
  reportConfigSchema,
  reportDataResponseSchema,
} from "./schemas/common.js";
import type { ListResponse, ReportConfig, ReportDataResponse } from "./schemas/common.js";
import {
  campaignRowSchema,
  folderRowSchema,
  creativeRowSchema,
  audienceRowSchema_,
  audienceDetailSchema,
  financeRowSchema,
  campaignCreateResponseSchema,
  creativeCreateResponseSchema,
  folderCreateResponseSchema,
  autoruleSchema,
  autorulesResultSchema,
  autoruleWriteResponseSchema,
  extendedBidsResultSchema,
  extendedBidsUpdateResponseSchema,
} from "./schemas/advertiser.js";
import type {
  CampaignRow,
  FolderRow,
  CreativeRow,
  AudienceRow,
  AudienceDetail,
  FinanceRow,
  Autorule,
  ExtendedBid,
} from "./schemas/advertiser.js";
import { z } from "zod";
import { OptionsRegistry } from "./options-registry.js";

const campaignListSchema = listResponseSchema(campaignRowSchema);
const folderListSchema = listResponseSchema(folderRowSchema);
const creativeListSchema = listResponseSchema(creativeRowSchema);
const audienceListSchema = listResponseSchema(audienceRowSchema_);
const financeListSchema = listResponseSchema(financeRowSchema);

export interface ReportDataParams {
  groups?: string[];
  metrics?: string[];
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: string;
  campaignIds?: string;
  countries?: string;
  [key: string]: unknown;
}

/** Report config (groups/metrics) rarely changes; cache per client instance (== per tenant). */
const DEFAULT_REPORT_CONFIG_TTL_MS = 10 * 60 * 1000;

export class PartnersClient {
  readonly options: OptionsRegistry;
  private reportConfigCache: { data: ReportConfig; expiresAt: number } | null = null;
  private readonly reportConfigTtlMs: number;

  constructor(
    private readonly http: HttpClient,
    optionsTtlMs?: number,
  ) {
    this.options = new OptionsRegistry(http, optionsTtlMs);
    this.reportConfigTtlMs =
      optionsTtlMs && optionsTtlMs > 0 ? optionsTtlMs : DEFAULT_REPORT_CONFIG_TTL_MS;
  }

  async listCampaigns(params: Record<string, unknown>): Promise<ListResponse<CampaignRow>> {
    const raw = await this.http.post("/campaigns", params);
    return campaignListSchema.parse(raw);
  }

  async createCampaign(data: Record<string, unknown>): Promise<{ id: number }> {
    const raw = await this.http.post("/campaigns/create", data);
    return campaignCreateResponseSchema.parse(raw);
  }

  async getCampaign(id: number): Promise<Record<string, unknown>> {
    const raw = await this.http.get(`/campaigns/${id}`);
    return raw as Record<string, unknown>;
  }

  async updateCampaign(id: number, data: Record<string, unknown>): Promise<unknown> {
    return this.http.put(`/campaigns/${id}/update`, data);
  }

  async setCampaignStatus(
    ids: number[],
    action: "activate" | "pause" | "archive",
  ): Promise<unknown> {
    return this.http.post(`/campaigns/${action}`, { campaignIds: ids });
  }

  async updateCampaignBid(id: number, bids: unknown[]): Promise<unknown> {
    return this.http.put(`/campaigns/${id}/bid`, { bids });
  }

  async bulkUpdateCampaignBids(campaignIds: number[], bids: unknown[]): Promise<unknown> {
    return this.http.put("/campaigns/bids", { campaignIds, bids });
  }

  async updateSiteBids(campaignIds: number[], bids: unknown[]): Promise<unknown> {
    return this.http.put("/stats/sites/bids", { campaignIds, bids });
  }

  async listCampaignFolders(params: Record<string, unknown>): Promise<ListResponse<FolderRow>> {
    const raw = await this.http.post("/campaigns/folders", params);
    return folderListSchema.parse(raw);
  }

  async createCampaignFolder(name: string): Promise<{ id: number }> {
    const raw = await this.http.post("/campaigns/folders/create", { name });
    return folderCreateResponseSchema.parse(raw);
  }

  async updateCampaignFolder(id: number, data: Record<string, unknown>): Promise<unknown> {
    return this.http.put(`/campaigns/folders/${id}/settings`, data);
  }

  async listAudiences(params: Record<string, unknown>): Promise<ListResponse<AudienceRow>> {
    const raw = await this.http.post("/audiences", params);
    return audienceListSchema.parse(raw);
  }

  async getAudience(id: number): Promise<AudienceDetail> {
    const raw = await this.http.get(`/audiences/${id}`);
    return audienceDetailSchema.parse(raw);
  }

  async createAudience(data: Record<string, unknown>): Promise<AudienceDetail> {
    const raw = await this.http.post("/audiences/create", data);
    return audienceDetailSchema.parse(raw);
  }

  async updateAudience(id: number, data: Record<string, unknown>): Promise<unknown> {
    return this.http.put(`/audiences/${id}`, data);
  }

  async deleteAudience(id: number): Promise<unknown> {
    return this.http.delete(`/audiences/${id}`);
  }

  async listCreatives(params: Record<string, unknown>): Promise<ListResponse<CreativeRow>> {
    const raw = await this.http.post("/materials", params);
    return creativeListSchema.parse(raw);
  }

  async createCreative(campaignId: number, formData: FormData): Promise<{ id: number }> {
    const raw = await this.http.postFormData(`/campaigns/${campaignId}/materials`, formData);
    return creativeCreateResponseSchema.parse(raw);
  }

  async getMaterial(id: number): Promise<Record<string, unknown>> {
    const raw = await this.http.get(`/materials/${id}`);
    return raw as Record<string, unknown>;
  }

  async updateCreative(campaignId: number, data: Record<string, unknown>): Promise<unknown> {
    return this.http.put(`/campaigns/${campaignId}/materials`, data);
  }

  async setCreativeStatus(
    ids: number[],
    action: "activate" | "pause" | "archive",
  ): Promise<unknown> {
    return this.http.post(`/materials/${action}`, { adsIds: ids });
  }

  async listFinanceOperations(params: Record<string, unknown>): Promise<ListResponse<FinanceRow>> {
    const raw = await this.http.post("/finances/operations", params);
    return financeListSchema.parse(raw);
  }

  async getReportConfig(): Promise<ReportConfig> {
    if (this.reportConfigCache && this.reportConfigCache.expiresAt > Date.now()) {
      return this.reportConfigCache.data;
    }
    const raw = await this.http.options("/custom-reports");
    const data = reportConfigSchema.parse(raw);
    this.reportConfigCache = { data, expiresAt: Date.now() + this.reportConfigTtlMs };
    return data;
  }

  async getReportData(params: ReportDataParams): Promise<ReportDataResponse> {
    const raw = await this.http.post("/custom-reports/data", params);
    return reportDataResponseSchema.parse(raw);
  }

  async getSiteStats(
    params: Record<string, unknown>,
  ): Promise<ListResponse<Record<string, unknown>>> {
    const raw = await this.http.post("/stats/sites", params);
    return listResponseSchema(z.record(z.unknown())).parse(raw);
  }

  async getConversionDetails(
    params: Record<string, unknown>,
  ): Promise<ListResponse<Record<string, unknown>>> {
    const raw = await this.http.post("/stats/conversions", params);
    return listResponseSchema(z.record(z.unknown())).parse(raw);
  }

  // --- Autorules ---
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

  // --- Extended statistics / Bid Optimization ---
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
}
