import type { ToolModule } from "../../types/tool-module.js";
import { campaignsModule } from "./campaigns.js";
import { campaignActionsModule } from "./campaign-actions.js";
import { campaignDetailModule } from "./campaign-detail.js";
import { campaignFoldersModule } from "./campaign-folders.js";
import { audiencesModule } from "./audiences.js";
import { creativesModule } from "./creatives.js";
import { creativeActionsModule } from "./creative-actions.js";
import { financesModule } from "./finances.js";
import { profileModule } from "./profile.js";
import { statsModule } from "./stats.js";
import { autorulesModule } from "./autorules.js";
import { bidOptimizationModule } from "./bid-optimization.js";
import { dictionariesModule } from "./dictionaries.js";

export const advToolModules: ToolModule[] = [
  campaignsModule,
  campaignActionsModule,
  campaignDetailModule,
  campaignFoldersModule,
  audiencesModule,
  creativesModule,
  creativeActionsModule,
  financesModule,
  profileModule,
  statsModule,
  autorulesModule,
  bidOptimizationModule,
  dictionariesModule,
];
