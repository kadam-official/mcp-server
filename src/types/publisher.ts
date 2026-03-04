export interface Source {
  id: number;
  name: string;
  url: string;
  status: string;
  state: string;
  impressions: number;
  clicks: number;
  revenue: number;
  placesCount: number;
}

export interface AdUnit {
  id: number;
  sourceId: number;
  name: string;
  type: number;
  status: string;
  impressions: number;
  clicks: number;
  revenue: number;
}

export interface PubUser {
  id: number;
  email: string;
  balance: number;
  name: string;
  notificationsCount: number;
}

export const AD_UNIT_TYPE_MAP: Record<string, number> = {
  native: 0,
  banner: 10,
  push: 20,
  popunder: 30,
  inpagepush: 100,
};

export const AD_UNIT_TYPE_NAME: Record<number, string> = {
  0: "Native",
  10: "Banner",
  20: "Push",
  30: "Popunder",
  100: "In-Page Push",
};
