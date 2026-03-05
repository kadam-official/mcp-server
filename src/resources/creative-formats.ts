export const CREATIVE_FORMATS_CONTENT = `
Creative Format Requirements by Campaign Type:

IMPORTANT: The API uses multipart/form-data with file uploads. Provide image URLs
and the MCP server will download and upload them automatically.

Push / In-Page Push:
  Required: title (max 30 chars), text (max 45 chars), url
  Required images: imageUrl (icon, min 192x192), mainImageUrl (min 492x328)
  Optional: bid, startDate, stopDate

Native (Teaser):
  Required: title (max 75 chars), url
  Required images: imageUrl (icon, min 500x500), mainImageUrl (min 492x328)
  Optional: bid, startDate, stopDate

Banner:
  Required: url, imageUrl (must match exact banner dimensions), sizeId
  Common sizeId values: 25=300x250, 35=728x90, 75=160x600, 80=320x50, 300=300x600
  Optional: bid, startDate, stopDate

Video:
  Required: title (max 30 chars), url, videoUrl (MP4 file, max 30MB)
  Optional: bid, startDate, stopDate

Popunder (Clickunder):
  Does NOT support separate creatives.
  The campaign URL itself serves as the ad.
  Creatives are auto-managed by the campaign.
`;
