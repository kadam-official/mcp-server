import { z } from "zod";

const envSchema = z.object({
  KADAM_ADV_API_KEY: z.string().min(1).optional(),
  KADAM_PUB_API_KEY: z.string().min(1).optional(),
  KADAM_ADV_API_BASE: z.string().url().default("https://partners.kadam.net/api/v1"),
  KADAM_PUB_API_BASE: z.string().url().default("https://pub.kadam.net/api"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

export type Config = z.infer<typeof envSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}

export function hasAdvKey(): boolean {
  return !!getConfig().KADAM_ADV_API_KEY;
}

export function hasPubKey(): boolean {
  return !!getConfig().KADAM_PUB_API_KEY;
}
