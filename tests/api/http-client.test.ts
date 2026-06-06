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
});
