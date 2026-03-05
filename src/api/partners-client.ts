import { HttpClient } from "./http-client.js";
import { getConfig, requireAdvKey } from "../config.js";
import type {
  Audience,
  CampaignFolder,
  Creative,
} from "../types/advertiser.js";
import type { ApiListResponse, ReportConfig, ReportDataResponse } from "../types/common.js";


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

let _client: HttpClient | null = null;

function getClient(): HttpClient {
  if (!_client) {
    const config = getConfig();
    _client = new HttpClient({
      baseUrl: config.KADAM_ADV_API_BASE,
      apiKey: requireAdvKey(),
    });
  }
  return _client;
}

export function resetClient(): void {
  _client = null;
}

export async function listCampaigns(params: Record<string, unknown>): Promise<ApiListResponse> {
  return getClient().post<ApiListResponse>("/campaigns", params);
}

export async function createCampaign(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return getClient().post<Record<string, unknown>>("/campaigns/create", data);
}

export async function updateCampaign(
  id: number,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return getClient().put<Record<string, unknown>>(`/campaigns/${id}/update`, data);
}

export async function setCampaignStatus(
  ids: number[],
  action: "activate" | "pause" | "archive",
): Promise<unknown> {
  return getClient().post(`/campaigns/${action}`, { campaignIds: ids });
}

export async function listCampaignFolders(
  params: Record<string, unknown>,
): Promise<ApiListResponse> {
  return getClient().post<ApiListResponse>("/campaigns/folders", params);
}

export async function createCampaignFolder(name: string): Promise<CampaignFolder> {
  return getClient().post<CampaignFolder>("/campaigns/folders/create", { name });
}

export async function updateCampaignFolder(
  id: number,
  data: Record<string, unknown>,
): Promise<CampaignFolder> {
  return getClient().put<CampaignFolder>(`/campaigns/folders/${id}/settings`, data);
}

export async function listAudiences(params: Record<string, unknown>): Promise<ApiListResponse> {
  return getClient().post<ApiListResponse>("/audiences", params);
}

export async function getAudience(id: number): Promise<Audience> {
  return getClient().get<Audience>(`/audiences/${id}`);
}

export async function createAudience(data: Record<string, unknown>): Promise<Audience> {
  return getClient().post<Audience>("/audiences/create", data);
}

export async function updateAudience(
  id: number,
  data: Record<string, unknown>,
): Promise<Audience> {
  return getClient().put<Audience>(`/audiences/${id}`, data);
}

export async function deleteAudience(id: number): Promise<unknown> {
  return getClient().delete(`/audiences/${id}`);
}

export async function listCreatives(params: Record<string, unknown>): Promise<ApiListResponse> {
  return getClient().post<ApiListResponse>("/materials", params);
}

export async function createCreative(
  campaignId: number,
  formData: FormData,
): Promise<Creative> {
  return getClient().postFormData<Creative>(`/campaigns/${campaignId}/materials`, formData);
}

export async function updateCreative(
  campaignId: number,
  data: Record<string, unknown>,
): Promise<Creative> {
  return getClient().put<Creative>(`/campaigns/${campaignId}/materials`, data);
}

export async function setCreativeStatus(
  ids: number[],
  action: "activate" | "pause" | "archive",
): Promise<unknown> {
  return getClient().post(`/materials/${action}`, { adsIds: ids });
}

export async function listFinanceOperations(
  params: Record<string, unknown>,
): Promise<ApiListResponse> {
  return getClient().post<ApiListResponse>("/finances/operations", params);
}

export async function getReportConfig(): Promise<ReportConfig> {
  return getClient().options<ReportConfig>("/custom-reports");
}

export async function getReportData(
  params: ReportDataParams,
): Promise<ReportDataResponse> {
  return getClient().post<ReportDataResponse>("/custom-reports/data", params);
}

export async function getReportFilters(
  params: Record<string, unknown>,
): Promise<unknown> {
  return getClient().post("/custom-reports/filter-data", params);
}

export async function getSiteStats(params: Record<string, unknown>): Promise<ApiListResponse> {
  return getClient().post<ApiListResponse>("/stats/sites", params);
}

export async function getPostbackStats(params: Record<string, unknown>): Promise<ApiListResponse> {
  return getClient().post<ApiListResponse>("/stats/postback", params);
}
