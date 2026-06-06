#!/usr/bin/env node
/**
 * Production smoke runner — probes the hosted Kadam MCP endpoint over HTTP
 * with a long-lived sandbox bearer and exits non-zero if the handshake fails
 * or no tools are registered.
 *
 * Strictly read-only: it runs `initialize` + `tools/list` only. Per-tool
 * read-only probes can be added once tool arg-shapes are pinned; for now this
 * proves the deployed endpoint is live, accepts the bearer, and exposes tools.
 *
 * Config (CI variables):
 *   KADAM_MCP_PROD_URL    default https://partners.kadam.net/mcp (advertiser cabinet)
 *   KADAM_MCP_PROD_TOKEN  long-lived sandbox bearer (secret + masked)
 *
 * Exit: 0 = healthy, 1 = unexpected result, 2 = transport/handshake error.
 */

const ORIGIN = process.env.KADAM_MCP_PROD_URL ?? "https://partners.kadam.net/mcp";
const TOKEN = process.env.KADAM_MCP_PROD_TOKEN;

if (!TOKEN) {
  process.stderr.write("KADAM_MCP_PROD_TOKEN env var is required (sandbox bearer).\n");
  process.exit(2);
}

function createSession() {
  let sessionId;
  async function rpc(body) {
    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (sessionId !== undefined) headers["mcp-session-id"] = sessionId;
    const res = await fetch(ORIGIN, { method: "POST", headers, body: JSON.stringify(body) });
    const issued = res.headers.get("mcp-session-id");
    if (issued && sessionId === undefined) sessionId = issued;
    const text = await res.text();
    const payload = text.startsWith("event:") ? (text.split("data:", 2)[1]?.trim() ?? "") : text;
    if (payload === "") return { jsonrpc: "2.0", id: body.id ?? null };
    return JSON.parse(payload);
  }
  return { rpc };
}

async function main() {
  const { rpc } = createSession();

  const init = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "prod-smoke", version: "0.1.0" },
    },
  });
  if (init.error) {
    process.stderr.write(`initialize failed: ${init.error.message}\n`);
    return 2;
  }
  const info = init.result?.serverInfo;
  process.stdout.write(`[INIT] server=${info?.name ?? "?"}@${info?.version ?? "?"}\n`);
  await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });

  const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const count = list.result?.tools?.length ?? 0;
  if (count < 1) {
    process.stderr.write(`tools/list returned ${count} tools — expected at least 1\n`);
    return 1;
  }
  process.stdout.write(`[LIST] tools=${count}\n[OK] endpoint healthy\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (cause) => {
    process.stderr.write(`Fatal: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exit(2);
  },
);
