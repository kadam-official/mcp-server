import type { HttpClient } from "./http-client.js";
import { listResponseSchema, reportConfigSchema, reportDataResponseSchema } from "./schemas/common.js";
import type { ListResponse, ReportConfig, ReportDataResponse } from "./schemas/common.js";
import { sourceSchema, adUnitSchema, pubUserSchema } from "./schemas/publisher.js";
import type { Source, AdUnit, PubUser } from "./schemas/publisher.js";
import { z } from "zod";

const sourceListSchema = listResponseSchema(sourceSchema);
const adUnitListSchema = listResponseSchema(adUnitSchema);

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

export class PubClient {
  constructor(private readonly http: HttpClient) {}

  async listSources(params: Record<string, unknown>): Promise<ListResponse<Source>> {
    const raw = await this.http.post("/sources/sources-table", params);
    return sourceListSchema.parse(raw);
  }

  async createSource(data: { name: string; url: string }): Promise<Source> {
    const raw = await this.http.put("/sources", data);
    return sourceSchema.parse(raw);
  }

  async getSource(id: number): Promise<Source> {
    const raw = await this.http.get(`/sources/${id}`);
    return sourceSchema.parse(raw);
  }

  async updateSource(id: number, data: Record<string, unknown>): Promise<unknown> {
    return this.http.put(`/sources/${id}`, data);
  }

  async setSourceStatus(
    id: number,
    action: "activate" | "deactivate" | "archive" | "un-archive",
  ): Promise<unknown> {
    if (action === "archive") {
      return this.http.post(`/sources/archive/${id}`);
    }
    if (action === "un-archive") {
      return this.http.post(`/sources/un-archive/${id}`);
    }
    return this.http.post(`/sources/${id}/${action}`);
  }

  async listAdUnits(sourceId: number, params: Record<string, unknown>): Promise<ListResponse<AdUnit>> {
    const raw = await this.http.post(`/places/places-table/${sourceId}`, params);
    return adUnitListSchema.parse(raw);
  }

  async setAdUnitStatus(
    id: number,
    action: "activate" | "deactivate" | "delete" | "restore",
  ): Promise<unknown> {
    if (action === "delete") {
      return this.http.delete(`/places/${id}`);
    }
    if (action === "restore") {
      return this.http.post(`/places/${id}/restore`);
    }
    return this.http.post(`/places/${id}/${action}`);
  }

  async getUserInfo(): Promise<PubUser> {
    const raw = await this.http.post("/users/check-upd");
    return pubUserSchema.parse(raw);
  }

  async getReportConfig(): Promise<ReportConfig> {
    const raw = await this.http.options("/custom-reports");
    return reportConfigSchema.parse(raw);
  }

  async getReportData(params: PubReportDataParams): Promise<ReportDataResponse> {
    const raw = await this.http.post("/custom-reports/data", params);
    return reportDataResponseSchema.parse(raw);
  }
}
