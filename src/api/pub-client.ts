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
  mediationConnectionListSchema,
  mediationConnectionSchema,
  mediationOptionsSchema,
  mediationAccountListSchema,
  mediationAccountSchema,
  mediationNetworkListSchema,
  mediationPlacementListSchema,
  mediationPlacementTagSchema,
} from "./schemas/publisher-mediation.js";
import type {
  MediationConnection,
  MediationOptions,
  MediationNetwork,
  MediationAccount,
  MediationPlacement,
} from "./schemas/publisher-mediation.js";
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
const MEDIATION = "/mediation";

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
  // Kadam Smart Mediation
  // -------------------------------------------------------------------------

  async listMediationNetworks(): Promise<MediationNetwork[]> {
    const raw = await this.http.get(`${MEDIATION}/networks`);
    return mediationNetworkListSchema.parse(raw).networks;
  }

  /** Networks an ad unit's format is actually served by, plus the geo dictionary. */
  async getMediationOptions(adUnitId: number): Promise<MediationOptions> {
    const raw = await this.http.get(`${MEDIATION}/options`, { blockId: String(adUnitId) });
    return mediationOptionsSchema.parse(raw);
  }

  async listMediationAccounts(networkId?: number): Promise<MediationAccount[]> {
    const raw = await this.http.get(
      `${MEDIATION}/accounts`,
      networkId != null ? { networkId: String(networkId) } : undefined,
    );
    return mediationAccountListSchema.parse(raw);
  }

  async createMediationAccount(data: Record<string, unknown>): Promise<MediationAccount> {
    const raw = await this.http.post(`${MEDIATION}/accounts`, data);
    return mediationAccountSchema.parse(raw);
  }

  async updateMediationAccount(
    id: number,
    data: Record<string, unknown>,
  ): Promise<MediationAccount> {
    const raw = await this.http.put(`${MEDIATION}/accounts/${id}`, data);
    return mediationAccountSchema.parse(raw);
  }

  async deleteMediationAccount(id: number): Promise<unknown> {
    return this.http.delete(`${MEDIATION}/accounts/${id}`);
  }

  /** `fresh` skips the catalog cache: the publisher just created the zone at the network. */
  async listMediationPlacements(
    accountId: number,
    adUnitId?: number,
    fresh?: boolean,
  ): Promise<MediationPlacement[]> {
    const params: Record<string, string> = {};
    if (adUnitId != null) params.blockId = String(adUnitId);
    if (fresh) params.fresh = "1";

    const raw = await this.http.get(`${MEDIATION}/accounts/${accountId}/placements`, params);
    return mediationPlacementListSchema.parse(raw).items;
  }

  /** Code of one zone, for networks whose catalog lists zones without one (HilltopAds). */
  async getMediationPlacementTag(accountId: number, zone: string): Promise<string | null> {
    const raw = await this.http.get(
      `${MEDIATION}/accounts/${accountId}/placements/${encodeURIComponent(zone)}/tag`,
    );
    return mediationPlacementTagSchema.parse(raw).tag ?? null;
  }

  async listMediationConnections(adUnitId: number): Promise<MediationConnection[]> {
    const raw = await this.http.get(`${MEDIATION}/connections`, { blockId: String(adUnitId) });
    return mediationConnectionListSchema.parse(raw).items;
  }

  async createMediationConnection(data: Record<string, unknown>): Promise<MediationConnection> {
    const raw = await this.http.post(`${MEDIATION}/connections`, data);
    return mediationConnectionSchema.parse(raw);
  }

  async updateMediationConnection(
    id: number,
    data: Record<string, unknown>,
  ): Promise<MediationConnection> {
    const raw = await this.http.put(`${MEDIATION}/connections/${id}`, data);
    return mediationConnectionSchema.parse(raw);
  }

  async deleteMediationConnection(id: number): Promise<unknown> {
    return this.http.delete(`${MEDIATION}/connections/${id}`);
  }

  /** Each retest opens a new measurement epoch, so a repeat after a lost response is not a no-op. */
  async retestMediationConnection(id: number, share: number): Promise<MediationConnection> {
    const raw = await this.http.post(
      `${MEDIATION}/connections/${id}/retest`,
      { share },
      { retry: false },
    );
    return mediationConnectionSchema.parse(raw);
  }
}
