import { createHash } from "node:crypto";
import { ApiError } from "./api/http-client.js";
import type { ClientPool } from "./api/client-pool.js";
import type { CabinetType } from "./http-session.js";

const DEFAULT_TTL_MS = 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5000;

/**
 * Whether an upstream error means "the bearer is rejected".
 * Kadam does NOT return HTTP 401/403 for a bad key — it returns HTTP 200 with
 * `{success:false, code:0, msg.exception:"...invalid credentials..."}`, which
 * http-client surfaces as an ApiError with status 0 and that message. So match
 * the credentials message as well as the conventional 401/403 statuses.
 */
function isUpstreamAuthFailure(error: ApiError): boolean {
  if (error.status === 401 || error.status === 403) return true;
  return /invalid credentials/i.test(error.message);
}

/**
 * Validates a per-request bearer against the upstream API so a rejected key can
 * surface as an HTTP 401 (spec re-auth) instead of a 200 tool error. Results are
 * cached per tenant for a short TTL; the cache is bounded (prune-expired + FIFO
 * cap) so a flood of distinct bearers can't grow it unbounded. Only an upstream
 * auth rejection fails (HTTP 401/403, or Kadam's HTTP-200 "invalid credentials"
 * body) — transient errors (network/5xx/timeout) pass, so a valid key is never
 * bounced on an upstream blip.
 */
export class BearerValidator {
  private readonly cache = new Map<string, number>(); // sha256(cabinet:bearer) -> expiresAt

  constructor(
    private readonly pool: ClientPool,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  async validate(bearer: string, cabinet: CabinetType): Promise<boolean> {
    const key = createHash("sha256").update(`${cabinet}:${bearer}`).digest("hex");
    const exp = this.cache.get(key);
    if (exp && exp > Date.now()) return true;
    try {
      if (cabinet === "adv") {
        await this.pool.resolve(bearer, undefined).adv?.options.getCampaignOptions(10);
      } else {
        await this.pool.resolve(undefined, bearer).pub?.getReportConfig();
      }
      this.remember(key);
      return true;
    } catch (error) {
      if (error instanceof ApiError && isUpstreamAuthFailure(error)) {
        return false;
      }
      return true;
    }
  }

  /** Drop expired entries (called by the periodic sweeper). */
  prune(now: number = Date.now()): void {
    for (const [k, exp] of this.cache) {
      if (exp <= now) this.cache.delete(k);
    }
  }

  get size(): number {
    return this.cache.size;
  }

  private remember(key: string): void {
    if (this.cache.size >= this.maxEntries) {
      this.prune();
      while (this.cache.size >= this.maxEntries) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, Date.now() + this.ttlMs);
  }
}
