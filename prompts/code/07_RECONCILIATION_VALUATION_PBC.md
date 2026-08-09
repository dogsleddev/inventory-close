# Claude Code Stage 07 — Reconciliation, Adjustments, Valuation, PBC/Audit Package

Read `docs/10_PBC_AND_AUDIT_PACKAGE.md`, `docs/11_UX_AND_INFORMATION_ARCHITECTURE.md`, `docs/14_QA_ACCEPTANCE_CRITERIA.md`, and approved design outputs.

## Financial Reconciliation

Implement the exact bridge:

- gross GL $4,812,450
- subledger $4,800,000
- difference $12,450
- EXC-009 -$2,900
- EXC-014 +$9,200
- EXC-015 -$18,750
- potential adjusted difference $0

Visually separate CURRENT POSTED state from POTENTIAL ADJUSTED state.

## Adjustments

Implement JE-001/002/003 as controlled proposed adjustments with balanced lines, evidence, preparer/reviewer/status, and human approval requirements. Do not post to NetSuite.

## Valuation

Implement aging, valuation-review populations, damage/RMA views, and EXC-011. Preserve reserve conclusion OPEN/UNDETERMINED. No AI or UI-generated reserve.

## PBC / Audit Package

Implement all 21 PBC requests, exact baseline status mix, 17/21 = 80.95%, attention list, version history, refresh-required dependencies, evidence lineage, package manifest concepts, and auditor read-only presentation.

Required baseline remaining items:

- PBC-002 Preparing
- PBC-005 Preparing
- PBC-008 Follow-Up Requested
- PBC-018 Not Started

## Acceptance

- detailed schedules reconcile to canonical totals
- provided PBC versions cannot be silently overwritten
- current vs stale/refresh-required state is visible
- external-auditor view is read-only
- golden and permission tests remain green
