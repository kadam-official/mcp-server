import { z } from "zod";
import { listResponseSchema, reportConfigSchema } from "../../src/api/schemas/common.js";
import { campaignRowSchema, audienceSchema } from "../../src/api/schemas/advertiser.js";
import { sourceDetailSchema, sourceTableRowSchema, adUnitTableRowSchema, pubUserSchema } from "../../src/api/schemas/publisher.js";

describe("listResponseSchema", () => {
  const schema = listResponseSchema(z.object({ id: z.number() }));

  it("parses valid list response", () => {
    const result = schema.parse({
      rows: [{ id: 1 }, { id: 2 }],
      totalRows: 2,
      page: 1,
      perPage: 25,
    });
    expect(result.rows).toHaveLength(2);
    expect(result.totalRows).toBe(2);
  });

  it("applies defaults for missing fields", () => {
    const result = schema.parse({ rows: [{ id: 1 }] });
    expect(result.totalRows).toBe(0);
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(25);
  });

  it("defaults rows to empty array when missing", () => {
    const result = schema.parse({});
    expect(result.rows).toEqual([]);
  });

  it("rejects invalid row data", () => {
    expect(() => schema.parse({ rows: [{ id: "not-a-number" }] })).toThrow(z.ZodError);
  });
});

describe("campaignRowSchema", () => {
  it("parses minimal campaign row", () => {
    const result = campaignRowSchema.parse({
      campaign: {
        id: 1,
        name: "Test",
        state: { id: "active" },
        type: { id: "push" },
        folder: { id: 10, name: "Default" },
      },
    });
    expect(result.campaign.id).toBe(1);
    expect(result.dayMoneyLimit).toBe("0");
  });

  it("allows extra fields via passthrough", () => {
    const result = campaignRowSchema.parse({
      campaign: {
        id: 1,
        name: "Test",
        state: { id: "active" },
        type: { id: "push" },
        folder: { id: 10, name: "Default" },
        unknownField: "should-pass",
      },
      extraTopLevel: true,
    });
    expect((result as Record<string, unknown>).extraTopLevel).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(() => campaignRowSchema.parse({ campaign: { id: 1 } })).toThrow(z.ZodError);
  });
});

describe("audienceSchema", () => {
  it("parses minimal audience", () => {
    const result = audienceSchema.parse({ id: 1, name: "Test", type: "retarget" });
    expect(result.id).toBe(1);
    expect(result.size).toBe(0);
    expect(result.campaignsIds).toEqual([]);
  });
});

describe("sourceDetailSchema", () => {
  it("parses GET /sources/{id} response", () => {
    const result = sourceDetailSchema.parse({
      id: 1,
      name: "Site",
      url: "https://example.com",
      state: "accepted",
    });
    expect(result.id).toBe(1);
    expect(result.state).toBe("accepted");
    expect(result.archive).toBe(0);
  });

  it("handles null name", () => {
    const result = sourceDetailSchema.parse({
      id: 2,
      name: null,
      url: "https://example.com",
      state: "onconfirm",
    });
    expect(result.name).toBe("");
  });
});

describe("sourceTableRowSchema", () => {
  it("parses data row with nested source object", () => {
    const result = sourceTableRowSchema.parse({
      source: { id: 1, name: "Site", state: 1, stage: "accepted" },
      domain: "site.com",
      views: "100",
      clicks: "5",
      income: "₽10",
    });
    expect(result.source).not.toBe("fullResult");
    if (result.source !== "fullResult") {
      expect(result.source.id).toBe(1);
    }
  });

  it("parses fullResult summary row", () => {
    const result = sourceTableRowSchema.parse({
      source: "fullResult",
      domain: null,
      views: "0",
      clicks: "0",
      income: "₽0",
    });
    expect(result.source).toBe("fullResult");
  });
});

describe("adUnitTableRowSchema", () => {
  it("parses data row with nested block object", () => {
    const result = adUnitTableRowSchema.parse({
      block: { id: 5, name: "Block 1", state: 1 },
      type: "inpagepush",
      queries: "10",
      views: "50",
      clicks: "2",
      income: "₽1",
    });
    expect(result.block).not.toBe("fullResult");
    if (result.block !== "fullResult") {
      expect(result.block.id).toBe(5);
    }
  });
});

describe("pubUserSchema", () => {
  it("parses real API response", () => {
    const result = pubUserSchema.parse({
      balance: 100,
      currency: "rub",
      notifications: { items: [], totalItems: 0, unreadItems: 0 },
    });
    expect(result.balance).toBe(100);
    expect(result.currency).toBe("rub");
  });
});

describe("reportConfigSchema", () => {
  it("parses report config structure", () => {
    const result = reportConfigSchema.parse({
      groups: { time: [{ id: "time_day" }] },
      metrics: { finance: [{ id: "finance_moneyOut" }] },
    });
    expect(result.groups.time).toHaveLength(1);
    expect(result.metrics.finance[0]!.id).toBe("finance_moneyOut");
  });
});
