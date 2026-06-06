const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB hard limit

export interface PaginatedData {
  rows: string[];
  page: number;
  totalPages: number;
  totalRows: number;
  perPage: number;
}

export function formatPaginatedList(data: PaginatedData, header?: string): string {
  const lines: string[] = [];

  if (header) lines.push(header);
  if (header) lines.push("");

  for (const row of data.rows) {
    lines.push(row);
  }

  lines.push("");
  lines.push(
    `Showing ${data.rows.length} of ${data.totalRows} rows (page ${data.page}/${data.totalPages})`,
  );

  if (data.page < data.totalPages) {
    lines.push(`Use page=${data.page + 1} to see more.`);
  }

  return truncateOutput(lines.join("\n"));
}

export interface TableData {
  headers: string[];
  rows: string[][];
  totals?: string[];
}

export function formatTable(data: TableData, title?: string): string {
  const allRows = [data.headers, ...data.rows];
  if (data.totals) allRows.push(data.totals);

  const colWidths = data.headers.map((_, colIdx) =>
    Math.max(...allRows.map((row) => (row[colIdx] ?? "").length)),
  );

  const formatRow = (row: string[]) => row.map((cell, i) => cell.padEnd(colWidths[i]!)).join(" | ");

  const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");

  const lines: string[] = [];
  if (title) lines.push(title, "");

  lines.push(formatRow(data.headers));
  lines.push(separator);

  for (const row of data.rows) {
    lines.push(formatRow(row));
  }

  if (data.totals) {
    lines.push(separator);
    lines.push(formatRow(data.totals));
  }

  return truncateOutput(lines.join("\n"));
}

export function formatEntityList<T>(
  items: T[],
  formatter: (item: T, index: number) => string,
  header: string,
  pagination?: { page: number; totalPages: number; totalRows: number },
): string {
  const lines: string[] = [header, ""];

  for (let i = 0; i < items.length; i++) {
    lines.push(formatter(items[i]!, i));
  }

  if (pagination) {
    lines.push("");
    lines.push(
      `Showing ${items.length} of ${pagination.totalRows} items (page ${pagination.page}/${pagination.totalPages})`,
    );
    if (pagination.page < pagination.totalPages) {
      lines.push(`Use page=${pagination.page + 1} to see more.`);
    }
  }

  return truncateOutput(lines.join("\n"));
}

export function formatSingleEntity(title: string, fields: [string, string | undefined][]): string {
  const lines: string[] = [title, ""];

  const maxKeyLen = Math.max(...fields.filter(([, v]) => v !== undefined).map(([k]) => k.length));

  for (const [key, value] of fields) {
    if (value === undefined) continue;
    lines.push(`  ${key.padEnd(maxKeyLen)} : ${value}`);
  }

  return truncateOutput(lines.join("\n"));
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

function truncateOutput(text: string): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= MAX_OUTPUT_BYTES) return text;

  const truncated = new TextDecoder().decode(bytes.slice(0, MAX_OUTPUT_BYTES));
  const lastNewline = truncated.lastIndexOf("\n");
  const clean = lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated;

  return (
    clean + "\n\n[Response truncated at 50KB. Narrow your query with filters or reduce perPage.]"
  );
}

export function extractCellValue(cell: unknown): string {
  if (cell == null) return "";
  if (typeof cell === "object" && cell !== null && "value" in cell) {
    return String((cell as { value: unknown }).value ?? "");
  }
  return String(cell);
}

export function clampPerPage(perPage: number | undefined, defaultVal = 25, max = 100): number {
  if (perPage === undefined) return defaultVal;
  return Math.max(1, Math.min(perPage, max));
}
