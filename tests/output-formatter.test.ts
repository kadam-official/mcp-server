import {
  formatTable,
  formatEntityList,
  formatSingleEntity,
  formatPaginatedList,
  formatNumber,
  formatCurrency,
  clampPerPage,
} from "../src/output-formatter.js";

describe("output-formatter", () => {
  describe("formatTable", () => {
    it("formats table with 2 columns, 2 rows — check header, separator, data rows", () => {
      const result = formatTable({
        headers: ["Name", "Value"],
        rows: [
          ["foo", "10"],
          ["bar", "20"],
        ],
      });
      expect(result).toContain("Name | Value");
      expect(result).toContain("-+-");
      expect(result).toContain("foo");
      expect(result).toContain("10");
      expect(result).toContain("bar");
      expect(result).toContain("20");
    });

    it("includes title when provided", () => {
      const result = formatTable({ headers: ["A"], rows: [["1"]] }, "My Table");
      expect(result).toMatch(/^My Table\n\nA/);
    });

    it("includes totals row with extra separator when totals provided", () => {
      const result = formatTable({
        headers: ["Name", "Total"],
        rows: [
          ["a", "5"],
          ["b", "3"],
        ],
        totals: ["Sum", "8"],
      });
      expect(result).toContain("Sum");
      expect(result).toContain("8");
      expect(result).toContain("-+-");
      const lines = result.split("\n");
      const separatorLines = lines.filter((line) => line.includes("-+-"));
      expect(separatorLines.length).toBe(2);
    });
  });

  describe("formatEntityList", () => {
    it("formats 3 items with numbered items and header", () => {
      const result = formatEntityList(
        ["one", "two", "three"],
        (item, i) => `${i + 1}. ${item}`,
        "Items",
      );
      expect(result).toContain("Items");
      expect(result).toContain("1. one");
      expect(result).toContain("2. two");
      expect(result).toContain("3. three");
    });

    it("with pagination on last page — no 'Use page=' line", () => {
      const result = formatEntityList(["a"], (x) => x, "List", {
        page: 2,
        totalPages: 2,
        totalRows: 2,
      });
      expect(result).toContain("page 2/2");
      expect(result).not.toContain("Use page=");
    });

    it("with pagination not last page — includes 'Use page=2'", () => {
      const result = formatEntityList(["a"], (x) => x, "List", {
        page: 1,
        totalPages: 2,
        totalRows: 2,
      });
      expect(result).toContain("Use page=2");
    });

    it("with empty items — just header + pagination", () => {
      const result = formatEntityList([], (_x, i) => `${i}`, "Empty", {
        page: 1,
        totalPages: 1,
        totalRows: 0,
      });
      expect(result).toContain("Empty");
      expect(result).toContain("0");
      expect(result).toContain("page 1/1");
    });
  });

  describe("formatSingleEntity", () => {
    it("formats key-value pairs aligned, undefined values skipped", () => {
      const result = formatSingleEntity("Entity", [
        ["id", "123"],
        ["name", "Test"],
        ["optional", undefined],
        ["status", "active"],
      ]);
      expect(result).toContain("Entity");
      expect(result).toContain("id     : 123");
      expect(result).toContain("name   : Test");
      expect(result).not.toContain("optional");
      expect(result).toContain("status : active");
    });
  });

  describe("formatPaginatedList", () => {
    it("with header — header + rows + page info", () => {
      const result = formatPaginatedList(
        { rows: ["row1", "row2"], page: 1, totalPages: 2, totalRows: 4, perPage: 2 },
        "Results",
      );
      expect(result).toContain("Results");
      expect(result).toContain("row1");
      expect(result).toContain("row2");
      expect(result).toContain("Showing 2 of 4 rows (page 1/2)");
    });

    it("without header — just rows + page info", () => {
      const result = formatPaginatedList({
        rows: ["a", "b"],
        page: 1,
        totalPages: 1,
        totalRows: 2,
        perPage: 10,
      });
      expect(result).toContain("a");
      expect(result).toContain("b");
      expect(result).toContain("Showing 2 of 2 rows (page 1/1)");
    });
  });

  describe("formatNumber", () => {
    it("formats 1234567 as '1,234,567'", () => {
      expect(formatNumber(1234567)).toBe("1,234,567");
    });
  });

  describe("formatCurrency", () => {
    it("formats 45.2 as '$45.20'", () => {
      expect(formatCurrency(45.2)).toBe("$45.20");
    });
  });

  describe("clampPerPage", () => {
    it("clampPerPage(undefined) -> 25", () => {
      expect(clampPerPage(undefined)).toBe(25);
    });

    it("clampPerPage(50) -> 50", () => {
      expect(clampPerPage(50)).toBe(50);
    });

    it("clampPerPage(200) -> 100", () => {
      expect(clampPerPage(200)).toBe(100);
    });

    it("clampPerPage(0) -> 1", () => {
      expect(clampPerPage(0)).toBe(1);
    });
  });

  describe("truncation", () => {
    it("truncates output > 50KB with truncation message", () => {
      const bigString = "x".repeat(60 * 1024);
      const result = formatPaginatedList({
        rows: [bigString],
        page: 1,
        totalPages: 1,
        totalRows: 1,
        perPage: 1,
      });
      expect(result.length).toBeLessThanOrEqual(50 * 1024 + 200);
      expect(result).toContain(
        "[Response truncated at 50KB. Narrow your query with filters or reduce perPage.]",
      );
    });
  });
});
