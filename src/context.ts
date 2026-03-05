import type { PartnersClient } from "./api/partners-client.js";
import type { PubClient } from "./api/pub-client.js";

export interface ApiContext {
  readonly adv: PartnersClient | null;
  readonly pub: PubClient | null;
}
