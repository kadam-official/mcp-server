import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { ClientPool } from "./api/client-pool.js";
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

// Evict sessions with no activity for this long to bound memory when clients
// disconnect without sending DELETE.
const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_SWEEP_MS = 5 * 60 * 1000; // sweep every 5 minutes

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

        if (method === "POST") {
          const body = await readBody(req);
          const parsed = JSON.parse(body);

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
            const pool = new ClientPool({
              advBaseUrl: config.KADAM_ADV_API_BASE,
              pubBaseUrl: config.KADAM_PUB_API_BASE,
            });
            pool.resolve(credentials.advKey, credentials.pubKey);

            const mcpServer = createSessionServer(pool, cabinet, credentials);

            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sessionId) => {
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
      if (now - session.lastActivity > SESSION_IDLE_MS) {
        sessions.delete(sid);
        void session.transport.close().catch((e) => {
          logger.error({ sessionId: sid, error: e }, "Error closing idle session");
        });
        logger.info({ sessionId: sid }, "Evicted idle HTTP session");
      }
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
