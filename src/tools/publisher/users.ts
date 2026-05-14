import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatSingleEntity, formatCurrency } from "../../output-formatter.js";

const CURRENCY_SYMBOL: Record<string, string> = {
  rub: "₽",
  usd: "$",
  eur: "€",
};

export const usersModule: ToolModule = {
  product: "publisher",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_pub_get_user_info",
        description:
          "Gets current publisher account info: balance, currency, and notification counts.",
        product: "publisher",
        annotations: { title: "Get publisher account info", readOnlyHint: true },
      },
      {},
      async (_args, ctx) => {
        const user = await ctx.pub.getUserInfo();
        const sym = CURRENCY_SYMBOL[user.currency ?? "usd"] ?? user.currency;
        const notif = user.notifications;
        return formatSingleEntity("Publisher Account", [
          ["Balance", `${sym}${user.balance}`],
          ["Currency", user.currency],
          ["Unread Notifications", notif ? String(notif.unreadItems) : "0"],
          ["Total Notifications", notif ? String(notif.totalItems) : "0"],
        ]);
      },
    );
  },
};
