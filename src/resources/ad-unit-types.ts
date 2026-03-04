import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerAdUnitTypesResource(server: McpServer): void {
  server.resource("ad-unit-types", "kadam://reference/ad-unit-types", async () => ({
    contents: [
      {
        uri: "kadam://reference/ad-unit-types",
        mimeType: "text/plain",
        text: CONTENT,
      },
    ],
  }));
}

const CONTENT = `
Publisher Ad Unit Formats:
- Native (type: 0): Teaser/native ad blocks blending with site content
- Banner (type: 10): Display banner ads in standard IAB sizes
- Push (type: 20): Browser push notification subscriptions
- Popunder (type: 30): Full-page ads opening in background tab
- In-Page Push (type: 100): Push-style notifications shown on page (no subscription)
`;
