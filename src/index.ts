#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ClientPool } from "./api/client-pool.js";
import { getConfig } from "./config.js";
import { createMcpServer } from "./server-factory.js";
import { logger } from "./logger.js";

async function main() {
  const config = getConfig();

  const clientPool = new ClientPool({
    advBaseUrl: config.KADAM_ADV_API_BASE,
    pubBaseUrl: config.KADAM_PUB_API_BASE,
  });

  const server = createMcpServer(clientPool);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Server connected via stdio transport");
}

main().catch((error) => {
  logger.fatal({ error }, "Failed to start server");
  process.exit(1);
});
