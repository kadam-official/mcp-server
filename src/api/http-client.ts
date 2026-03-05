import { logger } from "../logger.js";

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  maxRetries?: number;
  timeout?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const RETRY_DELAYS = [1000, 2000, 4000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly timeout: number;
  private readonly log = logger.child({ component: "http-client" });

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeout = options.timeout ?? 30_000;
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>("GET", url);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>("POST", url, body);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>("PUT", url, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>("DELETE", url);
  }

  async postFormData<T = unknown>(path: string, formData: FormData): Promise<T> {
    const url = this.buildUrl(path);
    return this.requestFormData<T>(url, formData);
  }

  async options<T = unknown>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>("OPTIONS", url);
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }
    return url.toString();
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]!;
        this.log.debug({ attempt, delay, url }, "Retrying request");
        await sleep(delay);
      }

      const startTime = Date.now();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        };

        const response = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const elapsed = Date.now() - startTime;
        this.log.debug({ method, url, status: response.status, elapsed }, "API response");

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAYS[attempt]!;
          this.log.warn({ waitMs }, "Rate limited, backing off");
          await sleep(waitMs);
          continue;
        }

        if (!response.ok) {
          const responseBody = await response.text().catch(() => "");
          const parsed = tryParseJson(responseBody);

          if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
            lastError = new ApiError(
              `API returned ${response.status}: ${responseBody.slice(0, 200)}`,
              response.status,
              parsed,
            );
            continue;
          }

          throw new ApiError(
            formatApiError(response.status, parsed, responseBody),
            response.status,
            parsed,
          );
        }

        const json = (await response.json()) as Record<string, unknown>;
        return unwrapApiResponse<T>(json);
      } catch (error) {
        if (error instanceof ApiError) throw error;

        if (error instanceof DOMException && error.name === "AbortError") {
          lastError = new Error(`Request timed out after ${this.timeout}ms: ${method} ${url}`);
          if (attempt < this.maxRetries) continue;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) continue;
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  private async requestFormData<T>(url: string, formData: FormData): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]!;
        this.log.debug({ attempt, delay, url }, "Retrying form upload");
        await sleep(delay);
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
          },
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAYS[attempt]!;
          this.log.warn({ waitMs }, "Rate limited on form upload, backing off");
          await sleep(waitMs);
          continue;
        }

        if (!response.ok) {
          const responseBody = await response.text().catch(() => "");
          const parsed = tryParseJson(responseBody);

          if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
            lastError = new ApiError(
              `API returned ${response.status}: ${responseBody.slice(0, 200)}`,
              response.status,
              parsed,
            );
            continue;
          }

          throw new ApiError(
            formatApiError(response.status, parsed, responseBody),
            response.status,
            parsed,
          );
        }

        const json = (await response.json()) as Record<string, unknown>;
        return unwrapApiResponse<T>(json);
      } catch (error) {
        if (error instanceof ApiError) throw error;

        if (error instanceof DOMException && error.name === "AbortError") {
          lastError = new Error(`Form upload timed out after ${this.timeout}ms`);
          if (attempt < this.maxRetries) continue;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) continue;
      }
    }

    throw lastError ?? new Error("Form upload failed after retries");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function unwrapApiResponse<T>(json: Record<string, unknown>): T {
  if ("success" in json && json.success === false) {
    const msg = json.msg;
    let message = "API request failed";
    if (msg && typeof msg === "object" && !Array.isArray(msg)) {
      const parts: string[] = [];
      for (const [key, val] of Object.entries(msg as Record<string, unknown>)) {
        if (Array.isArray(val)) parts.push(`${key}: ${val.join(", ")}`);
        else if (typeof val === "string") parts.push(val);
        else parts.push(`${key}: ${JSON.stringify(val)}`);
      }
      if (parts.length) message = parts.join("; ");
    } else if (typeof msg === "string") {
      message = msg;
    }
    throw new ApiError(message, (json.code as number) ?? 0);
  }
  if ("data" in json) return json.data as T;
  return json as T;
}

function formatApiError(status: number, parsed: unknown, raw: string): string {
  if (status === 401 || status === 403) {
    return "API key is invalid or expired. Check your KADAM_ADV_API_KEY or KADAM_PUB_API_KEY.";
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (obj.message) return String(obj.message);
    if (obj.error) return String(obj.error);
    if (obj.errors && Array.isArray(obj.errors)) {
      return obj.errors.map((e: unknown) => {
        if (typeof e === "string") return e;
        if (typeof e === "object" && e !== null && "message" in e) return String((e as { message: unknown }).message);
        return JSON.stringify(e);
      }).join("; ");
    }
  }

  return `API error ${status}: ${raw.slice(0, 300)}`;
}
