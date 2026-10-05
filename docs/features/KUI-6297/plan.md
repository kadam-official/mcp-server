# KUI-6297 / KUI-7223 MCP implementation plan

## Goal

Support the Advertiser API v1 Traffic Sources / Audience Engagement contract
(KUI-7223, PRD Story 11) in the MCP campaign tools. Backend contract and
epic-level decisions live in the backend repository
(`docs/features/KUI-6297/plan.md`, section "Part 3"); this file records only
the MCP slice. Technical behaviour: [README](README.md).

## Scope

1. `kadam_adv_create_campaign` and `kadam_adv_update_campaign` accept
   `trafficSources` (`proven|all`) and `audienceEngagementLevels`
   (comma-separated canonical slugs `very_high,high,medium,low,not_rated`).
2. Both keys join `CAMPAIGN_WRITABLE_FIELDS` so the read-modify-write update
   round-trips the current state and an explicit change replaces it.
3. `kadam_adv_get_campaign` prints Traffic Sources and Audience Engagement
   when the API returns them (supported formats only).
4. Vitest coverage for argument mapping, writable-field round trip and detail
   output; `typecheck`, `lint`, `test` gates.

## Non-goals

- New MCP resources/prompts about engagement levels, exposing
  `campaigns/options` support flags, publishing a package version, any
  publisher-side change.

## Contract notes

- The API rejects the fields with 422 for unsupported formats; the tools pass
  the values through and surface the API error text unchanged.
- Under `proven` the API ignores levels; the tools do not pre-validate that
  combination beyond the enum/slug shape.

## Acceptance evidence plan

- Unit: create mapping (`trafficSources`, slug list → array, invalid slug
  rejected client-side by zod), update merge (explicit override vs
  round-trip of current values), detail formatter with and without the keys.
- Gates: `npm run typecheck`, `npm run lint`, `npm run test:unit`.

## Iteration log

- 2026-09-11: Worktree `mcp-server-kui6297` created on local branch
  `KUI-6297` from `origin/main`; baseline typecheck clean, vitest 29 files /
  306 tests. Plan written before code.
- 2026-09-11: Implemented. `campaigns.ts`: both keys added to
  `CAMPAIGN_WRITABLE_FIELDS`; shared `trafficSourceFields` zod args on create
  and update; `parseAudienceEngagementLevels` helper (trim/split, reject
  unknown or empty listing the five canonical slugs, dedupe, canonical order);
  explicit `mapField` cases on create; update merge overrides round-tripped
  values and deletes a round-tripped empty `audienceEngagementLevels` array
  (legacy all-banned campaign) so an unrelated edit preserves state instead of
  a 422. `campaign-detail.ts`: keys added to `HANDLED_KEYS`; targeting section
  renders `Traffic Sources: All Sources|Proven Sources` and
  `Audience Engagement: <labels>` (`none enabled` for `[]`; lines absent when
  the API omits the keys). `src/api/schemas/advertiser.ts` verified unchanged
  (`getCampaign` is a schemaless pass-through). 13 new vitest cases across
  campaign-mapping (5), campaigns (5), campaign-detail (3).
- 2026-09-11: Independent cross-model review (Terra Medium, `mr-review`):
  PASS — no Critical, no Suggestions; reviewer re-ran `git diff --check`,
  typecheck, lint and `test:unit` (29 files / 319 tests).

## Executed evidence (2026-09-11)

- `npm run typecheck` → clean (`tsc --noEmit`, exit 0).
- `npm run lint` → clean (`eslint src/`, exit 0).
- `npm run format:check` → "All matched files use Prettier code style!".
- `npm run test:unit` → 29 files / 319 tests passed (baseline 306 + 13 new),
  exit 0.

## Manager Acceptance (2026-09-14)

ACCEPTED WITH NOTES (Sol Max) together with the backend Part 3 revision: AC 6
(MCP arguments, update merge, output rendering) PASS on typecheck/lint/prettier

- vitest 29/319; cross-model review (Terra) PASS; diff limited to two tool
  files, three test files and these docs. Note (resolved): rules impact stated
  explicitly below.

## Rules impact

None. The new arguments follow the existing `CAMPAIGN_WRITABLE_FIELDS` /
`pickWritable` / `HANDLED_KEYS` conventions; no tool-authoring rule changed.
