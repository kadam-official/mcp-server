import { describe, it, expect } from "vitest";
import { buildCampaignTypesContent } from "../../src/resources/campaign-types.js";
import { buildCategoriesContent } from "../../src/resources/categories.js";
import { buildPricingModelsContent } from "../../src/resources/pricing-models.js";
import { getCreativeFormatsContent } from "../../src/resources/creative-formats.js";
import type { OptionsRegistry } from "../../src/api/options-registry.js";

// A registry whose API arrays come back in arbitrary order; resource text must
// be byte-identical regardless of that order (prompt-cache friendliness).
function campaignRegistry(cpTypes: unknown[], categories: unknown[]): OptionsRegistry {
  return {
    getCampaignOptions: async () => ({
      cpTypes,
      categories,
      subAges: [],
      options: { allowAgeSelection: true, allowGenderSelection: false },
    }),
  } as unknown as OptionsRegistry;
}

function materialRegistry(sizes: unknown[]): OptionsRegistry {
  return {
    getMaterialOptions: async () => ({ sizes }),
  } as unknown as OptionsRegistry;
}

const CP_ORDER_A = [
  { id: 0, label: "CPC" },
  { id: 2, label: "CPM" },
  { id: 4, label: "CPA Target" },
];
const CP_ORDER_B = [
  { id: 4, label: "CPA Target" },
  { id: 0, label: "CPC" },
  { id: 2, label: "CPM" },
];

const CATS_A = [
  {
    id: 1,
    label: "News",
    children: [
      { id: 11, label: "Sports" },
      { id: 12, label: "World" },
    ],
  },
  { id: 2, label: "Tech" },
  { id: "mainstream", label: "Mainstream" },
];
const CATS_B = [
  { id: "mainstream", label: "Mainstream" },
  { id: 2, label: "Tech" },
  {
    id: 1,
    label: "News",
    children: [
      { id: 12, label: "World" },
      { id: 11, label: "Sports" },
    ],
  },
];

const SIZES_A = [
  { id: 5, label: "300x250", width: 300, height: 250 },
  { id: 1, label: "728x90", width: 728, height: 90 },
  { id: 3, label: "Native", width: 0, height: 0 },
];
const SIZES_B = [SIZES_A[2], SIZES_A[0], SIZES_A[1]];

describe("reference resource determinism (shuffle-independent)", () => {
  it("campaign-types content is identical regardless of API array order", async () => {
    const a = await buildCampaignTypesContent(campaignRegistry(CP_ORDER_A, CATS_A));
    const b = await buildCampaignTypesContent(campaignRegistry(CP_ORDER_B, CATS_B));
    expect(a).toBe(b);
  });

  it("categories tree content is identical regardless of category/children order", async () => {
    const a = await buildCategoriesContent(campaignRegistry(CP_ORDER_A, CATS_A));
    const b = await buildCategoriesContent(campaignRegistry(CP_ORDER_B, CATS_B));
    expect(a).toBe(b);
    // the full nested tree lives here, not in campaign-types
    expect(a).toContain("Sports");
  });

  it("pricing-models content is identical regardless of cpTypes order", async () => {
    const a = await buildPricingModelsContent(campaignRegistry(CP_ORDER_A, []));
    const b = await buildPricingModelsContent(campaignRegistry(CP_ORDER_B, []));
    expect(a).toBe(b);
  });

  it("creative-formats sizes are identical regardless of order", async () => {
    const a = await getCreativeFormatsContent(materialRegistry(SIZES_A));
    const b = await getCreativeFormatsContent(materialRegistry(SIZES_B));
    expect(a).toBe(b);
  });
});

describe("categories resource static-mode fallback", () => {
  it("returns an ID-focused hint when no registry is available", async () => {
    const text = await buildCategoriesContent(null);
    expect(text).toContain("static mode");
    expect(text).toContain("numeric category IDs");
    expect(text).not.toContain("resolve server-side");
  });
});
