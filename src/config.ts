import { z } from "zod";

const transportSchema = z.enum(["stdio", "http"]).default("stdio");

// Both API keys are optional in every mode:
// - http: tokens arrive per-request via Bearer auth.
// - stdio: the server still starts with no keys so the client can connect,
//   list tools, and surface per-tool "set your API key" guidance (calling a
//   tool without the matching key returns a clear setup message). Hard-failing
//   here would show a cryptic "server disconnected" with no guidance.
const envSchema = z.object({
  MCP_TRANSPORT: transportSchema,
  MCP_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  MCP_HTTP_HOST: z.string().default("0.0.0.0"),
  KADAM_ADV_API_KEY: z.string().min(1).optional(),
  KADAM_PUB_API_KEY: z.string().min(1).optional(),
  KADAM_ADV_API_BASE: z.string().url().default("https://partners.kadam.net/api/v1"),
  KADAM_PUB_API_BASE: z.string().url().default("https://pub.kadam.net/api"),
  KADAM_ADV_DOMAIN: z.string().url().default("https://partners.kadam.net"),
  KADAM_PUB_DOMAIN: z.string().url().default("https://pub.kadam.net"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

export type Config = z.infer<typeof envSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
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
