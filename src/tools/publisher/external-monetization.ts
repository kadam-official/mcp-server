import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { formatSingleEntity, truncateOutput } from "../../output-formatter.js";
import type { PubClient } from "../../api/pub-client.js";
import type {
  ExternalConnection,
  ExternalNetwork,
  ExternalNetworkAccount,
  ExternalPlacement,
} from "../../api/schemas/publisher-external-monetization.js";

/** The word the cabinet uses, kept in every description so the model maps the domain. */
const DOMAIN = "External monetization (a.k.a. mediation)";

/** The backend caps the forced share at 50%; say so before it rejects the call. */
const MAX_TEST_SHARE = 50;
const DEFAULT_RETEST_SHARE = 10;

export function formatConnection(c: ExternalConnection): string {
  const test =
    c.testShare > 0
      ? `${c.testShare}% (${c.testState}, ${c.testSlicesPending} of ${c.testSlicesTotal + c.testSlicesPending} slices pending)`
      : "off";

  return formatSingleEntity(`Connection #${c.id}`, [
    ["Ad unit", String(c.blockId)],
    ["Network", String(c.networkId)],
    ["Format", c.format],
    ["Placement", c.extBlockName ? `${c.extBlockId} (${c.extBlockName})` : c.extBlockId],
    ["Account", c.accountId ? String(c.accountId) : undefined],
    ["Active", c.active ? "Yes" : "No"],
    ["Test share", test],
    ["Geo", c.geo.length ? c.geo.join(", ") : "all countries"],
    ["Unique cap", c.uniqCap ? String(c.uniqCap) : "no cap"],
    ["Proxy traffic", c.allowProxy ? "allowed" : "blocked"],
    ["Tag warnings", c.tagWarnings.length ? c.tagWarnings.join(", ") : undefined],
  ]);
}

function formatNetworkLine(
  n: ExternalNetwork,
  account: ExternalNetworkAccount | undefined,
): string {
  const credentials = account
    ? `account #${account.id} "${account.name}"${account.mask ? ` (${account.mask})` : ""}${account.verifiedAt ? "" : ", never verified"}`
    : `no account yet — pass the network API key to connect`;

  return `- ${n.name} (slug: ${n.slug}, id: ${n.id}): ${credentials}`;
}

function formatPlacementLine(p: ExternalPlacement): string {
  const marks = [p.matchesFormat ? "format ok" : null, p.matchesSite ? "same site" : null].filter(
    Boolean,
  );

  return `  - ${p.id}${p.name && p.name !== p.id ? ` "${p.name}"` : ""}${p.site ? ` @ ${p.site}` : ""}${
    marks.length ? ` [${marks.join(", ")}]` : ""
  }`;
}

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
    return (
      picked ??
      `No account #${args.accountId} in ${networkName}. Accounts: ${listAccounts(accounts)}`
    );
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

  return (
    `No account in ${networkName} yet. Repeat this call with the network credentials ` +
    `(${credentialFields.join(" + ") || "apiKey"}); the publisher can dictate them here, ` +
    `or add the account in the cabinet under External monetization.`
  );
}

function listAccounts(accounts: ExternalNetworkAccount[]): string {
  return accounts.map((a) => `#${a.id} "${a.name}"${a.active ? "" : " (disabled)"}`).join(", ");
}

async function resolvePlacement(
  pub: PubClient,
  accountId: number,
  adUnitId: number,
  wanted: string | undefined,
  fresh: boolean,
): Promise<ExternalPlacement | string> {
  const placements = await pub.listExternalPlacements(accountId, adUnitId, fresh);

  if (wanted != null) {
    const needle = wanted.trim().toLowerCase();
    const picked = placements.find(
      (p) => p.id.toLowerCase() === needle || p.name.toLowerCase() === needle,
    );
    return (
      picked ??
      `No placement "${wanted}" on account #${accountId}. Available:\n${placements.map(formatPlacementLine).join("\n")}`
    );
  }

  const fitting = placements.filter((p) => p.matchesFormat);
  if (fitting.length === 1) return fitting[0]!;
  if (fitting.length === 0) {
    return (
      `Account #${accountId} has no placement of this ad unit's format. Create the zone at the ` +
      `network, then repeat with fresh=true. Seen:\n${placements.map(formatPlacementLine).join("\n")}`
    );
  }

  return `Several placements fit — repeat with the placement id:\n${fitting.map(formatPlacementLine).join("\n")}`;
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
          ...(args.testShare != null && { testShare: args.testShare }),
        });

        return `${network.name} connected to ad unit #${args.adUnitId}.\n\n${formatConnection(created)}`;
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

        const updated = await ctx.pub.updateExternalConnection(args.connectionId, {
          ...connectionPayload(current),
          ...(args.geo != null && { geo: args.geo }),
          ...(args.uniqCap != null && { uniqCap: args.uniqCap }),
          ...(args.allowProxy != null && { allowProxy: args.allowProxy }),
          ...(args.tagTemplate != null && { tagTemplate: args.tagTemplate }),
          // The stored name belongs to the previous zone; keeping it would label the new
          // one wrongly, and the backend reads an empty name as "id entered by hand".
          ...(args.placement != null && { extBlockId: args.placement, extBlockName: "" }),
          ...(args.accountId != null && { accountId: args.accountId }),
        });

        return formatConnection(updated);
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_set_external_network_status",
        description:
          `${DOMAIN}: active=serve the network again, paused=stop serving it, retest=restart the ` +
          `forced test share so the predictor can measure the network anew (1-${MAX_TEST_SHARE}%).`,
        product: "publisher",
        annotations: { title: "Set external network connection status", idempotentHint: true },
      },
      {
        adUnitId: z.number(),
        connectionId: z.number(),
        status: z.enum(["active", "paused", "retest"]),
        testShare: z.number().min(1).max(MAX_TEST_SHARE).optional(),
      },
      async (args, ctx) => {
        const current = await findConnection(ctx.pub, args.adUnitId, args.connectionId);
        if (typeof current === "string") return current;

        if (args.status === "retest") {
          const share =
            args.testShare ?? (current.testShare > 0 ? current.testShare : DEFAULT_RETEST_SHARE);
          const retested = await ctx.pub.retestExternalConnection(args.connectionId, share);
          return `Test restarted at ${share}%.\n\n${formatConnection(retested)}`;
        }

        const updated = await ctx.pub.updateExternalConnection(args.connectionId, {
          ...connectionPayload(current),
          active: args.status === "active",
        });

        return `Connection #${args.connectionId} is now ${args.status}.\n\n${formatConnection(updated)}`;
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

    wrapper.register(
      {
        name: "kadam_pub_update_external_network_account",
        description:
          `${DOMAIN}: rotate the API key of a network account, rename it, or disable it. Pass a ` +
          `key only when the publisher dictates a new one; never ask them to read back an ` +
          `existing key — the API returns only a mask of it.`,
        product: "publisher",
        annotations: { title: "Update an external network account", readOnlyHint: false },
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
        const updated = await ctx.pub.updateExternalNetworkAccount(args.accountId, {
          ...(args.name != null && { name: args.name }),
          ...(args.apiKey != null && { apiKey: args.apiKey }),
          ...(args.clientId != null && { clientId: args.clientId }),
          ...(args.clientSecret != null && { clientSecret: args.clientSecret }),
          ...(args.active != null && { active: args.active }),
        });

        return formatSingleEntity(`Account #${updated.id}`, [
          ["Name", updated.name],
          ["Network", String(updated.networkId)],
          ["Key", updated.mask ?? "—"],
          ["Active", updated.active ? "Yes" : "No"],
          ["Verified", updated.verifiedAt ? "Yes" : "No"],
          ["Last error", updated.lastError ?? undefined],
          ["Connections using it", String(updated.placementsInUse)],
        ]);
      },
    );

    wrapper.register(
      {
        name: "kadam_pub_delete_external_network_account",
        description:
          `${DOMAIN}: permanently remove a network account. Connections using it must be removed ` +
          `first. Requires confirm=true.`,
        product: "publisher",
        annotations: { title: "Delete an external network account", destructiveHint: true },
      },
      {
        accountId: z.number(),
        confirm: z.literal(true),
      },
      async (args, ctx) => {
        await ctx.pub.deleteExternalNetworkAccount(args.accountId);
        return `Account #${args.accountId} removed.`;
      },
    );
  },
};

/**
 * PUT replaces the row, so an edit has to start from the current state or every field the
 * caller left alone is reset to its default. The API lists connections per ad unit, which
 * is why these tools take the ad unit too — both ids are in the listing output.
 */
async function findConnection(
  pub: PubClient,
  adUnitId: number,
  connectionId: number,
): Promise<ExternalConnection | string> {
  const connections = await pub.listExternalConnections(adUnitId);
  const found = connections.find((c) => c.id === connectionId);
  if (found) return found;

  return (
    `Ad unit #${adUnitId} has no connection #${connectionId}. ` +
    `Present: ${connections.map((c) => `#${c.id}`).join(", ") || "none"}.`
  );
}

function connectionPayload(c: ExternalConnection): Record<string, unknown> {
  return {
    blockId: c.blockId,
    networkId: c.networkId,
    accountId: c.accountId,
    extBlockId: c.extBlockId,
    extBlockName: c.extBlockName ?? "",
    tagTemplate: c.tagTemplate ?? "",
    uniqCap: c.uniqCap,
    allowProxy: c.allowProxy,
    geo: c.geo,
    active: c.active,
    testShare: c.testShare,
  };
}
