import { extractPagination } from "../../src/utils/pagination.js";

describe("extractPagination", () => {
  it("computes totalPages from totalRows and perPage", () => {
    const result = extractPagination({
      rows: [{}, {}, {}],
      totalRows: 50,
      page: 2,
      perPage: 25,
    });
    expect(result).toEqual({ page: 2, totalPages: 2, totalRows: 50 });
  });

  it("defaults to page 1 and perPage 25 when not provided", () => {
    const result = extractPagination({
      rows: [{}],
      totalRows: 100,
    });
    expect(result).toEqual({ page: 1, totalPages: 4, totalRows: 100 });
  });

  it("falls back to rows.length when totalRows is missing", () => {
    const result = extractPagination({
      rows: [{}, {}, {}],
    });
    expect(result).toEqual({ page: 1, totalPages: 1, totalRows: 3 });
  });

  it("handles empty rows", () => {
    const result = extractPagination({
      rows: [],
      totalRows: 0,
      page: 1,
      perPage: 25,
    });
    expect(result).toEqual({ page: 1, totalPages: 0, totalRows: 0 });
  });

  it("handles perPage=0 gracefully (returns 1 page)", () => {
    const result = extractPagination({
      rows: [{}],
      totalRows: 10,
      perPage: 0,
    });
    expect(result).toEqual({ page: 1, totalPages: 1, totalRows: 10 });
  });
});
