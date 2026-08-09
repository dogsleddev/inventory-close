# Claude Code Stage 03 — Rule Engine, Exceptions, Reconciliation, Golden Tests

**This is a hard gate. Do not proceed to the main UI until the required golden tests pass.**

Read `docs/03_AUDIT_AND_ACCOUNTING_FRAMEWORK.md`, `docs/08_EXCEPTION_LIBRARY.md`, `docs/14_QA_ACCEPTANCE_CRITERIA.md`, and `docs/16_RULE_REGISTRY_AND_DETERMINISM.md`.

## Implement

1. Canonical Rule Registry and versioned `RuleDefinition` / `RuleExecution` model.
2. Pure deterministic rules for at least:
   - `CNT-EX-001`
   - `CNT-COMP-001`
   - `CNT-VAR-001`
   - `CNT-MOVE-001`
   - `CUT-OUT-001`
   - `CUT-IN-001`
   - `TPI-CONF-001`
   - `OWN-LOAN-001`
   - `RMA-DUP-001`
   - `DEMO-AGE-001`
   - `VAL-EO-001`
   - `VAL-DMG-001`
   - `DQ-LOC-001`
   - `REC-GL-001`
   - `GL-MAN-001`
   - `CNT-CC-001/002/003`
   - `PROC-3WM-001`
   - `O2C-CHAIN-001`
   - `O2C-INV-001`
3. Coverage states: COMPLETE / PARTIAL / INCOMPLETE.
4. Stable reason codes and assertions.
5. Exception-generation policy that distinguishes accounting exceptions, data-quality issues, and management risk indicators.
6. Deterministic scenario-event engine that resolves exactly the eight specified historical exceptions and leaves seven open.
7. Financial reconciliation engine.
8. Blocker engine.
9. Close-readiness calculation.
10. PBC-readiness calculation.
11. Source-health calculation.
12. Golden scenario tests and aggregate golden outputs.

## Mandatory baseline outputs

- 15 designed exceptions
- open: EXC-001, 002, 003, 004, 007, 011, 015
- resolved historical: EXC-005, 006, 008, 009, 010, 012, 013, 014
- 7 blockers
- $198,950 blocker exposure
- $255,650 total designed exception exposure
- GL $4,812,450 vs subledger $4,800,000 = $12,450 difference
- reconciling items: EXC-009 -$2,900; EXC-014 +$9,200; EXC-015 -$18,750
- potential adjusted GL $4,800,000
- close readiness 81.42%
- PBC readiness 17/21 = 80.95%
- source health 91.67%

## Required accounting boundaries

- EXC-001 stays OPEN because contract evidence is missing; no ownership inference and no adjustment.
- EXC-011 flags valuation indicators but does not invent a reserve.
- native NetSuite match state remains separate from close-control state.
- cycle-count history may create management indicators but not auditor sampling logic.

## HARD STOP

If any mandatory golden output fails, fix Stage 02/03 before continuing. Do not hard-code UI totals to hide discrepancies.

At the end provide a compact golden-test report and explicitly state whether the UI gate is PASS or FAIL.
