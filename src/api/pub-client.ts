import { HttpClient } from "./http-client.js";
import { getConfig, requirePubKey } from "../config.js";
import type { Source, AdUnit, PubUser } from "../types/publisher.js";
import type { ApiListResponse, ReportConfig, ReportDataResponse } from "../types/common.js";

export interface PubReportDataParams {
  groupBy?: string;
  metrics?: string;
  period?: string;
  page?: number;
  perPage?: number;
  dateFrom?: string;
  dateTo?: string;
  siteIds?: string;
  sortBy?: string;
  sortOrder?: string;
  [key: string]: unknown;
}

let _client: HttpClient | null = null;

function getClient(): HttpClient {
  if (!_client) {
    const config = getConfig();
    _client = new HttpClient({
      baseUrl: config.KADAM_PUB_API_BASE,
      apiKey: requirePubKey(),
    });
  }
  return _client;
}

export function resetClient(): void {
  _client = null;
}

export async function listSources(params: Record<string, unknown>): Promise<ApiListResponse> {
  return getClient().post<ApiListResponse>("/sources/sources-table", params);
}

export async function createSource(data: { name: string; url: string }): Promise<Source> {
  return getClient().put<Source>("/sources", data);
}

export async function getSource(id: number): Promise<Source> {
  return getClient().get<Source>(`/sources/${id}`);
}

export async function updateSource(
  id: number,
  data: Record<string, unknown>,
): Promise<Source> {
  return getClient().put<Source>(`/sources/${id}`, data);
}

export async function setSourceStatus(
  id: number,
  action: "activate" | "deactivate" | "archive" | "un-archive",
): Promise<unknown> {
  if (action === "archive") {
    return getClient().post(`/sources/archive/${id}`);
  }
  if (action === "un-archive") {
    return getClient().post(`/sources/un-archive/${id}`);
  }
  return getClient().post(`/sources/${id}/${action}`);
}

export async function listAdUnits(
  sourceId: number,
  params: Record<string, unknown>,
): Promise<ApiListResponse> {
  return getClient().post<ApiListResponse>(`/places/places-table/${sourceId}`, params);
}

export async function setAdUnitStatus(
  id: number,
  action: "activate" | "deactivate" | "delete" | "restore",
): Promise<unknown> {
  if (action === "delete") {
    return getClient().delete(`/places/${id}`);
  }
  if (action === "restore") {
    return getClient().post(`/places/${id}/restore`);
  }
  return getClient().post(`/places/${id}/${action}`);
}

export async function getUserInfo(): Promise<PubUser> {
  return getClient().post<PubUser>("/users/check-upd");
}

export async function getReportConfig(): Promise<ReportConfig> {
  return getClient().options<ReportConfig>("/custom-reports");
}

export async function getReportData(
  params: PubReportDataParams,
): Promise<ReportDataResponse> {
  return getClient().post<ReportDataResponse>("/custom-reports/data", params);
}
