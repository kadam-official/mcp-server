export interface Campaign {
  id: number;
  name: string;
  type: number;
  status: string;
  cpType: number;
  bid: number;
  url: string;
  folderId: number;
  dayMoneyLimit: number;
  commonMoneyLimit: number;
  isEvenDistribution: boolean;
  startDate: string | null;
  endDate: string | null;
  timezone: number;
  clicks: number;
  impressions: number;
  moneyOut: number;
  ctr: number;
}

export interface CampaignFolder {
  id: number;
  name: string;
  limitsEnabled: boolean;
  totalBudget: number;
  dailyBudget: number;
  isEvenDistribution: boolean;
  campaignsCount: number;
}

export interface Audience {
  id: number;
  name: string;
  type: string;
  expireDays: number;
  size: number;
  status: string;
  campaignsIds: number[];
  hasClicks: boolean;
  hasConversions: boolean;
  hasHolds: boolean;
  hasRejects: boolean;
  linkedAudiencesIds: number[];
  code?: string;
}

export interface Creative {
  id: number;
  campaignId: number;
  title: string;
  text: string;
  url: string;
  imageUrl: string;
  iconUrl: string;
  status: string;
  moderationStatus: string;
  bid: number;
  clicks: number;
  impressions: number;
  ctr: number;
}

export interface FinanceOperation {
  id: number;
  date: string;
  type: string;
  amount: number;
  balance: number;
  campaignName?: string;
}

export const CAMPAIGN_TYPE_MAP: Record<string, number> = {
  push: 30,
  inpage_push: 100,
  native: 10,
  banner: 20,
  video: 70,
  popunder: 40,
};

export const CAMPAIGN_TYPE_NAME: Record<number, string> = {
  30: "Push",
  100: "In-Page Push",
  10: "Native",
  20: "Banner",
  70: "Video",
  40: "Popunder",
};

export const PRICING_MODEL_MAP: Record<string, number> = {
  cpc: 0,
  cpm: 1,
  cpv: 2,
  cpa_target: 4,
};

export const PRICING_MODEL_NAME: Record<number, string> = {
  0: "CPC",
  1: "CPM",
  2: "CPV",
  4: "CPA Target",
};
