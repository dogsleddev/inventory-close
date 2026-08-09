# Claude Design Prompt 05 — Physical Count, Cycle Count, and Reconciliation

Continue the approved design language. Design these modules as operationally credible finance-control workspaces, not analytic dashboards.

## Part A — Physical Count

Primary tabs:

- Year-End Count
- Cycle Count History
- Auditor Test Counts
- Count Movements

### Year-End Count baseline

Show exactly:

- Book count population: 1,065
- First-pass matched: 1,061
- Initial differences: 4
- open count issues: EXC-003 and EXC-004 remain material open items after scenario history

Locations:

- Primary Warehouse — 830
- Receiving — 60
- Shipping / Install Staging — 75
- RMA / Repair — 65
- Damaged / Hold — 35

### Count variance workspace

Support:

- serial
- book quantity
- first count
- variance
- recount
- final quantity
- exposure
- status
- owner

Make sheet-to-floor vs. floor-to-sheet clear:

- Sheet → Floor = primarily Existence
- Floor → Sheet = primarily Completeness

Use EXC-003 `KE-X1-3498`, $9,200, book 1 / physical 0.

Use EXC-004 `KE-X1-8842`, $9,200, physical 1 / no book record.

Do not visually imply EXC-004 is automatically added to inventory.

### External auditor test counts

Show:

- 18 external-auditor-selected tests
- 10 Sheet → Floor
- 8 Floor → Sheet

Label clearly that selections were supplied by the external auditor. Do not include a `Generate Sample` control.

## Part B — Cycle Count History

Create a first-class NetSuite-backed history view supporting:

- Count #
- plan
- location
- item / SKU
- bin
- serial
- count date
- snapshot quantity
- count quantity
- variance
- recount
- approval status
- related inventory adjustment
- last count
- next count

Create management indicators for:

- overdue count
- repeated variance
- large historical adjustment
- repeated recount

If a summary `Count Reliability` label is shown, ensure the component exposes its deterministic inputs and does not imply auditor reliance.

## Part C — Reconciliation

Primary tabs:

1. Financial
2. Procurement Match
3. Commercial Chain
4. Serial Integrity

### Financial tab

Show prominently:

- Gross Subledger: $4,800,000
- Gross GL: $4,812,450
- Current Difference: $12,450

Bridge:

- EXC-009 RMA duplicate: ($2,900)
- EXC-014 validated receipt timing: +$9,200
- EXC-015 unsupported manual GL entry: ($18,750)
- net potential adjustment: ($12,450)
- potential adjusted GL: $4,800,000
- potential adjusted difference: $0

Visually distinguish **Current Posted State** from **Potential Adjusted State**.

### Procurement Match tab

Model:

`Purchase Order ↔ Item Receipt ↔ Vendor Bill`

Show native NetSuite status separately from close-control status.

Use one clean transaction and EXC-002:

- 3 × KE-X1
- $27,600
- PO present
- Vendor Bill present
- NetSuite Item Receipt absent at 12/31
- carrier in transit
- ownership terms unresolved
- procurement match incomplete
- close status Accounting Review

This must communicate that a native three-way match and a year-end cutoff/ownership control answer different questions.

### Commercial Chain tab

Model:

`Contract → Sales Order → Item Fulfillment → Carrier → Delivery → Installation → Invoice → Inventory State`

Feature EXC-001 and allow side-by-side comparison between chain completeness and year-end accounting status.

### Serial Integrity tab

Allow lookup by serial and quick access to Financial Life, current location, transaction chain, cycle-count history, and related exceptions.

## Acceptance

The three workspaces must feel connected by evidence and serial/transaction lineage, not like separate products.
