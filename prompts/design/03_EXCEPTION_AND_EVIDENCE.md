# Claude Design Prompt 03 — Exception, Evidence, and Three-Layer Reality

Continue the approved design system. This is the **signature screen** of Inventory Close Gaurd and the primary 60-second demo moment.

Read `docs/08_EXCEPTION_LIBRARY.md`, `docs/11_UX_AND_INFORMATION_ARCHITECTURE.md`, and `docs/12_DEMO_FLOW.md` before designing.

## Objective

Design EXC-001 so a Controller understands the conflict, missing evidence, and required next step within seconds.

## Exact EXC-001 state

- EXC-001
- Customer deployment conflicts with year-end inventory record
- $14,800 exposure
- High risk
- Waiting on Contract
- Blocker
- Owner: Controller
- Management Conclusion: Open
- No proposed adjustment at baseline

## Signature component: Three-Layer Reality

Design a powerful but restrained comparison with three clearly separate columns/regions:

### NETSUITE SAYS

- Warehouse Inventory
- Dec. 31, 2026
- source link to the synthetic NetSuite record

### PHYSICAL EVIDENCE SAYS

- Shipped Dec. 27
- Delivered Dec. 29
- Installed Dec. 30
- First Online Dec. 30

Use controlled source chips for NetSuite / FlightPath / DeployOps / Device Cloud.

### ACCOUNTING EVIDENCE SAYS

- Required ownership / acceptance provision
- **Missing**
- AccordVault source is stale

Below the three layers:

- Management Conclusion: **OPEN**
- Next Action: Obtain and review applicable contract provision

The design must make it impossible to interpret physical deployment alone as proof of ownership.

## Transaction Chain

Show the structured chain:

- Sales Order · SO-26184 · present
- Item Fulfillment · IF-261972 · present
- Carrier Delivery · Dec. 29 · present
- Installation · Dec. 30 · present
- Telemetry · Dec. 30 · corroborating
- Customer Invoice · INV-2027-00418 · Jan. 2 · present
- NetSuite Inventory Record · Warehouse at 12/31 · present/conflicting
- Contract Provision · missing / required

Do not prioritize a generic percentage like 7/8. The missing required contract is the visual focal point.

## Why Flagged

Show plain-English reason first, then:

- Rule `CUT-OUT-001`
- rule version
- affected assertions: Cutoff, Classification, Rights & Obligations
- coverage state: partial/incomplete due to missing required evidence

The detailed rule metadata belongs in progressive disclosure.

## Known / Conflicting / Missing

Create a reusable evidence-state component separating:

### Known
- shipment
- delivery
- installation
- telemetry
- NetSuite year-end state
- invoice activity

### Conflicting
- warehouse state vs. pre-year-end deployment evidence

### Missing
- applicable ownership / acceptance provision

This pattern should be reusable across other exceptions.

## Evidence timeline

Chronological timeline:

- Dec. 22 — Deployment authorized
- Dec. 27 — NetSuite Item Fulfillment
- Dec. 27 — Warehouse departure
- Dec. 29 — Carrier delivery
- Dec. 30 — Installation complete
- Dec. 30 — Device first online
- Dec. 31 — NetSuite inventory = Warehouse
- Jan. 2 — Customer invoice created

Then visibly separate:

- Contract Provision — Missing

## Evidence drawer

Design the click-through detail for an evidence record with:

- source
- record type
- evidence ID
- occurred timestamp
- retrieved timestamp
- original/normalized values when relevant
- related serial/transaction/exception/PBC
- review status
- integrity/hash under Audit Details

## Ask Gaurd contextual state

When opened from EXC-001, show context `EXC-001` and suggested prompts:

- Why is this open?
- What evidence is missing?
- What does NetSuite say?
- Which assertions are affected?

The answer must visually distinguish **facts**, **missing evidence**, and **next action**.

## 60-second demo readiness

The primary EXC-001 screen should support this demo without scrolling through unrelated content:

1. header/status
2. three-layer reality
3. transaction chain
4. missing contract
5. Ask Gaurd

Everything deeper can be expandable.
