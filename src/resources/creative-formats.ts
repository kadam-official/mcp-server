import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCreativeFormatsResource(server: McpServer): void {
  server.resource("creative-formats", "kadam://reference/creative-formats", async () => ({
    contents: [
      {
        uri: "kadam://reference/creative-formats",
        mimeType: "text/plain",
        text: CONTENT,
      },
    ],
  }));
}

const CONTENT = `
Creative Format Requirements by Campaign Type:

Push / In-Page Push:
  Required: title (max 30 chars), text (max 45 chars), url
  Optional: iconUrl (192x192), imageUrl (492x328), bid, startDate, endDate

Native:
  Required: title (max 75 chars), text (max 500 chars), url, iconUrl, imageUrl
  Optional: bid, startDate, endDate

Banner:
  Required: url, imageUrl (or HTML5 ZIP)
  Auto-detected: bannerSizeId from image dimensions
  Common sizes: 300x250, 728x90, 160x600, 320x50, 300x600
  Optional: name, bid, isHtml5, startDate, endDate

Video:
  Required: url, video file (MP4)
  Optional: bid, startDate, endDate

Popunder:
  Required: url
  No images or text needed.
  Optional: bid, pauseAfterModeration, startDate, endDate
`;
