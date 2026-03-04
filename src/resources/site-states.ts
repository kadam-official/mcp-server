import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerSiteStatesResource(server: McpServer): void {
  server.resource("site-states", "kadam://reference/site-states", async () => ({
    contents: [
      {
        uri: "kadam://reference/site-states",
        mimeType: "text/plain",
        text: CONTENT,
      },
    ],
  }));
}

const CONTENT = `
Publisher Site Lifecycle States:
  oninit      -> Site created, awaiting verification setup
  onconfirm   -> Verification code placed, awaiting check
  onstat      -> Collecting initial statistics
  onmoderate  -> Under moderation review
  accepted    -> Approved, ads serving
  deny        -> Rejected by moderation (can resubmit)
  freeze      -> Temporarily frozen (policy violation or inactivity)
`;
