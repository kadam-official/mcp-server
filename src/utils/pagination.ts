import type { ApiListResponse } from "../types/common.js";

export function extractPagination(res: ApiListResponse): {
  page: number;
  totalPages: number;
  totalRows: number;
} {
  const totalRows = res.totalRows ?? res.rows.length;
  const page = res.page ?? 1;
  const perPage = res.perPage ?? 25;
  const totalPages = perPage > 0 ? Math.ceil(totalRows / perPage) : 1;
  return { page, totalPages, totalRows };
}
