import { describe, it, expect } from "vitest";
import { compareId, sortById } from "../../src/utils/stable-sort.js";

describe("compareId", () => {
  it("orders numbers numerically (not lexically)", () => {
    expect(compareId(2, 10)).toBeLessThan(0);
    expect(compareId(10, 9)).toBeGreaterThan(0);
    expect(compareId(1, 1)).toBe(0);
  });

  it("orders numbers before non-numeric strings", () => {
    expect(compareId(5, "mainstream")).toBeLessThan(0);
    expect(compareId("mainstream", 5)).toBeGreaterThan(0);
  });

  it("orders non-numeric strings lexically", () => {
    expect(compareId("a", "b")).toBeLessThan(0);
    expect(compareId("b", "a")).toBeGreaterThan(0);
  });

  it("treats numeric strings as numbers and trims whitespace", () => {
    expect(compareId("2", "10")).toBeLessThan(0);
    expect(compareId(" 5 ", 5)).toBe(0);
  });

  it("guards empty string (not coerced to 0)", () => {
    expect(compareId("", "a")).toBeLessThan(0); // "" sorts as a string, not as 0
  });
});

describe("sortById", () => {
  it("sorts by id ascending, numbers before strings", () => {
    const out = sortById([{ id: 10 }, { id: 2 }, { id: "mainstream" }, { id: 1 }]);
    expect(out.map((x) => x.id)).toEqual([1, 2, 10, "mainstream"]);
  });

  it("tie-breaks equal ids by label", () => {
    const out = sortById([
      { id: 1, label: "b" },
      { id: 1, label: "a" },
    ]);
    expect(out.map((x) => x.label)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = [{ id: 3 }, { id: 1 }, { id: 2 }];
    const snapshot = input.map((x) => x.id);
    sortById(input);
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });
});
