import type { ToolModule } from "../../types/tool-module.js";
import { sourcesModule } from "./sources.js";
import { adUnitsModule } from "./ad-units.js";
import { usersModule } from "./users.js";
import { pubStatsModule } from "./stats.js";

export const pubToolModules: ToolModule[] = [
  sourcesModule,
  adUnitsModule,
  usersModule,
  pubStatsModule,
];
