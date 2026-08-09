# Inventory Close Gaurd — Canonical Specification

## 1. Product thesis

Inventory Close Gaurd is a Controller-oriented evidence and close-control layer on top of NetSuite and operational systems. NetSuite remains the transaction system of record; operational sources establish physical events; Gaurd reconciles those facts to accounting evidence, deterministic controls, human review, and management-prepared audit support.

The signature question is:

> **What is the complete financial story of this physical unit, and does the year-end accounting agree with the evidence?**

## 2. Flagship UX

### What prevents sign-off?
The FY2026 Overview must immediately show **81.42% Close Readiness**, **7 blockers**, **$198,950 blocker exposure**, **$12,450 gross GL difference**, **80.95% PBC Readiness**, and **91.67% Data Health**.

### Three-layer reality
Material exceptions separate:

- **NetSuite says** — ERP/accounting transaction state.
- **Physical evidence says** — warehouse, carrier, installation, telemetry, count, RMA, or third-party facts.
- **Accounting evidence says** — contracts, policy, valuation analysis, review, and management conclusion.

### Financial Life of the Unit
For serialized hardware, reconstruct available events from buy side through inventory life and sell/deploy side:

`PO → Item Receipt → Vendor Bill → Inventory → Cycle Counts → Sales Order → Item Fulfillment → Carrier → Delivery → Installation → Telemetry → Customer Invoice → Inventory/GL state`.

Missing events remain visibly missing.

### Transaction Chain
Display required and corroborating components. A chain can be 9/10 present and still blocked if the missing component is critical. Never label this an accounting-confidence score.

## 3. NetSuite model

Assume KestrelGrid AI uses NetSuite for ERP, inventory accounting, purchasing, AP, sales, AR, GL, item receipts, item fulfillments, customer invoices, vendor bills, inventory counts, and inventory adjustments, with NetSuite WMS for warehouse/bin/serialized/cycle-count execution.

MVP integration is read-only. No posting, count approval, vendor-bill edit, customer-invoice edit, item-fulfillment edit, journal posting, or inventory mutation exists in Gaurd.

Native NetSuite controls and close controls are separate. Example: a native three-way match may pass while year-end ownership/cutoff remains open.

## 4. Source systems

Nine logical source domains:

1. `NETSUITE_ERP` — Healthy
2. `NETSUITE_WMS` — Healthy
3. `FLIGHTPATH` — Healthy
4. `DEPLOY_OPS` — Healthy
5. `DEVICE_CLOUD` — Healthy
6. `ACCORD_VAULT` — Stale
7. `RETURN_LOOP` — Partial
8. `KESTREL_CRM` — Healthy
9. `FORECAST_PLATFORM` — Healthy

Health scoring: Healthy 1.00, Partial 0.75, Stale 0.50, Failed 0.00. Baseline = 8.25/9 = **91.67%**.

## 5. Dataset controls

### SKU mix
| SKU | Units | Unit cost | Value |
|---|---:|---:|---:|
| KE-I1 | 105 | $700 | $73,500 |
| KE-M1 | 292 | $1,350 | $394,200 |
| KE-S1 | 124 | $2,400 | $297,600 |
| KE-E1 | 130 | $4,900 | $637,000 |
| KE-E2 | 177 | $7,400 | $1,309,800 |
| KE-X1 | 138 | $9,200 | $1,269,600 |
| KE-Y1 | 32 | $12,800 | $409,600 |
| KV-D1 | 186 | $425 | $79,050 |
| KV-B1 | 63 | $675 | $42,525 |
| KV-F1 | 43 | $875 | $37,625 |
| KV-Z1 | 30 | $1,450 | $43,500 |
| KA-41 | 115 | $1,200 | $138,000 |
| KR-U1 | 42 | $825 | $34,650 |
| KG-K1 | 23 | $1,450 | $33,350 |
| **Total** | **1,500** |  | **$4,800,000** |

### Location controls
- Primary Warehouse: 830 / $2,653,625
- Receiving: 60 / $177,400
- Shipping / install staging: 75 / $238,450
- Inbound in transit: 55 / $158,925
- Outbound in transit: 60 / $231,375
- Demo / Loaner: 80 / $278,400
- RMA / Repair: 65 / $238,325
- Third-party custody: 80 / $246,125
- Customer-site company-owned: 110 / $342,800
- Damaged / Hold: 35 / $101,700
- Contract manufacturer / vendor: 50 / $132,875

### Accounting classifications
- Finished Hardware: 1,000 / $3,201,500
- GIT: 115 / $390,300
- Demo: 75 / $242,075
- Loaner: 50 / $152,600
- RMA: 65 / $238,325
- Damaged: 35 / $101,700
- Third Party: 130 / $379,000
- Valuation Review: 30 / $94,500

### Gross subledger GL mapping
- 1200 Inventory Finished/Other: $3,776,700
- 1210 GIT: $390,300
- 1220 Demo/Loaner: $394,675
- 1230 RMA/Repair: $238,325
- Gross subledger: $4,800,000
- Existing reserve 1290: ($54,000), separately reconciled.

### Initial gross GL
- 1200: $3,789,150
- 1210: $390,300
- 1220: $394,675
- 1230: $238,325
- Gross GL: $4,812,450
- Difference: GL > subledger by $12,450.

Reconciling items:
- EXC-009: RMA duplicate accounting, **-$2,900**
- EXC-014: validated receipt timing, **+$9,200**
- EXC-015: unsupported manual inventory entry, **-$18,750**
- Net: **-$12,450** → potential adjusted gross GL $4,800,000. No auto-posting.

## 6. Physical and cycle counts

Year-end count population = Primary Warehouse + Receiving + Staging + RMA + Damaged = **1,065 units**.

First pass: **1,061 matched, 4 variances** supporting EXC-003, EXC-005, EXC-006, EXC-013. Scenario events resolve three; EXC-003 remains. Floor-to-sheet discovery **KE-X1-8842 / $9,200** creates EXC-004 completeness. Never auto-add it to inventory.

External-auditor selections: 18 total, 10 Sheet→Floor and 8 Floor→Sheet. App records/supports them but does not select them. Six controlled movements exist during the count period.

Cycle Count History is sourced from synthetic NetSuite inventory-count records. Preserve snapshot quantity, count quantity, variance, bin/serial detail, approval/rejection, related inventory adjustment, last/next count. Deterministic management indicators may flag overdue counts, repeated variance, large prior count adjustments, or repeat recounts. These are not auditor reliance or sampling conclusions.

## 7. Procurement match

Model `PO ↔ Item Receipt ↔ Vendor Bill` with `native_netsuite_match_status` separate from `close_match_status`. A three-way-match issue is not automatically an accounting exception. It escalates only if period-end population/cutoff/rights/valuation/classification/reconciliation is affected.

EXC-002: 3 × KE-X1 = $27,600. Vendor bill present; vendor shipment 12/29; in transit 12/31; NetSuite item receipt not recorded until 1/4; ownership terms unresolved. Close status: Accounting Review / blocker.

## 8. Commercial chain

Model `Contract → Sales Order → Item Fulfillment → Carrier → Delivery → Installation → Acceptance → Customer Invoice → Inventory/GL` where applicable.

Primary demo EXC-001:
- serial `KE-E2-1048` plus one linked KE-E2 unit
- 2 × $7,400 = **$14,800**
- SO `SO-26184`
- NetSuite Item Fulfillment `IF-261972`
- shipped 12/27
- delivered 12/29
- installed 12/30
- first online 12/30
- NetSuite year-end inventory still Warehouse
- customer invoice `INV-2027-00418` dated 1/2/2027
- applicable ownership/acceptance contract provision missing
- status `WAITING_ON_CONTRACT`, High, blocker, no adjustment.

Invoice is billing evidence only; it does not itself establish ownership, inventory relief, acceptance, or revenue recognition.

## 9. Exception baseline

| ID | Scenario | Exposure | Risk | Baseline | Blocker |
|---|---|---:|---|---|---|
| EXC-001 | Outbound deployment / missing contract | $14,800 | High | Waiting on Contract | Yes |
| EXC-002 | Inbound GIT | $27,600 | High | Accounting Review | Yes |
| EXC-003 | Recorded unit not found | $9,200 | High | Recount Required | Yes |
| EXC-004 | Physical unit absent listing | $9,200 | High | Accounting Review | Yes |
| EXC-005 | Count variance resolved | $2,900 | Medium | Resolved — No Adjustment | No |
| EXC-006 | Movement during count | $7,400 | Medium | Resolved — No Adjustment | No |
| EXC-007 | Third-party confirmation | $92,400 | High | Waiting on Third Party | Yes |
| EXC-008 | Customer-site loaner ownership | $12,800 | Medium | Resolved — No Adjustment | No |
| EXC-009 | RMA duplicate accounting | $2,900 | Medium | Resolved — Adjustment Proposed | No |
| EXC-010 | Long demo | $9,200 | Medium | Resolved — No Adjustment | No |
| EXC-011 | Slow-moving / E&O | $27,000 | High | Accounting Review | Yes |
| EXC-012 | Damaged return | $4,900 | Medium | Resolved — No Adjustment | No |
| EXC-013 | Serial two locations | $7,400 | Low | Resolved — No Adjustment | No |
| EXC-014 | PO/receipt/GL timing | $9,200 | Medium | Resolved — Adjustment Proposed | No |
| EXC-015 | Unsupported manual GL entry | $18,750 | Critical | Controller Review | Yes |

Open blocker IDs: 001, 002, 003, 004, 007, 011, 015. Exposure = **$198,950**. Total designed exposure = **$255,650**.

EXC-007 Redwood Installation Services: 14 units / $92,400; composition 1 KE-S1, 4 KE-E1, 6 KE-X1, 1 KE-Y1, 2 KA-41.

EXC-011: 20 × KE-M1 / $27,000; 365+ days, low forecast, product transition, no recent movement. Rule identifies valuation review only; reserve remains **UNDETERMINED**.

## 10. Rule registry

Primary accounting rules:
- `CNT-EX-001`, `CNT-COMP-001`, `CNT-VAR-001`, `CNT-MOVE-001`
- `CUT-OUT-001`, `CUT-IN-001`
- `TPI-CONF-001`, `OWN-LOAN-001`
- `RMA-DUP-001`, `DEMO-AGE-001`
- `VAL-EO-001`, `VAL-DMG-001`
- `DQ-LOC-001`, `REC-GL-001`, `GL-MAN-001`

Additional management/chain rules:
- `CNT-CC-001`, `CNT-CC-002`, `CNT-CC-003`
- `PROC-3WM-001`
- `O2C-CHAIN-001`, `O2C-INV-001`

Rules are versioned pure TypeScript functions where practical. Canonical results: PASS, FAIL, REVIEW_REQUIRED, INCOMPLETE, NOT_APPLICABLE. Coverage is separate: COMPLETE, PARTIAL, INCOMPLETE. Missing required evidence never silently becomes PASS.

## 11. Readiness

Close Readiness weighting:
- Population / GL: 15% @ 90
- Physical Count: 20% @ 90
- Cutoff: 15% @ 80
- Ownership: 10% @ 85
- Third Party: 10% @ 80
- Valuation: 15% @ 85
- Exceptions: 10% @ 53.33
- Adjustments: 5% @ 66.67
- Result: **81.42% / 8142 basis points**.

This is a management workflow metric, not audit assurance or financial-statement confidence.

## 12. PBC package

21 management-prepared requests:
1. Inventory Listing
2. Inventory-to-GL Reconciliation
3. Physical Count Instructions
4. Physical Count Results
5. Count Variance Reconciliation
6. External Auditor Test-Count Support
7. Movement During Count
8. Outbound Cutoff
9. Inbound Cutoff
10. Goods in Transit
11. Third-Party Inventory
12. Third-Party Confirmation Tracker
13. Customer-Site Company-Owned Inventory
14. Demo Inventory
15. Loaner Inventory
16. RMA Reconciliation
17. Inventory Aging
18. E&O Analysis
19. Damaged Inventory Review
20. Proposed Inventory Adjustments
21. Evidence and Data-Lineage Index

Baseline: Provided 5, Ready 12, Preparing 2, Follow-Up Requested 1, Not Started 1 = **17/21 = 80.95%** ready/provided.

Provided artifacts are immutable; changes create new versions. Workpapers whose underlying controlled state changes can become `REFRESH_REQUIRED`. Every package carries a manifest and hashes.

## 13. Ask Gaurd

Ask Gaurd is a right-side investigative interface over approved application services, not a second accounting brain. Tools include close readiness, blockers, exceptions, evidence timeline, Financial Life, cycle-count history, reconciliation, procurement match, commercial chain, valuation, PBC status, and source health.

Material answer contract: Status; Known Facts; Conflicting Evidence; Missing Evidence; Assertions; Exposure; Management Conclusion; Next Action; evidence references.

Required behavior:
- Missing evidence is stated as missing.
- Chat input is not evidence.
- AI output is not evidence or approval.
- Natural language cannot bypass permissions.
- Contract summaries trace to source clause/document.
- AI cannot establish policy/materiality, select auditor samples, invent reserve amounts, approve/post JEs, or infer missing contract terms.
- If AI fails, deterministic fallback answers still work.

Golden Ask Gaurd facts:
- What prevents sign-off? → 7 blockers / $198,950.
- Why is KE-E2-1048 open? → Waiting on Contract / $14,800 / contract missing.
- Does inventory tie? → No / GL $4,812,450 / subledger $4,800,000 / difference $12,450.
- Unsupported third-party? → Redwood / 14 units / $92,400.
- E&O? → 20 KE-M1 / $27,000 / reserve undetermined.
- PBC readiness? → 17/21 / 80.95%.

## 14. Security and workflow

Roles: Head of Finance, Controller, Accounting Manager, Preparer, Warehouse, Supply Chain, FP&A, Legal, Auditor Read-Only, System Admin. Roles map to explicit permissions. Preparation and approval are separated where material. Auditor is read-only. System admin does not automatically receive accounting authority.

Sensitive evidence can be Standard, Confidential, or Restricted. Ask Gaurd inherits authorization before tool data reaches the model. NetSuite credentials are minimum-read scope. Material history is append-only. Use supersede/void/annotate rather than destructive delete. Periods can be OPEN, SOFT_LOCKED, LOCKED, REOPENED; reopen requires reason and history.

## 15. Determinism and replay

Each close run records dataset version/hash, ruleset and individual rule versions, policy, configuration, scenario script, source sync IDs, outputs, and hashes. Same controlled inputs produce same structured outputs. Money uses integer minor units. Readiness uses explicit integer precision. Historical versions never silently mutate.

`Reset Demo` rebuilds from source facts and scenario events; it must not hard-code final metrics. `Reproduce Close` compares structured output and returns MATCH/MISMATCH. LLM prose is not part of financial replay equivalence.

## 16. Build order

`schemas/types → dataset generator → rules → golden tests → repositories/services → evidence/workflows → core UI → Financial Life / NetSuite chains → PBC → Ask Gaurd → replay/security/polish`.

Hard gate: do not build the main dashboard before all 15 golden accounting scenarios and aggregate controls pass.

## 17. Public-demo story

60-second path:
`Overview → EXC-001 → NetSuite vs Physical vs Accounting → Transaction Chain → Ask Gaurd`.

Core message:

> The warehouse and operational systems tell us what happened. NetSuite tells us what hit the books. Inventory Close Gaurd helps Finance determine whether those stories agree at period end — without allowing AI to invent the missing answer.
