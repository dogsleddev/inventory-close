# Claude Design Master Brief — Inventory Close Gaurd

Use this prompt first. It establishes the product, design language, non-negotiable financial facts, and design constraints for all subsequent screen prompts.

---

You are the lead product designer for **Inventory Close Gaurd**, a Controller-oriented evidence and close-control layer on top of NetSuite and operational systems for a fictional growth-stage physical-AI company, **KestrelGrid AI**.

Before designing, read these files in this order:

1. `CANONICAL_SPEC.md`
2. `docs/01_PRODUCT_PRINCIPLES.md`
3. `docs/11_UX_AND_INFORMATION_ARCHITECTURE.md`
4. `docs/12_DEMO_FLOW.md`
5. `docs/15_SECURITY_PERMISSIONS_AND_AUDIT_TRAIL.md`
6. `docs/16_RULE_REGISTRY_AND_DETERMINISM.md`

Treat them as authoritative. If this prompt conflicts with those files, the canonical specification wins.

## Your mission

Create a coherent desktop-first finance product experience that makes a complicated year-end inventory close feel **controlled, evidence-based, and understandable** rather than simplified or automated away.

The audience is a sophisticated Controller / Head of Finance. Secondary users include Accounting, Warehouse, Supply Chain, FP&A, Legal, and an External Auditor Read-Only role.

The product should feel like:

- Controller workspace
- operational evidence system
- accounting-control platform
- management workpaper environment

It must **not** feel like:

- generic AI dashboard
- generic BI dashboard
- warehouse management software
- ERP replacement
- chatbot with finance screens around it
- cyberpunk AI product

## Core product thesis

> **The evidence layer between NetSuite inventory operations and the financial close.**

Signature question:

> **What is the complete financial story of this physical unit, and does the year-end accounting agree with the evidence?**

## Locked product principles

These are non-negotiable:

1. **Financial Life of the Unit** is a flagship experience.
2. Material exceptions separate **NetSuite Says / Physical Evidence Says / Accounting Evidence Says**.
3. **Cycle Count History** is a deterministic management risk lens, not an audit sampling engine.
4. **Transaction Chain / Evidence Chain** shows what exists and what is critically missing. It is not an AI-confidence score.
5. NetSuite integration is **read-only first**.
6. Native NetSuite controls remain distinct from Inventory Close Gaurd close controls.
7. **Evidence before inference.**
8. **AI investigates. Controllers conclude.**
9. **Location is not ownership.**
10. **If AI disappears, the close still works.**

## Exact baseline facts — do not change

Use these exact financial facts wherever visible:

- FY2026 balance-sheet date: Dec. 31, 2026
- Close Readiness: **81.42%**; overview may show **81.4%**
- Active blockers: **7**
- Open blocker exposure: **$198,950**
- Gross inventory subledger: **$4,800,000**
- Gross inventory GL: **$4,812,450**
- Gross GL difference: **$12,450**
- PBC Ready / Provided: **17 / 21**
- PBC Readiness: **80.95%**
- Data Health: **91.67%**
- Designed exceptions: **15**
- Open exceptions: **7**
- Resolved historical exceptions: **8**

Do not invent alternative totals for visual balance.

## Primary demo exception — EXC-001

Use exactly:

- ID: `EXC-001`
- title concept: Customer deployment conflicts with year-end inventory record
- primary serial: `KE-E2-1048`
- linked two-unit KE-E2 deployment
- exposure: **$14,800**
- risk: **High**
- workflow: **Waiting on Contract**
- blocker: **Yes**
- Sales Order: `SO-26184`
- NetSuite Item Fulfillment: `IF-261972`
- shipped: Dec. 27, 2026
- delivered: Dec. 29, 2026
- installed: Dec. 30, 2026
- first online: Dec. 30, 2026
- NetSuite year-end inventory state: Warehouse
- customer invoice: `INV-2027-00418`, Jan. 2, 2027
- required ownership / acceptance contract provision: **Missing**
- management conclusion: **Open**
- proposed adjustment: **None at baseline**

The experience must make this logic immediately legible:

**NetSuite Says:** Warehouse Inventory at 12/31  
**Physical Evidence Says:** Shipped / Delivered / Installed / Online before year-end  
**Accounting Evidence Says:** Required ownership / acceptance provision missing  
**Conclusion:** Open

## Major supporting stories

### EXC-007 — largest blocker

- Redwood Installation Services
- 14 units
- $92,400
- Waiting on Third Party

### EXC-011 — valuation

- 20 × KE-M1
- $27,000
- 365+ days
- low forecast demand
- product transition
- no recent movement
- reserve conclusion **Open / Undetermined**

### Reconciliation

- GL: $4,812,450
- Subledger: $4,800,000
- Difference: $12,450
- EXC-009: -$2,900
- EXC-014: +$9,200
- EXC-015: -$18,750
- potential adjusted difference: $0
- clearly distinguish current posted state from potential adjusted state

## Information architecture

Primary navigation:

1. Overview
2. Inventory
3. Physical Count
4. Cutoff
5. Ownership
6. Valuation
7. Exceptions
8. Evidence
9. Reconciliation
10. Adjustments
11. Audit Package
12. Assumptions
13. User Guide

Persistent utility elements:

- Ask Gaurd right-side drawer
- close period
- user / demo role
- attention indicator
- system/data health

Do not make Ask Gaurd the primary navigation or homepage.

## Design hierarchy

Across screens, prioritize:

1. What matters?
2. Why does it matter?
3. What supports it?
4. What is missing?
5. Who owns the next action?
6. What happens next?
7. Technical provenance on demand

Technical details such as hashes, run IDs, rule execution IDs, dataset versions, and source IDs belong in progressive disclosure such as **Audit Details**, not in the primary decision surface.

## Visual direction

Create a restrained, premium, modern finance product.

Desired attributes:

- crisp
- calm
- high-information-density without clutter
- enterprise credible
- serious enough for a Controller
- modern enough to feel like a new 2026 product
- strong typography and spacing hierarchy
- dense tables that remain readable
- subtle depth rather than decorative effects
- state communicated through text + icon + restrained color

Avoid:

- neon
- cyberpunk
- robot imagery
- excessive gradients
- giant decorative gauges
- dashboard full of donut charts
- glassmorphism everywhere
- AI sparkles
- fake "confidence" meters
- green status that could imply auditor approval

Use charts only when they explain something better than a table or status matrix.

## Layout direction

Canonical desktop layout:

- left navigation rail
- top contextual header
- large primary workspace
- optional persistent/collapsible Ask Gaurd drawer on right

Design for 1440px desktop first. Tablet should remain usable. Do not compromise the desktop finance experience for mobile.

## Copy direction

Use concise finance language.

Prefer:

- Contract support missing
- Waiting on Third Party
- Controller Review
- Required evidence incomplete
- Current GL difference
- Potential adjusted state

Avoid verbose AI-style copy.

## Financial formatting

Overview numbers may use:

- `$4.80M`
- `81.4%`

Detailed workpapers / reconciliation should use:

- `$4,800,000`
- `80.95%`
- `($12,450)` for accounting negatives where appropriate

## Status safety

Never design language implying:

- Audit Passed
- Auditor Approved
- PCAOB compliant
- AI approved
- autonomous accounting
- hallucination free

Use management-oriented states.

## Interaction rules

- Missing data must look different from zero.
- Stale/partial source coverage must look different from healthy.
- A resolved exception must retain history.
- A proposed adjustment must look different from a posted adjustment.
- A NetSuite native control PASS must remain visually distinct from an Inventory Close Control REVIEW REQUIRED state.
- A critical missing evidence component must visually outweigh a generic chain-completeness percentage.

## Deliverable for this first prompt

Do **not** design every screen yet.

First establish a reusable product design system and shell covering:

1. visual direction and rationale
2. desktop app shell
3. typography hierarchy
4. spacing / density rules
5. card / panel hierarchy
6. table design
7. status and risk treatments
8. evidence chips
9. source-system chips, especially NetSuite
10. workflow/action treatment
11. Audit Details progressive disclosure
12. Ask Gaurd collapsed/expanded shell
13. empty/loading/error states
14. accessibility rules
15. a representative Overview wireframe skeleton using the exact baseline facts

Then preserve this system for every subsequent prompt. Do not reinvent the visual language per screen.
