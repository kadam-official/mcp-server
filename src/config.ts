import { z } from "zod";

const transportSchema = z.enum(["stdio", "http"]).default("stdio");

const envSchema = z
  .object({
    MCP_TRANSPORT: transportSchema,
    MCP_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    MCP_HTTP_HOST: z.string().default("0.0.0.0"),
    KADAM_ADV_API_KEY: z.string().min(1).optional(),
    KADAM_PUB_API_KEY: z.string().min(1).optional(),
    KADAM_ADV_API_BASE: z.string().url().default("https://partners.kadam.net/api/v1"),
    KADAM_PUB_API_BASE: z.string().url().default("https://pub.kadam.net/api"),
    KADAM_ADV_DOMAIN: z.string().url().default("https://partners.kadam.net"),
    KADAM_PUB_DOMAIN: z.string().url().default("https://pub.kadam.net"),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal"])
      .default("info"),
  })
  .superRefine((data, ctx) => {
    if (data.MCP_TRANSPORT === "stdio") {
      if (!data.KADAM_ADV_API_KEY && !data.KADAM_PUB_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "At least one of KADAM_ADV_API_KEY or KADAM_PUB_API_KEY is required in stdio mode",
          path: ["KADAM_ADV_API_KEY"],
        });
      }
    }
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
