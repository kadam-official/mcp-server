export interface ApiListResponse {
  rows: unknown[];
  totalRows?: number;
  page?: number;
  perPage?: number;
  total?: Record<string, unknown>;
  columns?: unknown[];
  isHasNextPage?: boolean;
}

export interface ReportConfigGroup {
  id: string;
  icon?: string;
  sources?: number[];
  filterType?: string;
  filterSync?: boolean;
}

export interface ReportConfigMetric {
  id: string;
  unit?: string | null;
  sources?: number[];
}

export interface ReportConfig {
  groups: Record<string, ReportConfigGroup[]>;
  metrics: Record<string, ReportConfigMetric[]>;
}

export interface ReportDimension {
  id: string;
  name: string;
  category: string;
}

export interface ReportDataResponse {
  rows: Record<string, unknown>[];
  totalRows: number;
  total?: Record<string, unknown>;
  page?: number;
  perPage?: number;
  columns?: unknown[];
}
