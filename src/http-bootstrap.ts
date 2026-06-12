import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { ClientPool } from "./api/client-pool.js";
import { ApiError } from "./api/http-client.js";
import { getConfig, type Config } from "./config.js";
import {
  detectCabinet,
  isSessionAuthorized,
  sessionCredentials,
  type CabinetType,
} from "./http-session.js";
import type { ToolCredentials } from "./middleware/tool-wrapper.js";
import { assembleServer } from "./server-assembly.js";
import { logger } from "./logger.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require("../package.json") as {
  version: string;
};

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  bearer: string;
  cabinet: CabinetType;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

// Sweep cadence for idle session/client eviction (idle TTLs are env-configurable).
const SESSION_SWEEP_MS = 5 * 60 * 1000;

// Cache of upstream-validated bearers: probe Kadam at most once per TTL per tenant.
const VALIDATED_BEARER_TTL_MS = 60 * 1000;
const validatedBearers = new Map<string, number>(); // sha256(cabinet:bearer) -> expiresAt

/** Evict least-recently-active sessions until there is room for one more. */
function evictExcessSessions(max: number): void {
  while (sessions.size >= max) {
    let oldestId: string | null = null;
    let oldest = Infinity;
    for (const [sid, s] of sessions) {
      if (s.lastActivity < oldest) {
        oldest = s.lastActivity;
        oldestId = sid;
      }
    }
    if (!oldestId) break;
    const victim = sessions.get(oldestId)!;
    sessions.delete(oldestId);
    void victim.transport.close().catch(() => {});
    logger.info({ sessionId: oldestId }, "Evicted LRU HTTP session (cap reached)");
  }
}

/**
 * Validate the bearer against the upstream API so a rejected key surfaces as an
 * HTTP 401 (spec re-auth) instead of a 200 tool error. Cached per tenant for a
 * short TTL; only an explicit upstream 401/403 fails (transient errors pass).
 */
async function validateUpstreamBearer(
  pool: ClientPool,
  bearer: string,
  cabinet: CabinetType,
): Promise<boolean> {
  const key = createHash("sha256").update(`${cabinet}:${bearer}`).digest("hex");
  const exp = validatedBearers.get(key);
  if (exp && exp > Date.now()) return true;
  try {
    if (cabinet === "adv") {
      await pool.resolve(bearer, undefined).adv?.options.getCampaignOptions(10);
    } else {
      await pool.resolve(undefined, bearer).pub?.getReportConfig();
    }
    validatedBearers.set(key, Date.now() + VALIDATED_BEARER_TTL_MS);
    return true;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return false;
    }
    return true;
  }
}

function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
}

export function createSessionServer(
  clientPool: ClientPool,
  cabinet: CabinetType,
  credentials: ToolCredentials,
): McpServer {
  const server = new McpServer(
    { name: "@kadam/mcp-server", version: SERVER_VERSION },
    { instructions: `Kadam MCP Server (${cabinet === "adv" ? "advertiser" : "publisher"} mode)` },
  );

  // Shared assembler (same as stdio). The advertiser OptionsRegistry is derived
  // from the session Bearer inside assembleServer, so the creative-formats
  // resource includes Banner Sizes; pub sessions have no advKey -> null.
  assembleServer(server, clientPool, credentials, {
    adv: cabinet === "adv",
    pub: cabinet === "pub",
  });

  return server;
}

function extractBearer(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

function buildPrm(config: Config, cabinet: CabinetType): object {
  const domain = cabinet === "adv" ? config.KADAM_ADV_DOMAIN : config.KADAM_PUB_DOMAIN;
  return {
    resource: `${domain}/mcp`,
    authorization_servers: [domain],
    bearer_methods_supported: ["header"],
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

export async function bootstrapHttp(): Promise<void> {
  const config = getConfig();
  const { MCP_HTTP_PORT: port, MCP_HTTP_HOST: host } = config;

  // One shared pool for the whole process: per-bearer clients (and their options
  // cache) persist across sessions. Interactive HTTP mode lowers the retry/timeout
  // budget unless overridden by env.
  const pool = new ClientPool({
    advBaseUrl: config.KADAM_ADV_API_BASE,
    pubBaseUrl: config.KADAM_PUB_API_BASE,
    maxRetries: config.KADAM_HTTP_MAX_RETRIES ?? 1,
    timeout: config.KADAM_HTTP_TIMEOUT_MS ?? 15_000,
    maxClients: config.KADAM_MAX_CLIENTS,
    optionsTtlMs: config.KADAM_OPTIONS_TTL_MS,
  });
  const sessionIdleMs = config.KADAM_SESSION_IDLE_MS;
  const maxSessions = config.KADAM_MAX_SESSIONS;
  const clientIdleMs = config.KADAM_CLIENT_IDLE_MS;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";
    const requestHost = req.headers.host ?? "";

    try {
      if (pathname === "/healthz" && method === "GET") {
        sendJson(res, 200, { status: "ok" });
        return;
      }

      if (pathname === "/.well-known/oauth-protected-resource" && method === "GET") {
        const cabinet = detectCabinet(requestHost, config);
        if (!cabinet) {
          sendJson(res, 404, { error: "Unknown host" });
          return;
        }
        sendJson(res, 200, buildPrm(config, cabinet));
        return;
      }

      if (pathname === "/mcp") {
        const cabinet = detectCabinet(requestHost, config);
        if (!cabinet) {
          sendJson(res, 404, { error: "Unknown host" });
          return;
        }

        const bearer = extractBearer(req);
        if (!bearer) {
          const domain = cabinet === "adv" ? config.KADAM_ADV_DOMAIN : config.KADAM_PUB_DOMAIN;
          res.writeHead(401, {
            "WWW-Authenticate": `Bearer resource_metadata="${domain}/.well-known/oauth-protected-resource"`,
            "Content-Type": "application/json",
          });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32001, message: "Unauthorized" },
              id: null,
            }),
          );
          return;
        }

        if (method !== "DELETE") {
          const valid = await validateUpstreamBearer(pool, bearer, cabinet);
          if (!valid) {
            const domain = cabinet === "adv" ? config.KADAM_ADV_DOMAIN : config.KADAM_PUB_DOMAIN;
            res.writeHead(401, {
              "WWW-Authenticate": `Bearer resource_metadata="${domain}/.well-known/oauth-protected-resource"`,
              "Content-Type": "application/json",
            });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32001, message: "Unauthorized: upstream API key rejected" },
                id: null,
              }),
            );
            return;
          }
        }

        if (method === "POST") {
          const body = await readBody(req);
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            sendJson(res, 400, {
              jsonrpc: "2.0",
              error: { code: -32700, message: "Parse error" },
              id: null,
            });
            return;
          }

          const existingSessionId = req.headers["mcp-session-id"] as string | undefined;

          if (existingSessionId && sessions.has(existingSessionId)) {
            const session = sessions.get(existingSessionId)!;
            if (!isSessionAuthorized(session, bearer, cabinet)) {
              sendJson(res, 403, {
                jsonrpc: "2.0",
                error: { code: -32001, message: "Token/cabinet mismatch" },
                id: null,
              });
              return;
            }
            touchSession(existingSessionId);
            await session.transport.handleRequest(req, res, parsed);
            return;
          }

          if (isInitializeRequest(parsed)) {
            const credentials = sessionCredentials(bearer, cabinet);
            pool.resolve(credentials.advKey, credentials.pubKey);

            const mcpServer = createSessionServer(pool, cabinet, credentials);

            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sessionId) => {
                evictExcessSessions(maxSessions);
                sessions.set(sessionId, {
                  transport,
                  server: mcpServer,
                  bearer,
                  cabinet,
                  lastActivity: Date.now(),
                });
                logger.info({ sessionId, cabinet }, "New HTTP session created");
              },
            });

            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid && sessions.has(sid)) {
                sessions.delete(sid);
                logger.info({ sessionId: sid }, "HTTP session closed");
              }
            };

            await mcpServer.connect(transport);
            await transport.handleRequest(req, res, parsed);
            return;
          }

          sendJson(res, 400, {
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          });
          return;
        }

        if (method === "GET") {
          const existingSessionId = req.headers["mcp-session-id"] as string | undefined;
          if (!existingSessionId || !sessions.has(existingSessionId)) {
            sendJson(res, 400, { error: "Invalid or missing session ID" });
            return;
          }
          const session = sessions.get(existingSessionId)!;
          if (!isSessionAuthorized(session, bearer, cabinet)) {
            sendJson(res, 403, { error: "Token/cabinet mismatch" });
            return;
          }
          touchSession(existingSessionId);
          await session.transport.handleRequest(req, res);
          return;
        }

        if (method === "DELETE") {
          const existingSessionId = req.headers["mcp-session-id"] as string | undefined;
          if (!existingSessionId || !sessions.has(existingSessionId)) {
            sendJson(res, 400, { error: "Invalid or missing session ID" });
            return;
          }
          const session = sessions.get(existingSessionId)!;
          if (!isSessionAuthorized(session, bearer, cabinet)) {
            sendJson(res, 403, { error: "Token/cabinet mismatch" });
            return;
          }
          await session.transport.handleRequest(req, res);
          return;
        }

        res.writeHead(405).end();
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      logger.error({ error, path: pathname, method }, "HTTP request error");
      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  server.listen(port, host, () => {
    logger.info(
      { port, host, advDomain: config.KADAM_ADV_DOMAIN, pubDomain: config.KADAM_PUB_DOMAIN },
      "MCP HTTP server listening",
    );
  });

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [sid, session] of sessions.entries()) {
      if (now - session.lastActivity > sessionIdleMs) {
        sessions.delete(sid);
        void session.transport.close().catch((e) => {
          logger.error({ sessionId: sid, error: e }, "Error closing idle session");
        });
        logger.info({ sessionId: sid }, "Evicted idle HTTP session");
      }
    }
    pool.evictIdle(clientIdleMs);
    for (const [k, exp] of validatedBearers) {
      if (exp <= now) validatedBearers.delete(k);
    }
  }, SESSION_SWEEP_MS);
  sweeper.unref();

  const shutdown = async () => {
    logger.info("Shutting down HTTP server...");
    clearInterval(sweeper);
    for (const [sid, session] of sessions.entries()) {
      try {
        await session.transport.close();
      } catch (e) {
        logger.error({ sessionId: sid, error: e }, "Error closing session");
      }
    }
    sessions.clear();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
