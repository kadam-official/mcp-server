import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { ClientPool } from "./api/client-pool.js";
import { BearerValidator } from "./bearer-validation.js";
import { getConfig, type Config } from "./config.js";
import { isSessionAuthorized, sessionCredentials, type CabinetType } from "./http-session.js";
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

/** Public host the MCP resource is served on (dedicated subdomain, or the
 * cabinet host when unset / embedded). This is the RFC 9728 `resource`. */
export function mcpDomain(config: Config, cabinet: CabinetType): string {
  return cabinet === "adv"
    ? (config.KADAM_ADV_MCP_DOMAIN ?? config.KADAM_ADV_DOMAIN)
    : (config.KADAM_PUB_MCP_DOMAIN ?? config.KADAM_PUB_DOMAIN);
}

export function buildPrm(config: Config, cabinet: CabinetType): object {
  // Resource = the MCP host; the Authorization Server stays the cabinet host
  // (login/consent/token). They coincide in embedded mode.
  const asDomain = cabinet === "adv" ? config.KADAM_ADV_DOMAIN : config.KADAM_PUB_DOMAIN;
  return {
    resource: `${mcpDomain(config, cabinet)}/mcp`,
    authorization_servers: [asDomain],
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

  // Each HTTP deployment serves exactly one cabinet (partners-mcp.* and pub-mcp.*
  // are separate services/pods, each fronted by its own ingress), so the cabinet
  // is fixed here rather than detected from the request Host.
  const cabinet = config.KADAM_MCP_CABINET;
  if (!cabinet) {
    throw new Error(
      "KADAM_MCP_CABINET must be set to 'adv' or 'pub' in HTTP mode (one cabinet per deployment)",
    );
  }

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
  const bearerValidator = new BearerValidator(pool);
  const sessionIdleMs = config.KADAM_SESSION_IDLE_MS;
  const maxSessions = config.KADAM_MAX_SESSIONS;
  const clientIdleMs = config.KADAM_CLIENT_IDLE_MS;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    try {
      if (pathname === "/healthz" && method === "GET") {
        sendJson(res, 200, { status: "ok" });
        return;
      }

      if (pathname === "/.well-known/oauth-protected-resource" && method === "GET") {
        sendJson(res, 200, buildPrm(config, cabinet));
        return;
      }

      if (pathname === "/mcp") {
        const bearer = extractBearer(req);
        if (!bearer) {
          const rmDomain = mcpDomain(config, cabinet);
          res.writeHead(401, {
            "WWW-Authenticate": `Bearer resource_metadata="${rmDomain}/.well-known/oauth-protected-resource"`,
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
          const valid = await bearerValidator.validate(bearer, cabinet);
          if (!valid) {
            const rmDomain = mcpDomain(config, cabinet);
            res.writeHead(401, {
              "WWW-Authenticate": `Bearer resource_metadata="${rmDomain}/.well-known/oauth-protected-resource"`,
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
    bearerValidator.prune(now);
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
