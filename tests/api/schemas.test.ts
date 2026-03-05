import { z } from "zod";
import { listResponseSchema, reportConfigSchema } from "../../src/api/schemas/common.js";
import { campaignRowSchema, audienceSchema } from "../../src/api/schemas/advertiser.js";
import { sourceSchema, adUnitSchema } from "../../src/api/schemas/publisher.js";

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

describe("sourceSchema", () => {
  it("parses with defaults", () => {
    const result = sourceSchema.parse({ id: 1, name: "Site", url: "https://example.com" });
    expect(result.status).toBe("unknown");
    expect(result.impressions).toBe(0);
  });
});

describe("adUnitSchema", () => {
  it("parses with required fields", () => {
    const result = adUnitSchema.parse({ id: 5, name: "Block", type: 10 });
    expect(result.status).toBe("unknown");
    expect(result.revenue).toBe(0);
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
