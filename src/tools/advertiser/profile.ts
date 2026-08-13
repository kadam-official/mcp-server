import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import type { AccountProfile } from "../../api/schemas/advertiser.js";
import { formatSingleEntity } from "../../output-formatter.js";

const CURRENCY_SYMBOL: Record<string, string> = {
  rub: "₽",
  usd: "$",
  eur: "€",
  uah: "₴",
  kzt: "₸",
};

function formatDayLimit(dayLimit: number, currency: string): string {
  if (dayLimit <= 0) {
    return "unlimited";
  }
  const sym = CURRENCY_SYMBOL[currency] ?? currency;
  return `${sym}${dayLimit}`;
}

function formatProfile(profile: AccountProfile): string {
  const sym = CURRENCY_SYMBOL[profile.currency] ?? profile.currency;
  return formatSingleEntity("Advertiser Account", [
    ["Id", String(profile.id)],
    ["Balance", `${sym}${profile.balance}`],
    ["Currency", profile.currency],
    ["Registered at", profile.registeredAt],
    ["Timezone", profile.timezone],
    ["Day limit", formatDayLimit(profile.dayLimit, profile.currency)],
  ]);
}

export const profileModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_get_account",
        description:
          "Gets the current advertiser account profile: id, balance, currency, registration date, timezone, and daily spend limit. Does not return email or name.",
        product: "advertiser",
        annotations: { title: "Get advertiser account profile", readOnlyHint: true },
      },
      {},
      async (_args, ctx) => {
        const profile = await ctx.adv.getAccountProfile();
        return formatProfile(profile);
      },
    );

    wrapper.register(
      {
        name: "kadam_adv_get_balance",
        description:
          "Lightweight current advertiser balance and currency. Use for alerts and balance checks; prefer this over kadam_adv_get_account or finance operations when you only need the balance.",
        product: "advertiser",
        annotations: { title: "Get advertiser balance", readOnlyHint: true },
      },
      {},
      async (_args, ctx) => {
        const { balance, currency } = await ctx.adv.getAccountBalance();
        const sym = CURRENCY_SYMBOL[currency] ?? currency;
        return formatSingleEntity("Advertiser Balance", [
          ["Balance", `${sym}${balance}`],
          ["Currency", currency],
        ]);
      },
    );
  },
};
