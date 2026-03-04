import type { ToolWrapper } from "../middleware/tool-wrapper.js";

export type Product = "advertiser" | "publisher";

export interface ToolModule {
  product: Product;
  register(wrapper: ToolWrapper): void;
}
