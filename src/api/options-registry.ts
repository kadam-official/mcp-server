import type { HttpClient } from "./http-client.js";
import { logger } from "../logger.js";

export interface DictItem {
  id: number | string;
  label: string;
}

export interface CountryItem {
  id: number;
  code: string;
  label: string;
  tier: number | null;
}

export interface DeviceItem {
  id: number;
  label: string;
  children?: DeviceItem[];
}

export interface SizeItem {
  id: number;
  label: string;
  width: number;
  height: number;
}

export interface SubAgeItem {
  id: number;
  label: string;
  period: string;
}

export interface CountryPreset {
  id: number;
  label: string;
  countries: number[];
}

export interface CategoryItem {
  id: number | string;
  label: string;
  children?: CategoryItem[];
}

export interface LanguageItem {
  id: number | string;
  code?: string;
  label: string;
}

export interface CampaignOptions {
  cpTypes: DictItem[];
  countries: CountryItem[];
  countriesPresets: CountryPreset[];
  browsers: DictItem[];
  devices: DeviceItem[];
  platformVersions: DictItem[];
  languages: LanguageItem[];
  categories: CategoryItem[];
  ages: DictItem[];
  subAges: SubAgeItem[];
  audiences: DictItem[];
  limits: Record<string, number>;
  bidCoefficients: Record<string, number>;
  options: {
    allowAgeSelection: boolean;
    allowGenderSelection: boolean;
    showInterests: boolean;
    postbackLink: string;
  };
  folders: DictItem[];
  conversionTemplates: Array<Record<string, unknown>>;
}

export interface MaterialOptions {
  sizes: SizeItem[];
}

const CAMPAIGN_TYPES = [10, 20, 30, 40, 70, 100] as const;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class OptionsRegistry {
  private readonly log = logger.child({ component: "options-registry" });
  private campaignCache = new Map<number, CacheEntry<CampaignOptions>>();
  private materialCache: CacheEntry<MaterialOptions> | null = null;
  private inflight = new Map<string, Promise<unknown>>();

  private isoToGeoId: Map<string, number> | null = null;
  private nameResolvers: {
    browser: Map<string, number>;
    device: Map<string, number>;
    platform: Map<string, number>;
    language: Map<string, number>;
  } | null = null;

  private readonly ttlMs: number;

  constructor(
    private readonly http: HttpClient,
    ttlMs?: number,
  ) {
    this.ttlMs = ttlMs && ttlMs > 0 ? ttlMs : DEFAULT_CACHE_TTL_MS;
  }

  async getCampaignOptions(type: number): Promise<CampaignOptions> {
    const cached = this.campaignCache.get(type);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const key = `campaign-${type}`;
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<CampaignOptions>;

    const promise = this.fetchCampaignOptions(type);
    this.inflight.set(key, promise);

    try {
      const data = await promise;
      this.campaignCache.set(type, { data, expiresAt: Date.now() + this.ttlMs });
      if (type === 10) {
        this.isoToGeoId = null;
        this.nameResolvers = null;
      }
      return data;
    } finally {
      this.inflight.delete(key);
    }
  }

  async getMaterialOptions(): Promise<MaterialOptions> {
    if (this.materialCache && this.materialCache.expiresAt > Date.now()) {
      return this.materialCache.data;
    }

    const existing = this.inflight.get("materials");
    if (existing) return existing as Promise<MaterialOptions>;

    const promise = this.fetchMaterialOptions();
    this.inflight.set("materials", promise);

    try {
      const data = await promise;
      this.materialCache = { data, expiresAt: Date.now() + this.ttlMs };
      return data;
    } finally {
      this.inflight.delete("materials");
    }
  }

  async preload(): Promise<void> {
    const promises: Promise<unknown>[] = CAMPAIGN_TYPES.map((t) => this.getCampaignOptions(t));
    promises.push(this.getMaterialOptions());
    await Promise.allSettled(promises);
    this.log.info("Options preloaded for all campaign types");
  }

  /** Countries, browsers, devices, platforms, languages are identical across all campaign types; type=10 (native) is used as the canonical source. */
  async getCountryMap(): Promise<Map<string, number>> {
    if (this.isoToGeoId) return this.isoToGeoId;
    const opts = await this.getCampaignOptions(10);
    const map = new Map<string, number>();
    for (const c of opts.countries) {
      map.set(c.code.toUpperCase(), c.id);
    }
    this.isoToGeoId = map;
    return map;
  }

  async resolveCountryIds(isoCodes: string): Promise<number[]> {
    const map = await this.getCountryMap();
    return isoCodes
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .map((code) => {
        const id = map.get(code);
        if (id === undefined) {
          throw new Error(
            `Unknown country code: ${code}. Use ISO 3166-1 alpha-2 codes (e.g. US, DE, BR).`,
          );
        }
        return id;
      });
  }

  async getNameResolvers(): Promise<{
    browser: Map<string, number>;
    device: Map<string, number>;
    platform: Map<string, number>;
    language: Map<string, number>;
  }> {
    if (this.nameResolvers) return this.nameResolvers;
    const opts = await this.getCampaignOptions(10);

    const browser = buildLabelMap(opts.browsers);
    const device = buildLabelMap(flattenDevices(opts.devices));
    const platform = buildLabelMap(opts.platformVersions);
    const language = buildLanguageMap(opts.languages);

    this.nameResolvers = { browser, device, platform, language };
    return this.nameResolvers;
  }

  async resolveIds(
    kind: "browser" | "device" | "platform" | "language",
    input: string,
  ): Promise<number[]> {
    const resolvers = await this.getNameResolvers();
    const map = resolvers[kind];
    return input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => {
        const numericAttempt = Number(name);
        if (!isNaN(numericAttempt) && Number.isInteger(numericAttempt)) return numericAttempt;

        const id = map.get(name.toLowerCase());
        if (id === undefined) {
          const seen = new Set<number>();
          const hints: string[] = [];
          for (const [label, numId] of map) {
            if (seen.has(numId) || /^\d+$/.test(label)) continue;
            seen.add(numId);
            hints.push(`${numId}=${label}`);
            if (hints.length >= 15) break;
          }
          throw new Error(`Unknown ${kind}: "${name}". Available (first 15): ${hints.join(", ")}`);
        }
        return id;
      });
  }

  private async fetchCampaignOptions(type: number): Promise<CampaignOptions> {
    this.log.debug({ type }, "Fetching campaign options");
    const raw = await this.http.get<CampaignOptions>("/campaigns/options", {
      type: String(type),
    });
    return raw;
  }

  private async fetchMaterialOptions(): Promise<MaterialOptions> {
    this.log.debug("Fetching material options");
    return this.http.get<MaterialOptions>("/materials/options");
  }
}

export function flattenCategoryIds(categories: CategoryItem[]): (number | string)[] {
  const result: (number | string)[] = [];
  for (const cat of categories) {
    result.push(cat.id);
    if (cat.children) result.push(...flattenCategoryIds(cat.children));
  }
  return result;
}

function flattenDevices(devices: DeviceItem[]): DictItem[] {
  const result: DictItem[] = [];
  for (const d of devices) {
    result.push({ id: d.id, label: d.label });
    if (d.children) {
      for (const child of d.children) {
        result.push({ id: child.id, label: child.label });
      }
    }
  }
  return result;
}

function buildLabelMap(items: DictItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const id = typeof item.id === "number" ? item.id : parseInt(String(item.id), 10);
    map.set(item.label.toLowerCase(), id);
    map.set(String(id), id);
  }
  return map;
}

/**
 * Fallback ISO→English name map: the API may return localized labels (e.g. Russian),
 * so we maintain an English alias layer to let LLMs pass "English", "German" etc.
 * When the API starts returning `code` (ISO) per language item, the ISO-based lookup
 * in buildLanguageMap takes precedence and this map serves only as extra aliases.
 */
const ENGLISH_LANGUAGE_NAMES: Record<string, string> = {
  EN: "english",
  RU: "russian",
  DE: "german",
  FR: "french",
  ES: "spanish",
  PT: "portuguese",
  IT: "italian",
  PL: "polish",
  NL: "dutch",
  TR: "turkish",
  AR: "arabic",
  JA: "japanese",
  KO: "korean",
  ZH: "chinese",
  VI: "vietnamese",
  TH: "thai",
  ID: "indonesian",
  HI: "hindi",
  BN: "bengali",
  UK: "ukrainian",
  RO: "romanian",
  CS: "czech",
  EL: "greek",
  HU: "hungarian",
  SV: "swedish",
  DA: "danish",
  FI: "finnish",
  NO: "norwegian",
  SK: "slovak",
  BG: "bulgarian",
  HR: "croatian",
  SR: "serbian",
  SL: "slovenian",
  LT: "lithuanian",
  LV: "latvian",
  ET: "estonian",
  HE: "hebrew",
  FA: "persian",
  MS: "malay",
  TL: "filipino",
  SW: "swahili",
  AZ: "azerbaijani",
  KA: "georgian",
  HY: "armenian",
  BE: "belarusian",
  KK: "kazakh",
  UZ: "uzbek",
};

function buildLanguageMap(items: LanguageItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const id = typeof item.id === "number" ? item.id : parseInt(String(item.id), 10);
    map.set(item.label.toLowerCase(), id);
    map.set(String(id), id);
    if (item.code) {
      map.set(item.code.toLowerCase(), id);
      const englishName = ENGLISH_LANGUAGE_NAMES[item.code.toUpperCase()];
      if (englishName) map.set(englishName, id);
    }
  }
  return map;
}
