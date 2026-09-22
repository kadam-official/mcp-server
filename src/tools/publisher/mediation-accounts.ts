import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { DOMAIN, findAccount, formatAccount } from "./mediation-shared.js";

/**
 * Accounts hold the publisher's credentials at an outside network. A key may be dictated
 * in chat and passed straight through; it is never read back — the API returns a mask.
 */
export const mediationAccountsModule: ToolModule = {
  product: "publisher",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_pub_update_mediation_network_account",
        description:
          `${DOMAIN}: rotate the API key of a network account, rename it, or disable it. Pass a ` +
          `key only when the publisher dictates a new one; never ask them to read back an ` +
          `existing key — the API returns only a mask of it.`,
        product: "publisher",
        annotations: { title: "Update a mediation account", readOnlyHint: false },
      },
      {
        accountId: z.number(),
        name: z.string().min(1).max(64).optional(),
        apiKey: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        active: z.boolean().optional(),
      },
      async (args, ctx) => {
        const current = await findAccount(ctx.pub, args.accountId);
        if (typeof current === "string") return current;

        const updated = await ctx.pub.updateMediationAccount(args.accountId, {
          // Required by the form on update too, and the name is written back verbatim.
          networkId: current.networkId,
          name: args.name ?? current.name,
          active: args.active ?? current.active,
          // Empty credentials mean "keep the stored ones".
          ...(args.apiKey != null && { apiKey: args.apiKey }),
          ...(args.clientId != null && { clientId: args.clientId }),
          ...(args.clientSecret != null && { clientSecret: args.clientSecret }),
        });

        return formatAccount(updated);
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_delete_mediation_network_account",
        description:
          `${DOMAIN}: permanently remove a network account. Connections using it must be removed ` +
          `first. Requires confirm=true.`,
        product: "publisher",
        annotations: { title: "Delete a mediation account", destructiveHint: true },
      },
      {
        accountId: z.number(),
        confirm: z.literal(true),
      },
      async (args, ctx) => {
        await ctx.pub.deleteMediationAccount(args.accountId);

        return `Account #${args.accountId} removed.`;
      },
    );
  },
};
