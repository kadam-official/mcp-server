# @kadam-net/mcp-server

[![npm version](https://img.shields.io/npm/v/@kadam-net/mcp-server)](https://www.npmjs.com/package/@kadam-net/mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@kadam-net/mcp-server)](https://www.npmjs.com/package/@kadam-net/mcp-server)
[![license](https://img.shields.io/npm/l/@kadam-net/mcp-server)](https://github.com/kadam-official/mcp-server/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/@kadam-net/mcp-server)](https://nodejs.org)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-blue)](https://registry.modelcontextprotocol.io)

MCP server for [Kadam](https://kadam.net) ad network — manage campaigns, creatives, audiences, sites, and analytics via AI agents.

Built on the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP), the open standard for connecting LLMs to external tools and data.

## Install (one click)

### Cursor

<a href="https://kadam-official.github.io/mcp-server/install.html"><img alt="Install in Cursor" src="https://cursor.com/deeplink/mcp-install-dark.png" height="32" /></a>

Or add manually to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kadam": {
      "command": "npx",
      "args": ["-y", "@kadam-net/mcp-server"],
      "env": {
        "KADAM_ADV_API_KEY": "your-advertiser-api-key",
        "KADAM_PUB_API_KEY": "your-publisher-api-key"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add kadam -- npx -y @kadam-net/mcp-server
```

Then set the env var: `export KADAM_ADV_API_KEY=your-key`

### Claude Desktop

<a href="https://github.com/kadam-official/mcp-server/releases/latest/download/kadam-mcp-server.mcpb"><img alt="Download for Claude Desktop" src="https://img.shields.io/badge/Claude_Desktop-Download_.mcpb-orange?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMSAxNXYtNEg4bDQtNiA0IDZoLTN2NGgtMnoiLz48L3N2Zz4=" height="32" /></a>

Download → double-click → Install. Or add manually to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "kadam": {
      "command": "npx",
      "args": ["-y", "@kadam-net/mcp-server"],
      "env": {
        "KADAM_ADV_API_KEY": "your-advertiser-api-key",
        "KADAM_PUB_API_KEY": "your-publisher-api-key"
      }
    }
  }
}
```

### Any MCP client (universal one-liner)

```bash
npx add-mcp @kadam-net/mcp-server
```

### Docker

```bash
docker run -i --rm \
  -e KADAM_ADV_API_KEY=your-key \
  kadam/mcp-server:latest
```

### npm global

```bash
npm install -g @kadam-net/mcp-server
KADAM_ADV_API_KEY=your-key kadam-mcp-server
```

## Configuration

| Variable | Required | Description |
|---|---|---|
| `KADAM_ADV_API_KEY` | One of two | Advertiser API key from [partners.kadam.net](https://partners.kadam.net) -> Profile -> API |
| `KADAM_PUB_API_KEY` | One of two | Publisher API key from [pub.kadam.net](https://pub.kadam.net) -> Profile -> API |
| `KADAM_ADV_API_BASE` | No | Advertiser API URL (default: `https://partners.kadam.net/api/v1`) |
| `KADAM_PUB_API_BASE` | No | Publisher API URL (default: `https://pub.kadam.net/api`) |
| `LOG_LEVEL` | No | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` (default: `info`) |

At least one API key must be provided in stdio mode. In HTTP mode, tokens are passed per-request via Bearer authentication.

### HTTP Transport (multi-tenant deployment)

For server-side deployment serving multiple users:

| Variable | Required | Description |
|---|---|---|
| `MCP_TRANSPORT` | No | `"stdio"` (default) or `"http"` |
| `MCP_HTTP_PORT` | No | HTTP port (default: `8080`) |
| `MCP_HTTP_HOST` | No | Bind address (default: `0.0.0.0`) |
| `KADAM_ADV_DOMAIN` | No | Advertiser domain for PRM (default: `https://partners.kadam.net`) |
| `KADAM_PUB_DOMAIN` | No | Publisher domain for PRM (default: `https://pub.kadam.net`) |

```bash
docker run -d --name kadam-mcp \
  -e MCP_TRANSPORT=http \
  -p 8080:8080 \
  kadam/mcp-server:latest
```

### Connecting via HTTP (Cursor / Claude)

```json
{
  "mcpServers": {
    "kadam-adv": {
      "url": "https://partners.kadam.net/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ADV_API_KEY"
      }
    }
  }
}
```

### Connecting via OAuth (ChatGPT)

Add `https://partners.kadam.net/mcp` (advertiser) or `https://pub.kadam.net/mcp` (publisher) as Server URL in ChatGPT settings. OAuth discovery, registration, and login happen automatically.

## Tools (30)

### Advertiser Tools (21)

Requires `KADAM_ADV_API_KEY`.

#### Campaigns

| Tool | Description | Annotations |
|---|---|---|
| `kadam_adv_list_campaigns` | List campaigns with filters (folder, status, type, date, search) and pagination | readOnly |
| `kadam_adv_create_campaign` | Create campaign with full targeting (countries, devices, OS, browsers, age, gender, audiences) | — |
| `kadam_adv_update_campaign` | Update any campaign fields by ID | — |
| `kadam_adv_set_campaign_status` | Bulk status change (active/paused/archived) for comma-separated IDs | idempotent |

#### Bid Management

| Tool | Description | Annotations |
|---|---|---|
| `kadam_adv_update_campaign_bid` | Update bid for a single campaign (lightweight, no full payload). Falls back to current countries if omitted | idempotent |
| `kadam_adv_bulk_update_bids` | Update bids for multiple campaigns at once (all must share the same pricing model) | idempotent |
| `kadam_adv_update_site_bids` | Set per-site (zone) bids: static (`0.05`), multiplier (`x1.5`), or remove (`0`) | idempotent |

#### Campaign Folders

| Tool | Description | Annotations |
|---|---|---|
| `kadam_adv_list_campaign_folders` | List folders with campaign counts and budgets | readOnly |
| `kadam_adv_create_campaign_folder` | Create a new folder (name min 4 chars) | — |
| `kadam_adv_update_campaign_folder` | Update folder budgets and distribution | — |

#### Creatives

| Tool | Description | Annotations |
|---|---|---|
| `kadam_adv_list_creatives` | List creatives by campaign, status, or search query | readOnly |
| `kadam_adv_create_creative` | Create creative for a campaign (goes through moderation) | — |
| `kadam_adv_update_creative` | Update creative fields | — |
| `kadam_adv_set_creative_status` | Bulk status change for creatives | idempotent |

#### Audiences

| Tool | Description | Annotations |
|---|---|---|
| `kadam_adv_list_audiences` | List audiences with search and sorting | readOnly |
| `kadam_adv_get_audience` | Get detailed audience info by ID | readOnly |
| `kadam_adv_create_audience` | Create audience (pixel, code, fingerprint, or S2S) | — |
| `kadam_adv_update_audience` | Update audience settings | — |
| `kadam_adv_delete_audience` | Delete audience permanently (requires `confirm: true`) | destructive |

#### Finance & Statistics

| Tool | Description | Annotations |
|---|---|---|
| `kadam_adv_list_finance_operations` | Transaction history (deposits, charges, refunds) | readOnly |
| `kadam_adv_get_stats` | Unified statistics — 3 report types via `reportType` param: `custom` (report builder with dimension/metric mapping), `sites` (per-site breakdown), `postbacks` (conversion logs) | readOnly |

### Publisher Tools (9)

Requires `KADAM_PUB_API_KEY`.

#### Sites (Sources)

| Tool | Description | Annotations |
|---|---|---|
| `kadam_pub_list_sources` | List publisher sites with stats | readOnly |
| `kadam_pub_create_source` | Add a new site (starts verification flow) | — |
| `kadam_pub_get_source` | Get detailed site info | readOnly |
| `kadam_pub_update_source` | Update site name | — |
| `kadam_pub_set_source_status` | Change site status (active/paused/archived/unarchived) | idempotent |

#### Ad Units

| Tool | Description | Annotations |
|---|---|---|
| `kadam_pub_list_ad_units` | List ad units for a site, filter by format (native/banner/push/popunder/inpagepush) | readOnly |
| `kadam_pub_set_ad_unit_status` | Change ad unit status (active/paused/archived/restored) | idempotent |

#### User & Statistics

| Tool | Description | Annotations |
|---|---|---|
| `kadam_pub_get_user_info` | Get publisher account info and balance | readOnly |
| `kadam_pub_get_stats` | Publisher statistics with human-readable dimension/metric mapping | readOnly |

## Resources (7)

Static reference data the agent can read before calling tools:

| URI | Description |
|---|---|
| `kadam://reference/campaign-types` | All ad format types with IDs, features, pricing, and creative specs |
| `kadam://reference/pricing-models` | CPC, CPM, CPV, CPA Target with IDs and descriptions |
| `kadam://reference/creative-formats` | Creative requirements per campaign type |
| `kadam://reference/ad-unit-types` | Publisher ad unit formats with IDs |
| `kadam://reference/site-states` | Publisher site lifecycle states |
| `kadam://reference/report-dimensions` | Available dimensions and metrics for statistics tools |
| `kadam://reference/api-overview` | General Kadam API capabilities overview |

## Prompts (4)

Pre-built workflow templates that guide the agent through multi-step operations:

| Prompt | Description | Arguments |
|---|---|---|
| `kadam_launch_campaign` | Step-by-step campaign creation (check types -> create folder -> create campaign -> add creatives) | `type`, `name`, `url`, `budget` |
| `kadam_campaign_performance` | Campaign performance analysis with optimization recommendations | `campaignId`, `period` |
| `kadam_optimize_sites` | Analyze site performance and suggest blacklist/whitelist changes | `campaignId`, `minClicks`, `maxCPA` |
| `kadam_account_overview` | Full account overview — campaigns, spend, top performers | — |

## Architecture

```
src/
├── index.ts                  # Entry point, server instructions, transport
├── config.ts                 # Zod-validated env config with cache
├── errors.ts                 # AuthError class
├── logger.ts                 # Pino structured logging (stderr)
├── output-formatter.ts       # Text formatting + 50KB truncation
├── middleware/
│   └── tool-wrapper.ts       # Auth, error handling, logging middleware
├── api/
│   ├── http-client.ts        # Generic HTTP client with retry/429/timeout
│   ├── partners-client.ts    # Advertiser API (lazy singleton)
│   └── pub-client.ts         # Publisher API (lazy singleton)
├── utils/
│   ├── pagination.ts         # Shared pagination extraction
│   ├── cache-once.ts         # Generic async cache-once utility
│   └── dimension-mapper.ts   # Stats dimension name→ID resolution
├── types/
│   ├── common.ts             # Shared types (ApiListResponse, ReportConfig)
│   ├── advertiser.ts         # Campaign, Creative, Audience types + maps
│   ├── publisher.ts          # Source, AdUnit, PubUser types + maps
│   └── tool-module.ts        # ToolModule interface
├── tools/
│   ├── advertiser/           # 21 tools across 6 modules
│   └── publisher/            # 9 tools across 4 modules
├── resources/                # 7 static reference resources
└── prompts/                  # 4 workflow prompts
```

### Key Design Decisions

- **ToolWrapper middleware** — centralized auth validation, error formatting, and logging for all 30 tools
- **Lazy singleton API clients** — one `HttpClient` instance per product, created on first use
- **Output truncation** — hard 50KB limit per response with `maxResults` (default 25, max 100) to prevent LLM context overflow
- **Human-readable output** — formatted tables, aligned entities, pagination metadata instead of raw JSON
- **Tool annotations** — `readOnlyHint`, `destructiveHint`, `idempotentHint` to guide agent behavior
- **Server instructions** — usage patterns and constraints sent to the LLM on connection
- **Dimension mapping** — stats tools accept human-readable names ("clicks", "spend") and resolve them to API IDs internally

## Development

### Prerequisites

- Node.js >= 18
- npm

### Setup

```bash
git clone https://github.com/kadam-official/mcp-server.git
cd mcp-server
npm install
cp .env.example .env  # Fill in your API keys
```

### Commands

```bash
npm run dev             # Watch mode with tsx
npm run build           # Production build with Vite
npm run start           # Run built server
npm run typecheck       # TypeScript check
npm run lint            # ESLint
npm run format          # Prettier
npm test                # Run 82 tests
npm run test:coverage   # Tests with V8 coverage
npm run inspect         # MCP Inspector (visual debugger)
```

### Testing

202 tests across 23 files using Vitest + MCP SDK InMemoryTransport:

- **Unit tests** — output formatter, config, HTTP client (mocked fetch)
- **Middleware tests** — ToolWrapper auth, error formatting, logging
- **Integration tests** — full server with all 30 tools, 7 resources, 4 prompts via in-memory MCP client
- **Tool handler tests** — each tool module with mocked API clients

```bash
npm test
# Test Files  23 passed (23)
#      Tests  202 passed (202)
```

### MCP Inspector

The [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) provides a visual interface for testing:

```bash
npm run build
npm run inspect
```

## Deployment

### Docker

```bash
docker build -t kadam-mcp-server .
docker run -i --rm -e KADAM_ADV_API_KEY=... kadam-mcp-server
```

### CI/CD

The `.gitlab-ci.yml` pipeline includes:
- **lint** — ESLint + TypeScript check
- **test** — Vitest with coverage
- **build** — Vite production build
- **publish** — npm publish + Docker push (manual trigger)

## License

MIT
