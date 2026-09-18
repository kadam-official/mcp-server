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
  audienceParamsSchema,
  financeRowSchema,
  accountProfileSchema,
  accountBalanceSchema,
  campaignBulkActionSchema,
  campaignCopyResultSchema,
  campaignBlockedSspsSchema,
  campaignForecastResultSchema,
  campaignUrlReplaceResultSchema,
  materialBulkActionSchema,
  materialBulkEnqueuedSchema,
  materialBulkJobSchema,
  creativeTestConversionSchema,
  creativeCopyResultSchema,
  paymentSystemsSchema,
  dayMoneyLimitSchema,
  campaignCreateResponseSchema,
  creativeCreateResponseSchema,
  folderCreateResponseSchema,
  folderViewSchema,
  folderBulkActionResultSchema,
  autoruleSchema,
  autorulesResultSchema,
  autoruleWriteResponseSchema,
  extendedBidsResultSchema,
  extendedBidsUpdateResponseSchema,
  dictionaryResultSchema,
} from "./schemas/advertiser.js";
import type {
  CampaignBulkAction,
  CampaignCopyResult,
  CampaignBlockedSsps,
  CampaignForecastResult,
  CampaignUrlReplaceResult,
  MaterialBulkAction,
  MaterialBulkEnqueued,
  MaterialBulkJob,
  CreativeTestConversion,
  CreativeCopyResult,
  CampaignRow,
  FolderRow,
  FolderView,
  FolderBulkActionResult,
  CreativeRow,
  AudienceRow,
  AudienceDetail,
  AudienceParams,
  FinanceRow,
  AccountProfile,
  AccountBalance,
  PaymentSystems,
  DayMoneyLimit,
  Autorule,
  ExtendedBid,
  DictionaryResult,
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

  async validateCampaign(data: Record<string, unknown>): Promise<unknown> {
    return this.http.post("/campaigns/validate", data);
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
    action: "activate" | "pause" | "archive" | "restore",
  ): Promise<CampaignBulkAction> {
    const raw = await this.http.post(`/campaigns/${action}`, { campaignIds: ids });
    return campaignBulkActionSchema.parse(raw);
  }

  async deleteCampaigns(ids: number[]): Promise<CampaignBulkAction> {
    const raw = await this.http.delete("/campaigns", { campaignIds: ids });
    return campaignBulkActionSchema.parse(raw);
  }

  async copyCampaign(id: number, data: Record<string, unknown>): Promise<CampaignCopyResult> {
    const raw = await this.http.post(`/campaigns/${id}/copy`, data);
    return campaignCopyResultSchema.parse(raw);
  }

  async setCampaignRss(
    campaignId: number,
    payload: { link: string; notRemove: boolean; isPauseAfterModer: boolean },
  ): Promise<unknown> {
    return this.http.put(`/campaigns/${campaignId}/rss`, payload);
  }

  async setCampaignEasyStart(campaignId: number, enabled: boolean): Promise<unknown> {
    return this.http.put(`/campaigns/${campaignId}/easy-start`, { enabled });
  }

  async getCampaignBlockedSsps(campaignId: number): Promise<CampaignBlockedSsps> {
    const raw = await this.http.get(`/campaigns/${campaignId}/blocked-ssps`);
    return campaignBlockedSspsSchema.parse(raw);
  }

  /**
   * Тот же конверт, что у кампанийной разбивки: сервис считает её по креативу, а кампания
   * подставляет свой клик-андер.
   */
  async getCreativeBlockedSsps(creativeId: number): Promise<CampaignBlockedSsps> {
    const raw = await this.http.get(`/materials/${creativeId}/blocked-ssps`);
    return campaignBlockedSspsSchema.parse(raw);
  }

  async getCreativeTestConversion(creativeId: number): Promise<CreativeTestConversion> {
    const raw = await this.http.get(`/materials/${creativeId}/test-conversion`);
    return creativeTestConversionSchema.parse(raw);
  }

  async getCampaignForecast(payload: Record<string, unknown>): Promise<CampaignForecastResult> {
    const raw = await this.http.post("/campaigns/forecast", payload);
    return campaignForecastResultSchema.parse(raw);
  }

  async bulkReplaceCampaignUrls(
    payload: Record<string, unknown>,
  ): Promise<CampaignUrlReplaceResult> {
    const raw = await this.http.post("/campaigns/bulk-url-replace", payload);
    return campaignUrlReplaceResultSchema.parse(raw);
  }

  async moveCampaigns(ids: number[], folderId: number): Promise<CampaignBulkAction> {
    const raw = await this.http.post("/campaigns/move", { campaignIds: ids, folderId });
    return campaignBulkActionSchema.parse(raw);
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

  async getCampaignFolder(id: number): Promise<FolderView> {
    const raw = await this.http.get(`/campaigns/folders/${id}`);
    return folderViewSchema.parse(raw);
  }

  async updateCampaignFolder(id: number, data: Record<string, unknown>): Promise<FolderView> {
    const raw = await this.http.patch(`/campaigns/folders/${id}`, data);
    return folderViewSchema.parse(raw);
  }

  async setCampaignFolderStatus(
    ids: number[],
    action: "activate" | "pause" | "archive" | "restore",
  ): Promise<FolderBulkActionResult> {
    const raw = await this.http.post(`/campaigns/folders/${action}`, { folderIds: ids });
    return folderBulkActionResultSchema.parse(raw);
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

  async getFilteredAudienceSources(
    searchQuery?: string,
  ): Promise<Array<{ id: number; name: string }>> {
    const raw = (await this.http.get("/audiences/filtered-sources", {
      ...(searchQuery ? { searchQuery } : {}),
    })) as { items?: Array<{ id: number; name: string }> };

    return raw.items ?? [];
  }

  async validateAudience(data: Record<string, unknown>): Promise<unknown> {
    return this.http.post("/audiences/validate", data);
  }

  async getAudienceParams(id: number): Promise<AudienceParams> {
    const raw = await this.http.get(`/audiences/${id}/params`);
    return audienceParamsSchema.parse(raw);
  }

  async setAudienceParams(id: number, params: Record<string, unknown>): Promise<AudienceParams> {
    const raw = await this.http.put(`/audiences/${id}/params`, params);
    return audienceParamsSchema.parse(raw);
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
    action: "activate" | "pause" | "archive" | "restore",
  ): Promise<MaterialBulkAction> {
    const raw = await this.http.post(`/materials/${action}`, { adsIds: ids });
    return materialBulkActionSchema.parse(raw);
  }

  async copyCreatives(
    ids: number[],
    targets: Array<{ campaignId: number; url: string }>,
    pauseAfterModeration: boolean,
  ): Promise<CreativeCopyResult> {
    const raw = await this.http.post("/materials/copy", {
      adsIds: ids,
      targets,
      isPauseAfterModer: pauseAfterModeration,
    });
    return creativeCopyResultSchema.parse(raw);
  }

  async moveCreatives(ids: number[], campaignId: number, url: string): Promise<MaterialBulkAction> {
    const raw = await this.http.post("/materials/move", { adsIds: ids, campaignId, url });
    return materialBulkActionSchema.parse(raw);
  }

  /**
   * Список ставок заменяет собственные ставки материала целиком: страна, которой в нём
   * нет, откатывается к ставке кампании.
   */
  async setCreativeBids(
    ids: number[],
    bids: Array<{ bid: number; countries: number[] }>,
  ): Promise<MaterialBulkAction> {
    const raw = await this.http.put("/materials/bids", { adsIds: ids, bids });
    return materialBulkActionSchema.parse(raw);
  }

  async uploadBulkImages(
    campaignIds: number[],
    files: Array<{ blob: Blob; filename: string }>,
    idempotencyKey?: string,
  ): Promise<MaterialBulkEnqueued> {
    const fd = new FormData();
    for (const id of campaignIds) fd.append("campaignIds[]", String(id));
    for (const file of files) fd.append("files[]", file.blob, file.filename);
    if (idempotencyKey) fd.set("idempotencyKey", idempotencyKey);

    const raw = await this.http.postFormData("/materials/bulk/upload", fd);
    return materialBulkEnqueuedSchema.parse(raw);
  }

  async createBulkCreatives(payload: Record<string, unknown>): Promise<MaterialBulkEnqueued> {
    const raw = await this.http.post("/materials/bulk", payload);
    return materialBulkEnqueuedSchema.parse(raw);
  }

  async getBulkJob(jobId: string): Promise<MaterialBulkJob> {
    const raw = await this.http.get(`/materials/bulk/${jobId}`);
    return materialBulkJobSchema.parse(raw);
  }

  async deleteCreatives(ids: number[]): Promise<MaterialBulkAction> {
    const raw = await this.http.delete("/materials", { adsIds: ids });
    return materialBulkActionSchema.parse(raw);
  }

  async listFinanceOperations(params: Record<string, unknown>): Promise<ListResponse<FinanceRow>> {
    const raw = await this.http.post("/finances/operations", params);
    return financeListSchema.parse(raw);
  }

  async getAccountProfile(): Promise<AccountProfile> {
    const raw = await this.http.get("/me");
    return accountProfileSchema.parse(raw);
  }

  async getAccountBalance(): Promise<AccountBalance> {
    const raw = await this.http.get("/finances/balance");
    return accountBalanceSchema.parse(raw);
  }

  async listPaymentSystems(): Promise<PaymentSystems> {
    const raw = await this.http.get("/finances/payment-systems");
    return paymentSystemsSchema.parse(raw);
  }

  async getDayMoneyLimit(): Promise<DayMoneyLimit> {
    const raw = await this.http.get("/finances/day-money-limit");
    return dayMoneyLimitSchema.parse(raw);
  }

  async setDayMoneyLimit(limit: number): Promise<DayMoneyLimit> {
    const raw = await this.http.put("/finances/day-money-limit", { limit });
    return dayMoneyLimitSchema.parse(raw);
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

  // --- Dictionaries ---
  async getDictionary(type: string, params?: Record<string, string>): Promise<DictionaryResult> {
    const raw = await this.http.get(`/dictionaries/${type}`, params);
    return dictionaryResultSchema.parse(raw);
  }
}
