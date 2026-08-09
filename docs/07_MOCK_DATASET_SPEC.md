# 07 — Mock Dataset Specification

Canonical dataset: `FY2026-DEMO-v1.1.0`, seed `ICG-FY2026-DEMO-002`, scenario `SCENARIO-EVENTS-v1.1.0`. All data is synthetic. Source records flow through validation, normalization, deterministic rules, scenario events, and golden expected results.

Exact control totals and exception baseline are defined in `CANONICAL_SPEC.md` and must not drift.

## Count
1,065-unit year-end book count population; 1,061 first-pass matches; four first-pass variances; one floor-to-sheet discovery KE-X1-8842; 42 management/auditor count tests total (24 management + 18 auditor-selected); six controlled movements.

## Cutoff
Management review window Dec 24, 2026–Jan 7, 2027. EXC-001 and EXC-002 are the primary outbound/inbound stories.

## PBC
21 requests; 5 Provided, 12 Ready, 2 Preparing, 1 Follow-Up Requested, 1 Not Started.

## NetSuite fixtures
Generate items, inventory counts/details/adjustments, POs, item receipts, vendor bills, sales orders, item fulfillments, customer invoices, and GL balances. Also generate procurement matches and commercial-chain reconciliations. Cycle-count history includes normal counts plus a small number of variances/recounts/approved adjustments/rejected or overdue examples. Most activity should be normal.

## Golden outputs
Population controls, reconciliation, physical/cycle count, exceptions, blockers, adjustments, readiness, PBC readiness, source health, procurement match, commercial chain, and scenario files. The app computes these; golden files are test expectations only.
