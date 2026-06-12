/**
 * Deterministic, environment-independent ordering for reference-resource content.
 * Resource text must be byte-stable across calls/sessions so consumers' prompt
 * caches stay warm; API arrays have no guaranteed order, so we sort before render.
 */

/** Compare dimension ids (number | string). Numbers sort numerically and before strings. */
export function compareId(a: number | string, b: number | string): number {
  const aNum = typeof a === "number" || (a.trim() !== "" && !Number.isNaN(Number(a)));
  const bNum = typeof b === "number" || (b.trim() !== "" && !Number.isNaN(Number(b)));
  if (aNum && bNum) {
    const d = Number(a) - Number(b);
    return d < 0 ? -1 : d > 0 ? 1 : 0;
  }
  if (aNum !== bNum) return aNum ? -1 : 1;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** Return a sorted copy (by id, then label) without mutating the input. */
export function sortById<T extends { id: number | string; label?: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const c = compareId(a.id, b.id);
    if (c !== 0) return c;
    const la = a.label ?? "";
    const lb = b.label ?? "";
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
}
