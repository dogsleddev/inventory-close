# Claude Code Stage 06 — Financial Life, Counts, Cycle Counts, Procurement and Commercial Chains

Read `docs/07_MOCK_DATASET_SPEC.md`, `docs/11_UX_AND_INFORMATION_ARCHITECTURE.md`, the locked NetSuite amendments in `CANONICAL_SPEC.md`, and the approved design handoff.

## Implement the flagship Financial Life experience

Search/select `KE-E2-1048` and reconstruct available structured events across:

- PO
- Item Receipt
- Vendor Bill
- inventory state
- cycle counts / adjustments
- Sales Order
- Item Fulfillment
- carrier movement
- delivery
- installation
- telemetry
- customer invoice
- year-end accounting state
- related exception / evidence

Missing events must remain missing; do not fabricate visually complete chains.

## Physical Count

Implement:

- year-end count command center
- exact 1,065 book population
- 1,061 first-pass matches / 4 initial differences
- sheet-to-floor existence and floor-to-sheet completeness
- EXC-003/004/005/006 behavior
- six count-period movements
- external-auditor-selected test-count support: 18 total, 10 sheet->floor, 8 floor->sheet; no sample-generation action

## NetSuite Cycle Count History

Implement deterministic historical count views with snapshot qty, count qty, variance, recount, approval/rejection, adjustment trace, next count, and management risk indicators. Clearly separate cycle-count risk information from auditor reliance/sampling.

## Procurement Match

Implement PO <-> Item Receipt <-> Vendor Bill with separate native NetSuite match status and close-control status. Include clean, resolved-historical, and EXC-002 incomplete year-end examples.

## Commercial Chain / Serial Integrity

Implement Sales Order <-> Item Fulfillment <-> shipment/delivery <-> installation <-> invoice <-> inventory state and serial integrity views.

## Acceptance

- Financial Life accessible from serial search in one coherent experience
- native NetSuite PASS can coexist with close REVIEW_REQUIRED
- no accounting conclusion inferred from invoice, telemetry, or location alone
- all golden tests remain green
