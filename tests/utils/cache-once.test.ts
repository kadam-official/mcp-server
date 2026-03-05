import { cacheOnce } from "../../src/utils/cache-once.js";

describe("cacheOnce", () => {
  it("calls loader only once and caches the result", async () => {
    const loader = vi.fn().mockResolvedValue({ data: "test" });
    const cached = cacheOnce(loader);

    const first = await cached();
    const second = await cached();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ data: "test" });
    expect(second).toBe(first);
  });

  it("caches falsy values correctly (null, 0, empty string)", async () => {
    const loaderNull = vi.fn().mockResolvedValue(null);
    const cachedNull = cacheOnce(loaderNull);
    await cachedNull();
    await cachedNull();
    expect(loaderNull).toHaveBeenCalledTimes(1);

    const loaderZero = vi.fn().mockResolvedValue(0);
    const cachedZero = cacheOnce(loaderZero);
    expect(await cachedZero()).toBe(0);
    await cachedZero();
    expect(loaderZero).toHaveBeenCalledTimes(1);

    const loaderEmpty = vi.fn().mockResolvedValue("");
    const cachedEmpty = cacheOnce(loaderEmpty);
    expect(await cachedEmpty()).toBe("");
    await cachedEmpty();
    expect(loaderEmpty).toHaveBeenCalledTimes(1);
  });

  it("propagates errors from the loader", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("fail"));
    const cached = cacheOnce(loader);

    await expect(cached()).rejects.toThrow("fail");
  });
});
