# Claude Design Prompt 07 — Final Design Review, Consistency, and Demo Polish

Use this prompt only after the prior screens have been designed. Perform a full-system design review against the canonical specification.

## Objective

Make Inventory Close Gaurd feel like one deliberate product and prepare the screens for implementation and a 60-second public demo.

Do not add major new features.

## Review the full product for consistency

At minimum review:

- App shell
- Overview
- EXC-001
- Evidence detail
- Financial Life of the Unit
- Physical Count
- Cycle Count History
- Reconciliation
- Procurement Match
- Commercial Chain
- Valuation / EXC-011
- Adjustments
- Audit Package
- Ask Gaurd
- Audit Details

## Exact financial consistency review

Confirm no mock screen drifted from:

- 1,500 inventory units
- $4,800,000 gross subledger
- $4,812,450 gross GL
- $12,450 current GL difference
- 7 blockers
- $198,950 blocker exposure
- 15 designed exceptions
- 81.42% Close Readiness
- 17 / 21 PBC Ready/Provided
- 80.95% PBC Readiness
- 91.67% Data Health

## Semantic consistency review

Verify the design never conflates:

- NetSuite state vs. accounting conclusion
- physical location vs. ownership
- cycle-count result vs. auditor reliance
- native NetSuite control vs. close control
- proposed adjustment vs. posted adjustment
- PBC Ready vs. auditor approval
- AI explanation vs. evidence
- chain completeness vs. accounting confidence

## Visual consistency review

Normalize:

- typography hierarchy
- spacing
- card radius/borders/depth
- table density
- status treatment
- risk treatment
- source chips
- evidence chips
- timelines
- drawer behavior
- page title hierarchy
- action placement
- empty/loading/error states

## Density review

The product should be information-rich but not noisy.

Remove:

- decorative charts that add no decision value
- duplicate KPI treatments
- repeated explanatory prose
- unnecessary badges
- AI decoration
- technical metadata from primary surfaces

## Progressive disclosure review

Ensure technical provenance is always available but usually behind:

- Audit Details
- View Source
- View Rule Details
- Version History

## Demo path review

Optimize this exact flow:

1. Overview
2. EXC-001
3. Three-Layer Reality
4. Transaction Chain
5. Ask Gaurd question: `Why is this still open?`
6. End on Management Conclusion: OPEN

The flow should be visually understandable with minimal narration and minimal scrolling.

## 10-second test

A first-time viewer should recognize:

- year-end inventory close
- 81.4% ready
- 7 blockers
- $198,950 exposure

## 30-second test

After EXC-001 they should recognize:

- NetSuite says Warehouse
- physical evidence says deployed before year-end
- accounting evidence is missing
- conclusion remains Open

## 60-second test

They should understand:

> Inventory Close Gaurd connects NetSuite, physical operations, and accounting evidence while preserving human accounting judgment.

## Implementation handoff

At the end, produce a concise design handoff containing:

1. screen inventory
2. component inventory
3. component reuse map
4. states/variants
5. interaction notes
6. desktop layout dimensions/guidelines
7. responsive rules
8. accessibility notes
9. exact demo screens/states
10. items that should remain P2 and not block build

Do not introduce new financial logic during design handoff.
