export const CAMPAIGN_TYPE_MAP: Record<string, number> = {
  push: 30,
  inpage_push: 100,
  native: 10,
  banner: 20,
  video: 70,
  popunder: 40,
};

export const CAMPAIGN_TYPE_NAME: Record<number, string> = {
  30: "Push",
  100: "In-Page Push",
  10: "Native",
  20: "Banner",
  70: "Video",
  40: "Popunder",
};

export const PRICING_MODEL_MAP: Record<string, number> = {
  cpc: 0,
  cpm: 2,
  cpa_target: 4,
};
