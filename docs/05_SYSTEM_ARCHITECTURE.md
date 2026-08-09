# 05 — System Architecture

## Stack
Next.js App Router, strict TypeScript, React, Tailwind/shadcn-style components, Zod runtime schemas, PostgreSQL production-minded repository with deterministic seed adapter initially, unit/rule/scenario/integration/golden/replay tests, Vercel-friendly Node LTS runtime, provider-independent AI adapter, future TypeScript MCP adapter.

## Dependency direction
`UI / Ask Gaurd / MCP → application services → deterministic domain/rules → repositories/evidence`.

`packages/domain` has zero AI dependencies. Accounting rules never live in React components, prompts, MCP adapters, or exports.

## Suggested packages
`domain`, `rules`, `evidence`, `workflows`, `services`, `data`, `permissions`, `audit`, `ai`, `mcp`.

## NetSuite
Read-only `NetSuiteAdapter` for Items, POs, Item Receipts, Vendor Bills, Inventory Counts/Details/Adjustments, Sales Orders, Item Fulfillments, Customer Invoices, and GL balances. Preserve source record type/internal ID/transaction number/line ID/last modified/retrieved/source hash.

## Reliability
Version rules/policies/configs/datasets; append state history; fail visible; target recalculation plus full replay; no destructive evidence edits; SOD; period lock/reopen; source health; evidence graph; deterministic Demo Reset; cached values are derived, not authoritative.
