# Changelog

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
