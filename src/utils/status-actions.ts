import type { MaterialBulkAction } from "../api/schemas/advertiser.js";

/**
 * `restored` is its own action: unarchiving clears the campaignArchive flag, which
 * `activate` does not touch — it only moves the campaign state.
 */
export const ADV_STATUS_ACTION_MAP = {
  active: "activate",
  paused: "pause",
  archived: "archive",
  restored: "restore",
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

/** Autorule friendly type -> backend typeId (campaign_autorules.typeId). */
export const AUTORULE_TYPE_MAP = { area: 1, campaign: 2, creo: 3, bid: 4 } as const;
export const AUTORULE_TYPE_NAME: Record<number, string> = {
  1: "area",
  2: "campaign",
  3: "creo",
  4: "bid",
};

export function parseCommaSeparatedIds(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

export function requireUniqueIds(ids: number[], entity = "Campaign"): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${entity} identifiers must be unique.`);
  }
}

/**
 * Bulk material actions answer per id, so a 200 does not mean every creative moved.
 * The refused ones are named explicitly — a bare count leaves the agent guessing which
 * creative it still has to deal with.
 */
export function formatMaterialBulkResult(result: MaterialBulkAction, actionLabel: string): string {
  const applied = result.materials.filter((m) => m.success).map((m) => `#${m.id}`);
  const refused = result.materials.filter((m) => !m.success).map((m) => `#${m.id}`);

  const lines = [`${applied.length}/${result.totalMaterials} creatives ${actionLabel}`];
  if (applied.length) lines.push(`Applied: ${applied.join(", ")}`);
  if (refused.length) {
    lines.push(`Not ${actionLabel} (the backend refused it): ${refused.join(", ")}`);
  }

  return lines.join("\n");
}
