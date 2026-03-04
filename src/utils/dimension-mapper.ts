import type { ReportDimension } from "../types/common.js";

export function findDimensionId(
  dims: ReportDimension[],
  name: string,
): string | undefined {
  const lower = name.toLowerCase().trim();
  const normalized = lower.replace(/\s+/g, "");

  // Exact match by id
  const byId = dims.find((d) => d.id === name);
  if (byId) return byId.id;

  // Exact match by normalized name
  const exact = dims.find(
    (d) => d.name.toLowerCase().replace(/\s+/g, "") === normalized,
  );
  if (exact) return exact.id;

  // Partial match as fallback
  const partial = dims.find((d) =>
    d.name.toLowerCase().includes(lower),
  );
  return partial?.id;
}

export function mapToDimensionIds(
  names: string | undefined,
  list: ReportDimension[],
): string[] {
  if (!names || names.trim() === "") return [];
  return names
    .split(",")
    .map((s) => findDimensionId(list, s.trim()))
    .filter((id): id is string => id != null);
}
