# KUI-6658 plan (kadam/api-mcp)

## Goal

MCP campaign create/update sends the new targeting contract: `mainstream`
token and Adult parent `1001` / subcategory IDs — not a flattened Mainstream
numeric tree.

Sources: [Jira](https://jira.sdev.pw/browse/KUI-6658),
[PRD](https://confluence.sdev.pw/pages/viewpage.action?pageId=4642967052).
Backend: `backend-kui6658` branch `KUI-6658`.

## Architecture

- Default create categories = top-level option ids only (`1001` +
  `mainstream`). Adult children are not expanded client-side (create would
  reject those IDs as explicit mainstream).
- Keyword `adult` maps to parent `1001`.
- `kadam://reference/categories` copy matches Adult + Mainstream leaf.

## Non-goals

Extended bids / report category trees, publisher tools, generated
`dist-mcpb/` artifacts.

## Verification

```
npm run test:unit
npm run typecheck
```

Do not commit `dist-mcpb/`.

## Rules impact

none — MCP follows the advertiser API contract from kadam/ui.
