export const ADV_STATUS_ACTION_MAP = {
  active: "activate",
  paused: "pause",
  archived: "archive",
} as const;

export function parseCommaSeparatedIds(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}
