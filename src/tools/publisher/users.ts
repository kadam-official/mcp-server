import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatSingleEntity, formatCurrency } from "../../output-formatter.js";

export const usersModule: ToolModule = {
  product: "publisher",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_pub_get_user_info",
        description:
          "Gets current publisher user info including balance, details, and notifications.",
        product: "publisher",
        annotations: { readOnlyHint: true },
      },
      {},
      async (_args, ctx) => {
        const user = await ctx.pub.getUserInfo();
        return formatSingleEntity("Publisher User", [
          ["Email", user.email],
          ["Name", user.name],
          ["Balance", user.balance != null ? formatCurrency(user.balance) : undefined],
          ["Notifications", user.notificationsCount != null ? String(user.notificationsCount) : undefined],
        ]);
      },
    );
  },
};
