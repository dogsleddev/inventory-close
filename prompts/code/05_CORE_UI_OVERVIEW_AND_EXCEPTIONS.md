# Claude Code Stage 05 — Core UI, Overview, Exceptions, EXC-001

Read the approved `/design` handoff plus `docs/11_UX_AND_INFORMATION_ARCHITECTURE.md` and `docs/12_DEMO_FLOW.md`.

## Goal

Implement the approved desktop-first shell and the primary 60-second finance story without moving any accounting logic into the UI.

## Implement

- app shell / navigation / close-period context / synthetic-demo indicator
- Overview with exact canonical metrics
- Preventing Sign-Off panel
- role-aware Needs Attention surface
- source/data-health summary
- Exceptions queue with deterministic default sort
- standardized exception detail layout
- EXC-001 as the flagship exception
- three-layer reality view:
  - NetSuite Says
  - Physical Evidence Says
  - Accounting Evidence Says
- deterministic Transaction Chain showing required/missing components
- evidence timeline and evidence detail drawer
- Known / Conflicting / Missing evidence presentation
- assertions, owner, next action, management conclusion
- Audit Details progressive disclosure

## Exact EXC-001 facts

- `KE-E2-1048`, linked two-unit KE-E2 deployment
- $14,800 exposure
- `SO-26184`
- `IF-261972`
- shipped Dec 27
- delivered Dec 29
- installed Dec 30
- online Dec 30
- NetSuite inventory at 12/31 = Warehouse
- `INV-2027-00418` Jan 2
- ownership/acceptance contract provision missing
- conclusion Open / Waiting on Contract
- no baseline adjustment

## Acceptance

A first-time reviewer should identify within ~30 seconds that NetSuite and physical evidence conflict, required accounting evidence is missing, and the conclusion remains open.

Run existing golden tests after UI implementation to prove no logic drift.
