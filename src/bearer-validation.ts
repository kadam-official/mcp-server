import { createHash } from "node:crypto";
import { ApiError } from "./api/http-client.js";
import type { ClientPool } from "./api/client-pool.js";
import type { CabinetType } from "./http-session.js";
import { CLIENT_ACCESS, type SessionAccess } from "./types/access.js";

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
 * Outcome of probing a bearer against the upstream API.
 *
 * `access` is what the probe learned about the role. When the probe could not
 * reach the API (transient error) the bearer is still accepted, but the role is
 * unknown and falls back to {@link CLIENT_ACCESS}: showing the smaller catalog to
 * a manager is a nuisance, showing the manager catalog to a client is a lie the
 * API would then refuse call by call.
 */
export interface BearerVerdict {
  readonly accepted: boolean;
  readonly access: SessionAccess;
}

interface CacheEntry {
  readonly expiresAt: number;
  readonly access: SessionAccess;
}

/**
 * Validates a per-request bearer against the upstream API so a rejected key can
 * surface as an HTTP 401 (spec re-auth) instead of a 200 tool error, and learns
 * the bearer's role in the same round-trip. Results are cached per tenant for a
 * short TTL; the cache is bounded (prune-expired + FIFO cap) so a flood of
 * distinct bearers can't grow it unbounded. Only an upstream auth rejection fails
 * (HTTP 401/403, or Kadam's HTTP-200 "invalid credentials" body) — transient
 * errors (network/5xx/timeout) pass, so a valid key is never bounced on an
 * upstream blip.
 */
export class BearerValidator {
  private readonly cache = new Map<string, CacheEntry>(); // sha256(cabinet:bearer) -> entry

  constructor(
    private readonly pool: ClientPool,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  async validate(bearer: string, cabinet: CabinetType): Promise<BearerVerdict> {
    const key = createHash("sha256").update(`${cabinet}:${bearer}`).digest("hex");
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { accepted: true, access: cached.access };
    }
    try {
      const access = await this.probe(bearer, cabinet);
      this.remember(key, access);
      return { accepted: true, access };
    } catch (error) {
      if (error instanceof ApiError && isUpstreamAuthFailure(error)) {
        return { accepted: false, access: CLIENT_ACCESS };
      }
      return { accepted: true, access: CLIENT_ACCESS };
    }
  }

  /**
   * The advertiser API answers the role directly. The publisher API has no
   * impersonation path (its v1 controllers never see an `act.sub` token), so a
   * publisher bearer is probed with the cheapest authenticated read and is
   * always a client session.
   */
  private async probe(bearer: string, cabinet: CabinetType): Promise<SessionAccess> {
    if (cabinet === "adv") {
      const adv = this.pool.resolve(bearer, undefined).adv;
      if (!adv) return CLIENT_ACCESS;
      const access = await adv.getAccess();
      return { impersonation: access.impersonation };
    }
    await this.pool.resolve(undefined, bearer).pub?.getReportConfig();
    return CLIENT_ACCESS;
  }

  /** Drop expired entries (called by the periodic sweeper). */
  prune(now: number = Date.now()): void {
    for (const [k, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(k);
    }
  }

  get size(): number {
    return this.cache.size;
  }

  private remember(key: string, access: SessionAccess): void {
    if (this.cache.size >= this.maxEntries) {
      this.prune();
      while (this.cache.size >= this.maxEntries) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, { expiresAt: Date.now() + this.ttlMs, access });
  }
}
