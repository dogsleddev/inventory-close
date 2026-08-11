# 07 — Mock Dataset Specification

Canonical dataset: `FY2026-DEMO-v1.2.0`, seed `ICG-FY2026-DEMO-002`, scenario `SCENARIO-EVENTS-v1.1.0`. All data is synthetic. Source records flow through validation, normalization, deterministic rules, scenario events, and golden expected results.

Exact control totals and exception baseline are defined in `CANONICAL_SPEC.md` and must not drift.

## Count
1,065-unit year-end book count population; 1,061 first-pass matches; four first-pass variances; one floor-to-sheet discovery KE-X1-8842; 42 management/auditor count tests total (24 management + 18 auditor-selected); six controlled movements.

## Cutoff
Management review window Dec 24, 2026–Jan 7, 2027. EXC-001 and EXC-002 are the primary outbound/inbound stories.

## PBC
21 requests; 5 Provided, 12 Ready, 2 Preparing, 1 Follow-Up Requested, 1 Not Started.

## NetSuite fixtures
Generate items, inventory counts/details/adjustments, POs, item receipts, vendor bills, sales orders, item fulfillments, customer invoices, and GL balances. Also generate procurement matches and commercial-chain reconciliations. Cycle-count history includes normal counts plus a small number of variances/recounts/approved adjustments/rejected or overdue examples. Most activity should be normal.

## Cost, custody and disposal fixtures (v1.2.0)
Four collections that describe inventory without being inventory. None of them reaches the rule engine's input, so none can move a derived figure.

- `costComponents` — the standard-cost build-up per SKU (direct material, direct labor, manufacturing overhead, inbound freight, import duty). The components for a SKU sum **exactly** to its unit cost; a stack that does not sum is a generator error, not a rounding tolerance.
- `periodCosts` — FY2026 cost pools kept out of inventory, each with the basis for keeping it out. These carry expense GL accounts and must never be added to `glBalances`: the reconciliation sums every balance except 1290, so a period-cost row landing there would move the locked gross GL.
- `consignmentInUnits` — vendor-owned units held on site. A separate collection so they cannot be summed into the 1,500-unit book population, valued at the owner's stated value rather than a company cost basis.
- `dispositions` — units that left the book during FY2026 (scrap, vendor return, salvage). Their serials are minted outside the book population by construction.

Purchase price variance is seeded on vendor bills rather than modeled as a fixture collection: inventory is carried at standard cost, so PPV is the difference between the billed price and that standard. It is expensed rather than capitalized, stays a match-level attribute, and never becomes an exception.

## Golden outputs
Population controls, reconciliation, physical/cycle count, exceptions, blockers, adjustments, readiness, PBC readiness, source health, procurement match, commercial chain, and scenario files. The app computes these; golden files are test expectations only.
