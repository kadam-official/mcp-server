import { z } from "zod";
import { listResponseSchema, reportConfigSchema } from "../../src/api/schemas/common.js";
import {
  campaignRowSchema,
  audienceRowSchema_,
  audienceDetailSchema,
} from "../../src/api/schemas/advertiser.js";
import {
  sourceDetailSchema,
  sourceTableRowSchema,
  adUnitTableRowSchema,
  pubUserSchema,
} from "../../src/api/schemas/publisher.js";

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

describe("audienceRowSchema_", () => {
  it("parses list row with audienceId/audienceName", () => {
    const result = audienceRowSchema_.parse({
      audienceId: 1,
      audienceName: "Test",
      type: "s2s",
      dateCreated: "01.03.2026",
      expireDays: 10,
      reachToday: 5,
      new7d: 3,
    });
    expect(result.audienceId).toBe(1);
    expect(result.audienceName).toBe("Test");
    expect(result.reachToday).toBe(5);
  });
});

describe("audienceDetailSchema", () => {
  it("parses GET /audiences/{id} response for pixel", () => {
    const result = audienceDetailSchema.parse({
      id: 42,
      name: "My Pixel",
      type: "audience_code",
      expireDays: 10,
      audienceCode: "https://example.com/code",
      usersIds: null,
      fp: null,
    });
    expect(result.id).toBe(42);
    expect(result.usersIds).toBeNull();
  });

  it("parses stat audience with campaigns and fp object", () => {
    const result = audienceDetailSchema.parse({
      id: 10,
      name: "Stat",
      type: "audience",
      expireDays: 14,
      hasClicks: true,
      hasConversions: false,
      hasHolds: false,
      hasRejects: false,
      campaignsIds: [100],
      campaigns: { "100": "Campaign A" },
      usersIds: null,
      fp: { id: 11, name: "Stat - FP" },
    });
    expect(result.fp).toEqual({ id: 11, name: "Stat - FP" });
    expect(result.campaigns).toEqual({ "100": "Campaign A" });
  });

  it("parses s2s audience with linked audiences", () => {
    const result = audienceDetailSchema.parse({
      id: 42,
      name: "My S2S",
      type: "s2s",
      expireDays: 10,
      audienceCode: "https://example.com/match_s2s/42/",
      linkedAudiencesIds: [1, 2],
      linkedAudiences: { "1": "aud1 [audience_code]", "2": "aud2 [fingerprint]" },
      usersIds: null,
      fp: null,
    });
    expect(result.linkedAudiencesIds).toEqual([1, 2]);
    expect(result.linkedAudiences).toEqual({
      "1": "aud1 [audience_code]",
      "2": "aud2 [fingerprint]",
    });
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
