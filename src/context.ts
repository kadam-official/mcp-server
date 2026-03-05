import type { PartnersClient } from "./api/partners-client.js";
import type { PubClient } from "./api/pub-client.js";

export interface AdvContext {
  readonly adv: PartnersClient;
}

export interface PubContext {
  readonly pub: PubClient;
}

export type ToolContext = AdvContext | PubContext;
