import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatEntityList } from "../../output-formatter.js";
import { AUTORULE_TYPE_MAP, AUTORULE_TYPE_NAME } from "../../utils/status-actions.js";
import type { Autorule } from "../../api/schemas/advertiser.js";

const RULE_METRIC = [
  "CPA",
  "CPL",
  "spend",
  "clicks",
  "ROI",
  "conversions",
  "holds",
  "rejects",
] as const;
const RULE_MATCH = ["less", "more", "equals"] as const;
const RULE_ACTION = [
  "areaBlPut",
  "areaBlRemove",
  "campaignStop",
  "creoStop",
  "creoActivate",
  "bidChange",
  "dayLimitIncrease",
] as const;

const conditionSchema = z.object({
  metric: z.enum(RULE_METRIC),
  match: z.enum(RULE_MATCH),
  value: z.number(),
});

// Shared writable fields (create + update use the same set).
const ruleFields = {
  type: z.enum(["area", "campaign", "creo", "bid"]).describe("Rule type"),
  period: z.number().int().positive().describe("Evaluation period in days"),
  conditions: z
    .array(conditionSchema)
    .min(1)
    .describe("Conditions ANDed together; each {metric, match, value}"),
  statBy: z.enum(["campaign", "account"]).optional(),
  action: z
    .enum(RULE_ACTION)
    .describe(
      "Action: areaBlPut/areaBlRemove (type area), campaignStop (campaign), creoStop/creoActivate (creo), bidChange/dayLimitIncrease (bid)",
    ),
  slices: z
    .array(z.number())
    .optional()
    .describe(
      "bid rules: granularity dimension IDs, e.g. [180,190] = per source x site. REQUIRED for bidChange.",
    ),
  bidRate: z
    .number()
    .optional()
    .describe(
      "bidChange: coefficient on the slice EPC (earnings/click ~ eCPC); new bid = EPC x bidRate, capped at bidMax. REQUIRED for bidChange, range 0.1-2. bidRate=1 = set bid to the eCPC (valid, NOT a no-op).",
    ),
  bidMax: z
    .number()
    .optional()
    .describe("bidChange: max bid cap (>=0.001). REQUIRED for bidChange."),
  dayLimitValue: z.number().optional().describe("dayLimitIncrease only"),
  dayLimitType: z.enum(["strict", "percent"]).optional().describe("dayLimitIncrease only"),
  isActive: z.boolean().optional(),
};

function formatConditions(rule: Autorule): string {
  return rule.conditions.map((c) => `${c.metric} ${c.match} ${c.value}`).join(" AND ");
}

function formatAutoruleRow(rule: Autorule, index: number): string {
  const type = AUTORULE_TYPE_NAME[rule.typeId] ?? String(rule.typeId);
  const state = rule.isActive ? "active" : "paused";
  const extra =
    rule.bidRate != null
      ? ` | bidRate ${rule.bidRate}${rule.bidMax != null ? `/max ${rule.bidMax}` : ""}`
      : "";
  const slices = rule.slices && rule.slices.length ? ` | slices ${rule.slices.join(",")}` : "";
  return (
    `${index + 1}. [ID: ${rule.id}] campaign #${rule.campaignId} | ${type} -> ${rule.action} | ` +
    `if ${formatConditions(rule)} over ${rule.period}d | ${state}${extra}${slices}`
  );
}

/**
 * Enforce the backend's action-specific required-field matrix client-side, so the
 * agent gets a precise message up front instead of an opaque 422. Mirrors
 * CampaignAutoruleForm::rules(): bidChange requires slices + bidRate(0.1-2) +
 * bidMax(>=0.001) and a spend/clicks condition; dayLimitIncrease requires
 * dayLimitValue(>=0.01) + dayLimitType. Called on the effective (merged) rule.
 */
function assertRuleConstraints(rule: {
  action?: unknown;
  slices?: unknown;
  bidRate?: unknown;
  bidMax?: unknown;
  dayLimitValue?: unknown;
  dayLimitType?: unknown;
  conditions?: unknown;
}): void {
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

  if (rule.action === "bidChange") {
    const problems: string[] = [];
    if (!Array.isArray(rule.slices) || rule.slices.length === 0)
      problems.push("slices (granularity dims, e.g. [180,190])");
    const bidRate = num(rule.bidRate);
    if (bidRate == null) problems.push("bidRate (coefficient on slice EPC, range 0.1-2)");
    else if (bidRate < 0.1 || bidRate > 2) problems.push("bidRate must be between 0.1 and 2");
    const bidMax = num(rule.bidMax);
    if (bidMax == null) problems.push("bidMax (max bid cap, >=0.001)");
    else if (bidMax < 0.001) problems.push("bidMax must be >= 0.001");
    const conditions = Array.isArray(rule.conditions)
      ? (rule.conditions as Array<{ metric?: unknown }>)
      : [];
    if (!conditions.some((c) => c.metric === "spend" || c.metric === "clicks"))
      problems.push("at least one condition on metric 'spend' or 'clicks'");
    if (problems.length) throw new Error(`bidChange autorule requires: ${problems.join("; ")}.`);
  } else if (rule.action === "dayLimitIncrease") {
    const problems: string[] = [];
    const dayLimitValue = num(rule.dayLimitValue);
    if (dayLimitValue == null) problems.push("dayLimitValue (>=0.01)");
    else if (dayLimitValue < 0.01) problems.push("dayLimitValue must be >= 0.01");
    if (rule.dayLimitType == null) problems.push("dayLimitType (strict|percent)");
    if (problems.length)
      throw new Error(`dayLimitIncrease autorule requires: ${problems.join("; ")}.`);
  }
}

/** Build the API rule body from friendly args (type -> typeId), dropping unset fields. */
function buildRuleBody(args: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    typeId: AUTORULE_TYPE_MAP[args.type as keyof typeof AUTORULE_TYPE_MAP],
    period: args.period,
    conditions: args.conditions,
    action: args.action,
  };
  for (const k of [
    "statBy",
    "slices",
    "bidRate",
    "bidMax",
    "dayLimitValue",
    "dayLimitType",
    "isActive",
  ]) {
    if (args[k] != null) body[k] = args[k];
  }
  return body;
}

export const autorulesModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_list_autorules",
        description:
          "List autorules (campaign automation). Omit campaignId for all rules of active campaigns, or pass it for one campaign. Returns full rule definitions.",
        product: "advertiser",
        annotations: { title: "List autorules", readOnlyHint: true },
      },
      {
        campaignId: z.number().optional(),
      },
      async (args, ctx) => {
        const rules =
          args.campaignId != null
            ? await ctx.adv.listCampaignAutorules(args.campaignId)
            : await ctx.adv.listAutorules();
        const title =
          args.campaignId != null ? `Autorules for campaign #${args.campaignId}` : "Autorules";
        return formatEntityList(rules, formatAutoruleRow, title);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_create_autorule",
        description:
          "Create an autorule on a CPC campaign (autorules are CPC-only). Campaigns usually carry several rules (a strategy); call once per rule. bidChange rules require slices + bidRate + bidMax and a spend/clicks condition.",
        product: "advertiser",
        annotations: { title: "Create autorule", readOnlyHint: false },
      },
      {
        campaignId: z.number().describe("CPC campaign ID"),
        ...ruleFields,
      },
      async (args, ctx) => {
        assertRuleConstraints(args);
        // The form requires isActive; new rules launch active unless told otherwise.
        const body = buildRuleBody({ ...args, isActive: args.isActive ?? true });
        const res = await ctx.adv.createAutorule(args.campaignId, body);
        return `Autorule created${res.id != null ? ` [ID: ${res.id}]` : ""} on campaign #${args.campaignId}.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_update_autorule",
        description:
          "Update an autorule (read-modify-write). Pass only the fields to change; full payload is rebuilt from current state.",
        product: "advertiser",
        annotations: { title: "Update autorule", readOnlyHint: false },
      },
      {
        id: z.number().describe("Autorule ID"),
        type: z.enum(["area", "campaign", "creo", "bid"]).optional().describe("Rule type"),
        period: z.number().int().positive().optional(),
        conditions: z.array(conditionSchema).min(1).optional(),
        statBy: z.enum(["campaign", "account"]).optional(),
        action: z.enum(RULE_ACTION).optional(),
        slices: z
          .array(z.number())
          .optional()
          .describe("bid rules: granularity dims, e.g. [180,190]. REQUIRED for bidChange."),
        bidRate: z
          .number()
          .optional()
          .describe(
            "bidChange: coefficient on slice EPC (new bid = EPC x bidRate, capped at bidMax). REQUIRED for bidChange, range 0.1-2; bidRate=1 = set bid to eCPC.",
          ),
        bidMax: z
          .number()
          .optional()
          .describe("bidChange: max bid cap (>=0.001). REQUIRED for bidChange."),
        dayLimitValue: z.number().optional(),
        dayLimitType: z.enum(["strict", "percent"]).optional(),
        isActive: z.boolean().optional(),
      },
      async (args, ctx) => {
        const { id, ...changes } = args;
        const current = await ctx.adv.getAutorule(id);

        const merged: Record<string, unknown> = {
          typeId: current.typeId,
          period: current.period,
          conditions: current.conditions,
          statBy: current.statBy ?? undefined,
          action: current.action,
          slices: current.slices ?? undefined,
          bidRate: current.bidRate ?? undefined,
          bidMax: current.bidMax ?? undefined,
          dayLimitValue: current.dayLimitValue ?? undefined,
          dayLimitType: current.dayLimitType ?? undefined,
          isActive: current.isActive,
        };

        if (changes.type != null) merged.typeId = AUTORULE_TYPE_MAP[changes.type];
        if (changes.period != null) merged.period = changes.period;
        if (changes.conditions != null) merged.conditions = changes.conditions;
        if (changes.statBy != null) merged.statBy = changes.statBy;
        if (changes.action != null) merged.action = changes.action;
        if (changes.slices != null) merged.slices = changes.slices;
        if (changes.bidRate != null) merged.bidRate = changes.bidRate;
        if (changes.bidMax != null) merged.bidMax = changes.bidMax;
        if (changes.dayLimitValue != null) merged.dayLimitValue = changes.dayLimitValue;
        if (changes.dayLimitType != null) merged.dayLimitType = changes.dayLimitType;
        if (changes.isActive != null) merged.isActive = changes.isActive;

        assertRuleConstraints(merged);
        await ctx.adv.updateAutorule(id, merged);
        return `Autorule #${id} updated.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_set_autorule_status",
        description: "Enable or disable an autorule without deleting it.",
        product: "advertiser",
        annotations: { title: "Set autorule status", idempotentHint: true },
      },
      {
        id: z.number(),
        isActive: z.boolean(),
      },
      async (args, ctx) => {
        await ctx.adv.setAutoruleStatus(args.id, args.isActive);
        return `Autorule #${args.id} ${args.isActive ? "enabled" : "disabled"}.`;
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_delete_autorule",
        description: "Permanently delete an autorule. Requires confirm=true.",
        product: "advertiser",
        annotations: { title: "Delete autorule", destructiveHint: true },
      },
      {
        id: z.number(),
        confirm: z.literal(true),
      },
      async (args, ctx) => {
        await ctx.adv.deleteAutorule(args.id);
        return `Autorule #${args.id} deleted.`;
      },
    );
  },
};
