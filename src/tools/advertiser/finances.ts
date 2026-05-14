import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import type { FinanceRow } from "../../api/schemas/advertiser.js";
import {
  formatEntityList,
  clampPerPage,
} from "../../output-formatter.js";
import { extractPagination } from "../../utils/pagination.js";

function formatFinanceRow(op: FinanceRow, index: number): string {
  const comment = op.comment ? ` | ${op.comment}` : "";
  return `${index + 1}. ${op.date} | ${op.type} | ${op.money}${comment}`;
}

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
        activityType: z.string().optional(),
      },
      async (args, ctx) => {
        const perPage = clampPerPage(args.perPage);
        const params: Record<string, unknown> = {
          page: args.page,
          perPage,
          ...(args.dateFrom != null && { dateFrom: args.dateFrom }),
          ...(args.dateTo != null && { dateTo: args.dateTo }),
          ...(args.activityType != null && {
            activityType: args.activityType,
          }),
        };
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
