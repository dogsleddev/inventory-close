# Claude Code Stage 02 — Deterministic Dataset Generator and NetSuite Fixtures

Read `docs/02_COMPANY_CONTEXT.md`, `docs/06_DATA_MODEL.md`, `docs/07_MOCK_DATASET_SPEC.md`, `CANONICAL_SPEC.md`, and `golden/baseline.json`.

## Goal

Generate the full deterministic synthetic FY2026 source dataset from the locked seed. This stage creates **source facts**, not final accounting conclusions.

## Implement

Create deterministic generators/fixtures for at least:

- SKUs and locations
- fictional customers and vendors
- 1,500 inventory units / serial identities
- NetSuite items and inventory state
- NetSuite purchase orders
- NetSuite item receipts
- NetSuite vendor bills
- NetSuite inventory counts and count details
- NetSuite inventory adjustments
- NetSuite sales orders
- NetSuite item fulfillments
- NetSuite customer invoices
- NetSuite gross inventory GL balances
- carrier events
- installation/deployment records
- telemetry
- contracts / controlled missing-contract state
- RMA / ReturnLoop source records
- CRM records
- forecast records
- physical year-end count source records
- synthetic source health states
- deterministic scenario-event inputs

Preserve source-system distinctions. A physical receipt is not automatically the same object as a NetSuite Item Receipt. Item Fulfillment is not the same as carrier movement.

## Exact controls that must pass

- 1,500 units
- $4,800,000 gross carrying value
- exact SKU controls in `07_MOCK_DATASET_SPEC.md`
- exact location controls in `07_MOCK_DATASET_SPEC.md`
- exact classification controls
- gross inventory GL = $4,812,450
- reserve = $54,000 credit, tracked separately
- year-end count book population = 1,065
- source health inputs reproduce 91.67%

Generate a dataset manifest with seed, generator version, row counts, source hashes, business totals, and dataset hash.

## Important

Do not manually seed `EXC-001` through `EXC-015` as final exceptions. Seed the facts that will cause Stage 03 rules to derive them.

## Acceptance gate

All dataset-control tests pass exactly. Regenerating with the same seed produces equivalent canonical source records and totals. No UI needed.

Report generated row counts, control totals, tests, assumptions, and readiness for Stage 03.
