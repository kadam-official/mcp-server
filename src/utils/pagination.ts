import type { ApiListResponse } from "../types/common.js";

export function extractPagination(res: ApiListResponse): {
  page: number;
  totalPages: number;
  totalRows: number;
} {
  const meta = res.meta ?? res.pagination;
  if (!meta) {
    return { page: 1, totalPages: 1, totalRows: (res.data ?? []).length };
  }
  const page =
    (meta as { current_page?: number; page?: number }).current_page ??
    (meta as { page?: number }).page ??
    1;
  const totalPages =
    (meta as { last_page?: number; pages?: number }).last_page ??
    (meta as { pages?: number }).pages ??
    1;
  const totalRows =
    (meta as { total?: number }).total ?? (res.data ?? []).length;
  return { page, totalPages, totalRows };
}
