# Changelog

## FY2026-DEMO-v1.2.0 — costing, off-book custody and disposal, purchase price variance

Adds five things the FY2026 close could describe but not evidence. Every
addition is generator-produced and none of them reaches the rule engine, so
**no control total, exception, blocker or readiness figure moves**: 1,500
units · $4,800,000 subledger · $4,812,450 gross GL · $12,450 difference · 15
exceptions · 7 blockers · $198,950 exposure · 81.42% readiness · 17/21 PBC ·
91.67% source health are all unchanged. Only the dataset version and its
hashes move.

- `costComponents` — the standard-cost build-up. Each SKU's five components
  sum **exactly** to its locked unit cost; the generator refuses to emit a
  stack that does not.
- `periodCosts` — FY2026 pools deliberately kept out of inventory (R&D,
  prototype materials, qualification, idle capacity), each with its basis.
  These are expense accounts and never appear in `glBalances`.
- `consignmentInUnits` — 12 vendor-owned units held on site. A separate
  collection so they cannot be summed into the 1,500; value is recorded as
  the owner's stated value, because the company has no cost basis in them.
- `dispositions` — four FY2026 disposals (two scrapped, one returned to
  vendor, one salvage sale) on serials minted outside the book population.
- Purchase price variance on three vendor bills — the largest fully matched
  FY2026 order per vendor. Inventory is at standard cost, so PPV is expensed
  rather than capitalized: it is a match-level attribute and never a
  sixteenth exception.

## Spec correction — build-order mnemonic in docs/13

`docs/13_BUILD_PLAN.md` line 3 read `DATA → SCHEMAS → …`, inverting the
authoritative order in `CANONICAL_SPEC.md` §16 (schemas/types before the
dataset generator) and contradicting the workstream list in the same file.
Corrected to `SCHEMAS → DATA → …`. `SPEC_MANIFEST.json` hash updated for
that file. No financial control totals, exceptions, identifiers, or
accounting behavior changed.

## FY2026-DEMO-v1.1.0 — NetSuite architecture amendment

Supersedes generic ERP/WMS language with synthetic NetSuite ERP + NetSuite WMS. Adds:
- NetSuite inventory-count/cycle-count lineage.
- Item Receipt, Vendor Bill and procurement three-way-match model.
- Item Fulfillment and Customer Invoice model.
- Commercial-chain reconciliation.
- Financial Life of the Unit flagship UX.
- NetSuite / Physical Reality / Accounting Evidence three-layer UX.
- Transaction-chain completeness indicator.
- Native NetSuite control vs. close-control separation.
- Read-only-first NetSuite boundary.

Financial control totals: **unchanged** from the prior synthetic baseline.

Correction locked: floor-to-sheet completeness serial is **KE-X1-8842 / $9,200**.
