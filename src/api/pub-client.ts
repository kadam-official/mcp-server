import type { HttpClient } from "./http-client.js";
import { reportConfigSchema, reportDataResponseSchema } from "./schemas/common.js";
import type { ReportConfig, ReportDataResponse } from "./schemas/common.js";
import {
  sourceDetailSchema,
  sourceTableRowSchema,
  adUnitTableRowSchema,
  pubUserSchema,
  parseNumericString,
} from "./schemas/publisher.js";
import type { SourceDetail, SourceRow, AdUnitRow, PubUser } from "./schemas/publisher.js";
import {
  externalConnectionListSchema,
  externalConnectionSchema,
  externalMonetizationAdUnitPageSchema,
  externalMonetizationOptionsSchema,
  externalMonetizationSummarySchema,
  externalNetworkAccountListSchema,
  externalNetworkAccountSchema,
  externalNetworkListSchema,
  externalPlacementListSchema,
} from "./schemas/publisher-external-monetization.js";
import type {
  ExternalConnection,
  ExternalMonetizationAdUnitPage,
  ExternalMonetizationOptions,
  ExternalMonetizationSummary,
  ExternalNetwork,
  ExternalNetworkAccount,
  ExternalPlacement,
} from "./schemas/publisher-external-monetization.js";
import { z } from "zod";

// Raw table response shape returned by DataTable endpoints
const tableResponseSchema = z.object({
  rows: z.array(z.unknown()).default([]),
  totalRows: z.number().default(0),
  columns: z.array(z.unknown()).optional(),
});

export interface TableListResponse<T> {
  rows: T[];
  totalRows: number;
}

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

/** Report config (groups/metrics) rarely changes; cache per client instance (== per tenant). */
const DEFAULT_REPORT_CONFIG_TTL_MS = 10 * 60 * 1000;

/** Public name of the mediation contour; /mediation/* is the cabinet's own alias. */
const EXT_MON = "/external-monetization";

export class PubClient {
  private reportConfigCache: { data: ReportConfig; expiresAt: number } | null = null;
  private readonly reportConfigTtlMs: number;

  constructor(
    private readonly http: HttpClient,
    optionsTtlMs?: number,
  ) {
    this.reportConfigTtlMs =
      optionsTtlMs && optionsTtlMs > 0 ? optionsTtlMs : DEFAULT_REPORT_CONFIG_TTL_MS;
  }

  async listSources(params: Record<string, unknown>): Promise<TableListResponse<SourceRow>> {
    const raw = await this.http.post("/sources/sources-table", params);
    const table = tableResponseSchema.parse(raw);

    const rows: SourceRow[] = [];
    for (const rawRow of table.rows) {
      const parsed = sourceTableRowSchema.safeParse(rawRow);
      if (!parsed.success) continue;

      const row = parsed.data;
      if (row.source === "fullResult") continue;

      rows.push({
        id: row.source.id,
        name: row.source.name,
        domain: row.domain ?? null,
        stage: row.source.stage,
        archive: row.source.archive ?? 0,
        views: parseNumericString(row.views),
        clicks: parseNumericString(row.clicks),
        income: row.income,
        blockCounts: row.blockCounts ?? null,
      });
    }

    return { rows, totalRows: table.totalRows };
  }

  async createSource(data: { name: string; url: string }): Promise<SourceDetail> {
    const raw = await this.http.put("/sources", data);
    return sourceDetailSchema.parse(raw);
  }

  async getSource(id: number): Promise<SourceDetail> {
    const raw = await this.http.get(`/sources/${id}`);
    return sourceDetailSchema.parse(raw);
  }

  async updateSource(id: number, data: Record<string, unknown>): Promise<SourceDetail> {
    const raw = await this.http.put(`/sources/${id}`, data);
    return sourceDetailSchema.parse(raw);
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

  async listAdUnits(
    sourceId: number,
    params: Record<string, unknown>,
  ): Promise<TableListResponse<AdUnitRow>> {
    const raw = await this.http.post(`/places/places-table/${sourceId}`, params);
    const table = tableResponseSchema.parse(raw);

    const rows: AdUnitRow[] = [];
    for (const rawRow of table.rows) {
      const parsed = adUnitTableRowSchema.safeParse(rawRow);
      if (!parsed.success) continue;

      const row = parsed.data;
      if (row.block === "fullResult") continue;

      rows.push({
        id: row.block.id,
        name: row.block.name,
        type: row.type ?? "unknown",
        state: row.block.state,
        archive: row.block.archive ?? 0,
        views: parseNumericString(row.views),
        clicks: parseNumericString(row.clicks),
        income: row.income,
        queries: parseNumericString(row.queries),
      });
    }

    return { rows, totalRows: table.totalRows };
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
    if (this.reportConfigCache && this.reportConfigCache.expiresAt > Date.now()) {
      return this.reportConfigCache.data;
    }
    const raw = await this.http.options("/custom-reports");
    const data = reportConfigSchema.parse(raw);
    this.reportConfigCache = { data, expiresAt: Date.now() + this.reportConfigTtlMs };
    return data;
  }

  async getReportData(params: PubReportDataParams): Promise<ReportDataResponse> {
    const raw = await this.http.post("/custom-reports/data", params);
    return reportDataResponseSchema.parse(raw);
  }

  // -------------------------------------------------------------------------
  // External monetization (a.k.a. mediation)
  // -------------------------------------------------------------------------

  async getExternalMonetizationSummary(): Promise<ExternalMonetizationSummary> {
    const raw = await this.http.get(`${EXT_MON}/summary`);
    return externalMonetizationSummarySchema.parse(raw);
  }

  async listExternalMonetizationAdUnits(
    params: Record<string, unknown>,
  ): Promise<ExternalMonetizationAdUnitPage> {
    const raw = await this.http.post(`${EXT_MON}/blocks`, params);
    return externalMonetizationAdUnitPageSchema.parse(raw);
  }

  async listExternalNetworks(): Promise<ExternalNetwork[]> {
    const raw = await this.http.get(`${EXT_MON}/networks`);
    return externalNetworkListSchema.parse(raw).networks;
  }

  /** Networks an ad unit's format is actually served by, plus the geo dictionary. */
  async getExternalMonetizationOptions(adUnitId: number): Promise<ExternalMonetizationOptions> {
    const raw = await this.http.get(`${EXT_MON}/options`, { blockId: String(adUnitId) });
    return externalMonetizationOptionsSchema.parse(raw);
  }

  async listExternalNetworkAccounts(networkId?: number): Promise<ExternalNetworkAccount[]> {
    const raw = await this.http.get(
      `${EXT_MON}/accounts`,
      networkId != null ? { networkId: String(networkId) } : undefined,
    );
    return externalNetworkAccountListSchema.parse(raw);
  }

  async createExternalNetworkAccount(
    data: Record<string, unknown>,
  ): Promise<ExternalNetworkAccount> {
    const raw = await this.http.post(`${EXT_MON}/accounts`, data);
    return externalNetworkAccountSchema.parse(raw);
  }

  async updateExternalNetworkAccount(
    id: number,
    data: Record<string, unknown>,
  ): Promise<ExternalNetworkAccount> {
    const raw = await this.http.put(`${EXT_MON}/accounts/${id}`, data);
    return externalNetworkAccountSchema.parse(raw);
  }

  async deleteExternalNetworkAccount(id: number): Promise<unknown> {
    return this.http.delete(`${EXT_MON}/accounts/${id}`);
  }

  /** `fresh` skips the catalog cache: the publisher just created the zone at the network. */
  async listExternalPlacements(
    accountId: number,
    adUnitId?: number,
    fresh?: boolean,
  ): Promise<ExternalPlacement[]> {
    const params: Record<string, string> = {};
    if (adUnitId != null) params.blockId = String(adUnitId);
    if (fresh) params.fresh = "1";

    const raw = await this.http.get(`${EXT_MON}/accounts/${accountId}/placements`, params);
    return externalPlacementListSchema.parse(raw).items;
  }

  async listExternalConnections(adUnitId: number): Promise<ExternalConnection[]> {
    const raw = await this.http.get(`${EXT_MON}/connections`, { blockId: String(adUnitId) });
    return externalConnectionListSchema.parse(raw).items;
  }

  async createExternalConnection(data: Record<string, unknown>): Promise<ExternalConnection> {
    const raw = await this.http.post(`${EXT_MON}/connections`, data);
    return externalConnectionSchema.parse(raw);
  }

  async updateExternalConnection(
    id: number,
    data: Record<string, unknown>,
  ): Promise<ExternalConnection> {
    const raw = await this.http.put(`${EXT_MON}/connections/${id}`, data);
    return externalConnectionSchema.parse(raw);
  }

  async deleteExternalConnection(id: number): Promise<unknown> {
    return this.http.delete(`${EXT_MON}/connections/${id}`);
  }

  async retestExternalConnection(id: number, share: number): Promise<ExternalConnection> {
    const raw = await this.http.post(`${EXT_MON}/connections/${id}/retest`, { share });
    return externalConnectionSchema.parse(raw);
  }
}
