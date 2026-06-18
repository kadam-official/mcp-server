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
  },
};
