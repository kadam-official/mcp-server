import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import * as api from "../../api/pub-client.js";
import { formatSingleEntity, formatCurrency } from "../../output-formatter.js";
import type { PubUser } from "../../types/publisher.js";

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
      async () => {
        const user = (await api.getUserInfo()) as PubUser;
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
