import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import type {
  DayMoneyLimit,
  FinanceRow,
  PaymentSystem,
  PaymentSystemCurrency,
} from "../../api/schemas/advertiser.js";
import { formatEntityList, formatSingleEntity, clampPerPage } from "../../output-formatter.js";
import { extractPagination } from "../../utils/pagination.js";

function formatFinanceRow(op: FinanceRow, index: number): string {
  const comment = op.comment ? ` | ${op.comment}` : "";
  const status = op.status && typeof op.status === "object" ? ` | ${op.status.label}` : "";
  return `${index + 1}. ${op.date} | ${op.type} | ${op.money}${status}${comment}`;
}

function formatDepositCurrency(currency: PaymentSystemCurrency): string {
  const conditions = [`commission ${currency.commission}%`];
  if (currency.constCommission > 0) conditions.push(`+${currency.constCommission} fixed`);
  conditions.push(`min ${currency.min}`);
  conditions.push(currency.max != null ? `max ${currency.max}` : "no max");
  if (currency.exchangeRateToAccountCurrency != null) {
    conditions.push(`rate to account currency ${currency.exchangeRateToAccountCurrency}`);
  }
  return `   - ${currency.currency}: ${conditions.join(", ")}`;
}

function formatPaymentSystem(system: PaymentSystem, index: number): string {
  const notes: string[] = [];
  if (system.isManualThroughManager) notes.push("arranged through a manager");
  if (system.isPromocodeAvailable) notes.push("promo code accepted");
  if (system.taxPercent > 0) notes.push(`tax ${system.taxPercent}%`);
  const header = `${index + 1}. [ID: ${system.id}] ${system.name}`;
  const suffix = notes.length ? ` | ${notes.join(" | ")}` : "";
  const currencies = system.currencies.map(formatDepositCurrency).join("\n");
  return currencies ? `${header}${suffix}\n${currencies}` : `${header}${suffix}`;
}

function formatDayMoneyLimit(limit: DayMoneyLimit): string {
  return formatSingleEntity("Account Daily Spending Limit", [
    ["Limit", limit.limit > 0 ? `${limit.limit} ${limit.currency}` : "0 (no daily limit set)"],
    ["Currency", limit.currency],
    [
      "Minimum",
      limit.minimum != null
        ? String(limit.minimum)
        : `not changeable on a ${limit.currency} account`,
    ],
  ]);
}

// Friendly operation type -> Advertiser API v1 `filters.type` int (OperationsFacade::TYPES).
const FINANCE_OPERATION_TYPE: Record<string, number> = {
  impression: 1,
  deposit: 2,
  admin_deposit: 3,
  withdrawal: 4,
  admin_withdrawal: 5,
};

export const financesModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_list_finance_operations",
        description:
          "Lists financial operations (deposits, charges, refunds). Use to check account balance, recent transactions, and spending history.",
        product: "advertiser",
        annotations: { title: "List finance operations", readOnlyHint: true },
      },
      {
        page: z.number().optional().default(1),
        perPage: z.number().optional().default(25),
        dateFrom: z
          .string()
          .optional()
          .describe("Range start (YYYY-MM-DD); must be paired with dateTo"),
        dateTo: z
          .string()
          .optional()
          .describe("Range end (YYYY-MM-DD); must be paired with dateFrom"),
        activityType: z
          .enum(["impression", "deposit", "admin_deposit", "withdrawal", "admin_withdrawal"])
          .optional()
          .describe("Operation type filter"),
      },
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);

        // Filters must be nested under `filters`; flat top-level keys are ignored by the API.
        // The API rejects a half-open range, so only send dates when BOTH are present.
        const hasRange = args.dateFrom != null && args.dateTo != null;
        const filters: Record<string, unknown> = {};
        if (hasRange) {
          filters.dateFrom = args.dateFrom;
          filters.dateTo = args.dateTo;
        }
        if (args.activityType != null) filters.type = FINANCE_OPERATION_TYPE[args.activityType];

        const params: Record<string, unknown> = { page: args.page, perPage };
        if (Object.keys(filters).length > 0) params.filters = filters;

        const res = await ctx.adv.listFinanceOperations(params);
        const items = res.rows ?? [];
        const pagination = extractPagination(res);
        const dateRange = hasRange ? `${args.dateFrom} to ${args.dateTo}` : "all time";
        const header = `Finance operations (${dateRange}, page ${pagination.page}/${pagination.totalPages})`;
        return formatEntityList(items, formatFinanceRow, header, pagination);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_list_payment_systems",
        description:
          "Lists the payment systems the account may deposit through, with per-currency deposit conditions: commission, minimum and maximum amount, and the exchange rate to the account currency. Use before advising on a deposit. Systems reserved for administrators are not returned.",
        product: "advertiser",
        annotations: { title: "List payment systems", readOnlyHint: true },
      },
      {},
      async (_args, ctx) => {
        const { paymentSystems } = await ctx.adv.listPaymentSystems();
        const header = `Payment systems (${paymentSystems.length})`;
        return formatEntityList(paymentSystems, formatPaymentSystem, header);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_get_day_money_limit",
        description:
          "Gets the daily spending limit of the WHOLE ACCOUNT, not of a single campaign (for a campaign budget use kadam_adv_get_campaign). A limit of 0 means no cap. When the reported minimum is null the account currency does not support changing the limit.",
        product: "advertiser",
        annotations: { title: "Get account daily spending limit", readOnlyHint: true },
      },
      {},
      async (_args, ctx) => {
        return formatDayMoneyLimit(await ctx.adv.getDayMoneyLimit());
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_set_day_money_limit",
        description:
          "Sets the daily spending limit of the WHOLE ACCOUNT, not of a single campaign (for a campaign budget use kadam_adv_update_campaign). Pass 0 to remove the limit, otherwise the amount must be at least the minimum reported by kadam_adv_get_day_money_limit. Only accounts in the supported currency may change it. Raising or removing the limit resumes campaigns that it had stopped.",
        product: "advertiser",
        annotations: { title: "Set account daily spending limit", idempotentHint: true },
      },
      {
        limit: z
          .number()
          .min(0)
          .describe("New daily limit in the account currency; 0 removes the limit"),
      },
      async (args, ctx) => {
        return formatDayMoneyLimit(await ctx.adv.setDayMoneyLimit(args.limit));
      },
    );
  },
};
