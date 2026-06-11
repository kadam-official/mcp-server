import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import { CAMPAIGN_TYPE_NAME } from "../../types/advertiser.js";
import type { OptionsRegistry, DictItem, DeviceItem } from "../../api/options-registry.js";

const PRICING_MODEL_NAME: Record<number, string> = {
  0: "CPC",
  2: "CPM",
  4: "CPA Target",
};

const CONNECTION_TYPE_NAME: Record<number, string> = {
  1: "WiFi",
  2: "Cellular",
  3: "All",
};

/** Keys rendered by the dedicated sections below; everything else goes to the raw tail. */
const HANDLED_KEYS = new Set([
  "id",
  "name",
  "url",
  "folderId",
  "type",
  "cpType",
  "status",
  "state",
  "bids",
  "dayMoneyLimit",
  "commonMoneyLimit",
  "isEvenDistribution",
  "dayClickLimit",
  "dayConversionsLimit",
  "totalLossLimit",
  "materialViews",
  "campaignView",
  "startDate",
  "stopDate",
  "timezone",
  "time",
  "devices",
  "platformVersions",
  "browsers",
  "languages",
  "connectionType",
  "categories",
  "audiences",
  "sites",
  "ssps",
  "disableProxy",
  "impTracker",
  "isNeedSecondPush",
  "isPauseAfterModerate",
  "conversion",
  "postConversion",
]);

interface LabelMaps {
  device: Map<number, string>;
  platform: Map<number, string>;
  browser: Map<number, string>;
  language: Map<number, string>;
  country: Map<number, string>;
}

function buildIdLabelMap(items: DictItem[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const item of items) {
    const id = typeof item.id === "number" ? item.id : parseInt(String(item.id), 10);
    if (!isNaN(id)) map.set(id, item.label);
  }
  return map;
}

function flattenDeviceItems(devices: DeviceItem[]): DictItem[] {
  const result: DictItem[] = [];
  for (const d of devices) {
    result.push({ id: d.id, label: d.label });
    for (const child of d.children ?? []) {
      result.push({ id: child.id, label: child.label });
    }
  }
  return result;
}

/**
 * Build id->label maps from campaign options + the country map. Best-effort:
 * if options can't be fetched (unknown type, API error) returns empty maps and
 * the formatter falls back to raw IDs.
 */
async function buildLabelMaps(registry: OptionsRegistry, typeId: unknown): Promise<LabelMaps> {
  const empty: LabelMaps = {
    device: new Map(),
    platform: new Map(),
    browser: new Map(),
    language: new Map(),
    country: new Map(),
  };
  try {
    const country = new Map<number, string>();
    for (const [iso, id] of await registry.getCountryMap()) {
      country.set(id, iso);
    }
    if (typeof typeId !== "number") return { ...empty, country };

    const opts = await registry.getCampaignOptions(typeId);
    return {
      device: buildIdLabelMap(flattenDeviceItems(opts.devices)),
      platform: buildIdLabelMap(opts.platformVersions),
      browser: buildIdLabelMap(opts.browsers),
      language: buildIdLabelMap(opts.languages),
      country,
    };
  } catch {
    return empty;
  }
}

function labelList(ids: unknown, map: Map<number, string>): string | null {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  return ids
    .map((id) => {
      const label = typeof id === "number" ? map.get(id) : undefined;
      return label ? `${label} (${id})` : String(id);
    })
    .join(", ");
}

function formatHours(hours: number[]): string {
  if (hours.length === 24) return "0-23 (all day)";
  // Compress consecutive hours into ranges, e.g. 9,10,11,15 -> "9-11, 15".
  const sorted = [...hours].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;
  for (const h of sorted.slice(1)) {
    if (h === prev + 1) {
      prev = h;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = h;
    prev = h;
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return parts.join(", ");
}

function summarizeSchedule(time: unknown): string | null {
  if (time == null || typeof time !== "object") return null;
  const list = (time as { list?: Array<{ day: number; hours: number[] }> }).list;
  if (!Array.isArray(list) || list.length === 0) return null;

  const allDay = list.every((d) => Array.isArray(d.hours) && d.hours.length === 24);
  if (list.length === 7 && allDay) return "24/7 (all days, all hours)";

  const first = JSON.stringify([...(list[0]?.hours ?? [])].sort((a, b) => a - b));
  const sameHours = list.every(
    (d) => JSON.stringify([...(d.hours ?? [])].sort((a, b) => a - b)) === first,
  );
  if (list.length === 7 && sameHours) {
    return `All week, hours: ${formatHours(list[0]!.hours ?? [])}`;
  }
  return list.map((d) => `day ${d.day}: ${formatHours(d.hours ?? [])}`).join("; ");
}

function formatCap(cap: unknown, label: string): string | null {
  if (cap == null || typeof cap !== "object") return null;
  const { count, days } = cap as { count?: number; days?: number };
  if (!count) return null;
  return `${label}: ${count} views per ${days ?? 0} day(s)`;
}

function jsonCompact(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function formatCampaignDetail(
  c: Record<string, unknown>,
  registry: OptionsRegistry,
): Promise<string> {
  const maps = await buildLabelMaps(registry, c.type);
  const out: string[] = [];
  const push = (line: string | null | undefined) => {
    if (line) out.push(line);
  };

  // Main
  const typeName =
    typeof c.type === "number" ? (CAMPAIGN_TYPE_NAME[c.type] ?? `type ${c.type}`) : undefined;
  const pricing =
    typeof c.cpType === "number"
      ? (PRICING_MODEL_NAME[c.cpType] ?? `cpType ${c.cpType}`)
      : undefined;
  push(`Campaign [ID: ${c.id}] "${c.name}"`);
  push(c.url != null ? `URL: ${c.url}` : null);
  push(typeName ? `Type: ${typeName}` : null);
  push(pricing ? `Pricing model: ${pricing}` : null);
  push(c.folderId != null ? `Folder: #${c.folderId}` : null);
  push(c.status != null ? `Status: ${jsonCompact(c.status)}` : null);
  push(c.state != null ? `State: ${jsonCompact(c.state)}` : null);

  // Bids
  if (Array.isArray(c.bids) && c.bids.length > 0) {
    out.push("", "## Bids");
    for (const entry of c.bids as Array<Record<string, unknown>>) {
      const amount =
        entry.bid != null && Number(entry.bid) !== 0
          ? `bid ${entry.bid}`
          : `target CPA ${entry.leadCost}`;
      const countries = labelList(entry.countries, maps.country) ?? "all";
      out.push(`- ${amount} | countries: ${countries}`);
    }
  }

  // Budget / limits
  const budget: string[] = [];
  if (c.dayMoneyLimit != null) budget.push(`Daily budget: ${c.dayMoneyLimit}`);
  if (c.commonMoneyLimit != null && Number(c.commonMoneyLimit) !== 0)
    budget.push(`Total budget: ${c.commonMoneyLimit}`);
  if (c.isEvenDistribution != null)
    budget.push(`Even distribution: ${c.isEvenDistribution ? "yes" : "no"}`);
  if (c.dayClickLimit != null && Number(c.dayClickLimit) !== 0)
    budget.push(`Daily click limit: ${c.dayClickLimit}`);
  if (c.dayConversionsLimit != null && Number(c.dayConversionsLimit) !== 0)
    budget.push(`Daily conversions limit: ${c.dayConversionsLimit}`);
  if (c.totalLossLimit != null && Number(c.totalLossLimit) !== 0)
    budget.push(`Total loss limit: ${c.totalLossLimit}`);
  if (budget.length > 0) out.push("", "## Budget & limits", ...budget.map((l) => `- ${l}`));

  // Caps
  const caps = [
    formatCap(c.materialViews, "Creative frequency cap"),
    formatCap(c.campaignView, "Campaign frequency cap"),
  ].filter(Boolean) as string[];
  if (caps.length > 0) out.push("", "## Frequency caps", ...caps.map((l) => `- ${l}`));

  // Schedule / dates
  const sched: string[] = [];
  if (c.startDate != null) sched.push(`Start date: ${c.startDate}`);
  if (c.stopDate != null) sched.push(`End date: ${c.stopDate}`);
  if (c.timezone != null)
    sched.push(`Timezone: UTC${Number(c.timezone) >= 0 ? "+" : ""}${c.timezone}`);
  const schedule = summarizeSchedule(c.time);
  if (schedule) sched.push(`Schedule: ${schedule}`);
  if (sched.length > 0) out.push("", "## Schedule", ...sched.map((l) => `- ${l}`));

  // Targeting
  const targeting: string[] = [];
  const devices = labelList(c.devices, maps.device);
  if (devices) targeting.push(`Devices: ${devices}`);
  const platforms = labelList(c.platformVersions, maps.platform);
  if (platforms) targeting.push(`OS: ${platforms}`);
  const browsers = labelList(c.browsers, maps.browser);
  if (browsers) targeting.push(`Browsers: ${browsers}`);
  const languages = labelList(c.languages, maps.language);
  if (languages) targeting.push(`Languages: ${languages}`);
  if (typeof c.connectionType === "number")
    targeting.push(`Connection: ${CONNECTION_TYPE_NAME[c.connectionType] ?? c.connectionType}`);
  if (Array.isArray(c.categories) && c.categories.length > 0)
    targeting.push(`Categories: ${(c.categories as unknown[]).join(", ")}`);
  if (c.audiences != null && typeof c.audiences === "object") {
    const aud = c.audiences as { include?: unknown[]; exclude?: unknown[] };
    if (Array.isArray(aud.include) && aud.include.length > 0)
      targeting.push(`Audiences include: ${aud.include.join(", ")}`);
    if (Array.isArray(aud.exclude) && aud.exclude.length > 0)
      targeting.push(`Audiences exclude: ${aud.exclude.join(", ")}`);
  }
  if (c.sites != null && typeof c.sites === "object") {
    const sites = c.sites as { mode?: number; list?: unknown[] };
    if (Array.isArray(sites.list) && sites.list.length > 0)
      targeting.push(
        `Sites ${sites.mode === 1 ? "whitelist" : "blacklist"}: ${sites.list.join(", ")}`,
      );
  }
  if (c.ssps != null && typeof c.ssps === "object") {
    const ssps = c.ssps as { mode?: unknown; list?: unknown[] };
    if (Array.isArray(ssps.list) && ssps.list.length > 0)
      targeting.push(`SSP ${ssps.mode ? "whitelist" : "blacklist"}: ${ssps.list.join(", ")}`);
  }
  if (c.disableProxy != null) targeting.push(`Proxy/VPN blocked: ${c.disableProxy ? "yes" : "no"}`);
  if (c.impTracker) targeting.push(`Impression tracker: ${c.impTracker}`);
  if (c.isNeedSecondPush != null)
    targeting.push(`Second push: ${c.isNeedSecondPush ? "yes" : "no"}`);
  if (c.isPauseAfterModerate != null)
    targeting.push(`Pause after moderation: ${c.isPauseAfterModerate ? "yes" : "no"}`);
  if (targeting.length > 0) out.push("", "## Targeting", ...targeting.map((l) => `- ${l}`));

  // Conversion
  const conv: string[] = [];
  if (c.conversion != null && typeof c.conversion === "object") {
    const cv = c.conversion as Record<string, unknown>;
    conv.push(
      `Acceptance: template #${cv.id ?? 0} | approved: "${cv.approved ?? ""}" | hold: "${cv.hold ?? ""}" | reject: "${cv.reject ?? ""}"`,
    );
  }
  if (c.postConversion != null && typeof c.postConversion === "object") {
    const pc = c.postConversion as Record<string, unknown>;
    const parts: string[] = [];
    if (pc.windowLengthPostView != null) parts.push(`post-view window ${pc.windowLengthPostView}h`);
    if (pc.windowLengthPostClick != null)
      parts.push(`post-click window ${pc.windowLengthPostClick}h`);
    if (pc.countFirstConversionOnly != null)
      parts.push(`first conversion only: ${pc.countFirstConversionOnly ? "yes" : "no"}`);
    if (pc.countLastCampaignOnly != null)
      parts.push(`last campaign only: ${pc.countLastCampaignOnly ? "yes" : "no"}`);
    if (pc.postClickAttrPriority != null)
      parts.push(`post-click priority: ${pc.postClickAttrPriority ? "yes" : "no"}`);
    if (Array.isArray(pc.audiences) && pc.audiences.length > 0)
      parts.push(`retarget audiences: ${pc.audiences.join(", ")}`);
    if (parts.length > 0) conv.push(`Attribution: ${parts.join(" | ")}`);
  }
  if (conv.length > 0) out.push("", "## Conversion", ...conv.map((l) => `- ${l}`));

  // Raw tail: any fields not covered above, so the output is genuinely complete
  // even when the API adds new fields.
  const rest = Object.entries(c).filter(([key, value]) => !HANDLED_KEYS.has(key) && value != null);
  if (rest.length > 0) {
    out.push("", "## Other fields");
    for (const [key, value] of rest) {
      out.push(`- ${key}: ${jsonCompact(value)}`);
    }
  }

  return out.join("\n");
}

export const campaignDetailModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_get_campaign",
        description:
          "Get full campaign configuration by ID, including landing page URL, bids per country, " +
          "budgets, targeting (devices, OS, browsers, languages, sites, SSPs, audiences), " +
          "frequency caps, schedule, and conversion settings. " +
          "Use after kadam_adv_list_campaigns to inspect one campaign in detail.",
        product: "advertiser",
        annotations: { title: "Get campaign", readOnlyHint: true },
      },
      {
        id: z.number().describe("Campaign ID"),
      },
      async (args, ctx) => {
        const campaign = await ctx.adv.getCampaign(args.id);
        return formatCampaignDetail(campaign, ctx.adv.options);
      },
    );
  },
};
