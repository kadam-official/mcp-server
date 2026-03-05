import { ADV_STATUS_ACTION_MAP, parseCommaSeparatedIds } from "../../src/utils/status-actions.js";

describe("ADV_STATUS_ACTION_MAP", () => {
  it("maps active to activate", () => {
    expect(ADV_STATUS_ACTION_MAP.active).toBe("activate");
  });

  it("maps paused to pause", () => {
    expect(ADV_STATUS_ACTION_MAP.paused).toBe("pause");
  });

  it("maps archived to archive", () => {
    expect(ADV_STATUS_ACTION_MAP.archived).toBe("archive");
  });
});

describe("parseCommaSeparatedIds", () => {
  it("parses comma-separated numbers", () => {
    expect(parseCommaSeparatedIds("1,2,3")).toEqual([1, 2, 3]);
  });

  it("trims whitespace", () => {
    expect(parseCommaSeparatedIds(" 10 , 20 , 30 ")).toEqual([10, 20, 30]);
  });

  it("filters out NaN values", () => {
    expect(parseCommaSeparatedIds("1,abc,3")).toEqual([1, 3]);
  });

  it("handles single value", () => {
    expect(parseCommaSeparatedIds("42")).toEqual([42]);
  });

  it("returns empty array for all-invalid input", () => {
    expect(parseCommaSeparatedIds("abc,def")).toEqual([]);
  });
});
