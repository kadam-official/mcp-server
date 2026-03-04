import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolWrapper } from "../../src/middleware/tool-wrapper.js";
import type { ToolModule } from "../../src/types/tool-module.js";

export async function createToolClient(module: ToolModule) {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  const wrapper = new ToolWrapper(server);
  module.register(wrapper);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

export function getTextFromResult(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text: string }> })?.content;
  return content?.[0]?.text ?? "";
}
