import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import type { FinanceRow } from "../../api/schemas/advertiser.js";
import { formatEntityList, clampPerPage } from "../../output-formatter.js";
import { extractPagination } from "../../utils/pagination.js";

function formatFinanceRow(op: FinanceRow, index: number): string {
  const comment = op.comment ? ` | ${op.comment}` : "";
  const status = op.status && typeof op.status === "object" ? ` | ${op.status.label}` : "";
  return `${index + 1}. ${op.date} | ${op.type} | ${op.money}${status}${comment}`;
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
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        activityType: z
          .enum(["impression", "deposit", "admin_deposit", "withdrawal", "admin_withdrawal"])
          .optional()
          .describe("Operation type filter"),
      },
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);

        // Filters must be nested under `filters`; flat top-level keys are ignored by the API.
        const filters: Record<string, unknown> = {};
        if (args.dateFrom != null) filters.dateFrom = args.dateFrom;
        if (args.dateTo != null) filters.dateTo = args.dateTo;
        if (args.activityType != null) filters.type = FINANCE_OPERATION_TYPE[args.activityType];

        const params: Record<string, unknown> = { page: args.page, perPage };
        if (Object.keys(filters).length > 0) params.filters = filters;

        const res = await ctx.adv.listFinanceOperations(params);
        const items = res.rows ?? [];
        const pagination = extractPagination(res);
        const dateRange =
          args.dateFrom && args.dateTo
            ? `${args.dateFrom} to ${args.dateTo}`
            : args.dateFrom
              ? `from ${args.dateFrom}`
              : args.dateTo
                ? `to ${args.dateTo}`
                : "all time";
        const header = `Finance operations (${dateRange}, page ${pagination.page}/${pagination.totalPages})`;
        return formatEntityList(items, formatFinanceRow, header, pagination);
      },
    );
  },
};
