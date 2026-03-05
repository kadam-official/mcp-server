const UNSET = Symbol("unset");

export function cacheOnce<T>(loader: () => Promise<T>): () => Promise<T> {
  let cached: T | typeof UNSET = UNSET;
  return async () => {
    if (cached !== UNSET) return cached;
    cached = await loader();
    return cached;
  };
}
