export interface ApiListResponse {
  data: unknown[];
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
  };
  pagination?: {
    page?: number;
    pages?: number;
    perPage?: number;
    total?: number;
  };
}

export interface ReportConfig {
  groups: ReportDimension[];
  metrics: ReportDimension[];
}

export interface ReportDimension {
  id: string;
  name: string;
  category: string;
}

export interface ReportDataResponse {
  data: Record<string, unknown>[];
  totals: Record<string, unknown>;
  meta: {
    page: number;
    pages: number;
    total: number;
    perPage: number;
  };
}
