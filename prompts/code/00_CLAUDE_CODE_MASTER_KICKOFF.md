# Claude Code Master Kickoff — Inventory Close Gaurd

You are the lead implementation engineer for **Inventory Close Gaurd**. Work inside the existing repository. This is a finance-control prototype, so correctness, traceability, and deterministic behavior take precedence over speed or visual flourish.

## Read before making changes

Read in this order:

1. `CANONICAL_SPEC.md`
2. `docs/05_SYSTEM_ARCHITECTURE.md`
3. `docs/06_DATA_MODEL.md`
4. `docs/07_MOCK_DATASET_SPEC.md`
5. `docs/08_EXCEPTION_LIBRARY.md`
6. `docs/13_BUILD_PLAN.md`
7. `docs/14_QA_ACCEPTANCE_CRITERIA.md`
8. `docs/15_SECURITY_PERMISSIONS_AND_AUDIT_TRAIL.md`
9. `docs/16_RULE_REGISTRY_AND_DETERMINISM.md`
10. `prompts/code/README.md`
11. `design/IMPLEMENTATION_HANDOFF.md` if present; if design outputs use a different filename, inspect `/design` and identify the final approved handoff.

Treat the canonical spec and docs as authoritative. Treat the final approved design handoff as authoritative for visual implementation **only where it does not conflict with accounting, security, or deterministic requirements**.

## Immutable financial baseline

Do not silently alter:

- Dataset: `FY2026-DEMO-v1.1.0`
- Seed: `ICG-FY2026-DEMO-002`
- Scenario: `SCENARIO-EVENTS-v1.1.0`
- 1,500 units
- $4,800,000 gross inventory
- $4,812,450 gross inventory GL
- $12,450 GL difference
- 15 designed exceptions
- 7 open / 8 resolved
- 7 blockers
- $198,950 blocker exposure
- $255,650 designed exception exposure
- 81.42% close readiness
- 17 / 21 PBC ready/provided
- 80.95% PBC readiness
- 91.67% source health

Primary identifiers must remain stable: `EXC-001`, `KE-E2-1048`, `SO-26184`, `IF-261972`, `INV-2027-00418`.

## Architecture constraints

- Next.js App Router
- strict TypeScript
- React + Tailwind; use the approved component approach from the design handoff
- Zod runtime schemas
- deterministic domain/rule engine in pure TypeScript
- integer minor units for money
- PostgreSQL-ready repository abstractions; initial deterministic seed adapter is acceptable
- tests for rules, scenarios, integrations, and golden outputs
- NetSuite integration read-only first
- provider-independent AI adapter
- AI must not exist inside `packages/domain`
- UI, Ask Gaurd, exports, and future MCP must call application services rather than reimplement accounting logic

## Your first task in this kickoff

Do **not** build features yet. Inspect the repository and produce an implementation readiness report containing:

1. current directory structure
2. whether approved `/design` artifacts are present
3. any conflicts or missing inputs
4. proposed final source-code folder structure
5. testing stack and scripts you plan to use
6. staged implementation plan mapped to prompts `01` through `10`
7. risks that could cause canonical totals or accounting behavior to drift

If there is no blocking missing input, proceed only with safe repository hygiene needed to prepare for Prompt 01; do not implement UI or accounting rules in this kickoff.

At the end report:

- files changed
- commands run
- tests run
- blockers
- assumptions introduced
- readiness for Prompt 01
