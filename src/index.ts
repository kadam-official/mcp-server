#!/usr/bin/env node
import { getConfig } from "./config.js";
import { logger } from "./logger.js";

async function main() {
  const config = getConfig();

  if (config.MCP_TRANSPORT === "http") {
    const { bootstrapHttp } = await import("./http-bootstrap.js");
    await bootstrapHttp();
  } else {
    const { bootstrapStdio } = await import("./stdio-bootstrap.js");
    await bootstrapStdio();
  }
}

main().catch((error) => {
  logger.fatal({ error }, "Failed to start server");
  process.exit(1);
});
