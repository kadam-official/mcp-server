export const ADV_STATUS_ACTION_MAP = {
  active: "activate",
  paused: "pause",
  archived: "archive",
} as const;

/**
 * Maps the friendly list-filter status to the Advertiser API v1 campaigns `filters` shape.
 * active/paused/moderation map to campaign state codes in `statuses`; "archived" is a
 * separate archive flag (campaignArchive), not a state, so it sets `archive: 1` instead.
 */
export const CAMPAIGN_LIST_STATUS_FILTER: Record<string, { statuses?: number[]; archive?: 1 }> = {
  active: { statuses: [10] },
  paused: { statuses: [0] },
  moderation: { statuses: [200] },
  archived: { archive: 1 },
};

/**
 * Same idea for materials (creatives). Material state codes differ from campaigns:
 * active=10, paused=80, on-moderation=0 (the backend auto-pairs 5), blocked=20.
 * "archived" is the archive flag, not a state.
 */
export const MATERIAL_LIST_STATUS_FILTER: Record<string, { statuses?: number[]; archive?: 1 }> = {
  active: { statuses: [10] },
  paused: { statuses: [80] },
  moderation: { statuses: [0, 5] },
  blocked: { statuses: [20] },
  archived: { archive: 1 },
};

export function parseCommaSeparatedIds(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}
