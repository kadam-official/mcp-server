import type { ToolModule } from "../../types/tool-module.js";
import { sourcesModule } from "./sources.js";
import { adUnitsModule } from "./ad-units.js";
import { usersModule } from "./users.js";
import { pubStatsModule } from "./stats.js";
import { mediationModule } from "./mediation.js";
import { mediationAccountsModule } from "./mediation-accounts.js";

export const pubToolModules: ToolModule[] = [
  sourcesModule,
  adUnitsModule,
  usersModule,
  pubStatsModule,
  mediationModule,
  mediationAccountsModule,
];
