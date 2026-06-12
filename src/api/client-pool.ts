import { HttpClient } from "./http-client.js";
import { PartnersClient } from "./partners-client.js";
import { PubClient } from "./pub-client.js";

export interface ClientPoolConfig {
  advBaseUrl: string;
  pubBaseUrl: string;
  maxRetries?: number;
  timeout?: number;
  /** Max number of cached clients (adv + pub) before LRU eviction. */
  maxClients?: number;
  /** TTL for the per-tenant campaign/material options cache (ms). */
  optionsTtlMs?: number;
}

/**
 * Per-tenant client cache, keyed by API key. Intended to be a process-level
 * singleton so each tenant's PartnersClient (and its OptionsRegistry cache)
 * survives across HTTP sessions. LRU + idle eviction bound memory and avoid
 * retaining bearers indefinitely. Holds no session state -> safe to share.
 */
export class ClientPool {
  private readonly advClients = new Map<string, PartnersClient>();
  private readonly pubClients = new Map<string, PubClient>();
  // Last-used timestamps, keyed "adv:<key>" / "pub:<key>", for LRU/idle eviction.
  private readonly lastUsed = new Map<string, number>();

  constructor(private readonly config: ClientPoolConfig) {}

  resolve(advKey?: string, pubKey?: string): { adv: PartnersClient | null; pub: PubClient | null } {
    return {
      adv: advKey ? this.getOrCreateAdv(advKey) : null,
      pub: pubKey ? this.getOrCreatePub(pubKey) : null,
    };
  }

  get stats(): { advClients: number; pubClients: number } {
    return {
      advClients: this.advClients.size,
      pubClients: this.pubClients.size,
    };
  }

  /** Evict clients idle for longer than maxIdleMs. Returns the count evicted. */
  evictIdle(maxIdleMs: number): number {
    const now = Date.now();
    let evicted = 0;
    for (const [tag, ts] of [...this.lastUsed]) {
      if (now - ts > maxIdleMs) {
        this.deleteByTag(tag);
        evicted++;
      }
    }
    return evicted;
  }

  private getOrCreateAdv(apiKey: string): PartnersClient {
    let client = this.advClients.get(apiKey);
    if (!client) {
      this.enforceCap();
      client = new PartnersClient(
        new HttpClient({
          baseUrl: this.config.advBaseUrl,
          apiKey,
          maxRetries: this.config.maxRetries,
          timeout: this.config.timeout,
        }),
        this.config.optionsTtlMs,
      );
      this.advClients.set(apiKey, client);
    }
    this.lastUsed.set(`adv:${apiKey}`, Date.now());
    return client;
  }

  private getOrCreatePub(apiKey: string): PubClient {
    let client = this.pubClients.get(apiKey);
    if (!client) {
      this.enforceCap();
      client = new PubClient(
        new HttpClient({
          baseUrl: this.config.pubBaseUrl,
          apiKey,
          maxRetries: this.config.maxRetries,
          timeout: this.config.timeout,
        }),
        this.config.optionsTtlMs,
      );
      this.pubClients.set(apiKey, client);
    }
    this.lastUsed.set(`pub:${apiKey}`, Date.now());
    return client;
  }

  /** Evict least-recently-used clients until there is room for one more. */
  private enforceCap(): void {
    const max = this.config.maxClients ?? Infinity;
    while (this.advClients.size + this.pubClients.size + 1 > max && this.lastUsed.size > 0) {
      let oldestTag: string | null = null;
      let oldest = Infinity;
      for (const [tag, ts] of this.lastUsed) {
        if (ts < oldest) {
          oldest = ts;
          oldestTag = tag;
        }
      }
      if (!oldestTag) break;
      this.deleteByTag(oldestTag);
    }
  }

  private deleteByTag(tag: string): void {
    this.lastUsed.delete(tag);
    if (tag.startsWith("adv:")) this.advClients.delete(tag.slice(4));
    else if (tag.startsWith("pub:")) this.pubClients.delete(tag.slice(4));
  }
}
