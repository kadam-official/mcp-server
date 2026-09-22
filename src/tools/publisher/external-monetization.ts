import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { truncateOutput } from "../../output-formatter.js";
import type { PubClient } from "../../api/pub-client.js";
import type {
  ExternalNetworkAccount,
  ExternalPlacement,
} from "../../api/schemas/publisher-external-monetization.js";
import {
  DEFAULT_RETEST_SHARE,
  DOMAIN,
  MAX_TEST_SHARE,
  connectionPayload,
  credentialArgNames,
  findConnection,
  formatConnection,
  formatNetworkLine,
  listAccounts,
  resolvePlacement,
} from "./external-monetization-shared.js";

/**
 * The publisher names a network; everything the API needs to create a connection is
 * resolved here rather than in the model's context. Each fork returns the next step as
 * text instead of an error — that is what lets the agent finish in one more call.
 */
async function resolveAccount(
  pub: PubClient,
  networkId: number,
  networkName: string,
  args: {
    accountId?: number;
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    accountName?: string;
  },
  credentialFields: string[],
): Promise<ExternalNetworkAccount | string> {
  const accounts = await pub.listExternalNetworkAccounts(networkId);

  if (args.accountId != null) {
    const picked = accounts.find((a) => a.id === args.accountId);
    if (!picked) {
      return `No account #${args.accountId} in ${networkName}. Accounts: ${listAccounts(accounts) || "none"}`;
    }
    if (!picked.active) {
      return `Account #${picked.id} "${picked.name}" is disabled — enable it with kadam_pub_update_external_network_account(active: true).`;
    }

    return picked;
  }

  const hasCredentials = Boolean(args.apiKey ?? args.clientId ?? args.clientSecret);
  if (hasCredentials) {
    // A second account under the default name collides with the network's unique name
    // per owner, so say which of the two the publisher meant instead of provoking a 409.
    if (accounts.length > 0 && args.accountName == null) {
      return (
        `${networkName} already has an account (${listAccounts(accounts)}). To replace its key ` +
        `use kadam_pub_update_external_network_account; to add a second account repeat this ` +
        `call with accountName.`
      );
    }

    return pub.createExternalNetworkAccount({
      networkId,
      name: args.accountName ?? `${networkName} account`,
      ...(args.apiKey != null && { apiKey: args.apiKey }),
      ...(args.clientId != null && { clientId: args.clientId }),
      ...(args.clientSecret != null && { clientSecret: args.clientSecret }),
    });
  }

  const usable = accounts.filter((a) => a.active);
  if (usable.length === 1) return usable[0]!;
  if (usable.length > 1) {
    return `${networkName} has several accounts — repeat with accountId: ${listAccounts(usable)}`;
  }

  // Disabled rows are not "no account": minting another key collides on the default name.
  if (accounts.length > 0) {
    return (
      `Every ${networkName} account is disabled (${listAccounts(accounts)}). Enable one with ` +
      `kadam_pub_update_external_network_account(active: true), or pass accountId to pick it.`
    );
  }

  return (
    `No account in ${networkName} yet. Repeat this call with the network credentials ` +
    `(${credentialArgNames(credentialFields)}); the publisher can dictate them here, ` +
    `or add the account in the cabinet under External monetization.`
  );
}

/** Zones of some networks carry their own code; an empty tag falls back to the network default. */
function tagOf(placement: ExternalPlacement): Record<string, unknown> {
  const tag = placement.tag?.trim();

  return tag ? { tagTemplate: tag } : {};
}

function siteNote(placement: ExternalPlacement): string {
  return placement.matchesSite || !placement.site
    ? ""
    : ` The zone is registered at the network under ${placement.site}; check it is this ad unit's site.`;
}

export const externalMonetizationModule: ToolModule = {
  product: "publisher",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_pub_list_external_networks",
        description:
          `${DOMAIN}: outside ad networks the publisher can sell through. Without adUnitId — the ` +
          `whole catalog and which networks already have an account. With adUnitId — only the ` +
          `networks serving that ad unit's format, plus what is already connected to it.`,
        product: "publisher",
        annotations: { title: "List external monetization networks", readOnlyHint: true },
      },
      {
        adUnitId: z.number().optional(),
      },
      async (args, ctx) => {
        const accounts = await ctx.pub.listExternalNetworkAccounts();
        const byNetwork = new Map<number, ExternalNetworkAccount>();
        for (const a of accounts) {
          if (!byNetwork.has(a.networkId) || a.active) byNetwork.set(a.networkId, a);
        }

        if (args.adUnitId == null) {
          const networks = await ctx.pub.listExternalNetworks();

          return truncateOutput(
            [
              "External monetization networks",
              "",
              ...networks.map((n) => formatNetworkLine(n, byNetwork.get(n.id))),
              "",
              "Connect one with kadam_pub_connect_external_network(adUnitId, network).",
            ].join("\n"),
          );
        }

        const [options, connections] = await Promise.all([
          ctx.pub.getExternalMonetizationOptions(args.adUnitId),
          ctx.pub.listExternalConnections(args.adUnitId),
        ]);

        const lines = [
          `External monetization for ad unit #${args.adUnitId}`,
          "",
          "Networks serving this format:",
          ...options.networks.map((n) => formatNetworkLine(n, byNetwork.get(n.id))),
          "",
          connections.length ? "Already connected:" : "Nothing connected yet.",
          ...connections.map(
            (c) =>
              `- connection #${c.id}: network ${c.networkId}, placement ${c.extBlockId}, ` +
              `${c.active ? "active" : "paused"}, test ${c.testShare > 0 ? `${c.testShare}% (${c.testState})` : "off"}` +
              `${c.tagWarnings.length ? `, warnings: ${c.tagWarnings.join(", ")}` : ""}`,
          ),
        ];

        return truncateOutput(lines.join("\n"));
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_connect_external_network",
        description:
          `${DOMAIN}: attach an outside network to an ad unit in one call. Resolves the network, ` +
          `the publisher's account in it and the placement (zone) on its own; when a choice is ` +
          `ambiguous it answers with the candidates instead of guessing. If there is no account ` +
          `yet, pass the network credentials the publisher gives you — never ask them to reveal ` +
          `a key that already exists, the API only ever returns a mask.`,
        product: "publisher",
        annotations: { title: "Connect an external network", readOnlyHint: false },
      },
      {
        adUnitId: z.number(),
        network: z.string().min(1),
        placement: z.string().optional(),
        accountId: z.number().optional(),
        apiKey: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        accountName: z.string().max(64).optional(),
        testShare: z.number().min(0).max(MAX_TEST_SHARE).optional(),
        fresh: z.boolean().optional().default(false),
      },
      async (args, ctx) => {
        const options = await ctx.pub.getExternalMonetizationOptions(args.adUnitId);
        const needle = args.network.trim().toLowerCase();
        const network = options.networks.find(
          (n) => n.slug.toLowerCase() === needle || n.name.toLowerCase() === needle,
        );
        if (!network) {
          return (
            `No network "${args.network}" serves ad unit #${args.adUnitId}. Available: ` +
            options.networks.map((n) => `${n.name} (${n.slug})`).join(", ")
          );
        }

        const account = await resolveAccount(
          ctx.pub,
          network.id,
          network.name,
          args,
          network.credentialFields,
        );
        if (typeof account === "string") return account;

        const placement = await resolvePlacement(
          ctx.pub,
          account.id,
          args.adUnitId,
          args.placement,
          args.fresh,
        );
        if (typeof placement === "string") return placement;

        const created = await ctx.pub.createExternalConnection({
          blockId: args.adUnitId,
          networkId: network.id,
          accountId: account.id,
          extBlockId: placement.id,
          extBlockName: placement.name,
          // Networks that mint a per-zone code report it here; without it the connection
          // would either be refused or serve the network's generic default.
          ...tagOf(placement),
          ...(args.testShare != null && { testShare: args.testShare }),
        });

        return (
          `${network.name} connected to ad unit #${args.adUnitId}.${siteNote(placement)}\n\n` +
          formatConnection(created)
        );
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_update_external_network",
        description:
          `${DOMAIN}: change an existing connection — geo, unique cap, proxy traffic, tag ` +
          `template, placement or account. Only the fields you pass change.`,
        product: "publisher",
        annotations: { title: "Update an external network connection", readOnlyHint: false },
      },
      {
        adUnitId: z.number(),
        connectionId: z.number(),
        geo: z.array(z.number()).optional(),
        uniqCap: z.number().min(0).optional(),
        allowProxy: z.boolean().optional(),
        tagTemplate: z.string().max(2048).optional(),
        placement: z.string().optional(),
        accountId: z.number().optional(),
      },
      async (args, ctx) => {
        const current = await findConnection(ctx.pub, args.adUnitId, args.connectionId);
        if (typeof current === "string") return current;

        // A zone is identified by its id; the catalog also prints a name, so what the
        // publisher says has to be resolved the same way as on connect.
        let placement: ExternalPlacement | undefined;
        if (args.placement != null) {
          const resolved = await resolvePlacement(
            ctx.pub,
            args.accountId ?? current.accountId,
            args.adUnitId,
            args.placement,
            false,
          );
          if (typeof resolved === "string") return resolved;
          placement = resolved;
        }

        const updated = await ctx.pub.updateExternalConnection(args.connectionId, {
          ...connectionPayload(current),
          ...(args.geo != null && { geo: args.geo }),
          ...(args.uniqCap != null && { uniqCap: args.uniqCap }),
          ...(args.allowProxy != null && { allowProxy: args.allowProxy }),
          ...(args.tagTemplate != null && { tagTemplate: args.tagTemplate }),
          ...(placement != null && {
            extBlockId: placement.id,
            extBlockName: placement.name,
            ...(args.tagTemplate == null ? tagOf(placement) : {}),
          }),
          ...(args.accountId != null && { accountId: args.accountId }),
        });

        return formatConnection(updated);
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_set_external_network_status",
        description:
          `${DOMAIN}: active=serve the network again, paused=stop serving it. To re-measure a ` +
          `network use kadam_pub_retest_external_network.`,
        product: "publisher",
        annotations: { title: "Set external network connection status", idempotentHint: true },
      },
      {
        adUnitId: z.number(),
        connectionId: z.number(),
        status: z.enum(["active", "paused"]),
      },
      async (args, ctx) => {
        const current = await findConnection(ctx.pub, args.adUnitId, args.connectionId);
        if (typeof current === "string") return current;

        const updated = await ctx.pub.updateExternalConnection(args.connectionId, {
          ...connectionPayload(current),
          active: args.status === "active",
        });

        return `Connection #${args.connectionId} is now ${args.status}.\n\n${formatConnection(updated)}`;
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_retest_external_network",
        description:
          `${DOMAIN}: restart the forced test share (1-${MAX_TEST_SHARE}%) so the predictor can ` +
          `measure what the network really pays. Every call starts a new measurement epoch, so ` +
          `it is not a repeatable no-op; the previous test's progress is discarded.`,
        product: "publisher",
        annotations: { title: "Restart an external network test", readOnlyHint: false },
      },
      {
        adUnitId: z.number(),
        connectionId: z.number(),
        testShare: z.number().min(1).max(MAX_TEST_SHARE).optional(),
      },
      async (args, ctx) => {
        const current = await findConnection(ctx.pub, args.adUnitId, args.connectionId);
        if (typeof current === "string") return current;

        const share =
          args.testShare ?? (current.testShare > 0 ? current.testShare : DEFAULT_RETEST_SHARE);
        const retested = await ctx.pub.retestExternalConnection(args.connectionId, share);

        return `Test restarted at ${share}%.\n\n${formatConnection(retested)}`;
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_disconnect_external_network",
        description:
          `${DOMAIN}: permanently remove a connection between an ad unit and a network. The ad ` +
          `unit keeps serving Kadam demand. Requires confirm=true.`,
        product: "publisher",
        annotations: { title: "Disconnect an external network", destructiveHint: true },
      },
      {
        connectionId: z.number(),
        confirm: z.literal(true),
      },
      async (args, ctx) => {
        await ctx.pub.deleteExternalConnection(args.connectionId);

        return `Connection #${args.connectionId} removed.`;
      },
    );
  },
};
