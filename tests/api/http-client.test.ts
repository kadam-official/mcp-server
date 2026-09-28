import { HttpClient, ApiError } from "../../src/api/http-client.js";

vi.mock("../../src/logger.js", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

function mockResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe("HttpClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createClient(overrides?: { maxRetries?: number; timeout?: number }) {
    return new HttpClient({
      baseUrl: "https://api.example.com",
      apiKey: "test-key",
      maxRetries: 0,
      timeout: 5000,
      ...overrides,
    });
  }

  it("GET request: correct URL built from baseUrl + path", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(mockResponse(200, { data: "ok" }));

    await client.get("/campaigns");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/campaigns",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("GET with params: query string appended", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(mockResponse(200, {}));

    await client.get("/campaigns", { page: "1", perPage: "10" });

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("page=1");
    expect(url).toContain("perPage=10");
  });

  it("POST request: correct method, body JSON stringified", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(mockResponse(201, { id: 1 }));

    await client.post("/campaigns", { name: "Test" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/campaigns",
      expect.objectContaining({
        method: "POST",
        body: '{"name":"Test"}',
      }),
    );
  });

  it("PUT request: correct method", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(mockResponse(200, {}));

    await client.put("/campaigns/1", { name: "Updated" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("DELETE request: correct method", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(mockResponse(200, {}));

    await client.delete("/campaigns/1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("Authorization header: Bearer <apiKey> present", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(mockResponse(200, {}));

    await client.get("/test");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      }),
    );
  });

  it("Content-Type header: application/json for JSON requests", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(mockResponse(200, {}));

    await client.get("/test");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("successful JSON response: parsed and returned", async () => {
    const client = createClient();
    const body = { id: 42, name: "Campaign" };
    fetchMock.mockResolvedValue(mockResponse(200, body));

    const result = await client.get<{ id: number; name: string }>("/campaigns/42");

    expect(result).toEqual(body);
  });

  it("401 error: throws ApiError with invalid or expired message", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(mockResponse(401, {}));

    await expect(client.get("/test")).rejects.toThrow(ApiError);
    await expect(client.get("/test")).rejects.toThrow(/invalid or expired/);
  });

  it("422 error: throws ApiError with message from response body", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(mockResponse(422, { message: "Validation failed" }));

    await expect(client.get("/test")).rejects.toThrow(ApiError);
    await expect(client.get("/test")).rejects.toThrow(/Validation failed/);
  });

  it("422 validation envelope: flattens the msg field map into the message", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(
      mockResponse(422, {
        success: false,
        code: 422,
        msg: { autorules: ["Available only for CPC campaigns"] },
      }),
    );

    await expect(client.get("/test")).rejects.toThrow(
      /autorules: Available only for CPC campaigns/,
    );
  });

  /**
   * Кабинет паба отвечает HTTP 200 и кладёт отказ в конверт, поэтому путь через
   * response.ok сюда не заходит: код и текст обязан донести unwrapApiResponse. По этому
   * тексту клиент отличает выключенную фичу от чужого ключа — оба приезжают 403.
   */
  it("403 envelope on HTTP 200: keeps the server's reason and the code", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(
      mockResponse(200, {
        success: false,
        code: 403,
        msg: { exception: "Kadam Smart Mediation is not enabled for this account" },
      }),
    );

    await expect(client.get("/test")).rejects.toMatchObject({
      status: 403,
      message: "Kadam Smart Mediation is not enabled for this account",
    });
  });

  it("422 with a JSON-encoded errors string in message: parses and flattens it", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(
      mockResponse(422, { message: JSON.stringify({ bidMax: ["maxbid is required"] }) }),
    );

    await expect(client.get("/test")).rejects.toThrow(/bidMax: maxbid is required/);
  });

  it("HTTP-200 success:false envelope: throws ApiError with the flattened msg", async () => {
    const client = createClient();
    fetchMock.mockResolvedValue(
      mockResponse(200, {
        success: false,
        code: 0,
        msg: { exception: "Your request was made with invalid credentials." },
      }),
    );

    await expect(client.get("/test")).rejects.toThrow(/invalid credentials/);
  });

  it("500 error with retries: retried up to maxRetries", async () => {
    vi.useFakeTimers();
    const client = createClient({ maxRetries: 1 });
    fetchMock
      .mockResolvedValueOnce(mockResponse(500, {}))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const promise = client.get("/test");
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
    vi.useRealTimers();
  });

  it("429 rate limit: reads Retry-After header", async () => {
    vi.useFakeTimers();
    const client = createClient({ maxRetries: 1 });
    fetchMock
      .mockResolvedValueOnce(mockResponse(429, {}, { "Retry-After": "1" }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const promise = client.get("/test");
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
    vi.useRealTimers();
  });

  // A POST that times out or dies on a 5xx may already have created the campaign.
  // Replaying it bills the advertiser twice, so these three cases must not retry.
  it("500 on POST: not replayed", async () => {
    vi.useFakeTimers();
    const client = createClient({ maxRetries: 2 });
    fetchMock.mockResolvedValue(mockResponse(500, {}));

    const promise = client.post("/campaigns", { name: "x" });
    const assertion = expect(promise).rejects.toThrow(ApiError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("network failure on POST: not replayed", async () => {
    vi.useFakeTimers();
    const client = createClient({ maxRetries: 2 });
    fetchMock.mockRejectedValue(new Error("socket hang up"));

    const promise = client.post("/campaigns", { name: "x" });
    const assertion = expect(promise).rejects.toThrow(/socket hang up/);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("429 on POST: still retried, the request never reached the handler", async () => {
    vi.useFakeTimers();
    const client = createClient({ maxRetries: 1 });
    fetchMock
      .mockResolvedValueOnce(mockResponse(429, {}, { "Retry-After": "1" }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const promise = client.post("/campaigns", { name: "x" });
    await vi.advanceTimersByTimeAsync(3000);

    expect(await promise).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  /**
   * «Применилось, ответ потерялся»: соединение рвётся после записи. Повтор такого POST
   * записал бы второй раз, поэтому вызов с retry:false уходит ровно один раз.
   */
  it("POST with retry:false: a lost response is not repeated", async () => {
    const client = createClient({ maxRetries: 3 });
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(client.post("/write", { share: 10 }, { retry: false })).rejects.toThrow(
      "fetch failed",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("POST with retry:false: a retryable status surfaces at once", async () => {
    const client = createClient({ maxRetries: 3 });
    fetchMock.mockResolvedValue(mockResponse(503, { message: "busy" }));

    await expect(client.post("/write", {}, { retry: false })).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("POST with retry:false: a 429 is reported, not slept on", async () => {
    const client = createClient({ maxRetries: 3 });
    fetchMock.mockResolvedValue(mockResponse(429, {}, { "Retry-After": "60" }));

    await expect(client.post("/write", {}, { retry: false })).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("POST with retry:false: a timeout says it timed out", async () => {
    const client = createClient({ maxRetries: 3 });
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));

    await expect(client.post("/write", {}, { retry: false })).rejects.toThrow(/timed out after/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("429 on every attempt: reported as rate limited once retries run out", async () => {
    vi.useFakeTimers();
    const client = createClient({ maxRetries: 1 });
    fetchMock.mockResolvedValue(mockResponse(429, {}, { "Retry-After": "1" }));

    const promise = client.get("/test");
    const settled = expect(promise).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(2000);
    await settled;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("500 on PUT: replayed, the update lands on the same row", async () => {
    vi.useFakeTimers();
    const client = createClient({ maxRetries: 1 });
    fetchMock
      .mockResolvedValueOnce(mockResponse(500, {}))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const promise = client.put("/campaigns/1/update", { name: "x" });
    await vi.advanceTimersByTimeAsync(2000);

    expect(await promise).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
