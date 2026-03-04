export function cacheOnce<T>(loader: () => Promise<T>): () => Promise<T> {
  let cached: T | null = null;
  return async () => {
    if (cached) return cached;
    cached = await loader();
    return cached;
  };
}
