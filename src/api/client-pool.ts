import { HttpClient } from "./http-client.js";
import { PartnersClient } from "./partners-client.js";
import { PubClient } from "./pub-client.js";
import type { ApiContext } from "../context.js";

export interface ClientPoolConfig {
  advBaseUrl: string;
  pubBaseUrl: string;
  maxRetries?: number;
  timeout?: number;
}

export class ClientPool {
  private readonly advClients = new Map<string, PartnersClient>();
  private readonly pubClients = new Map<string, PubClient>();

  constructor(private readonly config: ClientPoolConfig) {}

  resolve(advKey?: string, pubKey?: string): ApiContext {
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

  private getOrCreateAdv(apiKey: string): PartnersClient {
    let client = this.advClients.get(apiKey);
    if (!client) {
      client = new PartnersClient(
        new HttpClient({
          baseUrl: this.config.advBaseUrl,
          apiKey,
          maxRetries: this.config.maxRetries,
          timeout: this.config.timeout,
        }),
      );
      this.advClients.set(apiKey, client);
    }
    return client;
  }

  private getOrCreatePub(apiKey: string): PubClient {
    let client = this.pubClients.get(apiKey);
    if (!client) {
      client = new PubClient(
        new HttpClient({
          baseUrl: this.config.pubBaseUrl,
          apiKey,
          maxRetries: this.config.maxRetries,
          timeout: this.config.timeout,
        }),
      );
      this.pubClients.set(apiKey, client);
    }
    return client;
  }
}
