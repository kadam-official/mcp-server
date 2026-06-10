import type { ToolModule } from "../../types/tool-module.js";
import { campaignsModule } from "./campaigns.js";
import { campaignDetailModule } from "./campaign-detail.js";
import { campaignFoldersModule } from "./campaign-folders.js";
import { audiencesModule } from "./audiences.js";
import { creativesModule } from "./creatives.js";
import { financesModule } from "./finances.js";
import { statsModule } from "./stats.js";

export const advToolModules: ToolModule[] = [
  campaignsModule,
  campaignDetailModule,
  campaignFoldersModule,
  audiencesModule,
  creativesModule,
  financesModule,
  statsModule,
];
