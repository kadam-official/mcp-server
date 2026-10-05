import { z } from "zod";
import type { ToolWrapper } from "../../middleware/tool-wrapper.js";
import type { ToolModule } from "../../types/tool-module.js";
import type { DictionaryItem } from "../../api/schemas/advertiser.js";
import { CAMPAIGN_TYPE_MAP } from "../../types/advertiser.js";
import { formatEntityList, clampPerPage } from "../../output-formatter.js";

const DICTIONARY_TYPES = [
  "campaign-types",
  "browsers",
  "platforms",
  "devices",
  "connection-types",
  "categories",
  "isps",
  "conversion-templates",
  "countries",
  "regions",
  "cities",
] as const;

/** Dictionaries that are scoped to one country and returned page by page. */
const COUNTRY_SCOPED = ["isps", "regions", "cities"] as const;

/** Dictionaries whose result is paginated and searchable. */
const PAGINATED = ["isps", "regions", "cities"] as const;

const CAMPAIGN_TYPE_NAMES = Object.keys(CAMPAIGN_TYPE_MAP) as [string, ...string[]];

function describeItem(item: DictionaryItem): string {
  const parts = [`[ID: ${item.id}] ${item.label}`];
  if (item.slug != null) parts.push(`slug: ${item.slug}`);
  if (item.countryLabel != null) parts.push(item.countryLabel);
  if (item.geoCountry != null) parts.push(item.geoCountry);
  if (item.isoCode != null) parts.push(item.isoCode);
  if (item.regionId != null) parts.push(`region: ${item.regionId}`);
  // conversion-templates: without the status strings the entry cannot be acted on.
  if (item.approved != null) {
    parts.push(`approved: ${item.approved}`, `hold: ${item.hold}`, `reject: ${item.reject}`);
  }
  return parts.join(" | ");
}

/** Tree dictionaries nest descendants under `children`; render them indented under their parent. */
function formatItem(item: DictionaryItem, index: number, depth = 0): string {
  const bullet = depth === 0 ? `${index + 1}.` : "-";
  const lines = [`${"  ".repeat(depth)}${bullet} ${describeItem(item)}`];

  for (const [childIndex, child] of (item.children ?? []).entries()) {
    lines.push(formatItem(child, childIndex, depth + 1));
  }

  return lines.join("\n");
}

export const dictionariesModule: ToolModule = {
  product: "advertiser",
  register(wrapper: ToolWrapper) {
    wrapper.register(
      {
        name: "kadam_adv_get_dictionary",
        description:
          "Gets one reference dictionary used to build campaign targeting: campaign-types, browsers, platforms (OS), devices, connection-types, categories, isps, conversion-templates, countries, regions or cities. " +
          "Call this instead of guessing IDs — every targeting field expects the numeric ids returned here. " +
          "campaign-types only lists the types this account may actually create. " +
          "categories requires campaignType because the allowed set differs per type. " +
          "isps, regions and cities require countryId, and are paginated and searchable because a single country can hold tens of thousands of entries. " +
          "countries is the entry point of the geo chain: its ids are what a campaign stores in countries and what countryId expects here, while regions and cities give the ids a campaign stores in cities. " +
          "cities can be narrowed to one region with regionId. " +
          "platforms, devices and categories are trees: children are nested under their parent. " +
          "conversion-templates entries carry the approved/hold/reject postback status strings, which are what a campaign's conversion field needs.",
        product: "advertiser",
        annotations: { title: "Get reference dictionary", readOnlyHint: true },
      },
      {
        type: z.enum(DICTIONARY_TYPES).describe("Which dictionary to return"),
        campaignType: z
          .enum(CAMPAIGN_TYPE_NAMES)
          .optional()
          .describe("Required for type=categories; ignored otherwise"),
        countryId: z
          .number()
          .optional()
          .describe("Required for type=isps, regions and cities. Country id from type=countries"),
        regionId: z
          .number()
          .optional()
          .describe("Narrows type=cities to one region; ignored otherwise"),
        search: z
          .string()
          .optional()
          .describe(
            "Substring filter on the entry name; applies to isps, countries, regions, cities",
          ),
        page: z
          .number()
          .optional()
          .default(1)
          .describe("1-based page; applies to isps, regions and cities"),
        perPage: z
          .number()
          .optional()
          .default(50)
          .describe("Page size, max 200; applies to isps, regions and cities"),
      },
      async (args, ctx) => {
        const { type } = args;
        const perPage = clampPerPage(args.perPage, 50, 200);
        // The backend rejects page < 1, so a model asking for page 0 would get a 422 instead of
        // the first page.
        const page = Math.max(1, Math.floor(args.page));
        const params: Record<string, string> = {};

        if (type === "categories") {
          if (args.campaignType == null) {
            throw new Error("campaignType is required for type=categories");
          }
          params.campaignType = String(CAMPAIGN_TYPE_MAP[args.campaignType]);
        }

        const countryScoped = (COUNTRY_SCOPED as readonly string[]).includes(type);
        const paginated = (PAGINATED as readonly string[]).includes(type);

        if (countryScoped) {
          if (args.countryId == null) {
            throw new Error(`countryId is required for type=${type}`);
          }
          params.countryId = String(args.countryId);
        }

        if (type === "cities" && args.regionId != null) {
          params.regionId = String(args.regionId);
        }

        if (paginated) {
          params.page = String(page);
          params.perPage = String(perPage);
        }

        if (args.search != null) params.search = args.search;

        const res = await ctx.adv.getDictionary(type, params);
        const header = `Dictionary "${res.type}"`;

        // Only the paginated dictionaries can return fewer entries than they count, so only
        // they need the pager hint.
        if (paginated) {
          const totalPages = Math.max(1, Math.ceil(res.total / perPage));
          return formatEntityList(res.items, formatItem, header, {
            page,
            totalPages,
            totalRows: res.total,
          });
        }

        return formatEntityList(res.items, formatItem, `${header} (${res.total})`);
      },
    );
  },
};
