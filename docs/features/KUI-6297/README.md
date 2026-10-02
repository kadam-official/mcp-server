# KUI-6297 — Traffic Sources / Audience Engagement in MCP campaign tools

Part of epic [KUI-6297](https://jira.sdev.pw/browse/KUI-6297), task
[KUI-7223](https://jira.sdev.pw/browse/KUI-7223). Backend/API contract is
documented in the backend repository (`docs/features/KUI-6297/README.md`);
this page covers the MCP surface only. Plan and evidence: [plan.md](plan.md).

## Tool arguments

| Tool                                                     | Argument                   | Type                                                  | API field                          |
| -------------------------------------------------------- | -------------------------- | ----------------------------------------------------- | ---------------------------------- |
| `kadam_adv_create_campaign`, `kadam_adv_update_campaign` | `trafficSources`           | `proven` \| `all`                                     | `trafficSources`                   |
| `kadam_adv_create_campaign`, `kadam_adv_update_campaign` | `audienceEngagementLevels` | comma-separated `very_high,high,medium,low,not_rated` | `audienceEngagementLevels` (array) |

- Both arguments are optional. Omitting them on create lets the API apply
  `all` plus the server-side default levels; omitting them on update keeps the
  current state (the update tool also round-trips the values read from
  `GET /campaigns/{id}`).
- The fields are accepted by the API only for supported formats (popunder at
  release, configured server-side). For other formats the API answers 422 and
  the tool returns that error text.
- `proven` means the EasyStart pool; the API ignores levels in that case.
- `audienceEngagementLevels` is validated client-side for shape only: unknown
  slugs or an empty list raise a tool error listing the five canonical slugs;
  duplicates are deduped and the canonical order is applied. The
  proven+levels combination and format support are left to the API.
- On update, a round-tripped empty `audienceEngagementLevels` array (legacy
  campaign with every level banned) is dropped from the payload so unrelated
  edits preserve the state instead of triggering the API's
  "at least one level" 422.

## Output

`kadam_adv_get_campaign` prints `Traffic Sources: All Sources | Proven Sources`
and `Audience Engagement: Very High, High, Medium` (slug→label:
very_high→Very High, high→High, medium→Medium, low→Low, not_rated→Not rated)
in the Targeting section when the API returns the keys; the lines are absent
for unsupported formats. An empty levels array renders
`Audience Engagement: none enabled`.
