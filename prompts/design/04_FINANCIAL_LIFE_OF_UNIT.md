# Claude Design Prompt 04 — Financial Life of the Unit

Continue the approved product shell and visual language. This is a **flagship differentiator**, not a generic asset timeline.

## Objective

Design a serialized-unit experience that lets a Controller start with one serial number and reconstruct its available financial and physical story across purchasing, inventory life, cycle counts, deployment, billing, and accounting.

Use primary serial:

`KE-E2-1048`

## Core question

The page should answer:

> What is the complete financial story of this physical unit, and does the year-end accounting agree with the evidence?

## Page structure

Use a strong unit header containing:

- serial `KE-E2-1048`
- SKU `KE-E2`
- unit carrying value `$7,400`
- current/period-end accounting state
- related open exception `EXC-001`
- close status

## Flagship Financial Life visualization

Create a horizontally or vertically structured lifecycle with clear stages:

### BUY SIDE

- Purchase Order
- Item Receipt
- Vendor Bill

### INVENTORY LIFE

- Inventory recognition
- location history
- cycle-count history
- relevant adjustments / movements

### SELL / DEPLOY SIDE

- Contract
- Sales Order `SO-26184`
- Item Fulfillment `IF-261972`
- Carrier shipment / delivery
- Installation
- Telemetry
- Customer Invoice `INV-2027-00418`

### ACCOUNTING / CLOSE

- Dec. 31 NetSuite inventory state
- relevant GL relationship
- EXC-001
- conclusion Open

Missing events/components must remain visibly missing rather than being visually smoothed over.

## Relationship design

The lifecycle should communicate different relationship types:

- accounting transaction
- physical event
- corroborating evidence
- required evidence
- workflow conclusion

Do not make every event visually equivalent.

## Cycle Count History panel

Show representative prior count history for the serial using synthetic NetSuite count records. The design should support:

- count date
- snapshot quantity
- counted quantity
- variance
- recount
- approval status
- related inventory adjustment

For the primary demo, the history can show clean prior controls. Elsewhere the same component should support repeated variance and overdue count indicators.

Clearly label cycle-count history as management evidence / risk context, not auditor reliance.

## Transaction / Evidence Chain

Include a compact chain-status view showing required/corroborating components, with the missing contract highlighted. Do not label it confidence.

## Cross-links

From the unit page, allow one-click navigation to:

- EXC-001
- Sales Order
- Item Fulfillment
- Invoice
- Cycle Count
- Evidence
- Reconciliation / GL context

## Ask Gaurd context

Suggested prompts:

- Walk me through this unit's financial life.
- When was this serial last cycle counted?
- Show its related invoice.
- What conflicts at year-end?
- Which evidence is missing?

## Acceptance

A finance reviewer should not need to open five separate modules to understand the unit. The page should feel like a **financial chain of custody** for serialized hardware.
