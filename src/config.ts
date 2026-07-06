import { z } from "zod";

const transportSchema = z.enum(["stdio", "http"]).default("stdio");

// Env booleans: only "true"/"1" enable; everything else (incl. "false") is off.
const boolEnv = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

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
  // Public host the MCP resource is served on. When the resource lives on a
  // dedicated subdomain (partners-mcp.*/pub-mcp.*) it differs from the OAuth AS
  // (the cabinet domain above). Unset -> falls back to the cabinet domain at use
  // (embedded/local mode where resource and AS share a host).
  KADAM_ADV_MCP_DOMAIN: z.string().url().optional(),
  KADAM_PUB_MCP_DOMAIN: z.string().url().optional(),
  // In HTTP mode each deployment serves exactly ONE cabinet: partners-mcp.* and
  // pub-mcp.* are separate services/pods, each fronted by its own ingress. The
  // cabinet is therefore fixed by config, not detected from the request Host.
  // Required by the HTTP bootstrap; unused by stdio (which serves both).
  KADAM_MCP_CABINET: z.enum(["adv", "pub"]).optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  // Upstream HTTP budget (interactive HTTP mode lowers the defaults at bootstrap).
  KADAM_HTTP_MAX_RETRIES: z.coerce.number().int().min(0).max(10).optional(),
  KADAM_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).optional(),
  // HTTP session / client pool bounds.
  KADAM_MAX_SESSIONS: z.coerce.number().int().min(1).default(500),
  KADAM_SESSION_IDLE_MS: z.coerce
    .number()
    .int()
    .min(60000)
    .default(30 * 60 * 1000),
  KADAM_MAX_CLIENTS: z.coerce.number().int().min(1).default(1000),
  KADAM_CLIENT_IDLE_MS: z.coerce
    .number()
    .int()
    .min(60000)
    .default(30 * 60 * 1000),
  // Reference-resource behaviour.
  KADAM_STATIC_RESOURCES_ONLY: boolEnv,
  KADAM_OPTIONS_TTL_MS: z.coerce.number().int().min(1000).optional(),
});

export type Config = z.infer<typeof envSchema>;

// Process-global, non-tenant app config (env-derived, identical for every
// request). Held in a `const` cell rather than a module-level `let` so the
// no-module-let tenant-isolation gate stays strict with no exemptions.
const configCache: { current: Config | null } = { current: null };

export function getConfig(): Config {
  if (configCache.current) return configCache.current;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  configCache.current = result.data;
  return configCache.current;
}

export function resetConfig(): void {
  configCache.current = null;
}

export function hasAdvKey(): boolean {
  return !!getConfig().KADAM_ADV_API_KEY;
}

export function hasPubKey(): boolean {
  return !!getConfig().KADAM_PUB_API_KEY;
}
